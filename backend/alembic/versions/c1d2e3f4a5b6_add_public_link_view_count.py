"""add_public_link_view_count

Revision ID: c1d2e3f4a5b6
Revises: b4c6f0a1d8e2
Create Date: 2026-06-20 00:00:00.000000

Adds public_assessment_links.view_count — the top of the funnel
(views -> registrations -> starts -> completions -> pass rate) backing the
GET /api/v1/public-links/{id}/analytics endpoint.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, None] = 'b4c6f0a1d8e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text(
        "ALTER TABLE public_assessment_links ADD COLUMN IF NOT EXISTS "
        "view_count INTEGER NOT NULL DEFAULT 0"
    ))


def downgrade() -> None:
    op.drop_column('public_assessment_links', 'view_count')
