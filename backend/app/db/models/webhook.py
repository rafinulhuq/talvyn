"""
SQLAlchemy ORM models for outbound webhooks.

WebhookSubscription — an admin-configured HTTP endpoint plus the event types
it wants delivered to it. The secret is generated once at creation, used to
HMAC-sign every delivery, and never re-displayed.

WebhookDelivery — one row per delivery attempt series for a given event,
giving admins a visible trail of what was sent and whether it succeeded.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models._types import GUID, JSONType


class WebhookSubscription(Base):
    __tablename__ = "webhook_subscriptions"

    id: Mapped[str] = mapped_column(
        GUID(), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    secret: Mapped[str] = mapped_column(String(64), nullable=False)
    # e.g. ["invitation.created", "attempt.started", "attempt.submitted", "evaluation.completed"]
    event_types: Mapped[list[Any]] = mapped_column(JSONType(), nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_by: Mapped[str | None] = mapped_column(
        GUID(), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<WebhookSubscription id={self.id!r} url={self.url!r}>"


class WebhookDelivery(Base):
    __tablename__ = "webhook_deliveries"
    __table_args__ = (
        Index("ix_webhook_deliveries_subscription_created", "subscription_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(
        GUID(), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    subscription_id: Mapped[str] = mapped_column(
        GUID(), ForeignKey("webhook_subscriptions.id", ondelete="CASCADE"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONType(), nullable=False)
    # PENDING | SUCCESS | FAILED
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
    response_status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    delivered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    def __repr__(self) -> str:
        return (
            f"<WebhookDelivery id={self.id!r} event_type={self.event_type!r} "
            f"status={self.status!r}>"
        )
