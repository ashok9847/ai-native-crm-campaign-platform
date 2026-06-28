"""Tenants router — handles mock seeding, dashboard statistics, and workspace details."""

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.tenant import User
from app.schemas.tenant import DashboardStatsResponse
from app.services.tenant_service import seed_mock_coffee_shop_data, get_dashboard_statistics

router = APIRouter(prefix="/tenants", tags=["tenants"])


@router.post(
    "/seed-mock",
    summary="Seed mock coffee shop workspace data",
)
async def seed_mock_workspace(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Populate the active tenant's workspace with a standard 9 customers / 15 orders coffee shop dataset."""
    result = await seed_mock_coffee_shop_data(db=db, tenant_id=current_user.tenant_id)
    return result


@router.get(
    "/dashboard-stats",
    response_model=DashboardStatsResponse,
    summary="Get aggregated workspace dashboard statistics",
)
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Retrieve workspace metrics (Total Campaigns, Total Customers, and average Open/Click/Conversion rates) aggregated for the active tenant."""
    result = await get_dashboard_statistics(db=db, tenant_id=current_user.tenant_id)
    return result
