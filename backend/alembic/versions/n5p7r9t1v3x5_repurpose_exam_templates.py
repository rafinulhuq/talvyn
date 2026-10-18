"""repurpose exam_templates into a reusable cross-JD library

Revision ID: n5p7r9t1v3x5
Revises: k3m5n7p9q1r3
Create Date: 2026-08-12 00:00:00.000000

`exam_templates` (the ExamTemplate model) has existed since the
question-bank/Master-Prompt-2 redesign but was never actually wired up to
any route or UI (confirmed dead — zero rows, zero non-schema references
in the codebase). Its original shape scoped it to one JD (jd_id NOT NULL),
which doesn't fit "Templates" as a reusable library applied across
different JDs. Since the table is genuinely unused, this migration
repurposes it in place rather than creating a parallel table:

  - drops jd_id (+ its FK + index) and question_bank_id (+ FK) — neither
    makes sense for a template that isn't tied to any specific JD/bank
  - adds description (nullable) and created_by (FK to users, NOT NULL —
    safe with zero existing rows) so templates are owned the same way
    JobDescription.uploaded_by already scopes JD ownership
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "n5p7r9t1v3x5"
down_revision: Union[str, None] = "k3m5n7p9q1r3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_exam_templates_jd_id"))
    op.execute(sa.text(
        "ALTER TABLE exam_templates DROP COLUMN IF EXISTS jd_id"
    ))
    op.execute(sa.text(
        "ALTER TABLE exam_templates DROP COLUMN IF EXISTS question_bank_id"
    ))
    op.execute(sa.text(
        "ALTER TABLE exam_templates ADD COLUMN IF NOT EXISTS description TEXT"
    ))
    op.execute(sa.text(
        "ALTER TABLE exam_templates ADD COLUMN IF NOT EXISTS created_by VARCHAR"
    ))
    # NOT NULL added separately: the table is confirmed empty in production,
    # but a plain ADD COLUMN ... NOT NULL fails outright on any existing rows
    # (no default to backfill with) — this two-step form fails loudly instead
    # if that assumption is ever wrong, rather than silently corrupting data.
    op.execute(sa.text(
        "ALTER TABLE exam_templates ALTER COLUMN created_by SET NOT NULL"
    ))
    # Guarded: on a fresh database, `initial_schema` already builds
    # exam_templates from the current (already-repurposed) ORM model,
    # which declares this same FK via a plain `ForeignKey(...)` column arg
    # — Postgres auto-names that constraint differently, so an unconditional
    # ADD CONSTRAINT here wouldn't error, but it would leave a redundant
    # second FK enforcing the same rule, diverging from production's schema.
    op.execute(sa.text("""
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conrelid = 'exam_templates'::regclass
                AND confrelid = 'users'::regclass
                AND conkey = ARRAY[(
                    SELECT attnum FROM pg_attribute
                    WHERE attrelid = 'exam_templates'::regclass AND attname = 'created_by'
                )]
            ) THEN
                ALTER TABLE exam_templates
                ADD CONSTRAINT fk_exam_templates_created_by
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;
            END IF;
        END $$
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_exam_templates_created_by "
        "ON exam_templates (created_by)"
    ))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_exam_templates_created_by"))
    op.execute(sa.text(
        "ALTER TABLE exam_templates DROP CONSTRAINT IF EXISTS fk_exam_templates_created_by"
    ))
    op.execute(sa.text(
        "ALTER TABLE exam_templates DROP COLUMN IF EXISTS created_by"
    ))
    op.execute(sa.text(
        "ALTER TABLE exam_templates DROP COLUMN IF EXISTS description"
    ))
    op.execute(sa.text(
        "ALTER TABLE exam_templates ADD COLUMN IF NOT EXISTS question_bank_id VARCHAR"
    ))
    op.execute(sa.text(
        "ALTER TABLE exam_templates ADD COLUMN IF NOT EXISTS jd_id VARCHAR"
    ))
