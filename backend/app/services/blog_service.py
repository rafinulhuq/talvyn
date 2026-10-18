"""Service layer for the CMP blog."""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime

from sqlalchemy import desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.db.models.cms import CmsBlogPost, CmsMediaAsset
from app.db.models.user import User
from app.schemas.cms_blog import (
    BlogPostCreateRequest,
    BlogPostResponse,
    BlogPostSummaryResponse,
    BlogPostUpdateRequest,
    PublicBlogPostResponse,
    PublicBlogPostSummary,
)
from app.services import audit_log_service, author_profile_service

_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_MAX_SLUG_LENGTH = 220


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:_MAX_SLUG_LENGTH].rstrip("-")


def _cover_url(asset_id: str | None) -> str | None:
    return f"/api/cmp/media/{asset_id}" if asset_id else None


_READING_WORDS_PER_MINUTE = 220


def reading_minutes(content_md: str) -> int:
    return max(1, round(len(content_md.split()) / _READING_WORDS_PER_MINUTE))


def _post_response(
    post: CmsBlogPost, author_name: str | None, author_avatar_url: str | None
) -> BlogPostResponse:
    return BlogPostResponse(
        id=post.id,
        slug=post.slug,
        title=post.title,
        excerpt=post.excerpt,
        content_md=post.content_md,
        cover_image_asset_id=post.cover_image_asset_id,
        cover_image_url=_cover_url(post.cover_image_asset_id),
        tags=list(post.tags or []),
        status=post.status,
        author_id=post.author_id,
        author_profile_id=post.author_profile_id,
        author_name=author_name,
        author_avatar_url=author_avatar_url,
        seo_title=post.seo_title,
        seo_description=post.seo_description,
        created_at=post.created_at,
        updated_at=post.updated_at,
        published_at=post.published_at,
        archived_at=post.archived_at,
    )


def _summary_response(
    post: CmsBlogPost, author_name: str | None, author_avatar_url: str | None
) -> BlogPostSummaryResponse:
    return BlogPostSummaryResponse(
        id=post.id,
        slug=post.slug,
        title=post.title,
        excerpt=post.excerpt,
        cover_image_url=_cover_url(post.cover_image_asset_id),
        tags=list(post.tags or []),
        status=post.status,
        author_name=author_name,
        author_avatar_url=author_avatar_url,
        created_at=post.created_at,
        updated_at=post.updated_at,
        published_at=post.published_at,
    )


def _public_summary(
    post: CmsBlogPost, author_name: str | None, author_avatar_url: str | None
) -> PublicBlogPostSummary:
    return PublicBlogPostSummary(
        slug=post.slug,
        title=post.title,
        excerpt=post.excerpt,
        cover_image_url=_cover_url(post.cover_image_asset_id),
        tags=list(post.tags or []),
        author_name=author_name,
        author_avatar_url=author_avatar_url,
        published_at=post.published_at,
        reading_minutes=reading_minutes(post.content_md),
        claps=post.clap_count or 0,
    )


def _validate_content(content_md: str) -> None:
    if "<script" in content_md.lower():
        raise ValidationError("Blog content must not contain script tags.", "CMS_UNSAFE_TEXT")


def _normalize_tags(tags: list[str]) -> list[str]:
    seen: set[str] = set()
    cleaned: list[str] = []
    for tag in tags:
        normalized = tag.strip()
        if not normalized or len(normalized) > 40:
            raise ValidationError("Tags must be 1-40 characters.", "CMS_INVALID_TAG")
        if normalized.lower() in seen:
            continue
        seen.add(normalized.lower())
        cleaned.append(normalized)
    return cleaned


async def _get_post_row(post_id: str, db: AsyncSession) -> CmsBlogPost:
    result = await db.execute(
        select(CmsBlogPost).where(
            CmsBlogPost.id == post_id, CmsBlogPost.archived_at.is_(None)
        )
    )
    post = result.scalar_one_or_none()
    if post is None:
        raise NotFoundError("CmsBlogPost", post_id)
    return post


async def _ensure_unique_slug(slug: str, db: AsyncSession, exclude_id: str | None = None) -> str:
    base = slug or "post"
    candidate = base
    suffix = 2
    while True:
        stmt = select(CmsBlogPost.id).where(CmsBlogPost.slug == candidate)
        if exclude_id is not None:
            stmt = stmt.where(CmsBlogPost.id != exclude_id)
        existing = (await db.execute(stmt)).scalar_one_or_none()
        if existing is None:
            return candidate
        candidate = f"{base[: _MAX_SLUG_LENGTH - len(str(suffix)) - 1]}-{suffix}"
        suffix += 1


