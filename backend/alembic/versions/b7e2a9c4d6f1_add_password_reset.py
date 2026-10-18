"""Add single-use password recovery tokens and session revocation.

Revision ID: b7e2a9c4d6f1
Revises: f3a9d2c7b1e6

Uses `ADD COLUMN IF NOT EXISTS` / `CREATE UNIQUE INDEX IF NOT EXISTS` — same
pattern as e7c2a4f8b1d3_add_user_is_active and a3f7c9e1b4d6_add_signup_fields_
to_users — because 2b330cc211ed_initial_schema builds a fresh database with
`Base.metadata.create_all()` against the *current* ORM models. On a brand-new
database (CI's backend-migrations job) the User model already carries these
three columns, so a plain `op.add_column` here aborts the whole upgrade with
DuplicateColumn. Existing databases predate the model change and do need the
ALTERs, so both paths have to work.

The index name matches Postgres' own `<table>_<column>_key` convention, which
is also the name create_all() ends up with for the model's `unique=True`, so
the IF NOT EXISTS check actually matches on a fresh database.
"""
from alembic import op
import sqlalchemy as sa

revision: str = "b7e2a9c4d6f1"
down_revision: str = "f3a9d2c7b1e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
        "password_reset_token_hash VARCHAR(64)"
    ))
    op.execute(sa.text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
        "password_reset_expires_at TIMESTAMPTZ"
    ))
    op.execute(sa.text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
        "session_version INTEGER NOT NULL DEFAULT 0"
    ))
    op.execute(sa.text(
        "CREATE UNIQUE INDEX IF NOT EXISTS users_password_reset_token_hash_key "
        "ON users (password_reset_token_hash)"
    ))


def downgrade() -> None:
    # Dropping the column drops whatever backs the uniqueness (index on an
    # upgraded database, inline constraint on a create_all()-built one), so no
    # separate DROP INDEX — that would fail when it is constraint-owned.
    op.drop_column("users", "session_version")
    op.drop_column("users", "password_reset_expires_at")
    op.drop_column("users", "password_reset_token_hash")
