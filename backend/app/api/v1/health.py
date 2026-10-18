"""
Health check endpoints.
GET /api/v1/health         — basic liveness probe
GET /api/v1/health/ready   — readiness probe (checks DB + Ollama)
GET /api/v1/health/models  — which model is actually serving each AI task
"""

import time
from pathlib import Path
from typing import Any

import httpx
import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.core.logging import get_logger
from app.db.session import get_db
from app.services.ai_task_router_service import glm_configured

logger = get_logger(__name__)
router = APIRouter(tags=["Health"])


@router.get(
    "/health",
    summary="Liveness probe",
    response_description="Returns 200 if the service is running",
)
async def health_live(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """
    Lightweight liveness check.
    Use this for container health checks and load balancer pings.
    """
    return {
        "status": "ok",
        "service": settings.app_name,
        "version": settings.app_version,
        "environment": settings.app_env,
    }


@router.get(
    "/health/models",
    summary="Active model per AI task",
    response_description="Which model is actually configured to run each AI task right now",
)
async def active_models(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """
    Live readout of which model serves each AI task, so the frontend never
    has to hardcode a model name that drifts out of sync with backend config.
    """
    glm_on = glm_configured()
    quality_tier_model = settings.glm_model if glm_on else settings.ollama_model

    ai_detection: dict[str, Any]
    if not settings.ai_likeness_enabled:
        ai_detection = {"enabled": False, "backend": None, "model": None}
    elif settings.ai_detection_backend == "desklib":
        ai_detection = {
            "enabled": True,
            "backend": "desklib",
            "model": settings.desklib_model_name,
        }
    else:
        ai_detection = {
            "enabled": True,
            "backend": "llm",
            "model": settings.ollama_model,
        }

    return {
        "test_generation": {"model": settings.ollama_model, "tier": "local"},
        "question_bank_generation": {
            "model": quality_tier_model,
            "tier": "glm" if glm_on else "local",
        },
        "rubric_generation": {
            "model": quality_tier_model,
            "tier": "glm" if glm_on else "local",
        },
        "ai_detection": ai_detection,
    }


@router.get(
    "/health/ready",
    summary="Readiness probe",
    response_description="Returns 200 if all dependencies are reachable",
)
async def health_ready(
    request: Request,
    settings: Settings = Depends(get_settings),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """
    Full readiness check — verifies database and Ollama connectivity.
    Use this to determine if the service is ready to handle traffic.
    """
    checks: dict[str, Any] = {}
    overall_ok = True

    # ── Database check ────────────────────────────────────────
    db_start = time.monotonic()
    try:
        await db.execute(text("SELECT 1"))
        checks["database"] = {
            "status": "ok",
            "latency_ms": round((time.monotonic() - db_start) * 1000, 2),
        }
    except Exception as exc:
        logger.error("Database health check failed", error=str(exc))
        checks["database"] = {
            "status": "error",
            "detail": str(exc),
            "action": "Check DATABASE_URL and database container health.",
        }
        overall_ok = False

    # ── Redis / queue check ───────────────────────────────────
    redis_start = time.monotonic()
    redis_ok = False
    redis_client = aioredis.from_url(
        settings.redis_url,
        decode_responses=True,
        socket_connect_timeout=2.0,
        socket_timeout=2.0,
    )
    try:
        await redis_client.ping()
        redis_ok = True
        checks["redis"] = {
            "status": "ok",
            "latency_ms": round((time.monotonic() - redis_start) * 1000, 2),
        }
    except Exception as exc:
        logger.error("Redis health check failed", error=str(exc))
        checks["redis"] = {
            "status": "error",
            "detail": str(exc),
            "action": "Check REDIS_URL and the Redis container.",
        }
        overall_ok = False
    finally:
        await redis_client.aclose()

    checks["worker"] = {
        "status": "ok" if redis_ok and hasattr(request.app.state, "arq_pool") else "warning",
        "detail": (
            "Queue connection is available. Worker process health is inferred from Redis."
            if redis_ok and hasattr(request.app.state, "arq_pool")
            else "Queue pool is not attached in this API process."
        ),
        "action": (
            None
            if redis_ok and hasattr(request.app.state, "arq_pool")
            else "Check the ARQ worker container and backend startup logs."
        ),
    }

    # ── Ollama check ──────────────────────────────────────────
    ollama_start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{settings.ollama_base_url}/api/tags")
            response.raise_for_status()
            tags_data = response.json()
            model_names = [m.get("name", "") for m in tags_data.get("models", [])]
            model_available = any(
                settings.ollama_model in name for name in model_names
            )

        checks["ollama"] = {
            "status": "ok",
            "latency_ms": round((time.monotonic() - ollama_start) * 1000, 2),
            "model_configured": settings.ollama_model,
            "model_available": model_available,
            "available_models": model_names,
        }

        if not model_available:
            logger.warning(
                "Configured Ollama model not pulled yet",
                model=settings.ollama_model,
                available=model_names,
            )
            # Not a hard failure — model may still be downloading
            checks["ollama"]["status"] = "warning"
            checks["ollama"]["note"] = (
                f"Run: ollama pull {settings.ollama_model}"
            )
            checks["ollama"]["action"] = (
                f"Pull the configured model: ollama pull {settings.ollama_model}"
            )

    except httpx.ConnectError:
        logger.error("Ollama is not reachable", url=settings.ollama_base_url)
        checks["ollama"] = {
            "status": "unreachable",
            "detail": f"Cannot connect to Ollama at {settings.ollama_base_url}",
            "action": "Start Ollama or update OLLAMA_BASE_URL.",
        }
        overall_ok = False
    except Exception as exc:
        logger.error("Ollama health check failed", error=str(exc))
        checks["ollama"] = {
            "status": "error",
            "detail": str(exc),
            "action": "Check Ollama logs and model availability.",
        }
        overall_ok = False

    # ── Storage readiness/config ──────────────────────────────
    if settings.storage_backend == "local":
        upload_path = Path(settings.upload_dir)
        tmp_path = upload_path / "tmp"
        try:
            tmp_path.mkdir(parents=True, exist_ok=True)
            checks["storage"] = {
                "status": "ok",
                "backend": "local",
                "detail": f"Upload directory is writable: {upload_path}",
            }
        except Exception as exc:
            logger.error("Storage health check failed", error=str(exc))
            checks["storage"] = {
                "status": "error",
                "backend": "local",
                "detail": str(exc),
                "action": "Check UPLOAD_DIR permissions and mounted upload volume.",
            }
            overall_ok = False
    elif settings.storage_backend == "s3":
        checks["storage"] = {
            "status": "warning",
            "backend": "s3",
            "detail": (
                f"S3 backend configured for bucket {settings.minio_bucket}; "
                "object access is validated when files are read/written."
            ),
            "action": "Confirm MinIO/S3 credentials and bucket access before production use.",
        }
    else:
        checks["storage"] = {
            "status": "warning",
            "backend": settings.storage_backend,
            "detail": "Storage backend is configured but has no active health probe.",
        }

    # ── Email / public URL configuration ──────────────────────
    if settings.smtp_host:
        checks["email"] = {
            "status": "ok",
            "provider": "smtp",
            "detail": f"SMTP relay configured at {settings.smtp_host}:{settings.smtp_port}.",
        }
    elif settings.resend_api_key and settings.resend_api_key != "re_your_key_here":
        checks["email"] = {
            "status": "ok",
            "provider": "resend",
            "detail": f"Resend sender configured as {settings.email_from}.",
        }
    else:
        checks["email"] = {
            "status": "warning",
            "provider": "none",
            "detail": "No production email provider is configured.",
            "action": "Set SMTP_* or RESEND_API_KEY plus a verified sender domain.",
        }

    public_url_looks_local = "localhost" in settings.magic_link_base_url
    checks["magic_links"] = {
        "status": "warning" if public_url_looks_local else "ok",
        "base_url": settings.magic_link_base_url,
        "detail": (
            "Magic links still point at localhost."
            if public_url_looks_local
            else "Magic link base URL is configured."
        ),
        "action": (
            "Set MAGIC_LINK_BASE_URL to the public candidate URL."
            if public_url_looks_local
            else None
        ),
    }

    localhost_origins = [
        origin for origin in settings.allowed_origins_list if "localhost" in origin
    ]
    checks["cors"] = {
        "status": "warning"
        if settings.app_env == "production" and localhost_origins
        else "ok",
        "allowed_origins_count": len(settings.allowed_origins_list),
        "detail": (
            "Production CORS still includes localhost origins."
            if settings.app_env == "production" and localhost_origins
            else "Allowed origins are configured."
        ),
        "action": (
            "Trim ALLOWED_ORIGINS to production admin/candidate domains."
            if settings.app_env == "production" and localhost_origins
            else None
        ),
    }

    status_code = 200 if overall_ok else 503

    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ok" if overall_ok else "degraded",
            "service": settings.app_name,
            "version": settings.app_version,
            "checks": checks,
        },
    )
