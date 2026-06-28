"""AI Agent service with Tool Calling (Function Calling).

Primary  : Nebius API  (openai/gpt-oss-120b-fast) via openai.AsyncOpenAI
Backup   : GitHub Models (openai/gpt-4.1)          via openai.AsyncOpenAI
"""

import json
import logging
import datetime
import asyncio
from typing import Any, Optional
from sqlalchemy import select, func, or_, and_, delete
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
from openai import AsyncOpenAI, APIError

from app.core.config import get_settings
from app.core.constants import AI_MAX_RETRIES, AI_RETRY_DELAY_SECONDS
from app.models.audience import Audience
from app.models.campaign import Campaign, CampaignState
from app.models.campaign_stats import CampaignStats
from app.models.customer import Customer
from app.models.order import Order
from app.models.message import CampaignMessage
from app.models.segment import Segment, segment_customers
from app.schemas.ai import AIChatMessage, AIChatResponse, AIChatAction, AIChatStructuredData
from app.schemas.campaign import FilterCriterion
from app.services import segment_service, campaign_service

logger = logging.getLogger(__name__)

_primary_client: AsyncOpenAI | None = None
_backup_client: AsyncOpenAI | None = None


def get_primary_client() -> AsyncOpenAI:
    global _primary_client
    if _primary_client is None:
        s = get_settings()
        _primary_client = AsyncOpenAI(base_url=s.nebius_base_url, api_key=s.nebius_api_key)
    return _primary_client


def get_backup_client() -> AsyncOpenAI | None:
    global _backup_client
    if _backup_client is None:
        s = get_settings()
        if not s.github_token:
            return None
        _backup_client = AsyncOpenAI(
            base_url=s.github_base_url,
            api_key=s.github_token
        )
    return _backup_client


SYSTEM_INSTRUCTION = """You are NudgeAI, the intelligent marketing assistant for a modern CRM. You help marketers make smart decisions fast.

CAPABILITIES:
- Fetch segments, create new AI-generated segments
- Draft campaigns (email, sms, whatsapp, rcs) with professional copy
- Dispatch/Launch campaigns to customers
- Pull live campaign stats & revenue reports
- Compare campaigns side by side
- Search and profile customers
- PREDICT campaign outcomes before launch (open rates, conversions, estimated revenue) based on historical segment & channel data

CHANNELS: Use exactly: "whatsapp", "sms", "email", "rcs"

PREDICTION: When a user asks "what will happen if I send X to Y" or "predict outcome" or "will this campaign work", call predictCampaignOutcome tool to generate intelligent predictions based on past similar campaigns.

DRAFTING CAMPAIGNS (CRITICAL TOOL CHAINING): When the user asks to draft a campaign, you MUST call 'createDraftCampaign'. If you don't know the segmentId, you must FIRST call 'getSegments' or 'createSegment', wait for the result, and then IMMEDIATELY call 'createDraftCampaign' in the same conversation turn. CRITICAL: NEVER write a campaign draft in plain text! You MUST always use the createDraftCampaign tool to draw the UI draft widget!

TARGETING SPECIFIC CUSTOMERS: If the user mentions a specific person's name (e.g., "Lucas Davis", "Ava Garcia", "message this customer"), you MUST follow these exact steps:
  1. Call 'searchCustomers' to find their customer ID.
  2. Call 'targetCustomers' with their ID to create the campaign.
  CRITICAL: Under NO circumstances should you call 'getSegments' or 'createDraftCampaign' when a specific individual is targeted.

VISUALIZATION: When a user asks for a chart, graph, or visual plot, you MUST call the 'renderChart' tool to draw it using the data you fetched. Only use 'renderDataGrid' if they just asked for a list or table of data. DO NOT return markdown tables or text-based charts.

TONE: Concise, sharp, data-driven. Never verbose.

EMAIL templates: Write full professional email with Subject line, body, and sign-off.
SMS/WhatsApp: Short, punchy, personalized. Use {{name}}.
When presenting data: always highlight the most important insight first."""

