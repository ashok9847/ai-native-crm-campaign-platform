"""Campaign ORM model and CampaignState enum."""

import datetime
import enum

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base


class CampaignState(str, enum.Enum):
    """Ordered campaign lifecycle states.

    Transitions MUST only advance forward per Nudge Constitution Principle I.
    """

    DRAFT = "DRAFT"
    SEGMENTING = "SEGMENTING"
    GENERATING = "GENERATING"
    REVIEWING = "REVIEWING"
    EXECUTING = "EXECUTING"
    COMPLETE = "COMPLETE"
    CANCELLED = "CANCELLED"


class Campaign(Base):
    """A single outreach run with a strict state-machine lifecycle."""

    __tablename__ = "campaigns"

    __table_args__ = (
        CheckConstraint(
            "state IN ('DRAFT','SEGMENTING','GENERATING','REVIEWING','EXECUTING','COMPLETE','CANCELLED')",
            name="ck_campaigns_state",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    intent: Mapped[str] = mapped_column(Text, nullable=False)
    state: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=CampaignState.DRAFT.value,
        server_default=CampaignState.DRAFT.value,
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )
    state_updated_at: Mapped[datetime.datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )
    completed_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    stalled_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    scheduled_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="When this campaign should auto-dispatch; NULL = manual dispatch",
    )
    channel: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="sms",
        server_default="sms",
        comment="Channel type: sms, whatsapp, email, rcs",
    )
    audience_id: Mapped[int | None] = mapped_column(
        ForeignKey("audiences.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
