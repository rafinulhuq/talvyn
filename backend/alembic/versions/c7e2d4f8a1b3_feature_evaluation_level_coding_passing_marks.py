"""feature_evaluation_level_coding_passing_marks

Revision ID: c7e2d4f8a1b3
Revises: f3a9c1d2e4b5
Create Date: 2026-06-05 00:00:00.000000

Adds:
  - evaluations.evaluation_level   (BEGINNER/INTERMEDIATE/ADVANCED/EXPERT)
  - evaluations.improvement_suggestions (JSON list)
  - evaluations.suitable_role       (text)
  - evaluations.skill_breakdown     (JSON dict skill->pct)
  - tests.passing_marks             (nullable int)
  - QuestionType.CODE               (new enum value)
  - questions.code_language         (nullable varchar)
  - questions.code_starter          (nullable text)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c7e2d4f8a1b3'
down_revision: Union[str, None] = 'f3a9c1d2e4b5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # All operations use IF NOT EXISTS because the initial_schema migration runs
    # create_all() from current ORM models, which already creates these types/columns.
    op.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE "EvaluationLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$
    """))

    op.execute(sa.text("ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS evaluation_level \"EvaluationLevel\""))
    op.execute(sa.text("ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS improvement_suggestions JSON NOT NULL DEFAULT '[]'"))
    op.execute(sa.text("ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS suitable_role TEXT"))
    op.execute(sa.text("ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS skill_breakdown JSON NOT NULL DEFAULT '{}'"))

    op.execute(sa.text("ALTER TABLE tests ADD COLUMN IF NOT EXISTS passing_marks INTEGER"))

    op.execute(sa.text("ALTER TYPE \"QuestionType\" ADD VALUE IF NOT EXISTS 'CODE'"))

    op.execute(sa.text("ALTER TABLE questions ADD COLUMN IF NOT EXISTS code_language VARCHAR(50)"))
    op.execute(sa.text("ALTER TABLE questions ADD COLUMN IF NOT EXISTS code_starter TEXT"))


def downgrade() -> None:
    op.drop_column('questions', 'code_starter')
    op.drop_column('questions', 'code_language')
    op.drop_column('tests', 'passing_marks')
    op.drop_column('evaluations', 'skill_breakdown')
    op.drop_column('evaluations', 'suitable_role')
    op.drop_column('evaluations', 'improvement_suggestions')
    op.drop_column('evaluations', 'evaluation_level')
    op.execute('DROP TYPE IF EXISTS "EvaluationLevel"')
