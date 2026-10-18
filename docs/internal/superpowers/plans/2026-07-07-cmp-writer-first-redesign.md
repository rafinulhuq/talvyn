# CMP Writer-First Redesign (Phases 1-3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple blog bylines from the creating admin account (phase 1), remove the standalone Media Library in favor of per-article images (phase 2), and replace the always-visible publish sidebar with a publish-time panel that supports schedule-ahead publishing (phase 3).

**Architecture:** Backend changes follow the existing CMP service/schema/router layering (`app/services/*_service.py` → `app/schemas/*.py` → `app/api/v1/cms.py`, all superadmin-gated via `SuperAdminActor`, every mutation audit-logged). Frontend changes are scoped to `frontend/src/components/admin/{CmsClient,BlogManager,RichBlogEditor}.tsx`, `frontend/src/lib/api/cms.ts`, and `frontend/src/types/cms.ts`.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, Pydantic v2, Alembic, pytest + httpx (SQLite in-memory, `Base.metadata.create_all` — no Alembic run in tests), Next.js/React/TypeScript, Tailwind, axios-based `apiClient`. No frontend test framework exists in this repo — frontend tasks verify with `cd frontend && npm run build` (type-check) rather than an automated test.

## Global Constraints

- Every new/changed CMP endpoint requires `SuperAdminActor` (from `app/dependencies.py`) — never skip this.
- Every mutating service function calls `audit_log_service.record(...)` before its `db.commit()`, matching the existing pattern in `blog_service.py` / `cms_service.py`.
- The CMP router (`app/api/v1/cms.py`) is mounted twice in `app/api/v1/router.py`: `prefix="/cmp"` (primary, used by the frontend) and `prefix="/cms"` (legacy alias, `include_in_schema=False`). Adding a route to the router file covers both automatically — do not register routes twice.
- Backend tests use the `client` fixture (`backend/tests/conftest.py`), which sends `X-Actor-Id: 00000000-0000-0000-0000-000000000000` and the internal token automatically; call `_seed_actor(db_session)` first in every test that hits an authenticated route.
- Each test file defines its own local `_seed_actor` / `ACTOR_ID` rather than importing from another test module — follow that existing convention (see `test_blog.py` vs `test_cms.py`), don't add cross-test-file imports.
- Frontend API calls go through `cmpApi` (`frontend/src/lib/api/cms.ts`), never call `apiClient`/`fetch` directly from components.
- No new npm packages, no new Python packages — every task uses libraries already in `backend/requirements*.txt` / `frontend/package.json`.

---

### Task 1: Author profile model, migration, schema, service, and API

**Files:**
- Modify: `backend/app/db/models/cms.py` (add `CmsAuthorProfile`, add `author_profile_id` to `CmsBlogPost`)
- Create: `backend/alembic/versions/a4d8e2f6b1c3_add_cms_author_profiles.py`
- Modify: `backend/app/schemas/cms_blog.py` (add author profile schemas + fields on blog schemas)
- Create: `backend/app/services/author_profile_service.py`
- Modify: `backend/app/services/blog_service.py` (resolve byline via profile, accept `author_profile_id`)
- Modify: `backend/app/api/v1/cms.py` (register `/authors` routes, pass `author_profile_id` through to `blog_service`)
- Create: `backend/tests/test_cms_authors.py`
- Modify: `backend/tests/test_blog.py` (byline fallback/override tests)

**Interfaces:**
- Produces: `app.services.author_profile_service.list_profiles(db) -> list[AuthorProfileResponse]`, `create_profile(req, actor, db) -> AuthorProfileResponse`, `update_profile(profile_id, req, actor, db) -> AuthorProfileResponse`, `archive_profile(profile_id, actor, db) -> None`, `ensure_active(profile_id, db) -> None` (raises `NotFoundError` if missing/archived), `resolve_byline(author_profile_id, author_id, db) -> tuple[str | None, str | None]` (name, avatar_url).
- Produces schemas: `AuthorProfileCreateRequest{name, avatar_asset_id}`, `AuthorProfileUpdateRequest{name?, avatar_asset_id?, clear_avatar}`, `AuthorProfileResponse{id, name, avatar_asset_id, avatar_url, created_at, updated_at}`, `AuthorProfileListResponse{items}`.
- Consumes: `app.db.models.cms.CmsMediaAsset`, `app.services.audit_log_service.record(...)`, `app.core.exceptions.{NotFoundError, ValidationError}`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_cms_authors.py`:

```python
"""Integration tests for CMP author profiles (superadmin-managed blog bylines)."""

from httpx import AsyncClient

from app.db.models.cms import CmsAuthorProfile  # noqa: F401
from app.db.models.enums import Role
from app.db.models.user import User

ACTOR_ID = "00000000-0000-0000-0000-000000000000"


async def _seed_actor(db_session, *, role: Role = Role.SUPER_ADMIN) -> None:
    existing = await db_session.get(User, ACTOR_ID)
    if existing is None:
        db_session.add(
            User(
                id=ACTOR_ID,
                email="authors-admin@example.com",
                name="Authors Admin",
                password_hash="not-used",
                role=role,
                is_active=True,
            )
        )
    else:
        existing.role = role
        existing.is_active = True
        existing.name = "Authors Admin"
    await db_session.commit()


class TestCmsAuthorProfiles:
    async def test_routes_require_superadmin(self, client: AsyncClient, db_session):
        missing_actor = await client.get("/api/v1/cmp/authors")
        assert missing_actor.status_code == 401

        await _seed_actor(db_session, role=Role.ADMIN)
        normal_admin = await client.get("/api/v1/cmp/authors")
        assert normal_admin.status_code == 403

    async def test_create_list_update_and_archive_profile(
        self, client: AsyncClient, db_session
    ):
        await _seed_actor(db_session)

        created = await client.post("/api/v1/cmp/authors", json={"name": "Jane Doe"})
        assert created.status_code == 201
        profile = created.json()
        assert profile["name"] == "Jane Doe"
        assert profile["avatar_url"] is None

        listed = await client.get("/api/v1/cmp/authors")
        assert listed.status_code == 200
        assert [item["id"] for item in listed.json()["items"]] == [profile["id"]]

        updated = await client.patch(
            f"/api/v1/cmp/authors/{profile['id']}", json={"name": "Jane D. Doe"}
        )
        assert updated.status_code == 200
        assert updated.json()["name"] == "Jane D. Doe"

        archived = await client.delete(f"/api/v1/cmp/authors/{profile['id']}")
        assert archived.status_code == 204

        listed_after_archive = await client.get("/api/v1/cmp/authors")
        assert listed_after_archive.json()["items"] == []
