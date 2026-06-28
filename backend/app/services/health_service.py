"""Health service — lazy-recomputed customer health scoring."""

import datetime
import math

from sqlalchemy import select, func as sqlfunc, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.customer import Customer
from app.models.customer_health import CustomerHealth, HealthZone
from app.models.order import Order
from app.models.delivery import DeliveryEvent
from app.models.message import CampaignMessage


# ── Weights (from research.md R2) ───────────────────────────────────────
W_RECENCY = 0.35
W_ENGAGEMENT = 0.30
W_SPEND = 0.20
W_FREQUENCY = 0.15

# ── Staleness threshold ─────────────────────────────────────────────────
STALENESS_HOURS = 24


def _zone_for_score(score: int) -> str:
    """Classify score into health zone."""
    settings = get_settings()
    if score >= 60:
        return HealthZone.HEALTHY.value
    if score >= settings.churn_threshold:
        return HealthZone.AT_RISK.value
    return HealthZone.CHURNING.value


def _recommended_action(zone: str, weakest: str) -> str | None:
    """Generate a rule-based recommended action based on weakest signal."""
    if zone == HealthZone.HEALTHY.value:
        return None
    actions = {
        "recency": "Send a re-engagement campaign — this customer hasn't ordered recently",
        "engagement": "Try a different channel or personalized message — low campaign engagement",
        "spend": "Offer an exclusive discount to increase spend",
        "frequency": "Create a loyalty incentive to increase purchase frequency",
    }
    return actions.get(weakest, "Review customer profile for re-engagement opportunities")


async def compute_health_score(
    db: AsyncSession,
    customer_id: int,
    tenant_id: int,
) -> CustomerHealth:
    """Compute a fresh health score for the customer.

    Scoring algorithm:
    - Recency (35%): Linear decay from 100 (0 days) to 0 (90+ days since last order)
    - Engagement (30%): Combined open + click rates across all campaign messages
    - Spend (20%): Customer spend vs tenant average
    - Frequency (15%): Order count / expected (1 per 30 days since first order)
    """

    # ── 1. Recency Score ─────────────────────────────────────────────────
    last_order_result = await db.execute(
        select(sqlfunc.max(Order.order_date))
        .where(Order.customer_id == customer_id, Order.tenant_id == tenant_id)
    )
    last_order_date = last_order_result.scalar_one_or_none()

    if last_order_date is not None:
        if isinstance(last_order_date, datetime.datetime):
            last_order_date = last_order_date.date()
        days_since = (datetime.date.today() - last_order_date).days
        recency_score = max(0, int(100 - (days_since * 100 / 90)))
    else:
        recency_score = 0  # No orders at all

    # ── 2. Engagement Score ──────────────────────────────────────────────
    # Count campaign messages sent to this customer and their delivery statuses
    msg_ids_subq = (
        select(CampaignMessage.id)
        .where(CampaignMessage.customer_id == customer_id, CampaignMessage.tenant_id == tenant_id)
        .scalar_subquery()
    )
    engagement_result = await db.execute(
        select(
            sqlfunc.count().label("total"),
            sqlfunc.count(case((DeliveryEvent.status.in_(["opened", "read"]), 1))).label("opened"),
            sqlfunc.count(case((DeliveryEvent.status == "clicked", 1))).label("clicked"),
        ).where(DeliveryEvent.campaign_message_id.in_(msg_ids_subq))
    )
    eng_row = engagement_result.one()
    total_events = eng_row.total or 1  # avoid division by zero
    open_rate = min(1.0, (eng_row.opened or 0) / total_events)
    click_rate = min(1.0, (eng_row.clicked or 0) / total_events)
    engagement_score = int((open_rate * 50 + click_rate * 50))

    # ── 3. Spend Score ───────────────────────────────────────────────────
    # Customer total spend vs tenant average
    customer_spend_result = await db.execute(
        select(sqlfunc.coalesce(sqlfunc.sum(Order.total_amount), 0))
        .where(Order.customer_id == customer_id, Order.tenant_id == tenant_id)
    )
    customer_spend = float(customer_spend_result.scalar_one())

    avg_spend_result = await db.execute(
        select(sqlfunc.coalesce(sqlfunc.avg(
            select(sqlfunc.sum(Order.total_amount))
            .where(Order.tenant_id == tenant_id)
            .group_by(Order.customer_id)
            .correlate(None)
            .scalar_subquery()
        ), 1))
    )
    avg_spend = float(avg_spend_result.scalar_one()) or 1.0
    spend_score = min(100, int((customer_spend / avg_spend) * 50))

    # ── 4. Frequency Score ───────────────────────────────────────────────
    order_count_result = await db.execute(
        select(sqlfunc.count())
        .select_from(Order)
        .where(Order.customer_id == customer_id, Order.tenant_id == tenant_id)
    )
    order_count = order_count_result.scalar_one() or 0

    # Get customer age in days
    customer_result = await db.execute(
        select(Customer.created_at).where(Customer.id == customer_id)
    )
    created_at = customer_result.scalar_one_or_none()
    if created_at:
        if isinstance(created_at, datetime.datetime):
            customer_age_days = (datetime.datetime.now(datetime.timezone.utc) - created_at).days
        else:
            customer_age_days = (datetime.date.today() - created_at).days
    else:
        customer_age_days = 30  # fallback

    expected_orders = max(1, customer_age_days / 30)
    frequency_score = min(100, int((order_count / expected_orders) * 100))

    # ── Composite Score ──────────────────────────────────────────────────
    composite = int(
        recency_score * W_RECENCY
        + engagement_score * W_ENGAGEMENT
        + spend_score * W_SPEND
        + frequency_score * W_FREQUENCY
    )
    composite = max(0, min(100, composite))

    zone = _zone_for_score(composite)

    # Determine weakest signal for recommendation
    signals = {
        "recency": recency_score,
        "engagement": engagement_score,
        "spend": spend_score,
        "frequency": frequency_score,
    }
    weakest = min(signals, key=signals.get)  # type: ignore[arg-type]
    action = _recommended_action(zone, weakest)

    # ── Upsert ───────────────────────────────────────────────────────────
    result = await db.execute(
        select(CustomerHealth).where(CustomerHealth.customer_id == customer_id)
    )
    health = result.scalar_one_or_none()

    if health is None:
        health = CustomerHealth(
            tenant_id=tenant_id,
            customer_id=customer_id,
        )
        db.add(health)

    health.score = composite
    health.recency_score = recency_score
    health.engagement_score = engagement_score
    health.spend_score = spend_score
    health.frequency_score = frequency_score
    health.zone = zone
    health.recommended_action = action
    health.computed_at = datetime.datetime.now(datetime.timezone.utc)

    await db.flush()
    return health


