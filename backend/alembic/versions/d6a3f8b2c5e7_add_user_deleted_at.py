"""Add users.deleted_at for soft-delete + restore.

Revision ID: d6a3f8b2c5e7
Revises: c4f9e2a7d1b8

Lets a Super Admin remove a user account with a confirmation dialog and
restore it later — a hard DELETE isn't actually possible for most real
accounts today (job_descriptions.uploaded_by and invitations.invited_by
are required, non-nullable foreign keys with no ON DELETE clause, so
Postgres rejects deleting any user who has ever uploaded a JD or sent an
invitation). NULL = live; non-NULL = removed but recoverable. Mirrors the
job_descriptions.deleted_at / candidates.deleted_at pattern already used
for their own trash/restore flows.

Uses `ADD COLUMN IF NOT EXISTS` — same reasoning as b7e2a9c4d6f1: a
brand-new database built via `Base.metadata.create_all()` against the
current ORM models already has this column once User picks it up, so a
plain `op.add_column` would abort with DuplicateColumn there.
"""
from alembic import op
import sqlalchemy as sa

revision: str = "d6a3f8b2c5e7"
down_revision: str = "c4f9e2a7d1b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ"
    ))


def downgrade() -> None:
    op.drop_column("users", "deleted_at")