```

Add to `backend/tests/test_blog.py` (inside a new class, after `TestBlogCrud`):

```python
class TestBlogPostByline:
    async def test_post_with_no_profile_falls_back_to_creator_name(
        self, client: AsyncClient, db_session
    ):
        await _seed_actor(db_session)

        created = await client.post(
            "/api/v1/cmp/blog", json={"title": "No Profile Post", "content_md": "Body"}
        )
        assert created.status_code == 201
        body = created.json()
        assert body["author_name"] == "Blog Admin"
        assert body["author_profile_id"] is None
        assert body["author_avatar_url"] is None

    async def test_post_with_profile_displays_profile_name(
        self, client: AsyncClient, db_session
    ):
        await _seed_actor(db_session)
        profile = (
            await client.post("/api/v1/cmp/authors", json={"name": "Talvyn Team"})
        ).json()

        created = await client.post(
            "/api/v1/cmp/blog",
            json={
                "title": "Team Post",
                "content_md": "Body",
                "author_profile_id": profile["id"],
            },
        )
        assert created.status_code == 201
        assert created.json()["author_name"] == "Talvyn Team"
        assert created.json()["author_profile_id"] == profile["id"]

    async def test_archived_profile_still_resolves_on_existing_posts(
        self, client: AsyncClient, db_session
    ):
        await _seed_actor(db_session)
        profile = (
            await client.post("/api/v1/cmp/authors", json={"name": "Guest Author"})
        ).json()
        post = (
            await client.post(
                "/api/v1/cmp/blog",
                json={
                    "title": "Guest Post",
                    "content_md": "Body",
                    "author_profile_id": profile["id"],
                },
            )
        ).json()

        assert (await client.delete(f"/api/v1/cmp/authors/{profile['id']}")).status_code == 204

        fetched = await client.get(f"/api/v1/cmp/blog/{post['id']}")
        assert fetched.json()["author_name"] == "Guest Author"
        assert (await client.get("/api/v1/cmp/authors")).json()["items"] == []

    async def test_unknown_author_profile_id_is_rejected(
        self, client: AsyncClient, db_session
    ):
        await _seed_actor(db_session)
        resp = await client.post(
            "/api/v1/cmp/blog",
            json={
                "title": "Bad Profile Post",
                "content_md": "Body",
                "author_profile_id": "does-not-exist",
            },
        )
        assert resp.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_cms_authors.py tests/test_blog.py -k "Byline or AuthorProfiles" -v`
Expected: FAIL — `/api/v1/cmp/authors` doesn't exist (404 on all requests) and `author_profile_id` is an unrecognized field.

- [ ] **Step 3: Add the model**

In `backend/app/db/models/cms.py`, insert this class after `CmsContentVersion` and before `CmsBlogPost`:

```python
class CmsAuthorProfile(Base):
    __tablename__ = "cms_author_profiles"

    id: Mapped[str] = mapped_column(GUID(), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    avatar_asset_id: Mapped[str | None] = mapped_column(
        GUID(), ForeignKey("cms_media_assets.id", ondelete="SET NULL"), nullable=True
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), onupdate=func.now(), nullable=False
    )
```

Then add one column to `CmsBlogPost`, directly after the existing `author_id` column:

```python
    author_profile_id: Mapped[str | None] = mapped_column(
        GUID(), ForeignKey("cms_author_profiles.id", ondelete="SET NULL"), nullable=True
    )
