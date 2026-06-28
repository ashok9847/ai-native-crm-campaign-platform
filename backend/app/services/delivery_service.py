"""Delivery service — dispatch, idempotent callback recording, completion check.

Public API:
  dispatch_campaign_messages(campaign_id, db)        — CRM → channel service (fire-and-forget)
  record_delivery_event(event, db) -> bool            — ON CONFLICT DO NOTHING; True=new, False=dup
  check_campaign_completion(campaign_id, db)          — EXECUTING→COMPLETE when all settled
  get_latest_statuses(campaign_id, db)                — T056: SSE snapshot per recipient
  compute_campaign_metrics(campaign_id, db)           — T061: counts + rates
  build_insight_card(metrics, campaign_id, db)        — T061: clicked-no-purchase insight
"""

from __future__ import annotations

import datetime
import logging
import uuid

import httpx
from sqlalchemy import distinct, func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.campaign import Campaign, CampaignState
from app.models.customer import Customer
from app.models.delivery import DeliveryEvent
from app.models.message import CampaignMessage
from app.schemas.campaign import CampaignMetrics, InsightCard
from app.schemas.delivery import CallbackEvent, DispatchRequest

logger = logging.getLogger(__name__)


# ── Timestamp helper ─────────────────────────────────────────────────────────

def _to_utc_isoformat(ts: datetime.datetime | None) -> str | None:
    """Return a consistent UTC ISO 8601 string safe for JS new Date() parsing.

    asyncpg may return timezone-aware datetimes whose isoformat() already
    contains '+00:00'. Appending 'Z' to that produces '…+00:00Z' which
    JavaScript's Date constructor cannot parse (yields 'Invalid Date').
    Stripping tzinfo before formatting avoids this double-suffix.
    """
    if ts is None:
        return None
    naive = ts.replace(tzinfo=None) if ts.tzinfo is not None else ts
    ms = naive.microsecond // 1000
    return naive.strftime("%Y-%m-%dT%H:%M:%S.") + f"{ms:03d}Z"


# Terminal statuses — a message is "settled" when its latest event is one of these
# NOTE: 'sent' is included as a safety net: if a message drops off silently without
# a 'delivered'/'failed' follow-up, it won't block campaign completion.
TERMINAL_STATUSES = frozenset({"delivered", "failed", "purchased"})


# ── T051: dispatch_campaign_messages ─────────────────────────────────────────

async def dispatch_campaign_messages(campaign_id: int, db: AsyncSession) -> None:
    """Fire dispatch requests to the channel service for every message in the campaign.

    Runs as a FastAPI BackgroundTask after launch — does NOT await individual
    HTTP responses (fire-and-forget per message).
    """
    # Temporarily bypass RLS for background campaign dispatch
    await db.execute(text("SELECT set_config('app.bypass_rls', 'true', true)"))
    settings = get_settings()

    result = await db.execute(
        select(CampaignMessage, Customer)
        .join(Customer, CampaignMessage.customer_id == Customer.id)
        .where(CampaignMessage.campaign_id == campaign_id)
    )
    rows = result.all()

    if not rows:
        logger.warning("dispatch_campaign_messages: no messages found for campaign %d", campaign_id)
        return

    callback_url = f"{settings.backend_url}/api/v1/campaigns/callback"
    dispatch_url = f"{settings.channel_service_url}/api/v1/dispatch"

    # Fetch the campaign's channel type
    campaign_result = await db.execute(
        select(Campaign.channel).where(Campaign.id == campaign_id)
    )
    campaign_channel = campaign_result.scalar_one_or_none() or "sms"

    async with httpx.AsyncClient(timeout=10.0) as client:
        for row in rows:
            # Check if campaign was cancelled during dispatch
            state_result = await db.execute(
                select(Campaign.state).where(Campaign.id == campaign_id)
            )
            state = state_result.scalar_one_or_none()
            if state != CampaignState.EXECUTING.value:
                logger.info(
                    "dispatch_campaign_messages: campaign %d state is %s, stopping dispatch",
                    campaign_id, state,
                )
                break

            msg: CampaignMessage = row.CampaignMessage
            cust: Customer = row.Customer

            dispatch_id = str(uuid.uuid4())
            payload = DispatchRequest(
                dispatch_id=dispatch_id,
                campaign_id=campaign_id,
                message_id=msg.id,
                recipient={
                    "customer_id": cust.id,
                    "name": cust.name,
                    "email": cust.email,
                },
                message_body=msg.effective_body,
                channel=campaign_channel,
                callback_url=callback_url,
            )

            try:
                resp = await client.post(
                    dispatch_url,
                    json=payload.model_dump(),
                )
                if resp.status_code == 202:
                    logger.info(
                        "Dispatched message %d (campaign %d, dispatch_id=%s)",
                        msg.id, campaign_id, dispatch_id,
                    )
                else:
                    logger.error(
                        "Unexpected status %d from channel service for message %d",
                        resp.status_code, msg.id,
                    )
            except httpx.HTTPError as exc:
                logger.error("HTTP error dispatching message %d: %s", msg.id, exc)


