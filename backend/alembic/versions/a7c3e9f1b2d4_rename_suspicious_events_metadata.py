"""Rename suspicious_events.metadata to event_metadata.

Revision ID: a7c3e9f1b2d4
Revises: f5b2c8d1e4a9

The SuspiciousEvent model maps `event_metadata` to a column of the same
name, but older databases created the column as `metadata`. On those, every
integrity event write fails with "column event_metadata does not exist",
which also makes POST /attempts/{id}/terminate return 500, so an exam ended
for an integrity violation is never recorded server-side.

Databases created from current metadata already have `event_metadata`; the
DO block only renames when the old name exists and the new one doesn't.
"""
from alembic import op
import sqlalchemy as sa

revision: str = "a7c3e9f1b2d4"
down_revision: str = "f5b2c8d1e4a9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'suspicious_events' AND column_name = 'metadata'
            ) AND NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'suspicious_events' AND column_name = 'event_metadata'
            ) THEN
                ALTER TABLE suspicious_events RENAME COLUMN metadata TO event_metadata;
            END IF;
        END $$;
    """))


def downgrade() -> None:
    # Not reversed: the ORM only knows event_metadata.
    pass
