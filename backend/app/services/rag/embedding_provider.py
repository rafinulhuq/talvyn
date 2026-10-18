"""Embedding provider for the knowledge corpus.

Thin wrapper over the existing best-effort embedding_service: product
features treat a missing embedding as "skip silently", but a knowledge
corpus with NULL embeddings is unsearchable — so ingestion treats
failures as errors for that document instead.
"""

from app.config import get_settings
from app.services.embedding_service import EMBEDDING_DIM, generate_embedding

__all__ = ["EMBEDDING_DIM", "EmbeddingError", "embed_or_raise", "require_embeddings_enabled"]


class EmbeddingError(Exception):
    """Raised when an embedding is required but could not be generated."""


def require_embeddings_enabled() -> None:
    """Fail fast (e.g. at CLI startup) instead of per-file, with a fixable message."""
    settings = get_settings()
    if not settings.embedding_enabled:
        raise EmbeddingError(
            "Embeddings are disabled. Set EMBEDDING_ENABLED=true and make sure the "
            f"embedding model is pulled (ollama pull {settings.ollama_embedding_model})."
        )


async def embed_or_raise(text: str) -> list[float]:
    embedding = await generate_embedding(text)
    if embedding is None:
        settings = get_settings()
        raise EmbeddingError(
            "Embedding generation failed (is Ollama reachable and "
            f"'{settings.ollama_embedding_model}' pulled?)."
        )
    return embedding
