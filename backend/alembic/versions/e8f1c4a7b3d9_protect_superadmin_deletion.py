"""Extend the Super Admin lock to also block removal (deleted_at).

Revision ID: e8f1c4a7b3d9
Revises: d6a3f8b2c5e7

c4f9e2a7d1b8 locked this account's role; now that users.deleted_at exists
(d6a3f8b2c5e7) as the soft-delete flag behind the new "Remove account"
Super Admin feature, the same account must also be unremovable — the app
layer already blocks it (frontend/src/app/api/admin/users/[id]/route.ts via
isProtectedSuperAdminId), but the database trigger is the actual guarantee,
the same way it already is for role.
"""
from alembic import op
import sqlalchemy as sa

revision: str = "e8f1c4a7b3d9"
down_revision: str = "d6a3f8b2c5e7"
branch_labels = None
depends_on = None

PROTECTED_USER_ID = "ed5b90d3-bb0c-483f-b756-026f1e33dda9"


def upgrade() -> None:
    op.execute(sa.text(f"""
        CREATE OR REPLACE FUNCTION protect_superadmin_role() RETURNS TRIGGER AS $$
        BEGIN
            IF OLD.id = '{PROTECTED_USER_ID}' THEN
                IF NEW.role IS DISTINCT FROM 'SUPER_ADMIN'::"Role" THEN
                    RAISE EXCEPTION 'This account''s role is permanently locked to SUPER_ADMIN and cannot be changed.';
                END IF;
                IF NEW.deleted_at IS NOT NULL THEN
                    RAISE EXCEPTION 'This account is permanently protected and cannot be removed.';
                END IF;
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """))
    op.execute(sa.text("DROP TRIGGER IF EXISTS trg_protect_superadmin_role ON users"))
    op.execute(sa.text("""
        CREATE TRIGGER trg_protect_superadmin_role
        BEFORE UPDATE OF role, deleted_at ON users
        FOR EACH ROW
        EXECUTE FUNCTION protect_superadmin_role();
    """))


def downgrade() -> None:
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
