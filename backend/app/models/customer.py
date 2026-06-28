"""Customer ORM model."""

import datetime

from sqlalchemy import CheckConstraint, Date, ForeignKey, Numeric, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.order import Order
    from app.models.tenant import Tenant

from app.core.base import Base


class Customer(Base):
    """A BrewMate subscriber imported via CSV or the seed endpoint."""

    __tablename__ = "customers"

    __table_args__ = (
        CheckConstraint(
            "subscription_tier IN ('starter', 'premium', 'elite')",
            name="ck_customers_subscription_tier",
        ),
        CheckConstraint(
            "lifetime_value >= 0",
            name="ck_customers_lifetime_value_non_negative",
        ),
        UniqueConstraint("tenant_id", "email", name="uq_customers_tenant_email"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    subscription_tier: Mapped[str] = mapped_column(String(20), nullable=False)
    roast_preference: Mapped[str] = mapped_column(String(50), nullable=False)
    last_order_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    lifetime_value: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    crm_metadata: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict, server_default="{}")
    created_at: Mapped[datetime.datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )

    tenant: Mapped["Tenant"] = relationship("Tenant")
    orders: Mapped[list["Order"]] = relationship("Order", back_populates="customer", cascade="all, delete-orphan")
