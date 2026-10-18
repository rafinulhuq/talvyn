"""add_highgarden_alert_settings

Revision ID: h6g7v2alerts
Revises: h5g6v2feedback
Create Date: 2026-08-06 00:00:00.000000

Adds first-party Highgarden alert configuration.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "h6g7v2alerts"
down_revision: Union[str, None] = "h5g6v2feedback"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS highgarden_alert_settings (
            id VARCHAR(32) PRIMARY KEY,
            enabled BOOLEAN NOT NULL DEFAULT false,
            recipients_json TEXT NOT NULL DEFAULT '[]',
            error_threshold INTEGER NOT NULL DEFAULT 5,
            dead_click_threshold INTEGER NOT NULL DEFAULT 10,
            drop_threshold INTEGER NOT NULL DEFAULT 25,
            weekly_digest_enabled BOOLEAN NOT NULL DEFAULT false,
            last_sent_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))


def downgrade() -> None:
    op.drop_table("highgarden_alert_settings")
