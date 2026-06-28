"""Communications router — paginated feed and SSE stream."""

import asyncio
import datetime
import json
import logging

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func as sqlfunc, desc, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.campaign import Campaign
from app.models.delivery import DeliveryEvent
from app.models.message import CampaignMessage
from app.models.customer import Customer
from app.models.tenant import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/communications", tags=["communications"])


@router.get("")
async def list_communications(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    status: str | None = None,
    campaign_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return paginated list of all campaign messages with latest delivery status."""
    tenant_id = current_user.tenant_id

    # Build latest status subquery using DISTINCT ON
    latest_status_sql = text("""
        SELECT DISTINCT ON (de.campaign_message_id)
            de.campaign_message_id,
            de.status,
            de.received_at
        FROM delivery_events de
        ORDER BY de.campaign_message_id,
                 CASE de.status
                     WHEN 'purchased' THEN 6
                     WHEN 'clicked' THEN 5
                     WHEN 'read' THEN 4
                     WHEN 'opened' THEN 3
                     WHEN 'delivered' THEN 2
                     ELSE 1
                 END DESC,
                 de.received_at DESC
    """)

    # Get total count
    count_query = (
        select(sqlfunc.count())
        .select_from(CampaignMessage)
        .where(CampaignMessage.tenant_id == tenant_id)
    )
    if campaign_id:
        count_query = count_query.where(CampaignMessage.campaign_id == campaign_id)
    total_result = await db.execute(count_query)
    total = total_result.scalar_one() or 0

    # Get paginated messages with joined data
    query = (
        select(CampaignMessage, Customer, Campaign)
        .join(Customer, Customer.id == CampaignMessage.customer_id)
        .join(Campaign, Campaign.id == CampaignMessage.campaign_id)
        .where(CampaignMessage.tenant_id == tenant_id)
    )
    if campaign_id:
        query = query.where(CampaignMessage.campaign_id == campaign_id)
    query = query.order_by(desc(CampaignMessage.created_at)).offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    rows = result.all()

    # Fetch latest status for these messages
    msg_ids = [r.CampaignMessage.id for r in rows]
    status_map: dict[int, tuple[str, datetime.datetime | None]] = {}
    if msg_ids:
        status_result = await db.execute(
            text("""
                SELECT DISTINCT ON (de.campaign_message_id)
                    de.campaign_message_id,
                    de.status,
                    de.received_at
                FROM delivery_events de
                WHERE de.campaign_message_id = ANY(:ids)
                ORDER BY de.campaign_message_id,
                         CASE de.status
                             WHEN 'purchased' THEN 6
                             WHEN 'clicked' THEN 5
                             WHEN 'read' THEN 4
                             WHEN 'opened' THEN 3
                             WHEN 'delivered' THEN 2
                             ELSE 1
                         END DESC,
                         de.received_at DESC
            """),
            {"ids": msg_ids},
        )
        for sr in status_result.mappings().all():
            status_map[sr["campaign_message_id"]] = (sr["status"], sr["received_at"])

    items = []
    for r in rows:
        msg = r.CampaignMessage
        cust = r.Customer
        camp = r.Campaign
        s, delivered_at = status_map.get(msg.id, ("pending", None))

        # Filter by status if requested
        if status and s != status:
            continue

        items.append({
            "id": msg.id,
            "customer_name": cust.name,
            "customer_id": cust.id,
            "campaign_name": camp.name,
            "campaign_id": camp.id,
            "campaign_state": camp.state,  # also include state to help with frontend link routing!
            "channel": camp.channel if hasattr(camp, "channel") else "sms",
            "body": msg.effective_body[:100] + "..." if len(msg.effective_body) > 100 else msg.effective_body,
            "status": s,
            "queued_at": msg.created_at.isoformat() + "Z" if msg.created_at else "",
            "delivered_at": delivered_at.isoformat() + "Z" if delivered_at else None,
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/stream")
async def communications_stream(
    request: Request,
    token: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """SSE endpoint for real-time communications feed updates.

    Polls for new delivery events every 2 seconds and sends status updates.
    """
    async def event_generator():
        last_check = datetime.datetime.utcnow()
        while True:
            if await request.is_disconnected():
                break

            # Poll for new delivery events
            result = await db.execute(
                select(DeliveryEvent, CampaignMessage)
                .join(CampaignMessage, CampaignMessage.id == DeliveryEvent.campaign_message_id)
                .where(DeliveryEvent.received_at > last_check)
                .order_by(DeliveryEvent.received_at.asc())
                .limit(50)
            )
            rows = result.all()

            for event, msg in rows:
                data = json.dumps({
                    "message_id": msg.id,
                    "status": event.status,
                    "timestamp": event.received_at.isoformat() + "Z" if event.received_at else "",
                })
                yield f"event: status_update\ndata: {data}\n\n"
                last_check = max(last_check, event.received_at)

            if not rows:
                yield ": heartbeat\n\n"

            await asyncio.sleep(2)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
