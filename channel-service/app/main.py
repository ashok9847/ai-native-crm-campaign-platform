"""Nudge channel microservice — FastAPI application factory."""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan hook — attach settings to app.state at startup."""
    app.state.settings = get_settings()
    logger.info("Channel service starting (secret configured: %s)", bool(app.state.settings.channel_webhook_secret))
    
    # Initialize SQLite database
    from app.core.db import init_db  # noqa: PLC0415
    init_db()
    
    # Start background retry worker loop
    import asyncio  # noqa: PLC0415
    from app.services.retry_service import retry_worker_loop  # noqa: PLC0415
    retry_task = asyncio.create_task(retry_worker_loop())
    
    yield
    
    retry_task.cancel()
    try:
        await retry_task
    except asyncio.CancelledError:
        pass
    logger.info("Channel service stopped")


def create_app() -> FastAPI:
    """Build and configure the channel-service FastAPI application."""
    app = FastAPI(
        title="Nudge Channel Service",
        version="0.1.0",
        description="Stubbed delivery channel microservice with async callback simulation",
        lifespan=lifespan,
    )

    from app.core.config import get_settings  # noqa: PLC0415
    settings = get_settings()
    origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
    allow_credentials = "*" not in origins

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=allow_credentials,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    from app.routers import dispatch  # noqa: PLC0415

    app.include_router(dispatch.router, prefix="/api/v1")

    @app.get("/health", tags=["health"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
