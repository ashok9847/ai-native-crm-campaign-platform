import asyncio
from app.core.database import AsyncSessionLocal
from app.models.campaign import Campaign
from sqlalchemy import select

async def run():
    async with AsyncSessionLocal() as session:
        c = await session.get(Campaign, 121)
        if c:
            print(f"ID: {c.id}, Name: {c.name}, Tenant ID: {c.tenant_id}, State: {c.state}")
        else:
            print("Campaign 121 not found in database.")

if __name__ == "__main__":
    asyncio.run(run())
