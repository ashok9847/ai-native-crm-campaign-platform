"""Nudge backend — FastAPI application factory."""

import asyncio
import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan: startup → yield → shutdown."""
    settings = get_settings()
    logger.info("Nudge backend starting (stall timeout: %ds)", settings.campaign_stall_timeout_seconds)

    # Database connection startup check
    from app.core.database import engine  # noqa: PLC0415
    from sqlalchemy import text  # noqa: PLC0415
    try:
        print("DATABASE CONNECTION CHECK: Attempting connection...")
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        print("DATABASE CONNECTION CHECK: SUCCESS!")
    except Exception as e:
        print(f"DATABASE CONNECTION CHECK: FAILED! Error: {e}")
        logger.error("Database connection check failed: %s", e, exc_info=True)

    # Stall-detection background task — imported lazily to avoid circular imports
    from app.services.stall_service import run_stall_detection  # noqa: PLC0415
    from app.core.database import AsyncSessionLocal  # noqa: PLC0415

    stall_task = asyncio.create_task(run_stall_detection(AsyncSessionLocal))

    # Campaign scheduler background task (T045)
    from app.services.scheduler_service import scheduler_loop  # noqa: PLC0415
    scheduler_task = asyncio.create_task(scheduler_loop())

    yield

    stall_task.cancel()
    scheduler_task.cancel()
    try:
        await stall_task
    except asyncio.CancelledError:
        pass
    try:
        await scheduler_task
    except asyncio.CancelledError:
        pass
    logger.info("Nudge backend shut down cleanly")


def create_app() -> FastAPI:
    """Build and configure the FastAPI application."""
    from app.core.logging import setup_logging_sanitizer  # noqa: PLC0415
    setup_logging_sanitizer()

    app = FastAPI(
        title="Nudge CRM API",
        version="0.1.0",
        description="AI-native mini CRM for BrewMate campaign management",
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

    # ── Routers ────────────────────────────────────────────────────────────
    from app.routers import customers, campaigns, delivery, auth, tenants, orders, ai, audiences  # noqa: PLC0415
    from app.routers import dashboard, health as health_router, analytics, communications  # noqa: PLC0415

    app.include_router(customers.router, prefix="/api/v1")
    app.include_router(campaigns.router, prefix="/api/v1")
    app.include_router(delivery.router, prefix="/api/v1")
    app.include_router(tenants.router, prefix="/api/v1")
    app.include_router(orders.router, prefix="/api/v1")
    app.include_router(ai.router, prefix="/api/v1")
    app.include_router(audiences.router, prefix="/api/v1")
    app.include_router(auth.router)
    app.include_router(dashboard.router)  # T021: /api/v1/dashboard
    app.include_router(health_router.router)  # T029: /api/v1/health
    app.include_router(analytics.router)  # T037: /api/v1/analytics
    app.include_router(communications.router)  # T049: /api/v1/communications

    # ── Health check ───────────────────────────────────────────────────────
    @app.get("/", tags=["health"])
    async def root() -> dict[str, str]:
        return {"status": "ok", "message": "Nudge API is running"}

    @app.get("/health", tags=["health"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
