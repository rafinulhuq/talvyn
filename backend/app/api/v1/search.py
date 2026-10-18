"""Admin global search endpoint."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies import CurrentActor, owner_scope_for
from app.schemas.search import SearchResponse
from app.services import search_service

router = APIRouter()


@router.get(
    "/",
    response_model=SearchResponse,
    summary="Search candidates, JDs, tests, and results",
)
async def global_search(
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
    query: str = Query(default="", max_length=255),
    limit_per_group: int = Query(default=5, ge=1, le=10),
) -> SearchResponse:
    # Scope results to the caller's own data for USER-role operators; ADMIN+
    # (owner_scope_for -> None) search the whole workspace. Mirrors every other
    # read route — search was the one path that skipped this. Soft-deleted rows
    # are excluded inside the service.
    return await search_service.global_search(
        db,
        query=query,
        limit_per_group=limit_per_group,
        owner_id=owner_scope_for(actor),
    )
