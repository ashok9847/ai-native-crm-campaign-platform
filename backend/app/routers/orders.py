"""Orders router — handles CSV upload and order linking."""

from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.tenant import User
from app.services.order_service import import_orders_from_csv

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post(
    "/upload",
    summary="Upload orders CSV and map to customers",
)
async def upload_orders(
    file: UploadFile = File(..., description="CSV file with order rows"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Accept a multipart CSV upload, parse and import order records under the active tenant.

    If an order references an email not present in the customer records, that order is skipped.
    """
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are accepted")

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    try:
        result = await import_orders_from_csv(
            file_bytes=file_bytes,
            db=db,
            tenant_id=current_user.tenant_id
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
