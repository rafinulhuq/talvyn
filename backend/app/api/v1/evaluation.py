"""
Evaluation API endpoints.

POST   /api/v1/evaluation/trigger              Trigger evaluation for an attempt
GET    /api/v1/evaluation/{attempt_id}         Get evaluation by attempt ID
GET    /api/v1/evaluation/{attempt_id}/summary Lightweight summary
PATCH  /api/v1/evaluation/{attempt_id}/override Admin override recommendation/notes

All endpoints require X-Internal-Token (admin-only via Next.js).
"""

from datetime import date

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import (
    AIResponseParseError,
    AIServiceError,
    ConflictError,
    NotFoundError,
)
from app.core.logging import get_logger
from app.core.ratelimit import limiter
from app.db.models.attempt import CandidateAnswer, TestAttempt
from app.db.models.enums import AttemptStatus, Role
from app.db.models.evaluation import Evaluation, QuestionFeedback
from app.db.models.test import Question
from app.db.session import get_db
from app.dependencies import ActorId, CurrentActor, owner_scope_for
from app.schemas.evaluation import (
    AdminOverrideRequest,
    AdminQuestionScoreRequest,
    EvaluationListResponse,
    EvaluationResponse,
    EvaluationSummaryResponse,
    GlobalLeaderboardResponse,
    LeaderboardResponse,
    QuestionFeedbackResponse,
    ResultsInboxResponse,
    SimilarEvaluationItem,
    SimilarEvaluationsResponse,
    SystemReportResponse,
    TriggerEvaluationRequest,
)
from app.services import audit_log_service, evaluation_service

logger = get_logger(__name__)
router = APIRouter()


# ─── List (paginated) ─────────────────────────────────────────

@router.get(
    "/",
    response_model=EvaluationListResponse,
    summary="List all evaluations, newest first (paginated)",
)
async def list_evaluations(
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> EvaluationListResponse:
    """
    Returns lightweight evaluation summaries (no per-question breakdown).
    Ordered by evaluated_at descending — most recent first.
    """
    data = await evaluation_service.list_evaluations(
        db, page=page, page_size=page_size, owner_id=owner_scope_for(actor)
    )
    return EvaluationListResponse(
        items=data["items"],
        total=data["total"],
        page=data["page"],
        page_size=data["page_size"],
        total_pages=data["total_pages"],
    )


# ─── Results Inbox (cross-JD, filterable) ──────────────────────

@router.get(
    "/inbox",
    response_model=ResultsInboxResponse,
    summary="Results Inbox — filterable cross-JD list of concluded attempts",
)
async def get_results_inbox(
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None, max_length=255),
    jd_id: str | None = Query(default=None),
    status: str | None = Query(default=None, pattern="^(SUBMITTED|EVALUATED|TERMINATED)$"),
    recommendation: str | None = Query(
        default=None, pattern="^(STRONG_HIRE|HIRE|MAYBE|NO_HIRE)$"
    ),
    integrity: str | None = Query(default=None, pattern="^(clean|violation)$"),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
) -> ResultsInboxResponse:
    """
    Default landing view for the admin Results page — recent candidate
    attempts across every JD, not scoped to one JD first. Includes attempts
    that are submitted-but-not-yet-evaluated and terminated for integrity
    violations, so this is the single place admins check "what needs review."
    """
    data = await evaluation_service.list_inbox(
        db,
        page=page,
        page_size=page_size,
        search=search,
        jd_id=jd_id,
        status=status,
        recommendation=recommendation,
        integrity=integrity,
        date_from=date_from,
        date_to=date_to,
        owner_id=owner_scope_for(actor),
    )
    return ResultsInboxResponse(**data)


# ─── Trigger ──────────────────────────────────────────────────

