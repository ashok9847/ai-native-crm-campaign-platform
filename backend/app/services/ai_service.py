"""AI service — Nebius (primary) + GitHub Models (backup).

Three public functions, each with automatic primary → backup fallback:
  1. extract_segment_filters  — intent → list[FilterCriterion]
  2. generate_messages        — customers + intent → list of per-customer messages
  3. summarize_campaign       — metrics → 2-sentence plain-English summary

Primary  : Nebius API  (openai/gpt-oss-120b-fast) via openai.AsyncOpenAI
Backup   : GitHub Models (openai/gpt-4.1)          via azure-ai-inference async

Fallback sequence
─────────────────
  1. Call primary with up to AI_MAX_RETRIES auto-retries.
  2. If primary exhausts all retries and GITHUB_TOKEN is set,
     call backup (single attempt, no extra retry).
  3. If backup also fails (or token not set), raise AIUnavailableError.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

from azure.ai.inference.aio import ChatCompletionsClient as GHClient
from azure.ai.inference.models import SystemMessage as GHSystemMessage
from azure.ai.inference.models import UserMessage as GHUserMessage
from azure.core.credentials import AzureKeyCredential
from openai import APIError, AsyncOpenAI

from app.core.config import get_settings
from app.core.constants import AI_MAX_RETRIES, AI_RETRY_DELAY_SECONDS
from app.schemas.campaign import CustomerSummary, FilterCriterion
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.tenant import CRMField

logger = logging.getLogger(__name__)


# ── Primary client singleton (Nebius via OpenAI SDK) ─────────────────────────

def _make_primary_client() -> AsyncOpenAI:
    s = get_settings()
    return AsyncOpenAI(base_url=s.nebius_base_url, api_key=s.nebius_api_key)


_primary_client: AsyncOpenAI | None = None


def get_primary_client() -> AsyncOpenAI:
    global _primary_client
    if _primary_client is None:
        _primary_client = _make_primary_client()
    return _primary_client


# ── Backup client factory (GitHub Models via azure-ai-inference) ──────────────

def _make_backup_client() -> GHClient | None:
    """Return an async GitHub Models client, or None if token is not configured."""
    s = get_settings()
    if not s.github_token:
        return None
    return GHClient(
        endpoint=s.github_base_url,
        credential=AzureKeyCredential(s.github_token),
    )


# ── Custom exception ──────────────────────────────────────────────────────────

class AIUnavailableError(Exception):
    """Raised when all AI providers (primary + backup) are exhausted."""


# ── Helper: extract JSON from model response ──────────────────────────────────

def _extract_json(text: str) -> Any:
    """Parse JSON from model response, stripping markdown code fences or surrounding text if present."""
    text = text.strip()
    if not text:
        raise ValueError("AI returned an empty response — cannot parse JSON")
    
    # First, try to strip ```json ... ``` or ``` ... ```
    match = re.search(r"```(?:json)?\s*([\s\S]+?)```", text)
    if match:
        text = match.group(1).strip()
    
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        # Try to extract the first JSON array [...] from the text
        array_match = re.search(r"(\[\s*[\s\S]*\s*\])", text)
        if array_match:
            try:
                return json.loads(array_match.group(1).strip())
            except json.JSONDecodeError:
                pass
        
        # Try to extract the first JSON object {...} from the text
        object_match = re.search(r"(\{\s*[\s\S]*\s*\})", text)
        if object_match:
            try:
                return json.loads(object_match.group(1).strip())
            except json.JSONDecodeError:
                pass
                
        logger.error("JSONDecodeError on text: %r", text)
        raise exc


# ── Primary retry wrapper ─────────────────────────────────────────────────────

async def _with_retry(coro_fn, *args, **kwargs):
    """Call `coro_fn(*args, **kwargs)` with up to AI_MAX_RETRIES auto-retries.

    Raises AIUnavailableError if all attempts fail (caller handles backup).
    """
    last_exc: Exception | None = None
    for attempt in range(AI_MAX_RETRIES + 1):
        try:
            return await coro_fn(*args, **kwargs)
        except (AIUnavailableError, APIError, json.JSONDecodeError, ValueError) as exc:
            last_exc = exc
            if attempt < AI_MAX_RETRIES:
                logger.warning(
                    "AI call failed (attempt %d/%d): %s — retrying in %.1fs",
                    attempt + 1, AI_MAX_RETRIES + 1, exc, AI_RETRY_DELAY_SECONDS,
                )
                await asyncio.sleep(AI_RETRY_DELAY_SECONDS)
    raise AIUnavailableError(
        f"Primary AI unavailable after {AI_MAX_RETRIES + 1} attempts: {last_exc}"
    ) from last_exc


# ── Backup call via GitHub Models (azure-ai-inference async) ─────────────────

async def _call_backup_raw(system_prompt: str, user_prompt: str) -> str:
    """Call GitHub Models and return the raw string content.

    Uses azure.ai.inference.aio.ChatCompletionsClient (async).
    Raises AIUnavailableError if the token is not configured or the call fails.
    """
    client = _make_backup_client()
    if client is None:
        raise AIUnavailableError(
            "GitHub Models backup is disabled — set GITHUB_TOKEN to enable it."
        )

    s = get_settings()
    logger.info(
        "Calling GitHub Models backup: endpoint=%s model=%s",
        s.github_base_url, s.github_model,
    )

    try:
        async with client:
            response = await client.complete(
                messages=[
                    GHSystemMessage(system_prompt),
                    GHUserMessage(user_prompt),
                ],
                temperature=0.7,
                top_p=1.0,
                model=s.github_model,
            )
        raw = (response.choices[0].message.content or "").strip()
        logger.info("GitHub Models backup raw response: %r", raw[:300])
        return raw
    except Exception as exc:
        logger.error("GitHub Models backup call failed: %s", exc, exc_info=True)
        raise AIUnavailableError(f"GitHub Models backup failed: {exc}") from exc


# ── Primary + fallback orchestrator ──────────────────────────────────────────

async def _with_fallback(primary_coro_fn, backup_system: str, backup_user: str, *args, **kwargs):
    """Try primary with retries; on failure cascade to GitHub Models backup."""
    try:
        return await _with_retry(primary_coro_fn, *args, **kwargs)
    except AIUnavailableError as primary_exc:
        logger.warning(
            "Primary AI exhausted — falling back to GitHub Models backup. Reason: %s",
            primary_exc,
        )
        # Backup returns raw string; caller must parse it
        raw = await _call_backup_raw(backup_system, backup_user)
        return raw  # callers that need JSON will parse; text callers return directly


# ── Shared prompts ────────────────────────────────────────────────────────────

_SEGMENT_SYSTEM_PROMPT = """\
You are a database filter extraction assistant for a coffee subscription CRM.

