"""add JD generation support: source, generation_input_json, nullable file cols

Revision ID: j9d8g7n6r5t4
Revises: n5p7r9t1v3x5
Create Date: 2026-08-19 00:00:00.000000

Supports generating a JobDescription in-app from a brief (self-hosted AI)
instead of only uploading one. See
docs/superpowers/specs/2026-08-19-jd-generation-design.md.

  - source (VARCHAR, default 'UPLOADED'): discriminates uploaded vs generated
    JDs. VARCHAR (not a PG enum) so future values never need a type migration,
    matching generation_status.
  - generation_input_json (JSONB, nullable): the brief the operator submitted
    (title, seniority, skills, tone, …) — enables "regenerate" + provenance.
  - file_path / file_type -> nullable: a generated JD has no underlying file.
    (original_filename stays NOT NULL — it carries the job title for display.)

No enum-type change is needed for the new GenerationStatus.DRAFTING value:
generation_status is already stored as VARCHAR (native_enum=False).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "j9d8g7n6r5t4"
down_revision: Union[str, None] = "n5p7r9t1v3x5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text(
        "ALTER TABLE job_descriptions "
        "ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'UPLOADED'"
    ))
    op.execute(sa.text(
        "ALTER TABLE job_descriptions "
        "ADD COLUMN IF NOT EXISTS generation_input_json JSONB"
    ))
    op.execute(sa.text(
        "ALTER TABLE job_descriptions ALTER COLUMN file_path DROP NOT NULL"
    ))
    op.execute(sa.text(
        "ALTER TABLE job_descriptions ALTER COLUMN file_type DROP NOT NULL"
    ))


def downgrade() -> None:
    op.execute(sa.text(
        "ALTER TABLE job_descriptions DROP COLUMN IF EXISTS generation_input_json"
    ))
    op.execute(sa.text(
        "ALTER TABLE job_descriptions DROP COLUMN IF EXISTS source"
    ))
    # file_path / file_type are intentionally left nullable on downgrade:
    # generated rows may hold NULLs, so re-adding NOT NULL could fail. Re-tighten
    # manually only after confirming no NULLs remain.
