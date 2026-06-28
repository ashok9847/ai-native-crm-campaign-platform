"""Order service — handles CSV import, order linking, and RLS validation."""

import csv
import datetime
import io
import json
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.models.order import Order

logger = logging.getLogger(__name__)


async def import_orders_from_csv(
    file_bytes: bytes,
    db: AsyncSession,
    tenant_id: int
) -> dict[str, Any]:
    """Parse orders CSV, map orders to customers by email, and insert them.

    If a customer email does not exist in the tenant's database, the row
    is skipped and the email is included in the returned skipped summary list.
    """
    logger.info("Importing orders from CSV for tenant ID: %d", tenant_id)

    # 1. Fetch all existing customers for this tenant to map email -> customer_id
    customers_res = await db.execute(
        select(Customer).where(Customer.tenant_id == tenant_id)
    )
    customer_map = {c.email.lower().strip(): c.id for c in customers_res.scalars().all()}

    # 2. Parse CSV
    text_stream = io.StringIO(file_bytes.decode("utf-8", errors="replace"))
    reader = csv.DictReader(text_stream)

    if reader.fieldnames is None:
        raise ValueError("CSV file has no headers")

    # Lowercase and strip headers
    fieldnames = [h.strip().lower() for h in reader.fieldnames if h.strip()]
    normalized_headers = {h.strip().lower(): h for h in reader.fieldnames if h.strip()}

    # Map headers to expected attributes
    email_col = next((normalized_headers[h] for h in ["email", "customer_email", "customer email"] if h in normalized_headers), None)
    amount_col = next((normalized_headers[h] for h in ["amount", "total_amount", "total", "total amount"] if h in normalized_headers), None)
    date_col = next((normalized_headers[h] for h in ["order_date", "ordered_at", "date", "order date", "ordered at"] if h in normalized_headers), None)
    items_col = next((normalized_headers[h] for h in ["items", "products", "item", "product"] if h in normalized_headers), None)
    channel_col = next((normalized_headers[h] for h in ["source_channel", "channel", "source", "source channel"] if h in normalized_headers), None)

    if not email_col:
        raise ValueError("CSV must contain an 'email' column")

    orders_to_create: list[Order] = []
    skipped_emails: set[str] = set()
    orders_count = 0

    for row in reader:
        email = row.get(email_col, "").strip().lower()
        if not email:
            continue

        # Look up customer
        customer_id = customer_map.get(email)
        if not customer_id:
            skipped_emails.add(row.get(email_col, "").strip())
            continue

        # Parse Date
        order_date = datetime.date.today()
        if date_col:
            date_str = row.get(date_col, "").strip()
            if date_str:
                # Try simple ISO format first (YYYY-MM-DD)
                try:
                    # If it has time component, split by space or 'T'
                    iso_date = date_str.split(" ")[0].split("T")[0]
                    order_date = datetime.date.fromisoformat(iso_date)
                except ValueError:
                    pass

        # Parse Amount
        total_amount = 0.0
        if amount_col:
            amt_str = row.get(amount_col, "").strip().replace("$", "").replace(",", "")
            try:
                total_amount = float(amt_str)
            except ValueError:
                pass

        # Parse Items
        items_list: list[dict] = []
        if items_col:
            items_str = row.get(items_col, "").strip()
            if items_str:
                # Check if it looks like JSON array
                if items_str.startswith("[") and items_str.endswith("]"):
                    try:
                        parsed = json.loads(items_str)
                        if isinstance(parsed, list):
                            items_list = parsed
                    except Exception:
                        pass
                if not items_list:
                    # Treat as plain product name
                    items_list = [{"name": items_str, "qty": 1, "price": total_amount}]
        
        if not items_list:
            items_list = [{"name": "Custom Order", "qty": 1, "price": total_amount}]

        # Parse Channel
        source_channel = "web"
        if channel_col:
            source_channel = row.get(channel_col, "").strip() or "web"

        new_order = Order(
            tenant_id=tenant_id,
            customer_id=customer_id,
            order_date=order_date,
            total_amount=total_amount,
            items=items_list,
            source_channel=source_channel
        )
        orders_to_create.append(new_order)
        orders_count += 1

    if orders_to_create:
        db.add_all(orders_to_create)
        await db.commit()

    return {
        "uploaded": True,
        "orders_count": orders_count,
        "skipped_count": len(skipped_emails),
        "skipped_emails": list(skipped_emails)
    }