Given a plain-English marketing intent, extract structured filter criteria as a JSON array.

Each filter criterion must have:
- "field": one of [subscription_tier, roast_preference, city, lifetime_value, last_order_date, limit, order_by, spent_amount, spent_days_ago, purchased_item]
- "operator": one of [eq, neq, gt, lt, gte, lte, lte_days_ago, in, asc, desc, contains]
- "value": the scalar or array value to compare against

For subscription_tier: values are "starter", "premium", "elite"
For roast_preference: values are "light", "medium", "dark", "espresso"
For last_order_date with "lte_days_ago": value is an integer number of days
For "in": value is a list of strings

For spent_amount: value is a number (e.g. 2000 for "spent > 2000")
For spent_days_ago: value is an integer number of days (e.g. 90 for "in the last 90 days")
For purchased_item: value is a string keyword (e.g. "dark roast" for "bought dark roast")

Special rules for limits and sorting:
- If the user asks for a specific number of customers (e.g., "top 10", "5 customers"), output a criterion with:
  {"field": "limit", "operator": "eq", "value": <number>}
- If the user implies ordering (e.g. "top", "highest value", "most recent"), output a criterion with:
  {"field": "order_by", "operator": "desc" or "asc", "value": "<field_name>"} (default field name is "lifetime_value" for "top" unless specified otherwise)

