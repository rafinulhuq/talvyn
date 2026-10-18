"""add_concurrency_unique_constraints

Revision ID: a1b2c3d4e5f6
Revises: db7cdbbfd2a8
Create Date: 2026-06-19 00:00:00.000000

DB-level guarantees for two invariants that were previously only enforced
by a SELECT-then-INSERT check in application code (start_attempt,
create_invitation). Both checks have a TOCTOU race under concurrent
requests (double-click "Start Test", two browser tabs, two "Invite" clicks)
that a DB constraint closes for good:

  - test_attempts: at most one attempt per (invitation_id, test_id)
  - invitations:   at most one PENDING/OPENED ("active") invitation per
                    (candidate_id, jd_id) — terminal statuses
                    (COMPLETED/EXPIRED/REVOKED) are excluded so a candidate
                    can be legitimately re-invited later

No existing rows violate either constraint (checked against the live DB
before writing this migration), so this is a same-day, no-backfill change.
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'db7cdbbfd2a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # test_attempts: promote the existing non-unique composite index to unique.
    op.execute("DROP INDEX IF EXISTS ix_attempts_inv_test")
    op.create_index(
        'ix_attempts_inv_test',
        'test_attempts',
        ['invitation_id', 'test_id'],
        unique=True,
    )

    # invitations: new partial unique index — only PENDING/OPENED count as "active".
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_invitations_active_candidate_jd "
        "ON invitations (candidate_id, jd_id) "
        "WHERE status IN ('PENDING', 'OPENED')"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ux_invitations_active_candidate_jd")
    op.drop_index('ix_attempts_inv_test', table_name='test_attempts')
    op.create_index(
        'ix_attempts_inv_test',
        'test_attempts',
        ['invitation_id', 'test_id'],
        unique=False,
    )
