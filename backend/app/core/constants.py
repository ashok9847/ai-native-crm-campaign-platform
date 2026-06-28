"""Named constants for the Nudge backend.

All magic numbers live here — never inline literals in business logic.
"""

# ── Segmentation ──────────────────────────────────────────────────────────────
MAX_SEGMENT_SAMPLE_SIZE: int = 10
"""Maximum number of customer IDs returned as a preview in the segment detail."""

LARGE_SEGMENT_THRESHOLD: int = 500
"""Customer count above which a soft-warning flag is set on the segment response."""

# ── AI retry behaviour ────────────────────────────────────────────────────────
AI_RETRY_DELAY_SECONDS: float = 0.5
"""Seconds to wait before a single automatic AI retry on transient failure."""

AI_MAX_RETRIES: int = 1
"""Number of automatic retries for AI calls before surfacing an error."""

# ── SSE stream parameters ─────────────────────────────────────────────────────
SSE_HEARTBEAT_INTERVAL_SECONDS: int = 15
"""Seconds between SSE keep-alive comment lines (prevents proxy timeouts)."""

SSE_POLL_INTERVAL_SECONDS: float = 1.0
"""Seconds between delivery-event poll cycles inside the SSE generator."""

# ── Pagination ────────────────────────────────────────────────────────────────
DEFAULT_PAGE_SIZE: int = 20
MAX_PAGE_SIZE: int = 100

# ── Message editing ───────────────────────────────────────────────────────────
MAX_EDITED_BODY_LENGTH: int = 2_000
"""Maximum character length for a marketer-edited message body."""

# ── Intent ────────────────────────────────────────────────────────────────────
MAX_INTENT_LENGTH: int = 500
"""Maximum character length for a campaign intent string."""
