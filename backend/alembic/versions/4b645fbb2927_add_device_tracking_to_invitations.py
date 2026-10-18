"""add_device_tracking_to_invitations

Revision ID: a1b2c3d4e5f6
Revises: e7c2a4f8b1d3
Create Date: 2026-06-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '4b645fbb2927'
down_revision: Union[str, None] = 'e7c2a4f8b1d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Use IF NOT EXISTS because the initial_schema migration runs create_all()
    # from current ORM models, which already includes these columns.
    op.execute(sa.text(
        "ALTER TABLE invitations ADD COLUMN IF NOT EXISTS device_fingerprint VARCHAR(64)"
    ))
    op.execute(sa.text(
        "ALTER TABLE invitations ADD COLUMN IF NOT EXISTS device_cookie_id VARCHAR(64)"
    ))
    op.execute(sa.text(
        "ALTER TABLE invitations ADD COLUMN IF NOT EXISTS registration_ip VARCHAR(45)"
    ))
    op.execute(sa.text(
        "ALTER TABLE invitations ADD COLUMN IF NOT EXISTS flagged_duplicate_device "
        "BOOLEAN NOT NULL DEFAULT false"
    ))
    op.execute(sa.text(
        "ALTER TABLE invitations ADD COLUMN IF NOT EXISTS flagged_duplicate_reason VARCHAR(255)"
    ))


def downgrade() -> None:
    op.drop_column('invitations', 'flagged_duplicate_reason')
    op.drop_column('invitations', 'flagged_duplicate_device')
    op.drop_column('invitations', 'registration_ip')
    op.drop_column('invitations', 'device_cookie_id')
    op.drop_column('invitations', 'device_fingerprint')
