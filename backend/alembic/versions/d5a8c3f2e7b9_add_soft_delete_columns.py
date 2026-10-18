"""add_soft_delete_columns

Revision ID: d5a8c3f2e7b9
Revises: a3f7c9e1b4d6
Create Date: 2026-08-05 00:00:00.000000

Adds a nullable `deleted_at` soft-delete timestamp to job_descriptions,
tests, and candidates to back the admin Trash / recycle-bin feature. NULL
means the row is live; a non-NULL timestamp means it has been moved to the
trash (hidden from normal lists, restorable until purged).

Blog posts already have an equivalent `archived_at` column (see the CMS blog
model / blog_service) and are handled through that existing field, so they
are intentionally not touched here.

Partial indexes on `deleted_at IS NULL` keep the common "live rows only"
list queries fast without bloating the index with trashed rows.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd5a8c3f2e7b9'
down_revision: Union[str, None] = 'a3f7c9e1b4d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_TABLES = ("job_descriptions", "tests", "candidates")


def upgrade() -> None:
    for table in _TABLES:
        op.execute(sa.text(
            f"ALTER TABLE {table} "
            "ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ"
        ))
        op.execute(sa.text(
            f"CREATE INDEX IF NOT EXISTS ix_{table}_deleted_at "
            f"ON {table} (deleted_at)"
        ))


def downgrade() -> None:
    for table in _TABLES:
        op.execute(sa.text(f"DROP INDEX IF EXISTS ix_{table}_deleted_at"))
        op.execute(sa.text(f"ALTER TABLE {table} DROP COLUMN IF EXISTS deleted_at"))
