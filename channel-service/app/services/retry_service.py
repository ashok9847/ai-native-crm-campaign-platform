"""Callback retry service and background worker."""

import asyncio
import datetime
import json
import logging
import httpx
from app.core.db import get_db_connection

logger = logging.getLogger(__name__)

# Retry delays in seconds: attempt 1 -> 5s, attempt 2 -> 15s, attempt 3 -> 45s
RETRY_BACKOFFS = [5, 15, 45]

def enqueue_callback(callback_url: str, webhook_secret: str, event_payload: dict, error_msg: str) -> None:
    """Enqueue a failed callback event for retry."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    now = datetime.datetime.utcnow()
    # First retry attempt is scheduled at now + 5 seconds
    next_attempt = now + datetime.timedelta(seconds=RETRY_BACKOFFS[0])
    
    cursor.execute(
        """
        INSERT INTO callback_retries (callback_url, webhook_secret, event_payload, retry_count, next_attempt_at, status, last_error, created_at)
        VALUES (?, ?, ?, 0, ?, 'pending', ?, ?)
        """,
        (
            callback_url,
            webhook_secret,
            json.dumps(event_payload),
            next_attempt.isoformat(),
            error_msg,
            now.isoformat()
        )
    )
    conn.commit()
    conn.close()
    logger.info("Enqueued callback for retry: message_id=%s retry_id=%s next_attempt_at=%s", 
                event_payload.get("message_id"), event_payload.get("event_id"), next_attempt.isoformat())

async def process_pending_retries() -> None:
    """Fetch and process pending retries whose scheduled time has arrived."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    now_str = datetime.datetime.utcnow().isoformat()
    cursor.execute(
        "SELECT id, callback_url, webhook_secret, event_payload, retry_count FROM callback_retries WHERE status = 'pending' AND next_attempt_at <= ?",
        (now_str,)
    )
    rows = cursor.fetchall()
    conn.close()
    
    if not rows:
        return
        
    logger.info("Found %d pending callback retries to process", len(rows))
    
    # Process each pending retry
    async with httpx.AsyncClient(timeout=10.0) as client:
        for row in rows:
            retry_id = row["id"]
            callback_url = row["callback_url"]
            webhook_secret = row["webhook_secret"]
            payload_str = row["event_payload"]
            retry_count = row["retry_count"]
            
            payload = json.loads(payload_str)
            # Mark the payload as a retry
            payload["is_retry"] = True
            
            headers = {
                "Content-Type": "application/json",
                "X-Channel-Secret": webhook_secret,
            }
            
            success = False
            last_err_msg = ""
            
            try:
                logger.info("Retrying callback to %s (attempt %d/3)...", callback_url, retry_count + 1)
                resp = await client.post(callback_url, json=payload, headers=headers)
                if 200 <= resp.status_code < 300:
                    success = True
                    logger.info("Callback retry %d succeeded (HTTP %d)", retry_id, resp.status_code)
                else:
                    last_err_msg = f"HTTP {resp.status_code}: {resp.text[:200]}"
                    logger.warning("Callback retry %d failed with status %d", retry_id, resp.status_code)
            except Exception as exc:
                last_err_msg = str(exc)
                logger.error("Callback retry %d encountered error: %s", retry_id, exc)
                
            conn = get_db_connection()
            cursor = conn.cursor()
            
            if success:
                # Delete on success
                cursor.execute("DELETE FROM callback_retries WHERE id = ?", (retry_id,))
            else:
                next_count = retry_count + 1
                if next_count >= 3:
                    # Move to dead-letter queue
                    logger.error("Callback retry %d exhausted all 3 attempts. Moving to dead-letter queue.", retry_id)
                    cursor.execute(
                        """
                        INSERT INTO dead_letter_callbacks (callback_url, event_payload, failed_at, reason)
                        VALUES (?, ?, ?, ?)
                        """,
                        (
                            callback_url,
                            json.dumps(payload),
                            datetime.datetime.utcnow().isoformat(),
                            last_err_msg
                        )
                    )
                    cursor.execute("DELETE FROM callback_retries WHERE id = ?", (retry_id,))
                else:
                    # Schedule next attempt with backoff
                    backoff_sec = RETRY_BACKOFFS[next_count]
                    next_attempt = datetime.datetime.utcnow() + datetime.timedelta(seconds=backoff_sec)
                    cursor.execute(
                        """
                        UPDATE callback_retries
                        SET retry_count = ?, next_attempt_at = ?, last_error = ?
                        WHERE id = ?
                        """,
                        (next_count, next_attempt.isoformat(), last_err_msg, retry_id)
                    )
                    logger.info("Scheduled next retry attempt %d in %ds", next_count + 1, backoff_sec)
                    
            conn.commit()
            conn.close()

async def retry_worker_loop() -> None:
    """Infinite loop for the background retry worker."""
    logger.info("Callback retry background worker loop started")
    while True:
        try:
            await process_pending_retries()
        except Exception as exc:
            logger.error("Error in callback retry worker loop: %s", exc, exc_info=True)
        # Check every 5 seconds
        await asyncio.sleep(5.0)
