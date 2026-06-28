"""Health score response schemas."""

from pydantic import BaseModel


class SignalBreakdown(BaseModel):
    score: int
    weight: int
    detail: str = ""


class HealthBreakdown(BaseModel):
    recency: SignalBreakdown
    engagement: SignalBreakdown
    spend: SignalBreakdown
    frequency: SignalBreakdown


class HealthScoreResponse(BaseModel):
    customer_id: int
    score: int
    zone: str
    breakdown: HealthBreakdown
    recommended_action: str | None = None
    computed_at: str


class ChurnAlertCustomerHealth(BaseModel):
    score: int
    zone: str
    weakest_signal: str
    recommended_action: str | None = None


class ChurnAlertItem(BaseModel):
    id: int
    name: str
    email: str
    membership_tier: str = "None"
    health: ChurnAlertCustomerHealth


class ChurnAlertResponse(BaseModel):
    alerts: list[ChurnAlertItem] = []
    total_at_risk: int = 0
    total_churning: int = 0
