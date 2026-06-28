import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
import ssl

shared_tables = [
    'users',
    'crm_fields',
    'customers',
    'orders',
    'campaigns',
    'campaign_messages',
    'delivery_events',
    'segments',
    'segment_customers'
]

async def apply_rls_admin():
    admin_url = "postgresql+asyncpg://postgres:pankaj%40098123@db.wpyagjyxcbizwzxccmhr.supabase.co:5432/postgres"
    _ssl_ctx = ssl.create_default_context()
    _ssl_ctx.check_hostname = False
    _ssl_ctx.verify_mode = ssl.CERT_NONE
    
    engine = create_async_engine(admin_url, connect_args={"ssl": _ssl_ctx})
    async with engine.begin() as conn:
        print("Starting admin RLS enforcement...")
        
        # Apply policies
        for table in shared_tables:
            print(f"Applying RLS to {table}...")
            try:
                await conn.execute(text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))
                await conn.execute(text(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY"))
                # Drop policy first if exists to avoid conflict
                await conn.execute(text(f"DROP POLICY IF EXISTS tenant_isolation_policy ON {table}"))
                await conn.execute(text(
                    f"CREATE POLICY tenant_isolation_policy ON {table} "
                    f"USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::integer "
                    f"OR current_setting('app.bypass_rls', true) = 'true')"
                ))
                print(f"RLS policy updated successfully for {table}")
            except Exception as e:
                print(f"Error applying RLS to {table}: {e}")
        print("Done!")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(apply_rls_admin())
