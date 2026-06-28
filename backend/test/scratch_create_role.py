import asyncio
from sqlalchemy import text
from app.core.database import engine

async def create_nudge_role():
    async with engine.begin() as conn:
        print("Creating role nudge_app...")
        try:
            # Drop role if it exists (using a DO block since DROP ROLE IF EXISTS nudge_app is safe)
            await conn.execute(text("DROP ROLE IF EXISTS nudge_app;"))
            await conn.execute(text("CREATE ROLE nudge_app WITH LOGIN PASSWORD 'nudge_app_pwd_2026';"))
            print("Successfully created role nudge_app.")
            
            print("Granting usage and privileges on public schema...")
            await conn.execute(text("GRANT USAGE ON SCHEMA public TO nudge_app;"))
            await conn.execute(text("GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO nudge_app;"))
            await conn.execute(text("GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO nudge_app;"))
            print("Successfully granted privileges.")
        except Exception as e:
            print("Error creating role or granting privileges:", e)

if __name__ == "__main__":
    asyncio.run(create_nudge_role())
