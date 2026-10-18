"""add_user_role

Revision ID: e9b4c1d7a2f5
Revises: d5a8c3f2e7b9
Create Date: 2026-08-05 00:00:00.000000

Adds the 'USER' value to the native Postgres "Role" enum. USER is the new
default self-signup role (a hiring "operator") that sits below ADMIN in the
hierarchy — see app/dependencies.py ROLE_RANK and
docs/superpowers/plans/2026-08-05-user-role-plan.md.

Note: on PostgreSQL 12+, `ALTER TYPE ... ADD VALUE` is allowed inside a
transaction block — the only restriction is that the new value cannot be
*used* until the transaction commits, which this migration does not do. So we
run it directly (no autocommit block, which is finicky under this project's
async/run_sync Alembic env). It is idempotent (`IF NOT EXISTS`). PostgreSQL
has no `DROP VALUE`, so the downgrade is a no-op (an unused enum value is
harmless).
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'e9b4c1d7a2f5'
down_revision: Union[str, None] = 'd5a8c3f2e7b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE \"Role\" ADD VALUE IF NOT EXISTS 'USER'")


def downgrade() -> None:
    # PostgreSQL cannot drop an enum value; leaving 'USER' in place is safe.
    pass
