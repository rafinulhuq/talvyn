"""add_highgarden_attention_events

Revision ID: h3g4v2attention
Revises: h2g3v2context
Create Date: 2026-08-06 00:00:00.000000

Adds Highgarden v2 attention event types for sanitized client errors and
dead-click signals.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "h3g4v2attention"
down_revision: Union[str, None] = "h2g3v2context"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text('ALTER TYPE "TrackedEventType" ADD VALUE IF NOT EXISTS \'CLIENT_ERROR\''))
    op.execute(sa.text('ALTER TYPE "TrackedEventType" ADD VALUE IF NOT EXISTS \'DEAD_CLICK\''))


def downgrade() -> None:
    # PostgreSQL cannot drop enum values without recreating the enum and
    # rewriting dependent columns. Leave values in place on downgrade.
    pass
