"""CampaignStats ORM model — denormalized counters for O(1) dashboard reads."""

import datetime

from sqlalchemy import ForeignKey, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base


class CampaignStats(Base):
    """Denormalized campaign statistics.

    One row per campaign. Counters are atomically incremented via
    ``UPDATE SET sent_count = sent_count + 1`` in the delivery callback handler.
    """

    __tablename__ = "campaign_stats"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    campaign_id: Mapped[int] = mapped_column(
        ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    sent_count: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")
    delivered_count: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")
    opened_count: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")
    clicked_count: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")
    failed_count: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")
    purchased_count: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")
    attributed_revenue: Mapped[float] = mapped_column(
        Numeric(12, 2), nullable=False, default=0.00, server_default="0.00"
    )

    created_at: Mapped[datetime.datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        nullable=False, server_default=func.now(), onupdate=func.now()
    )