# ── T051: record_delivery_event ───────────────────────────────────────────────

async def record_delivery_event(event: CallbackEvent, db: AsyncSession) -> bool:
    """Insert a delivery event idempotently.

    Returns True if newly inserted, False if duplicate (ON CONFLICT DO NOTHING).
    """
    # Validate campaign_message exists and matches campaign_id and customer_id
    stmt_check = select(CampaignMessage).where(CampaignMessage.id == event.message_id)
    msg = (await db.execute(stmt_check)).scalar_one_or_none()
    if not msg:
        logger.warning("Callback validation failed: message_id=%d not found", event.message_id)
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Invalid message_id")
        
    if msg.campaign_id != event.campaign_id or msg.customer_id != event.customer_id:
        logger.warning(
            "Callback validation failed: campaign_id mismatch (%d vs %d) or customer_id mismatch (%d vs %d)",
            msg.campaign_id, event.campaign_id,
            msg.customer_id, event.customer_id,
        )
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Campaign/Customer ID mismatch")

    stmt = (
        pg_insert(DeliveryEvent)
        .values(
            event_id=event.event_id,
            campaign_message_id=event.message_id,
            status=event.status,
            is_retry=event.is_retry,
            is_final=event.is_final,
            received_at=datetime.datetime.utcnow(),
            tenant_id=msg.tenant_id,
            dispatch_id=event.dispatch_id,
        )
        .on_conflict_do_nothing(index_elements=["event_id"])
    )
    result = await db.execute(stmt)
    is_new = result.rowcount > 0
    
    if is_new:
        # ── T012: Increment denormalized stats counter ───────────────────
        from app.services import stats_service
        campaign_result = await db.execute(
            select(CampaignMessage.campaign_id).where(CampaignMessage.id == event.message_id)
        )
        campaign_id_for_stats = campaign_result.scalar_one_or_none()
        if campaign_id_for_stats:
            await stats_service.increment_counter(db, campaign_id_for_stats, msg.tenant_id, event.status)

        if event.status == "purchased":
            from app.models.order import Order
            import random
            order_date = datetime.date.today()
            total_amount = round(random.uniform(20.0, 120.0), 2)
            new_order = Order(
                tenant_id=msg.tenant_id,
                customer_id=event.customer_id,
                order_date=order_date,
                total_amount=total_amount,
                items=[{"name": "Simulated Campaign Purchase", "qty": 1, "price": total_amount}],
                source_channel="campaign",
                communication_id=event.message_id,  # T006: Revenue attribution link
                campaign_id=msg.campaign_id,
            )
            db.add(new_order)
            logger.info("Simulated campaign purchase order created: customer_id=%d, amount=$%.2f", event.customer_id, total_amount)

            # T012: Add attributed revenue to stats
            if campaign_id_for_stats:
                await stats_service.add_attributed_revenue(db, campaign_id_for_stats, total_amount)

    await db.commit()
    if not is_new:
        logger.info("Duplicate delivery event ignored: %s", event.event_id)
    return is_new


# ── T051/T062: check_campaign_completion ──────────────────────────────────────

def _validate_summary_numbers(summary: str, campaign_name: str, metrics: CampaignMetrics) -> bool:
    """Verify that all numbers in the AI summary match actual metrics.

    This acts as a safety shield against LLM/API hallucination of statistics.
    """
    import re
    # Extract all digits/numbers from summary
    summary_nums = re.findall(r'\d+', summary)
    if not summary_nums:
        return False

    # Extract numbers from campaign name so we don't reject them if they appear in summary
    name_nums = set(re.findall(r'\d+', campaign_name))

    open_pct = int(round(metrics.open_rate * 100))
    click_pct = int(round(metrics.click_rate * 100))
    conv_pct = int(round(metrics.conversion_rate * 100))

    allowed = {
        str(metrics.total_recipients),
        str(metrics.sent),
        str(metrics.delivered),
        str(metrics.opened),
        str(metrics.clicked),
        str(metrics.failed),
        str(metrics.purchased),
        str(open_pct),
        str(click_pct),
        str(conv_pct),
    }

    # Also allow standard 100 if any rate is 100%
    if metrics.open_rate == 1.0 or metrics.click_rate == 1.0 or metrics.conversion_rate == 1.0:
        allowed.add("100")

    for num in summary_nums:
        if num in name_nums:
            continue
        # Check all numbers (including single digits) against allowed metrics.
        # This catches when AI invents single-digit counts like "5 delivered".
        if num not in allowed:
            logger.warning(
                "AI summary validation failed: found number %s which is not in allowed metrics %s",
                num, allowed,
            )
            return False

    return True