Return ONLY a valid JSON array, no explanation. Example for "top 10 premium customers who spent > 2000 in the last 90 days":
[
  {"field": "subscription_tier", "operator": "eq", "value": "premium"},
  {"field": "spent_amount", "operator": "gt", "value": 2000},
  {"field": "spent_days_ago", "operator": "lte", "value": 90},
  {"field": "limit", "operator": "eq", "value": 10},
  {"field": "order_by", "operator": "desc", "value": "lifetime_value"}
]
"""

_MESSAGE_SYSTEM_PROMPT = """\
You are a personalized marketing message writer for BrewMate, an Indian coffee subscription service.

Given a campaign intent and a list of customers, write a short, friendly, personalized outreach message
for each customer. Each message should:
- Address the customer by first name
- Mention their subscription tier or roast preference naturally
- Relate to the campaign intent
- Be 2-3 sentences, warm and conversational
- NOT use generic placeholders like [NAME] — use the actual name

Return ONLY a valid JSON array in this exact format, no explanation:
[
  {"customer_id": 1, "message": "Hey Arjun! ..."},
  {"customer_id": 2, "message": "Hi Priya! ..."}
]
"""

_QUERY_ERROR_CLARIFICATION_SYSTEM_PROMPT = """\
You are an expert database query assistant for BrewMate, an Indian coffee subscription service.

A user tried to create a campaign with a marketing intent, but the generated filters caused a database query execution error.
Your job is to generate a clarification question and 3 suggested options to help the user resolve the issue.

CRITICAL RULES:
- The question must be friendly and explain the issue in plain English (no database terminology like SQL, columns, exception, syntax, etc.).
- The 3 options must be valid, concrete alternatives matching the coffee subscription CRM domain (e.g. specific roast levels, tiers, relative order date ranges like "in the last 30 days").
- The options should help the system generate a valid query.
- Return ONLY a valid JSON object in this exact format, with no markdown or explanation:
{
  "question": "What we should check instead...",
  "options": [
    "Option 1 text",
    "Option 2 text",
    "Option 3 text"
  ]
}

Example:
User Intent: "Find customers who ordered since yesterday"
Technical Error: "(psycopg2.errors.InvalidDatetimeFormat) invalid input syntax for type date..."
Response:
{
  "question": "We couldn't parse 'yesterday' as a date. How would you like to filter the last order date?",
  "options": [
    "Ordered in the last 1 day",
    "Ordered in the last 7 days",
    "Ignore last order date and target all customers"
  ]
}
"""

_QUERY_ERROR_EXPLANATION_SYSTEM_PROMPT = """\
You are a database query assistant for BrewMate, an Indian coffee subscription service.

A user tried to create a campaign with a marketing intent, but the generated filters caused a database query execution error.
Your job is to read the user's intent, the generated filters, and the technical database error, and write a friendly, helpful, non-technical explanation (2-3 sentences) for the user.

CRITICAL RULES:
- Explain what is wrong with their query or why it doesn't match the database fields/data.
- Use friendly, plain English (no database terminology like SQL, SQLAlchemy, columns, postgres, tables, exception, line, select, where, etc.).
- Refer to fields by their plain names (e.g., roast preference, city, subscription tier, spent amount).
- Tell the user how they can rephrase their query to make it valid.
- Return ONLY the 2-3 sentence explanation text — no JSON, no markdown, no preamble.

Example:
User Intent: "Find premium customers who ordered since yesterday"
Technical Error: "(psycopg2.errors.InvalidDatetimeFormat) invalid input syntax for type date..."
Explanation: "We couldn't process your request because 'yesterday' could not be correctly parsed as a date format. Try rephrasing your intent to specify a number of days, such as 'premium customers who ordered in the last 1 day'."
"""

_SUMMARY_SYSTEM_PROMPT = """\
You are a campaign analyst for BrewMate, an Indian coffee subscription service.

Given campaign metrics, write a 2-sentence plain-English summary of how the campaign performed.

