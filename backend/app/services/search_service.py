"""Global search across candidates, JDs, tests, and results.

Scoping (audit A-fix): every query is filtered two ways —
  * ``owner_id`` — when set (a USER-role operator), results are restricted to
    data that operator owns: JDs they uploaded, and candidates/results from
    invitations they sent. ``None`` (ADMIN/SUPER_ADMIN) means workspace-wide.
    This matches owner_scope_for() used by every other read path; search was
    previously unscoped, exposing cross-tenant candidate PII.
  * soft-delete — trashed rows (deleted_at IS NOT NULL) are always excluded,
    for every role. Search was the only read path that returned them.
"""

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.attempt import TestAttempt
from app.db.models.candidate import Candidate, Invitation
from app.db.models.evaluation import Evaluation
from app.db.models.job_description import JdExtractedData, JobDescription
from app.db.models.test import Test
from app.schemas.search import SearchResponse, SearchResult


def _like(value: str) -> str:
    return f"%{value.lower().strip()}%"


async def global_search(
    db: AsyncSession,
    query: str,
    limit_per_group: int = 5,
    owner_id: str | None = None,
) -> SearchResponse:
    q = query.strip()
    items: list[SearchResult] = []

    if not q:
        items.extend(await _recent_candidates(db, limit_per_group, owner_id))
        items.extend(await _recent_jds(db, limit_per_group, owner_id))
        items.extend(await _recent_results(db, limit_per_group, owner_id))
        return SearchResponse(query=q, items=items)

    term = _like(q)
    numeric = int(q) if q.isdigit() else None

    items.extend(await _search_candidates(db, term, numeric, limit_per_group, owner_id))
    items.extend(await _search_jds(db, term, limit_per_group, owner_id))
    items.extend(await _search_tests(db, term, limit_per_group, owner_id))
    items.extend(await _search_results(db, term, numeric, limit_per_group, owner_id))

    return SearchResponse(query=q, items=items)


async def _recent_candidates(
    db: AsyncSession, limit: int, owner_id: str | None
) -> list[SearchResult]:
    stmt = select(Candidate).where(Candidate.deleted_at.is_(None))
    if owner_id is not None:
        stmt = (
            stmt.join(Invitation, Invitation.candidate_id == Candidate.id)
            .where(Invitation.invited_by == owner_id)
            .distinct()
        )
    stmt = stmt.order_by(Candidate.candidate_number.desc()).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [_candidate_result(candidate) for candidate in rows]


async def _search_candidates(
    db: AsyncSession, term: str, numeric: int | None, limit: int, owner_id: str | None
) -> list[SearchResult]:
    filters = [
        func.lower(Candidate.name).like(term),
        func.lower(Candidate.email).like(term),
    ]
    if numeric is not None:
        filters.append(Candidate.candidate_number == numeric)
    stmt = select(Candidate).where(Candidate.deleted_at.is_(None), or_(*filters))
    if owner_id is not None:
        stmt = (
            stmt.join(Invitation, Invitation.candidate_id == Candidate.id)
            .where(Invitation.invited_by == owner_id)
            .distinct()
        )
    stmt = stmt.order_by(Candidate.candidate_number.desc()).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [_candidate_result(candidate) for candidate in rows]


def _candidate_result(candidate: Candidate) -> SearchResult:
    return SearchResult(
        kind="candidate",
        title=f"Candidate #{candidate.candidate_number} · {candidate.name}",
        subtitle=candidate.email,
        href=f"/dashboard/candidates/{candidate.id}",
        meta="Candidate profile",
    )


async def _recent_jds(
    db: AsyncSession, limit: int, owner_id: str | None
) -> list[SearchResult]:
    stmt = (
        select(JobDescription, JdExtractedData)
        .outerjoin(JdExtractedData, JdExtractedData.jd_id == JobDescription.id)
        .where(JobDescription.deleted_at.is_(None))
    )
    if owner_id is not None:
        stmt = stmt.where(JobDescription.uploaded_by == owner_id)
    stmt = stmt.order_by(JobDescription.created_at.desc()).limit(limit)
    rows = await db.execute(stmt)
    return [_jd_result(jd, extracted) for jd, extracted in rows.all()]


async def _search_jds(
    db: AsyncSession, term: str, limit: int, owner_id: str | None
) -> list[SearchResult]:
    stmt = (
        select(JobDescription, JdExtractedData)
        .outerjoin(JdExtractedData, JdExtractedData.jd_id == JobDescription.id)
        .where(
            JobDescription.deleted_at.is_(None),
            or_(
                func.lower(JobDescription.original_filename).like(term),
                func.lower(JobDescription.raw_text).like(term),
                func.lower(JdExtractedData.job_title).like(term),
                func.lower(JdExtractedData.seniority_level).like(term),
            ),
        )
    )
    if owner_id is not None:
        stmt = stmt.where(JobDescription.uploaded_by == owner_id)
    stmt = stmt.order_by(JobDescription.created_at.desc()).limit(limit)
    rows = await db.execute(stmt)
    return [_jd_result(jd, extracted) for jd, extracted in rows.all()]


