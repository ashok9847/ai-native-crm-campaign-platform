"""Customer service — seed, CSV import, and paginated list."""

from __future__ import annotations

import csv
import datetime
import io
import logging
from typing import Any

from pydantic import ValidationError
from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import DEFAULT_PAGE_SIZE
from app.models.customer import Customer
from app.models.tenant import CRMField
from app.services import ai_service
from app.schemas.customer import (
    CustomerCreate,
    CustomerListResponse,
    CustomerResponse,
    ImportResult,
    ImportRowError,
    SeedResult,
)

logger = logging.getLogger(__name__)

# ── Seed data ─────────────────────────────────────────────────────────────────
# 42 realistic BrewMate D2C coffee subscription customers.
# Deliberately varied so demo segmentation queries return interesting subsets:
#   • Mix of starter / premium / elite tiers
#   • last_order_date spread: some recent (<7d), some mid (8–30d), many stale (>30d)
#   • Wide lifetime_value range per tier
_SEED_CUSTOMERS: list[dict] = [
    # ── Starter tier ──────────────────────────────────────────────────────────
    {"name": "Arjun Sharma",     "email": "arjun.sharma@example.com",     "subscription_tier": "starter", "roast_preference": "medium",       "last_order_date": datetime.date.today() - datetime.timedelta(days=5),   "lifetime_value": 1200.00, "city": "Delhi"},
    {"name": "Priya Nair",       "email": "priya.nair@example.com",       "subscription_tier": "starter", "roast_preference": "light",        "last_order_date": datetime.date.today() - datetime.timedelta(days=12),  "lifetime_value": 850.00,  "city": "Kochi"},
    {"name": "Rahul Gupta",      "email": "rahul.gupta@example.com",      "subscription_tier": "starter", "roast_preference": "dark",         "last_order_date": datetime.date.today() - datetime.timedelta(days=45),  "lifetime_value": 620.00,  "city": "Lucknow"},
    {"name": "Sneha Pillai",     "email": "sneha.pillai@example.com",     "subscription_tier": "starter", "roast_preference": "medium",       "last_order_date": datetime.date.today() - datetime.timedelta(days=62),  "lifetime_value": 490.00,  "city": "Thiruvananthapuram"},
    {"name": "Mohit Verma",      "email": "mohit.verma@example.com",      "subscription_tier": "starter", "roast_preference": "espresso",     "last_order_date": datetime.date.today() - datetime.timedelta(days=90),  "lifetime_value": 380.00,  "city": "Jaipur"},
    {"name": "Kavitha Rao",      "email": "kavitha.rao@example.com",      "subscription_tier": "starter", "roast_preference": "light",        "last_order_date": datetime.date.today() - datetime.timedelta(days=7),   "lifetime_value": 1050.00, "city": "Mysore"},
    {"name": "Deepak Joshi",     "email": "deepak.joshi@example.com",     "subscription_tier": "starter", "roast_preference": "medium",       "last_order_date": datetime.date.today() - datetime.timedelta(days=38),  "lifetime_value": 760.00,  "city": "Ahmedabad"},
    {"name": "Ananya Singh",     "email": "ananya.singh@example.com",     "subscription_tier": "starter", "roast_preference": "dark",         "last_order_date": datetime.date.today() - datetime.timedelta(days=55),  "lifetime_value": 530.00,  "city": "Chandigarh"},
    {"name": "Vikram Patel",     "email": "vikram.patel@example.com",     "subscription_tier": "starter", "roast_preference": "single-origin","last_order_date": datetime.date.today() - datetime.timedelta(days=3),   "lifetime_value": 1400.00, "city": "Surat"},
    {"name": "Meera Iyer",       "email": "meera.iyer@example.com",       "subscription_tier": "starter", "roast_preference": "light",        "last_order_date": datetime.date.today() - datetime.timedelta(days=75),  "lifetime_value": 310.00,  "city": "Coimbatore"},
    {"name": "Suresh Babu",      "email": "suresh.babu@example.com",      "subscription_tier": "starter", "roast_preference": "medium",       "last_order_date": datetime.date.today() - datetime.timedelta(days=100), "lifetime_value": 290.00,  "city": "Vizag"},
    {"name": "Pooja Menon",      "email": "pooja.menon@example.com",      "subscription_tier": "starter", "roast_preference": "espresso",     "last_order_date": datetime.date.today() - datetime.timedelta(days=22),  "lifetime_value": 870.00,  "city": "Nagpur"},
    {"name": "Aakash Tiwari",    "email": "aakash.tiwari@example.com",    "subscription_tier": "starter", "roast_preference": "dark",         "last_order_date": datetime.date.today() - datetime.timedelta(days=48),  "lifetime_value": 640.00,  "city": "Bhopal"},
    {"name": "Rina Chakraborty", "email": "rina.chakraborty@example.com", "subscription_tier": "starter", "roast_preference": "medium",       "last_order_date": datetime.date.today() - datetime.timedelta(days=14),  "lifetime_value": 920.00,  "city": "Kolkata"},
    {"name": "Gaurav Mehta",     "email": "gaurav.mehta@example.com",     "subscription_tier": "starter", "roast_preference": "light",        "last_order_date": datetime.date.today() - datetime.timedelta(days=120), "lifetime_value": 210.00,  "city": "Indore"},
    # ── Premium tier ──────────────────────────────────────────────────────────
    {"name": "Neha Kulkarni",    "email": "neha.kulkarni@example.com",    "subscription_tier": "premium", "roast_preference": "single-origin","last_order_date": datetime.date.today() - datetime.timedelta(days=4),   "lifetime_value": 4200.00, "city": "Pune"},
    {"name": "Rohan Desai",      "email": "rohan.desai@example.com",      "subscription_tier": "premium", "roast_preference": "medium",       "last_order_date": datetime.date.today() - datetime.timedelta(days=35),  "lifetime_value": 3800.00, "city": "Mumbai"},
    {"name": "Shivani Kapoor",   "email": "shivani.kapoor@example.com",   "subscription_tier": "premium", "roast_preference": "dark",         "last_order_date": datetime.date.today() - datetime.timedelta(days=42),  "lifetime_value": 5100.00, "city": "Delhi"},
    {"name": "Abhishek Mishra",  "email": "abhishek.mishra@example.com",  "subscription_tier": "premium", "roast_preference": "espresso",     "last_order_date": datetime.date.today() - datetime.timedelta(days=58),  "lifetime_value": 6300.00, "city": "Bangalore"},
    {"name": "Tanvi Reddy",      "email": "tanvi.reddy@example.com",      "subscription_tier": "premium", "roast_preference": "light",        "last_order_date": datetime.date.today() - datetime.timedelta(days=67),  "lifetime_value": 4750.00, "city": "Hyderabad"},
    {"name": "Karan Malhotra",   "email": "karan.malhotra@example.com",   "subscription_tier": "premium", "roast_preference": "single-origin","last_order_date": datetime.date.today() - datetime.timedelta(days=31),  "lifetime_value": 5600.00, "city": "Gurgaon"},
    {"name": "Divya Nambiar",    "email": "divya.nambiar@example.com",    "subscription_tier": "premium", "roast_preference": "medium",       "last_order_date": datetime.date.today() - datetime.timedelta(days=88),  "lifetime_value": 3200.00, "city": "Chennai"},
    {"name": "Saurav Roy",       "email": "saurav.roy@example.com",       "subscription_tier": "premium", "roast_preference": "dark",         "last_order_date": datetime.date.today() - datetime.timedelta(days=9),   "lifetime_value": 4900.00, "city": "Kolkata"},
    {"name": "Ishaan Bose",      "email": "ishaan.bose@example.com",      "subscription_tier": "premium", "roast_preference": "espresso",     "last_order_date": datetime.date.today() - datetime.timedelta(days=52),  "lifetime_value": 7100.00, "city": "Noida"},
    {"name": "Aditi Pandey",     "email": "aditi.pandey@example.com",     "subscription_tier": "premium", "roast_preference": "light",        "last_order_date": datetime.date.today() - datetime.timedelta(days=77),  "lifetime_value": 2900.00, "city": "Varanasi"},
    {"name": "Nikhil Jain",      "email": "nikhil.jain@example.com",      "subscription_tier": "premium", "roast_preference": "single-origin","last_order_date": datetime.date.today() - datetime.timedelta(days=40),  "lifetime_value": 6800.00, "city": "Jaipur"},
    {"name": "Preethi Subramanian","email": "preethi.s@example.com",      "subscription_tier": "premium", "roast_preference": "medium",       "last_order_date": datetime.date.today() - datetime.timedelta(days=95),  "lifetime_value": 3400.00, "city": "Coimbatore"},
    {"name": "Ankit Agarwal",    "email": "ankit.agarwal@example.com",    "subscription_tier": "premium", "roast_preference": "dark",         "last_order_date": datetime.date.today() - datetime.timedelta(days=33),  "lifetime_value": 5300.00, "city": "Agra"},
    {"name": "Shruti Banerjee",  "email": "shruti.banerjee@example.com",  "subscription_tier": "premium", "roast_preference": "espresso",     "last_order_date": datetime.date.today() - datetime.timedelta(days=115), "lifetime_value": 2700.00, "city": "Howrah"},
    {"name": "Yash Trivedi",     "email": "yash.trivedi@example.com",     "subscription_tier": "premium", "roast_preference": "light",        "last_order_date": datetime.date.today() - datetime.timedelta(days=18),  "lifetime_value": 4400.00, "city": "Ahmedabad"},
    {"name": "Sonal Bhatt",      "email": "sonal.bhatt@example.com",      "subscription_tier": "premium", "roast_preference": "single-origin","last_order_date": datetime.date.today() - datetime.timedelta(days=60),  "lifetime_value": 5900.00, "city": "Surat"},
    {"name": "Rajan Nair",       "email": "rajan.nair@example.com",       "subscription_tier": "premium", "roast_preference": "medium",       "last_order_date": datetime.date.today() - datetime.timedelta(days=130), "lifetime_value": 2100.00, "city": "Thrissur"},
    # ── Elite tier ────────────────────────────────────────────────────────────
    {"name": "Vikramjit Singh",  "email": "vikramjit.singh@example.com",  "subscription_tier": "elite",   "roast_preference": "single-origin","last_order_date": datetime.date.today() - datetime.timedelta(days=6),   "lifetime_value": 18500.00,"city": "Delhi"},
    {"name": "Lakshmi Narayan",  "email": "lakshmi.narayan@example.com",  "subscription_tier": "elite",   "roast_preference": "dark",         "last_order_date": datetime.date.today() - datetime.timedelta(days=28),  "lifetime_value": 14200.00,"city": "Bangalore"},
    {"name": "Mihir Shah",       "email": "mihir.shah@example.com",       "subscription_tier": "elite",   "roast_preference": "espresso",     "last_order_date": datetime.date.today() - datetime.timedelta(days=50),  "lifetime_value": 22000.00,"city": "Mumbai"},
    {"name": "Nandita Krishnan", "email": "nandita.krishnan@example.com", "subscription_tier": "elite",   "roast_preference": "single-origin","last_order_date": datetime.date.today() - datetime.timedelta(days=85),  "lifetime_value": 11800.00,"city": "Chennai"},
    {"name": "Parth Oberoi",     "email": "parth.oberoi@example.com",     "subscription_tier": "elite",   "roast_preference": "light",        "last_order_date": datetime.date.today() - datetime.timedelta(days=15),  "lifetime_value": 16400.00,"city": "Gurgaon"},
    {"name": "Sunaina Thakur",   "email": "sunaina.thakur@example.com",   "subscription_tier": "elite",   "roast_preference": "medium",       "last_order_date": datetime.date.today() - datetime.timedelta(days=110), "lifetime_value": 9600.00, "city": "Shimla"},
    {"name": "Devraj Choudhary", "email": "devraj.choudhary@example.com", "subscription_tier": "elite",   "roast_preference": "dark",         "last_order_date": datetime.date.today() - datetime.timedelta(days=37),  "lifetime_value": 20300.00,"city": "Jaipur"},
    {"name": "Harini Venkatesh", "email": "harini.venkatesh@example.com", "subscription_tier": "elite",   "roast_preference": "single-origin","last_order_date": datetime.date.today() - datetime.timedelta(days=72),  "lifetime_value": 13100.00,"city": "Hyderabad"},
    {"name": "Aditya Rawal",     "email": "aditya.rawal@example.com",     "subscription_tier": "elite",   "roast_preference": "espresso",     "last_order_date": datetime.date.today() - datetime.timedelta(days=2),   "lifetime_value": 24500.00,"city": "Pune"},
    {"name": "Meghna Saxena",    "email": "meghna.saxena@example.com",    "subscription_tier": "elite",   "roast_preference": "medium",       "last_order_date": datetime.date.today() - datetime.timedelta(days=140), "lifetime_value": 8900.00, "city": "Lucknow"},
]