async def _validate_cover_asset(asset_id: str, db: AsyncSession) -> None:
    result = await db.execute(
        select(CmsMediaAsset).where(
            CmsMediaAsset.id == asset_id, CmsMediaAsset.archived_at.is_(None)
        )
    )
    asset = result.scalar_one_or_none()
    if asset is None:
        raise NotFoundError("CmsMediaAsset", asset_id)
    if not asset.content_type.startswith("image/"):
        raise ValidationError("Cover image must be an image asset.", "CMS_INVALID_COVER")


async def create_post(req: BlogPostCreateRequest, actor: User, db: AsyncSession) -> BlogPostResponse:
    _validate_content(req.content_md)
    requested_slug = (req.slug or "").strip() or slugify(req.title)
    slug = slugify(requested_slug)
    if not slug or not _SLUG_RE.match(slug):
        raise ValidationError("Post slug could not be derived from the title.", "CMS_INVALID_SLUG")
    slug = await _ensure_unique_slug(slug, db)
    if req.cover_image_asset_id:
        await _validate_cover_asset(req.cover_image_asset_id, db)
    if req.author_profile_id:
        await author_profile_service.ensure_active(req.author_profile_id, db)

    post = CmsBlogPost(
        id=str(uuid.uuid4()),
        slug=slug,
        title=req.title.strip(),
        excerpt=req.excerpt,
        content_md=req.content_md,
        cover_image_asset_id=req.cover_image_asset_id,
        tags=_normalize_tags(req.tags),
        status="draft",
        author_id=actor.id,
        author_profile_id=req.author_profile_id,
        seo_title=req.seo_title,
        seo_description=req.seo_description,
    )
    db.add(post)
    await audit_log_service.record(
        db,
        actor_id=actor.id,
        action="CMS_BLOG_CREATED",
        target_type="cms_blog_post",
        target_id=post.id,
        summary=f"Created blog post '{post.title}'",
        details={"slug": post.slug},
    )
    await db.commit()
    await db.refresh(post)
    name, avatar_url = await author_profile_service.resolve_byline(
        post.author_profile_id, post.author_id, db
    )
    return _post_response(post, name, avatar_url)


async def list_posts(
    db: AsyncSession,
    *,
    status: str | None = None,
    search: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[BlogPostSummaryResponse], int]:
    stmt = select(CmsBlogPost).where(CmsBlogPost.archived_at.is_(None))
    count_stmt = select(func.count(CmsBlogPost.id)).where(CmsBlogPost.archived_at.is_(None))
    if status in {"draft", "published"}:
        stmt = stmt.where(CmsBlogPost.status == status)
        count_stmt = count_stmt.where(CmsBlogPost.status == status)
    if search:
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(CmsBlogPost.title.ilike(pattern))
        count_stmt = count_stmt.where(CmsBlogPost.title.ilike(pattern))

    stmt = stmt.order_by(desc(CmsBlogPost.updated_at)).limit(limit).offset(offset)
    posts = (await db.execute(stmt)).scalars().all()
    total = int((await db.execute(count_stmt)).scalar_one() or 0)
    items = []
    for post in posts:
        name, avatar_url = await author_profile_service.resolve_byline(
            post.author_profile_id, post.author_id, db
        )
        items.append(_summary_response(post, name, avatar_url))
    return items, total


async def get_post(post_id: str, db: AsyncSession) -> BlogPostResponse:
    post = await _get_post_row(post_id, db)
    name, avatar_url = await author_profile_service.resolve_byline(
        post.author_profile_id, post.author_id, db
    )
    return _post_response(post, name, avatar_url)