async def get_or_recompute(
    db: AsyncSession,
    customer_id: int,
    tenant_id: int,
) -> CustomerHealth:
    """Return cached health score, recomputing if >24h stale or missing."""
    result = await db.execute(
        select(CustomerHealth).where(CustomerHealth.customer_id == customer_id)
    )
    health = result.scalar_one_or_none()

    if health is not None:
        age = datetime.datetime.now(datetime.timezone.utc) - health.computed_at.replace(
            tzinfo=datetime.timezone.utc
        )
        if age.total_seconds() < STALENESS_HOURS * 3600:
            return health

    # Recompute
    return await compute_health_score(db, customer_id, tenant_id)


async def get_churn_alerts(
    db: AsyncSession,
    tenant_id: int,
    limit: int = 20,
    offset: int = 0,
) -> dict:
    """Return at-risk and churning customers for the tenant."""
    # Count by zone
    count_result = await db.execute(
        select(
            sqlfunc.count(case((CustomerHealth.zone == "at_risk", 1))).label("at_risk"),
            sqlfunc.count(case((CustomerHealth.zone == "churning", 1))).label("churning"),
        ).where(CustomerHealth.tenant_id == tenant_id)
    )
    counts = count_result.one()

    # Get alert details
    alerts_result = await db.execute(
        select(CustomerHealth, Customer)
        .join(Customer, Customer.id == CustomerHealth.customer_id)
        .where(
            CustomerHealth.tenant_id == tenant_id,
            CustomerHealth.zone.in_(["at_risk", "churning"]),
        )
        .order_by(CustomerHealth.score.asc())
        .limit(limit)
        .offset(offset)
    )
    rows = alerts_result.all()

    alerts = []
    for health, customer in rows:
        alerts.append({
            "id": customer.id,
            "name": customer.name,
            "email": customer.email,
            "membership_tier": getattr(customer, "membership_tier", "None"),
            "health": {
                "score": health.score,
                "zone": health.zone,
                "weakest_signal": _weakest_signal(health),
                "recommended_action": health.recommended_action,
            },
        })

    return {
        "alerts": alerts,
        "total_at_risk": counts.at_risk or 0,
        "total_churning": counts.churning or 0,
    }


def _weakest_signal(health: CustomerHealth) -> str:
    """Determine which signal is weakest for a given health record."""
    signals = {
        "recency": health.recency_score,
        "engagement": health.engagement_score,
        "spend": health.spend_score,
        "frequency": health.frequency_score,
    }
    return min(signals, key=signals.get)  # type: ignore[arg-type]
