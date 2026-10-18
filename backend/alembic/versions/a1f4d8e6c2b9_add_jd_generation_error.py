"""add_jd_generation_error

Revision ID: a1f4d8e6c2b9
Revises: 4b645fbb2927
Create Date: 2026-06-29 00:00:00.000000

Test generation / skill extraction failures only ever surfaced
generation_status=FAILED to the frontend — the actual exception (timeout,
malformed JSON, Ollama unreachable, etc.) was logged server-side and
discarded. Additive only: one nullable VARCHAR(500) column, same pattern as
ai_usage_logs.error_message / webhook_deliveries.error_message.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1f4d8e6c2b9'
down_revision: Union[str, None] = '4b645fbb2927'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text(
        "ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS generation_error VARCHAR(500)"
    ))


def downgrade() -> None:
    op.drop_column('job_descriptions', 'generation_error')
