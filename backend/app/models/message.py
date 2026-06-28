"""CampaignMessage ORM model."""

import datetime

from sqlalchemy import Boolean, ForeignKey, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base


class CampaignMessage(Base):
    """One personalized message per customer in a campaign segment.

    ``effective_body`` = COALESCE(edited_body, body) — computed at query time.
    """

    __tablename__ = "campaign_messages"

    __table_args__ = (
        UniqueConstraint("campaign_id", "customer_id", name="uq_campaign_messages_campaign_customer"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    campaign_id: Mapped[int] = mapped_column(
        ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id"),
        nullable=False,
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    edited: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    edited_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )

    @property
    def effective_body(self) -> str:
        """Return the marketer-edited body if available, else the AI-generated body."""
        return self.edited_body if self.edited_body is not None else self.body
