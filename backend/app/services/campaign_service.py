"""Campaign service — state machine, segmentation, message generation, launch.

Responsibilities (one function per concern):
  create_campaign          — DRAFT → SEGMENTING → GENERATING → REVIEWING (synchronous)
  check_concurrent_executing — guard: 409 if any campaign is EXECUTING
  get_campaign_detail      — fetch campaign + segment + messages
  launch_campaign          — REVIEWING → EXECUTING
  list_campaigns           — paginated history
"""

from __future__ import annotations

import datetime
import logging

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.constants import LARGE_SEGMENT_THRESHOLD, MAX_SEGMENT_SAMPLE_SIZE
from app.models.campaign import Campaign, CampaignState
from app.models.customer import Customer
from app.models.message import CampaignMessage
from app.models.segment import Segment, segment_customers
from app.schemas.campaign import (
    CampaignDetailResponse,
    CampaignListItem,
    CampaignListResponse,
    CampaignResponse,
    CustomerSummary,
    FilterCriterion,
    MessagePreview,
    SegmentDetail,
)

logger = logging.getLogger(__name__)

def _utcnow() -> datetime.datetime:
    """Return current UTC time as naive datetime (matches DB TIMESTAMP WITHOUT TZ)."""
    return datetime.datetime.utcnow()

# ── State machine ─────────────────────────────────────────────────────────────

VALID_TRANSITIONS: dict[str, list[str]] = {
    CampaignState.DRAFT.value:      [CampaignState.SEGMENTING.value],
    CampaignState.SEGMENTING.value: [CampaignState.GENERATING.value],
    CampaignState.GENERATING.value: [CampaignState.REVIEWING.value],
    CampaignState.REVIEWING.value:  [CampaignState.EXECUTING.value, CampaignState.CANCELLED.value],
    CampaignState.EXECUTING.value:  [CampaignState.COMPLETE.value, CampaignState.CANCELLED.value],
}


async def transition_campaign(
    campaign: Campaign,
    target_state: str,
    db: AsyncSession,
) -> Campaign:
    """Advance campaign to target_state, enforcing VALID_TRANSITIONS.

    Raises HTTPException 409 on invalid transition.
    """
    if target_state not in VALID_TRANSITIONS.get(campaign.state, []):
        raise HTTPException(
            status_code=409,
            detail={
                "detail": f"Cannot transition from {campaign.state} to {target_state}.",
                "code": "INVALID_TRANSITION",
            },
        )
    campaign.state = target_state
    campaign.state_updated_at = _utcnow()
    if target_state in (CampaignState.COMPLETE.value, CampaignState.CANCELLED.value):
        campaign.completed_at = _utcnow()
    await db.flush()
    return campaign


# ── Concurrent-execution guard ────────────────────────────────────────────────

async def check_concurrent_executing(db: AsyncSession) -> None:
    """Raise 409 if any campaign is currently in EXECUTING state.
    DISABLED: Allow multiple campaigns to run concurrently.
    """
    pass


# ── Auto-name helper ──────────────────────────────────────────────────────────

def _auto_name(intent: str) -> str:
    words = intent.split()[:6]
    return " ".join(words).rstrip(".,;") + ("…" if len(intent.split()) > 6 else "")


# ── create_campaign (T034 + T042 integrated) ─────────────────────────────────

