"""add_dev_role

Revision ID: f3a9d2c7b1e6
Revises: j9d8g7n6r5t4
Create Date: 2026-09-02 00:00:00.000000

Adds the 'DEV' value to the native Postgres "Role" enum. DEV is a
docs-only role — it unlocks the internal documentation site
(frontend/src/lib/docs.ts) and nothing else. It is deliberately excluded
from ROLE_RANK in app/dependencies.py, so it never satisfies a
require_min_role() check on any other admin route.

Same approach as e9b4c1d7a2f5_add_user_role.py: `ALTER TYPE ... ADD
VALUE` is allowed inside a transaction on PostgreSQL 12+ as long as the
new value isn't used until the transaction commits, which this migration
does not do. Idempotent (`IF NOT EXISTS`). PostgreSQL has no `DROP
VALUE`, so the downgrade is a no-op (an unused enum value is harmless).
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'f3a9d2c7b1e6'
down_revision: Union[str, None] = 'j9d8g7n6r5t4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE \"Role\" ADD VALUE IF NOT EXISTS 'DEV'")


def downgrade() -> None:
    # PostgreSQL cannot drop an enum value; leaving 'DEV' in place is safe.
    pass