def _jd_result(jd: JobDescription, extracted: JdExtractedData | None) -> SearchResult:
    title = extracted.job_title if extracted and extracted.job_title else jd.original_filename
    return SearchResult(
        kind="jd",
        title=title,
        subtitle=jd.original_filename,
        href=f"/dashboard/jds/{jd.id}",
        meta="Job description",
    )


async def _search_tests(
    db: AsyncSession, term: str, limit: int, owner_id: str | None
) -> list[SearchResult]:
    stmt = (
        select(Test, JobDescription, JdExtractedData)
        .join(JobDescription, JobDescription.id == Test.jd_id)
        .outerjoin(JdExtractedData, JdExtractedData.jd_id == JobDescription.id)
        .where(
            Test.deleted_at.is_(None),
            JobDescription.deleted_at.is_(None),
            or_(
                func.lower(Test.title).like(term),
                func.lower(Test.description).like(term),
                func.lower(JobDescription.original_filename).like(term),
                func.lower(JdExtractedData.job_title).like(term),
            ),
        )
    )
    if owner_id is not None:
        stmt = stmt.where(JobDescription.uploaded_by == owner_id)
    stmt = stmt.order_by(Test.created_at.desc()).limit(limit)
    rows = await db.execute(stmt)
    items: list[SearchResult] = []
    for test, jd, extracted in rows.all():
        jd_title = extracted.job_title if extracted and extracted.job_title else jd.original_filename
        items.append(
            SearchResult(
                kind="test",
                title=test.title,
                subtitle=jd_title,
                href=f"/dashboard/jds/{jd.id}/tests/{test.id}",
                meta=f"{test.status.value} test",
            )
        )
    return items


async def _recent_results(
    db: AsyncSession, limit: int, owner_id: str | None
) -> list[SearchResult]:
    stmt = (
        select(Evaluation, TestAttempt, Candidate, Test, JobDescription, JdExtractedData)
        .join(TestAttempt, TestAttempt.id == Evaluation.attempt_id)
        .join(Candidate, Candidate.id == TestAttempt.candidate_id)
        .join(Test, Test.id == TestAttempt.test_id)
        .join(Invitation, Invitation.id == TestAttempt.invitation_id)
        .join(JobDescription, JobDescription.id == Invitation.jd_id)
        .outerjoin(JdExtractedData, JdExtractedData.jd_id == JobDescription.id)
        .where(
            Candidate.deleted_at.is_(None),
            Test.deleted_at.is_(None),
            JobDescription.deleted_at.is_(None),
        )
    )
    if owner_id is not None:
        stmt = stmt.where(Invitation.invited_by == owner_id)
    stmt = stmt.order_by(Evaluation.evaluated_at.desc()).limit(limit)
    rows = await db.execute(stmt)
    return [_result_item(*row) for row in rows.all()]


async def _search_results(
    db: AsyncSession, term: str, numeric: int | None, limit: int, owner_id: str | None
) -> list[SearchResult]:
    filters = [
        func.lower(Candidate.name).like(term),
        func.lower(Candidate.email).like(term),
        func.lower(Test.title).like(term),
        func.lower(JobDescription.original_filename).like(term),
        func.lower(JdExtractedData.job_title).like(term),
    ]
    if numeric is not None:
        filters.append(Candidate.candidate_number == numeric)

    stmt = (
        select(Evaluation, TestAttempt, Candidate, Test, JobDescription, JdExtractedData)
        .join(TestAttempt, TestAttempt.id == Evaluation.attempt_id)
        .join(Candidate, Candidate.id == TestAttempt.candidate_id)
        .join(Test, Test.id == TestAttempt.test_id)
        .join(Invitation, Invitation.id == TestAttempt.invitation_id)
        .join(JobDescription, JobDescription.id == Invitation.jd_id)
        .outerjoin(JdExtractedData, JdExtractedData.jd_id == JobDescription.id)
        .where(
            Candidate.deleted_at.is_(None),
            Test.deleted_at.is_(None),
            JobDescription.deleted_at.is_(None),
            or_(*filters),
        )
    )
    if owner_id is not None:
        stmt = stmt.where(Invitation.invited_by == owner_id)
    stmt = stmt.order_by(Evaluation.evaluated_at.desc()).limit(limit)
    rows = await db.execute(stmt)
    return [_result_item(*row) for row in rows.all()]


def _result_item(
    evaluation: Evaluation,
    attempt: TestAttempt,
    candidate: Candidate,
    test: Test,
    jd: JobDescription,
    extracted: JdExtractedData | None,
) -> SearchResult:
    jd_title = extracted.job_title if extracted and extracted.job_title else jd.original_filename
    return SearchResult(
        kind="result",
        title=f"{candidate.name} · {test.title}",
        subtitle=jd_title,
        href=f"/dashboard/results/{attempt.id}",
        meta=f"Candidate #{candidate.candidate_number} · {round(evaluation.percentage)}%",
    )
