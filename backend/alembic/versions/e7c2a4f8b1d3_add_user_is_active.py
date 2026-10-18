"""add_user_is_active

Revision ID: e7c2a4f8b1d3
Revises: c4a7e21f9b6d
Create Date: 2026-06-25 00:00:00.000000

Adds users.is_active, mirroring the frontend Prisma model (User.isActive).
Alembic is the schema source of truth (frontend `prisma migrate deploy` is
disabled at runtime, see frontend/scripts/start-dev.sh), so this column has
to be created here for the column Prisma's User model already expects.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e7c2a4f8b1d3'
down_revision: Union[str, None] = 'c4a7e21f9b6d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true"
    ))


def downgrade() -> None:
    op.drop_column('users', 'is_active')