def generate_fallback_summary(campaign_name: str, metrics: CampaignMetrics) -> str:
    """Generate a highly polished, statistically accurate campaign summary template."""
    open_pct = f"{metrics.open_rate:.0%}"
    click_pct = f"{metrics.click_rate:.0%}"
    conv_pct = f"{metrics.conversion_rate:.0%}"

    if metrics.purchased > 0:
        engagement = f"A total of {metrics.clicked} customers clicked and {metrics.purchased} purchased, resulting in a {conv_pct} conversion rate."
    elif metrics.clicked > 0:
        engagement = f"A total of {metrics.clicked} customers clicked on the links, but none purchased yet."
    elif metrics.opened > 0:
        engagement = f"Although {metrics.opened} customers opened the message, none clicked, suggesting room to optimize the call-to-action."
    else:
        engagement = "No opens or clicks were recorded, indicating the message body or timing can be further optimized."

    return (
        f"The '{campaign_name}' campaign reached {metrics.delivered} of {metrics.total_recipients} "
        f"recipients with a {open_pct} open rate and {click_pct} click rate. {engagement}"
    )


async def _generate_delayed_summary(campaign_id: int) -> None:
    """Sleep briefly to let concurrent callbacks commit, then generate and save the validated AI summary."""
    import asyncio
    await asyncio.sleep(8.0)

    from app.core.database import AsyncSessionLocal
    from app.services.ai_service import summarize_campaign, AIUnavailableError

    async with AsyncSessionLocal() as db:
        try:
            # Temporarily bypass RLS for background campaign summary generation
            await db.execute(text("SELECT set_config('app.bypass_rls', 'true', true)"))
            # Fetch campaign
            camp_result = await db.execute(
                select(Campaign).where(Campaign.id == campaign_id)
            )
            campaign = camp_result.scalar_one_or_none()
            if not campaign:
                logger.error("Delayed summary: campaign %d not found", campaign_id)
                return

            # Compute final metrics
            metrics = await compute_campaign_metrics(campaign_id, db)
            open_pct = f"{metrics.open_rate:.0%}"
            click_pct = f"{metrics.click_rate:.0%}"
            conv_pct = f"{metrics.conversion_rate:.0%}"
            metrics_text = (
                f'Campaign "{campaign.name}" completed. '
                f"Intent: \"{campaign.intent[:150]}\". "
                f"Total recipients: {metrics.total_recipients}. "
                f"Sent: {metrics.sent}, Delivered: {metrics.delivered}, "
                f"Opened: {metrics.opened} (open rate {open_pct}), "
                f"Clicked: {metrics.clicked} (click rate {click_pct}), "
                f"Purchased: {metrics.purchased} (conversion rate {conv_pct}), "
                f"Failed: {metrics.failed}."
            )

            try:
                summary = await summarize_campaign(metrics_text)
                if not _validate_summary_numbers(summary, campaign.name, metrics):
                    logger.warning(
                        "Delayed summary: AI summary contained incorrect/hallucinated statistics for campaign %d. Falling back to template.",
                        campaign_id
                    )
                    summary = generate_fallback_summary(campaign.name, metrics)
                campaign.ai_summary = summary
            except AIUnavailableError:
                logger.warning("Delayed summary: AI summary unavailable for campaign %d — using fallback", campaign_id)
                campaign.ai_summary = generate_fallback_summary(campaign.name, metrics)

            await db.commit()
            logger.info("Delayed summary: successfully generated and saved summary for campaign %d", campaign_id)

        except Exception as exc:
            logger.error("Delayed summary: failed to generate summary for campaign %d: %s", campaign_id, exc, exc_info=True)


