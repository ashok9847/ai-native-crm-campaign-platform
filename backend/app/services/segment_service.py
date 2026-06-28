"""Segment service — translates AI filter criteria into SQLAlchemy queries.

Public API:
  execute_segment_filters(filters, db) -> tuple[int, list[int]]
    Returns (total_customer_count, sample_customer_ids).
"""

from __future__ import annotations

import datetime
import logging
from typing import Any

from sqlalchemy import and_, func, select, or_, cast, String
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import MAX_SEGMENT_SAMPLE_SIZE
from app.models.customer import Customer
from app.models.order import Order
from app.models.tenant import CRMField
from app.schemas.campaign import FilterCriterion

logger = logging.getLogger(__name__)

# Allowed filter fields — prevents arbitrary column injection
_ALLOWED_FIELDS: set[str] = {
    "subscription_tier",
    "roast_preference",
    "city",
    "lifetime_value",
    "last_order_date",
}


def _build_clause(criterion: FilterCriterion, custom_fields: dict[str, str]):
    """Translate a single FilterCriterion into a SQLAlchemy column expression."""
    field = criterion.field
    operator = criterion.operator
    value: Any = criterion.value

    is_custom = field in custom_fields
    if field not in _ALLOWED_FIELDS and not is_custom:
        logger.warning("Ignoring unknown filter field: %r", field)
        return None

    if is_custom:
        field_type = custom_fields[field]
        if field_type == "number":
            from sqlalchemy import cast, Float
            col = cast(Customer.crm_metadata[field].astext, Float)
        else:
            col = Customer.crm_metadata[field].astext
    else:
        col = getattr(Customer, field)

    match operator:
        case "eq":
            return col == value
        case "neq":
            return col != value
        case "gt":
            return col > value
        case "lt":
            return col < value
        case "gte":
            return col >= value
        case "lte":
            return col <= value
        case "lte_days_ago":
            # last_order_date <= today - N days
            cutoff = datetime.date.today() - datetime.timedelta(days=int(value))
            return col <= cutoff
        case "in":
            if not isinstance(value, list):
                value = [value]
            return col.in_(value)
        case "contains":
            return col.ilike(f"%{value}%")
        case _:
            logger.warning("Ignoring unknown operator: %r", operator)
            return None