async def create_campaign(
    intent: str,
    name: str | None,
    db: AsyncSession,
    customer_ids: list[int] | None = None,
    tenant_id: int = 1,
    channel: str = "sms",
    scheduled_at: datetime.datetime | None = None,
    campaign_id: int | None = None,
    clarification: str | None = None,
    audience_id: int | None = None,
) -> CampaignDetailResponse:
    """Full synchronous pipeline: DRAFT → SEGMENTING → GENERATING → REVIEWING.

    Normal flow (customer_ids=None):
      1. Guard: no concurrent EXECUTING campaign.
      2. Create Campaign in DRAFT (or reuse existing draft).
      3. Call AI to extract segment filters.
      4. Execute filters against DB → count + sample IDs.
      5. Persist Segment + SegmentCustomer rows.
      6. Transition DRAFT→SEGMENTING→GENERATING.
      7. Fetch segment customer details for message generation.
      8. Call AI to generate per-customer messages.
      9. Bulk-insert CampaignMessage rows.
     10. Transition GENERATING→REVIEWING.
     11. Return CampaignDetailResponse.

    Follow-up bypass (customer_ids provided):
      Steps 3–4 are skipped. The supplied customer_ids are used directly as the
      segment, bypassing AI segmentation. This guarantees the follow-up campaign
      targets exactly the clickers from the previous campaign.
    """
    # Lazy imports inside function to avoid circular imports at module load time
    from app.services import ai_service, segment_service  # noqa: PLC0415
    from sqlalchemy import delete
    from app.models.audience import Audience

    # Ensure no campaign is currently executing
    await check_concurrent_executing(db)

    # Look up audience filters if audience_id is provided
    filters: list[FilterCriterion] = []
    if audience_id:
        audience_stmt = select(Audience).where(Audience.id == audience_id, Audience.tenant_id == tenant_id)
        audience = (await db.execute(audience_stmt)).scalar_one_or_none()
        if not audience:
            raise HTTPException(status_code=404, detail="Audience not found")
        filters = [FilterCriterion(field=f["field"], operator=f["operator"], value=f["value"]) for f in audience.filter_criteria]
        if not name:
            name = f"Campaign targeting {audience.name}"
        intent = f"Targeting saved audience: {audience.name}"

    # Step 1: Create campaign in DRAFT or reuse existing
    if campaign_id:
        campaign_stmt = select(Campaign).where(Campaign.id == campaign_id, Campaign.tenant_id == tenant_id)
        campaign = (await db.execute(campaign_stmt)).scalar_one_or_none()
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        if campaign.state not in (CampaignState.DRAFT.value, CampaignState.SEGMENTING.value, CampaignState.GENERATING.value, CampaignState.REVIEWING.value):
            raise HTTPException(status_code=409, detail="Campaign cannot be modified in its current state")
        
        campaign.intent = intent
        campaign.state = CampaignState.DRAFT.value
        campaign.state_updated_at = _utcnow()
        campaign.completed_at = None
        campaign.stalled_at = None
        campaign.channel = channel
        campaign.audience_id = audience_id
        if name:
            campaign.name = name
        if scheduled_at:
            campaign.scheduled_at = scheduled_at

        # Clean up existing messages
        await db.execute(delete(CampaignMessage).where(CampaignMessage.campaign_id == campaign.id))
        
        # Clean up segments
        old_segments_stmt = select(Segment.id).where(Segment.campaign_id == campaign.id)
        old_segment_ids = (await db.execute(old_segments_stmt)).scalars().all()
        if old_segment_ids:
            await db.execute(delete(segment_customers).where(segment_customers.c.segment_id.in_(old_segment_ids)))
            await db.execute(delete(Segment).where(Segment.campaign_id == campaign.id))
            
        await db.flush()
    else:
        campaign = Campaign(
            intent=intent,
            name=name or _auto_name(intent),
            state=CampaignState.DRAFT.value,
            state_updated_at=_utcnow(),
            tenant_id=tenant_id,
            channel=channel,
            scheduled_at=scheduled_at,
            audience_id=audience_id,
        )
        db.add(campaign)
        await db.flush()  # get campaign.id

    await transition_campaign(campaign, CampaignState.SEGMENTING.value, db)

    if customer_ids:
        # ── Follow-up bypass: skip AI segmentation, use exact customer IDs ────
        logger.info(
            "Campaign %d: follow-up mode — using %d explicit customer IDs (no AI segmentation)",
            campaign.id, len(customer_ids),
        )
        filters = []
        all_ids = customer_ids  # all of them get messages
        sample_ids = all_ids[:MAX_SEGMENT_SAMPLE_SIZE]  # preview only
        customer_count = len(customer_ids)
    elif audience_id:
        # ── Saved Audience target: bypass AI segmentation, use saved audience filters ────
        logger.info("Campaign %d: audience mode — using saved filters (no AI segmentation)", campaign.id)
        customer_count, all_ids = await segment_service.execute_segment_filters(filters, db, tenant_id)
        sample_ids = all_ids[:MAX_SEGMENT_SAMPLE_SIZE]
    else:
        # ── Normal flow: AI extracts segment filters ──────────────────────────
        logger.info("Campaign %d: extracting segment filters for intent: %.80s", campaign.id, intent)
        intent_to_extract = intent
        if clarification:
            intent_to_extract = f"{intent} (Clarification: {clarification})"
        filters = await ai_service.extract_segment_filters(intent_to_extract, db, tenant_id)
        logger.info("Campaign %d: got %d filter(s)", campaign.id, len(filters))
        # all_ids = every customer matching the filters (used for message generation)
        try:
            customer_count, all_ids = await segment_service.execute_segment_filters(filters, db, tenant_id)
        except Exception as exc:
            logger.error("Database error executing segment filters for intent: %s, error: %s", intent, exc, exc_info=True)
            try:
                clarification_data = await ai_service.generate_query_clarification(intent, filters, exc)
            except Exception as ai_exc:
                logger.error("AI query clarification generation failed: %s", ai_exc, exc_info=True)
                clarification_data = {
                    "question": "Your search query could not be executed due to mismatched criteria. How should we proceed?",
                    "options": [
                        "Target all active subscribers",
                        "Filter by customers who ordered in the last 30 days",
                        "Specify premium subscription tier"
                    ]
                }
            raise HTTPException(
                status_code=400,
                detail={
                    "detail": clarification_data["question"],
                    "options": clarification_data["options"],
                    "campaign_id": campaign.id,
                    "code": "CLARIFICATION_NEEDED",
                },
            )
        # sample_ids = first N only, used for the review-page preview card
        sample_ids = all_ids[:MAX_SEGMENT_SAMPLE_SIZE]
        logger.info(
            "Campaign %d: segment size=%d (will generate messages for all %d)",
            campaign.id, customer_count, len(all_ids),
        )

    # Step 4: Persist Segment
    segment = Segment(
        campaign_id=campaign.id,
        filter_criteria=[f.model_dump() for f in filters],
        customer_count=customer_count,
        sample_customer_ids=sample_ids,  # only the first N for preview
        tenant_id=tenant_id,
    )
    db.add(segment)
    await db.flush()

    # Step 5: Bulk-insert segment_customers rows (all matching customers, not just sample)
    message_target_ids = all_ids if not customer_ids else customer_ids
    if message_target_ids:
        await db.execute(
            segment_customers.insert(),
            [{"segment_id": segment.id, "customer_id": cid, "tenant_id": tenant_id} for cid in message_target_ids],
        )
        await db.flush()

    # Step 6: Transition to GENERATING
    await transition_campaign(campaign, CampaignState.GENERATING.value, db)

    # Step 7: Fetch ALL segment customer details for message generation
    customers_stmt = select(Customer).where(Customer.id.in_(message_target_ids))
    customer_rows = (await db.execute(customers_stmt)).scalars().all()

    # Build CustomerSummary list with extra fields for AI
    customer_summaries: list[CustomerSummary] = []
    days_since: dict[int, int] = {}
    today = datetime.date.today()
    for c in customer_rows:
        summary = CustomerSummary(id=c.id, name=c.name, email=c.email)
        # Attach extra attributes dynamically for the AI prompt builder
        summary.__dict__["subscription_tier"] = c.subscription_tier
        summary.__dict__["roast_preference"] = c.roast_preference
        summary.__dict__["crm_metadata"] = c.crm_metadata
        days_since[c.id] = (today - c.last_order_date).days
        customer_summaries.append(summary)

    # Step 8: Generate messages via AI
    logger.info("Campaign %d: generating messages for %d customers", campaign.id, len(customer_summaries))
    generated = await ai_service.generate_messages(customer_summaries, intent, db, tenant_id, days_since)

    # Build lookup: customer_id → message text
    msg_lookup: dict[int, str] = {
        item["customer_id"]: item["message"]
        for item in generated
        if isinstance(item, dict) and "customer_id" in item and "message" in item
    }

    # Step 9: Bulk-insert CampaignMessage rows
    messages_inserted: list[CampaignMessage] = []
    for c in customer_rows:
        body = msg_lookup.get(c.id, f"Hi {c.name.split()[0]}! We have a special offer for you.")
        msg = CampaignMessage(
            campaign_id=campaign.id,
            customer_id=c.id,
            body=body,
            edited=False,
            tenant_id=tenant_id,
        )
        db.add(msg)
        messages_inserted.append(msg)

    await db.flush()

    # Step 10: Transition GENERATING → REVIEWING
    await transition_campaign(campaign, CampaignState.REVIEWING.value, db)

    # Step 11: Refresh and build response (before commit so RLS setting is active)
    await db.refresh(campaign)
    for msg in messages_inserted:
        await db.refresh(msg)
    await db.refresh(segment)

    await db.commit()

    # Build sample customer summaries
    sample_customers = [
        CustomerSummary(id=c.id, name=c.name, email=c.email)
        for c in customer_rows[:MAX_SEGMENT_SAMPLE_SIZE]
    ]

    segment_detail = SegmentDetail(
        id=segment.id,
        customer_count=segment.customer_count,
        filter_criteria=[FilterCriterion(**f) for f in segment.filter_criteria],
        sample_customers=sample_customers,
        large_segment_warning=segment.customer_count > LARGE_SEGMENT_THRESHOLD,
    )

    # Build customer name lookup
    name_lookup = {c.id: c.name for c in customer_rows}
    message_previews = [
        MessagePreview(
            id=msg.id,
            customer_id=msg.customer_id,
            customer_name=name_lookup.get(msg.customer_id, "Customer"),
            body=msg.body,
            edited=msg.edited,
            edited_body=msg.edited_body,
            effective_body=msg.edited_body if msg.edited_body else msg.body,
        )
        for msg in messages_inserted
    ]

    return CampaignDetailResponse(
        id=campaign.id,
        name=campaign.name,
        intent=campaign.intent,
        state=campaign.state,
        created_at=campaign.created_at,
        state_updated_at=campaign.state_updated_at,
        completed_at=campaign.completed_at,
        stalled_at=campaign.stalled_at,
        ai_summary=campaign.ai_summary,
        segment=segment_detail,
        messages=message_previews,
    )


