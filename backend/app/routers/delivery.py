"""Delivery router — callback receipt endpoint (T052).

Routes:
  POST /api/v1/campaigns/callback  — channel service → CRM event receipt
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.schemas.delivery import CallbackEvent, CallbackResponse
from app.services import delivery_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["delivery"])


@router.post(
    "/campaigns/callback",
    response_model=CallbackResponse,
    summary="Receive delivery event callback from channel service",
)
async def receive_callback(
    event: CallbackEvent,
    x_channel_secret: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> CallbackResponse:
    """Idempotent delivery event receipt.

    - Validates `X-Channel-Secret` header → 401 if missing/wrong.
    - Inserts event via ON CONFLICT DO NOTHING → duplicate = 200 but no new row.
    - Checks campaign completion after each new event.
    """
    # Temporarily bypass RLS on all shared tables to allow callback mapping
    await db.execute(text("SELECT set_config('app.bypass_rls', 'true', true)"))

    settings = get_settings()

    # ── Secret validation ─────────────────────────────────────────────────────
    if x_channel_secret != settings.channel_webhook_secret:
        logger.warning(
            "Invalid webhook secret received for event_id=%s", event.event_id
        )
        raise HTTPException(
            status_code=401,
            detail={"detail": "Invalid webhook secret.", "code": "INVALID_WEBHOOK_SECRET"},
        )

    # ── Idempotent insert ─────────────────────────────────────────────────────
    is_new = await delivery_service.record_delivery_event(event=event, db=db)

    # ── Completion check (only for new events — skip duplicates) ─────────────
    if is_new:
        await delivery_service.check_campaign_completion(
            campaign_id=event.campaign_id, db=db
        )

    return CallbackResponse(received=True, event_id=event.event_id)


@router.get(
    "/delivery/dead-letter",
    summary="Proxy dead-letter queue list from channel service",
)
async def get_dead_letter_proxy(
    settings = Depends(get_settings),
) -> dict:
    """Proxy permanently failed callback events from the channel service for display in the dashboard."""
    import httpx
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{settings.channel_service_url}/delivery/dead-letter")
            if resp.status_code == 200:
                return resp.json()
            else:
                return {"total": 0, "items": [], "error": f"Channel service returned status {resp.status_code}"}
    except Exception as exc:
        logger.error("Failed to proxy dead-letter callbacks: %s", exc)
        return {"total": 0, "items": [], "error": str(exc)}
