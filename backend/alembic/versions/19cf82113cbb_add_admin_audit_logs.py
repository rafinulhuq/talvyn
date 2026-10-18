"""add_admin_audit_logs

Revision ID: 19cf82113cbb
Revises: d2e3f4a5b6c7
Create Date: 2026-06-20 00:00:00.000000

Adds admin_audit_logs — an append-only trail of sensitive admin actions
(invitation revoke/resend, evaluation overrides, data reset/restore).
Deliberately excluded from the admin backup/restore/reset table lists in
admin_service.py so the trail (including the reset/restore actions
themselves) survives a data reset or restore, the same way admin users do.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '19cf82113cbb'
down_revision: Union[str, None] = 'd2e3f4a5b6c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS admin_audit_logs (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            actor_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
            action VARCHAR(64) NOT NULL,
            target_type VARCHAR(64) NOT NULL,
            target_id VARCHAR(36),
            summary VARCHAR(500),
            details JSONB,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
    """))
    op.create_index(
        'ix_audit_logs_created_at', 'admin_audit_logs', ['created_at'],
        unique=False, if_not_exists=True,
    )
    op.create_index(
        'ix_audit_logs_target', 'admin_audit_logs', ['target_type', 'target_id'],
        unique=False, if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index('ix_audit_logs_target', table_name='admin_audit_logs')
    op.drop_index('ix_audit_logs_created_at', table_name='admin_audit_logs')
    op.drop_table('admin_audit_logs')
