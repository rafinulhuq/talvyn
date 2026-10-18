"""add_highgarden_click_coordinates

Revision ID: h4g5v2heatmaps
Revises: h3g4v2attention
Create Date: 2026-08-06 00:00:00.000000

Adds normalized click coordinates for Highgarden heatmaps. Coordinates are
stored as 0-100 percentages, not screenshots or DOM snapshots.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "h4g5v2heatmaps"
down_revision: Union[str, None] = "h3g4v2attention"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE tracked_events
            ADD COLUMN IF NOT EXISTS x_pct DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS y_pct DOUBLE PRECISION
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_tracked_events_path_type_device_created_at "
        "ON tracked_events (path, type, device_type, created_at)"
    ))


def downgrade() -> None:
    op.drop_index("ix_tracked_events_path_type_device_created_at", table_name="tracked_events")
    op.execute(sa.text("""
        ALTER TABLE tracked_events
            DROP COLUMN IF EXISTS y_pct,
            DROP COLUMN IF EXISTS x_pct
    """))