async def execute_segment_filters(
    filters: list[FilterCriterion],
    db: AsyncSession,
    tenant_id: int,
) -> tuple[int, list[int]]:
    """Translate filter criteria into SQL and execute count + full-ID queries, honoring limit and order_by rules.

    Args:
        filters: List of FilterCriterion objects produced by the AI.
        db: Async SQLAlchemy session.
        tenant_id: Active tenant ID to isolate queries.

    Returns:
        (customer_count, all_customer_ids) — matching segment IDs returned.
    """
    limit_val: int | None = None
    order_field: str | None = None
    order_dir: str = "desc"

    normal_filters = []
    spent_amount_filter = None
    spent_days_ago_filter = None
    purchased_item_filter = None

    for f in filters:
        if f.field == "limit":
            try:
                limit_val = int(f.value)
            except (ValueError, TypeError):
                pass
        elif f.field == "order_by":
            order_field = f.value
            if f.operator in ("asc", "desc"):
                order_dir = f.operator
        elif f.field == "spent_amount":
            spent_amount_filter = f
        elif f.field == "spent_days_ago":
            spent_days_ago_filter = f
        elif f.field == "purchased_item":
            purchased_item_filter = f
        else:
            normal_filters.append(f)

    res = await db.execute(
        select(CRMField.field_name, CRMField.field_type).where(
            CRMField.tenant_id == tenant_id,
            CRMField.entity_type == "customer"
        )
    )
    custom_fields = {row[0]: row[1] for row in res.all()}

    clauses = [Customer.tenant_id == tenant_id]
    for f in normal_filters:
        if (c := _build_clause(f, custom_fields)) is not None:
            clauses.append(c)

    # Relational Order-Based Segmentation filters
    if spent_amount_filter:
        orders_sub = select(Order.customer_id).where(Order.tenant_id == tenant_id)
        if spent_days_ago_filter:
            try:
                days = int(spent_days_ago_filter.value)
                cutoff = datetime.date.today() - datetime.timedelta(days=days)
                orders_sub = orders_sub.where(Order.order_date >= cutoff)
            except (ValueError, TypeError):
                pass
        orders_sub = orders_sub.group_by(Order.customer_id)
        
        try:
            val = float(spent_amount_filter.value)
            op = spent_amount_filter.operator
            if op == "gt":
                orders_sub = orders_sub.having(func.sum(Order.total_amount) > val)
            elif op == "gte":
                orders_sub = orders_sub.having(func.sum(Order.total_amount) >= val)
            elif op == "lt":
                orders_sub = orders_sub.having(func.sum(Order.total_amount) < val)
            elif op == "lte":
                orders_sub = orders_sub.having(func.sum(Order.total_amount) <= val)
            else:
                orders_sub = orders_sub.having(func.sum(Order.total_amount) > val)
            
            clauses.append(Customer.id.in_(orders_sub))
        except (ValueError, TypeError) as exc:
            logger.error("Failed to parse spent_amount value: %r, error: %s", spent_amount_filter.value, exc)
            
    elif spent_days_ago_filter:
        try:
            days = int(spent_days_ago_filter.value)
            cutoff = datetime.date.today() - datetime.timedelta(days=days)
            days_sub = select(Order.customer_id).where(
                Order.tenant_id == tenant_id,
                Order.order_date >= cutoff
            ).distinct()
            clauses.append(Customer.id.in_(days_sub))
        except (ValueError, TypeError) as exc:
            logger.error("Failed to parse spent_days_ago value: %r, error: %s", spent_days_ago_filter.value, exc)

    if purchased_item_filter:
        val = str(purchased_item_filter.value).lower().strip()
        item_clauses = []
        
        # Map common roast keywords to specific seeded blend names
        if "dark" in val:
            keywords = ["dark", "monsooned malabar", "dark forest", "double roast", "espresso"]
        elif "light" in val:
            keywords = ["light", "araku valley", "mild summer", "peaberry"]
        elif "medium" in val:
            keywords = ["medium", "morning bloom", "brewmate classic", "mysore nuggets"]
        elif "espresso" in val:
            keywords = ["espresso", "italian velvet"]
        elif "single" in val or "origin" in val:
            keywords = ["single-origin", "nilgiris", "waynad", "baba budangiri"]
        else:
            keywords = [val]
            
        for kw in keywords:
            item_clauses.append(cast(Order.items, String).ilike(f"%{kw}%"))
            
        item_sub = select(Order.customer_id).where(
            and_(
                Order.tenant_id == tenant_id,
                or_(*item_clauses)
            )
        ).distinct()
        clauses.append(Customer.id.in_(item_sub))

    where_expr = and_(*clauses) if clauses else True  # type: ignore[arg-type]

    # Full ID query
    all_ids_stmt = select(Customer.id).where(where_expr)

    # Sort results correctly
    if order_field in _ALLOWED_FIELDS:
        col = getattr(Customer, order_field)
        if order_dir == "asc":
            all_ids_stmt = all_ids_stmt.order_by(col.asc())
        else:
            all_ids_stmt = all_ids_stmt.order_by(col.desc())
    elif limit_val is not None:
        # Default sort by lifetime value DESC for "top" segments
        all_ids_stmt = all_ids_stmt.order_by(Customer.lifetime_value.desc())
    else:
        # Fallback sorting
        all_ids_stmt = all_ids_stmt.order_by(Customer.id)

    # Apply limit if specified
    if limit_val is not None:
        all_ids_stmt = all_ids_stmt.limit(limit_val)

    ids_result = await db.execute(all_ids_stmt)
    all_ids: list[int] = list(ids_result.scalars().all())

    # Total is the actual target size after limiting
    total = len(all_ids)

    logger.info(
        "Segment executed: %d filters (limit=%s, order=%s %s) → %d customers",
        len(filters), limit_val, order_field, order_dir, total,
    )
    return total, all_ids
