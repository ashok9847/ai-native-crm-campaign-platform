"""DeliveryEvent ORM model — idempotency enforced at DB level."""

import datetime

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base


class DeliveryEvent(Base):
    """A single delivery callback event from the channel service.

    ``event_id`` has a UNIQUE constraint — duplicate callbacks are rejected
    via INSERT … ON CONFLICT DO NOTHING, enforcing idempotency at the DB level.
    """

    __tablename__ = "delivery_events"

    __table_args__ = (
        CheckConstraint(
            "status IN ('sent','delivered','opened','read','clicked','failed','purchased')",
            name="ck_delivery_events_status",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    dispatch_id: Mapped[str] = mapped_column(String(128), nullable=True, index=True, comment="Matches the original dispatch_id from channel service")
    event_id: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        unique=True,
        index=True,
        comment="Channel-service-assigned UUID; UNIQUE constraint enforces idempotency",
    )
    campaign_message_id: Mapped[int] = mapped_column(
        ForeignKey("campaign_messages.id"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    received_at: Mapped[datetime.datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )
    is_retry: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_final: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
