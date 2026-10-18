"""add_highgarden_feedback

Revision ID: h5g6v2feedback
Revises: h4g5v2heatmaps
Create Date: 2026-08-06 00:00:00.000000

Adds Highgarden feedback submissions for first-party qualitative feedback.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "h5g6v2feedback"
down_revision: Union[str, None] = "h4g5v2heatmaps"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS highgarden_feedback (
            id VARCHAR(32) PRIMARY KEY,
            session_id VARCHAR(100)
                REFERENCES visitor_sessions(id) ON DELETE SET NULL,
            path VARCHAR(500) NOT NULL,
            rating INTEGER NOT NULL,
            category VARCHAR(80) NOT NULL,
            comment TEXT,
            status VARCHAR(20) NOT NULL DEFAULT 'UNREAD',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_highgarden_feedback_status_created_at "
        "ON highgarden_feedback (status, created_at)"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_highgarden_feedback_path_created_at "
        "ON highgarden_feedback (path, created_at)"
    ))


def downgrade() -> None:
    op.drop_index("ix_highgarden_feedback_path_created_at", table_name="highgarden_feedback")
    op.drop_index("ix_highgarden_feedback_status_created_at", table_name="highgarden_feedback")
    op.drop_table("highgarden_feedback")
