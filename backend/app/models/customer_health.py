"""CustomerHealth ORM model — lazy-recomputed customer health scores."""

import datetime
import enum

from sqlalchemy import CheckConstraint, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base


class HealthZone(str, enum.Enum):
    """Health classification zone based on composite score."""

    HEALTHY = "healthy"
    AT_RISK = "at_risk"
    CHURNING = "churning"


class CustomerHealth(Base):
    """Stores the latest computed health score for a customer.

    Recomputed lazily: only when a customer is viewed and the existing
    score is older than 24 hours.  Weighted composite of four signals:
    recency (35%), engagement (30%), spend (20%), frequency (15%).
    """

    __tablename__ = "customer_health_scores"

    __table_args__ = (
        CheckConstraint("score >= 0 AND score <= 100", name="ck_health_score_range"),
        CheckConstraint(
            "zone IN ('healthy', 'at_risk', 'churning')",
            name="ck_health_zone_valid",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    score: Mapped[int] = mapped_column(nullable=False, default=50)
    recency_score: Mapped[int] = mapped_column(nullable=False, default=50)
    engagement_score: Mapped[int] = mapped_column(nullable=False, default=50)
    spend_score: Mapped[int] = mapped_column(nullable=False, default=50)
    frequency_score: Mapped[int] = mapped_column(nullable=False, default=50)

    zone: Mapped[str] = mapped_column(
        String(20), nullable=False, default=HealthZone.AT_RISK.value, index=True
    )
    recommended_action: Mapped[str | None] = mapped_column(Text, nullable=True)

    computed_at: Mapped[datetime.datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )
