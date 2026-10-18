"""Lock the acmeai@talvyn.com Super Admin account's role.

Revision ID: c4f9e2a7d1b8
Revises: b7e2a9c4d6f1

acmeai@talvyn.com (id ed5b90d3-bb0c-483f-b756-026f1e33dda9) is the
platform's primary Super Admin account. Its role was accidentally changed
to USER via the admin UI on 2026-09-07 and had to be restored by hand.

The application-level guard in
frontend/src/app/api/admin/users/[id]/role/route.ts blocks role changes to
this account through the normal UI/API path with a clear error message,
but this trigger is the actual guarantee: it rejects any UPDATE that would
change this one row's `role` away from SUPER_ADMIN, no matter which code
path (or a raw SQL session) attempts it.
"""
from alembic import op
import sqlalchemy as sa

revision: str = "c4f9e2a7d1b8"
down_revision: str = "b7e2a9c4d6f1"
branch_labels = None
depends_on = None

PROTECTED_USER_ID = "ed5b90d3-bb0c-483f-b756-026f1e33dda9"


def upgrade() -> None:
    op.execute(sa.text(f"""
        CREATE OR REPLACE FUNCTION protect_superadmin_role() RETURNS TRIGGER AS $$
        BEGIN
            IF OLD.id = '{PROTECTED_USER_ID}' AND NEW.role IS DISTINCT FROM 'SUPER_ADMIN'::"Role" THEN
                RAISE EXCEPTION 'This account''s role is permanently locked to SUPER_ADMIN and cannot be changed.';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """))
    op.execute(sa.text("DROP TRIGGER IF EXISTS trg_protect_superadmin_role ON users"))
    op.execute(sa.text("""
        CREATE TRIGGER trg_protect_superadmin_role
        BEFORE UPDATE OF role ON users
        FOR EACH ROW
        EXECUTE FUNCTION protect_superadmin_role();
    """))


def downgrade() -> None:
    op.execute(sa.text("DROP TRIGGER IF EXISTS trg_protect_superadmin_role ON users"))
    op.execute(sa.text("DROP FUNCTION IF EXISTS protect_superadmin_role()"))
