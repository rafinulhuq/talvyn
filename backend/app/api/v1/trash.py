"""
Unified admin Trash (recycle-bin) API.

Aggregates soft-deleted rows across the entities that support trashing —
job descriptions, tests, candidates, and blog posts — and exposes restore
and permanent-delete (purge) actions for each. Gated on SUPER_ADMIN, matching
the other destructive maintenance endpoints.

Soft-delete semantics live in each entity's service:
  - JDs / tests / candidates use a `deleted_at` timestamp.
  - Blog posts reuse the pre-existing `archived_at` column.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies import SuperAdminActor
from app.schemas.trash import TrashItem, TrashListResponse
from app.services import (
    blog_service,
    candidate_service,
    jd_service,
    test_service,
)

router = APIRouter()


@router.get("", response_model=TrashListResponse, summary="List all trashed items")
async def list_trash(
    _actor: SuperAdminActor,
    db: AsyncSession = Depends(get_db),
) -> TrashListResponse:
    items: list[TrashItem] = []

    for jd in await jd_service.list_trashed_jds(db):
        title = jd.extracted_data.job_title if jd.extracted_data else None
        items.append(
            TrashItem(
                entity_type="jd",
                id=jd.id,
                label=title or jd.original_filename,
                sublabel=jd.original_filename if title else None,
                deleted_at=jd.deleted_at,
            )
        )

    for test in await test_service.list_trashed_tests(db):
        items.append(
            TrashItem(
                entity_type="test",
                id=test.id,
                label=test.title,
                sublabel=test.test_type.value if test.test_type else None,
                deleted_at=test.deleted_at,
            )
        )

    for cand in await candidate_service.list_trashed_candidates(db):
        items.append(
            TrashItem(
                entity_type="candidate",
                id=cand.id,
                label=cand.name,
                sublabel=cand.email,
                deleted_at=cand.deleted_at,
            )
        )

    for post in await blog_service.list_archived_post_rows(db):
        items.append(
            TrashItem(
                entity_type="blog",
                id=post.id,
                label=post.title,
                sublabel=post.slug,
                deleted_at=post.archived_at,
            )
        )

    # Most-recently-trashed first across all entity types.
    items.sort(key=lambda i: i.deleted_at, reverse=True)
    return TrashListResponse(items=items, total=len(items))


@router.post(
    "/{entity_type}/{item_id}/restore",
    status_code=204,
    summary="Restore a trashed item",
)
async def restore_item(
    entity_type: str,
    item_id: str,
    actor: SuperAdminActor,
    db: AsyncSession = Depends(get_db),
) -> None:
    if entity_type == "jd":
        await jd_service.restore_jd(item_id, db)
    elif entity_type == "test":
        await test_service.restore_test(item_id, db)
    elif entity_type == "candidate":
        await candidate_service.restore_candidate(item_id, db)
    elif entity_type == "blog":
        await blog_service.restore_post(item_id, actor, db)
    else:
        raise HTTPException(status_code=404, detail=f"Unknown entity type '{entity_type}'")


@router.delete(
    "/{entity_type}/{item_id}",
    status_code=204,
    summary="Permanently delete (purge) a trashed item",
)
async def purge_item(
    entity_type: str,
    item_id: str,
    actor: SuperAdminActor,
    db: AsyncSession = Depends(get_db),
) -> None:
    if entity_type == "jd":
        await jd_service.purge_jd(item_id, db)
    elif entity_type == "test":
        await test_service.purge_test(item_id, db)
    elif entity_type == "candidate":
        await candidate_service.purge_candidate(item_id, db)
    elif entity_type == "blog":
        await blog_service.purge_post(item_id, actor, db)
    else:
        raise HTTPException(status_code=404, detail=f"Unknown entity type '{entity_type}'")
