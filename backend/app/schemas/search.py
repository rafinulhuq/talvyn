"""Schemas for admin global search."""

from pydantic import BaseModel, Field


class SearchResult(BaseModel):
    kind: str = Field(description="Result category: candidate, jd, test, or result.")
    title: str
    subtitle: str | None = None
    href: str
    meta: str | None = None


class SearchResponse(BaseModel):
    query: str
    items: list[SearchResult]
