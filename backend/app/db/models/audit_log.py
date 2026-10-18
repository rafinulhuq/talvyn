"""
SQLAlchemy ORM model for the admin audit log.

Append-only record of sensitive admin actions (invitation revoke/resend,
evaluation overrides, data reset/restore). actor_id is nullable because not
every caller has an authenticated admin identity to attach (e.g. background
jobs) — those actions are still logged, just with actor_id=None.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models._types import GUID, JSONType


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_created_at", "created_at"),
        Index("ix_audit_logs_target", "target_type", "target_id"),
    )

    id: Mapped[str] = mapped_column(
        GUID(), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    actor_id: Mapped[str | None] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # INVITATION_REVOKED | INVITATION_RESENT | EVALUATION_OVERRIDDEN |
    # QUESTION_SCORE_OVERRIDDEN | DATA_RESET | DATA_RESTORED
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    target_type: Mapped[str] = mapped_column(String(64), nullable=False)
    target_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    summary: Mapped[str | None] = mapped_column(String(500), nullable=True)
    details: Mapped[dict[str, Any] | None] = mapped_column(JSONType(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<AdminAuditLog id={self.id!r} action={self.action!r}>"
