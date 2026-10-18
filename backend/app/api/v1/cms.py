"""Superadmin CMP endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ratelimit import limiter
from app.db.session import get_db
from app.dependencies import SuperAdminActor
from app.schemas.cms import (
    CmsContentVersionResponse,
    CmsDocumentListResponse,
    CmsDocumentResponse,
    CmsDocumentUpdateRequest,
    CmsMediaAssetResponse,
    CmsPublicContentResponse,
    CmsPublishResponse,
    CmsRestoreVersionRequest,
    CmsVersionListResponse,
)
from app.schemas.cms_blog import (
    AuthorProfileCreateRequest,
    AuthorProfileListResponse,
    AuthorProfileResponse,
    AuthorProfileUpdateRequest,
    BlogClapRequest,
    BlogClapResponse,
    BlogPostCreateRequest,
    BlogPostListResponse,
    BlogPostPublishRequest,
    BlogPostResponse,
    BlogPostUpdateRequest,
    PublicBlogListResponse,
    PublicBlogPostResponse,
)
from app.services import author_profile_service, blog_service, cms_service
from app.services.file_service import file_service

router = APIRouter()


@router.get("/public/content", response_model=CmsPublicContentResponse)
async def public_content(db: AsyncSession = Depends(get_db)) -> CmsPublicContentResponse:
    return await cms_service.get_public_content(db)


@router.get("/public/blog", response_model=PublicBlogListResponse)
async def public_blog_list(
    db: AsyncSession = Depends(get_db),
    tag: str | None = Query(default=None, max_length=40),
    limit: int = Query(default=9, ge=1, le=24),
    offset: int = Query(default=0, ge=0),
) -> PublicBlogListResponse:
    items, total = await blog_service.list_published_posts(db, tag=tag, limit=limit, offset=offset)
    return PublicBlogListResponse(items=items, total=total)


@router.get("/public/blog/{slug}", response_model=PublicBlogPostResponse)
async def public_blog_post(
    slug: str,
    db: AsyncSession = Depends(get_db),
) -> PublicBlogPostResponse:
    return await blog_service.get_published_post(slug, db)


@router.post("/public/blog/{slug}/clap", response_model=BlogClapResponse)
@limiter.limit("30/minute")
async def clap_blog_post(
    request: Request,
    slug: str,
    req: BlogClapRequest,
    db: AsyncSession = Depends(get_db),
) -> BlogClapResponse:
    return BlogClapResponse(claps=await blog_service.clap_post(slug, req.count, db))


@router.get("/documents", response_model=CmsDocumentListResponse)
async def list_documents(
    _actor: SuperAdminActor,
    db: AsyncSession = Depends(get_db),
) -> CmsDocumentListResponse:
    return CmsDocumentListResponse(items=await cms_service.list_documents(db))


@router.get("/documents/{key}", response_model=CmsDocumentResponse)
async def get_document(
    key: str,
    _actor: SuperAdminActor,
    db: AsyncSession = Depends(get_db),
) -> CmsDocumentResponse:
    return await cms_service.get_document(key, db)


@router.patch("/documents/{key}", response_model=CmsDocumentResponse)
async def update_document(
    key: str,
    req: CmsDocumentUpdateRequest,
    actor: SuperAdminActor,
    db: AsyncSession = Depends(get_db),
) -> CmsDocumentResponse:
    return await cms_service.update_document(key, req.draft_json, actor, db)


@router.post("/documents/{key}/publish", response_model=CmsPublishResponse)
async def publish_document(
    key: str,
    actor: SuperAdminActor,
    db: AsyncSession = Depends(get_db),
) -> CmsPublishResponse:
    document, version = await cms_service.publish_document(key, actor, db)
    return CmsPublishResponse(document=document, version=version)


@router.get("/documents/{key}/versions", response_model=CmsVersionListResponse)
async def list_versions(
    key: str,
    _actor: SuperAdminActor,
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=5, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
) -> CmsVersionListResponse:
    items, total = await cms_service.list_versions(key, db, limit=limit, offset=offset)
    return CmsVersionListResponse(items=items, total=total)


@router.get("/documents/{key}/versions/{version}", response_model=CmsContentVersionResponse)
async def get_version(
    key: str,
    version: int,
    _actor: SuperAdminActor,
    db: AsyncSession = Depends(get_db),
) -> CmsContentVersionResponse:
    return await cms_service.get_version(key, version, db)


@router.post("/documents/{key}/restore-version", response_model=CmsDocumentResponse)
async def restore_version(
    key: str,
    req: CmsRestoreVersionRequest,
    actor: SuperAdminActor,
    db: AsyncSession = Depends(get_db),
) -> CmsDocumentResponse:
    return await cms_service.restore_version(key, req.version, actor, db)


@router.get("/blog", response_model=BlogPostListResponse)
async def list_blog_posts(
    _actor: SuperAdminActor,
    db: AsyncSession = Depends(get_db),
    status: str | None = Query(default=None, pattern="^(draft|published)$"),
    search: str | None = Query(default=None, max_length=255),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> BlogPostListResponse:
    items, total = await blog_service.list_posts(
        db, status=status, search=search, limit=limit, offset=offset
    )
    return BlogPostListResponse(items=items, total=total)


@router.post("/blog", response_model=BlogPostResponse, status_code=201)
async def create_blog_post(
    req: BlogPostCreateRequest,
    actor: SuperAdminActor,
    db: AsyncSession = Depends(get_db),
) -> BlogPostResponse:
    return await blog_service.create_post(req, actor, db)


@router.get("/blog/{post_id}", response_model=BlogPostResponse)
async def get_blog_post(
    post_id: str,
    _actor: SuperAdminActor,
    db: AsyncSession = Depends(get_db),
) -> BlogPostResponse:
    return await blog_service.get_post(post_id, db)


@router.patch("/blog/{post_id}", response_model=BlogPostResponse)
async def update_blog_post(
    post_id: str,
    req: BlogPostUpdateRequest,
    actor: SuperAdminActor,
    db: AsyncSession = Depends(get_db),
) -> BlogPostResponse:
    return await blog_service.update_post(post_id, req, actor, db)


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


@router.post("/blog/{post_id}/unpublish", response_model=BlogPostResponse)
async def unpublish_blog_post(
    post_id: str,
    actor: SuperAdminActor,
    db: AsyncSession = Depends(get_db),
) -> BlogPostResponse:
    return await blog_service.unpublish_post(post_id, actor, db)


@router.delete("/blog/{post_id}", status_code=204)
async def archive_blog_post(
    post_id: str,
    actor: SuperAdminActor,
    db: AsyncSession = Depends(get_db),
) -> None:
    await blog_service.archive_post(post_id, actor, db)


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


@router.post("/media", response_model=CmsMediaAssetResponse, status_code=201)
async def upload_media(
    actor: SuperAdminActor,
    file: UploadFile = File(...),
    title: Annotated[str | None, Form()] = None,
    alt_text: Annotated[str | None, Form()] = None,
    db: AsyncSession = Depends(get_db),
) -> CmsMediaAssetResponse:
    content = await file.read()
    return await cms_service.create_media_asset(
        filename=file.filename or "upload",
        content_type=file.content_type or "application/octet-stream",
        content=content,
        title=title,
        alt_text=alt_text,
        actor=actor,
        db=db,
    )


@router.get("/media/{asset_id}/content")
async def media_content(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
) -> Response:
    asset = await cms_service.get_media_asset(asset_id, db)
    content = await file_service.read_file(asset.storage_key)
    safe_filename = asset.filename.replace('"', "").replace("\r", "").replace("\n", "")
    return Response(
        content=content,
        media_type=asset.content_type,
        headers={
            "Cache-Control": "public, max-age=3600",
            "Content-Disposition": f'inline; filename="{safe_filename}"',
        },
    )
