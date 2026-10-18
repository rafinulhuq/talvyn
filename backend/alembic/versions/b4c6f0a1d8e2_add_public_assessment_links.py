"""add_public_assessment_links

Revision ID: b4c6f0a1d8e2
Revises: a1b2c3d4e5f6
Create Date: 2026-06-19 00:00:00.000000

Adds support for shareable public assessment links:
  - public_assessment_links table — one shareable link per JD; candidates
    self-register through it instead of receiving a manual admin invite
  - invitations.public_link_id    — nullable FK, set when an invitation was
    minted by a public-link registration rather than a manual admin invite
  - candidates.linkedin_url / candidates.resume_url — optional fields
    collected on the public registration form
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b4c6f0a1d8e2'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE "PublicLinkStatus" AS ENUM ('ACTIVE', 'DISABLED', 'EXPIRED');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$
    """))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS public_assessment_links (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            jd_id VARCHAR(36) NOT NULL REFERENCES job_descriptions(id) ON DELETE CASCADE,
            public_slug VARCHAR(43) NOT NULL UNIQUE,
            title VARCHAR(255),
            status "PublicLinkStatus" NOT NULL DEFAULT 'ACTIVE',
            expires_at TIMESTAMP WITH TIME ZONE,
            max_registrations INTEGER,
            registration_count INTEGER NOT NULL DEFAULT 0,
            created_by VARCHAR(36) REFERENCES users(id),
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
    """))
    op.create_index(
        'ix_public_links_jd_id', 'public_assessment_links', ['jd_id'],
        unique=False, if_not_exists=True,
    )

    op.execute(sa.text(
        "ALTER TABLE invitations ADD COLUMN IF NOT EXISTS public_link_id VARCHAR(36) "
        "REFERENCES public_assessment_links(id) ON DELETE SET NULL"
    ))
    op.create_index(
        'ix_invitations_public_link_id', 'invitations', ['public_link_id'],
        unique=False, if_not_exists=True,
    )

    op.execute(sa.text("ALTER TABLE candidates ADD COLUMN IF NOT EXISTS linkedin_url VARCHAR(500)"))
    op.execute(sa.text("ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_url VARCHAR(500)"))


def downgrade() -> None:
    op.drop_column('candidates', 'resume_url')
    op.drop_column('candidates', 'linkedin_url')
    op.drop_index('ix_invitations_public_link_id', table_name='invitations')
    op.drop_column('invitations', 'public_link_id')
    op.drop_index('ix_public_links_jd_id', table_name='public_assessment_links')
    op.drop_table('public_assessment_links')
    op.execute('DROP TYPE IF EXISTS "PublicLinkStatus"')
