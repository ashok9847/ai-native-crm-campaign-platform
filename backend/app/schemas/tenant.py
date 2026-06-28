"""Schemas for authentication, user responses, and tenant dashboard statistics."""

import datetime
from pydantic import BaseModel, ConfigDict


class Token(BaseModel):
    """Schema for returning an access token to the client."""

    access_token: str
    token_type: str


class TokenData(BaseModel):
    """Schema for parsed JWT token payload data."""

    sub: str | None = None
    tenant_id: int | None = None


class UserResponse(BaseModel):
    """Schema for returning user details."""

    id: int
    tenant_id: int
    email: str
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


class UserProfileResponse(BaseModel):
    """Schema for returning full user profile details including tenant name."""

    id: int
    tenant_id: int
    email: str
    tenant_name: str

    model_config = ConfigDict(from_attributes=True)


class TenantRegisterRequest(BaseModel):
    """Schema for tenant self-service registration."""

    tenant_name: str
    email: str
    password: str


class DashboardStatsResponse(BaseModel):
    """Schema for returning aggregated tenant workspace statistics."""

    total_campaigns: int
    total_customers: int
    total_orders: int
    open_rate: float
    click_rate: float
    conversion_rate: float
