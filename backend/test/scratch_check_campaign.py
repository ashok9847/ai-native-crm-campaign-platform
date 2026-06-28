import asyncio
import sys
sys.path.insert(0, ".")

from app.core.database import AsyncSessionLocal
from sqlalchemy import func, select, text
from app.models.message import CampaignMessage
from app.models.delivery import DeliveryEvent
from app.models.campaign import Campaign

from app.models.customer import Customer
from app.schemas.customer import CustomerResponse

from fastapi.testclient import TestClient
from app.main import app

async def main():
    async with AsyncSessionLocal() as db:
        try:
            # Set app.bypass_rls to true
            await db.execute(text("SELECT set_config('app.bypass_rls', 'true', true)"))
            print("SET app.bypass_rls = true succeeded.")
            
            # Query messages to see if any are returned
            res = await db.execute(select(CampaignMessage).limit(5))
            messages = res.scalars().all()
            print(f"Query with bypass_rls = true returned {len(messages)} messages.")
            
        except Exception as e:
            print("Error occurred during test:", e)

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
