"""Schemas for the admin Trash (soft-delete / recycle-bin) API."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

TrashEntityType = Literal["jd", "test", "candidate", "blog"]


class TrashItem(BaseModel):
    entity_type: TrashEntityType
    id: str
    label: str
    sublabel: str | None = None
    deleted_at: datetime


class TrashListResponse(BaseModel):
    items: list[TrashItem]
    total: int
