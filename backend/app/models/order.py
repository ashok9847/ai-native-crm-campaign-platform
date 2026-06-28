"""Order ORM model."""

import datetime
from typing import TYPE_CHECKING
from sqlalchemy import Date, ForeignKey, Numeric, String, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.base import Base

if TYPE_CHECKING:
    from app.models.customer import Customer

class Order(Base):
    """An order placed by a BrewMate customer."""

    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    total_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    items: Mapped[list[dict]] = mapped_column(JSON, nullable=False)
    source_channel: Mapped[str] = mapped_column(String(50), nullable=False, default="web")
    communication_id: Mapped[int | None] = mapped_column(
        ForeignKey("campaign_messages.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Links to originating campaign message for revenue attribution; NULL for organic orders",
    )
    campaign_id: Mapped[int | None] = mapped_column(
        ForeignKey("campaigns.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Direct link to the campaign that drove this purchase",
    )

    customer: Mapped["Customer"] = relationship("Customer", back_populates="orders")
