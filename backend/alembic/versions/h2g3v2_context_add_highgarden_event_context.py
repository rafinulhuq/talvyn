"""add_highgarden_event_context

Revision ID: h2g3v2context
Revises: h1g2a3r4d5en
Create Date: 2026-08-06 00:00:00.000000

Adds nullable context fields for Highgarden v2 analytics. Alembic remains
the schema authority; Prisma mirrors these fields for the Next.js client.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "h2g3v2context"
down_revision: Union[str, None] = "h1g2a3r4d5en"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE tracked_events
            ADD COLUMN IF NOT EXISTS referrer VARCHAR(500),
            ADD COLUMN IF NOT EXISTS viewport_width INTEGER,
            ADD COLUMN IF NOT EXISTS viewport_height INTEGER,
            ADD COLUMN IF NOT EXISTS device_type VARCHAR(32),
            ADD COLUMN IF NOT EXISTS browser_name VARCHAR(80),
            ADD COLUMN IF NOT EXISTS os_name VARCHAR(80),
            ADD COLUMN IF NOT EXISTS country VARCHAR(2),
            ADD COLUMN IF NOT EXISTS metadata_json JSONB
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_tracked_events_path_type_created_at "
        "ON tracked_events (path, type, created_at)"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_tracked_events_device_type_created_at "
        "ON tracked_events (device_type, created_at)"
    ))


def downgrade() -> None:
    op.drop_index("ix_tracked_events_device_type_created_at", table_name="tracked_events")
    op.drop_index("ix_tracked_events_path_type_created_at", table_name="tracked_events")
    op.execute(sa.text("""
        ALTER TABLE tracked_events
            DROP COLUMN IF EXISTS metadata_json,
            DROP COLUMN IF EXISTS country,
            DROP COLUMN IF EXISTS os_name,
            DROP COLUMN IF EXISTS browser_name,
            DROP COLUMN IF EXISTS device_type,
            DROP COLUMN IF EXISTS viewport_height,
            DROP COLUMN IF EXISTS viewport_width,
            DROP COLUMN IF EXISTS referrer
    """))
