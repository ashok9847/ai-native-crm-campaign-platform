"""Message service — edit campaign messages (T044).

Public API:
  edit_message(campaign_id, message_id, edited_body, db) -> MessagePreview
"""

from __future__ import annotations

import logging

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.campaign import CampaignState
from app.models.campaign import Campaign
from app.models.customer import Customer
from app.models.message import CampaignMessage
from app.schemas.campaign import MessagePreview

logger = logging.getLogger(__name__)


async def edit_message(
    campaign_id: int,
    message_id: int,
    edited_body: str,
    db: AsyncSession,
) -> MessagePreview:
    """Edit a campaign message body. Only permitted while campaign is in REVIEWING state.

    Sets edited=True and edited_body on the CampaignMessage row.
    Returns MessagePreview with effective_body = edited_body.
    """
    # Verify campaign exists and is in REVIEWING state
    campaign_result = await db.execute(
        select(Campaign).where(Campaign.id == campaign_id)
    )
    campaign = campaign_result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(
            status_code=404,
            detail={"detail": f"Campaign {campaign_id} not found.", "code": "NOT_FOUND"},
        )
    if campaign.state != CampaignState.REVIEWING.value:
        raise HTTPException(
            status_code=409,
            detail={
                "detail": f"Messages can only be edited while campaign is in REVIEWING state. Current state: {campaign.state}.",
                "code": "INVALID_TRANSITION",
            },
        )

    # Fetch the message
    msg_result = await db.execute(
        select(CampaignMessage)
        .where(CampaignMessage.id == message_id)
        .where(CampaignMessage.campaign_id == campaign_id)
    )
    message = msg_result.scalar_one_or_none()
    if message is None:
        raise HTTPException(
            status_code=404,
            detail={"detail": f"Message {message_id} not found.", "code": "NOT_FOUND"},
        )

    # Apply edit
    message.edited = True
    message.edited_body = edited_body
    await db.commit()
    await db.refresh(message)

    # Fetch customer name
    cust_result = await db.execute(
        select(Customer.name).where(Customer.id == message.customer_id)
    )
    customer_name: str = cust_result.scalar_one_or_none() or "Customer"

    return MessagePreview(
        id=message.id,
        customer_id=message.customer_id,
        customer_name=customer_name,
        body=message.body,
        edited=message.edited,
        edited_body=message.edited_body,
        effective_body=message.edited_body or message.body,
    )
