import asyncio
from sqlalchemy import text
from app.core.database import engine

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

async def apply_rls():
    async with engine.begin() as conn:
        print("Starting RLS enforcement...")
        # First ensure default tenant (BrewMate) exists
        await conn.execute(text("INSERT INTO tenants (id, name, created_at) VALUES (1, 'BrewMate', NOW()) ON CONFLICT (name) DO NOTHING"))
        
        # Set tenant_id = 1 for any existing rows that have NULL tenant_id
        for table in shared_tables:
            try:
                await conn.execute(text(f"UPDATE {table} SET tenant_id = 1 WHERE tenant_id IS NULL"))
                print(f"Set tenant_id=1 for table: {table}")
            except Exception as e:
                print(f"Could not update tenant_id for {table}: {e}")

        # Apply policies
        for table in shared_tables:
            print(f"Applying RLS to {table}...")
            try:
                await conn.execute(text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))
                await conn.execute(text(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY"))
                # Drop policy first if exists to avoid conflict
                await conn.execute(text(f"DROP POLICY IF EXISTS tenant_isolation_policy ON {table}"))
                await conn.execute(text(f"CREATE POLICY tenant_isolation_policy ON {table} USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::integer OR current_setting('app.bypass_rls', true) = 'true')"))
                print(f"RLS applied successfully to {table}")
            except Exception as e:
                print(f"Error applying RLS to {table}: {e}")
        print("Done!")

if __name__ == "__main__":
    asyncio.run(apply_rls())
