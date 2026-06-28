"""Audience service — handles CRUD and preview calculations for reusable segments."""

import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audience import Audience
from app.models.customer import Customer
from app.schemas.audiences import AudienceCreate, AudienceResponse, AudiencePreviewRequest, AudiencePreviewResponse, CustomerSummarySchema
from app.schemas.campaign import FilterCriterion
from app.services import segment_service

logger = logging.getLogger(__name__)

async def list_audiences(db: AsyncSession, tenant_id: int) -> list[Audience]:
    """Retrieve saved audiences scoped to the active tenant."""
    result = await db.execute(
        select(Audience).where(Audience.tenant_id == tenant_id).order_by(Audience.id.desc())
    )
    return list(result.scalars().all())

async def create_audience(body: AudienceCreate, db: AsyncSession, tenant_id: int) -> Audience:
    """Evaluate segment criteria, create, and save a reusable Audience."""
    # Convert FilterRules to FilterCriterion
    filters = [FilterCriterion(field=r.field, operator=r.operator, value=r.value) for r in body.filter_criteria]
    
    # Calculate reach
    count, _ = await segment_service.execute_segment_filters(filters, db, tenant_id)
    
    # Map back to dict array for JSONB storage
    raw_criteria = [{"field": r.field, "operator": r.operator, "value": r.value} for r in body.filter_criteria]
    
    audience = Audience(
        tenant_id=tenant_id,
        name=body.name,
        description=body.description,
        filter_criteria=raw_criteria,
        customer_count=count
    )
    db.add(audience)
    await db.commit()
    await db.refresh(audience)
    return audience

async def preview_audience(body: AudiencePreviewRequest, db: AsyncSession, tenant_id: int) -> AudiencePreviewResponse:
    """Evaluate segment criteria and return match count and sample customer list without saving."""
    filters = [FilterCriterion(field=r.field, operator=r.operator, value=r.value) for r in body.filter_criteria]
    
    # Run filters
    count, customer_ids = await segment_service.execute_segment_filters(filters, db, tenant_id)
    
    # Fetch first 5 matching customer records for preview
    sample_ids = customer_ids[:5]
    sample_customers = []
    
    if sample_ids:
        res = await db.execute(
            select(Customer.id, Customer.name, Customer.email).where(
                Customer.tenant_id == tenant_id,
                Customer.id.in_(sample_ids)
            )
        )
        for cid, name, email in res.all():
            sample_customers.append(
                CustomerSummarySchema(id=cid, name=name, email=email)
            )
            
    return AudiencePreviewResponse(
        customer_count=count,
        sample_customers=sample_customers
    )
