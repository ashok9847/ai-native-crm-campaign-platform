"""Audience Router — Audience Workspace API."""

import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.tenant import User
from app.schemas.audiences import (
    AudienceCreate,
    AudienceResponse,
    AudienceListResponse,
    AudiencePreviewRequest,
    AudiencePreviewResponse
)
from app.services import audience_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/audiences", tags=["audiences"])

@router.get(
    "",
    response_model=AudienceListResponse,
    summary="List saved customer audiences.",
)
async def list_audiences(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AudienceListResponse:
    """Retrieve saved audiences for the active tenant."""
    items = await audience_service.list_audiences(db, current_user.tenant_id)
    return AudienceListResponse(total=len(items), items=items)

@router.post(
    "",
    response_model=AudienceResponse,
    status_code=201,
    summary="Create a new reusable audience segment.",
)
async def create_audience(
    body: AudienceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AudienceResponse:
    """Evaluate segment criteria and save a reusable audience for future campaigns."""
    try:
        return await audience_service.create_audience(body, db, current_user.tenant_id)
    except Exception as exc:
        logger.error("Failed to create audience: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create audience: {str(exc)}"
        )

@router.post(
    "/preview",
    response_model=AudiencePreviewResponse,
    summary="Evaluate criteria and estimate audience size before saving.",
)
async def preview_audience(
    body: AudiencePreviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AudiencePreviewResponse:
    """Returns matching customer count and sample customer names/emails."""
    try:
        return await audience_service.preview_audience(body, db, current_user.tenant_id)
    except Exception as exc:
        logger.error("Failed to preview audience: %s", exc)
        raise HTTPException(
            status_code=422,
            detail=f"Invalid segment criteria: {str(exc)}"
        )
