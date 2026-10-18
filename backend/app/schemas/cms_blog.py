"""Pydantic schemas for the CMP blog."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

BlogPostStatus = Literal["draft", "published"]


class BlogPostCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    slug: str | None = Field(default=None, max_length=255)
    excerpt: str | None = Field(default=None, max_length=500)
    content_md: str = Field(default="", max_length=200_000)
    cover_image_asset_id: str | None = None
    author_profile_id: str | None = None
    tags: list[str] = Field(default_factory=list, max_length=10)
    seo_title: str | None = Field(default=None, max_length=255)
    seo_description: str | None = Field(default=None, max_length=500)


class BlogPostUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = Field(default=None, max_length=255)
    excerpt: str | None = Field(default=None, max_length=500)
    content_md: str | None = Field(default=None, max_length=200_000)
    cover_image_asset_id: str | None = None
    clear_cover_image: bool = False
    author_profile_id: str | None = None
    clear_author_profile: bool = False
    tags: list[str] | None = Field(default=None, max_length=10)
    seo_title: str | None = Field(default=None, max_length=255)
    seo_description: str | None = Field(default=None, max_length=500)


class BlogPostPublishRequest(BaseModel):
    publish_at: datetime | None = None


class BlogPostResponse(BaseModel):
    id: str
    slug: str
    title: str
    excerpt: str | None
    content_md: str
    cover_image_asset_id: str | None
    cover_image_url: str | None
    tags: list[str]
    status: str
    author_id: str | None
    author_profile_id: str | None
    author_name: str | None
    author_avatar_url: str | None
    seo_title: str | None
    seo_description: str | None
    created_at: datetime
    updated_at: datetime
    published_at: datetime | None
    archived_at: datetime | None


class BlogPostSummaryResponse(BaseModel):
    """List entry — everything except the post body."""

    id: str
    slug: str
    title: str
    excerpt: str | None
    cover_image_url: str | None
    tags: list[str]
    status: str
    author_name: str | None
    author_avatar_url: str | None
    created_at: datetime
    updated_at: datetime
    published_at: datetime | None


class BlogPostListResponse(BaseModel):
    items: list[BlogPostSummaryResponse]
    total: int


class PublicBlogPostSummary(BaseModel):
    slug: str
    title: str
    excerpt: str | None
    cover_image_url: str | None
    tags: list[str]
    author_name: str | None
    author_avatar_url: str | None
    published_at: datetime | None
    reading_minutes: int
    claps: int


class PublicBlogPostResponse(PublicBlogPostSummary):
    content_md: str
    seo_title: str | None
    seo_description: str | None


class PublicBlogListResponse(BaseModel):
    items: list[PublicBlogPostSummary]
    total: int


class BlogClapRequest(BaseModel):
    count: int = Field(default=1, ge=1, le=50)


class BlogClapResponse(BaseModel):
    claps: int


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
