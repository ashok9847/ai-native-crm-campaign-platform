"""Tenant service — registration, self-service tenant setup, mock data seeding, and dashboard statistics."""

import datetime
import logging
from typing import Any

from sqlalchemy import select, text, distinct, func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, create_access_token
from app.models.tenant import Tenant, User, CRMField
from app.models.customer import Customer
from app.models.order import Order
from app.models.campaign import Campaign
from app.models.message import CampaignMessage
from app.models.delivery import DeliveryEvent

logger = logging.getLogger(__name__)


async def register_tenant_and_user(
    db: AsyncSession,
    tenant_name: str,
    email: str,
    password: str
) -> dict[str, str]:
    """Register a new tenant workspace and administrator user.

    Bypasses row-level security (RLS) during registration because no JWT
    context is present yet.
    """
    logger.info("Registering tenant: %s, admin email: %s", tenant_name, email)

    # 1. Bypass RLS for registration transaction
    await db.execute(text("SELECT set_config('app.bypass_rls', 'true', true)"))

    # 2. Check if the user email is already registered
    existing_user = await db.execute(select(User).where(User.email == email))
    if existing_user.scalar_one_or_none() is not None:
        raise ValueError("Email already registered")

    # 3. Create Tenant
    tenant = Tenant(name=tenant_name)
    db.add(tenant)
    await db.flush()  # Populates tenant.id

    # 4. Create User under Tenant
    hashed_pw = hash_password(password)
    user = User(
        tenant_id=tenant.id,
        email=email,
        hashed_password=hashed_pw
    )
    db.add(user)
    await db.commit()

    # 5. Generate access token
    access_token = create_access_token(subject=user.id, tenant_id=tenant.id)
    return {
        "access_token": access_token,
        "token_type": "bearer"
    }