CRITICAL RULES — you MUST follow these exactly:
- Use ONLY the numbers explicitly provided in the input. Do NOT invent, round, or estimate any figures.
- Your sentences MUST reference the campaign name and the exact numbers given (recipients, delivered, opened, clicked, open rate %, click rate %).
- If open rate or click rate is 0%, say so honestly.
- Keep it positive but accurate.
- Return ONLY the 2-sentence summary text — no JSON, no markdown, no preamble.

Example format:
"The '[campaign name]' campaign reached [X] of [N] recipients with a [Y]% open rate and [Z]% click rate. [One more sentence about engagement or next steps.]"
"""


# ── T032: extract_segment_filters ─────────────────────────────────────────────

async def _get_dynamic_segment_prompt(db: AsyncSession, tenant_id: int) -> str:
    stmt = select(CRMField).where(CRMField.tenant_id == tenant_id, CRMField.entity_type == "customer")
    res = await db.execute(stmt)
    custom_fields = res.scalars().all()
    
    if not custom_fields:
        return _SEGMENT_SYSTEM_PROMPT

    custom_fields_list = []
    for f in custom_fields:
        desc = f.description or "No description"
        if f.field_type == "enum" and f.allowed_enums:
            enums_str = ", ".join(json.dumps(e) for e in f.allowed_enums)
            custom_fields_list.append(
                f"- {f.field_name}: type \"enum\" (allowed values: {enums_str}), description: \"{desc}\""
            )
        else:
            custom_fields_list.append(
                f"- {f.field_name}: type \"{f.field_type}\", description: \"{desc}\""
            )
    custom_fields_str = "\n".join(custom_fields_list)
    
    prompt = _SEGMENT_SYSTEM_PROMPT
    prompt += f"\n\nIn addition to the standard fields, you MUST support the following custom fields for this tenant:\n{custom_fields_str}\n"
    prompt += "\nFor any of these custom fields, use the field name as the 'field' in the FilterCriterion, with an appropriate operator and value matching the specified type."
    return prompt


async def _get_dynamic_message_prompt(db: AsyncSession, tenant_id: int) -> str:
    """Construct a dynamic message writing prompt using the tenant's actual brand name."""
    from app.models.tenant import Tenant
    try:
        tenant_stmt = select(Tenant).where(Tenant.id == tenant_id)
        tenant_res = await db.execute(tenant_stmt)
        tenant = tenant_res.scalar_one_or_none()
        brand_name = tenant.name if tenant else "Nudge CRM"
    except Exception:
        brand_name = "Nudge CRM"

    prompt = f"""You are a personalized marketing message writer for {brand_name}.

Given a campaign intent and a list of customers, write a short, friendly, personalized outreach message
for each customer. Each message should:
- Address the customer by first name
- Mention their subscription tier, preferences, or transaction properties naturally if available in the details (e.g. style preference, favorite category, roast preference, etc. matching the brand context)
- Relate to the campaign intent
- Be 2-3 sentences, warm and conversational
- NOT use generic placeholders like [NAME] — use the actual name

Return ONLY a valid JSON array in this exact format, no explanation:
[
  {{"customer_id": 1, "message": "Hey Arjun! ..."}},
  {{"customer_id": 2, "message": "Hi Priya! ..."}}
]
"""
    return prompt


async def _do_extract_segment_filters(intent: str, system_prompt: str) -> list[FilterCriterion]:
    s = get_settings()
    logger.info("Primary AI: base=%s model=%s", s.nebius_base_url, s.kimi_model)
    try:
        response = await get_primary_client().chat.completions.create(
            model=s.kimi_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": intent},
            ],
            temperature=0.0,
            max_tokens=2048,
        )
        raw = response.choices[0].message.content or ""
        logger.info("extract_segment_filters primary raw: %r", raw)
        if not raw.strip():
            raise ValueError("Primary AI returned empty content for segment filter extraction")
        parsed = _extract_json(raw)
        if not isinstance(parsed, list):
            raise ValueError(f"Expected list, got {type(parsed)}")
        return [FilterCriterion(**item) for item in parsed]
    except APIError as exc:
        logger.error(
            "Primary APIError in extract_segment_filters: status=%s body=%s",
            getattr(exc, "status_code", "?"), getattr(exc, "body", "?"),
            exc_info=True,
        )
        raise exc
    except Exception as exc:
        logger.error("Primary failed in extract_segment_filters: %s", exc, exc_info=True)
        raise exc


