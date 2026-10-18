"""
GET /api/v1/stats — aggregate counts for the admin dashboard.
GET /api/v1/stats/completions — recent test completions for notifications.
GET /api/v1/stats/pipeline — candidate funnel counts for the dashboard.
GET /api/v1/stats/timeline — daily activity counts for the dashboard chart.
GET /api/v1/stats/roles — top job titles by completion rate.
"""

from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies import CurrentActor, owner_scope_for

router = APIRouter()


class DashboardStats(BaseModel):
    jd_count: int
    test_count: int
    invitation_count: int
    evaluation_count: int


@router.get(
    "/",
    response_model=DashboardStats,
    summary="Aggregate counts for the admin dashboard",
)
async def get_stats(
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> DashboardStats:
    from app.db.models.attempt import TestAttempt
    from app.db.models.candidate import Invitation
    from app.db.models.evaluation import Evaluation
    from app.db.models.job_description import JobDescription
    from app.db.models.test import Test

    owner_id = owner_scope_for(actor)

    jd_stmt = select(func.count(JobDescription.id))
    test_stmt = select(func.count(Test.id))
    inv_stmt = select(func.count(Invitation.id))
    eval_stmt = select(func.count(Evaluation.id))
    if owner_id is not None:
        jd_stmt = jd_stmt.where(JobDescription.uploaded_by == owner_id)
        test_stmt = test_stmt.join(
            JobDescription, Test.jd_id == JobDescription.id
        ).where(JobDescription.uploaded_by == owner_id)
        inv_stmt = inv_stmt.where(Invitation.invited_by == owner_id)
        eval_stmt = (
            eval_stmt.join(TestAttempt, TestAttempt.id == Evaluation.attempt_id)
            .join(Invitation, Invitation.id == TestAttempt.invitation_id)
            .where(Invitation.invited_by == owner_id)
        )

    # AsyncSession is not safe for concurrent queries on the same connection —
    # run sequentially; these are cheap COUNT(*) queries.
    jd_count   = (await db.execute(jd_stmt)).scalar_one() or 0
    test_count = (await db.execute(test_stmt)).scalar_one() or 0
    inv_count  = (await db.execute(inv_stmt)).scalar_one() or 0
    eval_count = (await db.execute(eval_stmt)).scalar_one() or 0

    return DashboardStats(
        jd_count=jd_count,
        test_count=test_count,
        invitation_count=inv_count,
        evaluation_count=eval_count,
    )


# ─── Recent completions (for notifications) ───────────────────

class CompletionItem(BaseModel):
    attempt_id: str
    candidate_id: str
    candidate_number: int
    candidate_name: str
    candidate_email: str
    jd_id: str
    jd_title: str
    submitted_at: datetime
    has_evaluation: bool


class CompletionsResponse(BaseModel):
    items: list[CompletionItem]


@router.get(
    "/completions",
    response_model=CompletionsResponse,
    summary="Recent test completions for admin notifications",
)
async def get_completions(
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
    days: int = Query(default=7, ge=1, le=30),
    limit: int = Query(default=50, ge=1, le=200),
) -> CompletionsResponse:
    """
    Returns test attempts submitted within the last `days` days, newest first.
    Used by the admin notification bell — the frontend filters out already-seen
    items using localStorage.
    """
    from app.db.models.attempt import TestAttempt
    from app.db.models.candidate import Candidate, Invitation
    from app.db.models.enums import AttemptStatus
    from app.db.models.evaluation import Evaluation
    from app.db.models.job_description import JdExtractedData, JobDescription

    since = datetime.now(tz=UTC) - timedelta(days=days)

    rows = await db.execute(
        select(
            TestAttempt.id,
            TestAttempt.submitted_at,
            Candidate.id.label("candidate_id"),
            Candidate.candidate_number,
            Candidate.name,
            Candidate.email,
            Invitation.jd_id,
            JdExtractedData.job_title,
            JobDescription.original_filename,
            func.count(Evaluation.id).label("eval_count"),
        )
        .join(Invitation, TestAttempt.invitation_id == Invitation.id)
        .join(Candidate, TestAttempt.candidate_id == Candidate.id)
        .join(JobDescription, Invitation.jd_id == JobDescription.id)
        .outerjoin(JdExtractedData, JdExtractedData.jd_id == JobDescription.id)
        .outerjoin(Evaluation, Evaluation.attempt_id == TestAttempt.id)
        .where(
            TestAttempt.status.in_([AttemptStatus.SUBMITTED, AttemptStatus.EVALUATED]),
            TestAttempt.submitted_at >= since,
            *(
                [Invitation.invited_by == owner_scope_for(actor)]
                if owner_scope_for(actor) is not None
                else []
            ),
        )
        .group_by(
            TestAttempt.id,
            TestAttempt.submitted_at,
            Candidate.id,
            Candidate.candidate_number,
            Candidate.name,
            Candidate.email,
            Invitation.jd_id,
            JdExtractedData.job_title,
            JobDescription.original_filename,
        )
        .order_by(TestAttempt.submitted_at.desc())
        .limit(limit)
    )

    items = [
        CompletionItem(
            attempt_id=row.id,
            candidate_id=row.candidate_id,
            candidate_number=row.candidate_number,
            candidate_name=row.name,
            candidate_email=row.email,
            jd_id=row.jd_id,
            jd_title=row.job_title or row.original_filename,
            submitted_at=row.submitted_at,
            has_evaluation=row.eval_count > 0,
        )
        for row in rows.all()
    ]

    return CompletionsResponse(items=items)


# ─── Needs attention (for the dashboard) ──────────────────────

class AttentionItem(BaseModel):
    kind: str
    severity: str  # "info" | "warning" | "danger"
    count: int
    title: str
    description: str
    href: str


class AttentionResponse(BaseModel):
    items: list[AttentionItem]


def _plural(count: int, singular: str, plural: str) -> str:
    return singular if count == 1 else plural


@router.get(
    "/attention",
    response_model=AttentionResponse,
    summary="Actionable items needing admin attention, for the dashboard",
)
async def get_attention(
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> AttentionResponse:
    """
    Cheap aggregate counts the dashboard turns into "needs attention" cards.
    Only non-zero items are returned — an empty list means "all caught up."
    Does NOT include system health checks; the frontend fetches those
    separately from /health/ready (which intentionally returns a non-2xx
    status when degraded, so it can't be folded into this endpoint without
    losing that signal).
    """
    from app.db.models.attempt import TestAttempt
    from app.db.models.candidate import Invitation
    from app.db.models.enums import AttemptStatus, InvitationStatus, TestStatus
    from app.db.models.job_description import JobDescription
    from app.db.models.test import Test

    items: list[AttentionItem] = []
    owner_id = owner_scope_for(actor)

    draft_test_stmt = select(func.count(Test.id)).where(Test.status == TestStatus.DRAFT)
    if owner_id is not None:
        draft_test_stmt = draft_test_stmt.join(
            JobDescription, Test.jd_id == JobDescription.id
        ).where(JobDescription.uploaded_by == owner_id)
    draft_test_count = (await db.execute(draft_test_stmt)).scalar_one() or 0
    if draft_test_count:
        items.append(
            AttentionItem(
                kind="draft_tests",
                severity="warning",
                count=draft_test_count,
                title=f"{draft_test_count} {_plural(draft_test_count, 'test', 'tests')} awaiting approval",
                description="Generated tests must be approved before candidates can be invited.",
                href="/dashboard/jds",
            )
        )

    pending_eval_stmt = select(func.count(TestAttempt.id)).where(
        TestAttempt.status == AttemptStatus.SUBMITTED
    )
    if owner_id is not None:
        pending_eval_stmt = pending_eval_stmt.join(
            Invitation, Invitation.id == TestAttempt.invitation_id
        ).where(Invitation.invited_by == owner_id)
    pending_eval_count = (await db.execute(pending_eval_stmt)).scalar_one() or 0
    if pending_eval_count:
        items.append(
            AttentionItem(
                kind="pending_evaluation",
                severity="warning",
                count=pending_eval_count,
                title=(
                    f"{pending_eval_count} "
                    f"{_plural(pending_eval_count, 'submission', 'submissions')} awaiting evaluation"
                ),
                description="Candidates have submitted tests that haven't been AI-evaluated yet.",
                href="/dashboard/results?status=SUBMITTED",
            )
        )

    # Only count invitations from the email-send flow (single/bulk invite).
    # Public-link self-registrations never send email by design, so they
    # must not be counted as a delivery failure.
    email_failure_stmt = select(func.count(Invitation.id)).where(
        Invitation.status == InvitationStatus.PENDING,
        Invitation.email_sent_at.is_(None),
        Invitation.public_link_id.is_(None),
    )
    if owner_id is not None:
        email_failure_stmt = email_failure_stmt.where(
            Invitation.invited_by == owner_id
        )
    email_failure_count = (await db.execute(email_failure_stmt)).scalar_one() or 0
    if email_failure_count:
        items.append(
            AttentionItem(
                kind="email_failures",
                severity="danger",
                count=email_failure_count,
                title=(
                    f"{email_failure_count} invitation "
                    f"{_plural(email_failure_count, 'email', 'emails')} may not have been delivered"
                ),
                description="Email sending failed or is unconfirmed — share the magic link manually.",
                href="/dashboard/candidates",
            )
        )

    jds_without_tests_stmt = select(func.count(JobDescription.id)).where(
        ~JobDescription.id.in_(select(Test.jd_id).distinct())
    )
    if owner_id is not None:
        jds_without_tests_stmt = jds_without_tests_stmt.where(
            JobDescription.uploaded_by == owner_id
        )
    jds_without_tests_count = (await db.execute(jds_without_tests_stmt)).scalar_one() or 0
    if jds_without_tests_count:
        items.append(
            AttentionItem(
                kind="jds_without_tests",
                severity="info",
                count=jds_without_tests_count,
                title=(
                    f"{jds_without_tests_count} job "
                    f"{_plural(jds_without_tests_count, 'description', 'descriptions')} without generated tests"
                ),
                description="Generate assessments so these job descriptions can be used to invite candidates.",
                href="/dashboard/jds",
            )
        )

    return AttentionResponse(items=items)


# ─── Candidate pipeline funnel (for the dashboard) ────────────

class PipelineStage(BaseModel):
    key: str
    label: str
    count: int


class PipelineResponse(BaseModel):
    stages: list[PipelineStage]


@router.get(
    "/pipeline",
    response_model=PipelineResponse,
    summary="Candidate funnel counts (invited -> started -> submitted -> reviewed -> recommended/rejected)",
)
async def get_pipeline(
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> PipelineResponse:
    from app.db.models.attempt import TestAttempt
    from app.db.models.candidate import Invitation
    from app.db.models.enums import AIRecommendation, AttemptStatus
    from app.db.models.evaluation import Evaluation

    owner_id = owner_scope_for(actor)

    def _scope_attempts(stmt):
        if owner_id is None:
            return stmt
        return stmt.join(
            Invitation, Invitation.id == TestAttempt.invitation_id
        ).where(Invitation.invited_by == owner_id)

    def _scope_evals(stmt):
        if owner_id is None:
            return stmt
        return (
            stmt.join(TestAttempt, TestAttempt.id == Evaluation.attempt_id)
            .join(Invitation, Invitation.id == TestAttempt.invitation_id)
            .where(Invitation.invited_by == owner_id)
        )

    invited_stmt = select(func.count(Invitation.id))
    if owner_id is not None:
        invited_stmt = invited_stmt.where(Invitation.invited_by == owner_id)
    invited = (await db.execute(invited_stmt)).scalar_one() or 0

    started = (await db.execute(_scope_attempts(
        select(func.count(TestAttempt.id)).where(
            TestAttempt.status != AttemptStatus.NOT_STARTED
        )
    ))).scalar_one() or 0

    in_progress = (await db.execute(_scope_attempts(
        select(func.count(TestAttempt.id)).where(
            TestAttempt.status == AttemptStatus.IN_PROGRESS
        )
    ))).scalar_one() or 0

    submitted = (await db.execute(_scope_attempts(
        select(func.count(TestAttempt.id)).where(
            TestAttempt.status.in_([AttemptStatus.SUBMITTED, AttemptStatus.EVALUATED])
        )
    ))).scalar_one() or 0

    reviewed = (await db.execute(_scope_evals(select(func.count(Evaluation.id))))).scalar_one() or 0

    # The admin override, when present, supersedes the AI's recommendation —
    # same precedence rule the results pages use when displaying a verdict.
    effective_recommendation = func.coalesce(
        Evaluation.admin_override_recommendation, Evaluation.ai_recommendation
    )

    recommended = (await db.execute(_scope_evals(
        select(func.count(Evaluation.id)).where(
            effective_recommendation.in_(
                [AIRecommendation.STRONG_HIRE, AIRecommendation.HIRE]
            )
        )
    ))).scalar_one() or 0

    rejected = (await db.execute(_scope_evals(
        select(func.count(Evaluation.id)).where(
            effective_recommendation == AIRecommendation.NO_HIRE
        )
    ))).scalar_one() or 0

    return PipelineResponse(
        stages=[
            PipelineStage(key="invited", label="Invited", count=invited),
            PipelineStage(key="started", label="Started", count=started),
            PipelineStage(key="in_progress", label="In Progress", count=in_progress),
            PipelineStage(key="submitted", label="Submitted", count=submitted),
            PipelineStage(key="reviewed", label="Reviewed", count=reviewed),
            PipelineStage(key="recommended", label="Recommended", count=recommended),
            PipelineStage(key="rejected", label="Rejected", count=rejected),
        ]
    )


# ─── Daily activity timeline (for the dashboard chart) ────────

class TimelinePoint(BaseModel):
    date: date
    invitations: int
    started: int
    submitted: int
    evaluated: int


class TimelineResponse(BaseModel):
    points: list[TimelinePoint]


@router.get(
    "/timeline",
    response_model=TimelineResponse,
    summary="Daily counts of invitations/starts/submissions/evaluations for the dashboard chart",
)
async def get_timeline(
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
    days: int = Query(default=14, ge=2, le=90),
) -> TimelineResponse:
    from app.db.models.attempt import TestAttempt
    from app.db.models.candidate import Invitation
    from app.db.models.evaluation import Evaluation

    owner_id = owner_scope_for(actor)
    today = datetime.now(tz=UTC).date()
    since = today - timedelta(days=days - 1)
    since_dt = datetime.combine(since, datetime.min.time(), tzinfo=UTC)

    buckets: dict[date, dict[str, int]] = {
        since + timedelta(days=i): {"invitations": 0, "started": 0, "submitted": 0, "evaluated": 0}
        for i in range(days)
    }

    async def _count_by_day(column, since_value: datetime, scope=None) -> list[tuple[date, int]]:
        day_expr = func.date(column)
        stmt = select(day_expr.label("day"), func.count()).where(column >= since_value)
        if scope is not None and owner_id is not None:
            stmt = scope(stmt)
        stmt = stmt.group_by(day_expr)
        rows = await db.execute(stmt)
        return [(row.day, row[1]) for row in rows.all()]

    def _scope_attempts(stmt):
        return stmt.join(
            Invitation, Invitation.id == TestAttempt.invitation_id
        ).where(Invitation.invited_by == owner_id)

    def _scope_evals(stmt):
        return (
            stmt.join(TestAttempt, TestAttempt.id == Evaluation.attempt_id)
            .join(Invitation, Invitation.id == TestAttempt.invitation_id)
            .where(Invitation.invited_by == owner_id)
        )

    def _scope_invitations(stmt):
        return stmt.where(Invitation.invited_by == owner_id)

    for day, count in await _count_by_day(Invitation.created_at, since_dt, _scope_invitations):
        if day in buckets:
            buckets[day]["invitations"] = count
    for day, count in await _count_by_day(TestAttempt.started_at, since_dt, _scope_attempts):
        if day in buckets:
            buckets[day]["started"] = count
    for day, count in await _count_by_day(TestAttempt.submitted_at, since_dt, _scope_attempts):
        if day in buckets:
            buckets[day]["submitted"] = count
    for day, count in await _count_by_day(Evaluation.evaluated_at, since_dt, _scope_evals):
        if day in buckets:
            buckets[day]["evaluated"] = count

    points = [
        TimelinePoint(date=day, **buckets[day])
        for day in sorted(buckets)
    ]
    return TimelineResponse(points=points)


# ─── Top roles by completion rate (for the dashboard) ─────────

class RoleCompletion(BaseModel):
    jd_id: str
    title: str
    invited_count: int
    completed_count: int
    completion_rate: float


class RolesResponse(BaseModel):
    roles: list[RoleCompletion]


@router.get(
    "/roles",
    response_model=RolesResponse,
    summary="Top job descriptions by candidate completion rate",
)
async def get_roles(
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=5, ge=1, le=20),
) -> RolesResponse:
    from app.db.models.attempt import TestAttempt
    from app.db.models.candidate import Invitation
    from app.db.models.enums import AttemptStatus
    from app.db.models.job_description import JdExtractedData, JobDescription

    owner_id = owner_scope_for(actor)
    completed_count = func.count(
        case((TestAttempt.status.in_([AttemptStatus.SUBMITTED, AttemptStatus.EVALUATED]), 1))
    )
    invited_count = func.count(Invitation.id)

    roles_stmt = (
        select(
            JobDescription.id,
            JdExtractedData.job_title,
            JobDescription.original_filename,
            invited_count.label("invited_count"),
            completed_count.label("completed_count"),
        )
        .join(Invitation, Invitation.jd_id == JobDescription.id)
        .outerjoin(JdExtractedData, JdExtractedData.jd_id == JobDescription.id)
        .outerjoin(TestAttempt, TestAttempt.invitation_id == Invitation.id)
        .group_by(JobDescription.id, JdExtractedData.job_title, JobDescription.original_filename)
        .having(invited_count > 0)
    )
    if owner_id is not None:
        roles_stmt = roles_stmt.where(JobDescription.uploaded_by == owner_id)
    rows = await db.execute(roles_stmt)

    roles = [
        RoleCompletion(
            jd_id=row.id,
            title=row.job_title or row.original_filename,
            invited_count=row.invited_count,
            completed_count=row.completed_count,
            completion_rate=round(row.completed_count / row.invited_count * 100, 1),
        )
        for row in rows.all()
    ]
    roles.sort(key=lambda r: r.completion_rate, reverse=True)
    return RolesResponse(roles=roles[:limit])
