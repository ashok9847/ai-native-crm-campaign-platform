import asyncio
from app.core.database import AsyncSessionLocal
from app.models.tenant import User, Tenant
from sqlalchemy import select

async def run():
    async with AsyncSessionLocal() as session:
        res = await session.execute(select(User))
        users = res.scalars().all()
        print(f"Total users: {len(users)}")
        for u in users:
            t = await session.get(Tenant, u.tenant_id)
            t_name = t.name if t else "Unknown"
            print(f"User ID: {u.id}, Email: {u.email}, Tenant ID: {u.tenant_id}, Tenant Name: '{t_name}'")

if __name__ == "__main__":
    asyncio.run(run())
