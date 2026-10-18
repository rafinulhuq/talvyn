"""Redis-backed background jobs for the standalone admin AI Checker."""

import json
import uuid
from datetime import UTC, datetime
from typing import Any

import redis.asyncio as aioredis

from app.core.logging import get_logger
from app.schemas.ai_checker import AICheckResponse
from app.services.ai_detection_service import estimate_document_ai_likeness

logger = get_logger(__name__)

_redis: aioredis.Redis | None = None
_JOB_TTL_SECONDS = 3600


def set_redis_client(client: aioredis.Redis) -> None:
    """Provide the shared Redis client used by API and worker processes."""
    global _redis
    _redis = client


def _job_key(job_id: str) -> str:
    safe = "".join(c for c in job_id if c.isalnum() or c == "-")
    return f"ai_checker_job:{safe}"


def _now() -> str:
    return datetime.now(UTC).isoformat()


async def _write_job(job_id: str, payload: dict[str, Any]) -> None:
    if not _redis:
        raise RuntimeError("AI checker job store is unavailable.")
    await _redis.setex(_job_key(job_id), _JOB_TTL_SECONDS, json.dumps(payload))


async def create_check_job() -> str:
    """Create a queued job record and return its public id."""
    job_id = str(uuid.uuid4())
    timestamp = _now()
    await _write_job(
        job_id,
        {
            "job_id": job_id,
            "status": "QUEUED",
            "detail": "Waiting for the AI worker to start.",
            "result": None,
            "error": None,
            "created_at": timestamp,
            "updated_at": timestamp,
        },
    )
    return job_id


async def get_check_job(job_id: str) -> dict[str, Any] | None:
    """
    Return a job snapshot, or None if it expired/does not exist.

    Raises RuntimeError if the job store itself isn't wired up — that's a
    distinct, infra-level failure from "this job id doesn't exist," and
    callers should surface it as such (503, not 404) instead of telling the
    admin a job is "not found" when the real problem is Redis never having
    been connected for this process.
    """
    if not _redis:
        raise RuntimeError("AI checker job store is unavailable.")
    raw = await _redis.get(_job_key(job_id))
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Invalid AI checker job payload in Redis", job_id=job_id)
        return None
    return parsed if isinstance(parsed, dict) else None


async def _update_check_job(
    job_id: str,
    *,
    status: str,
    detail: str,
    result: AICheckResponse | None = None,
    error: str | None = None,
) -> None:
    existing = await get_check_job(job_id)
    timestamp = _now()
    payload: dict[str, Any] = {
        "job_id": job_id,
        "status": status,
        "detail": detail,
        "result": result.model_dump() if result else None,
        "error": error,
        "created_at": existing.get("created_at") if existing else timestamp,
        "updated_at": timestamp,
    }
    await _write_job(job_id, payload)


async def run_check_job(job_id: str, text: str, title: str | None = None) -> None:
    """Run the long writing analysis in the ARQ worker and store the outcome."""
    await _update_check_job(
        job_id,
        status="RUNNING",
        detail="Analyzing representative sections.",
    )

    try:
        result = await estimate_document_ai_likeness(text, title=title)
        if result is None:
            await _update_check_job(
                job_id,
                status="FAILED",
                detail="AI checker could not analyze this text.",
                error="Confirm the analysis service is running, then try again.",
            )
            return

        response = AICheckResponse(
            estimated_ai_percentage=result.estimated_ai_percentage,
            confidence=result.confidence,
            suspicious_phrases=result.suspicious_phrases,
            explanation=result.explanation,
            recommendation=result.recommendation,
            chunks_analyzed=result.chunks_analyzed,
            word_count=result.word_count,
            character_count=result.character_count,
        )
        await _update_check_job(
            job_id,
            status="SUCCEEDED",
            detail="AI-likeness analysis complete.",
            result=response,
        )
    except Exception as exc:
        logger.exception("AI checker background job failed", job_id=job_id)
        await _update_check_job(
            job_id,
            status="FAILED",
            detail="AI checker failed while analyzing the document.",
            error=str(exc) or "Unexpected AI checker failure.",
        )
