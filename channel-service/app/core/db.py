"""SQLite database helper for channel-service."""

import os
import sqlite3

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "channel_service.db")

def get_db_connection() -> sqlite3.Connection:
    """Return a connection to the SQLite database."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db() -> None:
    """Initialize the SQLite database schema."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Table callback_retries: added callback_url and webhook_secret columns
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS callback_retries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            callback_url TEXT NOT NULL,
            webhook_secret TEXT NOT NULL,
            event_payload TEXT NOT NULL,
            retry_count INTEGER NOT NULL DEFAULT 0,
            next_attempt_at TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            last_error TEXT,
            created_at TEXT NOT NULL
        )
    """)

    # Table dead_letter_callbacks
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS dead_letter_callbacks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            callback_url TEXT NOT NULL,
            event_payload TEXT NOT NULL,
            failed_at TEXT NOT NULL,
            reason TEXT NOT NULL
        )
    """)

    conn.commit()
    conn.close()