assert len(_SEED_CUSTOMERS) == 42, "Seed list must contain exactly 42 customers"


# ── Public service functions ───────────────────────────────────────────────────

async def seed_customers(db: AsyncSession, tenant_id: int) -> SeedResult:
    """Pre-load 42 BrewMate customers. Idempotent via ON CONFLICT DO NOTHING."""
    records = [{**c, "tenant_id": tenant_id, "crm_metadata": {}} for c in _SEED_CUSTOMERS]
    stmt = pg_insert(Customer).values(records)
    stmt = stmt.on_conflict_do_nothing(index_elements=["tenant_id", "email"])
    result = await db.execute(stmt)
    await db.commit()

    inserted = result.rowcount if result.rowcount >= 0 else 0
    skipped = len(_SEED_CUSTOMERS) - inserted
    logger.info("Seed: %d inserted, %d skipped (already existed)", inserted, skipped)
    
    # Auto-generate matching order records
    await auto_populate_missing_orders(db, tenant_id=tenant_id)
    
    return SeedResult(seeded=inserted, skipped=skipped)


async def import_customers_from_csv(
    file_bytes: bytes,
    db: AsyncSession,
    tenant_id: int = 1,
) -> ImportResult:
    """Parse a CSV file and bulk-import valid customer rows.

    Returns row-level errors for invalid / duplicate entries without aborting
    the whole import. Dynamically infers unmapped headers via LLM and saves them
    as CRMField records, storing field values in the customer metadata column.
    """
    errors: list[ImportRowError] = []
    valid_rows: list[dict] = []
    new_fields_inferred: list[dict] = []

    text_stream = io.StringIO(file_bytes.decode("utf-8", errors="replace"))
    reader = csv.DictReader(text_stream)

    # Normalise header keys to lowercase
    if reader.fieldnames is None:
        return ImportResult(imported=0, skipped=0, errors=[
            ImportRowError(row=0, email="", reason="CSV file has no header row")
        ], new_fields_inferred=[])

    # 1. Identify unmapped headers
    standard_headers = {"name", "email", "subscription_tier", "roast_preference", "last_order_date", "lifetime_value", "city"}
    csv_headers = [h.strip() for h in reader.fieldnames if h.strip()]
    normalized_headers = {h.lower(): h for h in csv_headers}
    
    unmapped_normalized = [h for h in normalized_headers if h not in standard_headers]

    # Fetch existing fields for this tenant to avoid re-inferring
    existing_fields_res = await db.execute(
        select(CRMField.field_name).where(CRMField.tenant_id == tenant_id, CRMField.entity_type == "customer")
    )
    existing_fields = set(existing_fields_res.scalars().all())

    # We read all rows to memory so we can collect sample values and import them
    all_rows = list(reader)
    
    # 2. For each unmapped header that is not yet in DB, collect sample values and infer schema
    fields_to_infer = [h for h in unmapped_normalized if h not in existing_fields]
    
    if fields_to_infer:
        for norm_header in fields_to_infer:
            original_header = normalized_headers[norm_header]
            # Collect up to 5 non-null, non-empty samples
            samples = []
            for r in all_rows:
                val = r.get(original_header, "").strip()
                if val:
                    samples.append(val)
                    if len(samples) >= 5:
                        break
            
            # If we don't have any samples, default to a string field
            if not samples:
                inferred = {
                    "field_type": "string",
                    "description": f"Custom field '{original_header}' imported via CSV.",
                    "allowed_enums": None
                }
            else:
                try:
                    inferred = await ai_service.infer_schema(original_header, samples)
                except Exception as exc:
                    logger.error("Error inferring schema for %s: %s", original_header, exc)
                    inferred = {
                        "field_type": "string",
                        "description": f"Custom field '{original_header}' imported via CSV.",
                        "allowed_enums": None
                    }
            
            # Save the new CRMField
            new_field = CRMField(
                tenant_id=tenant_id,
                entity_type="customer",
                field_name=norm_header,
                field_type=inferred.get("field_type", "string"),
                description=inferred.get("description", ""),
                allowed_enums=inferred.get("allowed_enums")
            )
            db.add(new_field)
            new_fields_inferred.append({
                "field_name": norm_header,
                "field_type": inferred.get("field_type", "string"),
                "description": inferred.get("description", ""),
                "allowed_enums": inferred.get("allowed_enums") or []
            })
        await db.flush()

    # 3. Process each row
    for row_index, raw_row in enumerate(all_rows, start=1):
        # Normalise keys to lowercase
        row = {k.strip().lower(): v.strip() for k, v in raw_row.items() if k}

        # Apply fallback defaults for missing standard fields in custom/unmapped CSVs
        if "name" not in row or not row["name"]:
            row["name"] = "Valued Customer"
        if "roast_preference" not in row or not row["roast_preference"]:
            row["roast_preference"] = "none"
        if "subscription_tier" not in row or not row["subscription_tier"]:
            row["subscription_tier"] = "starter"
        if "city" not in row or not row["city"]:
            row["city"] = "Unknown"
        if "last_order_date" not in row or not row["last_order_date"]:
            row["last_order_date"] = datetime.date.today().isoformat()
        if "lifetime_value" not in row or not row["lifetime_value"]:
            row["lifetime_value"] = "0.0"

        email = row.get("email", "")
        # Build metadata from unmapped columns
        crm_metadata = {}
        for h in unmapped_normalized:
            orig_header = normalized_headers[h]
            val = raw_row.get(orig_header, "").strip()
            if val:
                crm_metadata[h] = val

        try:
            # Validate standard fields using CustomerCreate
            validated = CustomerCreate(**row)
            cust_dict = validated.model_dump()
            cust_dict["tenant_id"] = tenant_id
            cust_dict["crm_metadata"] = crm_metadata
            valid_rows.append(cust_dict)
        except (ValidationError, Exception) as exc:
            reason = str(exc).split("\n")[0][:200]
            errors.append(ImportRowError(row=row_index, email=email, reason=reason))

    if not valid_rows:
        return ImportResult(
            imported=0,
            skipped=len(errors),
            errors=errors,
            new_fields_inferred=new_fields_inferred
        )

    # 4. Insert valid rows
    stmt = pg_insert(Customer).values(valid_rows)
    stmt = stmt.on_conflict_do_nothing(index_elements=["tenant_id", "email"])
    result = await db.execute(stmt)
    await db.commit()

    # Generate orders for new customers who don't have orders yet
    await auto_populate_missing_orders(db, tenant_id=tenant_id)

    inserted = result.rowcount if result.rowcount >= 0 else 0
    duplicate_count = len(valid_rows) - inserted
    logger.info(
        "CSV import: %d inserted, %d duplicates, %d validation errors",
        inserted, duplicate_count, len(errors),
    )
    return ImportResult(
        imported=inserted,
        skipped=duplicate_count,
        errors=errors,
        new_fields_inferred=new_fields_inferred
    )


