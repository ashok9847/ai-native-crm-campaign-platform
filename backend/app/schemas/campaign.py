"""Pydantic schemas for the Campaign domain."""

import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

from app.core.constants import MAX_INTENT_LENGTH


class FilterCriterion(BaseModel):
    """A single filter rule extracted from the campaign intent by the AI."""

    field: str
    operator: str   # eq | neq | gt | lt | gte | lte | lte_days_ago | in
    value: Any      # str | int | float | list[str]


class CustomerSummary(BaseModel):
    """Minimal customer info used in segment previews."""

    id: int
    name: str
    email: str

    model_config = {"from_attributes": True}


class SegmentDetail(BaseModel):
    """Segment information attached to a campaign detail response."""

    id: int
    customer_count: int
    filter_criteria: list[FilterCriterion]
    sample_customers: list[CustomerSummary]
    large_segment_warning: bool = False

    model_config = {"from_attributes": True}


class MessagePreview(BaseModel):
    """Preview of a single generated (and optionally edited) campaign message."""

    id: int
    customer_id: int
    customer_name: str
    body: str
    edited: bool
    edited_body: str | None
    effective_body: str

    model_config = {"from_attributes": True}


class CampaignResponse(BaseModel):
    """Core campaign fields returned by most endpoints."""

    id: int
    name: str
    intent: str
    state: str
    created_at: datetime.datetime
    state_updated_at: datetime.datetime
    completed_at: datetime.datetime | None = None
    stalled_at: datetime.datetime | None = None
    ai_summary: str | None = None
    audience_id: int | None = None
    audience_name: str | None = None
    channel: str = "sms"
    scheduled_at: datetime.datetime | None = None

    model_config = {"from_attributes": True}


class CampaignDetailResponse(CampaignResponse):
    """Extended campaign response including segment and message previews."""

    segment: SegmentDetail | None = None
    messages: list[MessagePreview] = []


class CampaignListItem(BaseModel):
    """Summary row for the campaign history list."""

    id: int
    name: str
    state: str
    created_at: datetime.datetime
    completed_at: datetime.datetime | None = None
    segment_size: int = 0
    open_rate: float = 0.0
    click_rate: float = 0.0
    stalled_at: datetime.datetime | None = None
    scheduled_at: datetime.datetime | None = None
    channel: str = "sms"
    audience_id: int | None = None

    model_config = {"from_attributes": True}


class CampaignListResponse(BaseModel):
    """Paginated campaign history list."""

    total: int
    page: int
    page_size: int
    items: list[CampaignListItem]


class CreateCampaignRequest(BaseModel):
    """Request body for creating a new campaign."""

    intent: str = Field(..., max_length=MAX_INTENT_LENGTH)
    name: str | None = Field(default=None, max_length=255)
    customer_ids: list[int] | None = Field(
        default=None,
        description="Optional explicit customer ID list — bypasses AI segmentation for follow-up campaigns.",
    )
    channel: str = Field(default="sms", description="The campaign channel: sms | whatsapp | email | rcs")
    scheduled_at: datetime.datetime | None = Field(
        default=None,
        description="Optional scheduled dispatch datetime in UTC."
    )
    campaign_id: int | None = Field(
        default=None,
        description="Optional campaign ID to retry/clarify an existing draft campaign."
    )
    clarification: str | None = Field(
        default=None,
        description="Optional clarification text chosen or input by the user."
    )
    audience_id: int | None = Field(
        default=None,
        description="Optional saved audience ID to target."
    )


class CampaignMetrics(BaseModel):
    """Delivery metrics computed from delivery events."""

    total_recipients: int
    sent: int
    delivered: int
    opened: int
    clicked: int
    failed: int
    purchased: int
    open_rate: float    # opened / delivered; 0.0 if delivered == 0
    click_rate: float   # clicked / opened;   0.0 if opened == 0
    conversion_rate: float # purchased / total_recipients; 0.0 if total_recipients == 0
    attributed_revenue: float = 0.0


class InsightCard(BaseModel):
    """Follow-up insight shown after a complete campaign."""

    clicked_no_purchase_count: int
    clicked_count: int
    purchased_count: int
    suggested_followup_intent: str
    clicked_customer_ids: list[int] = []  # exact IDs of clicker customers for targeted follow-up


class CampaignResultsResponse(BaseModel):
    """Full results for a COMPLETE campaign."""

    campaign_id: int
    ai_summary: str
    metrics: CampaignMetrics
    insight_card: InsightCard | None = None
    clicked_customers: list[CustomerSummary] = []
    purchased_customers: list[CustomerSummary] = []


class CampaignUpdateRequest(BaseModel):
    """Request body for updating campaign settings in REVIEWING state."""

    name: Optional[str] = None
    channel: Optional[str] = None
    scheduled_at: Optional[datetime.datetime] = None
    audience_id: Optional[int] = None
    filter_criteria: Optional[list[FilterCriterion]] = None

