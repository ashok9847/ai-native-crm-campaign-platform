"""One-shot script: Find all EXECUTING campaigns and trigger completion check.

Run with:  uv run python fix_stuck_campaigns.py
"""
import asyncio
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def main() -> None:
    from app.core.database import AsyncSessionLocal
    from app.models.campaign import Campaign, CampaignState
    from app.services.delivery_service import check_campaign_completion
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Campaign).where(Campaign.state == CampaignState.EXECUTING.value)
        )
        executing = result.scalars().all()

        if not executing:
            logger.info("No EXECUTING campaigns found.")
            return

        for c in executing:
            logger.info("Checking completion for campaign %d (%s)...", c.id, c.name[:40])
            await check_campaign_completion(c.id, db)
            # Re-fetch to see updated state
            await db.refresh(c)
            logger.info("  → Campaign %d state is now: %s", c.id, c.state)


if __name__ == "__main__":
    asyncio.run(main())
