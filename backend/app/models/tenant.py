"""Tenant-related ORM models for multi-tenancy and dynamic schema."""

import datetime
from typing import Optional, List

from sqlalchemy import ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base import Base


class Tenant(Base):
    """Represents a business client operating within the CRM."""

    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )

    users: Mapped[List["User"]] = relationship("User", back_populates="tenant", cascade="all, delete-orphan")
    crm_fields: Mapped[List["CRMField"]] = relationship("CRMField", back_populates="tenant", cascade="all, delete-orphan")


class User(Base):
    """Represents an individual with login access to a specific tenant."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="users")


class CRMField(Base):
    """Defines dynamically inferred schema properties for a tenant."""

    __tablename__ = "crm_fields"
    __table_args__ = (
        UniqueConstraint("tenant_id", "entity_type", "field_name", name="uq_crm_fields_tenant_entity_field"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g., 'customer'
    field_name: Mapped[str] = mapped_column(String(100), nullable=False)   # e.g., 'favorite_roast'
    field_type: Mapped[str] = mapped_column(String(50), nullable=False)   # e.g., 'string', 'number', 'enum'
    description: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    allowed_enums: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)  # List of string options
    created_at: Mapped[datetime.datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="crm_fields")
