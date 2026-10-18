"""
Embedding generation for semantic candidate similarity search (pgvector).

Opt-in feature — disabled unless EMBEDDING_ENABLED=true. Enabling requires
a dedicated small Ollama embedding model (default: nomic-embed-text, ~274MB,
768-dim, CPU-friendly), separate from the main generation model so it
doesn't compete for VRAM with test generation/evaluation.

Embeddings are a ranking aid, never a hard dependency: every failure mode
here (feature disabled, model not pulled, Ollama unreachable, malformed
response) is logged and swallowed by returning None. Callers must treat
None as "skip — leave embedding column NULL", not as an error to surface.
"""

import httpx

from app.config import get_settings
from app.core.logging import get_logger
from app.services import ollama_service

logger = get_logger(__name__)

EMBEDDING_DIM = 768  # must match Evaluation.embedding / VectorType(768)

# Embeddings are a single short-lived request — generous but bounded.
_EMBED_TIMEOUT = httpx.Timeout(connect=10.0, read=30.0, write=10.0, pool=5.0)

# Ollama embedding models have a much smaller context window than chat
# models; truncate to a safe character budget rather than risk a 400.
_MAX_INPUT_CHARS = 8000


async def generate_embedding(text: str) -> list[float] | None:
    """
    Return a 768-dim embedding for `text`, or None if embeddings are
    disabled, the input is empty, or generation fails for any reason.
    """
    settings = get_settings()
    if not settings.embedding_enabled:
        return None
    if not text or not text.strip():
        return None

    payload = {
        "model": settings.ollama_embedding_model,
        "prompt": text[:_MAX_INPUT_CHARS],
    }
    url = f"{settings.ollama_base_url}/api/embeddings"

    try:
        # Reuse the persistent connection pool from ollama_service when the
        # FastAPI lifespan has initialised it (the normal request/worker
        # path); fall back to a one-off client otherwise (unit tests).
        client = ollama_service._http_client
        if client is not None:
            response = await client.post(url, json=payload, timeout=_EMBED_TIMEOUT)
        else:
            async with httpx.AsyncClient(timeout=_EMBED_TIMEOUT) as fallback:
                response = await fallback.post(url, json=payload)

        if response.status_code == 404:
            logger.warning(
                "Embedding model not found in Ollama — skipping embedding",
                model=settings.ollama_embedding_model,
                hint=f"Run: ollama pull {settings.ollama_embedding_model}",
            )
            return None

        response.raise_for_status()
        embedding = response.json().get("embedding")

        if not embedding or len(embedding) != EMBEDDING_DIM:
            logger.warning(
                "Embedding response had unexpected shape — skipping",
                got_dim=len(embedding) if embedding else 0,
                expected_dim=EMBEDDING_DIM,
            )
            return None

        return embedding

    except Exception as exc:
        logger.warning("Embedding generation failed — skipping", error=str(exc))
        return None
