"""Async SQLAlchemy engine, session factory, and FastAPI dependency."""

import ssl
import contextvars
import logging
from collections.abc import AsyncGenerator
from typing import Optional
from fastapi import Request
import jwt
from sqlalchemy import text, event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.base import Base  # re-exported for backward compatibility
from app.core.config import get_settings

logger = logging.getLogger(__name__)

__all__ = ["Base", "engine", "AsyncSessionLocal", "get_db"]

# Context variable to hold the current request's tenant ID
current_tenant_id: contextvars.ContextVar[Optional[int]] = contextvars.ContextVar("current_tenant_id", default=None)

# Build an SSL context that works with Supabase PgBouncer.
# Passing an ssl.SSLContext object causes asyncpg to wrap the socket in TLS
# directly, bypassing the SSLRequest negotiation that PgBouncer rejects.
_ssl_ctx = ssl.create_default_context()
_ssl_ctx.check_hostname = False
_ssl_ctx.verify_mode = ssl.CERT_NONE  # still encrypted; skips CA verify


def _build_engine() -> object:
    """Build the async engine from settings."""
    settings = get_settings()
    return create_async_engine(
        settings.database_url,
        echo=False,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
        connect_args={"ssl": _ssl_ctx},
    )


engine = _build_engine()

# Listen to begin event to automatically set the local app.current_tenant variable
# whenever a new transaction is started. This is critical for PgBouncer transaction
# pooling or subsequent transactions executed after session commits.
@event.listens_for(engine.sync_engine, "begin")
def set_tenant_on_begin(conn):
    tenant_id = current_tenant_id.get()
    if tenant_id is not None:
        conn.exec_driver_sql(
            "SELECT set_config('app.current_tenant', $1, false)",
            (str(tenant_id),)
        )


AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


async def get_db(request: Request = None) -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields an async database session per request.

    Extracts the tenant ID from the JWT token in the Authorization header
    and sets the 'app.current_tenant' session variable in PostgreSQL to
    enforce Row-Level Security (RLS) policies.
    """
    tenant_id = None
    logger.debug("[get_db] Evaluating request for tenant database connection")
    if request:
        token = None
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.lower().startswith("bearer "):
            parts = auth_header.split(" ")
            if len(parts) == 2:
                token = parts[1]
        
        # Fallback to query parameter (e.g., for EventSource SSE)
        if not token:
            token = request.query_params.get("token")

        if token:
            try:
                settings = get_settings()
                payload = jwt.decode(
                    token,
                    settings.secret_key,
                    algorithms=[settings.algorithm]
                )
                tenant_id = payload.get("tenant_id")
            except Exception as e:
                logger.warning("[get_db] JWT decode error: %s", type(e).__name__)
                pass

    token_var = current_tenant_id.set(tenant_id)
    async with AsyncSessionLocal() as session:
        if tenant_id is not None:
            await session.execute(
                text("SELECT set_config('app.current_tenant', :tenant_id, false)"),
                {"tenant_id": str(tenant_id)}
            )
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            if tenant_id is not None:
                try:
                    await session.execute(text("RESET app.current_tenant"))
                except Exception:
                    pass
            current_tenant_id.reset(token_var)
