"""
Candidate Service — read-only aggregation across a candidate's full history.

A Candidate can be invited to many JDs (one Invitation per JD) and each
Invitation can spawn many TestAttempts (one per approved test). Before this
module existed, there was no single place to see all of a candidate's
attempts — they were only reachable one at a time via the notification bell
or a JD-scoped results page. Every query here keys off
TestAttempt.candidate_id directly rather than joining through Invitation,
since that's the one FK that's stable across however many JDs/invitations a
candidate has touched.
"""

import math
from datetime import UTC, datetime

from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.db.models.attempt import TestAttempt
from app.db.models.candidate import Candidate, Invitation
from app.db.models.enums import AttemptStatus
from app.db.models.evaluation import Evaluation
from app.db.models.job_description import JdExtractedData, JobDescription
from app.db.models.test import Test
from app.schemas.candidate import (
    CandidateAttemptItem,
    CandidateAttemptsResponse,
    CandidateListItem,
    CandidateListResponse,
    CandidateProfileResponse,
)

_COMPLETED_ATTEMPT_STATUSES = [AttemptStatus.SUBMITTED, AttemptStatus.EVALUATED]


# ─── List ───────────────────────────────────────────────────────

async def list_candidates(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    search: str | None = None,
    owner_id: str | None = None,
) -> CandidateListResponse:
    """Paginated candidate directory, newest-registered first, with each
    row's attempt counts and most recent activity pre-aggregated.
    When owner_id is set, only candidates invited by that owner are returned."""
    filters = [Candidate.deleted_at.is_(None)]
    if owner_id is not None:
        filters.append(
            Candidate.id.in_(
                select(Invitation.candidate_id).where(
                    Invitation.invited_by == owner_id
                )
            )
        )
    if search:
        term = f"%{search.lower().strip()}%"
        filters.append(
            or_(func.lower(Candidate.name).like(term), func.lower(Candidate.email).like(term))
        )

    total = (
        await db.execute(select(func.count(Candidate.id)).where(*filters))
    ).scalar_one()

    offset = (page - 1) * page_size
    candidates = (
        await db.execute(
            select(Candidate)
            .where(*filters)
            .order_by(Candidate.candidate_number.desc())
            .offset(offset)
            .limit(page_size)
        )
    ).scalars().all()

    items = await _attach_attempt_summaries(list(candidates), db)

    return CandidateListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
    )


async def _attach_attempt_summaries(
    candidates: list[Candidate], db: AsyncSession
) -> list[CandidateListItem]:
    if not candidates:
        return []

    candidate_ids = [c.id for c in candidates]
    completed_case = case(
        (TestAttempt.status.in_(_COMPLETED_ATTEMPT_STATUSES), 1), else_=0
    )
    agg_rows = await db.execute(
        select(
            TestAttempt.candidate_id,
            func.count(TestAttempt.id),
            func.sum(completed_case),
            func.max(func.coalesce(TestAttempt.submitted_at, TestAttempt.started_at)),
        )
        .where(TestAttempt.candidate_id.in_(candidate_ids))
        .group_by(TestAttempt.candidate_id)
    )
    agg_by_candidate = {
        row[0]: row for row in agg_rows.all()
    }

    items: list[CandidateListItem] = []
    for c in candidates:
        agg = agg_by_candidate.get(c.id)
        total_attempts = agg[1] if agg else 0
        completed_attempts = int(agg[2]) if agg and agg[2] else 0
        last_activity = agg[3] if agg else None
        items.append(
            CandidateListItem(
                id=c.id,
                candidate_number=c.candidate_number,
                name=c.name,
                email=c.email,
                phone=c.phone,
                created_at=c.created_at,
                total_attempts=total_attempts,
                completed_attempts=completed_attempts,
                last_activity_at=last_activity or c.created_at,
            )
        )
    return items


# ─── Profile ──────────────────────────────────────────────────────

async def get_candidate_profile(
    candidate_id: str, db: AsyncSession, *, owner_id: str | None = None
) -> CandidateProfileResponse:
    candidate = await _load_candidate_or_raise(candidate_id, db, owner_id=owner_id)

    inv_filter = [Invitation.candidate_id == candidate_id]
    if owner_id is not None:
        inv_filter.append(Invitation.invited_by == owner_id)
    total_invitations = (
        await db.execute(select(func.count(Invitation.id)).where(*inv_filter))
    ).scalar_one()

    completed_case = case(
        (TestAttempt.status.in_(_COMPLETED_ATTEMPT_STATUSES), 1), else_=0
    )
    attempt_stmt = select(func.count(TestAttempt.id), func.sum(completed_case)).where(
        TestAttempt.candidate_id == candidate_id
    )
    if owner_id is not None:
        # Count only attempts made under this owner's invitations.
        attempt_stmt = attempt_stmt.join(
            Invitation, Invitation.id == TestAttempt.invitation_id
        ).where(Invitation.invited_by == owner_id)
    counts_row = (await db.execute(attempt_stmt)).first()
    total_attempts = counts_row[0] if counts_row else 0
    completed_attempts = int(counts_row[1]) if counts_row and counts_row[1] else 0

    return CandidateProfileResponse(
        id=candidate.id,
        candidate_number=candidate.candidate_number,
        name=candidate.name,
        email=candidate.email,
        phone=candidate.phone,
        linkedin_url=candidate.linkedin_url,
        resume_url=candidate.resume_url,
        created_at=candidate.created_at,
        total_invitations=total_invitations,
        total_attempts=total_attempts,
        completed_attempts=completed_attempts,
    )