async def seed_mock_coffee_shop_data(db: AsyncSession, tenant_id: int) -> dict[str, Any]:
    """Seed the active tenant's workspace with a standard coffee-shop mock dataset.

    Contains exactly 9 customers, 15 orders, and 1 custom CRM field.
    """
    logger.info("Seeding mock coffee-shop data for tenant ID: %d", tenant_id)

    # 1. Setup CRM Field if not already exists
    crm_field_stmt = pg_insert(CRMField).values(
        tenant_id=tenant_id,
        entity_type="customer",
        field_name="preferred_roast",
        field_type="enum",
        description="Preferred roast profile of the customer.",
        allowed_enums=["Light", "Medium", "Dark"]
    ).on_conflict_do_nothing(constraint="uq_crm_fields_tenant_entity_field")
    await db.execute(crm_field_stmt)
    await db.flush()

    # Get crm_fields count for tenant
    crm_count_res = await db.execute(
        select(CRMField).where(CRMField.tenant_id == tenant_id)
    )
    crm_fields_count = len(crm_count_res.scalars().all())

    # 2. Seed 9 Mock Customers
    mock_customers = [
        {"name": "Aarav Mehta", "email": "aarav.mehta@coffeeshop.com", "subscription_tier": "starter", "roast_preference": "medium", "last_order_date": datetime.date.today() - datetime.timedelta(days=2), "lifetime_value": 150.00, "city": "Mumbai", "crm_metadata": {"preferred_roast": "Medium"}},
        {"name": "Diya Sen", "email": "diya.sen@coffeeshop.com", "subscription_tier": "premium", "roast_preference": "light", "last_order_date": datetime.date.today() - datetime.timedelta(days=5), "lifetime_value": 450.00, "city": "Kolkata", "crm_metadata": {"preferred_roast": "Light"}},
        {"name": "Kabir Singh", "email": "kabir.singh@coffeeshop.com", "subscription_tier": "elite", "roast_preference": "dark", "last_order_date": datetime.date.today() - datetime.timedelta(days=1), "lifetime_value": 1200.00, "city": "Delhi", "crm_metadata": {"preferred_roast": "Dark"}},
        {"name": "Isha Patel", "email": "isha.patel@coffeeshop.com", "subscription_tier": "starter", "roast_preference": "medium", "last_order_date": datetime.date.today() - datetime.timedelta(days=15), "lifetime_value": 80.00, "city": "Ahmedabad", "crm_metadata": {"preferred_roast": "Medium"}},
        {"name": "Rohan Das", "email": "rohan.das@coffeeshop.com", "subscription_tier": "premium", "roast_preference": "dark", "last_order_date": datetime.date.today() - datetime.timedelta(days=10), "lifetime_value": 350.00, "city": "Bangalore", "crm_metadata": {"preferred_roast": "Dark"}},
        {"name": "Zara Ali", "email": "zara.ali@coffeeshop.com", "subscription_tier": "elite", "roast_preference": "light", "last_order_date": datetime.date.today() - datetime.timedelta(days=3), "lifetime_value": 950.00, "city": "Hyderabad", "crm_metadata": {"preferred_roast": "Light"}},
        {"name": "Ananya Nair", "email": "ananya.nair@coffeeshop.com", "subscription_tier": "starter", "roast_preference": "medium", "last_order_date": datetime.date.today() - datetime.timedelta(days=30), "lifetime_value": 50.00, "city": "Chennai", "crm_metadata": {"preferred_roast": "Medium"}},
        {"name": "Dev Sharma", "email": "dev.sharma@coffeeshop.com", "subscription_tier": "premium", "roast_preference": "light", "last_order_date": datetime.date.today() - datetime.timedelta(days=8), "lifetime_value": 280.00, "city": "Pune", "crm_metadata": {"preferred_roast": "Light"}},
        {"name": "Riya Kapoor", "email": "riya.kapoor@coffeeshop.com", "subscription_tier": "starter", "roast_preference": "dark", "last_order_date": datetime.date.today() - datetime.timedelta(days=22), "lifetime_value": 90.00, "city": "Noida", "crm_metadata": {"preferred_roast": "Dark"}},
    ]

    for mc in mock_customers:
        cust_stmt = pg_insert(Customer).values(
            tenant_id=tenant_id,
            name=mc["name"],
            email=mc["email"],
            subscription_tier=mc["subscription_tier"],
            roast_preference=mc["roast_preference"],
            last_order_date=mc["last_order_date"],
            lifetime_value=mc["lifetime_value"],
            city=mc["city"],
            crm_metadata=mc["crm_metadata"]
        ).on_conflict_do_nothing(index_elements=["tenant_id", "email"])
        await db.execute(cust_stmt)

    await db.flush()

    # Get customers email to id mapping for this tenant
    cust_res = await db.execute(
        select(Customer.id, Customer.email).where(Customer.tenant_id == tenant_id)
    )
    cust_map = {email: cid for cid, email in cust_res.all()}

    # 3. Seed 15 Mock Orders
    mock_orders = [
        # Aarav Mehta
        {"customer_email": "aarav.mehta@coffeeshop.com", "order_date": datetime.date.today() - datetime.timedelta(days=2), "total_amount": 75.00, "items": [{"name": "Cappuccino", "qty": 2, "price": 25.00}, {"name": "Croissant", "qty": 1, "price": 25.00}], "source_channel": "web"},
        {"customer_email": "aarav.mehta@coffeeshop.com", "order_date": datetime.date.today() - datetime.timedelta(days=12), "total_amount": 75.00, "items": [{"name": "Latte", "qty": 2, "price": 30.00}, {"name": "Cookie", "qty": 1, "price": 15.00}], "source_channel": "mobile"},
        # Diya Sen
        {"customer_email": "diya.sen@coffeeshop.com", "order_date": datetime.date.today() - datetime.timedelta(days=5), "total_amount": 200.00, "items": [{"name": "Pour Over Blend", "qty": 1, "price": 120.00}, {"name": "Espresso Blend", "qty": 1, "price": 80.00}], "source_channel": "web"},
        {"customer_email": "diya.sen@coffeeshop.com", "order_date": datetime.date.today() - datetime.timedelta(days=20), "total_amount": 250.00, "items": [{"name": "Cold Brew Kit", "qty": 1, "price": 250.00}], "source_channel": "web"},
        # Kabir Singh
        {"customer_email": "kabir.singh@coffeeshop.com", "order_date": datetime.date.today() - datetime.timedelta(days=1), "total_amount": 600.00, "items": [{"name": "Hand Coffee Grinder", "qty": 1, "price": 600.00}], "source_channel": "in-store"},
        {"customer_email": "kabir.singh@coffeeshop.com", "order_date": datetime.date.today() - datetime.timedelta(days=15), "total_amount": 600.00, "items": [{"name": "Ceramic V60 Dripper", "qty": 1, "price": 400.00}, {"name": "Dark Roast 250g", "qty": 2, "price": 100.00}], "source_channel": "web"},
        # Isha Patel
        {"customer_email": "isha.patel@coffeeshop.com", "order_date": datetime.date.today() - datetime.timedelta(days=15), "total_amount": 80.00, "items": [{"name": "Mocha", "qty": 2, "price": 40.00}], "source_channel": "mobile"},
        # Rohan Das
        {"customer_email": "rohan.das@coffeeshop.com", "order_date": datetime.date.today() - datetime.timedelta(days=10), "total_amount": 150.00, "items": [{"name": "French Press", "qty": 1, "price": 150.00}], "source_channel": "in-store"},
        {"customer_email": "rohan.das@coffeeshop.com", "order_date": datetime.date.today() - datetime.timedelta(days=25), "total_amount": 200.00, "items": [{"name": "Dark Roast 250g", "qty": 4, "price": 50.00}], "source_channel": "web"},
        # Zara Ali
        {"customer_email": "zara.ali@coffeeshop.com", "order_date": datetime.date.today() - datetime.timedelta(days=3), "total_amount": 450.00, "items": [{"name": "Single-Origin Light Roast", "qty": 3, "price": 150.00}], "source_channel": "web"},
        {"customer_email": "zara.ali@coffeeshop.com", "order_date": datetime.date.today() - datetime.timedelta(days=18), "total_amount": 500.00, "items": [{"name": "French Press Premium", "qty": 1, "price": 350.00}, {"name": "Filter Papers", "qty": 1, "price": 150.00}], "source_channel": "mobile"},
        # Ananya Nair
        {"customer_email": "ananya.nair@coffeeshop.com", "order_date": datetime.date.today() - datetime.timedelta(days=30), "total_amount": 50.00, "items": [{"name": "Iced Americano", "qty": 2, "price": 25.00}], "source_channel": "in-store"},
        # Dev Sharma
        {"customer_email": "dev.sharma@coffeeshop.com", "order_date": datetime.date.today() - datetime.timedelta(days=8), "total_amount": 180.00, "items": [{"name": "Light Roast 250g", "qty": 2, "price": 90.00}], "source_channel": "web"},
        {"customer_email": "dev.sharma@coffeeshop.com", "order_date": datetime.date.today() - datetime.timedelta(days=28), "total_amount": 100.00, "items": [{"name": "Macchiato", "qty": 4, "price": 25.00}], "source_channel": "mobile"},
        # Riya Kapoor
        {"customer_email": "riya.kapoor@coffeeshop.com", "order_date": datetime.date.today() - datetime.timedelta(days=22), "total_amount": 90.00, "items": [{"name": "Americano", "qty": 3, "price": 30.00}], "source_channel": "in-store"},
    ]

    orders_seeded = 0
    # To keep seeding idempotent, only seed orders if the tenant has no orders
    existing_orders_res = await db.execute(
        select(Order).where(Order.tenant_id == tenant_id).limit(1)
    )
    if existing_orders_res.scalar_one_or_none() is None:
        for mo in mock_orders:
            cid = cust_map.get(mo["customer_email"])
            if cid is not None:
                order = Order(
                    tenant_id=tenant_id,
                    customer_id=cid,
                    order_date=mo["order_date"],
                    total_amount=mo["total_amount"],
                    items=mo["items"],
                    source_channel=mo["source_channel"]
                )
                db.add(order)
                orders_seeded += 1
        await db.flush()

    await db.commit()

    # Count final customers and orders
    cust_count_res = await db.execute(
        select(Customer).where(Customer.tenant_id == tenant_id)
    )
    customers_count = len(cust_count_res.scalars().all())

    ord_count_res = await db.execute(
        select(Order).where(Order.tenant_id == tenant_id)
    )
    orders_count = len(ord_count_res.scalars().all())

    return {
        "seeded": True,
        "customers_count": customers_count,
        "orders_count": orders_count,
        "crm_fields_count": crm_fields_count
    }


