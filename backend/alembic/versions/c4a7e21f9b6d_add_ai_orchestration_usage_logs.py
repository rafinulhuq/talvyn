"""add_ai_orchestration_usage_logs

Revision ID: c4a7e21f9b6d
Revises: b8d3f0c91a7e
Create Date: 2026-06-23 00:00:00.000000

Master Prompt 3 — AI orchestration layer. Additive only:
  - ai_usage_logs (new table) for cross-provider call tracking
  - questions.skill_tags_json (new column) — GLM-generated bank questions
    carry a list of skill tags; the existing skill_tested (singular) column
    is untouched and keeps working for every previously-generated question
    and every existing reader of that field (e.g. evaluation_service's
    skill-breakdown grouping).
AiProviderService/AiTaskRouterService are pure Python orchestration — they
don't need their own schema beyond this usage log.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c4a7e21f9b6d'
down_revision: Union[str, None] = 'b8d3f0c91a7e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS ai_usage_logs (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            task_type VARCHAR(50) NOT NULL,
            provider VARCHAR(20) NOT NULL,
            model VARCHAR(100) NOT NULL,
            jd_id VARCHAR(36) REFERENCES job_descriptions(id) ON DELETE SET NULL,
            candidate_id VARCHAR(36) REFERENCES candidates(id) ON DELETE SET NULL,
            exam_attempt_id VARCHAR(36) REFERENCES exam_attempts(id) ON DELETE SET NULL,
            input_tokens INTEGER,
            output_tokens INTEGER,
            total_tokens INTEGER,
            latency_ms INTEGER,
            success BOOLEAN NOT NULL DEFAULT true,
            error_message VARCHAR(500),
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
    """))
    op.create_index(
        'ix_ai_usage_logs_created_at', 'ai_usage_logs', ['created_at'],
        unique=False, if_not_exists=True,
    )
    op.create_index(
        'ix_ai_usage_logs_task_type', 'ai_usage_logs', ['task_type'],
        unique=False, if_not_exists=True,
    )
    op.create_index(
        'ix_ai_usage_logs_jd_id', 'ai_usage_logs', ['jd_id'],
        unique=False, if_not_exists=True,
    )
    op.create_index(
        'ix_ai_usage_logs_exam_attempt_id', 'ai_usage_logs', ['exam_attempt_id'],
        unique=False, if_not_exists=True,
    )

    op.execute(sa.text(
        "ALTER TABLE questions ADD COLUMN IF NOT EXISTS skill_tags_json JSONB NOT NULL DEFAULT '[]'"
    ))


def downgrade() -> None:
    op.drop_column('questions', 'skill_tags_json')

    op.drop_index('ix_ai_usage_logs_exam_attempt_id', table_name='ai_usage_logs')
    op.drop_index('ix_ai_usage_logs_jd_id', table_name='ai_usage_logs')
    op.drop_index('ix_ai_usage_logs_task_type', table_name='ai_usage_logs')
    op.drop_index('ix_ai_usage_logs_created_at', table_name='ai_usage_logs')
    op.drop_table('ai_usage_logs')