async def check_campaign_completion(campaign_id: int, db: AsyncSession) -> None:
    """After each callback, check if all campaign messages have a terminal event.

    If so, transition EXECUTING → COMPLETE and start background summary generation.
    No-op if campaign is not in EXECUTING state.
    """
    camp_result = await db.execute(
        select(Campaign).where(Campaign.id == campaign_id)
    )
    campaign = camp_result.scalar_one_or_none()
    if campaign is None or campaign.state != CampaignState.EXECUTING.value:
        return

    total_result = await db.execute(
        select(func.count())
        .select_from(CampaignMessage)
        .where(CampaignMessage.campaign_id == campaign_id)
    )
    total_messages: int = total_result.scalar_one()

    if total_messages == 0:
        return

    settled_result = await db.execute(
        select(func.count(distinct(DeliveryEvent.campaign_message_id)))
        .select_from(DeliveryEvent)
        .join(CampaignMessage, DeliveryEvent.campaign_message_id == CampaignMessage.id)
        .where(
            CampaignMessage.campaign_id == campaign_id,
            DeliveryEvent.is_final == True,
        )
    )
    settled_count: int = settled_result.scalar_one()

    logger.debug(
        "Campaign %d completion check: %d/%d messages settled",
        campaign_id, settled_count, total_messages,
    )

    if settled_count < total_messages:
        return

    logger.info(
        "Campaign %d: all %d messages settled → transitioning to COMPLETE",
        campaign_id, total_messages,
    )

    # Transition state immediately to COMPLETE to prevent concurrent calls
    campaign.state = CampaignState.COMPLETE.value
    campaign.state_updated_at = datetime.datetime.utcnow()
    campaign.completed_at = datetime.datetime.utcnow()
    await db.commit()

    # Trigger delayed summary generation in a background task
    import asyncio
    asyncio.create_task(_generate_delayed_summary(campaign_id))



# ── T056: get_latest_statuses (SSE initial snapshot + polling) ────────────────

async def get_latest_statuses(campaign_id: int, db: AsyncSession) -> list[dict]:
    """Return the most recent delivery status for each message in the campaign.

    Uses DISTINCT ON (campaign_message_id) ordered by status precedence rank then received_at DESC.
    Matches the SSE StatusUpdateEvent shape.
    """
    sql = text("""
        SELECT DISTINCT ON (de.campaign_message_id)
            de.campaign_message_id,
            cm.customer_id,
            c.name         AS customer_name,
            de.status,
            de.received_at AS timestamp,
            de.is_retry
        FROM delivery_events de
        JOIN campaign_messages cm ON cm.id = de.campaign_message_id
        JOIN customers c          ON c.id  = cm.customer_id
        WHERE cm.campaign_id = :campaign_id
        ORDER BY de.campaign_message_id,
                 CASE de.status
                     WHEN 'purchased' THEN 6
                     WHEN 'clicked' THEN 5
                     WHEN 'read' THEN 4
                     WHEN 'opened' THEN 3
                     WHEN 'delivered' THEN 2
                     ELSE 1
                 END DESC,
                 de.received_at DESC
    """)
    result = await db.execute(sql, {"campaign_id": campaign_id})
    rows = result.mappings().all()
    return [
        {
            "type": "status_update",
            "campaign_message_id": row["campaign_message_id"],
            "customer_id": row["customer_id"],
            "customer_name": row["customer_name"],
            "status": row["status"],
            "timestamp": _to_utc_isoformat(row["timestamp"]),
            "is_retry": row["is_retry"],
        }
        for row in rows
    ]


# ── T061: compute_campaign_metrics ────────────────────────────────────────────

