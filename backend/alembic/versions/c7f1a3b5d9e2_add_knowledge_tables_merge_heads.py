"""add knowledge corpus tables + merge divergent heads

Creates knowledge_documents / knowledge_chunks for the RAG corpus
(bulk JD ingestion — see docs/superpowers/specs/
2026-07-05-bulk-jd-corpus-rag-ingestion-design.md).

Also serves as the alembic MERGE POINT for two divergent heads that both
chained off f8c4d2a1b7e9 (a4d8e2f6b1c3 author profiles and b2e5f7a9c1d3
blog claps) — without this merge, `alembic upgrade head` fails with
"Multiple head revisions are present" and backend startup migrations
break.

Revision ID: c7f1a3b5d9e2
Revises: a4d8e2f6b1c3, b2e5f7a9c1d3
Create Date: 2026-07-07
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "c7f1a3b5d9e2"
down_revision: Union[str, Sequence[str], None] = ("a4d8e2f6b1c3", "b2e5f7a9c1d3")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMBEDDING_DIM = 768  # nomic-embed-text output size


def upgrade() -> None:
    op.execute(sa.text("CREATE EXTENSION IF NOT EXISTS vector"))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS knowledge_documents (
            id VARCHAR PRIMARY KEY,
            source_type VARCHAR(40) NOT NULL DEFAULT 'jd_corpus',
            title VARCHAR(500) NOT NULL,
            filename VARCHAR(500) NOT NULL,
            content_hash VARCHAR(64) NOT NULL UNIQUE,
            pii_classification VARCHAR(20) NOT NULL DEFAULT 'none',
            char_count INTEGER NOT NULL DEFAULT 0,
            chunk_count INTEGER NOT NULL DEFAULT 0,
            metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_knowledge_documents_source_type
        ON knowledge_documents(source_type)
    """))
    op.execute(sa.text("""
        CREATE UNIQUE INDEX IF NOT EXISTS ix_knowledge_documents_content_hash
        ON knowledge_documents(content_hash)
    """))

    op.execute(sa.text(f"""
        CREATE TABLE IF NOT EXISTS knowledge_chunks (
            id VARCHAR PRIMARY KEY,
            document_id VARCHAR NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
            chunk_index INTEGER NOT NULL,
            content TEXT NOT NULL,
            char_count INTEGER NOT NULL DEFAULT 0,
            embedding vector({EMBEDDING_DIM}),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_knowledge_chunk_index UNIQUE (document_id, chunk_index)
        )
    """))
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_knowledge_chunks_document
        ON knowledge_chunks(document_id)
    """))
    # HNSW index for fast approximate cosine similarity — cheap when empty,
    # pgvector maintains it as chunk embeddings land.
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_knowledge_chunks_embedding_hnsw
        ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)
    """))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS knowledge_chunks"))
    op.execute(sa.text("DROP TABLE IF EXISTS knowledge_documents"))
