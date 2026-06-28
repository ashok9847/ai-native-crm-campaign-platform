"""Stats service — atomic counter increments for denormalized campaign stats."""

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.campaign_stats import CampaignStats


# ── Map delivery event status → stats column name ─────────────────────────
_STATUS_COLUMN_MAP: dict[str, str] = {
    "sent": "sent_count",
    "delivered": "delivered_count",
    "opened": "opened_count",
    "read": "opened_count",        # RCS 'read' maps to same counter as 'opened'
    "clicked": "clicked_count",
    "failed": "failed_count",
    "purchased": "purchased_count",
}


async def ensure_stats_row(
    db: AsyncSession,
    campaign_id: int,
    tenant_id: int,
) -> CampaignStats:
    """Create a stats row for the campaign if it doesn't exist yet.

    Uses INSERT ... ON CONFLICT DO NOTHING semantics via a check-then-insert
    pattern (safe under serializable or with UNIQUE constraint on campaign_id).
    """
    result = await db.execute(
        select(CampaignStats).where(CampaignStats.campaign_id == campaign_id)
    )
    stats = result.scalar_one_or_none()
    if stats is None:
        stats = CampaignStats(campaign_id=campaign_id, tenant_id=tenant_id)
        db.add(stats)
        await db.flush()
    return stats


async def increment_counter(
    db: AsyncSession,
    campaign_id: int,
    tenant_id: int,
    status: str,
) -> None:
    """Atomically increment the counter for the given delivery status.

    Uses ``SET column = column + 1`` which is atomic in PostgreSQL.
    If no stats row exists yet, creates one first.
    """
    column_name = _STATUS_COLUMN_MAP.get(status)
    if column_name is None:
        return  # Unknown status — no counter to increment

    # Ensure the stats row exists
    await ensure_stats_row(db, campaign_id, tenant_id)

    # Atomic increment
    column = getattr(CampaignStats, column_name)
    await db.execute(
        update(CampaignStats)
        .where(CampaignStats.campaign_id == campaign_id)
        .values({column_name: column + 1})
    )


async def add_attributed_revenue(
    db: AsyncSession,
    campaign_id: int,
    amount: float,
) -> None:
    """Atomically add revenue to the campaign's attributed total."""
    await db.execute(
        update(CampaignStats)
        .where(CampaignStats.campaign_id == campaign_id)
        .values(
            attributed_revenue=CampaignStats.attributed_revenue + amount,
        )
    )


async def get_stats(
    db: AsyncSession,
    campaign_id: int,
) -> CampaignStats | None:
    """Return the stats row for a campaign, or None."""
    result = await db.execute(
        select(CampaignStats).where(CampaignStats.campaign_id == campaign_id)
    )
    return result.scalar_one_or_none()


async def reconcile(
    db: AsyncSession,
    campaign_id: int,
    tenant_id: int,
) -> dict:
    """Recalculate campaign stats from raw delivery_events.

    Returns a before/after comparison dict.
    """
    from sqlalchemy import func as sqlfunc, case
    from app.models.delivery import DeliveryEvent
    from app.models.message import CampaignMessage

    # Get current stats
    current = await get_stats(db, campaign_id)
    before = {}
    if current:
        before = {
            "sent_count": current.sent_count,
            "delivered_count": current.delivered_count,
            "opened_count": current.opened_count,
            "clicked_count": current.clicked_count,
            "failed_count": current.failed_count,
            "purchased_count": current.purchased_count,
        }

    # Count raw events
    msg_ids_subq = (
        select(CampaignMessage.id)
        .where(CampaignMessage.campaign_id == campaign_id)
        .scalar_subquery()
    )
    result = await db.execute(
        select(
            sqlfunc.count(case((DeliveryEvent.status == "sent", 1))).label("sent"),
            sqlfunc.count(case((DeliveryEvent.status == "delivered", 1))).label("delivered"),
            sqlfunc.count(case((DeliveryEvent.status.in_(["opened", "read"]), 1))).label("opened"),
            sqlfunc.count(case((DeliveryEvent.status == "clicked", 1))).label("clicked"),
            sqlfunc.count(case((DeliveryEvent.status == "failed", 1))).label("failed"),
            sqlfunc.count(case((DeliveryEvent.status == "purchased", 1))).label("purchased"),
        ).where(DeliveryEvent.campaign_message_id.in_(msg_ids_subq))
    )
    row = result.one()

    after = {
        "sent_count": row.sent or 0,
        "delivered_count": row.delivered or 0,
        "opened_count": row.opened or 0,
        "clicked_count": row.clicked or 0,
        "failed_count": row.failed or 0,
        "purchased_count": row.purchased or 0,
    }

    # Upsert
    stats = await ensure_stats_row(db, campaign_id, tenant_id)
    for key, val in after.items():
        setattr(stats, key, val)
    await db.flush()

    return {
        "campaign_id": campaign_id,
        "before": before,
        "after": after,
        "drift_detected": before != after,
    }
