"""Health router — customer health scores and churn alerts."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.tenant import User
from app.services import health_service

router = APIRouter(prefix="/api/v1/health", tags=["health"])


@router.get("/customer/{customer_id}")
async def get_customer_health(
    customer_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Get health score for a specific customer. Triggers lazy recompute if >24h stale."""
    health = await health_service.get_or_recompute(db, customer_id, current_user.tenant_id)
    await db.commit()

    return {
        "customer_id": customer_id,
        "score": health.score,
        "zone": health.zone,
        "breakdown": {
            "recency": {
                "score": health.recency_score,
                "weight": 35,
                "detail": f"Recency sub-score: {health.recency_score}/100",
            },
            "engagement": {
                "score": health.engagement_score,
                "weight": 30,
                "detail": f"Engagement sub-score: {health.engagement_score}/100",
            },
            "spend": {
                "score": health.spend_score,
                "weight": 20,
                "detail": f"Spend sub-score: {health.spend_score}/100",
            },
            "frequency": {
                "score": health.frequency_score,
                "weight": 15,
                "detail": f"Frequency sub-score: {health.frequency_score}/100",
            },
        },
        "recommended_action": health.recommended_action,
        "computed_at": health.computed_at.isoformat() + "Z" if health.computed_at else "",
    }


@router.get("/alerts")
async def get_churn_alerts(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Get all customers in at_risk or churning zones."""
    return await health_service.get_churn_alerts(
        db, current_user.tenant_id, limit=limit, offset=offset
    )
