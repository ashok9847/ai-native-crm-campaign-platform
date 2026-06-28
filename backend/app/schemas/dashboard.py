"""Dashboard response schemas."""

from pydantic import BaseModel


class DashboardMetrics(BaseModel):
    total_customers: int = 0
    total_orders: int = 0
    total_campaigns: int = 0
    attributed_revenue: float = 0.0
    organic_revenue: float = 0.0
    avg_delivery_rate: float = 0.0
    avg_open_rate: float = 0.0
    avg_click_rate: float = 0.0


class CampaignReachItem(BaseModel):
    name: str
    sent: int = 0
    delivered: int = 0
    converted: int = 0


class ChannelUsedItem(BaseModel):
    name: str
    count: int = 0


class CustomerTierItem(BaseModel):
    name: str
    value: int = 0


class RecentCampaignItem(BaseModel):
    id: int
    name: str
    channel: str = "sms"
    state: str
    reach: int = 0
    revenue: float = 0.0
    created_at: str


class DashboardResponse(BaseModel):
    metrics: DashboardMetrics
    campaign_reach: list[CampaignReachItem] = []
    channels_used: list[ChannelUsedItem] = []
    customer_tiers: list[CustomerTierItem] = []
    recent_campaigns: list[RecentCampaignItem] = []
    churn_alert_count: int = 0
