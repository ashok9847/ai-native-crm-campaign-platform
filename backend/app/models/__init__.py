"""ORM model package — import all models here for Alembic autogenerate."""

from app.models.customer import Customer
from app.models.campaign import Campaign, CampaignState
from app.models.segment import Segment, segment_customers
from app.models.message import CampaignMessage
from app.models.delivery import DeliveryEvent
from app.models.order import Order
from app.models.tenant import Tenant, User, CRMField
from app.models.campaign_stats import CampaignStats
from app.models.customer_health import CustomerHealth, HealthZone
from app.models.audience import Audience

__all__ = [
    "Customer",
    "Campaign",
    "CampaignState",
    "Segment",
    "segment_customers",
    "CampaignMessage",
    "DeliveryEvent",
    "Order",
    "Tenant",
    "User",
    "CRMField",
    "CampaignStats",
    "CustomerHealth",
    "HealthZone",
    "Audience",
]