async def create_campaign_stream_generator(
    intent: str,
    name: str | None,
    db: AsyncSession,
    customer_ids: list[int] | None = None,
    tenant_id: int = 1,
    channel: str = "sms",
    scheduled_at: datetime.datetime | None = None,
    campaign_id: int | None = None,
    clarification: str | None = None,
    audience_id: int | None = None,
):
    """NDJSON generator for step-by-step campaign creation progress and message tokens."""
    import json
    import asyncio
    from app.services import ai_service, segment_service
    from app.models.campaign import Campaign, CampaignState
    from app.models.segment import Segment, segment_customers
    from app.models.customer import Customer
    from app.models.message import CampaignMessage
    from app.schemas.campaign import FilterCriterion, CustomerSummary
    from app.services.ai_service import AIUnavailableError
    from sqlalchemy import delete
    from app.models.audience import Audience

    try:
        # Look up audience filters if audience_id is provided
        filters = []
        if audience_id:
            audience_stmt = select(Audience).where(Audience.id == audience_id, Audience.tenant_id == tenant_id)
            audience = (await db.execute(audience_stmt)).scalar_one_or_none()
            if not audience:
                yield json.dumps({
                    "event": "error",
                    "message": "Audience not found",
                    "code": "NOT_FOUND",
                }) + "\n"
                return
            filters = [FilterCriterion(field=f["field"], operator=f["operator"], value=f["value"]) for f in audience.filter_criteria]
            if not name:
                name = f"Campaign targeting {audience.name}"
            intent = f"Targeting saved audience: {audience.name}"

        # Step 1: Create campaign in DRAFT or reuse existing
        if campaign_id:
            campaign_stmt = select(Campaign).where(Campaign.id == campaign_id, Campaign.tenant_id == tenant_id)
            campaign = (await db.execute(campaign_stmt)).scalar_one_or_none()
            if not campaign:
                yield json.dumps({
                    "event": "error",
                    "message": "Campaign not found",
                    "code": "NOT_FOUND",
                }) + "\n"
                return
            if campaign.state not in (CampaignState.DRAFT.value, CampaignState.SEGMENTING.value, CampaignState.GENERATING.value, CampaignState.REVIEWING.value):
                yield json.dumps({
                    "event": "error",
                    "message": "Campaign cannot be modified in its current state",
                    "code": "INVALID_STATE",
                }) + "\n"
                return
            
            campaign.intent = intent
            campaign.state = CampaignState.DRAFT.value
            campaign.state_updated_at = _utcnow()
            campaign.completed_at = None
            campaign.stalled_at = None
            campaign.channel = channel
            campaign.audience_id = audience_id
            if name:
                campaign.name = name
            if scheduled_at:
                campaign.scheduled_at = scheduled_at

            # Clean up existing messages
            await db.execute(delete(CampaignMessage).where(CampaignMessage.campaign_id == campaign.id))
            
            # Clean up segments
            old_segments_stmt = select(Segment.id).where(Segment.campaign_id == campaign.id)
            old_segment_ids = (await db.execute(old_segments_stmt)).scalars().all()
            if old_segment_ids:
                await db.execute(delete(segment_customers).where(segment_customers.c.segment_id.in_(old_segment_ids)))
                await db.execute(delete(Segment).where(Segment.campaign_id == campaign.id))
                
            await db.flush()
        else:
            campaign = Campaign(
                intent=intent,
                name=name or _auto_name(intent),
                state=CampaignState.DRAFT.value,
                state_updated_at=_utcnow(),
                tenant_id=tenant_id,
                channel=channel,
                scheduled_at=scheduled_at,
                audience_id=audience_id,
            )
            db.add(campaign)
            await db.flush()

        yield json.dumps({
            "event": "draft_created",
            "campaign_id": campaign.id,
            "name": campaign.name,
        }) + "\n"
        await asyncio.sleep(0.05)

        # Step 2: Transition to SEGMENTING
        await transition_campaign(campaign, CampaignState.SEGMENTING.value, db)
        await db.commit()
        yield json.dumps({"event": "segmenting_started"}) + "\n"
        await asyncio.sleep(0.1)

        # Step 3: Segment filter extraction or follow-up bypass
        if customer_ids:
            logger.info(
                "Campaign %d (stream): follow-up mode — using %d explicit customer IDs",
                campaign.id, len(customer_ids),
            )
            filters = []
            all_ids = customer_ids
            sample_ids = all_ids[:MAX_SEGMENT_SAMPLE_SIZE]
            customer_count = len(customer_ids)
        elif audience_id:
            logger.info("Campaign %d (stream): audience mode — using saved filters", campaign.id)
            yield json.dumps({
                "event": "filters_extracted",
                "filters": [f.model_dump() for f in filters],
            }) + "\n"
            await asyncio.sleep(0.1)

            try:
                customer_count, all_ids = await segment_service.execute_segment_filters(filters, db, tenant_id)
            except Exception as exc:
                logger.error("Database error executing segment filters in stream for intent: %s, error: %s", intent, exc, exc_info=True)
                try:
                    clarification_data = await ai_service.generate_query_clarification(intent, filters, exc)
                except Exception as ai_exc:
                    logger.error("AI query clarification generation failed in stream: %s", ai_exc, exc_info=True)
                    clarification_data = {
                        "question": "Your search query could not be executed due to mismatched criteria. How should we proceed?",
                        "options": [
                            "Target all active subscribers",
                            "Filter by customers who ordered in the last 30 days",
                            "Specify premium subscription tier"
                        ]
                    }
                yield json.dumps({
                    "event": "clarification_needed",
                    "campaign_id": campaign.id,
                    "question": clarification_data["question"],
                    "options": clarification_data["options"],
                }) + "\n"
                return
            sample_ids = all_ids[:MAX_SEGMENT_SAMPLE_SIZE]
            logger.info(
                "Campaign %d (stream): segment size=%d (will generate messages for all %d)",
                campaign.id, customer_count, len(all_ids),
            )
        else:
            logger.info("Campaign %d (stream): extracting filters for intent: %.80s", campaign.id, intent)
            intent_to_extract = intent
            if clarification:
                intent_to_extract = f"{intent} (Clarification: {clarification})"
            filters = await ai_service.extract_segment_filters(intent_to_extract, db, tenant_id)
            yield json.dumps({
                "event": "filters_extracted",
                "filters": [f.model_dump() for f in filters],
            }) + "\n"
            await asyncio.sleep(0.1)

            try:
                customer_count, all_ids = await segment_service.execute_segment_filters(filters, db, tenant_id)
            except Exception as exc:
                logger.error("Database error executing segment filters in stream for intent: %s, error: %s", intent, exc, exc_info=True)
                try:
                    clarification_data = await ai_service.generate_query_clarification(intent, filters, exc)
                except Exception as ai_exc:
                    logger.error("AI query clarification generation failed in stream: %s", ai_exc, exc_info=True)
                    clarification_data = {
                        "question": "Your search query could not be executed due to mismatched criteria. How should we proceed?",
                        "options": [
                            "Target all active subscribers",
                            "Filter by customers who ordered in the last 30 days",
                            "Specify premium subscription tier"
                        ]
                    }
                yield json.dumps({
                    "event": "clarification_needed",
                    "campaign_id": campaign.id,
                    "question": clarification_data["question"],
                    "options": clarification_data["options"],
                }) + "\n"
                return
            sample_ids = all_ids[:MAX_SEGMENT_SAMPLE_SIZE]
            logger.info(
                "Campaign %d (stream): segment size=%d (will generate messages for all %d)",
                campaign.id, customer_count, len(all_ids),
            )

        # Yield segment resolved with sample customer info
        sample_customers = []
        if sample_ids:
            sample_stmt = select(Customer).where(Customer.id.in_(sample_ids))
            sample_rows = (await db.execute(sample_stmt)).scalars().all()
            sample_customers = [
                {"id": c.id, "name": c.name, "email": c.email, "subscription_tier": c.subscription_tier}
                for c in sample_rows
            ]

        yield json.dumps({
            "event": "segment_resolved",
            "customer_count": customer_count,
            "sample_customers": sample_customers,
        }) + "\n"
        await asyncio.sleep(0.1)

        # Step 4: Persist Segment
        segment = Segment(
            campaign_id=campaign.id,
            filter_criteria=[f.model_dump() for f in filters],
            customer_count=customer_count,
            sample_customer_ids=sample_ids,
            tenant_id=tenant_id,
        )
        db.add(segment)
        await db.flush()

        # Step 5: Bulk-insert segment_customers rows
        message_target_ids = all_ids if not customer_ids else customer_ids
        if message_target_ids:
            await db.execute(
                segment_customers.insert(),
                [{"segment_id": segment.id, "customer_id": cid, "tenant_id": tenant_id} for cid in message_target_ids],
            )
            await db.flush()

        # Step 6: Transition to GENERATING
        await transition_campaign(campaign, CampaignState.GENERATING.value, db)
        await db.commit()
        yield json.dumps({"event": "generating_started"}) + "\n"
        await asyncio.sleep(0.1)

        # Step 7: Fetch ALL segment customer details for message generation
        if message_target_ids:
            customers_stmt = select(Customer).where(Customer.id.in_(message_target_ids))
            customer_rows = (await db.execute(customers_stmt)).scalars().all()
        else:
            customer_rows = []

        customer_summaries: list[CustomerSummary] = []
        days_since: dict[int, int] = {}
        today = datetime.date.today()
        for c in customer_rows:
            summary = CustomerSummary(id=c.id, name=c.name, email=c.email)
            summary.__dict__["subscription_tier"] = c.subscription_tier
            summary.__dict__["roast_preference"] = c.roast_preference
            summary.__dict__["crm_metadata"] = c.crm_metadata
            days_since[c.id] = (today - c.last_order_date).days
            customer_summaries.append(summary)

        # Step 8: Generate messages via AI
        logger.info("Campaign %d (stream): generating messages for %d customers", campaign.id, len(customer_summaries))
        generated = await ai_service.generate_messages(customer_summaries, intent, db, tenant_id, days_since)
        msg_lookup: dict[int, str] = {
            item["customer_id"]: item["message"]
            for item in generated
            if isinstance(item, dict) and "customer_id" in item and "message" in item
        }

        # Step 9: Stream message tokens to client AND prepare insert objects
        messages_inserted = []
        for idx, c in enumerate(customer_rows):
            body = msg_lookup.get(c.id, f"Hi {c.name.split()[0]}! We have a special offer for you.")
            
            yield json.dumps({
                "event": "message_start",
                "customer_id": c.id,
                "customer_name": c.name,
                "subscription_tier": c.subscription_tier,
            }) + "\n"
            
            # Stream tokens
            words = body.split(" ")
            for w_idx, word in enumerate(words):
                delta = word + (" " if w_idx < len(words) - 1 else "")
                yield json.dumps({
                    "event": "message_delta",
                    "customer_id": c.id,
                    "delta": delta,
                }) + "\n"
                # Type the first 3 messages at nice pacing, other messages extremely fast to keep UI snappy
                delay = 0.015 if idx < 3 else 0.002
                await asyncio.sleep(delay)

            yield json.dumps({
                "event": "message_complete",
                "customer_id": c.id,
                "message": body,
            }) + "\n"
            await asyncio.sleep(0.02)

            msg = CampaignMessage(
                campaign_id=campaign.id,
                customer_id=c.id,
                body=body,
                edited=False,
                tenant_id=tenant_id,
            )
            db.add(msg)
            messages_inserted.append(msg)

        await db.flush()

        # Step 10: Transition GENERATING → REVIEWING
        await transition_campaign(campaign, CampaignState.REVIEWING.value, db)

        # Refresh campaign & segment (before commit)
        await db.refresh(campaign)
        await db.refresh(segment)

        await db.commit()

        yield json.dumps({
            "event": "campaign_complete",
            "campaign_id": campaign.id,
        }) + "\n"

    except AIUnavailableError as exc:
        logger.error("AI unavailable during campaign creation stream: %s", exc)
        yield json.dumps({
            "event": "error",
            "message": "AI is temporarily unavailable — please retry in a moment.",
            "code": "AI_UNAVAILABLE",
        }) + "\n"
    except Exception as exc:
        logger.error("Error in create_campaign_stream_generator: %s", exc, exc_info=True)
        yield json.dumps({
            "event": "error",
            "message": str(exc),
            "code": "UNKNOWN_ERROR",
        }) + "\n"



