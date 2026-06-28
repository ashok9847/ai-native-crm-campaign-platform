"""Analytics response schemas."""

from pydantic import BaseModel


class AnalyticsKPIs(BaseModel):
    total_revenue: float = 0.0
    total_orders: int = 0
    aov: float = 0.0
    global_conversion_rate: float = 0.0


class RevenueTimePoint(BaseModel):
    date: str
    revenue: float = 0.0


class ChannelPerformanceItem(BaseModel):
    name: str
    sent: int = 0
    delivered: int = 0
    opened: int = 0
    clicked: int = 0
    converted: int = 0
    revenue: float = 0.0
    conversion_rate: float = 0.0


class TopCampaignItem(BaseModel):
    id: int
    name: str
    channel: str = "sms"
    target: int = 0
    converted: int = 0
    revenue: float = 0.0


class FunnelStage(BaseModel):
    name: str
    value: int = 0


class AnalyticsResponse(BaseModel):
    kpis: AnalyticsKPIs
    revenue_over_time: list[RevenueTimePoint] = []
    channel_performance: list[ChannelPerformanceItem] = []
    top_campaigns: list[TopCampaignItem] = []
    funnel: list[FunnelStage] = []
