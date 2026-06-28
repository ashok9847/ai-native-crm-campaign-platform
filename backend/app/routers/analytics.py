"""Analytics router — aggregated analytics endpoint."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.tenant import User
from app.services import analytics_service

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])


@router.get("")
async def get_analytics(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return aggregated analytics data for the current tenant."""
    tenant_id = current_user.tenant_id
    kpis = await analytics_service.get_kpis(db, tenant_id)
    revenue = await analytics_service.revenue_over_time(db, tenant_id, days)
    channels = await analytics_service.channel_performance(db, tenant_id)
    top = await analytics_service.top_campaigns(db, tenant_id)
    funnel = await analytics_service.funnel_data(db, tenant_id)

    return {
        "kpis": kpis,
        "revenue_over_time": revenue,
        "channel_performance": channels,
        "top_campaigns": top,
        "funnel": funnel,
    }