async def update_post(
    post_id: str, req: BlogPostUpdateRequest, actor: User, db: AsyncSession
) -> BlogPostResponse:
    post = await _get_post_row(post_id, db)

    if req.title is not None:
        post.title = req.title.strip()
    if req.slug is not None:
        slug = slugify(req.slug)
        if not slug or not _SLUG_RE.match(slug):
            raise ValidationError("Invalid post slug.", "CMS_INVALID_SLUG")
        if slug != post.slug:
            post.slug = await _ensure_unique_slug(slug, db, exclude_id=post.id)
    if req.excerpt is not None:
        post.excerpt = req.excerpt
    if req.content_md is not None:
        _validate_content(req.content_md)
        post.content_md = req.content_md
    if req.clear_cover_image:
        post.cover_image_asset_id = None
    elif req.cover_image_asset_id is not None:
        await _validate_cover_asset(req.cover_image_asset_id, db)
        post.cover_image_asset_id = req.cover_image_asset_id
    if req.clear_author_profile:
        post.author_profile_id = None
    elif req.author_profile_id is not None:
        await author_profile_service.ensure_active(req.author_profile_id, db)
        post.author_profile_id = req.author_profile_id
    if req.tags is not None:
        post.tags = _normalize_tags(req.tags)
    if req.seo_title is not None:
        post.seo_title = req.seo_title
    if req.seo_description is not None:
        post.seo_description = req.seo_description

    await audit_log_service.record(
        db,
        actor_id=actor.id,
        action="CMS_BLOG_UPDATED",
        target_type="cms_blog_post",
        target_id=post.id,
        summary=f"Updated blog post '{post.title}'",
        details={"slug": post.slug},
    )
    await db.commit()
    await db.refresh(post)
    name, avatar_url = await author_profile_service.resolve_byline(
        post.author_profile_id, post.author_id, db
    )
    return _post_response(post, name, avatar_url)


async def publish_post(
    post_id: str, actor: User, db: AsyncSession, *, publish_at: datetime | None = None
) -> BlogPostResponse:
    post = await _get_post_row(post_id, db)
    if not post.content_md.strip():
        raise ValidationError("Cannot publish a post with no content.", "CMS_BLOG_EMPTY")

    now = datetime.now(UTC)
    # Normalise naive datetimes (SQLite returns them without tz info).
    stored_published_at = post.published_at
    if stored_published_at is not None and stored_published_at.tzinfo is None:
        stored_published_at = stored_published_at.replace(tzinfo=UTC)
    already_live = (
        post.status == "published" and stored_published_at is not None and stored_published_at <= now
    )
    if already_live and publish_at is None:
        raise ConflictError("This post is already published.", "CMS_BLOG_ALREADY_PUBLISHED")

    post.status = "published"
    post.published_at = publish_at or now
    await audit_log_service.record(
        db,
        actor_id=actor.id,
        action="CMS_BLOG_PUBLISHED",
        target_type="cms_blog_post",
        target_id=post.id,
        summary=f"Published blog post '{post.title}'",
        details={"slug": post.slug, "publish_at": post.published_at.isoformat()},
    )
    await db.commit()
    await db.refresh(post)
    name, avatar_url = await author_profile_service.resolve_byline(
        post.author_profile_id, post.author_id, db
    )
    return _post_response(post, name, avatar_url)


async def unpublish_post(post_id: str, actor: User, db: AsyncSession) -> BlogPostResponse:
    post = await _get_post_row(post_id, db)
    if post.status != "published":
        raise ConflictError("This post is not published.", "CMS_BLOG_NOT_PUBLISHED")
    post.status = "draft"
    await audit_log_service.record(
        db,
        actor_id=actor.id,
        action="CMS_BLOG_UNPUBLISHED",
        target_type="cms_blog_post",
        target_id=post.id,
        summary=f"Unpublished blog post '{post.title}'",
        details={"slug": post.slug},
    )
    await db.commit()
    await db.refresh(post)
    name, avatar_url = await author_profile_service.resolve_byline(
        post.author_profile_id, post.author_id, db
    )
    return _post_response(post, name, avatar_url)


async def archive_post(post_id: str, actor: User, db: AsyncSession) -> None:
    post = await _get_post_row(post_id, db)
    post.archived_at = datetime.now(UTC)
    post.status = "draft"
    await audit_log_service.record(
        db,
        actor_id=actor.id,
        action="CMS_BLOG_ARCHIVED",
        target_type="cms_blog_post",
        target_id=post.id,
        summary=f"Archived blog post '{post.title}'",
        details={"slug": post.slug},
    )
    await db.commit()


# ─── Trash (archived posts) operations ────────────────────────

async def _get_archived_post_row(post_id: str, db: AsyncSession) -> CmsBlogPost:
    result = await db.execute(
        select(CmsBlogPost).where(
            CmsBlogPost.id == post_id, CmsBlogPost.archived_at.is_not(None)
        )
    )
    post = result.scalar_one_or_none()
    if post is None:
        raise NotFoundError("CmsBlogPost", post_id)
    return post


