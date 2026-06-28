"""Dashboard router — rich dashboard endpoint with denormalized stats."""

from fastapi import APIRouter, Depends
from sqlalchemy import select, func as sqlfunc, distinct, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.campaign import Campaign, CampaignState
from app.models.campaign_stats import CampaignStats
from app.models.customer import Customer
from app.models.customer_health import CustomerHealth
from app.models.tenant import User
from app.schemas.dashboard import (
    CampaignReachItem,
    ChannelUsedItem,
    CustomerTierItem,
    DashboardMetrics,
    DashboardResponse,
    RecentCampaignItem,
)
from app.services import stats_service

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardResponse)
async def get_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardResponse:
    """Return rich dashboard data for the authenticated tenant."""
    tenant_id = current_user.tenant_id

    # ── KPI Metrics ────────────────────────────────────────────────────────
    # Total customers
    cust_result = await db.execute(
        select(sqlfunc.count()).select_from(Customer).where(Customer.tenant_id == tenant_id)
    )
    total_customers = cust_result.scalar_one() or 0

    # Total orders and revenue
    from app.models.order import Order
    order_result = await db.execute(
        select(
            sqlfunc.count(Order.id).label("cnt"),
            sqlfunc.coalesce(sqlfunc.sum(Order.total_amount), 0).label("revenue")
        ).where(Order.tenant_id == tenant_id)
    )
    order_row = order_result.one()
    total_orders = order_row.cnt or 0
    total_revenue = float(order_row.revenue or 0.0)

    # Campaign stats aggregate
    stats_result = await db.execute(
        select(
            sqlfunc.count().label("campaign_count"),
            sqlfunc.coalesce(sqlfunc.sum(CampaignStats.attributed_revenue), 0).label("total_revenue"),
            sqlfunc.coalesce(sqlfunc.sum(CampaignStats.sent_count), 0).label("total_sent"),
            sqlfunc.coalesce(sqlfunc.sum(CampaignStats.delivered_count), 0).label("total_delivered"),
            sqlfunc.coalesce(sqlfunc.sum(CampaignStats.opened_count), 0).label("total_opened"),
            sqlfunc.coalesce(sqlfunc.sum(CampaignStats.clicked_count), 0).label("total_clicked"),
        ).where(CampaignStats.tenant_id == tenant_id)
    )
    s = stats_result.one()
    total_campaigns = s.campaign_count or 0
    total_sent = s.total_sent or 0
    total_delivered = s.total_delivered or 0
    total_opened = s.total_opened or 0
    total_clicked = s.total_clicked or 0

    avg_delivery = round((total_delivered / total_sent * 100), 1) if total_sent > 0 else 0.0
    avg_open = round((total_opened / total_delivered * 100), 1) if total_delivered > 0 else 0.0
    avg_click = round((total_clicked / total_opened * 100), 1) if total_opened > 0 else 0.0

    attributed_revenue = float(s.total_revenue)
    organic_revenue = max(0.0, total_revenue - attributed_revenue)

    metrics = DashboardMetrics(
        total_customers=total_customers,
        total_orders=total_orders,
        total_campaigns=total_campaigns,
        attributed_revenue=attributed_revenue,
        organic_revenue=organic_revenue,
        avg_delivery_rate=avg_delivery,
        avg_open_rate=avg_open,
        avg_click_rate=avg_click,
    )

    # ── Campaign Reach (top 5 recent campaigns) ───────────────────────────
    reach_result = await db.execute(
        select(Campaign.name, CampaignStats.sent_count, CampaignStats.delivered_count, CampaignStats.purchased_count)
        .join(CampaignStats, CampaignStats.campaign_id == Campaign.id)
        .where(Campaign.tenant_id == tenant_id)
        .order_by(desc(Campaign.created_at))
        .limit(5)
    )
    campaign_reach = [
        CampaignReachItem(name=r.name, sent=r.sent_count, delivered=r.delivered_count, converted=r.purchased_count)
        for r in reach_result.all()
    ]

    # ── Channel Distribution ──────────────────────────────────────────────
    channel_result = await db.execute(
        select(Campaign.channel, sqlfunc.count().label("cnt"))
        .where(Campaign.tenant_id == tenant_id)
        .group_by(Campaign.channel)
    )
    channels_used = [
        ChannelUsedItem(name=r.channel, count=r.cnt)
        for r in channel_result.all()
    ]

    # ── Customer Tiers ────────────────────────────────────────────────────
    tier_result = await db.execute(
        select(Customer.subscription_tier, sqlfunc.count().label("cnt"))
        .where(Customer.tenant_id == tenant_id)
        .group_by(Customer.subscription_tier)
    )
    customer_tiers = [
        CustomerTierItem(name=r.subscription_tier or "Unknown", value=r.cnt)
        for r in tier_result.all()
    ]

    # ── Recent Campaigns ──────────────────────────────────────────────────
    recent_result = await db.execute(
        select(Campaign, CampaignStats)
        .outerjoin(CampaignStats, CampaignStats.campaign_id == Campaign.id)
        .where(Campaign.tenant_id == tenant_id)
        .order_by(desc(Campaign.created_at))
        .limit(5)
    )
    recent_campaigns = []
    for camp, stats in recent_result.all():
        recent_campaigns.append(
            RecentCampaignItem(
                id=camp.id,
                name=camp.name,
                channel=camp.channel if hasattr(camp, "channel") else "sms",
                state=camp.state,
                reach=stats.sent_count if stats else 0,
                revenue=float(stats.attributed_revenue) if stats else 0.0,
                created_at=camp.created_at.isoformat() + "Z" if camp.created_at else "",
            )
        )

    # ── Churn Alert Count ─────────────────────────────────────────────────
    churn_result = await db.execute(
        select(sqlfunc.count())
        .select_from(CustomerHealth)
        .where(
            CustomerHealth.tenant_id == tenant_id,
            CustomerHealth.zone.in_(["at_risk", "churning"]),
        )
    )
    churn_alert_count = churn_result.scalar_one() or 0

    return DashboardResponse(
        metrics=metrics,
        campaign_reach=campaign_reach,
        channels_used=channels_used,
        customer_tiers=customer_tiers,
        recent_campaigns=recent_campaigns,
        churn_alert_count=churn_alert_count,
    )


@router.post("/stats/reconcile/{campaign_id}")
async def reconcile_stats(
    campaign_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Recalculate campaign stats from raw delivery events."""
    result = await stats_service.reconcile(db, campaign_id, current_user.tenant_id)
    await db.commit()
    return result
