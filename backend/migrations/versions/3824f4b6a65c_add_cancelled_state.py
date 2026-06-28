"""add_cancelled_state

Revision ID: 3824f4b6a65c
Revises: 54d820ac140d
Create Date: 2026-06-11 19:06:50.110695

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3824f4b6a65c'
down_revision: Union[str, Sequence[str], None] = '54d820ac140d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_constraint("ck_campaigns_state", "campaigns", type_="check")
    op.create_check_constraint(
        "ck_campaigns_state",
        "campaigns",
        "state IN ('DRAFT','SEGMENTING','GENERATING','REVIEWING','EXECUTING','COMPLETE','CANCELLED')"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("ck_campaigns_state", "campaigns", type_="check")
    op.create_check_constraint(
        "ck_campaigns_state",
        "campaigns",
        "state IN ('DRAFT','SEGMENTING','GENERATING','REVIEWING','EXECUTING','COMPLETE')"
    )

