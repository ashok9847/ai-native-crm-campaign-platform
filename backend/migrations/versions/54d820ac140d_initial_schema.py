"""initial_schema

Revision ID: 54d820ac140d
Revises:
Create Date: 2026-06-11

Creates all six Nudge tables:
  customers, campaigns, segments, segment_customers,
  campaign_messages, delivery_events
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic
revision: str = "54d820ac140d"
down_revision: str | None = None
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # ── customers ─────────────────────────────────────────────────────────────
    op.create_table(
        "customers",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("subscription_tier", sa.String(20), nullable=False),
        sa.Column("roast_preference", sa.String(50), nullable=False),
        sa.Column("last_order_date", sa.Date(), nullable=False),
        sa.Column("lifetime_value", sa.Numeric(10, 2), nullable=False),
        sa.Column("city", sa.String(100), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "subscription_tier IN ('starter', 'premium', 'elite')",
            name="ck_customers_subscription_tier",
        ),
        sa.CheckConstraint(
            "lifetime_value >= 0",
            name="ck_customers_lifetime_value_non_negative",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("customers_email_idx", "customers", ["email"], unique=True)

    # ── campaigns ─────────────────────────────────────────────────────────────
    op.create_table(
        "campaigns",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("intent", sa.Text(), nullable=False),
        sa.Column(
            "state",
            sa.String(20),
            server_default="DRAFT",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "state_updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("stalled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ai_summary", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "state IN ('DRAFT','SEGMENTING','GENERATING','REVIEWING','EXECUTING','COMPLETE')",
            name="ck_campaigns_state",
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── segments ──────────────────────────────────────────────────────────────
    op.create_table(
        "segments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("campaign_id", sa.Integer(), nullable=False),
        sa.Column("filter_criteria", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("customer_count", sa.Integer(), nullable=False),
        sa.Column(
            "sample_customer_ids",
            postgresql.ARRAY(sa.Integer()),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["campaign_id"],
            ["campaigns.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("segments_campaign_id_idx", "segments", ["campaign_id"])

    # ── segment_customers (join table) ────────────────────────────────────────
    op.create_table(
        "segment_customers",
        sa.Column("segment_id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["customer_id"],
            ["customers.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["segment_id"],
            ["segments.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("segment_id", "customer_id"),
    )

    # ── campaign_messages ─────────────────────────────────────────────────────
    op.create_table(
        "campaign_messages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("campaign_id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("edited", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("edited_body", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["campaign_id"],
            ["campaigns.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "campaign_id",
            "customer_id",
            name="uq_campaign_messages_campaign_customer",
        ),
    )
    op.create_index(
        "campaign_messages_campaign_id_idx", "campaign_messages", ["campaign_id"]
    )

    # ── delivery_events ───────────────────────────────────────────────────────
    op.create_table(
        "delivery_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("event_id", sa.String(128), nullable=False),
        sa.Column("campaign_message_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("is_retry", sa.Boolean(), server_default="false", nullable=False),
        sa.CheckConstraint(
            "status IN ('sent','delivered','opened','clicked','failed')",
            name="ck_delivery_events_status",
        ),
        sa.ForeignKeyConstraint(
            ["campaign_message_id"],
            ["campaign_messages.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id"),
    )
    op.create_index(
        "delivery_events_event_id_idx", "delivery_events", ["event_id"], unique=True
    )
    op.create_index(
        "delivery_events_message_id_idx",
        "delivery_events",
        ["campaign_message_id"],
    )


def downgrade() -> None:
    op.drop_table("delivery_events")
    op.drop_table("campaign_messages")
    op.drop_table("segment_customers")
    op.drop_table("segments")
    op.drop_table("campaigns")
    op.drop_table("customers")
