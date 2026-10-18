"""add_admin_score_to_question_feedback

Revision ID: f3a9c1d2e4b5
Revises: 2b330cc211ed
Create Date: 2026-06-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f3a9c1d2e4b5'
down_revision: Union[str, None] = '2b330cc211ed'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Use IF NOT EXISTS because the initial_schema migration runs create_all()
    # from current ORM models, which already includes this column.
    op.execute(sa.text(
        "ALTER TABLE question_feedback ADD COLUMN IF NOT EXISTS admin_awarded_score INTEGER"
    ))


def downgrade() -> None:
    op.drop_column('question_feedback', 'admin_awarded_score')
