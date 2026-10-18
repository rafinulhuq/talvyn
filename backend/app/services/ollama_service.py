"""
Ollama HTTP client service.

Handles all communication with the local Ollama server:
- Single-turn generation via /api/generate
- JSON-only mode enforcement via format parameter
- Exponential backoff retry on transient failures
- Response cleaning and safe JSON extraction

Never import this directly in route handlers — use the higher-level
skill_extraction_service instead, which owns the prompt design.

Connection strategy:
  A single persistent httpx.AsyncClient is shared across all Ollama calls
  (init_http_client / close_http_client are called from the FastAPI lifespan).
  This avoids the ~5 ms TCP handshake + TLS overhead of creating a new client
  per call, and re-uses connections from the pool between concurrent requests.
  Per-request timeout overrides are used so health-check GETs still finish in 5s
  while long generation POSTs can run for up to OLLAMA_TIMEOUT_SECONDS.
"""

import asyncio
import json
import re
import time
from typing import Any

import httpx

from app.config import get_settings
from app.core.exceptions import AIResponseParseError, AIServiceError
from app.core.logging import get_logger

logger = get_logger(__name__)

# ─── Persistent HTTP client ───────────────────────────────────
# Initialised in lifespan startup; None until then (unit tests use the
# fallback path inside _post_once / ping / list_models).

_http_client: httpx.AsyncClient | None = None


def init_http_client() -> None:
    """
    Create the module-level persistent httpx client.
    Call once during FastAPI lifespan startup — before any requests arrive.
    """
    global _http_client
    settings = get_settings()
    timeout = float(settings.ollama_timeout_seconds)
    _http_client = httpx.AsyncClient(
        # Long read timeout for generation; short timeouts for the other phases.
        # Individual requests can override with their own timeout= kwarg.
        timeout=httpx.Timeout(connect=10.0, read=timeout, write=30.0, pool=5.0),
        # Keep-alive pool: up to 10 connections to Ollama (generous for parallel calls).
        limits=httpx.Limits(max_connections=10, max_keepalive_connections=10),
    )
    logger.info("Ollama persistent HTTP client initialised", read_timeout_s=timeout)


async def close_http_client() -> None:
    """
    Gracefully close the persistent client. Call in lifespan shutdown.
    """
    global _http_client
    if _http_client is not None:
        await _http_client.aclose()
        _http_client = None
        logger.info("Ollama persistent HTTP client closed")


# ─── Response cleaning ────────────────────────────────────────

# Matches ```json ... ``` or ``` ... ``` fences Gemma sometimes emits
# even when asked not to.
_CODE_FENCE_RE = re.compile(
    r"```(?:json)?\s*([\s\S]*?)```",
    re.IGNORECASE,
)

# Matches a JSON object or array at the outermost level
_JSON_OBJECT_RE = re.compile(r"\{[\s\S]*\}", re.DOTALL)

# Reasoning models (e.g. deepseek-r1) prefix their answer with a <think>...
# </think> chain-of-thought block. _JSON_OBJECT_RE is a greedy first-{-to-
# last-} match, so any stray brace inside that reasoning text (the model
# musing about "the {schema}" etc.) would otherwise get swallowed into the
# "JSON" and break parsing. Strip it before brace-matching.
_THINK_BLOCK_RE = re.compile(r"<think>[\s\S]*?</think>", re.IGNORECASE)


def _extract_json_from_text(text: str) -> str:
    """
    Best-effort extraction of a JSON object from LLM output that may
    contain markdown fences, preamble text, or trailing commentary.

    Priority:
    1. Content inside ```json ... ``` fences
    2. Outermost {...} block in the raw text
    3. The raw text itself (let json.loads surface the real error)
    """
    # Strip BOM, reasoning-model <think> blocks, and normalise whitespace
    text = _THINK_BLOCK_RE.sub("", text).strip().lstrip("\ufeff")

    # Try fenced block first
    fence_match = _CODE_FENCE_RE.search(text)
    if fence_match:
        return fence_match.group(1).strip()

    # Try bare JSON object
    obj_match = _JSON_OBJECT_RE.search(text)
    if obj_match:
        return obj_match.group(0)

    return text


def parse_json_response(raw: str) -> dict[str, Any]:
    """
    Parse a JSON object from an LLM text response.
    Raises AIResponseParseError with the original text on failure.
    """
    candidate = _extract_json_from_text(raw)
    try:
        result = json.loads(candidate)
        if not isinstance(result, dict):
            raise AIResponseParseError(
                f"AI returned a JSON {type(result).__name__} instead of an object. "
                f"Raw snippet: {raw[:200]!r}"
            )
        return result
    except json.JSONDecodeError as exc:
        raise AIResponseParseError(
            f"AI response is not valid JSON: {exc}. "
            f"Raw snippet: {raw[:200]!r}"
        ) from exc


# ─── Ollama client ────────────────────────────────────────────

