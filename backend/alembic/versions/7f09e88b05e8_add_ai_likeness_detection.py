"""add_ai_likeness_detection

Revision ID: 7f09e88b05e8
Revises: 39c7dbf5068d
Create Date: 2026-06-20 00:00:00.000000

Adds an opt-in (AI_LIKENESS_ENABLED) AI-likeness estimate for open-ended
answers — a probabilistic writing-style signal, never a verdict:
  - evaluations.overall_ai_likeness_percentage / overall_ai_detection_confidence / flagged_answer_count
  - question_feedback.estimated_ai_percentage / ai_detection_confidence /
    suspicious_phrases / ai_detection_explanation / ai_detection_recommendation

Two new Postgres enum TYPEs (AIDetectionConfidence, AIDetectionRecommendation)
are created fresh here — unlike the integrity-enforcement migration, this
does not extend an existing enum, so the simpler CREATE TYPE pattern applies.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '7f09e88b05e8'
down_revision: Union[str, None] = '39c7dbf5068d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE "AIDetectionConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$
    """))
    op.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE "AIDetectionRecommendation" AS ENUM ('NO_CONCERN', 'REVIEW_SUGGESTED', 'HIGH_CONCERN');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$
    """))

    op.execute(sa.text(
        "ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS "
        "overall_ai_likeness_percentage DOUBLE PRECISION"
    ))
    op.execute(sa.text(
        'ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS '
        'overall_ai_detection_confidence "AIDetectionConfidence"'
    ))
    op.execute(sa.text(
        "ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS "
        "flagged_answer_count INTEGER NOT NULL DEFAULT 0"
    ))

    op.execute(sa.text(
        "ALTER TABLE question_feedback ADD COLUMN IF NOT EXISTS "
        "estimated_ai_percentage DOUBLE PRECISION"
    ))
    op.execute(sa.text(
        'ALTER TABLE question_feedback ADD COLUMN IF NOT EXISTS '
        'ai_detection_confidence "AIDetectionConfidence"'
    ))
    op.execute(sa.text(
        "ALTER TABLE question_feedback ADD COLUMN IF NOT EXISTS "
        "suspicious_phrases JSONB"
    ))
    op.execute(sa.text(
        "ALTER TABLE question_feedback ADD COLUMN IF NOT EXISTS "
        "ai_detection_explanation TEXT"
    ))
    op.execute(sa.text(
        'ALTER TABLE question_feedback ADD COLUMN IF NOT EXISTS '
        'ai_detection_recommendation "AIDetectionRecommendation"'
    ))


def downgrade() -> None:
    op.execute(sa.text("ALTER TABLE question_feedback DROP COLUMN IF EXISTS ai_detection_recommendation"))
    op.execute(sa.text("ALTER TABLE question_feedback DROP COLUMN IF EXISTS ai_detection_explanation"))
    op.execute(sa.text("ALTER TABLE question_feedback DROP COLUMN IF EXISTS suspicious_phrases"))
    op.execute(sa.text("ALTER TABLE question_feedback DROP COLUMN IF EXISTS ai_detection_confidence"))
    op.execute(sa.text("ALTER TABLE question_feedback DROP COLUMN IF EXISTS estimated_ai_percentage"))
    op.execute(sa.text("ALTER TABLE evaluations DROP COLUMN IF EXISTS flagged_answer_count"))
    op.execute(sa.text("ALTER TABLE evaluations DROP COLUMN IF EXISTS overall_ai_detection_confidence"))
    op.execute(sa.text("ALTER TABLE evaluations DROP COLUMN IF EXISTS overall_ai_likeness_percentage"))
    op.execute(sa.text('DROP TYPE IF EXISTS "AIDetectionRecommendation"'))
    op.execute(sa.text('DROP TYPE IF EXISTS "AIDetectionConfidence"'))
