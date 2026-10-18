"""Service layer for the superadmin CMP."""

from __future__ import annotations

import html
import re
import uuid
from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cms.defaults import DOCUMENT_KEYS, PUBLIC_DOCUMENT_KEYS, default_for_key
from app.core.exceptions import InvalidFileTypeError, NotFoundError, ValidationError
from app.db.models.cms import CmsContentDocument, CmsContentVersion, CmsMediaAsset
from app.db.models.user import User
from app.schemas.cms import (
    CmsContentVersionResponse,
    CmsDocumentResponse,
    CmsMediaAssetResponse,
    CmsPublicContentResponse,
    CmsVersionMetaResponse,
)
from app.services import audit_log_service
from app.services.file_service import file_service

_ALLOWED_ICON_KEYS = {
    "arrow-right",
    "bar-chart",
    "brain",
    "check-circle",
    "clock",
    "code",
    "file-text",
    "layers",
    "shield",
    "sparkles",
    "target",
    "trending-up",
    "trophy",
    "users",
    "zap",
}
_LINK_KEY_RE = re.compile(r"(^|_)(href|url|link|src)$", re.IGNORECASE)
_ALLOWED_MEDIA_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "application/pdf": ".pdf",
}
_MAX_MEDIA_BYTES = 8 * 1024 * 1024


def _media_url(asset_id: str) -> str:
    return f"/api/cmp/media/{asset_id}"


def _doc_response(doc: CmsContentDocument, latest_version: int = 0) -> CmsDocumentResponse:
    return CmsDocumentResponse(
        id=doc.id,
        key=doc.key,
        draft_json=doc.draft_json,
        published_json=doc.published_json,
        updated_by=doc.updated_by,
        published_by=doc.published_by,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        published_at=doc.published_at,
        latest_version=latest_version,
        has_unpublished_changes=doc.published_json != doc.draft_json,
    )


def _version_response(version: CmsContentVersion) -> CmsContentVersionResponse:
    return CmsContentVersionResponse(
        id=version.id,
        document_id=version.document_id,
        document_key=version.document_key,
        version=version.version,
        content_json=version.content_json,
        created_by=version.created_by,
        created_at=version.created_at,
    )


def _media_response(asset: CmsMediaAsset) -> CmsMediaAssetResponse:
    return CmsMediaAssetResponse(
        id=asset.id,
        storage_key=asset.storage_key,
        filename=asset.filename,
        content_type=asset.content_type,
        size_bytes=asset.size_bytes,
        title=asset.title,
        alt_text=asset.alt_text,
        url=_media_url(asset.id),
        created_by=asset.created_by,
        created_at=asset.created_at,
        updated_at=asset.updated_at,
        archived_at=asset.archived_at,
    )


def _ensure_key(key: str) -> None:
    if key not in DOCUMENT_KEYS:
        raise NotFoundError("CmsContentDocument", key)


def _deep_merge(base: dict[str, Any], override: dict[str, Any] | None) -> dict[str, Any]:
    merged = deepcopy(base)
    if not isinstance(override, dict):
        return merged

    def walk(target: dict[str, Any], source: dict[str, Any]) -> None:
        for key, value in source.items():
            if isinstance(target.get(key), dict) and isinstance(value, dict):
                walk(target[key], value)
            else:
                target[key] = deepcopy(value)

    walk(merged, override)
    return merged


def _safe_link(value: str) -> bool:
    return value.startswith(("/", "#", "https://", "http://", "mailto:"))


def validate_content_json(content: dict[str, Any]) -> None:
    if not isinstance(content, dict) or not content:
        raise ValidationError("CMP content must be a non-empty JSON object.", "CMS_INVALID_CONTENT")

    def walk(value: Any, path: str) -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                if not isinstance(key, str) or key.startswith("__"):
                    raise ValidationError(f"Invalid CMP key at {path}.", "CMS_INVALID_KEY")
                if key == "icon" and isinstance(child, str) and child not in _ALLOWED_ICON_KEYS:
                    raise ValidationError(f"Unsupported icon key '{child}'.", "CMS_INVALID_ICON")
                if _LINK_KEY_RE.search(key) and isinstance(child, str) and child and not _safe_link(child):
                    raise ValidationError(f"Unsafe link at {path}.{key}.", "CMS_UNSAFE_LINK")
                walk(child, f"{path}.{key}")
            return
        if isinstance(value, list):
            for i, child in enumerate(value):
                walk(child, f"{path}[{i}]")
            return
        if isinstance(value, str) and "<script" in value.lower():
            raise ValidationError(f"Unsafe script tag at {path}.", "CMS_UNSAFE_TEXT")

    walk(content, "$")


