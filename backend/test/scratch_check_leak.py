import asyncio
import sys
import io
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

async def main():
    with open(".env", encoding="utf-8", errors="ignore") as f:
        db_url = next((l.split("=", 1)[1].strip() for l in f if l.startswith("DATABASE_URL=")), None)
    
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1).replace("postgres://", "postgresql+asyncpg://", 1)
    engine = create_async_engine(db_url)
    
    async with engine.begin() as conn:
        # Check customer counts grouped by tenant_id without RLS context (directly via connection)
        result = await conn.execute(text("SELECT tenant_id, COUNT(*) FROM customers GROUP BY tenant_id"))
        print("Customer count by tenant_id (without RLS context):")
        for row in result.all():
            print(f"  tenant_id={row[0]}: count={row[1]}")
            
        # Check total campaigns and messages
        camp_res = await conn.execute(text("SELECT COUNT(*) FROM campaigns"))
        msg_res = await conn.execute(text("SELECT COUNT(*) FROM campaign_messages"))
        print(f"Total campaigns: {camp_res.scalar()}")
        print(f"Total campaign messages: {msg_res.scalar()}")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())