async def extract_segment_filters(intent: str, db: AsyncSession, tenant_id: int) -> list[FilterCriterion]:
    """Extract structured filter criteria from a plain-English marketing intent.

    Tries Nebius primary first; falls back to GitHub Models (GPT-4.1) on failure.
    Raises AIUnavailableError if both providers fail.
    """
    system_prompt = await _get_dynamic_segment_prompt(db, tenant_id)
    try:
        return await _with_retry(_do_extract_segment_filters, intent, system_prompt)
    except AIUnavailableError as primary_exc:
        logger.warning("Primary exhausted for segment filters → trying GitHub backup. %s", primary_exc)
        raw = await _call_backup_raw(system_prompt, intent)
        parsed = _extract_json(raw)
        if not isinstance(parsed, list):
            raise AIUnavailableError(f"Backup returned non-list: {type(parsed)}")
        return [FilterCriterion(**item) for item in parsed]


# ── T040: generate_messages ───────────────────────────────────────────────────

async def _do_generate_messages(
    customers: list[CustomerSummary],
    intent: str,
    db: AsyncSession,
    tenant_id: int,
    days_since_orders: dict[int, int],
) -> list[dict]:
    custom_details_list = []
    for c in customers:
        metadata_str = ""
        crm_meta = getattr(c, "crm_metadata", None) or {}
        if isinstance(crm_meta, dict):
            metadata_str = ", ".join(f"{k}={v}" for k, v in crm_meta.items())
        
        detail = (
            f"- id={c.id}, name={c.name}, tier={getattr(c, 'subscription_tier', 'unknown')}, "
            f"roast={getattr(c, 'roast_preference', 'unknown')}, "
            f"days_since_last_order={days_since_orders.get(c.id, 0)}"
        )
        if metadata_str:
            detail += f", custom_metadata={{{metadata_str}}}"
        custom_details_list.append(detail)
    customer_list = "\n".join(custom_details_list)
    user_msg = f"Campaign intent: {intent}\n\nCustomers:\n{customer_list}"

    system_prompt = await _get_dynamic_message_prompt(db, tenant_id)

    s = get_settings()
    response = await get_primary_client().chat.completions.create(
        model=s.kimi_model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.7,
        max_tokens=2048,
    )
    raw = response.choices[0].message.content or ""
    logger.debug("generate_messages primary raw: %s", raw[:300])
    if not raw.strip():
        raise ValueError("Primary AI returned empty content for message generation")
    parsed = _extract_json(raw)
    if not isinstance(parsed, list):
        raise ValueError(f"Expected list, got {type(parsed)}")
    return parsed