# ── get_campaign_detail (T043) ────────────────────────────────────────────────

async def get_campaign_detail(campaign_id: int, db: AsyncSession, tenant_id: int) -> CampaignDetailResponse:
    """Fetch a campaign with its latest segment and all messages."""
    # Fetch campaign
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id, Campaign.tenant_id == tenant_id))
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(status_code=404, detail={"detail": f"Campaign {campaign_id} not found.", "code": "NOT_FOUND"})

    # Fetch segment (most recent)
    seg_result = await db.execute(
        select(Segment).where(Segment.campaign_id == campaign_id).order_by(Segment.id.desc()).limit(1)
    )
    segment = seg_result.scalar_one_or_none()

    segment_detail: SegmentDetail | None = None
    if segment:
        # Fetch sample customers
        sample_cust_result = await db.execute(
            select(Customer).where(Customer.id.in_(segment.sample_customer_ids))
        )
        sample_customers = [
            CustomerSummary(id=c.id, name=c.name, email=c.email)
            for c in sample_cust_result.scalars().all()
        ]
        segment_detail = SegmentDetail(
            id=segment.id,
            customer_count=segment.customer_count,
            filter_criteria=[FilterCriterion(**f) for f in segment.filter_criteria],
            sample_customers=sample_customers,
            large_segment_warning=segment.customer_count > LARGE_SEGMENT_THRESHOLD,
        )

    # Fetch messages with customer names
    msg_result = await db.execute(
        select(CampaignMessage, Customer.name.label("customer_name"))
        .join(Customer, CampaignMessage.customer_id == Customer.id)
        .where(CampaignMessage.campaign_id == campaign_id)
        .order_by(CampaignMessage.id)
    )
    message_previews = [
        MessagePreview(
            id=row.CampaignMessage.id,
            customer_id=row.CampaignMessage.customer_id,
            customer_name=row.customer_name,
            body=row.CampaignMessage.body,
            edited=row.CampaignMessage.edited,
            edited_body=row.CampaignMessage.edited_body,
            effective_body=row.CampaignMessage.edited_body or row.CampaignMessage.body,
        )
        for row in msg_result.all()
    ]

    audience_name = None
    if campaign.audience_id:
        from app.models.audience import Audience
        aud_res = await db.execute(select(Audience.name).where(Audience.id == campaign.audience_id))
        audience_name = aud_res.scalar_one_or_none()

    return CampaignDetailResponse(
        id=campaign.id,
        name=campaign.name,
        intent=campaign.intent,
        state=campaign.state,
        created_at=campaign.created_at,
        state_updated_at=campaign.state_updated_at,
        completed_at=campaign.completed_at,
        stalled_at=campaign.stalled_at,
        ai_summary=campaign.ai_summary,
        segment=segment_detail,
        messages=message_previews,
        audience_id=campaign.audience_id,
        audience_name=audience_name,
    )


