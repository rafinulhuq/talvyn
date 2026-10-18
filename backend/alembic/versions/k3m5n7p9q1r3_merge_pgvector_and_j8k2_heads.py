"""merge pgvector and highgarden/signup-merge heads

Revision ID: k3m5n7p9q1r3
Revises: db7cdbbfd2a8, j8k2m4n6p9q1
Create Date: 2026-08-12 00:00:00.000000

Pure merge point — no schema changes of its own. `db7cdbbfd2a8` (pgvector
embedding column, chained off `d9e8f7a6b5c4`) and `j8k2m4n6p9q1` (the
signup-fields/Highgarden merge point) diverged independently and were
never reconciled before both landed on main — `db7cdbbfd2a8` dates back to
2026-06-18 (commit 71a31b9, "fix fresh database alembic migrations") but
was apparently never actually applied against this server's live database,
which is why `alembic heads` only ever reported `j8k2m4n6p9q1` as current
until a fresh `alembic upgrade head` (e.g. for a new migration chaining
off the true single head) surfaced the split. Both sides' actual DDL are
idempotent (`IF NOT EXISTS` throughout `db7cdbbfd2a8`) and safe to apply
regardless of prior state — this migration only reconciles the two head
pointers into one, same pattern as
c7f1a3b5d9e2_add_knowledge_tables_merge_heads and
j8k2m4n6p9q1_merge_signup_and_highgarden_heads.
"""
from typing import Sequence, Union


revision: str = "k3m5n7p9q1r3"
down_revision: Union[str, Sequence[str], None] = ("db7cdbbfd2a8", "j8k2m4n6p9q1")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
