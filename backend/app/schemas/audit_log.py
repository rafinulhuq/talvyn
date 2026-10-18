"""Schemas for the admin audit log endpoint."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AuditLogEntryResponse(BaseModel):
    id: str
    actor_id: str | None
    actor_name: str | None
    actor_email: str | None
    action: str
    target_type: str
    target_id: str | None
    summary: str | None
    details: dict[str, Any] | None
    created_at: datetime


class AuditLogListResponse(BaseModel):
    items: list[AuditLogEntryResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
