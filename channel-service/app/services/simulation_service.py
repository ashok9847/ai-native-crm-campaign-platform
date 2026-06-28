"""Channel simulation service — async drop-off + failure + callback firing.

T054: simulate_delivery(dispatch, settings)

Sequence per recipient:
  1. Optional failure (FAILURE_RATE): fire "failed" → wait → retry → fire "sent" (is_retry=True)
  2. Always fire "sent" (or after retry)
  3. With DELIVERY_RATE:  fire "delivered"
  4. With OPEN_RATE:      fire "opened"
  5. With CLICK_RATE:     fire "clicked"

Each event is a POST to dispatch.callback_url with X-Channel-Secret header and a new UUID event_id.
"""

from __future__ import annotations

import asyncio
import logging
import random
import uuid

import httpx

from app.core.config import Settings

logger = logging.getLogger(__name__)


async def _fire_callback(
    callback_url: str,
    secret: str,
    event_id: str,
    dispatch_id: str,
    campaign_id: int,
    message_id: int,
    customer_id: int,
    status: str,
    is_retry: bool = False,
    is_final: bool = False,
) -> None:
    """POST a single delivery event to the CRM callback endpoint."""
    payload = {
        "event_id": event_id,
        "dispatch_id": dispatch_id,
        "campaign_id": campaign_id,
        "message_id": message_id,
        "customer_id": customer_id,
        "status": status,
        "timestamp": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "is_retry": is_retry,
        "is_final": is_final,
    }
    headers = {
        "Content-Type": "application/json",
        "X-Channel-Secret": secret,
    }
    
    from app.services.retry_service import enqueue_callback
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(callback_url, json=payload, headers=headers)
            if 200 <= resp.status_code < 300:
                logger.info(
                    "Callback fired: status=%s event_id=%s → CRM responded %d",
                    status, event_id, resp.status_code,
                )
            else:
                error_msg = f"HTTP {resp.status_code}: {resp.text[:200]}"
                logger.error("Failed to fire callback (status=%s): %s", status, error_msg)
                enqueue_callback(callback_url, secret, payload, error_msg)
    except Exception as exc:
        error_msg = str(exc)
        logger.error("Failed to fire callback (status=%s): %s", status, error_msg)
        enqueue_callback(callback_url, secret, payload, error_msg)


async def simulate_delivery(dispatch: dict, settings: Settings) -> None:
    """Async simulation coroutine — runs in background after 202 is returned.

    Args:
        dispatch: dict matching DispatchRequest fields.
        settings: channel service Settings instance.
    """
    callback_url: str = dispatch["callback_url"]
    dispatch_id: str = dispatch["dispatch_id"]
    campaign_id: int = dispatch["campaign_id"]
    message_id: int = dispatch["message_id"]
    customer_id: int = dispatch["recipient"]["customer_id"]
    secret: str = settings.channel_webhook_secret

    # Pre-determine outcome paths
    failed_initially = random.random() < settings.failure_rate
    delivered_ok = random.random() < settings.delivery_rate
    opened_ok = delivered_ok and (random.random() < settings.open_rate)
    clicked_ok = opened_ok and (random.random() < settings.click_rate)
    read_ok = opened_ok and (clicked_ok or random.random() < 0.90)
    purchased_ok = clicked_ok and (random.random() < 0.20)

    # Random initial delay (simulates real-world delivery latency)
    initial_delay = random.uniform(
        settings.callback_min_delay_ms / 1000,
        settings.callback_max_delay_ms / 1000,
    )
    await asyncio.sleep(initial_delay)

    # ── Step 1: Failure simulation ────────────────────────────────────────────
    is_retry = False
    if failed_initially:
        # Fire "failed" then retry
        await _fire_callback(
            callback_url, secret,
            event_id=f"evt_{uuid.uuid4()}",
            dispatch_id=dispatch_id,
            campaign_id=campaign_id,
            message_id=message_id,
            customer_id=customer_id,
            status="failed",
            is_retry=False,
            is_final=False,
        )
        # Wait 1–3 seconds before retry
        await asyncio.sleep(random.uniform(1.0, 3.0))
        is_retry = True

    # ── Step 2: sent ──────────────────────────────────────────────────────────
    await _fire_callback(
        callback_url, secret,
        event_id=f"evt_{uuid.uuid4()}",
        dispatch_id=dispatch_id,
        campaign_id=campaign_id,
        message_id=message_id,
        customer_id=customer_id,
        status="sent",
        is_retry=is_retry,
        is_final=False,
    )

    inter_delay = random.uniform(
        settings.callback_min_delay_ms / 1000,
        settings.callback_max_delay_ms / 1000,
    )
    await asyncio.sleep(inter_delay)

    # ── Step 3: delivered ─────────────────────────────────────────────────────
    if not delivered_ok:
        # Drop-off: fire 'failed' so the backend records a terminal event
        await _fire_callback(
            callback_url, secret,
            event_id=f"evt_{uuid.uuid4()}",
            dispatch_id=dispatch_id,
            campaign_id=campaign_id,
            message_id=message_id,
            customer_id=customer_id,
            status="failed",
            is_final=True,
        )
        return
    
    is_delivered_final = not opened_ok
    await _fire_callback(
        callback_url, secret,
        event_id=f"evt_{uuid.uuid4()}",
        dispatch_id=dispatch_id,
        campaign_id=campaign_id,
        message_id=message_id,
        customer_id=customer_id,
        status="delivered",
        is_final=is_delivered_final,
    )
    
    if is_delivered_final:
        return
        
    await asyncio.sleep(random.uniform(0.5, inter_delay))

    # ── Step 4: opened ────────────────────────────────────────────────────────
    is_opened_final = not read_ok
    await _fire_callback(
        callback_url, secret,
        event_id=f"evt_{uuid.uuid4()}",
        dispatch_id=dispatch_id,
        campaign_id=campaign_id,
        message_id=message_id,
        customer_id=customer_id,
        status="opened",
        is_final=is_opened_final,
    )
    
    if is_opened_final:
        return
        
    await asyncio.sleep(random.uniform(0.3, inter_delay))

    # ── Step 4b: read ─────────────────────────────────────────────────────────
    is_read_final = not clicked_ok
    await _fire_callback(
        callback_url, secret,
        event_id=f"evt_{uuid.uuid4()}",
        dispatch_id=dispatch_id,
        campaign_id=campaign_id,
        message_id=message_id,
        customer_id=customer_id,
        status="read",
        is_final=is_read_final,
    )
    
    if is_read_final:
        return
        
    await asyncio.sleep(random.uniform(0.3, inter_delay))

    # ── Step 5: clicked ───────────────────────────────────────────────────────
    is_clicked_final = not purchased_ok
    await _fire_callback(
        callback_url, secret,
        event_id=f"evt_{uuid.uuid4()}",
        dispatch_id=dispatch_id,
        campaign_id=campaign_id,
        message_id=message_id,
        customer_id=customer_id,
        status="clicked",
        is_final=is_clicked_final,
    )

    if is_clicked_final:
        return

    await asyncio.sleep(random.uniform(0.3, inter_delay))

    # ── Step 6: purchased ─────────────────────────────────────────────────────
    await _fire_callback(
        callback_url, secret,
        event_id=f"evt_{uuid.uuid4()}",
        dispatch_id=dispatch_id,
        campaign_id=campaign_id,
        message_id=message_id,
        customer_id=customer_id,
        status="purchased",
        is_final=True,
    )