@router.post(
    "/trigger",
    response_model=EvaluationResponse,
    status_code=201,
    summary="Trigger AI evaluation for a submitted attempt",
)
@limiter.limit("5/minute")
async def trigger_evaluation(
    request: Request,
    req: TriggerEvaluationRequest,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
):
    """
    Run MCQ auto-scoring + Ollama open-ended evaluation.

    - Requires attempt status == SUBMITTED
    - Idempotent: re-running replaces the previous evaluation
    - Synchronous: waits for all Ollama calls to complete
    - Returns full evaluation with per-question feedback

    Expected duration: 30–120 seconds depending on hardware and
    number of open-ended questions.
    """
    await evaluation_service.assert_attempt_owner(req.attempt_id, db, owner_scope_for(actor))
    try:
        evaluation = await evaluation_service.evaluate_attempt(
            req.attempt_id, db
        )
        return await _load_full_evaluation(evaluation.id, db)

    except (AIServiceError, AIResponseParseError) as exc:
        error_code = (
            "AI_SERVICE_UNAVAILABLE"
            if isinstance(exc, AIServiceError)
            else "AI_PARSE_ERROR"
        )
        status_code = 503 if isinstance(exc, AIServiceError) else 502
        logger.error(
            "Evaluation failed",
            attempt_id=req.attempt_id,
            error=str(exc),
            code=error_code,
        )
        return JSONResponse(
            status_code=status_code,
            content={
                "attempt_id": req.attempt_id,
                "error_code": error_code,
                "message": str(exc),
            },
        )


# ─── Leaderboard ─────────────────────────────────────────────
# IMPORTANT: These literal-path routes MUST be registered before /{attempt_id}.
# FastAPI matches routes in registration order; /{attempt_id} would otherwise
# swallow any single-segment path like /leaderboard or /system-report.

@router.get(
    "/leaderboard",
    response_model=GlobalLeaderboardResponse,
    summary="Global leaderboard — all evaluated candidates across every JD",
)
async def get_global_leaderboard(
    actor: CurrentActor,
    user_id: str | None = Query(None, description="Filter by user/recruiter ID (superadmin only)"),
    company: str | None = Query(None, description="Filter by company name (superadmin only)"),
    db: AsyncSession = Depends(get_db),
) -> GlobalLeaderboardResponse:
    # Combined multi-company leaderboard and company filtering is strictly for SUPER_ADMIN only
    is_superadmin = actor is not None and actor.role == Role.SUPER_ADMIN
    if is_superadmin:
        effective_owner = user_id
        effective_company = company
    elif actor is not None:
        effective_owner = owner_scope_for(actor)
        effective_company = None
    else:
        effective_owner = None
        effective_company = None

    data = await evaluation_service.get_global_leaderboard(
        db, owner_id=effective_owner, company_name=effective_company
    )
    return GlobalLeaderboardResponse(**data)


