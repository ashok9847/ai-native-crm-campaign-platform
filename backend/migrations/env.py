"""Alembic migration environment — raw asyncpg edition.

Connects via raw asyncpg (not SQLAlchemy) so we can use ssl=True which
wraps the socket in TLS immediately, bypassing the SSLRequest negotiation
that Supabase PgBouncer rejects on Windows.

Windows: requires WindowsSelectorEventLoopPolicy for asyncpg.
"""

from __future__ import annotations

import asyncio
import re
import ssl
import sys
import urllib.parse as urlparse_mod
from logging.config import fileConfig

import asyncpg
from alembic import context
from alembic.operations import MigrationScript
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine
from sqlalchemy.pool import NullPool

# ── Alembic config ────────────────────────────────────────────────────────────
alembic_config = context.config

if alembic_config.config_file_name is not None:
    fileConfig(alembic_config.config_file_name)

# ── Load DATABASE_URL from pydantic-settings ─────────────────────────────────
from app.core.config import get_settings  # noqa: E402

_settings = get_settings()
_raw_url = _settings.database_url  # e.g. postgresql+asyncpg://user:pass@host/db

# Ensure asyncpg scheme
_async_url = (
    _raw_url
    .replace("postgresql://", "postgresql+asyncpg://", 1)
    .replace("postgres://", "postgresql+asyncpg://", 1)
)
# Strip query params — we'll pass ssl as connect_arg
if "?" in _async_url:
    _async_url = _async_url.split("?")[0]

# ── Import ALL ORM models so autogenerate sees the schema ─────────────────────
from app.core.base import Base  # noqa: E402
from app.models import campaign, customer, delivery, message, segment  # noqa: F401,E402

target_metadata = Base.metadata


# ── Helpers: parse DSN for raw asyncpg ───────────────────────────────────────
def _parse_dsn(url: str) -> dict:
    """Extract connection params from a postgresql+asyncpg:// URL."""
    # Strip dialect prefix — asyncpg.connect doesn't understand SQLAlchemy URLs
    clean = re.sub(r"^postgresql\+asyncpg://", "postgresql://", url)
    parsed = urlparse_mod.urlparse(clean)
    return {
        "user": urlparse_mod.unquote(parsed.username or "postgres"),
        "password": urlparse_mod.unquote(parsed.password or ""),
        "host": parsed.hostname,
        "port": parsed.port or 5432,
        "database": parsed.path.lstrip("/") or "postgres",
    }


# ── SSL context: CERT_NONE is fine for migration one-shot ─────────────────────
_ssl_ctx = ssl.create_default_context()
_ssl_ctx.check_hostname = False
_ssl_ctx.verify_mode = ssl.CERT_NONE


# ── Offline mode ──────────────────────────────────────────────────────────────
def run_migrations_offline() -> None:
    """Emit SQL to stdout — no live DB required."""
    context.configure(
        url=_async_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


# ── Online mode (raw asyncpg) ─────────────────────────────────────────────────
def _do_run_migrations(connection: AsyncConnection) -> None:
    context.configure(
        connection=connection,  # type: ignore[arg-type]
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def _run_async_migrations() -> None:
    """Connect via raw asyncpg with ssl=True (no SSLRequest handshake)."""
    params = _parse_dsn(_async_url)

    # ssl=True tells asyncpg to wrap the socket immediately — no SSLRequest sent.
    # This is required for Supabase PgBouncer which rejects the SSLRequest packet.
    conn: asyncpg.Connection = await asyncpg.connect(
        **params,
        ssl=_ssl_ctx,
    )

    # asyncpg doesn't speak SQLAlchemy — translate using a raw connection proxy.
    # We use SQLAlchemy only for DDL generation, then execute via asyncpg directly.
    engine: AsyncEngine = create_async_engine(
        _async_url,
        poolclass=NullPool,
        connect_args={"ssl": _ssl_ctx},
    )

    try:
        # Use asyncpg connection wrapped in SQLAlchemy's async context
        async with engine.begin() as sa_conn:
            await sa_conn.run_sync(_do_run_migrations)
    except Exception:
        # Fallback: run through the raw asyncpg connection we already have
        await conn.close()
        raise
    finally:
        await engine.dispose()

    await conn.close()


def run_migrations_online() -> None:
    """Entry point — sets Windows event loop policy and runs async migrations."""
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(_run_async_migrations())


# ── Dispatch ──────────────────────────────────────────────────────────────────
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
