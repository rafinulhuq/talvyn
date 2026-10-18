"""add_attempt_integrity_termination

Revision ID: 39c7dbf5068d
Revises: d4db19da1290
Create Date: 2026-06-20 00:00:00.000000

Adds hard exam-integrity enforcement:
  - AttemptStatus.TERMINATED / InvitationStatus.TERMINATED — a new terminal
    state distinct from REVOKED (admin action) for candidate-side violations
    (tab switch, leaving the window, etc.)
  - test_attempts.integrity_violation_reason / terminated_at
  - invitations.integrity_violation_reason / terminated_at (denormalized from
    the terminating attempt so admin list views don't need to join)

ALTER TYPE ... ADD VALUE is safe inside a transaction on PG12+ as long as the
new value isn't used in the same transaction — this migration only adds the
value, it never inserts/updates a row with it.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '39c7dbf5068d'
down_revision: Union[str, None] = 'd4db19da1290'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        DO $$ BEGIN
            ALTER TYPE "AttemptStatus" ADD VALUE 'TERMINATED';
        EXCEPTION WHEN duplicate_object THEN null;
        END $$
    """))
    op.execute(sa.text("""
        DO $$ BEGIN
            ALTER TYPE "InvitationStatus" ADD VALUE 'TERMINATED';
        EXCEPTION WHEN duplicate_object THEN null;
        END $$
    """))

    op.execute(sa.text(
        "ALTER TABLE test_attempts ADD COLUMN IF NOT EXISTS "
        "integrity_violation_reason VARCHAR(50)"
    ))
    op.execute(sa.text(
        "ALTER TABLE test_attempts ADD COLUMN IF NOT EXISTS "
        "terminated_at TIMESTAMP WITH TIME ZONE"
    ))
    op.execute(sa.text(
        "ALTER TABLE invitations ADD COLUMN IF NOT EXISTS "
        "integrity_violation_reason VARCHAR(50)"
    ))
    op.execute(sa.text(
        "ALTER TABLE invitations ADD COLUMN IF NOT EXISTS "
        "terminated_at TIMESTAMP WITH TIME ZONE"
    ))


def downgrade() -> None:
    op.drop_column('invitations', 'terminated_at')
    op.drop_column('invitations', 'integrity_violation_reason')
    op.drop_column('test_attempts', 'terminated_at')
    op.drop_column('test_attempts', 'integrity_violation_reason')
    # Postgres has no ALTER TYPE ... DROP VALUE — leaving the enum values in
    # place on downgrade is the standard, accepted tradeoff for this pattern
    # (matches how this repo already handles other enum additions).
