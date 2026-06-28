"""Customers router — seed, CSV import, paginated list."""

import logging

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.tenant import User
from app.schemas.customer import (
    CustomerListResponse,
    ImportResult,
    SeedResult,
    OrderResponse,
    CRMFieldResponse,
)
from app.services import customer_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/customers", tags=["customers"])


@router.post(
    "/seed",
    response_model=SeedResult,
    summary="Pre-load 42 BrewMate demo customers",
)
async def seed_customers(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SeedResult:
    """Idempotent seed endpoint — safe to call multiple times.

    Inserts the 42 hardcoded BrewMate customers using ON CONFLICT DO NOTHING,
    so repeated calls return increasing ``skipped`` counts without error.
    """
    return await customer_service.seed_customers(db, tenant_id=current_user.tenant_id)


@router.post(
    "/import",
    response_model=ImportResult,
    summary="Bulk-import customers from a CSV file",
)
async def import_customers(
    file: UploadFile = File(..., description="CSV file with customer rows"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ImportResult:
    """Accept a multipart CSV upload and import valid rows.

    Invalid rows (bad tier, negative LTV, etc.) are collected in ``errors``
    and returned to the caller — the import never aborts on partial failures.
    """
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are accepted")

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    return await customer_service.import_customers_from_csv(file_bytes, db, tenant_id=current_user.tenant_id)


@router.post(
    "/upload",
    summary="Upload customer CSV and infer schemas automatically",
)
async def upload_customers(
    file: UploadFile = File(..., description="CSV file with customer rows"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Accept a multipart CSV upload, import rows and dynamically infer unmapped fields via LLM."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are accepted")

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    result = await customer_service.import_customers_from_csv(file_bytes, db, tenant_id=current_user.tenant_id)
    return {
        "status": "success",
        "records_imported": result.imported,
        "new_fields_inferred": result.new_fields_inferred
    }


@router.get(
    "",
    response_model=CustomerListResponse,
    summary="List all customers (paginated)",
)
async def list_customers(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CustomerListResponse:
    """Return a paginated list of all customers ordered by id."""
    return await customer_service.list_customers(db, tenant_id=current_user.tenant_id, page=page, page_size=page_size)


@router.get(
    "/crm-fields",
    response_model=list[CRMFieldResponse],
    summary="Get all custom CRM fields for the tenant",
)
async def list_tenant_crm_fields(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CRMFieldResponse]:
    """Retrieve all dynamically inferred custom fields for the active tenant."""
    return await customer_service.list_crm_fields(db, tenant_id=current_user.tenant_id)


@router.get(
    "/{customer_id}/orders",
    response_model=list[OrderResponse],
    summary="Get customer's order history",
)
async def list_customer_orders(
    customer_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[OrderResponse]:
    """Retrieve all order records associated with the customer, sorted by date descending."""
    return await customer_service.list_customer_orders(customer_id, db, tenant_id=current_user.tenant_id)


@router.get(
    "/{customer_id}/profile",
    summary="Full customer profile with orders, communications, and health score",
)
async def get_customer_profile(
    customer_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return comprehensive customer profile for the profile page."""
    from sqlalchemy import select, desc
    from app.models.customer import Customer
    from app.models.order import Order
    from app.models.message import CampaignMessage
    from app.models.campaign import Campaign
    from app.models.delivery import DeliveryEvent
    from app.services import health_service

    tenant_id = current_user.tenant_id

    # Customer details
    cust_result = await db.execute(
        select(Customer).where(Customer.id == customer_id, Customer.tenant_id == tenant_id)
    )
    customer = cust_result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # Orders
    orders_result = await db.execute(
        select(Order)
        .where(Order.customer_id == customer_id, Order.tenant_id == tenant_id)
        .order_by(desc(Order.order_date))
    )
    orders = [
        {
            "id": o.id,
            "order_date": str(o.order_date),
            "total_amount": float(o.total_amount),
            "items": o.items,
            "communication_id": o.communication_id,
        }
        for o in orders_result.scalars().all()
    ]

    # Communications — messages sent to this customer
    comms_result = await db.execute(
        select(CampaignMessage, Campaign)
        .join(Campaign, Campaign.id == CampaignMessage.campaign_id)
        .where(CampaignMessage.customer_id == customer_id, CampaignMessage.tenant_id == tenant_id)
        .order_by(desc(CampaignMessage.created_at))
    )
    communications = []
    for msg, camp in comms_result.all():
        # Get latest status
        status_result = await db.execute(
            select(DeliveryEvent.status)
            .where(DeliveryEvent.campaign_message_id == msg.id)
            .order_by(desc(DeliveryEvent.received_at))
            .limit(1)
        )
        latest_status = status_result.scalar_one_or_none() or "pending"
        communications.append({
            "id": msg.id,
            "campaign_id": camp.id,
            "campaign_name": camp.name,
            "channel": camp.channel if hasattr(camp, "channel") else "sms",
            "body": msg.effective_body,
            "status": latest_status,
            "queued_at": msg.created_at.isoformat() + "Z" if msg.created_at else "",
        })

    # Health score (lazy recompute)
    try:
        health = await health_service.get_or_recompute(db, customer_id, tenant_id)
        health_data = {
            "customer_id": customer_id,
            "score": health.score,
            "zone": health.zone,
            "breakdown": {
                "recency": {"score": health.recency_score, "weight": 35, "detail": ""},
                "engagement": {"score": health.engagement_score, "weight": 30, "detail": ""},
                "spend": {"score": health.spend_score, "weight": 20, "detail": ""},
                "frequency": {"score": health.frequency_score, "weight": 15, "detail": ""},
            },
            "recommended_action": health.recommended_action,
            "computed_at": health.computed_at.isoformat() + "Z" if health.computed_at else "",
        }
    except Exception:
        health_data = None

    await db.commit()

    return {
        "customer": {
            "id": customer.id,
            "name": customer.name,
            "email": customer.email,
            "subscription_tier": customer.subscription_tier,
            "roast_preference": getattr(customer, "roast_preference", ""),
            "last_order_date": str(customer.last_order_date) if customer.last_order_date else None,
            "lifetime_value": float(customer.lifetime_value) if customer.lifetime_value else 0,
            "city": getattr(customer, "city", ""),
            "metadata": customer.metadata if hasattr(customer, "metadata") else {},
        },
        "orders": orders,
        "communications": communications,
        "health": health_data,
    }