# Define tools schemas following OpenAI compatibility format
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "getSegments",
            "description": "Gets a list of all customer segments and their IDs. Use this to find the right segmentId when the user asks to target a specific audience. CRITICAL: This tool automatically renders a datagrid in the UI. DO NOT call renderDataGrid yourself when using this tool.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "createSegment",
            "description": "Creates a new customer segment/audience. Use this when the user asks to create or propose a new segment (e.g. by membership tier, location, spent, roast preference, etc.).",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Segment name (e.g. 'Gold Members in Bangalore')"},
                    "description": {"type": "string", "description": "Short description of the segment"},
                    "filterConfig": {
                        "type": "array",
                        "description": "Array of rules. Example: [{'field': 'membershipTier', 'operator': 'equals', 'value': 'Gold'}]",
                        "items": {
                            "type": "object",
                            "properties": {
                                "field": {"type": "string", "description": "Field name: subscription_tier, roast_preference, city, lifetime_value, last_order_date, totalSpend, membershipTier, daysSinceLastOrder"},
                                "operator": {"type": "string", "description": "'equals', 'gte', 'lte', 'gt', 'lt'"},
                                "value": {"type": "string", "description": "The value to match. Valid Tiers: 'elite', 'premium', 'starter'. Valid Roast: 'dark', 'medium', 'light', 'espresso'."}
                            },
                            "required": ["field", "operator", "value"]
                        }
                    }
                },
                "required": ["name", "filterConfig"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "createDraftCampaign",
            "description": "Creates a draft campaign for a BROAD segment. ALWAYS use getSegments first to find the correct segmentId. CRITICAL: Do NOT use this tool if the user wants to message specific named individuals. For specific individuals, use searchCustomers then targetCustomers instead.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "A professional internal name for the campaign (e.g. 'VIP Spring Promo')"},
                    "segmentId": {"type": "string", "description": "The exact database ID of the target segment."},
                    "channel": {"type": "string", "description": "The communication channel to use. Must be exactly one of: 'whatsapp', 'sms', 'email', or 'rcs'."},
                    "messageTemplate": {"type": "string", "description": "The message template. Use {{name}} as the placeholder for the customer name. E.g. 'Hi {{name}}, here is 10% off!'"}
                },
                "required": ["name", "segmentId", "channel", "messageTemplate"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "dispatchCampaign",
            "description": "Dispatches/launches an existing campaign. Use this when the user asks to send or dispatch a campaign.",
            "parameters": {
                "type": "object",
                "properties": {
                    "campaignName": {"type": "string", "description": "The exact name of the campaign to dispatch."}
                },
                "required": ["campaignName"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "getCampaignStats",
            "description": "Gets live statistics for a specific campaign or recent campaigns. Use this to report on campaign performance.",
            "parameters": {
                "type": "object",
                "properties": {
                    "campaignName": {"type": "string", "description": "Optional. The name of the campaign to search for. If omitted, returns recent campaigns."}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "searchCustomers",
            "description": "Searches for customers by name or returns the top spenders if no name is provided.",
            "parameters": {
                "type": "object",
                "properties": {
                    "nameQuery": {"type": "string", "description": "Optional. A name to search for (e.g. 'Olivia'). If omitted, returns top 5 highest-spending customers."}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "targetCustomers",
            "description": "Creates a campaign targeting SPECIFIC individual customers by name or ID. Use this when the user wants to send a campaign to one or more named customers (e.g. 'send an email to Lucas Davis'). First use searchCustomers to find their IDs, then call this tool with the customer IDs.",
            "parameters": {
                "type": "object",
                "properties": {
                    "customerIds": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Array of customer IDs to target"
                    },
                    "customerNames": {"type": "string", "description": "Comma-separated display names of the targeted customers (e.g. 'Lucas Davis, Ava Garcia')"},
                    "channel": {"type": "string", "description": "The communication channel: 'whatsapp', 'sms', 'email', or 'rcs'"},
                    "messageTemplate": {"type": "string", "description": "The message template. Use {{name}} for customer name placeholder."},
                    "campaignName": {"type": "string", "description": "A short internal name for this targeted campaign (e.g. 'Win-Back – Lucas Davis')"}
                },
                "required": ["customerIds", "customerNames", "channel", "messageTemplate", "campaignName"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "revenueReport",
            "description": "Generates a revenue report across all campaigns showing total revenue, top performing campaigns, conversion rates, and channel breakdown. Use when user asks for revenue report, earnings, or financial performance.",
            "parameters": {
                "type": "object",
                "properties": {
                    "topN": {"type": "number", "description": "Optional. How many top campaigns to include. Defaults to 5."}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "compareCampaigns",
            "description": "Compares two or more specific campaigns side by side on key metrics: sent, delivered, opened, clicked, converted, and revenue. Use when the user asks to compare campaigns.",
            "parameters": {
                "type": "object",
                "properties": {
                    "campaignNames": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Array of campaign name keywords to search and compare (e.g. ['Platinum', 'Gold'])."
                    }
                },
                "required": ["campaignNames"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "predictCampaignOutcome",
            "description": "Predicts the expected outcome of a campaign (open rate, conversion rate, estimated revenue, risk level) based on historical data for the given segment and channel. Use when user asks 'predict', 'forecast', 'what will happen', 'estimate results', or 'will this work'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "segmentId": {"type": "string", "description": "The ID of the target segment"},
                    "channel": {"type": "string", "description": "The channel to use: 'whatsapp', 'sms', 'email', or 'rcs'"}
                },
                "required": ["segmentId", "channel"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "renderDataGrid",
            "description": "Renders a data table in the user's canvas. Use this INSTEAD of markdown tables for lists of segments, customers, or campaigns. CRITICAL: Do NOT use this tool if the user asked for a chart or graph. If they asked for a chart, you MUST use renderChart instead.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Title of the data grid"},
                    "columns": {"type": "array", "items": {"type": "string"}, "description": "Array of column headers"},
                    "rows": {
                        "type": "array",
                        "items": {"type": "array", "items": {"type": "string"}},
                        "description": "Array of rows, where each row is an array of strings corresponding to the columns."
                    }
                },
                "required": ["title", "columns", "rows"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "renderChart",
            "description": "CRITICAL: You MUST use this tool (and NOT renderDataGrid) if the user asks for a chart, graph, or plot. Renders a beautiful chart in the user's canvas.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Title of the chart"},
                    "chartType": {"type": "string", "description": "'bar', 'line', 'pie', or 'area'"},
                    "xAxisKey": {"type": "string", "description": "The property name in data objects for the X-axis (e.g., 'name', 'channel')"},
                    "seriesKey": {"type": "string", "description": "The property name in data objects for the Y-axis values (e.g., 'revenue', 'sent')"},
                    "seriesName": {"type": "string", "description": "Human-readable label for the Y-axis (e.g., 'Revenue ($)', 'Total Sent')"},
                    "data": {
                        "type": "array",
                        "items": {"type": "object"},
                        "description": "Array of data objects containing the X-axis key and Y-axis key. Example: [{'name': 'Summer', 'revenue': 500}]"
                    }
                },
                "required": ["title", "chartType", "xAxisKey", "seriesKey", "seriesName", "data"]
            }
        }
    }
]


def map_filter_rule(rule: dict) -> FilterCriterion:
    """Map Xeno-style filter rules to Nudge FilterCriterion."""
    field = rule.get("field")
    operator = rule.get("operator")
    value = rule.get("value")

    # Field mapping
    if field == "membershipTier":
        field = "subscription_tier"
    elif field == "totalSpend":
        field = "spent_amount"
    elif field == "daysSinceLastOrder":
        field = "spent_days_ago"

    # Operator mapping
    if operator == "equals":
        operator = "eq"

    # Cast value types
    if field in ("spent_amount", "spent_days_ago", "lifetime_value"):
        try:
            value = float(value) if "." in str(value) else int(value)
        except (ValueError, TypeError):
            pass

    # Tiers mapping
    if field == "subscription_tier":
        val_lower = str(value).lower()
        if val_lower == "gold":
            value = "premium"  # Map Gold -> premium
        elif val_lower == "platinum":
            value = "elite"    # Map Platinum -> elite
        elif val_lower == "silver":
            value = "starter"  # Map Silver -> starter

    return FilterCriterion(field=field, operator=operator, value=value)


async def execute_agent_tool(
    name: str,
    args: dict,
    db: AsyncSession,
    tenant_id: int
) -> tuple[dict, Optional[AIChatStructuredData], str]:
    """Execute a single agent tool call against Nudge database."""
    last_structured = None
    desc = f"Executed {name}"

    if name == "getSegments":
        result = await db.execute(
            select(Audience).where(Audience.tenant_id == tenant_id).order_by(Audience.id.desc())
        )
        audiences = list(result.scalars().all())

        last_structured = AIChatStructuredData(
            type="datagrid",
            data={
                "title": "Customer Segments",
                "columns": ["Segment Name", "Customer Count", "Segment ID"],
                "rows": [[a.name, f"{a.customer_count:,}", str(a.id)] for a in audiences]
            }
        )

        desc = "Searching database for customer segments..."
        res = {
            "success": True,
            "segments": [{"name": a.name, "id": str(a.id), "count": a.customer_count} for a in audiences]
        }
        return res, last_structured, desc

    elif name == "createSegment":
        seg_name = args["name"]
        description = args.get("description", "")
        filter_config = args["filterConfig"]

        # Parse filter rules
        filters = [map_filter_rule(rule) for rule in filter_config]

        # Execute count
        count, _ = await segment_service.execute_segment_filters(filters, db, tenant_id)

        # Save reusable audience
        raw_criteria = [{"field": f.field, "operator": f.operator, "value": f.value} for f in filters]
        audience = Audience(
            tenant_id=tenant_id,
            name=seg_name,
            description=description,
            filter_criteria=raw_criteria,
            customer_count=count
        )
        db.add(audience)
        await db.commit()
        await db.refresh(audience)

        desc = f"Created segment '{seg_name}' with {count} customers"
        res = {"success": True, "segmentId": str(audience.id), "customerCount": count}
        return res, last_structured, desc

    elif name == "createDraftCampaign":
        camp_name = args["name"]
        audience_id = int(args["segmentId"])
        channel = args["channel"].lower()
        msg_template = args["messageTemplate"]

        # Fetch segment criteria
        result = await db.execute(
            select(Audience).where(Audience.id == audience_id, Audience.tenant_id == tenant_id)
        )
        audience = result.scalar_one_or_none()
        if not audience:
            raise ValueError(f"Audience segment with ID {audience_id} not found")

        intent = f"Draft {channel} campaign for segment {audience.name}"
        url = f"/campaigns/new?intent={intent}&audience_id={audience_id}&channel={channel}"
        
        desc = f"Redirecting to the Campaign Builder to prepare campaign '{camp_name}'"
        res = {
            "success": True,
            "action": "redirect",
            "url": url
        }
        return res, None, desc

    elif name == "dispatchCampaign":
        camp_name = args["campaignName"].replace("'", "").replace('"', '').strip()

        # Search campaign
        camp_stmt = select(Campaign).where(
            Campaign.tenant_id == tenant_id,
            Campaign.name.ilike(f"%{camp_name}%")
        ).order_by(Campaign.created_at.desc()).limit(1)

        campaign = (await db.execute(camp_stmt)).scalar_one_or_none()
        if not campaign:
            return {"error": f"Could not find campaign matching name '{camp_name}'"}, None, f"Failed: Campaign '{camp_name}' not found"

        # Launch using campaign_service launch logic
        result = await campaign_service.launch_campaign(campaign_id=campaign.id, db=db, tenant_id=tenant_id)

        # Trigger async simulation
        from app.services import delivery_service  # noqa: PLC0415
        asyncio.create_task(delivery_service.dispatch_campaign_messages(campaign.id, db))

        desc = f"Successfully dispatched campaign '{campaign.name}'"
        res = {"success": True, "status": "sending", "campaignId": campaign.id}
        return res, last_structured, desc

    elif name == "getCampaignStats":
        camp_name = args.get("campaignName")

        q = select(Campaign, CampaignStats).join(CampaignStats).where(Campaign.tenant_id == tenant_id)
        if camp_name:
            q = q.where(Campaign.name.ilike(f"%{camp_name}%"))
        else:
            q = q.order_by(Campaign.created_at.desc()).limit(5)

        results = (await db.execute(q)).all()

        if camp_name and not results:
            desc = f"Failed retrieving stats: campaign '{camp_name}' not found."
            return {
                "success": False,
                "error": f"Campaign '{camp_name}' was not found in the database. Please verify name."
            }, None, desc

        last_structured = AIChatStructuredData(
            type="datagrid",
            data={
                "title": f"Stats for '{camp_name}'" if camp_name else "Recent Campaign Stats",
                "columns": ["Campaign", "Channel", "Status", "Sent", "Opened", "Converted", "Revenue"],
                "rows": [
                    [
                        c.name,
                        c.channel,
                        c.state,
                        f"{stats.sent_count:,}",
                        f"{stats.opened_count:,}",
                        f"{stats.purchased_count:,}",
                        f"${float(stats.attributed_revenue):,.2f}"
                    ]
                    for c, stats in results
                ]
            }
        )

        desc = f"Retrieved stats for {camp_name if camp_name else 'recent campaigns'}"
        res = {"success": True, "message": "Stats retrieved successfully"}
        return res, last_structured, desc

    elif name == "searchCustomers":
        name_query = args.get("nameQuery")

        q = select(Customer).where(Customer.tenant_id == tenant_id)
        if name_query:
            q = q.where(Customer.name.ilike(f"%{name_query}%"))
        else:
            q = q.order_by(Customer.lifetime_value.desc()).limit(5)

        customers = (await db.execute(q)).scalars().all()

        cust_list = []
        for cust in customers:
            # Count orders
            order_count_stmt = select(func.count(Order.id)).where(Order.customer_id == cust.id)
            order_count = (await db.execute(order_count_stmt)).scalar() or 0

            cust_list.append({
                "id": str(cust.id),
                "name": cust.name,
                "email": cust.email,
                "totalSpend": float(cust.lifetime_value),
                "orderCount": order_count,
                "membershipTier": cust.subscription_tier
            })

        desc = f"Searched customers with query '{name_query}'" if name_query else "Retrieved top spenders"
        res = {"customers": cust_list}
        return res, last_structured, desc

    elif name == "targetCustomers":
        customer_ids = [int(cid) for cid in args["customerIds"]]
        customer_names = args["customerNames"]
        channel = args["channel"].lower()
        msg_template = args["messageTemplate"]
        campaign_name = args["campaignName"]

        customer_ids_str = ",".join(str(cid) for cid in customer_ids)
        intent = f"Message targeted customers: {customer_names}"
        url = f"/campaigns/new?intent={intent}&customer_ids={customer_ids_str}&channel={channel}"
        
        desc = f"Redirecting to the Campaign Builder targeting {customer_names}"
        res = {
            "success": True,
            "action": "redirect",
            "url": url
        }
        return res, None, desc

    elif name == "revenueReport":
        limit = args.get("topN", 5)

        result = await db.execute(
            select(Campaign, CampaignStats).join(CampaignStats).where(
                Campaign.tenant_id == tenant_id,
                Campaign.state == CampaignState.COMPLETE.value
            ).order_by(Campaign.created_at.desc())
        )
        campaigns_list = result.all()

        total_revenue = sum(float(s.attributed_revenue) for c, s in campaigns_list)
        total_conversions = sum(s.purchased_count for c, s in campaigns_list)
        total_sent = sum(s.sent_count for c, s in campaigns_list)

        by_channel = {}
        for c, s in campaigns_list:
            ch = c.channel
            if ch not in by_channel:
                by_channel[ch] = {"count": 0, "revenue": 0.0, "converted": 0}
            by_channel[ch]["count"] += 1
            by_channel[ch]["revenue"] += float(s.attributed_revenue)
            by_channel[ch]["converted"] += s.purchased_count

        top_campaigns = sorted(campaigns_list, key=lambda x: float(x[1].attributed_revenue), reverse=True)[:limit]
        top_list = [
            {
                "name": c.name,
                "channel": c.channel,
                "status": c.state,
                "revenue": float(s.attributed_revenue),
                "converted": s.purchased_count,
                "sent": s.sent_count,
                "conversionRate": f"{(s.purchased_count / max(1, s.sent_count) * 100):.1f}%"
            }
            for c, s in top_campaigns
        ]

        desc = f"Generated revenue report for top {limit} campaigns"
        res = {
            "totalRevenue": total_revenue,
            "totalConversions": total_conversions,
            "totalSent": total_sent,
            "totalCampaigns": len(campaigns_list),
            "byChannel": by_channel,
            "topCampaigns": top_list
        }
        return res, last_structured, desc

    elif name == "compareCampaigns":
        names = args["campaignNames"]

        campaigns = []
        for kw in names:
            c_stmt = select(Campaign, CampaignStats).join(CampaignStats).where(
                Campaign.tenant_id == tenant_id,
                Campaign.name.ilike(f"%{kw}%")
            ).order_by(Campaign.created_at.desc()).limit(1)

            c_res = (await db.execute(c_stmt)).first()
            if c_res:
                campaigns.append(c_res)

        if not campaigns:
            desc = f"Failed comparison: no campaigns matching {names} found."
            return {
                "success": False,
                "error": f"None of the campaigns matching '{', '.join(names)}' were found in the database. Please request valid campaign names."
            }, None, desc

        comparison = []
        for c, s in campaigns:
            # get segment details
            seg_stmt = select(Segment).where(Segment.campaign_id == c.id)
            seg = (await db.execute(seg_stmt)).scalar_one_or_none()

            comparison.append({
                "name": c.name,
                "channel": c.channel,
                "status": c.state,
                "segment": "Segment targeting" if not seg else f"Segment Size: {seg.customer_count}",
                "audienceSize": 0 if not seg else seg.customer_count,
                "sent": s.sent_count,
                "delivered": s.delivered_count,
                "opened": s.opened_count,
                "clicked": s.clicked_count,
                "converted": s.purchased_count,
                "revenue": float(s.attributed_revenue),
                "conversionRate": f"{(s.purchased_count / max(1, s.sent_count) * 100):.1f}%" if s.sent_count else "0%",
                "revenuePerSend": f"{(float(s.attributed_revenue) / max(1, s.sent_count)):.0f}" if s.sent_count else "0"
            })

        last_structured = AIChatStructuredData(
            type="datagrid",
            data={
                "title": "Campaign Comparison",
                "columns": ["Metric"] + [c["name"] for c in comparison],
                "rows": [
                    ["Status"] + [c["status"] for c in comparison],
                    ["Channel"] + [c["channel"] for c in comparison],
                    ["Revenue"] + [f"${c['revenue']:,.2f}" for c in comparison],
                    ["Conversion Rate"] + [c["conversionRate"] for c in comparison],
                    ["Sent"] + [f"{c['sent']:,}" for c in comparison],
                    ["Opened"] + [f"{c['opened']:,}" for c in comparison],
                    ["Converted"] + [f"{c['converted']:,}" for c in comparison],
                ]
            }
        )

        desc = f"Comparing campaigns side-by-side: {', '.join(names)}"
        res = {"success": True, "message": "Comparison calculated."}
        return res, last_structured, desc

    elif name == "predictCampaignOutcome":
        segment_id = int(args["segmentId"])
        channel = args["channel"].lower()

        result = await db.execute(
            select(Audience).where(Audience.id == segment_id, Audience.tenant_id == tenant_id)
        )
        audience = result.scalar_one_or_none()
        if not audience:
            raise ValueError(f"Audience segment with ID {segment_id} not found")

        # Get past campaigns stats
        past_result = await db.execute(
            select(Campaign, CampaignStats).join(CampaignStats).where(
                Campaign.tenant_id == tenant_id,
                Campaign.channel == channel,
                Campaign.state == CampaignState.COMPLETE.value
            )
        )
        past = past_result.all()

        if past:
            avg_open = sum(s.opened_count / max(1, s.sent_count) for c, s in past) / len(past)
            avg_click = sum(s.clicked_count / max(1, s.sent_count) for c, s in past) / len(past)
            avg_rev_per_conv = sum(float(s.attributed_revenue) / max(1, s.purchased_count) for c, s in past) / len(past)
        else:
            # Fallback per spec clarifications
            avg_open = 0.50
            avg_click = 0.10
            avg_rev_per_conv = 5000.0

        count = audience.customer_count
        pred_opens = int(count * avg_open)
        pred_convs = int(count * avg_click)
        pred_rev = int(pred_convs * avg_rev_per_conv)
        risk = "High" if avg_click < 0.05 else "Medium" if avg_click < 0.10 else "Low"

        prediction = {
            "segment": audience.name,
            "audienceSize": count,
            "channel": channel,
            "basedOnCampaigns": len(past),
            "predicted": {
                "openRate": f"{avg_open * 100:.1f}%",
                "opens": pred_opens,
                "conversionRate": f"{avg_click * 100:.1f}%",
                "conversions": pred_convs,
                "estimatedRevenue": pred_rev,
                "revenuePerSend": f"{pred_rev / max(1, count):.0f}",
                "riskLevel": risk
            }
        }

        last_structured = AIChatStructuredData(type="prediction", data=prediction)
        desc = f"Generated campaign outcome prediction for segment '{audience.name}' via channel '{channel}'"
        res = {"prediction": prediction}
        return res, last_structured, desc

    elif name == "renderDataGrid":
        last_structured = AIChatStructuredData(
            type="datagrid",
            data={
                "title": args["title"],
                "columns": args["columns"],
                "rows": args["rows"]
            }
        )
        desc = f"Rendering table: {args['title']}"
        return {"success": True}, last_structured, desc

    elif name == "renderChart":
        series = [{"key": args["seriesKey"], "name": args["seriesName"], "color": "#8b5cf6"}]
        last_structured = AIChatStructuredData(
            type="chart",
            data={
                "title": args["title"],
                "chartType": args["chartType"],
                "xAxisKey": args["xAxisKey"],
                "series": series,
                "data": args["data"]
            }
        )
        desc = f"Rendering chart: {args['title']}"
        return {"success": True}, last_structured, desc

    raise ValueError(f"Unknown tool name: {name}")


async def _run_agent_chat_with_client(
    client: AsyncOpenAI,
    model: str,
    prompt: str,
    history: Optional[list[AIChatMessage]],
    db: AsyncSession,
    tenant_id: int,
    max_retries: int,
    delay: float
) -> AIChatResponse:
    messages = []
    messages.append({
        "role": "system",
        "content": SYSTEM_INSTRUCTION
    })

    # Process history
    if history:
        for msg in history:
            role = "assistant" if msg.role == "agent" else "user"
            messages.append({"role": role, "content": msg.content})

    # Add active user prompt
    messages.append({"role": "user", "content": prompt})

    actions = []
    last_structured = None

    # Run loop up to 5 steps to process chained function calls
    for step in range(5):
        logger.info("Calling completions API (model=%s): Step %d...", model, step + 1)

        # Retry the completions call on transient errors
        last_exc = None
        response = None
        for attempt in range(max_retries + 1):
            try:
                response = await client.chat.completions.create(
                    model=model,
                    messages=messages,
                    tools=TOOLS,
                    tool_choice="auto"
                )
                break
            except Exception as exc:
                last_exc = exc
                if attempt < max_retries:
                    logger.warning(
                        "AI completions call failed (attempt %d/%d): %s — retrying in %.1fs",
                        attempt + 1, max_retries + 1, exc, delay
                    )
                    await asyncio.sleep(delay)

        if response is None:
            # Exhausted retries
            raise last_exc

        response_message = response.choices[0].message
        messages.append(response_message)

        # Check if model completed the conversational response
        if not response_message.tool_calls:
            reply = response_message.content or ""
            logger.info("Agent chat completed successfully: %r", reply[:100])
            return AIChatResponse(reply=reply, actions=actions, structured=last_structured)

        # Execute tool calls
        logger.info("Model returned %d tool call(s)", len(response_message.tool_calls))
        for tool_call in response_message.tool_calls:
            tool_name = tool_call.function.name
            tool_args = json.loads(tool_call.function.arguments)

            logger.info("Executing tool %s with args: %s", tool_name, tool_args)
            try:
                tool_res, struct_out, action_desc = await execute_agent_tool(tool_name, tool_args, db, tenant_id)
                if struct_out:
                    last_structured = struct_out
            except Exception as exc:
                logger.error("Error executing tool %s: %s", tool_name, exc, exc_info=True)
                tool_res = {"success": False, "error": str(exc)}
                action_desc = f"Failed executing {tool_name}: {exc}"

            actions.append(AIChatAction(name=tool_name, description=action_desc, args=tool_args))

            # Feed tool results back to Model
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "name": tool_name,
                "content": json.dumps(tool_res)
            })

    # If loop count exhausted
    raise HTTPException(
        status_code=500,
        detail="AI Agent loop limit exceeded. The copilot could not finish responding within 5 turns."
    )


async def run_agent_chat(
    prompt: str,
    history: Optional[list[AIChatMessage]],
    db: AsyncSession,
    tenant_id: int
) -> AIChatResponse:
    """Run AI Chat Agent with Tool Calling loop.
    
    Tries Nebius primary first; falls back to GitHub Models (GPT-4.1) on failure.
    """
    settings = get_settings()
    
    # Try primary: Nebius
    try:
        logger.info("AI Chat Agent: trying Nebius primary...")
        return await _run_agent_chat_with_client(
            client=get_primary_client(),
            model=settings.kimi_model,
            prompt=prompt,
            history=history,
            db=db,
            tenant_id=tenant_id,
            max_retries=AI_MAX_RETRIES,
            delay=AI_RETRY_DELAY_SECONDS
        )
    except Exception as primary_exc:
        logger.warning(
            "Nebius primary AI Chat Agent failed (reason: %s). Falling back to GitHub Models.",
            primary_exc
        )
        # Check if backup client is configured
        backup_client = get_backup_client()
        if backup_client is not None:
            logger.info("AI Chat Agent: trying GitHub Models backup...")
            try:
                return await _run_agent_chat_with_client(
                    client=backup_client,
                    model=settings.github_model,
                    prompt=prompt,
                    history=history,
                    db=db,
                    tenant_id=tenant_id,
                    max_retries=0,  # single attempt for backup fallback
                    delay=0.0
                )
            except Exception as backup_exc:
                logger.error("GitHub Models backup also failed: %s", backup_exc, exc_info=True)
                raise HTTPException(
                    status_code=500,
                    detail=f"AI agent error: Primary failed ({str(primary_exc)}) and Backup also failed ({str(backup_exc)})"
                )
        else:
            logger.error("GitHub Models backup not configured / token is missing.")
            raise HTTPException(
                status_code=500,
                detail=f"AI agent error: Primary failed ({str(primary_exc)}) and Backup is disabled."
            )
