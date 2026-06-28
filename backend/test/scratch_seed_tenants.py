import asyncio
from sqlalchemy import text, select
from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.tenant import Tenant, User

async def seed():
    async with AsyncSessionLocal() as session:
        print("Seeding tenants...")
        # 1. Seed Tenants
        # BrewMate (id=1)
        res_t1 = await session.execute(select(Tenant).where(Tenant.id == 1))
        t1 = res_t1.scalar_one_or_none()
        if not t1:
            t1 = Tenant(id=1, name="BrewMate")
            session.add(t1)
            print("Added BrewMate (Tenant 1)")
        
        # Zara (id=2)
        res_t2 = await session.execute(select(Tenant).where(Tenant.id == 2))
        t2 = res_t2.scalar_one_or_none()
        if not t2:
            t2 = Tenant(id=2, name="Zara")
            session.add(t2)
            print("Added Zara (Tenant 2)")
            
        await session.commit()
        
        print("Seeding users...")
        # 2. Seed Users
        # Alice (BrewMate)
        res_u1 = await session.execute(select(User).where(User.email == "alice@brewmate.com"))
        u1 = res_u1.scalar_one_or_none()
        if not u1:
            u1 = User(
                tenant_id=1,
                email="alice@brewmate.com",
                hashed_password=hash_password("password123")
            )
            session.add(u1)
            print("Added Alice (BrewMate user)")
            
        # Bob (Zara)
        res_u2 = await session.execute(select(User).where(User.email == "bob@zara.com"))
        u2 = res_u2.scalar_one_or_none()
        if not u2:
            u2 = User(
                tenant_id=2,
                email="bob@zara.com",
                hashed_password=hash_password("password123")
            )
            session.add(u2)
            print("Added Bob (Zara user)")
            
        await session.commit()
        print("Seeding complete!")

if __name__ == "__main__":
    asyncio.run(seed())
