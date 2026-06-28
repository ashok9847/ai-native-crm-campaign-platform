"""Application settings loaded from environment variables via pydantic-settings."""

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All configuration is read from environment variables or a .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Database ──────────────────────────────────────────────────────────
    database_url: str

    # ── AI / Nebius (primary) ─────────────────────────────────────────────
    nebius_api_key: str
    nebius_base_url: str = "https://api.tokenfactory.us-central1.nebius.com/v1/"
    kimi_model: str = "openai/gpt-oss-120b-fast"

    # ── AI / GitHub Models (backup) ─────────────────────────────────
    # Set GITHUB_TOKEN to a personal access token (classic) or fine-grained token.
    # Leave empty to disable backup (primary-only mode).
    github_token: str = ""
    github_base_url: str = "https://models.github.ai/inference"
    github_model: str = "openai/gpt-4.1"

    # ── Channel service ───────────────────────────────────────────────────
    channel_service_url: str = "http://localhost:8001"
    channel_webhook_secret: str

    # ── Backend public URL (used to build callback URLs sent to channel) ──
    backend_url: str = "http://localhost:8000"

    # ── Campaign behaviour ────────────────────────────────────────────────
    campaign_stall_timeout_seconds: int = 300

    # ── Customer health scoring ──────────────────────────────────────────
    churn_threshold: int = 30  # Health score below this = "churning" zone

    # ── Security & JWT ───────────────────────────────────────────────────
    secret_key: str = "nudge-default-secret-key-2026-change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 10080  # 7 days

    # ── CORS Allowed Origins ──────────────────────────────────────────────
    allowed_origins: str = "http://localhost:3000,https://nudge-campaign-copilot.vercel.app"

    @field_validator("database_url", mode="before")
    @classmethod
    def _ensure_asyncpg_scheme(cls, v: str) -> str:
        """Auto-correct bare postgresql:// → postgresql+asyncpg:// for the async engine.

        Also catches the common mistake of writing user@password instead of
        user:password in the connection URL and raises a clear error.
        """
        # Promote bare postgresql:// to asyncpg dialect
        if v.startswith("postgresql://"):
            v = v.replace("postgresql://", "postgresql+asyncpg://", 1)
        if v.startswith("postgres://"):
            v = v.replace("postgres://", "postgresql+asyncpg://", 1)

        # Sanity-check: after stripping the scheme, the netloc must contain :
        # to separate username from password.  Two @ signs in the netloc
        # indicates the user wrote  user@password@host  instead of  user:password@host.
        try:
            from urllib.parse import urlparse  # noqa: PLC0415
            parsed = urlparse(v)
            if parsed.username and parsed.password is None and "@" in (parsed.hostname or ""):
                raise ValueError(
                    "DATABASE_URL appears malformed: use 'user:password@host', not 'user@password@host'."
                )
        except ValueError:
            raise
        except Exception:
            pass  # urlparse failure — let SQLAlchemy surface the real error

        return v

    @field_validator("nebius_base_url", mode="before")
    @classmethod
    def _ensure_trailing_slash(cls, v: str) -> str:
        """Nebius base URL must end with / for the OpenAI SDK."""
        return v if v.endswith("/") else f"{v}/"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached Settings singleton."""
    return Settings()
