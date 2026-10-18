"""merge signup fields and highgarden heads

Revision ID: j8k2m4n6p9q1
Revises: a3f7c9e1b4d6, h6g7v2alerts
Create Date: 2026-08-11 00:00:00.000000

Pure merge point — no schema changes of its own. a3f7c9e1b4d6 (signup
fields on users) and the h1g2a3r4d5en..h6g7v2alerts Highgarden chain both
branched from e9b4c1d7a2f5 independently: this main branch added
a3f7c9e1b4d6 while the Highgarden feature was developed on a separate
branch and deployed directly against this same production database
(bypassing this repo's main-based deploy pipeline) before that branch was
ever merged back — leaving `alembic_version` on h6g7v2alerts and main's
`git reset --hard origin/main` deploy step unable to find that revision's
file. Both chains' actual schema changes (the signup columns and the
highgarden_* tables) are already applied to the live database from when
each was run — this migration only reconciles the two head pointers into
one, same pattern as c7f1a3b5d9e2_add_knowledge_tables_merge_heads.
"""
from typing import Sequence, Union


revision: str = "j8k2m4n6p9q1"
down_revision: Union[str, Sequence[str], None] = ("a3f7c9e1b4d6", "h6g7v2alerts")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
