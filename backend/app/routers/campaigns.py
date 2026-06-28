"""Campaigns router — full campaign lifecycle API.

Routes:
  POST   /api/v1/campaigns                              → create campaign (US2+US3)
  GET    /api/v1/campaigns                              → list campaigns (US8)
  GET    /api/v1/campaigns/{campaign_id}                → campaign detail (US3)
  PATCH  /api/v1/campaigns/{campaign_id}/messages/{id} → edit message (US3)
  POST   /api/v1/campaigns/{campaign_id}/launch         → launch campaign (US4)
  GET    /api/v1/campaigns/{campaign_id}/stream         → SSE live tracker (US6)
  GET    /api/v1/campaigns/{campaign_id}/results        → results + insight (US7)

Note: POST /api/v1/campaigns/callback is handled by app/routers/delivery.py
"""

from __future__ import annotations

import asyncio
import datetime
import json
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    SSE_HEARTBEAT_INTERVAL_SECONDS,
    SSE_POLL_INTERVAL_SECONDS,
)
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.tenant import User
from app.schemas.campaign import (
    CampaignDetailResponse,
    CampaignListResponse,
    CampaignResponse,
    CampaignResultsResponse,
    CreateCampaignRequest,
    MessagePreview,
    CampaignUpdateRequest,
)
from app.schemas.message import EditMessageRequest
from app.services import campaign_service
from app.services import delivery_service
from app.services import message_service
from app.services.ai_service import AIUnavailableError
from app.models.campaign import Campaign, CampaignState
from sqlalchemy import select

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


