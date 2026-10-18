"""
AI Provider Service (Master Prompt 3).

Abstracts "call an LLM" behind one interface with two backends:
  - "local"  — the existing Ollama server (wraps ollama_service.OllamaClient,
               unchanged — this module never duplicates its retry/timeout logic)
  - "glm"    — an OpenAI-compatible chat-completions cloud endpoint, configured
               via GLM_API_BASE_URL/GLM_API_KEY/GLM_MODEL. Disabled (falls back
               to local) unless both glm_enabled=true AND an API key are set —
               this code makes no assumption about which actual provider sits
               behind that URL (Zhipu's official API, OpenRouter, Together.ai,
               and self-hosted vLLM are all OpenAI-compatible).

Design note — error handling is result-based, not exception-based: unlike
ollama_service.OllamaClient.generate() (which raises AIServiceError /
AIResponseParseError), AiGenerateResponse.success/.error lets every caller
decide what "fail gracefully" means for its own task (retry once, mark a
bank FAILED, mark an attempt evaluation_failed, etc.) without a try/except
at every call site.

Never logs glm_api_key or any request/response body containing it — only
whether a key is configured.
"""

import json
import time
from collections.abc import Callable
from dataclasses import dataclass, field, replace
from typing import Any, Generic, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from app.config import get_settings
from app.core.exceptions import AIResponseParseError, AIServiceError
from app.core.logging import get_logger
from app.services.ollama_service import ollama_client, parse_json_response

logger = get_logger(__name__)

T = TypeVar("T", bound=BaseModel)

Provider = str  # "local" | "glm"


@dataclass
class AiGenerateRequest:
    task_type: str
    system_prompt: str
    user_prompt: str
    model_preference: Provider = "local"  # resolved value — "auto" is accepted but
    # treated as "local" here; resolving "auto" is AiTaskRouterService's job, done
    # BEFORE calling generate() so this module never has to know the routing table.
    expected_json_schema: type[BaseModel] | None = None
    temperature: float = 0.1
    max_tokens: int = 8192
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class AiGenerateResponse(Generic[T]):  # noqa: UP046 — PEP 695 syntax needs
    # auditing every other consumer of the module-level `T` TypeVar first;
    # not a behavior issue, just newer syntax.
    success: bool
    model_used: str
    provider: str
    parsed_json: T | None = None
    raw_text: str | None = None
    usage: dict[str, int] | None = None
    error: str | None = None
    latency_ms: int = 0


async def generate(req: AiGenerateRequest, db: Any | None = None) -> AiGenerateResponse:
    """
    Run one AI generation call against the resolved provider, validate the
    JSON response against `expected_json_schema` if given, and (when `db`
    is supplied) log the call to ai_usage_logs regardless of outcome.

    Never raises — failures (timeout, invalid JSON, provider unavailable,
    etc.) come back as `AiGenerateResponse(success=False, error=...)`.
    """
    settings = get_settings()
    provider = req.model_preference if req.model_preference in ("local", "glm") else "local"

    if provider == "glm" and not _glm_configured(settings):
        logger.warning(
            "GLM requested but not configured — falling back to local",
            task_type=req.task_type,
        )
        provider = "local"

    t0 = time.monotonic()
    model_used = settings.glm_model if provider == "glm" else settings.ollama_model

    try:
        if provider == "glm":
            raw_text, usage, model_used = await _call_glm(req, settings)
        else:
            raw_text, usage = await _call_local(req)

        parsed: BaseModel | None = None
        if req.expected_json_schema is not None:
            parsed = _validate_json(raw_text, req.expected_json_schema)

        response = AiGenerateResponse(
            success=True,
            model_used=model_used,
            provider=provider,
            parsed_json=parsed,
            raw_text=raw_text,
            usage=usage,
            latency_ms=round((time.monotonic() - t0) * 1000),
        )
    except (AIServiceError, AIResponseParseError, ValidationError) as exc:
        response = AiGenerateResponse(
            success=False,
            model_used=model_used,
            provider=provider,
            error=str(exc)[:500],
            latency_ms=round((time.monotonic() - t0) * 1000),
        )
        logger.error(
            "AI generate call failed",
            task_type=req.task_type,
            provider=provider,
            error=str(exc)[:200],
        )

    if db is not None:
        await _log_usage(req, response, db)

    return response


async def generate_with_correction(
    req: AiGenerateRequest,
    *,
    build_correction_prompt: Callable[[str, str], str],
    max_corrections: int = 2,
    db: Any | None = None,
) -> AiGenerateResponse:
    """
    Call generate(); on JSON-parse or schema-validation failure, re-prompt
    up to `max_corrections` times on the SAME provider/system/schema —
    switching providers mid-retry would defeat the point of deliberately
    routing a task to GLM for quality.

    `build_correction_prompt(errors, previous_response_snippet)` builds the
    next user_prompt — callers own their own correction wording/counts
    (e.g. "keep exactly N questions"), this function only owns the retry loop.
    """
    response = await generate(req, db=db)
    if response.success:
        return response

    for attempt in range(1, max_corrections + 1):
        correction_prompt = build_correction_prompt(
            response.error or "Response was not valid JSON.",
            (response.raw_text or "")[:1200],
        )
        retry_req = replace(req, user_prompt=correction_prompt)
        response = await generate(retry_req, db=db)
        if response.success:
            logger.info(
                "AI generate succeeded after correction",
                task_type=req.task_type,
                attempt=attempt,
            )
            return response

    return response


