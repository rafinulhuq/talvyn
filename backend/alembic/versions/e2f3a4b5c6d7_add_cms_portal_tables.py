"""add cms portal tables

Revision ID: e2f3a4b5c6d7
Revises: a1f4d8e6c2b9
Create Date: 2026-07-05
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "e2f3a4b5c6d7"
down_revision: Union[str, None] = "a1f4d8e6c2b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS cms_content_documents (
            id VARCHAR PRIMARY KEY,
            key VARCHAR(64) NOT NULL UNIQUE,
            draft_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            published_json JSONB,
            updated_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
            published_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            published_at TIMESTAMPTZ
        )
    """))
    op.execute(sa.text("""
        CREATE UNIQUE INDEX IF NOT EXISTS ix_cms_documents_key
        ON cms_content_documents(key)
    """))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS cms_content_versions (
            id VARCHAR PRIMARY KEY,
            document_id VARCHAR NOT NULL REFERENCES cms_content_documents(id) ON DELETE CASCADE,
            document_key VARCHAR(64) NOT NULL,
            version INTEGER NOT NULL,
            content_json JSONB NOT NULL,
            created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_cms_document_version UNIQUE (document_id, version)
        )
    """))
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_cms_versions_document_created
        ON cms_content_versions(document_id, created_at)
    """))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS cms_media_assets (
            id VARCHAR PRIMARY KEY,
            storage_key VARCHAR(500) NOT NULL UNIQUE,
            filename VARCHAR(255) NOT NULL,
            content_type VARCHAR(120) NOT NULL,
            size_bytes INTEGER NOT NULL,
            title VARCHAR(255),
            alt_text TEXT,
            created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            archived_at TIMESTAMPTZ
        )
    """))
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_cms_media_created_at
        ON cms_media_assets(created_at)
    """))
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_cms_media_archived_at
        ON cms_media_assets(archived_at)
    """))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS cms_media_assets"))
    op.execute(sa.text("DROP TABLE IF EXISTS cms_content_versions"))
    op.execute(sa.text("DROP TABLE IF EXISTS cms_content_documents"))
