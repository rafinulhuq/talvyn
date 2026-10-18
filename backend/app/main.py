"""
Talvyn Platform — FastAPI Application Entry Point

Startup sequence:
1. Load and validate settings
2. Configure structured logging
3. Register exception handlers
4. Mount API routers
5. Register startup/shutdown lifecycle hooks
"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api.v1.router import router as api_v1_router
from app.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging, get_logger
from app.core.ratelimit import limiter

settings = get_settings()

# Configure logging before anything else
configure_logging(debug=settings.debug)
logger = get_logger(__name__)

# ─── Error tracking (GlitchTip / Sentry) ─────────────────────
# Initialise before the app is created so the SDK can instrument FastAPI.
# Skipped silently when GLITCHTIP_DSN is empty (default for local dev).
if settings.glitchtip_dsn:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
    sentry_sdk.init(
        dsn=settings.glitchtip_dsn,
        integrations=[FastApiIntegration(), SqlalchemyIntegration()],
        traces_sample_rate=0.1,   # 10 % of requests traced (performance)
        environment=settings.app_env,
        release=settings.app_version,
        # PII scrubbing: never send password fields or auth headers
        send_default_pii=False,
    )
    logger.info("GlitchTip / Sentry error tracking enabled", dsn=settings.glitchtip_dsn[:30] + "…")


# ─── Lifespan ─────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Application lifespan handler.
    Code before yield runs on startup; code after yield runs on shutdown.
    """
    logger.info(
        "Starting Talvyn API",
        version=settings.app_version,
        environment=settings.app_env,
        debug=settings.debug,
    )

    # ── Startup tasks ─────────────────────────────────────────
    # Verify database connectivity on startup (with retries for Docker DNS)
    import asyncio

    from sqlalchemy import text

    from app.db.session import AsyncSessionFactory

    db_ok = False
    for attempt in range(1, 6):
        try:
            async with AsyncSessionFactory() as session:
                await session.execute(text("SELECT 1"))
            logger.info("Database connection verified")
            db_ok = True
            break
        except Exception as exc:
            if attempt < 5:
                logger.warning(
                    "DB not ready, retrying…",
                    attempt=attempt,
                    error=str(exc),
                )
                await asyncio.sleep(2)
            else:
                logger.error("Failed to connect to database on startup", error=str(exc))
                # Don't raise — let readiness probe surface this

    # ── Schema note ────────────────────────────────────────────
    # create_all and manual ALTER TABLE statements have been removed.
    # Schema migrations are now managed by Alembic (see alembic/ directory).
    # prestart.sh runs "alembic upgrade head" before this process starts,
    # so by the time we reach this point the schema is already up to date.
    if db_ok:
        logger.info("Schema managed by Alembic — prestart.sh applied migrations before startup")

    # ── Reset stuck GENERATING statuses ───────────────────────────
    # If the server was killed mid-generation, JDs remain stuck in GENERATING.
    # On startup, move them to FAILED so the frontend shows the correct state
    # and admins can retry rather than seeing a永远spinning banner.
    if db_ok:
        from sqlalchemy import update as sa_update

        from app.db.models.enums import GenerationStatus
        from app.db.models.job_description import JobDescription
        async with AsyncSessionFactory() as session:
            result = await session.execute(
                sa_update(JobDescription)
                .where(
                    JobDescription.generation_status.in_([
                        GenerationStatus.GENERATING,
                        GenerationStatus.EXTRACTING,
                    ])
                )
                .values(
                    generation_status=GenerationStatus.FAILED,
                    generation_error="Server restarted while generation was in progress.",
                )
                .returning(JobDescription.id)
            )
            stuck_ids = [row[0] for row in result.all()]
            await session.commit()
        if stuck_ids:
            logger.warning(
                "Reset stuck generation statuses to FAILED on startup",
                count=len(stuck_ids),
                jd_ids=stuck_ids,
            )

    # Ensure upload directories exist via FileService
    from app.services.file_service import file_service
    file_service.ensure_directories()
    logger.info("Upload directories verified", upload_dir=settings.upload_dir)

    # ── Persistent Ollama HTTP client ──────────────────────────
    # Initialise once here so all requests reuse the connection pool
    # instead of paying a new TCP handshake on every Ollama call.
    from app.services.ollama_service import init_http_client
    init_http_client()

    # ── Redis client ───────────────────────────────────────────
    # Shared across all coroutines in this worker process.
    # Provides cross-worker progress tracking and rate-limit storage.
    import redis.asyncio as aioredis
    from arq.connections import RedisSettings, create_pool

    from app.services import (
        ai_checker_service,
        attempt_service,
        question_bank_service,
        test_generation_service,
    )

    redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)
    test_generation_service.set_redis_client(redis_client)
    attempt_service.set_redis_client(redis_client)
    ai_checker_service.set_redis_client(redis_client)
    question_bank_service.set_redis_client(redis_client)
    logger.info("Redis client initialised", url=settings.redis_url)

    # ── ARQ job pool ───────────────────────────────────────────
    # Used by API endpoints to enqueue Ollama jobs to the worker process.
    arq_pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    app.state.arq_pool = arq_pool
    from app.services import exam_attempt_service, webhook_service
    webhook_service.set_arq_pool(arq_pool)
    exam_attempt_service.set_arq_pool(arq_pool)
    logger.info("ARQ worker pool connected")

    yield

    # ── Shutdown tasks ────────────────────────────────────────
    from app.services.ollama_service import close_http_client
    await close_http_client()
    await arq_pool.aclose()
    await redis_client.aclose()
    logger.info("ARQ pool and Redis connection closed.")

    from app.db.base import engine
    await engine.dispose()
    logger.info("Database connections closed. Shutdown complete.")


# ─── Application ──────────────────────────────────────────────

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Backend API for the Talvyn platform. "
        "Handles file processing, AI-powered skill extraction, "
        "test generation, and candidate evaluation."
    ),
    docs_url="/docs" if (settings.debug or settings.show_docs) else None,
    redoc_url="/redoc" if (settings.debug or settings.show_docs) else None,
    openapi_url="/openapi.json" if (settings.debug or settings.show_docs) else None,
    lifespan=lifespan,
)

# ─── Metrics (Prometheus) ─────────────────────────────────────
# Exposes /metrics for Prometheus scraping via the internal Docker network.
# Prometheus accesses backend:8000/metrics directly — not proxied through nginx.
# excluded_handlers skips health and metrics itself from being instrumented.
from prometheus_fastapi_instrumentator import Instrumentator

Instrumentator(
    should_group_status_codes=True,
    excluded_handlers=["/metrics", "/api/v1/health"],
).instrument(app).expose(app, include_in_schema=False)

# ─── Rate limiting ────────────────────────────────────────────
# Attach the limiter to app.state so SlowAPIMiddleware can find it,
# then register the 429 handler so limited requests get a clean JSON body.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)


# ─── Middleware ────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


# ─── Exception handlers ───────────────────────────────────────

register_exception_handlers(app)


# ─── Routers ──────────────────────────────────────────────────

app.include_router(api_v1_router)


# ─── Root redirect ────────────────────────────────────────────

@app.get("/", include_in_schema=False)
async def root() -> dict:
    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs" if settings.debug else "disabled in production",
        "health": "/api/v1/health",
    }
