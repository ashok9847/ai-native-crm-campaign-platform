"""Schemas for Audience Management Workspace."""

import datetime
from typing import Any, Optional
from pydantic import BaseModel

class FilterRule(BaseModel):
    field: str
    operator: str
    value: Any

class AudienceCreate(BaseModel):
    name: str
    description: Optional[str] = None
    filter_criteria: list[FilterRule]

class AudienceResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    filter_criteria: list[FilterRule]
    customer_count: int
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True

class AudienceListResponse(BaseModel):
    total: int
    items: list[AudienceResponse]

class AudiencePreviewRequest(BaseModel):
    filter_criteria: list[FilterRule]

class CustomerSummarySchema(BaseModel):
    id: int
    name: str
    email: str

class AudiencePreviewResponse(BaseModel):
    customer_count: int
    sample_customers: list[CustomerSummarySchema]
