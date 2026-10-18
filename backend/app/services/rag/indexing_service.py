"""Knowledge corpus indexing: file bytes → chunked, embedded, stored document.

Idempotent by content hash — re-ingesting the same extracted text is a
no-op, which makes bulk runs resumable after a crash or Ctrl-C.
"""

from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.db.models.enums import FileType
from app.db.models.knowledge import KnowledgeChunk, KnowledgeDocument
from app.services.parser_service import ExtractionResult, ParseError
from app.services.rag.chunking_service import chunk_text
from app.services.rag.embedding_provider import EmbeddingError, embed_or_raise

logger = get_logger(__name__)

_SUFFIX_TO_FILE_TYPE = {
    ".pdf": FileType.PDF,
    ".docx": FileType.DOCX,
}


@dataclass
class IngestResult:
    filename: str
    status: str  # "ingested" | "skipped" | "failed" | "dry_run"
    extraction_method: str | None = None
    chunk_count: int = 0
    error: str | None = None


def file_type_for(filename: str) -> FileType | None:
    return _SUFFIX_TO_FILE_TYPE.get(Path(filename).suffix.lower())


def content_hash_of(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def title_from_text(text: str, filename: str) -> str:
    for line in text.splitlines():
        stripped = line.strip()
        if stripped:
            return stripped[:200]
    return Path(filename).stem[:200]


async def ingest_extracted_text(
    db: AsyncSession,
    *,
    filename: str,
    extraction: ExtractionResult,
    source_type: str = "jd_corpus",
    dry_run: bool = False,
    extra_metadata: dict | None = None,
) -> IngestResult:
    """Chunk, embed, and store already-extracted text as one document.

    The whole document (row + all chunks) is written in a single
    transaction — a mid-file failure never leaves a half-indexed document.
    """
    text = extraction.text
    digest = content_hash_of(text)

    existing = await db.execute(
        select(KnowledgeDocument.id).where(KnowledgeDocument.content_hash == digest)
    )
    if existing.scalar_one_or_none() is not None:
        return IngestResult(
            filename=filename, status="skipped", extraction_method=extraction.method
        )

    chunks = chunk_text(text)
    if not chunks:
        return IngestResult(
            filename=filename,
            status="failed",
            extraction_method=extraction.method,
            error="No chunks produced from extracted text.",
        )

    if dry_run:
        return IngestResult(
            filename=filename,
            status="dry_run",
            extraction_method=extraction.method,
            chunk_count=len(chunks),
        )

    # Embed everything BEFORE touching the session: embedding is the slow,
    # failure-prone step (Ollama), and doing it first means a failure leaves
    # the session completely clean — nothing to roll back.
    try:
        embeddings = [await embed_or_raise(chunk) for chunk in chunks]
    except EmbeddingError as exc:
        logger.warning("Knowledge ingestion failed", filename=filename, error=str(exc))
        return IngestResult(
            filename=filename,
            status="failed",
            extraction_method=extraction.method,
            error=str(exc),
        )

    try:
        document = KnowledgeDocument(
            id=str(uuid.uuid4()),
            source_type=source_type,
            title=title_from_text(text, filename),
            filename=filename[:500],
            content_hash=digest,
            char_count=len(text),
            chunk_count=len(chunks),
            metadata_json={
                "extraction_method": extraction.method,
                **(extra_metadata or {}),
            },
        )
        db.add(document)
        for index, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            db.add(
                KnowledgeChunk(
                    id=str(uuid.uuid4()),
                    document_id=document.id,
                    chunk_index=index,
                    content=chunk,
                    char_count=len(chunk),
                    embedding=embedding,
                )
            )
        await db.commit()
    except Exception as exc:
        # DB-level failure (constraint violation, connection loss): the whole
        # document rolls back — never a half-indexed document.
        await db.rollback()
        message = str(exc) if isinstance(exc, ParseError) else repr(exc)
        logger.warning("Knowledge ingestion failed", filename=filename, error=message)
        return IngestResult(
            filename=filename,
            status="failed",
            extraction_method=extraction.method,
            error=message,
        )

    logger.info(
        "Knowledge document ingested",
        filename=filename,
        chunks=len(chunks),
        method=extraction.method,
    )
    return IngestResult(
        filename=filename,
        status="ingested",
        extraction_method=extraction.method,
        chunk_count=len(chunks),
    )
