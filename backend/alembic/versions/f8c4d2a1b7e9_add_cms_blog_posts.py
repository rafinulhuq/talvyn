"""add cms blog posts

Revision ID: f8c4d2a1b7e9
Revises: e2f3a4b5c6d7
Create Date: 2026-07-06
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "f8c4d2a1b7e9"
down_revision: Union[str, None] = "e2f3a4b5c6d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS cms_blog_posts (
            id VARCHAR PRIMARY KEY,
            slug VARCHAR(255) NOT NULL UNIQUE,
            title VARCHAR(255) NOT NULL,
            excerpt TEXT,
            content_md TEXT NOT NULL DEFAULT '',
            cover_image_asset_id VARCHAR REFERENCES cms_media_assets(id) ON DELETE SET NULL,
            tags JSONB NOT NULL DEFAULT '[]'::jsonb,
            status VARCHAR(20) NOT NULL DEFAULT 'draft',
            author_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
            seo_title VARCHAR(255),
            seo_description TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            published_at TIMESTAMPTZ,
            archived_at TIMESTAMPTZ
        )
    """))
    op.execute(sa.text("""
        CREATE UNIQUE INDEX IF NOT EXISTS ix_cms_blog_posts_slug
        ON cms_blog_posts(slug)
    """))
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_cms_blog_posts_status_published
        ON cms_blog_posts(status, published_at)
    """))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS cms_blog_posts"))