async def list_archived_post_rows(db: AsyncSession) -> list[CmsBlogPost]:
    """Return archived post rows for internal maintenance surfaces.

    Trash needs the raw ``archived_at`` timestamp, which is intentionally not
    exposed by the normal CMP blog summary response.
    """
    stmt = (
        select(CmsBlogPost)
        .where(CmsBlogPost.archived_at.is_not(None))
        .order_by(desc(CmsBlogPost.archived_at))
    )
    return list((await db.execute(stmt)).scalars().all())


async def list_archived_posts(db: AsyncSession) -> list[BlogPostSummaryResponse]:
    """Return archived (trashed) blog posts, most-recently-archived first."""
    items: list[BlogPostSummaryResponse] = []
    for post in await list_archived_post_rows(db):
        name, avatar_url = await author_profile_service.resolve_byline(
            post.author_profile_id, post.author_id, db
        )
        items.append(_summary_response(post, name, avatar_url))
    return items


async def restore_post(post_id: str, actor: User, db: AsyncSession) -> None:
    """Restore an archived blog post (clear archived_at). It comes back as a
    draft so an admin re-publishes deliberately."""
    post = await _get_archived_post_row(post_id, db)
    post.archived_at = None
    await audit_log_service.record(
        db,
        actor_id=actor.id,
        action="CMS_BLOG_RESTORED",
        target_type="cms_blog_post",
        target_id=post.id,
        summary=f"Restored blog post '{post.title}'",
        details={"slug": post.slug},
    )
    await db.commit()


async def purge_post(post_id: str, actor: User, db: AsyncSession) -> None:
    """Permanently delete an archived blog post."""
    post = await _get_archived_post_row(post_id, db)
    title, slug = post.title, post.slug
    await db.delete(post)
    await audit_log_service.record(
        db,
        actor_id=actor.id,
        action="CMS_BLOG_PURGED",
        target_type="cms_blog_post",
        target_id=post_id,
        summary=f"Permanently deleted blog post '{title}'",
        details={"slug": slug},
    )
    await db.commit()


async def list_published_posts(
    db: AsyncSession,
    *,
    tag: str | None = None,
    limit: int = 9,
    offset: int = 0,
) -> tuple[list[PublicBlogPostSummary], int]:
    base_filter = [
        CmsBlogPost.status == "published",
        CmsBlogPost.archived_at.is_(None),
        CmsBlogPost.published_at <= datetime.now(UTC),
    ]
    stmt = (
        select(CmsBlogPost)
        .where(*base_filter)
        .order_by(desc(CmsBlogPost.published_at))
    )
    posts = (await db.execute(stmt)).scalars().all()

    # Tag filtering happens in Python: tags live in a JSON column and the
    # public blog is small enough that fetching published rows is cheap.
    if tag:
        wanted = tag.strip().lower()
        posts = [post for post in posts if any(t.lower() == wanted for t in (post.tags or []))]

    total = len(posts)
    page = posts[offset : offset + limit]
    items = []
    for post in page:
        name, avatar_url = await author_profile_service.resolve_byline(
            post.author_profile_id, post.author_id, db
        )
        items.append(_public_summary(post, name, avatar_url))
    return items, total


async def clap_post(slug: str, count: int, db: AsyncSession) -> int:
    amount = max(1, min(count, 50))
    result = await db.execute(
        update(CmsBlogPost)
        .where(
            CmsBlogPost.slug == slug,
            CmsBlogPost.status == "published",
            CmsBlogPost.archived_at.is_(None),
        )
        .values(clap_count=CmsBlogPost.clap_count + amount)
    )
    if result.rowcount == 0:
        raise NotFoundError("CmsBlogPost", slug)
    await db.commit()
    total = await db.execute(select(CmsBlogPost.clap_count).where(CmsBlogPost.slug == slug))
    return int(total.scalar_one() or 0)


async def get_published_post(slug: str, db: AsyncSession) -> PublicBlogPostResponse:
    result = await db.execute(
        select(CmsBlogPost).where(
            CmsBlogPost.slug == slug,
            CmsBlogPost.status == "published",
            CmsBlogPost.archived_at.is_(None),
            CmsBlogPost.published_at <= datetime.now(UTC),
        )
    )
    post = result.scalar_one_or_none()
    if post is None:
        raise NotFoundError("CmsBlogPost", slug)
    name, avatar_url = await author_profile_service.resolve_byline(
        post.author_profile_id, post.author_id, db
    )
    return PublicBlogPostResponse(
        **_public_summary(post, name, avatar_url).model_dump(),
        content_md=post.content_md,
        seo_title=post.seo_title,
        seo_description=post.seo_description,
    )