async def list_customers(
    db: AsyncSession,
    tenant_id: int,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> CustomerListResponse:
    """Return a paginated list of all customers ordered by id."""
    offset = (page - 1) * page_size

    total: int = await db.scalar(
        select(func.count()).select_from(Customer).where(Customer.tenant_id == tenant_id)
    ) or 0
    rows = await db.execute(
        select(Customer)
        .where(Customer.tenant_id == tenant_id)
        .order_by(Customer.id)
        .offset(offset)
        .limit(page_size)
    )
    customers = rows.scalars().all()

    return CustomerListResponse(
        total=total,
        page=page,
        page_size=page_size,
        items=[CustomerResponse.model_validate(c) for c in customers],
    )


async def _generate_and_insert_customer_orders(
    customers_info: list[dict],
    db: AsyncSession,
) -> None:
    """Generate realistic orders for a list of customers to match their LTV and last order date."""
    import random
    from app.models.order import Order

    orders_to_create = []
    for c in customers_info:
        ltv = float(c["lifetime_value"])
        if ltv <= 0:
            continue

        last_date = c["last_order_date"]
        if isinstance(last_date, str):
            try:
                last_date = datetime.datetime.strptime(last_date, "%Y-%m-%d").date()
            except ValueError:
                last_date = datetime.date.today()

        roast = c.get("roast_preference", "medium")

        # Always generate 3 to 8 orders per customer
        num_orders = random.randint(3, 8)

        parts = [random.random() for _ in range(num_orders)]
        total_parts = sum(parts)
        portions = [round((p / total_parts) * ltv, 2) for p in parts]
        diff = round(ltv - sum(portions), 2)
        portions[0] = round(portions[0] + diff, 2)

        blends = {
            "medium": ["Morning Bloom Blend", "BrewMate Classic", "Mysore Nuggets"],
            "dark": ["Monsooned Malabar", "Dark Forest Stout", "Double Roast Espresso"],
            "light": ["Araku Valley Light", "Mild Summer Roast", "Peaberry Special"],
            "espresso": ["Classic Espresso Crema", "Italian Velvet Roast", "Dark Roast Espresso"],
            "single-origin": ["Nilgiris Single Origin", "Waynad Wild Robusta", "Baba Budangiri Arabica"]
        }
        possible_blends = blends.get(roast, ["BrewMate Signature Blend"])
        for idx, amt in enumerate(portions):
            if amt <= 0:
                continue
            if idx == 0:
                o_date = last_date
            else:
                o_date = last_date - datetime.timedelta(days=random.randint(15 * idx, 45 * idx + 15))
            
            blend = random.choice(possible_blends)
            source_chan = random.choice(["web", "mobile", "in-store"])

            # Generate realistic items JSON list
            if amt > 1200 and random.random() < 0.5:
                coffee_qty = random.randint(1, 2)
                coffee_price = round((amt * random.uniform(0.4, 0.6)) / coffee_qty, 2)
                coffee_total = round(coffee_price * coffee_qty, 2)
                tool_name = random.choice(["French Press", "Cold Brew Kit", "Ceramic V60 Dripper", "Hand Coffee Grinder"])
                tool_price = round(amt - coffee_total, 2)
                items_val = [
                    {"name": f"{blend} 250g", "qty": coffee_qty, "price": coffee_price},
                    {"name": tool_name, "qty": 1, "price": tool_price}
                ]
            else:
                qty = 1
                if amt > 900:
                    qty = 2
                price = round(amt / qty, 2)
                adjusted_price = round(amt - (price * (qty - 1)), 2)
                if qty == 1:
                    items_val = [{"name": f"{blend} 250g", "qty": 1, "price": round(amt, 2)}]
                else:
                    items_val = [
                        {"name": f"{blend} 250g", "qty": 1, "price": adjusted_price},
                        {"name": f"{blend} 250g", "qty": qty - 1, "price": price}
                    ]

            orders_to_create.append(
                Order(
                    tenant_id=c["tenant_id"],
                    customer_id=c["id"],
                    order_date=o_date,
                    total_amount=amt,
                    items=items_val,
                    source_channel=source_chan,
                )
            )

    if orders_to_create:
        db.add_all(orders_to_create)
        await db.flush()


async def auto_populate_missing_orders(db: AsyncSession, tenant_id: int) -> None:
    """Find any customers who have 0 orders and dynamically populate their orders."""
    from app.models.order import Order
    cust_stmt = (
        select(Customer)
        .outerjoin(Order, (Customer.id == Order.customer_id) & (Order.tenant_id == tenant_id))
        .where(Customer.tenant_id == tenant_id)
        .group_by(Customer.id)
        .having(func.count(Order.id) == 0)
    )
    no_order_customers = (await db.execute(cust_stmt)).scalars().all()
    if not no_order_customers:
        return

    cust_info_list = [
        {
            "id": c.id,
            "tenant_id": c.tenant_id,
            "last_order_date": c.last_order_date,
            "lifetime_value": c.lifetime_value,
            "roast_preference": c.roast_preference,
        }
        for c in no_order_customers
    ]
    await _generate_and_insert_customer_orders(cust_info_list, db)
    await db.commit()


async def list_customer_orders(customer_id: int, db: AsyncSession, tenant_id: int) -> list[Any]:
    """Return a list of all orders for a specific customer."""
    from app.models.order import Order
    rows = await db.execute(
        select(Order)
        .where(Order.customer_id == customer_id, Order.tenant_id == tenant_id)
        .order_by(Order.order_date.desc())
    )
    return list(rows.scalars().all())


async def list_crm_fields(db: AsyncSession, tenant_id: int) -> list[CRMField]:
    """Retrieve all CRMField schema definitions for the current tenant workspace."""
    result = await db.execute(
        select(CRMField).where(CRMField.tenant_id == tenant_id).order_by(CRMField.field_name)
    )
    return list(result.scalars().all())
