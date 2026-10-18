"""Similarity search over the knowledge corpus.

PostgreSQL: pgvector cosine distance with the HNSW index.
Other dialects (SQLite in tests): Python cosine over all chunks — correct
but O(n), fine for tests and tiny corpora only.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.knowledge import KnowledgeChunk, KnowledgeDocument
from app.services.rag.embedding_provider import embed_or_raise


@dataclass
class SearchHit:
    document_id: str
    document_title: str
    filename: str
    chunk_index: int
    content: str
    score: float  # cosine similarity, 1.0 = identical direction


async def search(
    db: AsyncSession,
    query: str,
    *,
    top_k: int = 5,
    source_type: str | None = "jd_corpus",
) -> list[SearchHit]:
    query_embedding = await embed_or_raise(query)

    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        return await _search_pgvector(db, query_embedding, top_k, source_type)
    return await _search_python(db, query_embedding, top_k, source_type)


async def _search_pgvector(
    db: AsyncSession,
    query_embedding: list[float],
    top_k: int,
    source_type: str | None,
) -> list[SearchHit]:
    source_filter = "AND kd.source_type = :source_type" if source_type else ""
    sql = text(
        f"""
        SELECT kd.id AS document_id,
               kd.title,
               kd.filename,
               kc.chunk_index,
               kc.content,
               1 - (kc.embedding <=> CAST(:query_embedding AS vector)) AS score
        FROM knowledge_chunks kc
        JOIN knowledge_documents kd ON kd.id = kc.document_id
        WHERE kc.embedding IS NOT NULL {source_filter}
        ORDER BY kc.embedding <=> CAST(:query_embedding AS vector)
        LIMIT :top_k
        """
    )
    params: dict = {"query_embedding": str(query_embedding), "top_k": top_k}
    if source_type:
        params["source_type"] = source_type
    rows = (await db.execute(sql, params)).mappings().all()
    return [
        SearchHit(
            document_id=row["document_id"],
            document_title=row["title"],
            filename=row["filename"],
            chunk_index=row["chunk_index"],
            content=row["content"],
            score=float(row["score"]),
        )
        for row in rows
    ]


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return dot / norm if norm else 0.0


async def _search_python(
    db: AsyncSession,
    query_embedding: list[float],
    top_k: int,
    source_type: str | None,
) -> list[SearchHit]:
    stmt = (
        select(KnowledgeChunk, KnowledgeDocument)
        .join(KnowledgeDocument, KnowledgeDocument.id == KnowledgeChunk.document_id)
        .where(KnowledgeChunk.embedding.is_not(None))
    )
    if source_type:
        stmt = stmt.where(KnowledgeDocument.source_type == source_type)
    rows = (await db.execute(stmt)).all()

    hits = [
        SearchHit(
            document_id=document.id,
            document_title=document.title,
            filename=document.filename,
            chunk_index=chunk.chunk_index,
            content=chunk.content,
            score=_cosine(query_embedding, chunk.embedding or []),
        )
        for chunk, document in rows
    ]
    hits.sort(key=lambda hit: hit.score, reverse=True)
    return hits[:top_k]
