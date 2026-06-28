import asyncio
from sqlalchemy import text
from app.core.database import get_settings

async def update_policy():
    # Connect as postgres admin to modify policies
    admin_url = "postgresql+asyncpg://postgres:pankaj%40098123@db.wpyagjyxcbizwzxccmhr.supabase.co:5432/postgres"
    from sqlalchemy.ext.asyncio import create_async_engine
    import ssl
    _ssl_ctx = ssl.create_default_context()
    _ssl_ctx.check_hostname = False
    _ssl_ctx.verify_mode = ssl.CERT_NONE
    
    engine = create_async_engine(admin_url, connect_args={"ssl": _ssl_ctx})
    async with engine.begin() as conn:
        print("Recreating policy on users table...")
        try:
            await conn.execute(text("DROP POLICY IF EXISTS tenant_isolation_policy ON users"))
            await conn.execute(text(
                "CREATE POLICY tenant_isolation_policy ON users "
                "USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::integer "
                "OR current_setting('app.bypass_rls', true) = 'true')"
            ))
            print("Successfully updated RLS policy for users table.")
        except Exception as e:
            print("Error recreating policy:", e)
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(update_policy())
