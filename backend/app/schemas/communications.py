"""Communications feed response schemas."""

from pydantic import BaseModel


class CommunicationItem(BaseModel):
    id: int
    customer_name: str
    campaign_name: str
    channel: str = "sms"
    body: str
    status: str
    queued_at: str
    delivered_at: str | None = None


class CommunicationsResponse(BaseModel):
    items: list[CommunicationItem] = []
    total: int = 0
    page: int = 1
    page_size: int = 50
