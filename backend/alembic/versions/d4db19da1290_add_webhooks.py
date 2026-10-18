"""add_webhooks

Revision ID: d4db19da1290
Revises: 19cf82113cbb
Create Date: 2026-06-20 00:00:00.000000

Adds outbound webhooks:
  - webhook_subscriptions — admin-configured endpoint + HMAC secret + event types
  - webhook_deliveries     — per-attempt delivery log (status/response/retry count)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4db19da1290'
down_revision: Union[str, None] = '19cf82113cbb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS webhook_subscriptions (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            url VARCHAR(2048) NOT NULL,
            secret VARCHAR(64) NOT NULL,
            event_types JSONB NOT NULL DEFAULT '[]',
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_by VARCHAR(36) REFERENCES users(id),
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
    """))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS webhook_deliveries (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            subscription_id VARCHAR(36) NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
            event_type VARCHAR(64) NOT NULL,
            payload JSONB NOT NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
            response_status_code INTEGER,
            attempt_count INTEGER NOT NULL DEFAULT 0,
            error_message VARCHAR(500),
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            delivered_at TIMESTAMP WITH TIME ZONE
        )
    """))
    op.create_index(
        'ix_webhook_deliveries_subscription_created', 'webhook_deliveries',
        ['subscription_id', 'created_at'], unique=False, if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index('ix_webhook_deliveries_subscription_created', table_name='webhook_deliveries')
    op.drop_table('webhook_deliveries')
    op.drop_table('webhook_subscriptions')
