"""add_calculate_evaluation_scores_function

Revision ID: d9e8f7a6b5c4
Revises: c7e2d4f8a1b3
Create Date: 2026-06-17 00:00:00.000000

Adds a PL/pgSQL function that re-aggregates evaluation scores directly from
the question_feedback table.  Useful for:
  - Score verification (confirm stored totals match per-question data)
  - Re-computing pass/fail after passing_marks is changed on a test
  - Future admin override flows that modify individual question scores
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'd9e8f7a6b5c4'
down_revision: Union[str, None] = 'c7e2d4f8a1b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE OR REPLACE FUNCTION calculate_evaluation_scores(p_attempt_id UUID)
        RETURNS TABLE (
            total_questions     INT,
            mcq_count           INT,
            open_ended_count    INT,
            code_count          INT,
            mcq_awarded         NUMERIC,
            mcq_max             NUMERIC,
            open_ended_awarded  NUMERIC,
            open_ended_max      NUMERIC,
            total_awarded       NUMERIC,
            total_max           NUMERIC,
            percentage          NUMERIC,
            passing_marks       INT,
            passed              BOOLEAN
        )
        LANGUAGE plpgsql
        AS $$
        DECLARE
            v_passing_marks INT;
        BEGIN
            -- Fetch passing_marks from the test linked to this attempt.
            -- NULL means no threshold has been set (pass/fail not applicable).
            SELECT t.passing_marks INTO v_passing_marks
            FROM test_attempts ta
            JOIN tests t ON t.id = ta.test_id
            WHERE ta.id = p_attempt_id;

            RETURN QUERY
            SELECT
                COUNT(*)::INT                                                              AS total_questions,
                COUNT(*) FILTER (WHERE question_type = 'MCQ')::INT                        AS mcq_count,
                COUNT(*) FILTER (WHERE question_type = 'OPEN_ENDED')::INT                 AS open_ended_count,
                COUNT(*) FILTER (WHERE question_type = 'CODE')::INT                       AS code_count,

                COALESCE(SUM(awarded_score) FILTER (WHERE question_type = 'MCQ'), 0)      AS mcq_awarded,
                COALESCE(SUM(max_score)     FILTER (WHERE question_type = 'MCQ'), 0)      AS mcq_max,

                COALESCE(SUM(awarded_score) FILTER (WHERE question_type IN ('OPEN_ENDED','CODE')), 0) AS open_ended_awarded,
                COALESCE(SUM(max_score)     FILTER (WHERE question_type IN ('OPEN_ENDED','CODE')), 0) AS open_ended_max,

                COALESCE(SUM(awarded_score), 0)                                            AS total_awarded,
                COALESCE(SUM(max_score), 0)                                                AS total_max,

                CASE
                    WHEN COALESCE(SUM(max_score), 0) = 0 THEN 0
                    ELSE ROUND(COALESCE(SUM(awarded_score), 0) /
                               COALESCE(SUM(max_score), 1) * 100, 1)
                END                                                                        AS percentage,

                v_passing_marks                                                            AS passing_marks,

                CASE
                    WHEN v_passing_marks IS NULL THEN NULL
                    WHEN COALESCE(SUM(max_score), 0) = 0 THEN FALSE
                    ELSE COALESCE(SUM(awarded_score), 0) >= v_passing_marks
                END                                                                        AS passed

            FROM question_feedback
            WHERE attempt_id = p_attempt_id;
        END;
        $$;
    """)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS calculate_evaluation_scores(UUID);")
