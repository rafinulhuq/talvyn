"""add_highgarden_tracking

Revision ID: h1g2a3r4d5en
Revises: e9b4c1d7a2f5
Create Date: 2026-08-06 00:00:00.000000

Adds the Next.js-owned Highgarden analytics tables. Alembic remains the
database schema authority; the Prisma schema mirrors these tables for the
frontend read/write client.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "h1g2a3r4d5en"
down_revision: Union[str, None] = "e9b4c1d7a2f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TrackedEventType') THEN
                CREATE TYPE "TrackedEventType" AS ENUM ('PAGE_VIEW', 'CLICK');
            END IF;
        END
        $$;
    """))
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS visitor_sessions (
            id VARCHAR(100) PRIMARY KEY,
            first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            user_agent VARCHAR(500)
        )
    """))
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS tracked_events (
            id VARCHAR(32) PRIMARY KEY,
            session_id VARCHAR(100) NOT NULL
                REFERENCES visitor_sessions(id) ON DELETE CASCADE,
            type "TrackedEventType" NOT NULL,
            path VARCHAR(500) NOT NULL,
            target_label VARCHAR(200),
            target_selector VARCHAR(200),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_tracked_events_path_created_at "
        "ON tracked_events (path, created_at)"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_tracked_events_session_id_created_at "
        "ON tracked_events (session_id, created_at)"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_tracked_events_type_created_at "
        "ON tracked_events (type, created_at)"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_visitor_sessions_last_seen_at "
        "ON visitor_sessions (last_seen_at)"
    ))


def downgrade() -> None:
    op.drop_index("ix_visitor_sessions_last_seen_at", table_name="visitor_sessions")
    op.drop_index("ix_tracked_events_type_created_at", table_name="tracked_events")
    op.drop_index("ix_tracked_events_session_id_created_at", table_name="tracked_events")
    op.drop_index("ix_tracked_events_path_created_at", table_name="tracked_events")
    op.drop_table("tracked_events")
    op.drop_table("visitor_sessions")
    op.execute("DROP TYPE IF EXISTS \"TrackedEventType\"")