def _glm_configured(settings) -> bool:
    return bool(settings.glm_enabled and settings.glm_api_base_url and settings.glm_api_key)


async def _call_local(req: AiGenerateRequest) -> tuple[str, dict[str, int] | None]:
    raw = await ollama_client.generate(
        prompt=req.user_prompt,
        system=req.system_prompt,
        temperature=req.temperature,
        num_predict=req.max_tokens,
    )
    return raw, None  # Ollama's /api/generate doesn't report token usage in this codebase's call shape


async def _call_glm(req: AiGenerateRequest, settings) -> tuple[str, dict[str, int] | None, str]:
    """
    OpenAI-compatible chat-completions call against settings.glm_model.
    If that exhausts its own retries and settings.glm_fallback_model is
    configured (and different), tries the fallback once before giving up —
    covers a transient outage/quota hit on the primary model. Returns the
    name of whichever model actually produced the response.
    """
    try:
        content, usage = await _call_glm_model(req, settings, settings.glm_model)
        return content, usage, settings.glm_model
    except (AIServiceError, AIResponseParseError) as exc:
        fallback = settings.glm_fallback_model
        if not fallback or fallback == settings.glm_model:
            raise
        logger.warning(
            "GLM primary model failed — retrying with fallback model",
            task_type=req.task_type,
            primary_model=settings.glm_model,
            fallback_model=fallback,
            error=str(exc)[:200],
        )
        content, usage = await _call_glm_model(req, settings, fallback)
        return content, usage, fallback


async def _call_glm_model(req: AiGenerateRequest, settings, model: str) -> tuple[str, dict[str, int] | None]:
    """Retries with exponential backoff on transient failures against ONE model."""
    url = f"{settings.glm_api_base_url.rstrip('/')}/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": req.system_prompt},
            {"role": "user", "content": req.user_prompt},
        ],
        "temperature": req.temperature,
        "max_tokens": req.max_tokens,
        "response_format": {"type": "json_object"},
    }
    headers = {"Authorization": f"Bearer {settings.glm_api_key}"}
    timeout = httpx.Timeout(connect=10.0, read=float(settings.glm_timeout_seconds), write=30.0, pool=5.0)

    last_error: Exception | None = None
    for attempt in range(1, settings.glm_max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code == 401:
                # Never echo the key itself — only that auth failed.
                raise AIServiceError("GLM provider rejected the request (invalid API key).")
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            usage_raw = data.get("usage") or {}
            usage = {
                "input_tokens": usage_raw.get("prompt_tokens", 0),
                "output_tokens": usage_raw.get("completion_tokens", 0),
                "total_tokens": usage_raw.get("total_tokens", 0),
            }
            return content, usage
        except httpx.TimeoutException:
            last_error = AIServiceError(f"GLM request to {model} timed out after {settings.glm_timeout_seconds}s.")
        except httpx.ConnectError:
            last_error = AIServiceError(f"Cannot connect to GLM provider at {settings.glm_api_base_url}.")
        except httpx.HTTPStatusError as exc:
            last_error = AIServiceError(f"GLM provider HTTP {exc.response.status_code}: {exc.response.text[:200]}")
        except AIServiceError as exc:
            last_error = exc
        except (KeyError, IndexError, json.JSONDecodeError) as exc:
            last_error = AIResponseParseError(f"GLM returned an unexpected response shape: {exc}")

        if attempt < settings.glm_max_retries:
            import asyncio
            await asyncio.sleep(2 ** attempt)

    raise last_error or AIServiceError(f"GLM provider call failed for model {model} for an unknown reason.")


def _validate_json(raw_text: str, schema: type[BaseModel]) -> BaseModel:
    data = parse_json_response(raw_text)
    return schema.model_validate(data)


async def _log_usage(req: AiGenerateRequest, response: AiGenerateResponse, db: Any) -> None:
    from app.services import ai_usage_service

    try:
        await ai_usage_service.log_call(
            db,
            task_type=req.task_type,
            provider=response.provider,
            model=response.model_used,
            jd_id=req.metadata.get("jd_id"),
            candidate_id=req.metadata.get("candidate_id"),
            exam_attempt_id=req.metadata.get("exam_attempt_id"),
            usage=response.usage,
            latency_ms=response.latency_ms,
            success=response.success,
            error_message=response.error,
        )
    except Exception as exc:
        # Usage logging must never break the actual AI call's caller.
        logger.warning("Failed to log AI usage", task_type=req.task_type, error=str(exc))
