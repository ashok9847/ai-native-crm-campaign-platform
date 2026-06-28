"""Reset all EXECUTING campaigns to COMPLETE and show all campaigns."""
import asyncio
import datetime
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

async def main():
    with open(".env", encoding="utf-8", errors="ignore") as f:
        db_url = next((l.split("=", 1)[1].strip() for l in f if l.startswith("DATABASE_URL=")), None)
    
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1).replace("postgres://", "postgresql+asyncpg://", 1)
    engine = create_async_engine(db_url)
    now = datetime.datetime.utcnow()
    
    async with engine.begin() as conn:
        r = await conn.execute(
            text("UPDATE campaigns SET state='COMPLETE', state_updated_at=:now, completed_at=:now WHERE state='EXECUTING'"),
            {"now": now}
        )
        print(f"Reset {r.rowcount} EXECUTING campaigns to COMPLETE")
        rows = await conn.execute(text("SELECT id, state, name FROM campaigns ORDER BY id"))
        for row in rows.all():
            print(f"  id={row[0]} state={row[1]} name={row[2]}")
    
    await engine.dispose()

asyncio.run(main())
