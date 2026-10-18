"""add_candidate_number

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-06-20 00:00:00.000000

Adds a human-readable sequential identifier to candidates ("Candidate #42")
distinct from their UUID id. Backed by a single-row counter table
(candidate_number_counters) rather than a native Postgres SEQUENCE so the
same atomic-increment code path works unchanged against SQLite in tests —
see the CandidateNumberCounter docstring in app/db/models/candidate.py.

Existing candidates are backfilled in created_at order so candidate_number
reads as "who applied first", and the counter is seeded to continue right
after the highest backfilled number.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd2e3f4a5b6c7'
down_revision: Union[str, None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text(
        "CREATE TABLE IF NOT EXISTS candidate_number_counters ("
        "id INTEGER NOT NULL PRIMARY KEY, "
        "next_value INTEGER NOT NULL DEFAULT 1"
        ")"
    ))

    op.execute(sa.text(
        "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS candidate_number INTEGER"
    ))

    # Backfill in created_at order — row_number() gives existing candidates
    # stable, gapless numbers reflecting application order.
    op.execute(sa.text("""
        UPDATE candidates
        SET candidate_number = numbered.rn
        FROM (
            SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
            FROM candidates
        ) AS numbered
        WHERE candidates.id = numbered.id
        AND candidates.candidate_number IS NULL
    """))

    op.execute(sa.text(
        "ALTER TABLE candidates ALTER COLUMN candidate_number SET NOT NULL"
    ))
    # PostgreSQL's ALTER TABLE ... ADD CONSTRAINT has no IF NOT EXISTS form —
    # same DO-block/EXCEPTION pattern used elsewhere in this codebase for
    # CREATE TYPE, so re-running this migration's upgrade() is idempotent.
    op.execute(sa.text("""
        DO $$ BEGIN
            ALTER TABLE candidates
            ADD CONSTRAINT uq_candidates_candidate_number UNIQUE (candidate_number);
        EXCEPTION WHEN duplicate_object THEN null;
        END $$
    """))

    # Seed the counter to continue right after the highest backfilled number
    # (or 1 if the table was empty) — one row, upserted so re-running this
    # migration's upgrade() against a partially-applied state is safe.
    op.execute(sa.text("""
        INSERT INTO candidate_number_counters (id, next_value)
        SELECT 1, COALESCE(MAX(candidate_number), 0) + 1 FROM candidates
        ON CONFLICT (id) DO UPDATE SET next_value = excluded.next_value
    """))


def downgrade() -> None:
    op.execute(sa.text(
        "ALTER TABLE candidates DROP CONSTRAINT IF EXISTS uq_candidates_candidate_number"
    ))
    op.drop_column('candidates', 'candidate_number')
    op.drop_table('candidate_number_counters')
