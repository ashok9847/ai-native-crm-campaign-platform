import asyncio
from sqlalchemy import text
from app.core.database import engine

async def list_roles():
    async with engine.begin() as conn:
        print("Querying roles from pg_roles...")
        try:
            res = await conn.execute(text("SELECT rolname, rolbypassrls, rolsuper FROM pg_roles;"))
            for row in res.fetchall():
                print(row)
        except Exception as e:
            print("Error listing roles:", e)

if __name__ == "__main__":
    asyncio.run(list_roles())
