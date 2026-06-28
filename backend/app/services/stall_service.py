"""Stall detection background service — T072.

Detects campaigns that have been EXECUTING for longer than
`CAMPAIGN_STALL_TIMEOUT_SECONDS` without completing.

Public API:
  run_stall_detection(db_factory)  — async infinite loop; call via asyncio.create_task
"""

from __future__ import annotations

import asyncio
import datetime
import logging

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.models.campaign import Campaign, CampaignState

logger = logging.getLogger(__name__)

# How long to sleep between detection sweeps
STALL_CHECK_INTERVAL_SECONDS: int = 60


async def _detect_and_mark_stalled(db: AsyncSession) -> list[int]:
    """Query EXECUTING campaigns past their stall deadline and transition to CANCELLED.

    Returns list of campaign IDs that were just marked stalled and cancelled.
    """
    # Temporarily bypass RLS to sweep executing campaigns across all tenants
    await db.execute(text("SELECT set_config('app.bypass_rls', 'true', true)"))

    settings = get_settings()
    timeout = datetime.timedelta(seconds=settings.campaign_stall_timeout_seconds)
    deadline = datetime.datetime.utcnow() - timeout

    # Find EXECUTING campaigns where state_updated_at is past the deadline and not yet stalled
    result = await db.execute(
        select(Campaign).where(
            Campaign.state == CampaignState.EXECUTING.value,
            Campaign.state_updated_at < deadline,
            Campaign.stalled_at.is_(None),
        )
    )
    stalled_campaigns = result.scalars().all()

    if not stalled_campaigns:
        return []

    now = datetime.datetime.utcnow()
    stalled_ids: list[int] = []

    for campaign in stalled_campaigns:
        campaign.stalled_at = now
        campaign.state = CampaignState.CANCELLED.value
        campaign.completed_at = now
        campaign.state_updated_at = now
        stalled_ids.append(campaign.id)
        logger.warning(
            "Campaign %d stalled & cancelled: was EXECUTING since %s (timeout=%ds)",
            campaign.id,
            campaign.state_updated_at,
            settings.campaign_stall_timeout_seconds,
        )

    await db.commit()
    return stalled_ids


async def run_stall_detection(db_factory: async_sessionmaker[AsyncSession]) -> None:
    """Infinite async loop that sweeps for stalled campaigns every 60 seconds.

    Designed to run as an asyncio background task (created in main.py lifespan).
    Handles its own exceptions gracefully — a DB error in one sweep does NOT
    crash the loop.

    Args:
        db_factory: SQLAlchemy async_sessionmaker (AsyncSessionLocal from database.py)
    """
    settings = get_settings()
    logger.info(
        "Stall detection started (interval=%ds, timeout=%ds)",
        STALL_CHECK_INTERVAL_SECONDS,
        settings.campaign_stall_timeout_seconds,
    )

    while True:
        try:
            await asyncio.sleep(STALL_CHECK_INTERVAL_SECONDS)

            async with db_factory() as db:
                stalled = await _detect_and_mark_stalled(db)
                if stalled:
                    logger.warning(
                        "Stall detection: marked %d campaign(s) stalled: %s",
                        len(stalled),
                        stalled,
                    )
                else:
                    logger.debug("Stall detection sweep complete — no stalled campaigns")

        except asyncio.CancelledError:
            logger.info("Stall detection task cancelled — shutting down cleanly")
            raise  # Re-raise so asyncio can clean up the task

        except Exception as exc:  # noqa: BLE001
            # Log but don't crash — transient DB errors shouldn't stop the loop
            logger.error("Stall detection sweep failed: %s", exc, exc_info=True)