async def compute_campaign_metrics(campaign_id: int, db: AsyncSession) -> CampaignMetrics:
    """Compute delivery metrics from delivery_events.

    open_rate = opened / delivered (0 if delivered == 0)
    click_rate = clicked / opened  (0 if opened == 0)
    """
    result = await db.execute(
        select(
            func.count(distinct(CampaignMessage.id)).label("total"),
            func.count(DeliveryEvent.id).filter(DeliveryEvent.status == "sent").label("sent"),
            func.count(DeliveryEvent.id).filter(DeliveryEvent.status == "delivered").label("delivered"),
            func.count(DeliveryEvent.id).filter(DeliveryEvent.status == "opened").label("opened"),
            func.count(DeliveryEvent.id).filter(DeliveryEvent.status == "clicked").label("clicked"),
            func.count(DeliveryEvent.id).filter(DeliveryEvent.status == "failed").label("failed"),
            func.count(DeliveryEvent.id).filter(DeliveryEvent.status == "purchased").label("purchased"),
        )
        .select_from(CampaignMessage)
        .outerjoin(DeliveryEvent, DeliveryEvent.campaign_message_id == CampaignMessage.id)
        .where(CampaignMessage.campaign_id == campaign_id)
    )
    row = result.one()
    total = row.total or 0
    sent = row.sent or 0
    delivered = row.delivered or 0
    opened = row.opened or 0
    clicked = row.clicked or 0
    failed = row.failed or 0
    purchased = row.purchased or 0

    open_rate = round(opened / delivered, 3) if delivered > 0 else 0.0
    click_rate = round(clicked / opened, 3) if opened > 0 else 0.0
    conversion_rate = round(purchased / total, 3) if total > 0 else 0.0

    # ── Campaign Revenue Attribution ──
    # Sum total_amount of orders placed on or after the campaign's launch/creation date
    # by customers who clicked on a message in this campaign.
    attributed_revenue = 0.0
    campaign_res = await db.execute(
        select(Campaign.created_at).where(Campaign.id == campaign_id)
    )
    campaign_created_at = campaign_res.scalar_one_or_none()
    if campaign_created_at:
        campaign_date = campaign_created_at.date()
        clicked_cust_ids = select(distinct(CampaignMessage.customer_id))\
            .join(DeliveryEvent, DeliveryEvent.campaign_message_id == CampaignMessage.id)\
            .where(CampaignMessage.campaign_id == campaign_id, DeliveryEvent.status == "clicked")
        
        clicked_cust_ids_list = (await db.execute(clicked_cust_ids)).scalars().all()
        if clicked_cust_ids_list:
            from app.models.order import Order
            revenue_stmt = select(func.sum(Order.total_amount)).where(
                Order.customer_id.in_(clicked_cust_ids_list),
                Order.order_date >= campaign_date
            )
            res_rev = await db.execute(revenue_stmt)
            attributed_revenue = float(res_rev.scalar() or 0.0)

    return CampaignMetrics(
        total_recipients=total,
        sent=sent,
        delivered=delivered,
        opened=opened,
        clicked=clicked,
        failed=failed,
        purchased=purchased,
        open_rate=open_rate,
        click_rate=click_rate,
        conversion_rate=conversion_rate,
        attributed_revenue=attributed_revenue,
    )


# ── T061: build_insight_card ─────────────────────────────────────────────────

async def build_insight_card(
    metrics: CampaignMetrics,
    campaign_id: int,
    db: AsyncSession,
) -> InsightCard | None:
    """Return an InsightCard when clicked > 0 (proxy for 'clicked but didn't purchase').

    Includes the exact customer IDs of clickers so the follow-up campaign can
    bypass AI segmentation and target precisely the right people.

    Returns None when clicked_count == 0.
    """
    if metrics.clicked == 0:
        return None

    camp_result = await db.execute(
        select(Campaign.name, Campaign.intent).where(Campaign.id == campaign_id)
    )
    camp_row = camp_result.one_or_none()
    intent = camp_row.intent if camp_row else "the previous campaign"

    # ── Query exact customer IDs who registered a 'clicked' status ──────
    clicked_ids_result = await db.execute(
        select(distinct(Customer.id))
        .join(CampaignMessage, CampaignMessage.customer_id == Customer.id)
        .join(DeliveryEvent, DeliveryEvent.campaign_message_id == CampaignMessage.id)
        .where(
            CampaignMessage.campaign_id == campaign_id,
            DeliveryEvent.status == "clicked",
        )
    )
    clicked_all = set(clicked_ids_result.scalars().all())

    # ── Query exact customer IDs who registered a 'purchased' status ──────
    purchased_ids_result = await db.execute(
        select(distinct(Customer.id))
        .join(CampaignMessage, CampaignMessage.customer_id == Customer.id)
        .join(DeliveryEvent, DeliveryEvent.campaign_message_id == CampaignMessage.id)
        .where(
            CampaignMessage.campaign_id == campaign_id,
            DeliveryEvent.status == "purchased",
        )
    )
    purchased_all = set(purchased_ids_result.scalars().all())

    clicked_no_purchase_ids = list(clicked_all - purchased_all)
    clicked_no_purchase_count = len(clicked_no_purchase_ids)

    suggested = (
        f"Send a follow-up offer to the {clicked_no_purchase_count} customers who clicked "
        f"our message but haven't placed an order yet — based on: {intent}"
    )

    return InsightCard(
        clicked_no_purchase_count=clicked_no_purchase_count,
        clicked_count=len(clicked_all),
        purchased_count=len(purchased_all),
        suggested_followup_intent=suggested,
        clicked_customer_ids=clicked_no_purchase_ids,
    )