async def get_dashboard_statistics(db: AsyncSession, tenant_id: int) -> dict[str, Any]:
    """Retrieve workspace metrics aggregated for the active tenant."""
    logger.info("Fetching dashboard statistics for tenant ID: %d", tenant_id)

    # 1. Total Campaigns count
    campaigns_count_stmt = select(func.count(Campaign.id)).where(Campaign.tenant_id == tenant_id)
    campaigns_count_res = await db.execute(campaigns_count_stmt)
    total_campaigns = campaigns_count_res.scalar() or 0

    # 2. Total Customers count
    customers_count_stmt = select(func.count(Customer.id)).where(Customer.tenant_id == tenant_id)
    customers_count_res = await db.execute(customers_count_stmt)
    total_customers = customers_count_res.scalar() or 0

    # 3. Total Orders count
    orders_count_stmt = select(func.count(Order.id)).where(Order.tenant_id == tenant_id)
    orders_count_res = await db.execute(orders_count_stmt)
    total_orders = orders_count_res.scalar() or 0

    # 4. Aggregated delivery metrics
    delivery_stmt = (
        select(
            func.count(distinct(CampaignMessage.id)).label("total"),
            func.count(DeliveryEvent.id).filter(DeliveryEvent.status == "sent").label("sent"),
            func.count(DeliveryEvent.id).filter(DeliveryEvent.status == "delivered").label("delivered"),
            func.count(DeliveryEvent.id).filter(DeliveryEvent.status == "opened").label("opened"),
            func.count(DeliveryEvent.id).filter(DeliveryEvent.status == "clicked").label("clicked"),
            func.count(DeliveryEvent.id).filter(DeliveryEvent.status == "failed").label("failed"),
            func.count(DeliveryEvent.id).filter(DeliveryEvent.status == "purchased").label("purchased"),
        )
        .select_from(CampaignMessage)
        .outerjoin(DeliveryEvent, DeliveryEvent.campaign_message_id == CampaignMessage.id)
        .where(CampaignMessage.tenant_id == tenant_id)
    )
    delivery_res = await db.execute(delivery_stmt)
    row = delivery_res.one()

    total_recipients = row.total or 0
    delivered = row.delivered or 0
    opened = row.opened or 0
    clicked = row.clicked or 0
    purchased = row.purchased or 0

    open_rate = round(opened / delivered, 3) if delivered > 0 else 0.0
    click_rate = round(clicked / opened, 3) if opened > 0 else 0.0
    conversion_rate = round(purchased / total_recipients, 3) if total_recipients > 0 else 0.0

    return {
        "total_campaigns": total_campaigns,
        "total_customers": total_customers,
        "total_orders": total_orders,
        "open_rate": open_rate,
        "click_rate": click_rate,
        "conversion_rate": conversion_rate,
    }
