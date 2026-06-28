import asyncio
import sys
import logging
sys.path.insert(0, ".")

# Enable logging to stdout so we see everything
logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")

from app.services.campaign_service import create_campaign
from app.core.database import AsyncSessionLocal

async def test():
    async with AsyncSessionLocal() as db:
        try:
            res = await create_campaign(
                intent="Re-engage top 10 premium customers",
                name="Test Campaign Limit",
                db=db
            )
            print("SUCCESS:", res)
        except Exception as e:
            logging.exception("FAILED to create campaign")

if __name__ == "__main__":
    asyncio.run(test())
