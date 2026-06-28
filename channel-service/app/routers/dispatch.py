"""Channel service dispatch router — T055.

Routes:
  POST /api/v1/dispatch  — CRM → channel service; immediate 202 + async simulation
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, Request
from pydantic import BaseModel

from app.services.simulation_service import simulate_delivery

import json
from app.core.db import get_db_connection

logger = logging.getLogger(__name__)

router = APIRouter(tags=["dispatch"])


class RecipientInfo(BaseModel):
    customer_id: int
    name: str
    email: str


class DispatchRequest(BaseModel):
    dispatch_id: str
    campaign_id: int
    message_id: int
    recipient: RecipientInfo
    message_body: str
    channel: str = "email"
    callback_url: str


@router.post(
    "/dispatch",
    status_code=202,
    summary="Accept a dispatch request and simulate async delivery",
)
async def dispatch(
    request: Request,
    body: DispatchRequest,
    background_tasks: BackgroundTasks,
) -> dict:
    """Accept dispatch immediately (202) and fire simulation as a background task.

    The simulation calls back to the CRM's callback URL asynchronously for each
    delivery event (sent → delivered → opened → clicked) with configurable drop-off.

    Settings are passed from app.state to avoid Depends(get_settings) threading issues.
    """
    settings = request.app.state.settings

    logger.info(
        "Dispatch accepted: dispatch_id=%s campaign_id=%s message_id=%s recipient=%s",
        body.dispatch_id,
        body.campaign_id,
        body.message_id,
        body.recipient.name,
    )

    # Register the simulation coroutine as a fire-and-forget background task
    background_tasks.add_task(simulate_delivery, body.model_dump(), settings)

    return {"accepted": True, "dispatch_id": body.dispatch_id}


@router.get(
    "/delivery/dead-letter",
    summary="List permanently failed delivery events for system debugging",
)
async def get_dead_letter() -> dict:
    """Retrieve all callback deliveries that failed 3 retries and were dead-lettered."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, callback_url, event_payload, failed_at, reason FROM dead_letter_callbacks ORDER BY failed_at DESC")
    rows = cursor.fetchall()
    conn.close()
    
    items = []
    for row in rows:
        items.append({
            "id": row["id"],
            "callback_url": row["callback_url"],
            "event_payload": json.loads(row["event_payload"]),
            "failed_at": row["failed_at"],
            "reason": row["reason"]
        })
        
    return {"total": len(items), "items": items}