# ── launch_campaign (T047) ────────────────────────────────────────────────────

async def launch_campaign(campaign_id: int, db: AsyncSession, tenant_id: int) -> CampaignResponse:
    """Transition REVIEWING → EXECUTING (the human-confirmation gate)."""
    # Ensure no campaign is currently executing
    await check_concurrent_executing(db)

    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id, Campaign.tenant_id == tenant_id))
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(status_code=404, detail={"detail": f"Campaign {campaign_id} not found.", "code": "NOT_FOUND"})

    await transition_campaign(campaign, CampaignState.EXECUTING.value, db)
    await db.commit()
    await db.refresh(campaign)

    return CampaignResponse(
        id=campaign.id,
        name=campaign.name,
        intent=campaign.intent,
        state=campaign.state,
        created_at=campaign.created_at,
        state_updated_at=campaign.state_updated_at,
        completed_at=campaign.completed_at,
        stalled_at=campaign.stalled_at,
        ai_summary=campaign.ai_summary,
    )


async def cancel_campaign(campaign_id: int, db: AsyncSession, tenant_id: int) -> CampaignResponse:
    """Transition REVIEWING or EXECUTING campaign to CANCELLED state."""
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id, Campaign.tenant_id == tenant_id))
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(status_code=404, detail={"detail": f"Campaign {campaign_id} not found.", "code": "NOT_FOUND"})

    await transition_campaign(campaign, CampaignState.CANCELLED.value, db)
    await db.commit()
    await db.refresh(campaign)

    return CampaignResponse(
        id=campaign.id,
        name=campaign.name,
        intent=campaign.intent,
        state=campaign.state,
        created_at=campaign.created_at,
        state_updated_at=campaign.state_updated_at,
        completed_at=campaign.completed_at,
        stalled_at=campaign.stalled_at,
        ai_summary=campaign.ai_summary,
    )


