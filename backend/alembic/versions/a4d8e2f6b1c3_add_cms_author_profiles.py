"""add cms author profiles

Revision ID: a4d8e2f6b1c3
Revises: f8c4d2a1b7e9
Create Date: 2026-07-07
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "a4d8e2f6b1c3"
down_revision: Union[str, None] = "f8c4d2a1b7e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS cms_author_profiles (
            id VARCHAR PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            avatar_asset_id VARCHAR REFERENCES cms_media_assets(id) ON DELETE SET NULL,
            archived_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    op.execute(sa.text("""
        ALTER TABLE cms_blog_posts
        ADD COLUMN IF NOT EXISTS author_profile_id VARCHAR
        REFERENCES cms_author_profiles(id) ON DELETE SET NULL
    """))


def downgrade() -> None:
    op.execute(sa.text("ALTER TABLE cms_blog_posts DROP COLUMN IF EXISTS author_profile_id"))
    op.execute(sa.text("DROP TABLE IF EXISTS cms_author_profiles"))