@router.post(
    "",
    response_model=CampaignDetailResponse,
    status_code=201,
    summary="Create campaign: intent → segment → messages (DRAFT→REVIEWING)",
)
async def create_campaign(
    body: CreateCampaignRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CampaignDetailResponse:
    """Full synchronous pipeline: AI extracts segment, AI generates messages.

    Returns CampaignDetailResponse in REVIEWING state with messages populated.
    - 503 if the AI service is unavailable after retries.
    - When body.customer_ids is provided, AI segmentation is bypassed and those
      exact customers are used (follow-up campaign targeting previous clickers).
    """
    try:
        return await campaign_service.create_campaign(
            intent=body.intent,
            name=body.name,
            db=db,
            customer_ids=body.customer_ids or None,
            tenant_id=current_user.tenant_id,
            channel=body.channel,
            scheduled_at=body.scheduled_at,
            campaign_id=body.campaign_id,
            clarification=body.clarification,
        )
    except AIUnavailableError as exc:
        logger.error("AI unavailable during campaign creation: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="AI is temporarily unavailable — please retry in a moment.",
        ) from exc


@router.post(
    "/stream",
    summary="Create campaign stream: intent → segment → messages token-by-token (DRAFT→REVIEWING)",
)
async def create_campaign_stream(
    body: CreateCampaignRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """Streams the campaign creation steps and generated message tokens.

    Returns a StreamingResponse of newline-delimited JSON objects.
    """
    generator = campaign_service.create_campaign_stream_generator(
        intent=body.intent,
        name=body.name,
        db=db,
        customer_ids=body.customer_ids or None,
        tenant_id=current_user.tenant_id,
        channel=body.channel,
        scheduled_at=body.scheduled_at,
        campaign_id=body.campaign_id,
        clarification=body.clarification,
    )
    return StreamingResponse(
        generator,
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )



@router.get(
    "",
    response_model=CampaignListResponse,
    summary="List all campaigns (paginated history)",
)
async def list_campaigns(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CampaignListResponse:
    return await campaign_service.list_campaigns(page=page, page_size=page_size, db=db, tenant_id=current_user.tenant_id)


@router.get(
    "/{campaign_id}",
    response_model=CampaignDetailResponse,
    summary="Get campaign detail with segment + messages",
)
async def get_campaign(
    campaign_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CampaignDetailResponse:
    return await campaign_service.get_campaign_detail(campaign_id=campaign_id, db=db, tenant_id=current_user.tenant_id)


@router.patch(
    "/{campaign_id}",
    response_model=CampaignDetailResponse,
    summary="Update campaign settings in REVIEWING state",
)
async def update_campaign(
    campaign_id: int,
    body: CampaignUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CampaignDetailResponse:
    """Updates campaign parameters (name, channel, criteria, audience) and regenerates segment/messages."""
    try:
        return await campaign_service.update_campaign(
            campaign_id=campaign_id,
            body=body,
            db=db,
            tenant_id=current_user.tenant_id,
        )
    except HTTPException as exc:
        raise exc
    except Exception as exc:
        logger.error("Failed to update campaign %d: %s", campaign_id, exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update campaign: {str(exc)}"
        )


@router.patch(
    "/{campaign_id}/messages/{message_id}",
    response_model=MessagePreview,
    summary="Edit a generated message (only while in REVIEWING state)",
)
async def edit_message(
    campaign_id: int,
    message_id: int,
    body: EditMessageRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessagePreview:
    return await message_service.edit_message(
        campaign_id=campaign_id,
        message_id=message_id,
        edited_body=body.edited_body,
        db=db,
    )


@router.post(
    "/{campaign_id}/launch",
    response_model=CampaignResponse,
    summary="Launch campaign: REVIEWING → EXECUTING (human confirmation gate)",
)
async def launch_campaign(
    campaign_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CampaignResponse:
    """Transitions the campaign to EXECUTING state.

    After launch succeeds, dispatch is triggered as a background task (US5).
    - 409 CAMPAIGN_ALREADY_EXECUTING if another campaign is running.
    - 409 INVALID_TRANSITION if campaign is not in REVIEWING state.
    """
    result = await campaign_service.launch_campaign(campaign_id=campaign_id, db=db, tenant_id=current_user.tenant_id)

    # T053: Dispatch all campaign messages to channel service (fire-and-forget)
    background_tasks.add_task(
        delivery_service.dispatch_campaign_messages, campaign_id, db
    )

    return result


# ── T057: SSE live tracker stream ────────────────────────────────────────────

@router.get(
    "/{campaign_id}/stream",
    summary="SSE stream: live delivery status updates (US6)",
)
async def campaign_stream(
    campaign_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """Server-Sent Events stream for the live execution tracker.

    Emits:
      - status_update  → per-recipient delivery status change
      - campaign_complete → campaign reached COMPLETE; frontend should redirect
      - campaign_stalled  → stall detected; frontend shows alert banner
      - heartbeat comment every SSE_HEARTBEAT_INTERVAL_SECONDS

    Closes after campaign_complete or campaign_stalled.
    """

    async def event_generator():
        heartbeat_counter = 0
        last_event_ids: set[int] = set()  # campaign_message_ids already sent this session

        # Emit initial snapshot of already-recorded statuses
        try:
            snapshot = await delivery_service.get_latest_statuses(campaign_id, db)
            for s in snapshot:
                last_event_ids.add(s["campaign_message_id"])
                yield f"event: status_update\ndata: {json.dumps(s)}\n\n"
        except Exception as exc:  # noqa: BLE001
            logger.warning("SSE snapshot error for campaign %d: %s", campaign_id, exc)

        poll_ticks = 0
        heartbeat_ticks_per_interval = max(
            1, int(SSE_HEARTBEAT_INTERVAL_SECONDS / SSE_POLL_INTERVAL_SECONDS)
        )

        while True:
            await asyncio.sleep(SSE_POLL_INTERVAL_SECONDS)
            poll_ticks += 1

            # Heartbeat comment
            if poll_ticks % heartbeat_ticks_per_interval == 0:
                yield ": heartbeat\n\n"

            try:
                # Force SQLAlchemy to fetch fresh state from the database instead of using session cache
                # Check campaign state
                camp_result = await db.execute(
                    select(Campaign)
                    .where(Campaign.id == campaign_id, Campaign.tenant_id == current_user.tenant_id)
                    .execution_options(populate_existing=True)
                )
                campaign = camp_result.scalar_one_or_none()
                if campaign is None:
                    break

                # Fetch latest statuses and emit any new ones
                statuses = await delivery_service.get_latest_statuses(campaign_id, db)
                for s in statuses:
                    msg_id = s["campaign_message_id"]
                    # Always emit — client merges by key
                    yield f"event: status_update\ndata: {json.dumps(s)}\n\n"

                if campaign.state == CampaignState.COMPLETE.value:
                    completed_ts = delivery_service._to_utc_isoformat(
                        campaign.completed_at or datetime.datetime.utcnow()
                    )
                    complete_event = {
                        "type": "campaign_complete",
                        "campaign_id": campaign_id,
                        "completed_at": completed_ts,
                    }
                    yield f"event: campaign_complete\ndata: {json.dumps(complete_event)}\n\n"
                    break

                if campaign.state == CampaignState.CANCELLED.value:
                    cancelled_ts = delivery_service._to_utc_isoformat(
                        campaign.completed_at or datetime.datetime.utcnow()
                    )
                    cancelled_event = {
                        "type": "campaign_cancelled",
                        "campaign_id": campaign_id,
                        "cancelled_at": cancelled_ts,
                    }
                    yield f"event: campaign_cancelled\ndata: {json.dumps(cancelled_event)}\n\n"
                    break

                if campaign.stalled_at is not None:
                    stalled_event = {
                        "type": "campaign_stalled",
                        "campaign_id": campaign_id,
                        "stalled_at": delivery_service._to_utc_isoformat(campaign.stalled_at),
                    }
                    yield f"event: campaign_stalled\ndata: {json.dumps(stalled_event)}\n\n"
                    break

            except asyncio.CancelledError:
                break
            except Exception as exc:  # noqa: BLE001
                logger.warning("SSE poll error for campaign %d: %s", campaign_id, exc)
                # Don't break on transient errors — keep streaming

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── T063: Campaign results endpoint ──────────────────────────────────────────

@router.get(
    "/{campaign_id}/results",
    response_model=CampaignResultsResponse,
    summary="Full results for a COMPLETE campaign (US7)",
)
async def get_campaign_results(
    campaign_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CampaignResultsResponse:
    """Return AI summary, delivery metrics, and insight card.

    - 409 if campaign is not yet in COMPLETE state.
    """
    camp_result = await db.execute(
        select(Campaign).where(Campaign.id == campaign_id, Campaign.tenant_id == current_user.tenant_id)
    )
    campaign = camp_result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # Allow results for COMPLETE or CANCELLED campaigns; also show partial data for EXECUTING
    if campaign.state not in (CampaignState.COMPLETE.value, CampaignState.EXECUTING.value, CampaignState.CANCELLED.value):
        raise HTTPException(
            status_code=409,
            detail=f"Campaign is in {campaign.state} state — results only available after COMPLETE.",
        )

    metrics = await delivery_service.compute_campaign_metrics(campaign_id, db)
    insight = await delivery_service.build_insight_card(metrics, campaign_id, db)

    ai_summary = campaign.ai_summary or (
        f"Campaign reached {metrics.total_recipients} customers "
        f"with a {metrics.open_rate:.0%} open rate and {metrics.click_rate:.0%} click rate."
    )

    from app.models.customer import Customer
    from app.models.message import CampaignMessage
    from app.models.delivery import DeliveryEvent
    from app.schemas.campaign import CustomerSummary
    from sqlalchemy import distinct

    # Clicked customers
    clicked_stmt = (
        select(Customer)
        .join(CampaignMessage, CampaignMessage.customer_id == Customer.id)
        .join(DeliveryEvent, DeliveryEvent.campaign_message_id == CampaignMessage.id)
        .where(
            CampaignMessage.campaign_id == campaign_id,
            DeliveryEvent.status == "clicked",
        )
        .distinct()
    )
    clicked_rows = (await db.execute(clicked_stmt)).scalars().all()
    clicked_customers = [
        CustomerSummary(id=c.id, name=c.name, email=c.email)
        for c in clicked_rows
    ]

    # Purchased customers
    purchased_stmt = (
        select(Customer)
        .join(CampaignMessage, CampaignMessage.customer_id == Customer.id)
        .join(DeliveryEvent, DeliveryEvent.campaign_message_id == CampaignMessage.id)
        .where(
            CampaignMessage.campaign_id == campaign_id,
            DeliveryEvent.status == "purchased",
        )
        .distinct()
    )
    purchased_rows = (await db.execute(purchased_stmt)).scalars().all()
    purchased_customers = [
        CustomerSummary(id=c.id, name=c.name, email=c.email)
        for c in purchased_rows
    ]

    return CampaignResultsResponse(
        campaign_id=campaign_id,
        ai_summary=ai_summary,
        metrics=metrics,
        insight_card=insight,
        clicked_customers=clicked_customers,
        purchased_customers=purchased_customers,
    )


@router.post(
    "/{campaign_id}/cancel",
    response_model=CampaignResponse,
    summary="Cancel campaign: transition REVIEWING or EXECUTING to CANCELLED",
)
async def cancel_campaign(
    campaign_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CampaignResponse:
    """Transitions the campaign to CANCELLED state.

    - 409 INVALID_TRANSITION if campaign is not in REVIEWING or EXECUTING state.
    """
    return await campaign_service.cancel_campaign(campaign_id=campaign_id, db=db, tenant_id=current_user.tenant_id)