```

- [ ] **Step 4: Add the migration**

Create `backend/alembic/versions/a4d8e2f6b1c3_add_cms_author_profiles.py`:

```python
"""add cms author profiles

Revision ID: a4d8e2f6b1c3
Revises: f8c4d2a1b7e9
Create Date: 2026-07-07
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "a4d8e2f6b1c3"
down_revision: Union[str, None] = "f8c4d2a1b7e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS cms_author_profiles (
            id VARCHAR PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            avatar_asset_id VARCHAR REFERENCES cms_media_assets(id) ON DELETE SET NULL,
            archived_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    op.execute(sa.text("""
        ALTER TABLE cms_blog_posts
        ADD COLUMN IF NOT EXISTS author_profile_id VARCHAR
        REFERENCES cms_author_profiles(id) ON DELETE SET NULL
    """))


def downgrade() -> None:
    op.execute(sa.text("ALTER TABLE cms_blog_posts DROP COLUMN IF EXISTS author_profile_id"))
    op.execute(sa.text("DROP TABLE IF EXISTS cms_author_profiles"))
```

- [ ] **Step 5: Add author profile schemas**

In `backend/app/schemas/cms_blog.py`, add after the `BlogPostUpdateRequest` class:

```python
class AuthorProfileCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    avatar_asset_id: str | None = None


class AuthorProfileUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    avatar_asset_id: str | None = None
    clear_avatar: bool = False


class AuthorProfileResponse(BaseModel):
    id: str
    name: str
    avatar_asset_id: str | None
    avatar_url: str | None
    created_at: datetime
    updated_at: datetime


class AuthorProfileListResponse(BaseModel):
    items: list[AuthorProfileResponse]
```

Then add two fields to `BlogPostCreateRequest` (after `cover_image_asset_id`):

```python
    author_profile_id: str | None = None
```

And to `BlogPostUpdateRequest` (after `clear_cover_image`):

```python
    author_profile_id: str | None = None
    clear_author_profile: bool = False
```

And to `BlogPostResponse` (after `author_name`):

```python
    author_profile_id: str | None
    author_avatar_url: str | None
```

And to `BlogPostSummaryResponse` (after `author_name`):

```python
    author_avatar_url: str | None
```

And to `PublicBlogPostSummary` (after `author_name`):

```python
    author_avatar_url: str | None
```

- [ ] **Step 6: Write the author profile service**

Create `backend/app/services/author_profile_service.py`:

```python
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
```

- [ ] **Step 7: Wire author profiles into `blog_service.py`**

In `backend/app/services/blog_service.py`:

Replace the import block's `from app.services import audit_log_service` line with:

```python
from app.services import audit_log_service, author_profile_service
```

Delete the existing `_author_name` function (lines 128-132) — it's replaced by `author_profile_service.resolve_byline`.

Change `_post_response`, `_summary_response`, and `_public_summary` to take an `author_avatar_url` parameter and include it:

```python
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
```

Replace every call site that builds a response to resolve both name and avatar together. In `create_post`, replace `return _post_response(post, actor.name)` with:

```python
    name, avatar_url = await author_profile_service.resolve_byline(
        post.author_profile_id, post.author_id, db
    )
    return _post_response(post, name, avatar_url)
```

And, still in `create_post`, right after the existing `if req.cover_image_asset_id:` validation block, add:

```python
    if req.author_profile_id:
        await author_profile_service.ensure_active(req.author_profile_id, db)
```

And add `author_profile_id=req.author_profile_id,` to the `CmsBlogPost(...)` constructor call, after `author_id=actor.id,`.

In `list_posts`, replace the join and comprehension:

```python
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
```

(This drops the `outerjoin(User, ...)` — resolution now goes through `resolve_byline`, which already queries `User` when there's no profile.)

In `get_post`, `update_post`, `publish_post`, `unpublish_post` — every `return _post_response(post, await _author_name(post.author_id, db))` becomes:

```python
    name, avatar_url = await author_profile_service.resolve_byline(
        post.author_profile_id, post.author_id, db
    )
    return _post_response(post, name, avatar_url)
```

In `update_post`, add author-profile handling right after the existing cover-image `if/elif` block (after `post.cover_image_asset_id = req.cover_image_asset_id`):

```python
    if req.clear_author_profile:
        post.author_profile_id = None
    elif req.author_profile_id is not None:
        await author_profile_service.ensure_active(req.author_profile_id, db)
        post.author_profile_id = req.author_profile_id
```

In `list_published_posts`, replace the join-based query with:

```python
async def list_published_posts(
    db: AsyncSession,
    *,
    tag: str | None = None,
    limit: int = 9,
    offset: int = 0,
) -> tuple[list[PublicBlogPostSummary], int]:
    stmt = (
        select(CmsBlogPost)
        .where(CmsBlogPost.status == "published", CmsBlogPost.archived_at.is_(None))
        .order_by(desc(CmsBlogPost.published_at))
    )
    posts = (await db.execute(stmt)).scalars().all()

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
```

In `get_published_post`, replace the join-based query with:

```python
async def get_published_post(slug: str, db: AsyncSession) -> PublicBlogPostResponse:
    result = await db.execute(
        select(CmsBlogPost).where(
            CmsBlogPost.slug == slug,
            CmsBlogPost.status == "published",
            CmsBlogPost.archived_at.is_(None),
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
```

Keep the `from app.db.models.user import User` import in `blog_service.py` unchanged — `User` is still used as the `actor: User` type hint on `create_post`, `update_post`, `publish_post`, and every other mutating function in this file. Only the direct `select(User.name)` lookup moved into `author_profile_service.resolve_byline`.

- [ ] **Step 8: Register the `/authors` routes**

In `backend/app/api/v1/cms.py`, add to the `from app.schemas.cms_blog import (...)` block:

```python
    AuthorProfileCreateRequest,
    AuthorProfileListResponse,
    AuthorProfileResponse,
    AuthorProfileUpdateRequest,
```

Add to the services import line: `from app.services import author_profile_service, blog_service, cms_service`.

Insert these routes right after `archive_blog_post` (the `DELETE /blog/{post_id}` handler) and before the `/media` routes:

```python
@router.get("/authors", response_model=AuthorProfileListResponse)
async def list_authors(
    _actor: SuperAdminActor,
    db: AsyncSession = Depends(get_db),
) -> AuthorProfileListResponse:
    return AuthorProfileListResponse(items=await author_profile_service.list_profiles(db))


@router.post("/authors", response_model=AuthorProfileResponse, status_code=201)
async def create_author(
    req: AuthorProfileCreateRequest,
    actor: SuperAdminActor,
    db: AsyncSession = Depends(get_db),
) -> AuthorProfileResponse:
    return await author_profile_service.create_profile(req, actor, db)


@router.patch("/authors/{profile_id}", response_model=AuthorProfileResponse)
async def update_author(
    profile_id: str,
    req: AuthorProfileUpdateRequest,
    actor: SuperAdminActor,
    db: AsyncSession = Depends(get_db),
) -> AuthorProfileResponse:
    return await author_profile_service.update_profile(profile_id, req, actor, db)


@router.delete("/authors/{profile_id}", status_code=204)
async def archive_author(
    profile_id: str,
    actor: SuperAdminActor,
    db: AsyncSession = Depends(get_db),
) -> None:
    await author_profile_service.archive_profile(profile_id, actor, db)
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_cms_authors.py tests/test_blog.py tests/test_cms.py -v`
Expected: PASS — all author-profile tests green, and the pre-existing `test_blog.py` / `test_cms.py` tests still pass unchanged (byline resolution behavior for posts with no profile is unchanged).

- [ ] **Step 10: Commit**

```bash
git add backend/app/db/models/cms.py backend/alembic/versions/a4d8e2f6b1c3_add_cms_author_profiles.py \
  backend/app/schemas/cms_blog.py backend/app/services/author_profile_service.py \
  backend/app/services/blog_service.py backend/app/api/v1/cms.py \
  backend/tests/test_cms_authors.py backend/tests/test_blog.py
git commit -m "feat: add CMP author profiles for decoupled blog bylines"
```

---

### Task 2: Frontend types and API client for author profiles

**Files:**
- Modify: `frontend/src/types/cms.ts`
- Modify: `frontend/src/lib/api/cms.ts`

**Interfaces:**
- Consumes: `CmsMediaAsset` (existing type), `apiClient` (existing).
- Produces: `CmsAuthorProfile`, `CmsAuthorProfileListResponse` types; `cmpApi.listAuthors()`, `cmpApi.createAuthor(data)`.

- [ ] **Step 1: Add types**

In `frontend/src/types/cms.ts`, add after `CmsMediaListResponse`:

```typescript
export interface CmsAuthorProfile {
  id: string;
  name: string;
  avatar_asset_id: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface CmsAuthorProfileListResponse {
  items: CmsAuthorProfile[];
}
```

Add two fields to `BlogPost` (after `author_name`):

```typescript
  author_profile_id: string | null;
  author_avatar_url: string | null;
```

Add one field to `BlogPostSummary` (after `author_name`):

```typescript
  author_avatar_url: string | null;
```

Add two fields to `BlogPostInput` (after `clear_cover_image`):

```typescript
  author_profile_id?: string | null;
  clear_author_profile?: boolean;
```

Add one field to `PublicBlogPostSummary` (after `author_name`):

```typescript
  author_avatar_url: string | null;
```

- [ ] **Step 2: Add API client methods**

In `frontend/src/lib/api/cms.ts`, add `CmsAuthorProfileListResponse` to the type-only import from `@/types/cms`, then add these two methods to the `cmpApi` object, right after `archiveBlogPost`:

```typescript
  listAuthors(): Promise<ApiResult<CmsAuthorProfileListResponse>> {
    return apiClient.get<CmsAuthorProfileListResponse>(`${CMP_API_PREFIX}/authors`);
  },

  createAuthor(data: {
    name: string;
    avatar_asset_id?: string | null;
  }): Promise<ApiResult<CmsAuthorProfile>> {
    return apiClient.post<CmsAuthorProfile>(`${CMP_API_PREFIX}/authors`, data);
  },
```

(`CmsAuthorProfile` also needs adding to the type-only import list alongside `CmsAuthorProfileListResponse`.)

- [ ] **Step 3: Verify the build**

Run: `cd frontend && npm run build`
Expected: build succeeds with no type errors (these are additive/unused-so-far types and methods, nothing consumes them yet).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/cms.ts frontend/src/lib/api/cms.ts
git commit -m "feat: add frontend types and API client for author profiles"
```

---

### Task 3: Author picker UI in the post editor

**Files:**
- Modify: `frontend/src/components/admin/BlogManager.tsx`

**Interfaces:**
- Consumes: `cmpApi.listAuthors()`, `cmpApi.createAuthor()`, `cmpApi.uploadMedia()` (existing), `CmsAuthorProfile` type.
- Produces: `EditorState.authorProfileId: string | null`, included in the save payload as `author_profile_id` / `clear_author_profile`.

- [ ] **Step 1: Extend editor state**

In `BlogManager.tsx`, add `authorProfileId: string | null;` to the `EditorState` interface (after `coverImageAssetId`), add `authorProfileId: null,` to `emptyEditor`, and add `authorProfileId: post.author_profile_id,` to `editorFromPost`. Add `state.authorProfileId,` to the array in `editorSnapshot` (so autosave picks up author changes).

- [ ] **Step 2: Load profiles and add "new author" state**

Add near the top of the `BlogManager` function body (after the existing `sessionMedia` state):

```typescript
  const [authors, setAuthors] = useState<CmsAuthorProfile[]>([]);
  const [newAuthorOpen, setNewAuthorOpen] = useState(false);
  const [newAuthorName, setNewAuthorName] = useState("");
  const [newAuthorAvatarFile, setNewAuthorAvatarFile] = useState<File | null>(null);
  const [savingAuthor, setSavingAuthor] = useState(false);
```

Add `CmsAuthorProfile` to the `import type { ... } from "@/types/cms"` block.

Add an effect to load authors once on mount (after the existing `loadPosts` effect):

```typescript
  useEffect(() => {
    void cmpApi.listAuthors().then((result) => {
      if (result.success) setAuthors(result.data.items);
    });
  }, []);
```

- [ ] **Step 3: Add the "create author" handler**

Add this function alongside `uploadEditorImage`:

```typescript
  async function createAuthor() {
    if (!newAuthorName.trim()) return;
    setSavingAuthor(true);
    let avatarAssetId: string | undefined;
    if (newAuthorAvatarFile) {
      const uploaded = await uploadEditorImage(newAuthorAvatarFile);
      if (uploaded) avatarAssetId = uploaded.id;
    }
    const result = await cmpApi.createAuthor({ name: newAuthorName.trim(), avatar_asset_id: avatarAssetId });
    if (result.success) {
      setAuthors((prev) => [...prev, result.data].sort((a, b) => a.name.localeCompare(b.name)));
      updateEditor({ authorProfileId: result.data.id });
      setNewAuthorOpen(false);
      setNewAuthorName("");
      setNewAuthorAvatarFile(null);
    } else {
      setMessage({ type: "error", text: result.error.message });
    }
    setSavingAuthor(false);
  }
```

- [ ] **Step 4: Include author in the save payload**

In `savePost`, add to the `payload` object (after `clear_cover_image`):

```typescript
      author_profile_id: editor.authorProfileId ?? undefined,
      clear_author_profile: editor.authorProfileId === null,
```

- [ ] **Step 5: Add the Author section to the sidebar**

In the `<aside>` block of the editor view, insert this section right before the existing "Tags" section:

```tsx
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-900">Author</h3>
                <select
                  value={editor.authorProfileId ?? ""}
                  onChange={(event) =>
                    updateEditor({ authorProfileId: event.target.value || null })
                  }
                  className={fieldClasses()}
                >
                  <option value="">Your account name</option>
                  {authors.map((author) => (
                    <option key={author.id} value={author.id}>
                      {author.name}
                    </option>
                  ))}
                </select>
                {newAuthorOpen ? (
                  <div className="mt-2 space-y-2 rounded-lg border border-dashed border-slate-300 p-2">
                    <input
                      value={newAuthorName}
                      onChange={(event) => setNewAuthorName(event.target.value)}
                      placeholder="Author name"
                      className={fieldClasses("text-xs")}
                    />
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={(event) => setNewAuthorAvatarFile(event.target.files?.[0] ?? null)}
                      className="w-full text-xs text-slate-500"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" loading={savingAuthor} onClick={createAuthor}>
                        Save author
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setNewAuthorOpen(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" className="mt-2" onClick={() => setNewAuthorOpen(true)}>
                    + New author
                  </Button>
                )}
              </section>
```

- [ ] **Step 6: Verify the build**

Run: `cd frontend && npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 7: Manual verification**

Use the `run` skill (or `npm run dev` in `frontend/` plus the FastAPI backend running) to open the CMP, create a blog post, add a new author via "+ New author" with a name and optional avatar, confirm it's selected, save the post, and confirm `GET /api/v1/cmp/blog/{id}` returns the profile's name.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/admin/BlogManager.tsx
git commit -m "feat: add author picker to the blog post editor"
```

---

### Task 4: Remove media list/update/archive endpoints (backend)

**Files:**
- Modify: `backend/app/api/v1/cms.py`
- Modify: `backend/app/services/cms_service.py`
- Modify: `backend/tests/test_cms.py`

**Interfaces:**
- Removes: `GET /media`, `PATCH /media/{id}`, `POST /media/{id}/archive` routes; `cms_service.list_media_assets`, `update_media_asset`, `archive_media_asset`.
- Keeps unchanged: `POST /media` (upload), `GET /media/{id}/content` (serve), `cms_service.create_media_asset`, `get_media_asset`.

- [ ] **Step 1: Update the test first**

In `backend/tests/test_cms.py`, replace `test_media_upload_serves_archive_and_backup` with a trimmed version that only exercises what's staying:

```python
    async def test_media_upload_and_serves_content(self, client: AsyncClient, db_session):
        await _seed_actor(db_session)
        content = b"\x89PNG\r\n\x1a\ntalvyn"

        upload = await client.post(
            "/api/v1/cmp/media",
            files={"file": ("hero.png", content, "image/png")},
            data={"title": "Hero", "alt_text": "Hero image"},
        )

        assert upload.status_code == 201
        asset = upload.json()
        assert asset["url"] == f"/api/cmp/media/{asset['id']}"

        served = await client.get(f"/api/v1/cmp/media/{asset['id']}/content")
        assert served.status_code == 200
        assert served.content == content

        backup = await client.get("/api/v1/admin/backup")
        assert backup.status_code == 200
        assert len(backup.json()["tables"]["cms_media_assets"]) == 1
        assert any(file["path"] == asset["storage_key"] for file in backup.json()["files"])
```

- [ ] **Step 2: Run the test to verify it still passes against the old code**

Run: `cd backend && pytest tests/test_cms.py -k test_media_upload_and_serves_content -v`
Expected: PASS (upload/serve endpoints aren't touched yet, so this passes before and after the removal below — this step confirms the trimmed test is correct on its own).

- [ ] **Step 3: Remove the dead routes**

In `backend/app/api/v1/cms.py`, delete the `list_media`, `update_media`, and `archive_media` route handlers (the `GET /media`, `PATCH /media/{asset_id}`, and `POST /media/{asset_id}/archive` blocks), keeping `upload_media` and `media_content`. Remove `CmsMediaListResponse` and `CmsMediaUpdateRequest` from the `from app.schemas.cms import (...)` import block (keep `CmsMediaAssetResponse`).

- [ ] **Step 4: Remove the dead service functions**

In `backend/app/services/cms_service.py`, delete `list_media_assets` and `update_media_asset` entirely. In `archive_media_asset`, that function is also deleted — but first confirm nothing else in the backend calls it:

Run: `cd backend && grep -rn "list_media_assets\|update_media_asset\|archive_media_asset" app/`
Expected: no matches outside `cms_service.py` itself before deletion (confirms it's safe to delete all three).

Delete `archive_media_asset` too.

- [ ] **Step 5: Run tests to verify everything still passes**

Run: `cd backend && pytest tests/test_cms.py tests/test_blog.py tests/test_cms_authors.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/cms.py backend/app/services/cms_service.py backend/tests/test_cms.py
git commit -m "refactor: remove standalone media list/update/archive endpoints"
```

---

### Task 5: Remove the Media Library tab (frontend)

**Files:**
- Modify: `frontend/src/components/admin/CmsClient.tsx`
- Modify: `frontend/src/lib/api/cms.ts`
- Modify: `frontend/src/types/cms.ts`

**Interfaces:**
- Removes: `CmsTab` no longer includes `"media"`; `cmpApi.listMedia`, `cmpApi.updateMedia`, `cmpApi.archiveMedia` deleted; `CmsMediaListResponse` type deleted (no longer referenced anywhere in frontend once this lands).
- `BlogManager` no longer receives a `media` prop (Task 6 removes it from the prop signature).

- [ ] **Step 1: Remove the tab and its state from `CmsClient.tsx`**

Change the `CmsTab` type from `"content" | "blog" | "media"` to `"content" | "blog"`.

Remove the `{ key: "media", label: "Media Library", icon: FileImage }` entry from the tabs array (find it near the top of the file, alongside the other tab definitions).

Remove this state (in `CmpClient`): `media`, `mediaTitle`, `mediaAlt`, and the `fileInputRef` if nothing else in the file uses it after this change (check with `grep -n "fileInputRef" frontend/src/components/admin/CmsClient.tsx` — if only the media tab used it, remove the `useRef` declaration too).

Remove the `uploadMedia`, `copyMediaUrl`, `archiveMedia` handler functions.

In `loadCms()`, change:

```typescript
    const [docsResult, mediaResult] = await Promise.all([
      cmpApi.listDocuments(),
      cmpApi.listMedia(),
    ]);
```

to:

```typescript
    const docsResult = await cmpApi.listDocuments();
```

and remove the `if (mediaResult.success) setMedia(mediaResult.data.items);` line.

Delete the entire `{activeTab === "media" && ( ... )}` JSX block (the Media Library render section).

Remove `<BlogManager media={media} />` and replace with `<BlogManager />` (Task 6 makes this the actual signature change).

- [ ] **Step 2: Remove the now-dead API client methods**

In `frontend/src/lib/api/cms.ts`, delete `listMedia`, `updateMedia`, and `archiveMedia` from the `cmpApi` object. Keep `uploadMedia`.

- [ ] **Step 3: Remove the now-dead type**

In `frontend/src/types/cms.ts`, delete `CmsMediaListResponse` (confirm first nothing else references it: `grep -rn "CmsMediaListResponse" frontend/src` should only show the type definition and its former usages you just removed).

- [ ] **Step 4: Verify the build**

Run: `cd frontend && npm run build`
Expected: build fails at this point because `BlogManager` still declares a required `media` prop that `CmsClient.tsx` no longer passes — that's expected; Task 6 fixes `BlogManager`'s signature. Confirm the *only* build errors are inside `BlogManager.tsx`/`RichBlogEditor.tsx` about the `media` prop, nothing else broke.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/admin/CmsClient.tsx frontend/src/lib/api/cms.ts frontend/src/types/cms.ts
git commit -m "refactor: remove the standalone Media Library tab"
```

---

### Task 6: Per-article image scoping in the post editor

**Files:**
- Modify: `frontend/src/components/admin/BlogManager.tsx`
- Modify: `frontend/src/components/admin/RichBlogEditor.tsx`

**Interfaces:**
- Changes: `BlogManager` no longer takes a `media` prop — `export function BlogManager()`.
- Changes: `RichBlogEditor`'s `imageAssets` prop now only ever contains this-session uploads (still typed `CmsMediaAsset[]`, same shape, smaller source).
- Removes: `RichBlogEditor`'s "Insert image from media library" picker (`pickerOpen` state, the picker modal JSX, the `FloatingMenu`'s library button).

- [ ] **Step 1: Drop the `media` prop from `BlogManager`**

Change the function signature from `export function BlogManager({ media }: { media: CmsMediaAsset[] })` to `export function BlogManager()`.

Change the `imageAssets` memo from merging `sessionMedia` with `media` to just `sessionMedia`:

```typescript
  const imageAssets = useMemo(
    () => sessionMedia.filter((asset) => asset.content_type.startsWith("image/")),
    [sessionMedia]
  );
```

- [ ] **Step 2: Replace the cover-image dropdown with a direct upload control**

Replace the entire "Cover image" `<section>` in the `<aside>` block with:

```tsx
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <ImageIcon className="h-4 w-4 text-slate-400" />
                  Cover image
                </h3>
                {coverAsset ? (
                  <div className="space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={coverAsset.url}
                      alt={coverAsset.alt_text ?? ""}
                      className="h-32 w-full rounded-lg object-cover"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => updateEditor({ coverImageAssetId: null })}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500 hover:bg-slate-100">
                    <ImageIcon className="h-5 w-5 text-slate-400" />
                    {coverUploading ? "Uploading…" : "Drag & drop or click to upload"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      disabled={coverUploading}
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (!file) return;
                        setCoverUploading(true);
                        const asset = await uploadEditorImage(file);
                        if (asset) updateEditor({ coverImageAssetId: asset.id });
                        setCoverUploading(false);
                      }}
                    />
                  </label>
                )}
              </section>
```

Add `const [coverUploading, setCoverUploading] = useState(false);` alongside the other editor-local state declarations.

- [ ] **Step 3: Remove the media-library picker from `RichBlogEditor`**

In `RichBlogEditor.tsx`, remove the `pickerOpen` state and `setPickerOpen` usage, the "Insert image from media library" `MenuButton` in the `FloatingMenu`, and the entire `{pickerOpen && ( ... )}` modal block at the bottom of the component. Remove the now-unused `insertAsset` function. The component keeps: drag-drop upload, paste upload, and the "Upload image" button (`fileInputRef`) — all upload-and-insert in one step already, no picker needed.

The `imageAssets` prop becomes unused inside `RichBlogEditor` once the picker is gone — remove it from `RichBlogEditorProps` and from the destructured props, and remove the corresponding `imageAssets={imageAssets}` prop passed from `BlogManager.tsx`.

- [ ] **Step 4: Verify the build**

Run: `cd frontend && npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 5: Manual verification**

Use the `run` skill to open the CMP, create a post, drag-drop an image into the body (confirms inline upload still works), upload a cover image via the new dropzone, and confirm there is no "Media Library" tab and no "insert from library" button in the editor's floating toolbar.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/admin/BlogManager.tsx frontend/src/components/admin/RichBlogEditor.tsx
git commit -m "refactor: scope blog images to the article being edited"
```

---

### Task 7: Publish-time scheduling (backend)

**Files:**
- Modify: `backend/app/schemas/cms_blog.py`
- Modify: `backend/app/services/blog_service.py`
- Modify: `backend/app/api/v1/cms.py`
- Modify: `backend/tests/test_blog.py`

**Interfaces:**
- Produces: `BlogPostPublishRequest{publish_at: datetime | None}`.
- Changes: `blog_service.publish_post(post_id, actor, db, *, publish_at: datetime | None = None) -> BlogPostResponse`.
- Changes: `list_published_posts` / `get_published_post` add a `published_at <= now()` filter.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_blog.py`, after `TestBlogPostByline` (or as a new class if Task 1 wasn't done as a class — place it as its own `TestBlogScheduling` class):

```python
class TestBlogScheduling:
    async def test_schedule_for_future_hides_post_until_due(
        self, client: AsyncClient, db_session
    ):
        await _seed_actor(db_session)
        from datetime import UTC, datetime, timedelta

        post = (
            await client.post(
                "/api/v1/cmp/blog", json={"title": "Future Post", "content_md": "Body"}
            )
        ).json()

        future = (datetime.now(UTC) + timedelta(days=1)).isoformat()
        scheduled = await client.post(
            f"/api/v1/cmp/blog/{post['id']}/publish", json={"publish_at": future}
        )
        assert scheduled.status_code == 200
        assert scheduled.json()["status"] == "published"

        # Not visible publicly yet — its published_at is in the future.
        assert (await client.get("/api/v1/cmp/public/blog")).json()["total"] == 0
        assert (
            await client.get(f"/api/v1/cmp/public/blog/{post['slug']}")
        ).status_code == 404

        # But the admin editor can see it as published (with a future date).
        admin_view = await client.get(f"/api/v1/cmp/blog/{post['id']}")
        assert admin_view.json()["status"] == "published"

    async def test_publish_now_on_a_scheduled_post_makes_it_live_immediately(
        self, client: AsyncClient, db_session
    ):
        await _seed_actor(db_session)
        from datetime import UTC, datetime, timedelta

        post = (
            await client.post(
                "/api/v1/cmp/blog", json={"title": "Push Live", "content_md": "Body"}
            )
        ).json()
        future = (datetime.now(UTC) + timedelta(days=1)).isoformat()
        await client.post(f"/api/v1/cmp/blog/{post['id']}/publish", json={"publish_at": future})

        pushed_live = await client.post(f"/api/v1/cmp/blog/{post['id']}/publish", json={})
        assert pushed_live.status_code == 200

        assert (await client.get("/api/v1/cmp/public/blog")).json()["total"] == 1

    async def test_immediate_publish_unaffected_by_scheduling_change(
        self, client: AsyncClient, db_session
    ):
        await _seed_actor(db_session)

        post = (
            await client.post(
                "/api/v1/cmp/blog", json={"title": "Normal Post", "content_md": "Body"}
            )
        ).json()
        published = await client.post(f"/api/v1/cmp/blog/{post['id']}/publish", json={})
        assert published.status_code == 200
        assert (await client.get("/api/v1/cmp/public/blog")).json()["total"] == 1

        already_live = await client.post(f"/api/v1/cmp/blog/{post['id']}/publish", json={})
        assert already_live.status_code == 409
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_blog.py -k Scheduling -v`
Expected: FAIL — `/publish` doesn't accept a JSON body yet (`publish_at` is an unrecognized field / 422, or the post is publicly visible immediately regardless of `publish_at`).

- [ ] **Step 3: Add the publish request schema**

In `backend/app/schemas/cms_blog.py`, add after `BlogPostUpdateRequest`:

```python
class BlogPostPublishRequest(BaseModel):
    publish_at: datetime | None = None
```

- [ ] **Step 4: Update `publish_post` to accept a target datetime**

In `backend/app/services/blog_service.py`, replace `publish_post`:

```python
async def publish_post(
    post_id: str, actor: User, db: AsyncSession, *, publish_at: datetime | None = None
) -> BlogPostResponse:
    post = await _get_post_row(post_id, db)
    if not post.content_md.strip():
        raise ValidationError("Cannot publish a post with no content.", "CMS_BLOG_EMPTY")

    now = datetime.now(UTC)
    already_live = (
        post.status == "published" and post.published_at is not None and post.published_at <= now
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
```

- [ ] **Step 5: Filter public queries by `published_at`**

In `list_published_posts`, change the `stmt` filter from `CmsBlogPost.status == "published", CmsBlogPost.archived_at.is_(None)` to also include the time check:

```python
    now = datetime.now(UTC)
    stmt = (
        select(CmsBlogPost)
        .where(
            CmsBlogPost.status == "published",
            CmsBlogPost.archived_at.is_(None),
            CmsBlogPost.published_at <= now,
        )
        .order_by(desc(CmsBlogPost.published_at))
    )
```

In `get_published_post`, add the same clause:

```python
    result = await db.execute(
        select(CmsBlogPost).where(
            CmsBlogPost.slug == slug,
            CmsBlogPost.status == "published",
            CmsBlogPost.archived_at.is_(None),
            CmsBlogPost.published_at <= datetime.now(UTC),
        )
    )
```

- [ ] **Step 6: Wire the publish endpoint to accept the optional body**

In `backend/app/api/v1/cms.py`, add `BlogPostPublishRequest` to the `from app.schemas.cms_blog import (...)` block, then change `publish_blog_post`:

```python
@router.post("/blog/{post_id}/publish", response_model=BlogPostResponse)
async def publish_blog_post(
    post_id: str,
    actor: SuperAdminActor,
    db: AsyncSession = Depends(get_db),
    req: BlogPostPublishRequest | None = None,
) -> BlogPostResponse:
    return await blog_service.publish_post(
        post_id, actor, db, publish_at=req.publish_at if req else None
    )
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_blog.py tests/test_cms_authors.py tests/test_cms.py -v`
Expected: PASS — including the pre-existing `test_create_update_publish_lifecycle` and `test_admin_list_filters_and_archive`, which publish with no body at all (`client.post(f".../publish")` with no `json=`) and must keep working.

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas/cms_blog.py backend/app/services/blog_service.py backend/app/api/v1/cms.py backend/tests/test_blog.py
git commit -m "feat: support scheduled publishing via a future published_at"
```

---

### Task 8: Publish panel + scheduling UI (frontend)

**Files:**
- Modify: `frontend/src/components/admin/BlogManager.tsx`
- Modify: `frontend/src/lib/api/cms.ts`

**Interfaces:**
- Changes: `cmpApi.publishBlogPost(postId, publishAt?: string)`.
- Restructures: the editor's always-visible aside becomes a slide-over panel opened by the header's Publish button; the main canvas keeps only Title, Excerpt, Content; Slug moves into the panel.

- [ ] **Step 1: Update the API client**

In `frontend/src/lib/api/cms.ts`, change `publishBlogPost`:

```typescript
  publishBlogPost(postId: string, publishAt?: string): Promise<ApiResult<BlogPost>> {
    return apiClient.post<BlogPost>(
      `${CMP_API_PREFIX}/blog/${postId}/publish`,
      publishAt ? { publish_at: publishAt } : undefined
    );
  },
```

- [ ] **Step 2: Add publish-panel state**

In `BlogManager.tsx`, add alongside the other editor-local state:

```typescript
  const [publishPanelOpen, setPublishPanelOpen] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduleAt, setScheduleAt] = useState("");
```

Reset these in `openNewPost` and `openPost` alongside the existing `setShowPreview(false)` etc.: add `setPublishPanelOpen(false); setScheduleMode("now"); setScheduleAt("");`.

- [ ] **Step 3: Compute the "Scheduled" state**

Add this helper near the top of the file (alongside `formatDate`):

```typescript
function isScheduled(status: BlogPostStatus, publishedAt: string | null): boolean {
  return status === "published" && !!publishedAt && new Date(publishedAt) > new Date();
}
```

- [ ] **Step 4: Move the publish action behind the panel**

Replace the header's publish/unpublish button block:

```tsx
              {editor.status === "published" ? (
                <Button
                  variant="outline"
                  leftIcon={<Undo2 className="h-4 w-4" />}
                  loading={editorBusy === "unpublish"}
                  onClick={handleUnpublish}
                >
                  Unpublish
                </Button>
              ) : (
                <Button
                  leftIcon={<Send className="h-4 w-4" />}
                  loading={editorBusy === "publish"}
                  onClick={handlePublish}
                >
                  Publish
                </Button>
              )}
```

with:

```tsx
              {editor.status === "published" ? (
                <>
                  <Button variant="outline" onClick={() => setPublishPanelOpen(true)}>
                    {isScheduled(editor.status, editor.publishedAt) ? "Edit schedule" : "Published settings"}
                  </Button>
                  <Button
                    variant="outline"
                    leftIcon={<Undo2 className="h-4 w-4" />}
                    loading={editorBusy === "unpublish"}
                    onClick={handleUnpublish}
                  >
                    Unpublish
                  </Button>
                </>
              ) : (
                <Button leftIcon={<Send className="h-4 w-4" />} onClick={() => setPublishPanelOpen(true)}>
                  Publish
                </Button>
              )}
```

Also update the status pill right above it to show "Scheduled":

```tsx
              <span
                className={clsx(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  editor.status === "published"
                    ? isScheduled(editor.status, editor.publishedAt)
                      ? "bg-amber-100 text-amber-700"
                      : "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                )}
              >
                {editor.status === "published"
                  ? isScheduled(editor.status, editor.publishedAt)
                    ? `Scheduled for ${formatDate(editor.publishedAt)}`
                    : "Published"
                  : "Draft"}
              </span>
```

(Remove the now-redundant separate `{editor.publishedAt && (..."First published"...)}` block if its date is fully covered by the pill above — leave it as-is otherwise; it's still accurate for already-live posts.)

- [ ] **Step 5: Move Slug into the panel, keep Title/Excerpt/Content in the main canvas**

Remove the "Slug" `<div>` field from the main `<section>` (the one with the `/blog/…` label). It moves into the publish panel added in the next step.

- [ ] **Step 6: Add the publish panel**

Add this JSX right before the closing `</div>` of the editor's outermost `<div className="space-y-5">` (i.e., as a sibling after the `grid gap-5 xl:grid-cols-...` block):

```tsx
        {publishPanelOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-end bg-black/40"
            onClick={() => setPublishPanelOpen(false)}
          >
            <div
              className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">Publish details</h3>
                <Button size="sm" variant="ghost" onClick={() => setPublishPanelOpen(false)}>
                  Close
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Slug <span className="font-normal text-slate-400">(URL: /blog/…)</span>
                  </label>
                  <input
                    value={editor.slug}
                    onChange={(event) => {
                      setSlugTouched(true);
                      updateEditor({ slug: event.target.value });
                    }}
                    placeholder="auto-generated from title"
                    className={fieldClasses("font-mono text-xs")}
                  />
                </div>

                {/* Cover image, Author, Tags, and SEO sections move here verbatim
                    from the old always-visible aside — same JSX, same handlers. */}

                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="mb-3 text-sm font-semibold text-slate-900">When to publish</h3>
                  <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                    {(["now", "later"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setScheduleMode(mode)}
                        className={clsx(
                          "flex-1 rounded-md px-3 py-1 text-xs font-medium transition-colors",
                          scheduleMode === mode
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        )}
                      >
                        {mode === "now" ? "Publish now" : "Schedule for later"}
                      </button>
                    ))}
                  </div>
                  {scheduleMode === "later" && (
                    <input
                      type="datetime-local"
                      value={scheduleAt}
                      onChange={(event) => setScheduleAt(event.target.value)}
                      className={fieldClasses("mt-2")}
                    />
                  )}
                </div>

                <Button
                  className="w-full"
                  loading={editorBusy === "publish"}
                  onClick={async () => {
                    const publishAt =
                      scheduleMode === "later" && scheduleAt
                        ? new Date(scheduleAt).toISOString()
                        : undefined;
                    await handlePublish(publishAt);
                    setPublishPanelOpen(false);
                  }}
                >
                  {scheduleMode === "later" && scheduleAt ? "Schedule post" : "Publish now"}
                </Button>
              </div>
            </div>
          </div>
        )}
```

Move the existing Cover image, Tags, Author (added in Task 3), and SEO `<section>` blocks from the old `<aside>` into the `<div className="space-y-4">` above, replacing the placeholder comment — same JSX, unchanged internals, just relocated. Delete the now-empty `<aside>` and change the grid wrapper from `grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]` to a single column (`space-y-5`) since there's no more sidebar next to the canvas. The "Delete post" section (with its confirm-archive flow) moves into the panel too, at the bottom, below the publish button — still gated on `editor.id`.

- [ ] **Step 7: Update `handlePublish` to accept a target datetime**

Replace `handlePublish`:

```typescript
  async function handlePublish(publishAt?: string) {
    setEditorBusy("publish");
    setMessage(null);
    const saved = await savePost();
    if (saved) {
      const result = await cmpApi.publishBlogPost(saved.id, publishAt);
      if (result.success) {
        setEditor(editorFromPost(result.data));
        setMessage({
          type: "success",
          text: isScheduled(result.data.status, result.data.published_at)
            ? `Scheduled for ${formatDate(result.data.published_at)}`
            : `Published — live at /blog/${result.data.slug}`,
        });
      } else {
        setMessage({ type: "error", text: result.error.message });
      }
    }
    setEditorBusy(null);
  }
```

- [ ] **Step 8: Show "Scheduled" in the post list**

In the posts list row, change the status pill:

```tsx
                  <span
                    className={clsx(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                      post.status === "published"
                        ? isScheduled(post.status, post.published_at)
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    )}
                  >
                    {post.status === "published"
                      ? isScheduled(post.status, post.published_at)
                        ? "Scheduled"
                        : "Published"
                      : "Draft"}
                  </span>
```

- [ ] **Step 9: Verify the build**

Run: `cd frontend && npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 10: Manual verification**

Use the `run` skill to: create a post, click Publish, pick "Schedule for later" with a future date/time, confirm the editor shows "Scheduled for …" and the post list shows a "Scheduled" badge; confirm the post does NOT appear on the public `/blog` page; then reopen the panel, switch to "Publish now", confirm it goes live immediately and appears on `/blog`.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/components/admin/BlogManager.tsx frontend/src/lib/api/cms.ts
git commit -m "feat: move publish details into a publish-time panel with scheduling"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1-3 cover phase 1 (author profiles, fallback, picker UI). Task 4-6 cover phase 2 (endpoint/tab/picker removal, per-article upload). Task 7-8 cover phase 3 (scheduling, publish panel, slug relocation). Phase 4 (visual redesign) is intentionally out of scope for this plan — not yet designed.
- **Ordering:** Task 3 (author picker) depends on Task 1-2 existing; Task 6 depends on Task 5 (prop removed before signature changes); Task 8 depends on Task 3's Author section existing (it gets moved, not rebuilt) and Task 7's backend scheduling API. Execute in the numbered order.
- **Type consistency checked:** `author_profile_id`/`clear_author_profile` names match across schema (Task 1), types (Task 2), and payload (Task 3). `publish_at` matches across schema (Task 7), client method (Task 8 step 1), and call site (Task 8 step 7). `isScheduled(status, publishedAt)` signature is identical at both call sites (editor header, Task 8 step 4; list row, Task 8 step 8).
