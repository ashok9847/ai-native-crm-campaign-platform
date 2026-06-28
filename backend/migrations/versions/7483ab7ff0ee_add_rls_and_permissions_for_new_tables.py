"""add_rls_and_permissions_for_new_tables

Revision ID: 7483ab7ff0ee
Revises: ccce3e8020a0
Create Date: 2026-06-14 09:46:54.275000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7483ab7ff0ee'
down_revision: Union[str, Sequence[str], None] = 'ccce3e8020a0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1. Enable RLS and Force RLS on the new tables
    for table in ['campaign_stats', 'customer_health_scores']:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(f"CREATE POLICY tenant_isolation_policy ON {table} USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::integer)")

    # 2. Grant privileges to nudge_app if it exists
    op.execute("""
    DO $$
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nudge_app') THEN
            GRANT USAGE ON SCHEMA public TO nudge_app;
            GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO nudge_app;
            GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO nudge_app;
            ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO nudge_app;
            ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO nudge_app;
        END IF;
    END
    $$;
    """)


def downgrade() -> None:
    """Downgrade schema."""
    # 1. Disable RLS and Force RLS on the new tables
    for table in ['campaign_stats', 'customer_health_scores']:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation_policy ON {table}")
        op.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")