async def ensure_document(key: str, db: AsyncSession) -> CmsContentDocument:
    _ensure_key(key)
    result = await db.execute(select(CmsContentDocument).where(CmsContentDocument.key == key))
    doc = result.scalar_one_or_none()
    if doc is not None:
        return doc

    doc = CmsContentDocument(key=key, draft_json=default_for_key(key), published_json=None)
    db.add(doc)
    await db.flush()
    return doc


async def latest_version_number(document_id: str, db: AsyncSession) -> int:
    result = await db.execute(
        select(func.coalesce(func.max(CmsContentVersion.version), 0)).where(
            CmsContentVersion.document_id == document_id
        )
    )
    return int(result.scalar_one() or 0)


async def list_documents(db: AsyncSession) -> list[CmsDocumentResponse]:
    docs = []
    for key in DOCUMENT_KEYS:
        doc = await ensure_document(key, db)
        docs.append(_doc_response(doc, await latest_version_number(doc.id, db)))
    await db.commit()
    return docs


async def get_document(key: str, db: AsyncSession) -> CmsDocumentResponse:
    doc = await ensure_document(key, db)
    latest = await latest_version_number(doc.id, db)
    await db.commit()
    return _doc_response(doc, latest)


async def update_document(key: str, content: dict[str, Any], actor: User, db: AsyncSession) -> CmsDocumentResponse:
    validate_content_json(content)
    doc = await ensure_document(key, db)
    doc.draft_json = content
    doc.updated_by = actor.id

    await audit_log_service.record(
        db,
        actor_id=actor.id,
        action="CMS_DRAFT_UPDATED",
        target_type="cms_document",
        target_id=doc.id,
        summary=f"Updated CMP draft '{key}'",
    )
    await db.commit()
    await db.refresh(doc)
    return _doc_response(doc, await latest_version_number(doc.id, db))


async def publish_document(key: str, actor: User, db: AsyncSession) -> tuple[CmsDocumentResponse, CmsContentVersionResponse]:
    doc = await ensure_document(key, db)
    validate_content_json(doc.draft_json)
    latest = await latest_version_number(doc.id, db)

    if latest > 0 and doc.published_json == doc.draft_json:
        # Nothing changed since the last publish — don't mint a duplicate version.
        result = await db.execute(
            select(CmsContentVersion).where(
                CmsContentVersion.document_id == doc.id,
                CmsContentVersion.version == latest,
            )
        )
        existing = result.scalar_one()
        await db.commit()
        return _doc_response(doc, latest), _version_response(existing)

    next_version = latest + 1
    now = datetime.now(UTC)

    version = CmsContentVersion(
        document_id=doc.id,
        document_key=key,
        version=next_version,
        content_json=doc.draft_json,
        created_by=actor.id,
    )
    db.add(version)
    doc.published_json = doc.draft_json
    doc.published_by = actor.id
    doc.published_at = now

    await audit_log_service.record(
        db,
        actor_id=actor.id,
        action="CMS_PUBLISHED",
        target_type="cms_document",
        target_id=doc.id,
        summary=f"Published CMP document '{key}' as version {next_version}",
        details={"document_key": key, "version": next_version},
    )
    await db.commit()
    await db.refresh(doc)
    await db.refresh(version)
    return _doc_response(doc, next_version), _version_response(version)


async def list_versions(
    key: str, db: AsyncSession, *, limit: int = 5, offset: int = 0
) -> tuple[list[CmsVersionMetaResponse], int]:
    doc = await ensure_document(key, db)
    latest = await latest_version_number(doc.id, db)
    total_result = await db.execute(
        select(func.count(CmsContentVersion.id)).where(
            CmsContentVersion.document_id == doc.id
        )
    )
    total = int(total_result.scalar_one() or 0)

    result = await db.execute(
        select(CmsContentVersion, User.name)
        .outerjoin(User, CmsContentVersion.created_by == User.id)
        .where(CmsContentVersion.document_id == doc.id)
        .order_by(desc(CmsContentVersion.version))
        .limit(limit)
        .offset(offset)
    )
    items = [
        CmsVersionMetaResponse(
            id=version.id,
            document_id=version.document_id,
            document_key=version.document_key,
            version=version.version,
            created_by=version.created_by,
            created_by_name=creator_name,
            created_at=version.created_at,
            is_current=version.version == latest,
        )
        for version, creator_name in result.all()
    ]
    return items, total


