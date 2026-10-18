"""add_signup_fields_to_users

Revision ID: a3f7c9e1b4d6
Revises: c7f1a3b5d9e2
Create Date: 2026-08-04 00:00:00.000000

Adds users.company_name, signup_status, username, role_in_company,
company_website, phone_number — mirroring the frontend Prisma model
(schema.prisma User: companyName/signupStatus/username/roleInCompany/
companyWebsite/phoneNumber), which already declared these fields without a
matching migration ever landing (the introducing commit's message notes
"migration pending — DB unreachable"). Alembic is the schema source of
truth (frontend `prisma migrate deploy` is disabled at runtime, see
frontend/scripts/start-dev.sh), so — same as e7c2a4f8b1d3_add_user_is_active
— these columns have to be created here for the columns Prisma's User model
already expects. Their absence crash-loops the frontend container: Prisma's
generated client queries `users.company_name` unconditionally in the seed
script, and any request touching a User record fails the same way.

signup_status uses a native Postgres enum type ("SignupStatus") rather than
TEXT because Prisma emits `::"SignupStatus"` casts for enum-typed fields in
its generated SQL — a plain TEXT column would make every query referencing
this field fail with "type SignupStatus does not exist".
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a3f7c9e1b4d6'
down_revision: Union[str, None] = 'c7f1a3b5d9e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE "SignupStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """))
    op.execute(sa.text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name TEXT"
    ))
    op.execute(sa.text(
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_status "SignupStatus" '
        "NOT NULL DEFAULT 'APPROVED'"
    ))
    op.execute(sa.text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT"
    ))
    op.execute(sa.text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS role_in_company TEXT"
    ))
    op.execute(sa.text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS company_website TEXT"
    ))
    op.execute(sa.text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number TEXT"
    ))
    # Matches Prisma's default unique-index naming convention (<table>_<column>_key)
    # so Prisma's P2002 error-target mapping for `username` resolves correctly.
    op.execute(sa.text(
        "CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users (username)"
    ))


def downgrade() -> None:
    op.drop_index('users_username_key', table_name='users')
    op.drop_column('users', 'phone_number')
    op.drop_column('users', 'company_website')
    op.drop_column('users', 'role_in_company')
    op.drop_column('users', 'username')
    op.drop_column('users', 'signup_status')
    op.drop_column('users', 'company_name')
    op.execute(sa.text('DROP TYPE IF EXISTS "SignupStatus"'))
