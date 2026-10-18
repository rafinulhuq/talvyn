"""
Candidate API endpoints — admin-only.

GET /api/v1/candidates/                    Paginated, searchable candidate directory
GET /api/v1/candidates/{candidate_id}      Profile (basic info + aggregate counts)
GET /api/v1/candidates/{candidate_id}/attempts  Every test attempt this candidate
                                                  has ever started, across every
                                                  JD/invitation they've touched
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies import CurrentActor, owner_scope_for
from app.schemas.candidate import (
    CandidateAttemptsResponse,
    CandidateListResponse,
    CandidateProfileResponse,
)
from app.services import candidate_service

router = APIRouter()


@router.get(
    "/",
    response_model=CandidateListResponse,
    summary="List all candidates (paginated, searchable by name/email)",
)
async def list_candidates(
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None, max_length=255),
) -> CandidateListResponse:
    return await candidate_service.list_candidates(
        db, page=page, page_size=page_size, search=search, owner_id=owner_scope_for(actor)
    )


@router.get(
    "/{candidate_id}",
    response_model=CandidateProfileResponse,
    summary="Get a candidate's profile and aggregate attempt counts",
)
async def get_candidate_profile(
    candidate_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> CandidateProfileResponse:
    return await candidate_service.get_candidate_profile(
        candidate_id, db, owner_id=owner_scope_for(actor)
    )


@router.get(
    "/{candidate_id}/attempts",
    response_model=CandidateAttemptsResponse,
    summary="List every test attempt this candidate has ever started",
)
async def get_candidate_attempts(
    candidate_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> CandidateAttemptsResponse:
    return await candidate_service.get_candidate_attempts(
        candidate_id, db, owner_id=owner_scope_for(actor)
    )


@router.delete(
    "/{candidate_id}",
    status_code=204,
    summary="Soft-delete a candidate (move to Trash)",
)
async def delete_candidate(
    candidate_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> None:
    await candidate_service.delete_candidate(
        candidate_id, db, owner_id=owner_scope_for(actor)
    )