class OllamaClient:
    """
    Thin async wrapper around the Ollama REST API.

    Uses /api/generate (single-turn) rather than /api/chat so we can
    explicitly control the full prompt template ourselves.

    Connection reuse: all HTTP calls go through the module-level
    `_http_client` persistent client (initialised in lifespan startup).
    A per-request timeout kwarg is passed to each call so health-check
    GETs (5 s) and long generation POSTs (up to OLLAMA_TIMEOUT_SECONDS)
    have the right deadlines without needing separate client instances.
    """

    def __init__(self) -> None:
        self._settings = get_settings()

    @property
    def base_url(self) -> str:
        return self._settings.ollama_base_url

    @property
    def model(self) -> str:
        return self._settings.ollama_model

    @property
    def timeout(self) -> float:
        return float(self._settings.ollama_timeout_seconds)

    @property
    def max_retries(self) -> int:
        return self._settings.ollama_max_retries

    # ── Core generation ───────────────────────────────────────

    async def generate(
        self,
        prompt: str,
        system: str,
        *,
        temperature: float = 0.1,
        seed: int | None = 42,
        num_predict: int = 8192,
    ) -> str:
        """
        Send a prompt to Ollama and return the raw response text.

        Args:
            prompt:      User content (the JD text + instruction)
            system:      System prompt (role + JSON constraint)
            temperature: Lower = more deterministic. Default 0.1 for structured output.
            seed:        Fixed seed for reproducibility across retries.

        Returns:
            Raw response text from the model.

        Raises:
            AIServiceError:      Ollama unreachable or HTTP error.
            AIResponseParseError: On final retry if JSON never validates.
        """
        payload: dict[str, Any] = {
            "model": self.model,
            "prompt": prompt,
            "system": system,
            "stream": False,
            "format": "json",          # Ollama JSON mode — constrains token sampling
            # Reasoning-capable local models (deepseek-r1/qwen3) can spend a
            # large part of the generation budget in hidden/visible thinking
            # before returning the JSON object. This app only calls Ollama for
            # strict machine-readable schemas, so disable thinking when the
            # server/model supports it. Older/non-thinking models ignore it.
            "think": False,
            "options": {
                "temperature": temperature,
                "num_predict": num_predict,
            },
        }
        if seed is not None:
            payload["options"]["seed"] = seed

        return await self._post_with_retry("/api/generate", payload)

    # ── Retry logic ───────────────────────────────────────────

    async def _post_with_retry(
        self,
        path: str,
        payload: dict[str, Any],
    ) -> str:
        """
        POST to Ollama with exponential backoff retry.

        Retry schedule: 2s → 4s → 8s (for max_retries=3)
        Does NOT retry on 4xx errors (model not found, bad request).
        """
        last_error: Exception | None = None

        for attempt in range(1, self.max_retries + 1):
            try:
                text = await self._post_once(path, payload)
                if attempt > 1:
                    logger.info(
                        "Ollama request succeeded after retry",
                        attempt=attempt,
                    )
                return text

            except AIServiceError as exc:
                last_error = exc
                if attempt == self.max_retries:
                    break
                wait = 2 ** attempt   # 2, 4, 8 …
                logger.warning(
                    "Ollama request failed, retrying",
                    attempt=attempt,
                    wait_seconds=wait,
                    error=str(exc),
                )
                await asyncio.sleep(wait)

        raise AIServiceError(
            f"Ollama unavailable after {self.max_retries} attempts: {last_error}"
        )

    async def _post_once(self, path: str, payload: dict[str, Any]) -> str:
        """Single POST attempt — raises AIServiceError on any HTTP/network failure."""
        url = f"{self.base_url}{path}"
        t0 = time.monotonic()

        # Per-request timeout so each generation call gets the full budget
        # regardless of how the persistent client was configured at init time.
        timeout = httpx.Timeout(
            connect=10.0,
            read=self.timeout,    # e.g. 600s — the bulk of generation time
            write=30.0,
            pool=5.0,
        )

        try:
            client = _http_client
            if client is not None:
                # Happy path: reuse the persistent connection pool
                response = await client.post(url, json=payload, timeout=timeout)
            else:
                # Fallback for unit tests / cases where lifespan wasn't run
                async with httpx.AsyncClient(timeout=timeout) as _fallback:
                    response = await _fallback.post(url, json=payload)

            elapsed = round((time.monotonic() - t0) * 1000)

            if response.status_code == 404:
                raise AIServiceError(
                    f"Model '{self.model}' not found in Ollama. "
                    f"Run: ollama pull {self.model}"
                )

            response.raise_for_status()

            data = response.json()
            raw_text: str = data.get("response", "")

            logger.debug(
                "Ollama generate complete",
                model=self.model,
                latency_ms=elapsed,
                response_chars=len(raw_text),
                prompt_eval_count=data.get("prompt_eval_count"),
                eval_count=data.get("eval_count"),
            )

            return raw_text

        except httpx.ConnectError as exc:
            raise AIServiceError(
                f"Cannot connect to Ollama at {self.base_url}. "
                "Is Ollama running? Run: ollama serve"
            ) from exc

        except httpx.TimeoutException as exc:
            raise AIServiceError(
                f"Ollama request timed out after {self.timeout}s. "
                "Try a smaller model or increase OLLAMA_TIMEOUT_SECONDS."
            ) from exc

        except httpx.HTTPStatusError as exc:
            raise AIServiceError(
                f"Ollama HTTP {exc.response.status_code}: {exc.response.text[:200]}"
            ) from exc

    # ── Health check ──────────────────────────────────────────

    async def ping(self) -> bool:
        """Return True if Ollama is reachable, False otherwise."""
        _short = httpx.Timeout(5.0)
        try:
            client = _http_client
            if client is not None:
                r = await client.get(f"{self.base_url}/api/tags", timeout=_short)
            else:
                async with httpx.AsyncClient(timeout=_short) as _fallback:
                    r = await _fallback.get(f"{self.base_url}/api/tags")
            return r.status_code == 200
        except Exception:
            return False

    async def list_models(self) -> list[str]:
        """Return names of locally available models."""
        _short = httpx.Timeout(5.0)
        try:
            client = _http_client
            if client is not None:
                r = await client.get(f"{self.base_url}/api/tags", timeout=_short)
            else:
                async with httpx.AsyncClient(timeout=_short) as _fallback:
                    r = await _fallback.get(f"{self.base_url}/api/tags")
            r.raise_for_status()
            return [m.get("name", "") for m in r.json().get("models", [])]
        except Exception:
            return []


# Module-level singleton — import this everywhere
ollama_client = OllamaClient()