@router.get(
    "/leaderboard/{jd_id}",
    response_model=LeaderboardResponse,
    summary="Ranked leaderboard of all candidates evaluated for a JD",
)
async def get_leaderboard(
    jd_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> LeaderboardResponse:
    data = await evaluation_service.get_leaderboard(jd_id, db, owner_id=owner_scope_for(actor))
    return LeaderboardResponse(**data)


# ─── System report ────────────────────────────────────────────

@router.get(
    "/system-report/{jd_id}",
    response_model=SystemReportResponse,
    summary="Aggregate analytics for all candidates evaluated for a JD",
)
async def get_system_report_route(
    jd_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> SystemReportResponse:
    data = await evaluation_service.get_system_report(jd_id, db, owner_id=owner_scope_for(actor))
    return SystemReportResponse(**data)


@router.get(
    "/system-report/{jd_id}/export",
    summary="Export the JD-level aggregate report as DOCX",
)
async def export_system_report(
    jd_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
):
    """Downloadable JD-level report: aggregate analytics + ranked candidate roster."""
    from app.services.export_service import build_jd_report_docx

    _owner = owner_scope_for(actor)
    report = await evaluation_service.get_system_report(jd_id, db, owner_id=_owner)
    leaderboard = await evaluation_service.get_leaderboard(jd_id, db, owner_id=_owner)
    docx_bytes = await build_jd_report_docx(report, leaderboard)

    slug = "".join(c if c.isalnum() else "_" for c in (report.get("job_title") or "job"))[:40].strip("_")
    filename = f"jd_report_{slug or jd_id[:8]}.docx"
    return StreamingResponse(
        iter([docx_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── Get full evaluation ──────────────────────────────────────

@router.get(
    "/{attempt_id}",
    response_model=EvaluationResponse,
    summary="Get full evaluation with per-question feedback",
)
async def get_evaluation(
    attempt_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> EvaluationResponse:
    await evaluation_service.assert_attempt_owner(attempt_id, db, owner_scope_for(actor))
    # A terminated attempt was never submitted, so it will never have an
    # Evaluation row — surface a distinct error_code so the admin UI can show
    # "Terminated — not evaluated" instead of a generic 404/"Run Evaluation".
    attempt_result = await db.execute(
        select(TestAttempt.status).where(TestAttempt.id == attempt_id)
    )
    attempt_status = attempt_result.scalar_one_or_none()
    if attempt_status == AttemptStatus.TERMINATED:
        raise ConflictError(
            "This attempt was terminated due to an integrity violation and "
            "was never submitted, so it cannot be evaluated.",
            error_code="ATTEMPT_TERMINATED",
        )
    return await _load_full_evaluation_by_attempt(attempt_id, db)


# ─── Summary ──────────────────────────────────────────────────

@router.get(
    "/{attempt_id}/summary",
    response_model=EvaluationSummaryResponse,
    summary="Get lightweight evaluation summary",
)
async def get_evaluation_summary(
    attempt_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> EvaluationSummaryResponse:
    await evaluation_service.assert_attempt_owner(attempt_id, db, owner_scope_for(actor))
    result = await db.execute(
        select(Evaluation).where(Evaluation.attempt_id == attempt_id)
    )
    evaluation = result.scalar_one_or_none()
    if evaluation is None:
        raise NotFoundError("Evaluation", attempt_id)

    return EvaluationSummaryResponse.model_validate(evaluation)


# ─── Admin override ───────────────────────────────────────────

@router.patch(
    "/{attempt_id}/override",
    response_model=EvaluationResponse,
    summary="Admin overrides AI recommendation and/or adds notes",
)
async def override_evaluation(
    attempt_id: str,
    req: AdminOverrideRequest,
    actor: CurrentActor,
    actor_id: ActorId,
    db: AsyncSession = Depends(get_db),
) -> EvaluationResponse:
    await evaluation_service.assert_attempt_owner(attempt_id, db, owner_scope_for(actor))
    """
    The admin can:
    - Override the AI recommendation (STRONG_HIRE / HIRE / MAYBE / NO_HIRE)
    - Add private notes for the hiring team
    - Set override to null to remove a previous override

    The original AI recommendation and is_preliminary flag are never modified.
    """
    result = await db.execute(
        select(Evaluation).where(Evaluation.attempt_id == attempt_id)
    )
    evaluation = result.scalar_one_or_none()
    if evaluation is None:
        raise NotFoundError("Evaluation", attempt_id)

    if req.recommendation is not None:
        from app.db.models.enums import AIRecommendation
        evaluation.admin_override_recommendation = AIRecommendation(req.recommendation)
    elif req.recommendation is None and "recommendation" in req.model_fields_set:
        # Explicit null → clear override
        evaluation.admin_override_recommendation = None

    if req.notes is not None:
        evaluation.admin_notes = req.notes

    await audit_log_service.record(
        db,
        actor_id=actor_id,
        action="EVALUATION_OVERRIDDEN",
        target_type="evaluation",
        target_id=evaluation.id,
        summary=f"Set recommendation override to {req.recommendation}" if req.recommendation else "Cleared recommendation override",
        details={"recommendation": req.recommendation, "notes_changed": req.notes is not None},
    )

    await db.commit()
    logger.info(
        "Admin override saved",
        attempt_id=attempt_id,
        override=req.recommendation,
    )
    return await _load_full_evaluation(evaluation.id, db)


# ─── Admin per-question score override ───────────────────────

@router.patch(
    "/{attempt_id}/question-score",
    response_model=EvaluationResponse,
    summary="Admin overrides per-question score and recalculates totals",
)
async def override_question_score(
    attempt_id: str,
    req: AdminQuestionScoreRequest,
    actor: CurrentActor,
    actor_id: ActorId,
    db: AsyncSession = Depends(get_db),
) -> EvaluationResponse:
    await evaluation_service.assert_attempt_owner(attempt_id, db, owner_scope_for(actor))
    # Load evaluation
    eval_result = await db.execute(
        select(Evaluation).where(Evaluation.attempt_id == attempt_id)
    )
    evaluation = eval_result.scalar_one_or_none()
    if evaluation is None:
        raise NotFoundError("Evaluation", attempt_id)

    # Load the specific QuestionFeedback row
    fb_result = await db.execute(
        select(QuestionFeedback).where(QuestionFeedback.id == req.question_feedback_id)
    )
    fb = fb_result.scalar_one_or_none()
    if fb is None:
        raise NotFoundError("QuestionFeedback", req.question_feedback_id)

    # Clamp admin score to max
    if req.admin_score is not None:
        fb.admin_awarded_score = min(req.admin_score, fb.max_score)
    else:
        fb.admin_awarded_score = None

    await db.flush()

    # Recalculate aggregate scores using admin scores where set
    all_fb_result = await db.execute(
        select(QuestionFeedback).where(QuestionFeedback.evaluation_id == evaluation.id)
    )
    all_feedback = all_fb_result.scalars().all()

    total = 0
    max_total = 0
    mcq_score = 0
    mcq_max = 0
    oe_score = 0
    oe_max = 0

    for f in all_feedback:
        effective = f.admin_awarded_score if f.admin_awarded_score is not None else f.awarded_score
        max_total += f.max_score
        total += effective
        if f.question_type == "MCQ":
            mcq_score += effective
            mcq_max += f.max_score
        else:
            oe_score += effective
            oe_max += f.max_score

    evaluation.total_score = total
    evaluation.max_score = max_total
    evaluation.percentage = round((total / max_total * 100) if max_total > 0 else 0.0, 1)
    evaluation.mcq_score = mcq_score
    evaluation.mcq_max = mcq_max
    evaluation.open_ended_score = oe_score
    evaluation.open_ended_max = oe_max

    await audit_log_service.record(
        db,
        actor_id=actor_id,
        action="QUESTION_SCORE_OVERRIDDEN",
        target_type="evaluation",
        target_id=evaluation.id,
        summary=f"Set question score to {fb.admin_awarded_score}" if fb.admin_awarded_score is not None else "Cleared question score override",
        details={"question_feedback_id": req.question_feedback_id, "admin_score": req.admin_score},
    )

    await db.commit()
    logger.info("Admin question score saved", attempt_id=attempt_id, fb_id=req.question_feedback_id)
    return await _load_full_evaluation(evaluation.id, db)


# ─── Score verification ───────────────────────────────────────

@router.get(
    "/{attempt_id}/verify-scores",
    summary="Re-aggregate scores from question_feedback via PL/pgSQL",
)
async def verify_scores(
    attempt_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> dict:
    await evaluation_service.assert_attempt_owner(attempt_id, db, owner_scope_for(actor))
    """
    Runs calculate_evaluation_scores(attempt_id) in PostgreSQL and returns
    the recomputed totals.  Compare against the stored Evaluation row to
    detect drift (e.g. after passing_marks is updated on the test).
    """
    from sqlalchemy import text
    result = await db.execute(
        text("SELECT * FROM calculate_evaluation_scores(:aid)"),
        {"aid": attempt_id},
    )
    row = result.mappings().one_or_none()
    if row is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Attempt not found or no feedback yet.")
    return dict(row)


# ─── Semantic similarity (pgvector, opt-in) ───────────────────

@router.get(
    "/{attempt_id}/similar",
    response_model=SimilarEvaluationsResponse,
    summary="Find candidates with semantically similar evaluations (pgvector)",
)
async def get_similar_evaluations(
    attempt_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=5, ge=1, le=20),
) -> SimilarEvaluationsResponse:
    await evaluation_service.assert_attempt_owner(attempt_id, db, owner_scope_for(actor))
    """
    Opt-in feature (EMBEDDING_ENABLED=true). Returns an empty list — not an
    error — when embeddings are disabled or this attempt has no embedding
    yet (e.g. it was evaluated before the feature was turned on).
    """
    from app.config import get_settings

    rows = await evaluation_service.find_similar_evaluations(attempt_id, db, limit=limit)
    return SimilarEvaluationsResponse(
        attempt_id=attempt_id,
        items=[SimilarEvaluationItem(**row) for row in rows],
        embeddings_enabled=get_settings().embedding_enabled,
    )


# ─── Export ───────────────────────────────────────────────────

@router.get(
    "/{attempt_id}/export",
    summary="Export evaluation report as DOCX",
)
async def export_evaluation(
    attempt_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
):
    await evaluation_service.assert_attempt_owner(attempt_id, db, owner_scope_for(actor))
    from app.services.export_service import build_docx
    eval_response = await _load_full_evaluation_by_attempt(attempt_id, db)
    docx_bytes = await build_docx(eval_response)
    filename = f"evaluation_{attempt_id[:8]}.docx"
    return StreamingResponse(
        iter([docx_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── Private helpers ──────────────────────────────────────────

async def _load_full_evaluation(evaluation_id: str, db: AsyncSession) -> EvaluationResponse:
    result = await db.execute(
        select(Evaluation)
        .options(selectinload(Evaluation.question_feedback))
        .where(Evaluation.id == evaluation_id)
    )
    evaluation = result.scalar_one()
    return await _enrich_evaluation_response(evaluation, db)


async def _load_full_evaluation_by_attempt(attempt_id: str, db: AsyncSession) -> EvaluationResponse:
    result = await db.execute(
        select(Evaluation)
        .options(selectinload(Evaluation.question_feedback))
        .where(Evaluation.attempt_id == attempt_id)
    )
    evaluation = result.scalar_one_or_none()
    if evaluation is None:
        raise NotFoundError("Evaluation", attempt_id)
    return await _enrich_evaluation_response(evaluation, db)


async def _enrich_evaluation_response(evaluation: Evaluation, db: AsyncSession) -> EvaluationResponse:
    """Build EvaluationResponse enriched with question text and candidate answers."""
    question_ids = [fb.question_id for fb in evaluation.question_feedback]

    # Load question details
    question_map: dict = {}
    if question_ids:
        q_result = await db.execute(select(Question).where(Question.id.in_(question_ids)))
        question_map = {q.id: q for q in q_result.scalars()}

    # Load candidate answers for this attempt
    answer_map: dict = {}
    if question_ids:
        a_result = await db.execute(
            select(CandidateAnswer).where(
                CandidateAnswer.attempt_id == evaluation.attempt_id,
                CandidateAnswer.question_id.in_(question_ids),
            )
        )
        answer_map = {a.question_id: a for a in a_result.scalars()}

    enriched_feedback = []
    for fb in sorted(evaluation.question_feedback, key=lambda x: x.id):
        q = question_map.get(fb.question_id)
        a = answer_map.get(fb.question_id)

        candidate_answer: str | None = None
        if a:
            if fb.question_type == "MCQ":
                # a.selected_option is the label the candidate clicked in their
                # per-attempt SHUFFLED view (attempt_service._safe_question).
                # question_options/correct_answer below are sent in the
                # original STORED order — translate the selection back to
                # that same coordinate system, or the admin-facing breakdown
                # highlights the wrong option as "what the candidate picked"
                # even though scoring (_score_mcqs) already compares correctly.
                candidate_answer = (
                    evaluation_service._resolve_original_label(
                        q, evaluation.attempt_id, a.selected_option or ""
                    )
                    if q
                    else a.selected_option
                )
            else:
                candidate_answer = a.answer_text

        enriched_feedback.append(
            QuestionFeedbackResponse(
                id=fb.id,
                question_id=fb.question_id,
                question_type=fb.question_type,
                awarded_score=fb.awarded_score,
                max_score=fb.max_score,
                is_correct=fb.is_correct,
                ai_feedback=fb.ai_feedback,
                matched_criteria=fb.matched_criteria,
                missed_criteria=fb.missed_criteria,
                admin_awarded_score=fb.admin_awarded_score,
                estimated_ai_percentage=fb.estimated_ai_percentage,
                ai_detection_confidence=(
                    fb.ai_detection_confidence.value if fb.ai_detection_confidence else None
                ),
                suspicious_phrases=fb.suspicious_phrases,
                ai_detection_explanation=fb.ai_detection_explanation,
                ai_detection_recommendation=(
                    fb.ai_detection_recommendation.value if fb.ai_detection_recommendation else None
                ),
                question_text=q.question_text if q else None,
                question_options=q.options if q else None,
                correct_answer=q.correct_answer if q else None,
                candidate_answer=candidate_answer,
            )
        )

    base = EvaluationResponse.model_validate(evaluation)
    base.question_feedback = enriched_feedback
    return base