async def generate_messages(
    customers: list[CustomerSummary],
    intent: str,
    db: AsyncSession,
    tenant_id: int,
    days_since_orders: dict[int, int] | None = None,
) -> list[dict]:
    """Generate personalized messages for all customers in a segment.

    Tries Nebius primary first; falls back to GitHub Models (GPT-4.1) on failure.
    Returns a list of dicts with keys: customer_id, message.
    """
    _days = days_since_orders or {}
    BATCH_SIZE = 15
    all_results: list[dict] = []

    for i in range(0, len(customers), BATCH_SIZE):
        batch = customers[i : i + BATCH_SIZE]
        logger.info(
            "Generating messages batch %d/%d (size=%d)",
            (i // BATCH_SIZE) + 1,
            (len(customers) + BATCH_SIZE - 1) // BATCH_SIZE,
            len(batch),
        )
        try:
            batch_result = await _with_retry(_do_generate_messages, batch, intent, db, tenant_id, _days)
        except AIUnavailableError as primary_exc:
            logger.warning(
                "Primary exhausted for message gen batch → trying GitHub backup. %s",
                primary_exc,
            )
            custom_details_list = []
            for c in batch:
                metadata_str = ""
                crm_meta = getattr(c, "crm_metadata", None) or {}
                if isinstance(crm_meta, dict):
                    metadata_str = ", ".join(f"{k}={v}" for k, v in crm_meta.items())
                
                detail = (
                    f"- id={c.id}, name={c.name}, tier={getattr(c, 'subscription_tier', 'unknown')}, "
                    f"roast={getattr(c, 'roast_preference', 'unknown')}, "
                    f"days_since_last_order={_days.get(c.id, 0)}"
                )
                if metadata_str:
                    detail += f", custom_metadata={{{metadata_str}}}"
                custom_details_list.append(detail)
            customer_list = "\n".join(custom_details_list)
            user_msg = f"Campaign intent: {intent}\n\nCustomers:\n{customer_list}"
            system_prompt = await _get_dynamic_message_prompt(db, tenant_id)
            raw = await _call_backup_raw(system_prompt, user_msg)
            batch_result = _extract_json(raw)
            if not isinstance(batch_result, list):
                raise AIUnavailableError(f"Backup returned non-list: {type(batch_result)}")
        
        all_results.extend(batch_result)

    return all_results



# ── T060: summarize_campaign ──────────────────────────────────────────────────

async def _do_summarize_campaign(metrics_text: str) -> str:
    s = get_settings()
    response = await get_primary_client().chat.completions.create(
        model=s.kimi_model,
        messages=[
            {"role": "system", "content": _SUMMARY_SYSTEM_PROMPT},
            {"role": "user", "content": metrics_text},
        ],
        temperature=0.5,
        max_tokens=256,
    )
    return (response.choices[0].message.content or "").strip()


async def summarize_campaign(metrics_text: str) -> str:
    """Generate a 2-sentence AI summary for a completed campaign.

    Tries Nebius primary first; falls back to GitHub Models (GPT-4.1) on failure.
    Raises AIUnavailableError if both providers fail.
    """
    try:
        return await _with_retry(_do_summarize_campaign, metrics_text)
    except AIUnavailableError as primary_exc:
        logger.warning("Primary exhausted for summary → trying GitHub backup. %s", primary_exc)
        return await _call_backup_raw(_SUMMARY_SYSTEM_PROMPT, metrics_text)


async def _do_explain_query_error(intent: str, filters_json: str, error_msg: str) -> str:
    s = get_settings()
    user_prompt = f"User Intent: {intent}\nGenerated Filters: {filters_json}\nDatabase Error: {error_msg}"
    response = await get_primary_client().chat.completions.create(
        model=s.kimi_model,
        messages=[
            {"role": "system", "content": _QUERY_ERROR_EXPLANATION_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.5,
        max_tokens=256,
    )
    return (response.choices[0].message.content or "").strip()


async def _do_generate_query_clarification(intent: str, filters_json: str, error_msg: str) -> dict:
    s = get_settings()
    user_prompt = f"User Intent: {intent}\nGenerated Filters: {filters_json}\nDatabase Error: {error_msg}"
    response = await get_primary_client().chat.completions.create(
        model=s.kimi_model,
        messages=[
            {"role": "system", "content": _QUERY_ERROR_CLARIFICATION_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.0,
        max_tokens=512,
    )
    raw = response.choices[0].message.content or ""
    logger.info("generate_query_clarification primary raw: %r", raw)
    if not raw.strip():
        raise ValueError("Primary AI returned empty content for query error clarification")
    parsed = _extract_json(raw)
    if not isinstance(parsed, dict) or "question" not in parsed or "options" not in parsed:
        raise ValueError(f"Expected dict with 'question' and 'options', got {parsed}")
    return parsed


async def generate_query_clarification(intent: str, filters: list[FilterCriterion], error: Exception) -> dict:
    """Generate a Q&A clarification (question + 3 options) for a database query failure.

    Tries Nebius primary first; falls back to GitHub Models (GPT-4.1) on failure.
    """
    filters_json = json.dumps([f.model_dump() for f in filters])
    error_msg = str(error)
    try:
        return await _with_retry(_do_generate_query_clarification, intent, filters_json, error_msg)
    except AIUnavailableError as primary_exc:
        logger.warning("Primary exhausted for query clarification → trying GitHub backup. %s", primary_exc)
        user_prompt = f"User Intent: {intent}\nGenerated Filters: {filters_json}\nDatabase Error: {error_msg}"
        raw = await _call_backup_raw(_QUERY_ERROR_CLARIFICATION_SYSTEM_PROMPT, user_prompt)
        parsed = _extract_json(raw)
        if not isinstance(parsed, dict) or "question" not in parsed or "options" not in parsed:
            raise AIUnavailableError(f"Backup returned invalid dict format: {parsed}")
        return parsed


async def explain_query_error(intent: str, filters: list[FilterCriterion], error: Exception) -> str:
    """Explain a database execution error during segment filtering using AI.

    Tries Nebius primary first; falls back to GitHub Models (GPT-4.1) on failure.
    Raises AIUnavailableError if both fail.
    """
    filters_json = json.dumps([f.model_dump() for f in filters])
    error_msg = str(error)
    try:
        return await _with_retry(_do_explain_query_error, intent, filters_json, error_msg)
    except AIUnavailableError as primary_exc:
        logger.warning("Primary exhausted for error explanation → trying GitHub backup. %s", primary_exc)
        user_prompt = f"User Intent: {intent}\nGenerated Filters: {filters_json}\nDatabase Error: {error_msg}"
        return await _call_backup_raw(_QUERY_ERROR_EXPLANATION_SYSTEM_PROMPT, user_prompt)


# ── US3: Dynamic Schema Inference ─────────────────────────────────────────────

_SCHEMA_INFERENCE_SYSTEM_PROMPT = """\
You are a database schema inference assistant for a CRM.
Given a column header name and a list of sample values from that column, determine:
1. The logical data type of this column. It MUST be one of:
   - "string" (for text, names, descriptions)
   - "number" (for integers, decimals, counts, prices)
   - "enum" (if the values belong to a small, finite set of categorical options, e.g. status, size, roast level, preference)
2. A brief, 1-sentence description of what this column represents.
3. If the type is "enum", a JSON list of all unique allowed enum options extracted from the samples. If not "enum", this should be null or empty.

Return ONLY a valid JSON object in this exact format, with no markdown formatting or explanation:
{
  "field_type": "string" | "number" | "enum",
  "description": "A description of the field.",
  "allowed_enums": ["option1", "option2", ...] | null
}
"""

async def _do_infer_schema(field_name: str, samples: list[str]) -> dict:
    s = get_settings()
    user_prompt = f"Column Name: {field_name}\nSample Values: {json.dumps(samples)}"
    response = await get_primary_client().chat.completions.create(
        model=s.kimi_model,
        messages=[
            {"role": "system", "content": _SCHEMA_INFERENCE_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.0,
        max_tokens=1024,
    )
    raw = response.choices[0].message.content or ""
    logger.info("infer_schema primary raw: %r", raw)
    if not raw.strip():
        raise ValueError("Primary AI returned empty content for schema inference")
    parsed = _extract_json(raw)
    if not isinstance(parsed, dict):
        raise ValueError(f"Expected dict, got {type(parsed)}")
    return parsed

async def infer_schema(field_name: str, samples: list[str]) -> dict:
    """Infer field type, description and allowed enums for an unmapped header.

    Tries Nebius primary first; falls back to GitHub Models (GPT-4.1) on failure.
    """
    try:
        return await _with_retry(_do_infer_schema, field_name, samples)
    except AIUnavailableError as primary_exc:
        logger.warning("Primary exhausted for schema inference → trying GitHub backup. %s", primary_exc)
        user_prompt = f"Column Name: {field_name}\nSample Values: {json.dumps(samples)}"
        raw = await _call_backup_raw(_SCHEMA_INFERENCE_SYSTEM_PROMPT, user_prompt)
        parsed = _extract_json(raw)
        if not isinstance(parsed, dict):
            raise AIUnavailableError(f"Backup returned non-dict: {type(parsed)}")
        return parsed

