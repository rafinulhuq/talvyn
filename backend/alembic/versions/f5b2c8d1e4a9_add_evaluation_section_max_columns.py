"""Add evaluations.mcq_max and evaluations.open_ended_max.

Revision ID: f5b2c8d1e4a9
Revises: e8f1c4a7b3d9

The Evaluation model has carried these two columns, but no migration ever
added them. The initial migration builds tables from the *current* ORM
metadata (Base.metadata.create_all), so databases created recently have
them, while older databases do not. On those, every query that loads an
Evaluation fails with "column evaluations.mcq_max does not exist"
(for example GET /api/v1/candidates/{id}/attempts).

ADD COLUMN IF NOT EXISTS makes this a no-op where the columns already exist.
Existing rows are backfilled from question_feedback, using the same split as
evaluation_service: multiple choice on one side, open-ended plus code on the
other (the same rule calculate_evaluation_scores() uses).
"""
from alembic import op
import sqlalchemy as sa

revision: str = "f5b2c8d1e4a9"
down_revision: str = "e8f1c4a7b3d9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text(
        "ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS mcq_max INTEGER NOT NULL DEFAULT 0"
    ))
    op.execute(sa.text(
        "ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS open_ended_max INTEGER NOT NULL DEFAULT 0"
    ))
    # Backfill only rows still at the default, so a database that already had
    # correct values (created via create_all) is left untouched.
    op.execute(sa.text("""
        UPDATE evaluations e
        SET mcq_max = s.mcq_max,
            open_ended_max = s.open_ended_max
        FROM (
            SELECT attempt_id,
                   COALESCE(SUM(max_score) FILTER (WHERE question_type = 'MCQ'), 0)::INT AS mcq_max,
                   COALESCE(SUM(max_score) FILTER (WHERE question_type IN ('OPEN_ENDED', 'CODE')), 0)::INT AS open_ended_max
            FROM question_feedback
            GROUP BY attempt_id
        ) s
        WHERE s.attempt_id = e.attempt_id
          AND e.mcq_max = 0
          AND e.open_ended_max = 0
    """))


def downgrade() -> None:
    # Deliberately not dropping the columns: they belong to the ORM model and
    # databases created via create_all had them before this migration existed.
    pass
