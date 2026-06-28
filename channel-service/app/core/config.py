"""Channel-service application settings."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration for the Nudge channel microservice."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Authentication ────────────────────────────────────────────────────
    channel_webhook_secret: str = "nudge-dev-secret-2026"

    # ── Simulation timing (milliseconds) ─────────────────────────────────
    callback_min_delay_ms: int = 1_000
    callback_max_delay_ms: int = 5_000

    # ── Delivery drop-off rates ───────────────────────────────────────────
    delivery_rate: float = 0.95
    open_rate: float = 0.60
    click_rate: float = 0.30
    failure_rate: float = 0.10

    # ── CORS Allowed Origins ──────────────────────────────────────────────
    allowed_origins: str = "http://localhost:3000,https://nudge-campaign-copilot.vercel.app"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached Settings singleton."""
    return Settings()
