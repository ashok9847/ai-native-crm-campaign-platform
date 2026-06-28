"""Analytics service — aggregated analytics queries using stats tables and raw data."""

import datetime

from sqlalchemy import select, func as sqlfunc, desc, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.campaign import Campaign
from app.models.campaign_stats import CampaignStats
from app.models.order import Order


async def get_kpis(db: AsyncSession, tenant_id: int) -> dict:
    """Return top-level KPI metrics."""
    rev_result = await db.execute(
        select(
            sqlfunc.coalesce(sqlfunc.sum(Order.total_amount), 0).label("total_revenue"),
            sqlfunc.count().label("total_orders"),
        ).where(Order.tenant_id == tenant_id)
    )
    row = rev_result.one()
    total_revenue = float(row.total_revenue)
    total_orders = row.total_orders or 0
    aov = round(total_revenue / total_orders, 2) if total_orders > 0 else 0.0

    # Global conversion rate and attributed revenue from stats
    stats_result = await db.execute(
        select(
            sqlfunc.coalesce(sqlfunc.sum(CampaignStats.sent_count), 0).label("sent"),
            sqlfunc.coalesce(sqlfunc.sum(CampaignStats.purchased_count), 0).label("purchased"),
            sqlfunc.coalesce(sqlfunc.sum(CampaignStats.attributed_revenue), 0).label("attributed_revenue"),
        ).where(CampaignStats.tenant_id == tenant_id)
    )
    s = stats_result.one()
    conversion = round((s.purchased / s.sent * 100), 1) if s.sent > 0 else 0.0

    attributed_revenue = float(s.attributed_revenue)
    organic_revenue = max(0.0, total_revenue - attributed_revenue)

    return {
        "total_revenue": total_revenue,
        "total_orders": total_orders,
        "aov": aov,
        "global_conversion_rate": conversion,
        "attributed_revenue": attributed_revenue,
        "organic_revenue": organic_revenue,
    }


async def revenue_over_time(db: AsyncSession, tenant_id: int, days: int = 30) -> list[dict]:
    """Return daily revenue for the past N days."""
    cutoff = datetime.date.today() - datetime.timedelta(days=days)
    result = await db.execute(
        select(
            Order.order_date,
            sqlfunc.sum(Order.total_amount).label("revenue"),
        )
        .where(Order.tenant_id == tenant_id, Order.order_date >= cutoff)
        .group_by(Order.order_date)
        .order_by(Order.order_date)
    )
    return [
        {"date": str(r.order_date), "revenue": float(r.revenue)}
        for r in result.all()
    ]


async def channel_performance(db: AsyncSession, tenant_id: int) -> list[dict]:
    """Return per-channel aggregated performance metrics."""
    result = await db.execute(
        select(
            Campaign.channel,
            sqlfunc.sum(CampaignStats.sent_count).label("sent"),
            sqlfunc.sum(CampaignStats.delivered_count).label("delivered"),
            sqlfunc.sum(CampaignStats.opened_count).label("opened"),
            sqlfunc.sum(CampaignStats.clicked_count).label("clicked"),
            sqlfunc.sum(CampaignStats.purchased_count).label("converted"),
            sqlfunc.sum(CampaignStats.attributed_revenue).label("revenue"),
        )
        .join(CampaignStats, CampaignStats.campaign_id == Campaign.id)
        .where(Campaign.tenant_id == tenant_id)
        .group_by(Campaign.channel)
    )
    return [
        {
            "name": r.channel,
            "sent": r.sent or 0,
            "delivered": r.delivered or 0,
            "opened": r.opened or 0,
            "clicked": r.clicked or 0,
            "converted": r.converted or 0,
            "revenue": float(r.revenue or 0),
            "conversion_rate": round((r.converted / r.sent * 100), 1) if r.sent and r.sent > 0 else 0.0,
        }
        for r in result.all()
    ]


async def top_campaigns(db: AsyncSession, tenant_id: int, limit: int = 10) -> list[dict]:
    """Return top campaigns ranked by revenue."""
    result = await db.execute(
        select(Campaign.id, Campaign.name, Campaign.channel, CampaignStats)
        .join(CampaignStats, CampaignStats.campaign_id == Campaign.id)
        .where(Campaign.tenant_id == tenant_id)
        .order_by(desc(CampaignStats.attributed_revenue))
        .limit(limit)
    )
    return [
        {
            "id": r.id,
            "name": r.name,
            "channel": r.channel,
            "target": r[3].sent_count,
            "converted": r[3].purchased_count,
            "revenue": float(r[3].attributed_revenue),
        }
        for r in result.all()
    ]


async def funnel_data(db: AsyncSession, tenant_id: int) -> list[dict]:
    """Return aggregate funnel stages across all campaigns."""
    result = await db.execute(
        select(
            sqlfunc.coalesce(sqlfunc.sum(CampaignStats.sent_count), 0).label("sent"),
            sqlfunc.coalesce(sqlfunc.sum(CampaignStats.delivered_count), 0).label("delivered"),
            sqlfunc.coalesce(sqlfunc.sum(CampaignStats.opened_count), 0).label("opened"),
            sqlfunc.coalesce(sqlfunc.sum(CampaignStats.clicked_count), 0).label("clicked"),
            sqlfunc.coalesce(sqlfunc.sum(CampaignStats.purchased_count), 0).label("purchased"),
        ).where(CampaignStats.tenant_id == tenant_id)
    )
    row = result.one()
    return [
        {"name": "Sent", "value": row.sent or 0},
        {"name": "Delivered", "value": row.delivered or 0},
        {"name": "Opened", "value": row.opened or 0},
        {"name": "Clicked", "value": row.clicked or 0},
        {"name": "Converted", "value": row.purchased or 0},
    ]
