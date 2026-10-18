"""Service layer for CMP author profiles — reusable blog bylines."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.db.models.cms import CmsAuthorProfile, CmsMediaAsset
from app.db.models.user import User
from app.schemas.cms_blog import (
    AuthorProfileCreateRequest,
    AuthorProfileResponse,
    AuthorProfileUpdateRequest,
)
from app.services import audit_log_service


def _avatar_url(asset_id: str | None) -> str | None:
    return f"/api/cmp/media/{asset_id}" if asset_id else None


def _profile_response(profile: CmsAuthorProfile) -> AuthorProfileResponse:
    return AuthorProfileResponse(
        id=profile.id,
        name=profile.name,
        avatar_asset_id=profile.avatar_asset_id,
        avatar_url=_avatar_url(profile.avatar_asset_id),
        created_at=profile.created_at,
        updated_at=profile.updated_at,
    )


async def _validate_avatar_asset(asset_id: str, db: AsyncSession) -> None:
    result = await db.execute(
        select(CmsMediaAsset).where(
            CmsMediaAsset.id == asset_id, CmsMediaAsset.archived_at.is_(None)
        )
    )
    asset = result.scalar_one_or_none()
    if asset is None:
        raise NotFoundError("CmsMediaAsset", asset_id)
    if not asset.content_type.startswith("image/"):
        raise ValidationError("Author avatar must be an image asset.", "CMS_INVALID_AVATAR")


async def _get_profile_row(profile_id: str, db: AsyncSession) -> CmsAuthorProfile:
    result = await db.execute(select(CmsAuthorProfile).where(CmsAuthorProfile.id == profile_id))
    profile = result.scalar_one_or_none()
    if profile is None:
        raise NotFoundError("CmsAuthorProfile", profile_id)
    return profile


async def ensure_active(profile_id: str, db: AsyncSession) -> None:
    """Raise NotFoundError unless the profile exists and isn't archived —
    called by blog_service before attaching a profile to a post."""
    result = await db.execute(
        select(CmsAuthorProfile).where(
            CmsAuthorProfile.id == profile_id, CmsAuthorProfile.archived_at.is_(None)
        )
    )
    if result.scalar_one_or_none() is None:
        raise NotFoundError("CmsAuthorProfile", profile_id)


async def list_profiles(db: AsyncSession) -> list[AuthorProfileResponse]:
    result = await db.execute(
        select(CmsAuthorProfile)
        .where(CmsAuthorProfile.archived_at.is_(None))
        .order_by(CmsAuthorProfile.name)
    )
    return [_profile_response(profile) for profile in result.scalars().all()]


async def create_profile(
    req: AuthorProfileCreateRequest, actor: User, db: AsyncSession
) -> AuthorProfileResponse:
    if req.avatar_asset_id:
        await _validate_avatar_asset(req.avatar_asset_id, db)

    profile = CmsAuthorProfile(
        id=str(uuid.uuid4()),
        name=req.name.strip(),
        avatar_asset_id=req.avatar_asset_id,
    )
    db.add(profile)
    await audit_log_service.record(
        db,
        actor_id=actor.id,
        action="CMS_AUTHOR_CREATED",
        target_type="cms_author_profile",
        target_id=profile.id,
        summary=f"Created author profile '{profile.name}'",
    )
    await db.commit()
    await db.refresh(profile)
    return _profile_response(profile)


async def update_profile(
    profile_id: str, req: AuthorProfileUpdateRequest, actor: User, db: AsyncSession
) -> AuthorProfileResponse:
    profile = await _get_profile_row(profile_id, db)

    if req.name is not None:
        profile.name = req.name.strip()
    if req.clear_avatar:
        profile.avatar_asset_id = None
    elif req.avatar_asset_id is not None:
        await _validate_avatar_asset(req.avatar_asset_id, db)
        profile.avatar_asset_id = req.avatar_asset_id

    await audit_log_service.record(
        db,
        actor_id=actor.id,
        action="CMS_AUTHOR_UPDATED",
        target_type="cms_author_profile",
        target_id=profile.id,
        summary=f"Updated author profile '{profile.name}'",
    )
    await db.commit()
    await db.refresh(profile)
    return _profile_response(profile)


async def archive_profile(profile_id: str, actor: User, db: AsyncSession) -> None:
    profile = await _get_profile_row(profile_id, db)
    profile.archived_at = datetime.now(UTC)
    await audit_log_service.record(
        db,
        actor_id=actor.id,
        action="CMS_AUTHOR_ARCHIVED",
        target_type="cms_author_profile",
        target_id=profile.id,
        summary=f"Archived author profile '{profile.name}'",
    )
    await db.commit()


async def resolve_byline(
    author_profile_id: str | None, author_id: str | None, db: AsyncSession
) -> tuple[str | None, str | None]:
    """Returns (name, avatar_url) for a post's byline: the profile if set
    (even if since archived), else the creating account's name with no
    avatar. Used by blog_service for every response that shows a byline."""
    if author_profile_id:
        result = await db.execute(
            select(CmsAuthorProfile).where(CmsAuthorProfile.id == author_profile_id)
        )
        profile = result.scalar_one_or_none()
        if profile is not None:
            return profile.name, _avatar_url(profile.avatar_asset_id)
    if author_id is None:
        return None, None
    name_result = await db.execute(select(User.name).where(User.id == author_id))
    return name_result.scalar_one_or_none(), None
