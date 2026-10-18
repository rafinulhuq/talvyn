"""Schemas for admin maintenance endpoints."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ResetDataRequest(BaseModel):
    confirm: str = Field(description="Must be exactly DELETE ALL.")


class ResetDataResponse(BaseModel):
    deleted_counts: dict[str, int]
    deleted_files: int
    message: str


class BackupFile(BaseModel):
    path: str
    content_type: str | None = None
    size_bytes: int
    content_base64: str


class BackupPayload(BaseModel):
    version: int = 1
    created_at: datetime
    tables: dict[str, list[dict[str, Any]]]
    files: list[BackupFile] = Field(default_factory=list)


class RestoreDataRequest(BaseModel):
    confirm: str = Field(description="Must be exactly RESTORE BACKUP.")
    backup: BackupPayload


class RestoreDataResponse(BaseModel):
    restored_counts: dict[str, int]
    restored_files: int
    message: str
