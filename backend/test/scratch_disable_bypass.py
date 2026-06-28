import asyncio
from sqlalchemy import text
from app.core.database import engine

async def disable_bypass():
    async with engine.begin() as conn:
        print("Disabling BYPASSRLS on postgres role...")
        try:
            await conn.execute(text("ALTER ROLE postgres NOBYPASSRLS;"))
            print("Successfully executed ALTER ROLE postgres NOBYPASSRLS;")
        except Exception as e:
            print("Error executing ALTER ROLE:", e)

if __name__ == "__main__":
    asyncio.run(disable_bypass())