async def update_campaign(
    campaign_id: int,
    body: CampaignUpdateRequest,
    db: AsyncSession,
    tenant_id: int,
) -> CampaignDetailResponse:
    """Update campaign parameters (name, channel, scheduled_at, audience_id, or filter_criteria)
    while in REVIEWING state, and regenerate segments and messages accordingly.
    """
    from app.models.audience import Audience
    from app.services import segment_service, ai_service
    from sqlalchemy import delete
    from app.models.message import CampaignMessage
    from app.schemas.campaign import CampaignUpdateRequest

    # Fetch campaign
    campaign_stmt = select(Campaign).where(Campaign.id == campaign_id, Campaign.tenant_id == tenant_id)
    campaign = (await db.execute(campaign_stmt)).scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if campaign.state != CampaignState.REVIEWING.value:
        raise HTTPException(
            status_code=409,
            detail=f"Campaign is in {campaign.state} state — editing is only allowed in REVIEWING state."
        )

    # Track if we need to regenerate messages (if channel, filter_criteria, or audience_id changes)
    regenerate_needed = False

    if body.name is not None:
        campaign.name = body.name

    if body.channel is not None and body.channel != campaign.channel:
        campaign.channel = body.channel
        regenerate_needed = True

    if body.scheduled_at is not None:
        campaign.scheduled_at = body.scheduled_at

    filters = None
    if body.audience_id is not None:
        campaign.audience_id = body.audience_id
        # Look up audience filters
        audience_stmt = select(Audience).where(Audience.id == body.audience_id, Audience.tenant_id == tenant_id)
        audience = (await db.execute(audience_stmt)).scalar_one_or_none()
        if not audience:
            raise HTTPException(status_code=404, detail="Audience not found")
        filters = [FilterCriterion(field=f["field"], operator=f["operator"], value=f["value"]) for f in audience.filter_criteria]
        campaign.intent = f"Targeting saved audience: {audience.name}"
        regenerate_needed = True
    elif body.filter_criteria is not None:
        filters = body.filter_criteria
        campaign.audience_id = None  # Clear audience ID since custom criteria is provided
        campaign.intent = f"Custom segmented campaign"
        regenerate_needed = True

    if regenerate_needed:
        # Fetch existing filters if not already set by audience_id or filter_criteria
        if filters is None:
            seg_stmt = select(Segment).where(Segment.campaign_id == campaign.id).order_by(Segment.id.desc()).limit(1)
            existing_seg = (await db.execute(seg_stmt)).scalar_one_or_none()
            if existing_seg:
                filters = [FilterCriterion(**f) for f in existing_seg.filter_criteria]
            else:
                filters = []

        # Clean up existing messages & segments
        await db.execute(delete(CampaignMessage).where(CampaignMessage.campaign_id == campaign.id))
        old_segments_stmt = select(Segment.id).where(Segment.campaign_id == campaign.id)
        old_segment_ids = (await db.execute(old_segments_stmt)).scalars().all()
        if old_segment_ids:
            await db.execute(delete(segment_customers).where(segment_customers.c.segment_id.in_(old_segment_ids)))
            await db.execute(delete(Segment).where(Segment.campaign_id == campaign.id))
        await db.flush()

        # Execute segment filters
        customer_count, all_ids = await segment_service.execute_segment_filters(filters, db, tenant_id)
        sample_ids = all_ids[:MAX_SEGMENT_SAMPLE_SIZE]

        # Save new segment
        segment = Segment(
            campaign_id=campaign.id,
            filter_criteria=[f.model_dump() for f in filters],
            customer_count=customer_count,
            sample_customer_ids=sample_ids,
            tenant_id=tenant_id,
        )
        db.add(segment)
        await db.flush()

        # Save segment customers
        if all_ids:
            await db.execute(
                segment_customers.insert(),
                [{"segment_id": segment.id, "customer_id": cid, "tenant_id": tenant_id} for cid in all_ids],
            )
            await db.flush()

        # Generate new messages via AI
        customers_stmt = select(Customer).where(Customer.id.in_(all_ids))
        customer_rows = (await db.execute(customers_stmt)).scalars().all()

        customer_summaries = []
        days_since = {}
        today = datetime.date.today()
        for c in customer_rows:
            summary = CustomerSummary(id=c.id, name=c.name, email=c.email)
            summary.__dict__["subscription_tier"] = c.subscription_tier
            summary.__dict__["roast_preference"] = c.roast_preference
            summary.__dict__["crm_metadata"] = c.crm_metadata
            days_since[c.id] = (today - c.last_order_date).days
            customer_summaries.append(summary)

        # AI generate messages
        generated = await ai_service.generate_messages(customer_summaries, campaign.intent, db, tenant_id, days_since)
        msg_lookup = {
            item["customer_id"]: item["message"]
            for item in generated
            if isinstance(item, dict) and "customer_id" in item and "message" in item
        }

        for c in customer_rows:
            body = msg_lookup.get(c.id, f"Hi {c.name.split()[0]}! We have a special offer for you.")
            msg = CampaignMessage(
                campaign_id=campaign.id,
                customer_id=c.id,
                body=body,
                edited=False,
                tenant_id=tenant_id,
            )
            db.add(msg)
        await db.flush()

    campaign.state_updated_at = _utcnow()
    await db.commit()

    return await get_campaign_detail(campaign_id=campaign.id, db=db, tenant_id=tenant_id)


