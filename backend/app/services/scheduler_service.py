"""Scheduler service — background loop that dispatches campaigns at their scheduled time.

Follows the same pattern as stall_service.py: asyncio.create_task() at startup,
30s polling loop, bypass RLS for cross-tenant scanning.
"""

import asyncio
import datetime
import logging

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.campaign import Campaign, CampaignState

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 30


async def _find_due_campaigns(db: AsyncSession) -> list[Campaign]:
    """Find all DRAFT campaigns with scheduled_at <= now."""
    now = datetime.datetime.now(datetime.timezone.utc)
    result = await db.execute(
        select(Campaign).where(
            Campaign.state == CampaignState.DRAFT.value,
            Campaign.scheduled_at.isnot(None),
            Campaign.scheduled_at <= now,
        )
    )
    return list(result.scalars().all())


async def scheduler_loop() -> None:
    """Background loop that checks for and dispatches scheduled campaigns.

    Runs every POLL_INTERVAL_SECONDS. Bypasses RLS to scan all tenants,
    then sets tenant context before dispatching each campaign.
    """
    # Wait a bit for app startup to complete
    await asyncio.sleep(5)
    logger.info("Scheduler service started (poll interval: %ds)", POLL_INTERVAL_SECONDS)

    from app.core.database import AsyncSessionLocal

    while True:
        try:
            async with AsyncSessionLocal() as db:
                # Bypass RLS for cross-tenant scanning
                await db.execute(text("SELECT set_config('app.bypass_rls', 'true', true)"))

                due_campaigns = await _find_due_campaigns(db)

                if due_campaigns:
                    logger.info("Scheduler: found %d due campaigns", len(due_campaigns))

                for campaign in due_campaigns:
                    try:
                        logger.info(
                            "Scheduler: dispatching campaign %d (tenant=%d, scheduled_at=%s)",
                            campaign.id,
                            campaign.tenant_id,
                            campaign.scheduled_at,
                        )
                        # Set tenant context for dispatch
                        await db.execute(
                            text("SELECT set_config('app.current_tenant_id', :tid, true)"),
                            {"tid": str(campaign.tenant_id)},
                        )

                        # Advance campaign state: DRAFT → SEGMENTING (triggers the full pipeline)
                        from app.services.campaign_service import advance_campaign_state
                        await advance_campaign_state(campaign.id, db)

                    except Exception as exc:
                        logger.error(
                            "Scheduler: failed to dispatch campaign %d: %s",
                            campaign.id,
                            exc,
                            exc_info=True,
                        )

        except Exception as exc:
            logger.error("Scheduler: loop error: %s", exc, exc_info=True)

        await asyncio.sleep(POLL_INTERVAL_SECONDS)