# ─── Attempt history ──────────────────────────────────────────────

async def get_candidate_attempts(
    candidate_id: str, db: AsyncSession, *, owner_id: str | None = None
) -> CandidateAttemptsResponse:
    """
    Every test attempt this candidate has ever started or completed, across
    every JD/invitation they've touched — the single place requested in
    place of digging through the notification bell one attempt at a time.
    When owner_id is set, only attempts under that owner's invitations show.
    """
    await _load_candidate_or_raise(candidate_id, db, owner_id=owner_id)

    attempts_stmt = (
        select(TestAttempt, Invitation, Test, JobDescription, JdExtractedData, Evaluation)
        .join(Invitation, Invitation.id == TestAttempt.invitation_id)
        .join(Test, Test.id == TestAttempt.test_id)
        .join(JobDescription, JobDescription.id == Invitation.jd_id)
        .outerjoin(JdExtractedData, JdExtractedData.jd_id == JobDescription.id)
        .outerjoin(Evaluation, Evaluation.attempt_id == TestAttempt.id)
        .where(TestAttempt.candidate_id == candidate_id)
        .order_by(TestAttempt.started_at.desc().nullslast(), TestAttempt.id)
    )
    if owner_id is not None:
        attempts_stmt = attempts_stmt.where(Invitation.invited_by == owner_id)
    rows = await db.execute(attempts_stmt)

    items = [
        CandidateAttemptItem(
            attempt_id=attempt.id,
            invitation_id=invitation.id,
            invitation_status=invitation.status,
            jd_id=jd.id,
            jd_title=(extracted.job_title if extracted and extracted.job_title else jd.original_filename),
            test_id=test.id,
            test_title=test.title,
            attempt_status=attempt.status.value,
            started_at=attempt.started_at,
            submitted_at=attempt.submitted_at,
            has_evaluation=evaluation is not None,
            total_score=evaluation.total_score if evaluation else None,
            max_score=evaluation.max_score if evaluation else None,
            percentage=evaluation.percentage if evaluation else None,
            ai_recommendation=evaluation.ai_recommendation if evaluation else None,
            admin_override_recommendation=(
                evaluation.admin_override_recommendation if evaluation else None
            ),
            integrity_violation_reason=attempt.integrity_violation_reason,
            terminated_at=attempt.terminated_at,
        )
        for attempt, invitation, test, jd, extracted, evaluation in rows.all()
    ]

    return CandidateAttemptsResponse(items=items)


# ─── Private helpers ──────────────────────────────────────────────

async def _load_candidate_or_raise(
    candidate_id: str,
    db: AsyncSession,
    *,
    include_trashed: bool = False,
    owner_id: str | None = None,
) -> Candidate:
    stmt = select(Candidate).where(Candidate.id == candidate_id)
    if not include_trashed:
        stmt = stmt.where(Candidate.deleted_at.is_(None))
    if owner_id is not None:
        # Only visible if this owner invited the candidate.
        stmt = stmt.where(
            Candidate.id.in_(
                select(Invitation.candidate_id).where(
                    Invitation.invited_by == owner_id
                )
            )
        )
    result = await db.execute(stmt)
    candidate = result.scalar_one_or_none()
    if candidate is None:
        raise NotFoundError("Candidate", candidate_id)
    return candidate


# ─── Trash (soft-delete) operations ───────────────────────────

async def delete_candidate(
    candidate_id: str, db: AsyncSession, *, owner_id: str | None = None
) -> None:
    """Soft-delete a candidate: move to trash (set deleted_at). Historical
    attempts/evaluations are retained; the candidate simply disappears from
    the directory until restored or purged. When owner_id is set, only a
    candidate the owner invited can be deleted."""
    candidate = await _load_candidate_or_raise(candidate_id, db, owner_id=owner_id)
    candidate.deleted_at = datetime.now(UTC)
    await db.commit()


async def list_trashed_candidates(db: AsyncSession) -> list[Candidate]:
    """Return candidates currently in the trash, most-recently-deleted first."""
    result = await db.execute(
        select(Candidate)
        .where(Candidate.deleted_at.is_not(None))
        .order_by(Candidate.deleted_at.desc())
    )
    return list(result.scalars().all())


async def restore_candidate(candidate_id: str, db: AsyncSession) -> None:
    """Restore a trashed candidate (clear deleted_at)."""
    candidate = await _load_candidate_or_raise(candidate_id, db, include_trashed=True)
    if candidate.deleted_at is None:
        raise NotFoundError("Candidate", candidate_id)
    candidate.deleted_at = None
    await db.commit()


async def purge_candidate(candidate_id: str, db: AsyncSession) -> None:
    """Permanently delete a trashed candidate. Cascades to their invitations
    (and, through those, attempts/evaluations) via DB constraints."""
    candidate = await _load_candidate_or_raise(candidate_id, db, include_trashed=True)
    if candidate.deleted_at is None:
        raise NotFoundError("Candidate", candidate_id)
    await db.delete(candidate)
    await db.commit()