# ── list_campaigns (T067) ─────────────────────────────────────────────────────

async def list_campaigns(
    page: int,
    page_size: int,
    db: AsyncSession,
    tenant_id: int,
) -> CampaignListResponse:
    """Paginated campaign history ordered by created_at DESC.

    Computes segment_size, open_rate, and click_rate for each campaign
    from the segments and delivery_events tables respectively.
    """
    from app.models.delivery import DeliveryEvent  # noqa: PLC0415

    offset = (page - 1) * page_size

    total_result = await db.execute(select(func.count()).select_from(Campaign).where(Campaign.tenant_id == tenant_id))
    total: int = total_result.scalar_one()

    campaigns_result = await db.execute(
        select(Campaign).where(Campaign.tenant_id == tenant_id).order_by(Campaign.created_at.desc()).offset(offset).limit(page_size)
    )
    campaigns = campaigns_result.scalars().all()

    items: list[CampaignListItem] = []
    for c in campaigns:
        # Segment size from most recent segment
        seg_result = await db.execute(
            select(Segment.customer_count)
            .where(Segment.campaign_id == c.id)
            .order_by(Segment.id.desc())
            .limit(1)
        )
        seg_size: int = seg_result.scalar_one_or_none() or 0

        # Delivery metrics from delivery_events (only for COMPLETE/EXECUTING campaigns)
        open_rate = 0.0
        click_rate = 0.0
        if c.state in (CampaignState.COMPLETE.value, CampaignState.EXECUTING.value):
            metrics_result = await db.execute(
                select(
                    func.count(DeliveryEvent.id).filter(
                        DeliveryEvent.status == "delivered"
                    ).label("delivered"),
                    func.count(DeliveryEvent.id).filter(
                        DeliveryEvent.status == "opened"
                    ).label("opened"),
                    func.count(DeliveryEvent.id).filter(
                        DeliveryEvent.status == "clicked"
                    ).label("clicked"),
                )
                .select_from(DeliveryEvent)
                .join(CampaignMessage, DeliveryEvent.campaign_message_id == CampaignMessage.id)
                .where(CampaignMessage.campaign_id == c.id)
            )
            m = metrics_result.one()
            delivered = m.delivered or 0
            opened = m.opened or 0
            clicked = m.clicked or 0
            open_rate = round(opened / delivered, 3) if delivered > 0 else 0.0
            click_rate = round(clicked / opened, 3) if opened > 0 else 0.0

        items.append(
            CampaignListItem(
                id=c.id,
                name=c.name,
                state=c.state,
                created_at=c.created_at,
                completed_at=c.completed_at,
                segment_size=seg_size,
                open_rate=open_rate,
                click_rate=click_rate,
                stalled_at=c.stalled_at,
                scheduled_at=c.scheduled_at,
                channel=c.channel,
            )
        )

    return CampaignListResponse(total=total, page=page, page_size=page_size, items=items)