async def get_version(key: str, version_number: int, db: AsyncSession) -> CmsContentVersionResponse:
    doc = await ensure_document(key, db)
    result = await db.execute(
        select(CmsContentVersion).where(
            CmsContentVersion.document_id == doc.id,
            CmsContentVersion.version == version_number,
        )
    )
    version = result.scalar_one_or_none()
    if version is None:
        raise NotFoundError("CmsContentVersion", f"{key}:{version_number}")
    return _version_response(version)


async def restore_version(key: str, version_number: int, actor: User, db: AsyncSession) -> CmsDocumentResponse:
    doc = await ensure_document(key, db)
    result = await db.execute(
        select(CmsContentVersion).where(
            CmsContentVersion.document_id == doc.id,
            CmsContentVersion.version == version_number,
        )
    )
    version = result.scalar_one_or_none()
    if version is None:
        raise NotFoundError("CmsContentVersion", f"{key}:{version_number}")

    doc.draft_json = version.content_json
    doc.updated_by = actor.id
    await audit_log_service.record(
        db,
        actor_id=actor.id,
        action="CMS_VERSION_RESTORED",
        target_type="cms_document",
        target_id=doc.id,
        summary=f"Restored CMP document '{key}' version {version_number} to draft",
        details={"document_key": key, "version": version_number},
    )
    await db.commit()
    await db.refresh(doc)
    return _doc_response(doc, await latest_version_number(doc.id, db))


async def get_public_content(db: AsyncSession) -> CmsPublicContentResponse:
    payload: dict[str, dict[str, Any]] = {}
    for key in PUBLIC_DOCUMENT_KEYS:
        doc = await ensure_document(key, db)
        payload[key] = _deep_merge(default_for_key(key), doc.published_json)
    await db.commit()
    return CmsPublicContentResponse(**payload)


async def get_published_document(db: AsyncSession, key: str) -> dict[str, Any]:
    doc = await ensure_document(key, db)
    await db.commit()
    return _deep_merge(default_for_key(key), doc.published_json)


def render_template(template: str, variables: dict[str, str]) -> str:
    rendered = template
    for key, value in variables.items():
        rendered = rendered.replace("{" + key + "}", value)
    return rendered


def render_html_template(template: str, variables: dict[str, str]) -> str:
    escaped = {key: html.escape(value) for key, value in variables.items()}
    return render_template(html.escape(template), escaped)


async def create_media_asset(
    *,
    filename: str,
    content_type: str,
    content: bytes,
    title: str | None,
    alt_text: str | None,
    actor: User,
    db: AsyncSession,
) -> CmsMediaAssetResponse:
    if content_type not in _ALLOWED_MEDIA_TYPES:
        raise InvalidFileTypeError(sorted(_ALLOWED_MEDIA_TYPES))
    if not content:
        raise ValidationError("Uploaded media file is empty.", "CMS_EMPTY_MEDIA")
    if len(content) > _MAX_MEDIA_BYTES:
        raise ValidationError("CMP media files must be 8MB or smaller.", "CMS_MEDIA_TOO_LARGE")

    original_ext = Path(filename).suffix.lower()
    safe_ext = _ALLOWED_MEDIA_TYPES[content_type]
    if original_ext and original_ext != safe_ext and not (content_type == "image/jpeg" and original_ext == ".jpeg"):
        raise InvalidFileTypeError(sorted(set(_ALLOWED_MEDIA_TYPES.values()) | {".jpeg"}))

    asset_id = str(uuid.uuid4())
    storage_key = f"cms/{asset_id}{safe_ext}"
    await file_service.write_file(storage_key, content, content_type)

    asset = CmsMediaAsset(
        id=asset_id,
        storage_key=storage_key,
        filename=filename[:255],
        content_type=content_type,
        size_bytes=len(content),
        title=title,
        alt_text=alt_text,
        created_by=actor.id,
    )
    db.add(asset)
    await audit_log_service.record(
        db,
        actor_id=actor.id,
        action="CMS_MEDIA_UPLOADED",
        target_type="cms_media_asset",
        target_id=asset.id,
        summary=f"Uploaded CMP media '{filename}'",
        details={"content_type": content_type, "size_bytes": len(content)},
    )
    await db.commit()
    await db.refresh(asset)
    return _media_response(asset)


async def get_media_asset(asset_id: str, db: AsyncSession, include_archived: bool = False) -> CmsMediaAsset:
    stmt = select(CmsMediaAsset).where(CmsMediaAsset.id == asset_id)
    if not include_archived:
        stmt = stmt.where(CmsMediaAsset.archived_at.is_(None))
    result = await db.execute(stmt)
    asset = result.scalar_one_or_none()
    if asset is None:
        raise NotFoundError("CmsMediaAsset", asset_id)
    return asset


