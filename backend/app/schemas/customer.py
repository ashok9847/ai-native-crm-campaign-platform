"""Pydantic schemas for the Customer domain."""

import datetime

from pydantic import BaseModel, EmailStr, field_validator, model_validator
from typing import Any


VALID_TIERS = {"starter", "premium", "elite"}


class CustomerCreate(BaseModel):
    """Validation model for a single customer row — used during CSV import."""

    name: str
    email: str
    subscription_tier: str
    roast_preference: str
    last_order_date: datetime.date
    lifetime_value: float
    city: str

    @field_validator("subscription_tier")
    @classmethod
    def validate_tier(cls, v: str) -> str:
        if v not in VALID_TIERS:
            raise ValueError(f"subscription_tier must be one of {sorted(VALID_TIERS)}, got '{v}'")
        return v

    @field_validator("lifetime_value")
    @classmethod
    def validate_ltv(cls, v: float) -> float:
        if v < 0:
            raise ValueError("lifetime_value must be >= 0")
        return v

    @field_validator("name", "roast_preference", "city")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("field must not be empty")
        return v.strip()


class CustomerResponse(BaseModel):
    """Public representation of a customer record."""

    id: int
    name: str
    email: str
    subscription_tier: str
    roast_preference: str
    last_order_date: datetime.date
    lifetime_value: float
    city: str
    metadata: dict = {}

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def map_metadata(cls, data: Any) -> Any:
        if not isinstance(data, dict) and hasattr(data, "id"):
            # It is an ORM object, extract values and map crm_metadata to metadata key
            return {
                "id": data.id,
                "name": data.name,
                "email": data.email,
                "subscription_tier": data.subscription_tier,
                "roast_preference": data.roast_preference,
                "last_order_date": data.last_order_date,
                "lifetime_value": data.lifetime_value,
                "city": data.city,
                "metadata": getattr(data, "crm_metadata", {}),
            }
        return data


class SeedResult(BaseModel):
    """Result of the seed endpoint."""

    seeded: int
    skipped: int


class ImportRowError(BaseModel):
    """Details about a single CSV row that failed import."""

    row: int    # 1-indexed, excluding header
    email: str
    reason: str


class ImportResult(BaseModel):
    """Aggregate result of a CSV import operation."""

    imported: int
    skipped: int
    errors: list[ImportRowError]
    new_fields_inferred: list[dict] = []


class CustomerListResponse(BaseModel):
    """Paginated customer list."""

    total: int
    page: int
    page_size: int
    items: list[CustomerResponse]


class OrderResponse(BaseModel):
    """Public representation of an order record."""

    id: int
    customer_id: int
    order_date: datetime.date
    total_amount: float
    items: list[dict]
    source_channel: str

    model_config = {"from_attributes": True}


class CRMFieldResponse(BaseModel):
    """Schema for returning custom CRM field definitions."""

    id: int
    tenant_id: int
    entity_type: str
    field_name: str
    field_type: str
    description: str | None = None
    allowed_enums: list[str] | None = None
    created_at: datetime.datetime

    model_config = {"from_attributes": True}
