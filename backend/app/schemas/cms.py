"""Pydantic schemas for the superadmin CMP."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.cms.defaults import DOCUMENT_KEYS

CmsDocumentKey = Literal["site", "home", "candidate_experience", "invitation_email"]


def validate_document_key(key: str) -> str:
    if key not in DOCUMENT_KEYS:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("CmsContentDocument", key)
    return key


class CmsDocumentUpdateRequest(BaseModel):
    draft_json: dict[str, Any] = Field(description="Structured CMP document JSON.")


class CmsPublishResponse(BaseModel):
    document: "CmsDocumentResponse"
    version: "CmsContentVersionResponse"


class CmsRestoreVersionRequest(BaseModel):
    version: int = Field(ge=1)


class CmsDocumentResponse(BaseModel):
    id: str
    key: str
    draft_json: dict[str, Any]
    published_json: dict[str, Any] | None
    updated_by: str | None
    published_by: str | None
    created_at: datetime
    updated_at: datetime
    published_at: datetime | None
    latest_version: int
    has_unpublished_changes: bool


class CmsContentVersionResponse(BaseModel):
    id: str
    document_id: str
    document_key: str
    version: int
    content_json: dict[str, Any]
    created_by: str | None
    created_at: datetime


class CmsVersionMetaResponse(BaseModel):
    """Version list entry — metadata only, content is fetched on demand."""

    id: str
    document_id: str
    document_key: str
    version: int
    created_by: str | None
    created_by_name: str | None
    created_at: datetime
    is_current: bool


class CmsDocumentListResponse(BaseModel):
    items: list[CmsDocumentResponse]


class CmsVersionListResponse(BaseModel):
    items: list[CmsVersionMetaResponse]
    total: int


class CmsPublicContentResponse(BaseModel):
    site: dict[str, Any]
    home: dict[str, Any]
    candidate_experience: dict[str, Any]


class CmsMediaAssetResponse(BaseModel):
    id: str
    storage_key: str
    filename: str
    content_type: str
    size_bytes: int
    title: str | None
    alt_text: str | None
    url: str
    created_by: str | None
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


CmsPublishResponse.model_rebuild()
