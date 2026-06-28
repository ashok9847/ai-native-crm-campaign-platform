"""Segment and SegmentCustomer ORM models."""

import datetime

from sqlalchemy import ARRAY, Column, ForeignKey, Integer, Table, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base


# Association table — no ORM class needed; raw Table for bulk inserts
segment_customers = Table(
    "segment_customers",
    Base.metadata,
    Column(
        "tenant_id",
        Integer,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    ),
    Column(
        "segment_id",
        Integer,
        ForeignKey("segments.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    ),
    Column(
        "customer_id",
        Integer,
        ForeignKey("customers.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    ),
)


class Segment(Base):
    """AI-derived audience filter for a campaign.

    ``filter_criteria`` stores a JSON array of FilterCriterion objects
    returned by the Kimi segmentation prompt.
    """

    __tablename__ = "segments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    campaign_id: Mapped[int] = mapped_column(
        ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    filter_criteria: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    customer_count: Mapped[int] = mapped_column(nullable=False)
    # Up to MAX_SEGMENT_SAMPLE_SIZE customer IDs for UI preview
    sample_customer_ids: Mapped[list[int]] = mapped_column(
        ARRAY(Integer), nullable=False, default=list
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )
