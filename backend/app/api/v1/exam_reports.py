"""
Admin report endpoints for the sectioned exam redesign (Master Prompt 2).

Master Prompt 2 specifies:
  GET /admin/attempts/:attemptId/report
  GET /admin/jobs/:jobId/candidates
  GET /admin/jobs/:jobId/results

Mounted here as a standalone router (prefix /api/v1/exam-admin) rather than
folded into the existing app/api/v1/admin.py, to avoid any path collision
with that router's existing /admin/* surface (backup/restore/audit-log).
"attempt" -> exam_attempt_id and "job" -> jd_id, consistent with question_banks.py.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.db.models.candidate import Candidate
from app.db.models.enums import ExamAttemptStatus
from app.db.models.question_bank import ExamAttempt
from app.db.session import get_db
from app.dependencies import CurrentActor, owner_scope_for
from app.schemas.exam import ExamAttemptReportResponse
from app.services import ai_risk_service, jd_service

router = APIRouter()


@router.post(
    "/attempts/{exam_attempt_id}/retry-evaluation",
    response_model=ExamAttemptReportResponse,
    summary="Re-queue evaluation for an exam stuck in FAILED status",
)
async def retry_evaluation(
    exam_attempt_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> ExamAttemptReportResponse:
    """
    Master Prompt 3's "evaluation_failed → allow retry" requirement. Only
    valid from FAILED — candidate answers were never at risk (they're saved
    independently of evaluation outcome), so retrying just re-runs the
    batched CQ call and scoring/risk aggregation from scratch.
    """
    from app.services import exam_attempt_service

    result = await db.execute(select(ExamAttempt).where(ExamAttempt.id == exam_attempt_id))
    exam_attempt = result.scalar_one_or_none()
    if exam_attempt is None:
        raise NotFoundError("ExamAttempt", exam_attempt_id)
    await jd_service.get_jd_orm(exam_attempt.jd_id, db, owner_id=owner_scope_for(actor))
    if exam_attempt.status != ExamAttemptStatus.FAILED:
        raise ConflictError(
            f"Cannot retry — exam status is {exam_attempt.status.value}, not FAILED.",
            error_code="NOT_FAILED",
        )

    exam_attempt.status = ExamAttemptStatus.SUBMITTED
    await db.commit()
    await exam_attempt_service._enqueue_exam_evaluation(exam_attempt_id)

    return await get_exam_attempt_report(exam_attempt_id, actor, db)


@router.get(
    "/attempts/{exam_attempt_id}/report",
    response_model=ExamAttemptReportResponse,
    summary="Full report for one candidate's sectioned exam",
)
async def get_exam_attempt_report(
    exam_attempt_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
    *,
    deep_review: bool = False,
) -> ExamAttemptReportResponse:
    result = await db.execute(select(ExamAttempt).where(ExamAttempt.id == exam_attempt_id))
    exam_attempt = result.scalar_one_or_none()
    if exam_attempt is None:
        raise NotFoundError("ExamAttempt", exam_attempt_id)
    await jd_service.get_jd_orm(exam_attempt.jd_id, db, owner_id=owner_scope_for(actor))

    risk_summary = await ai_risk_service.get_risk_summary(exam_attempt_id, db)
    explanation = None
    if deep_review:
        explanation = await ai_risk_service.get_risk_explanation(
            exam_attempt_id, db, admin_requested=True
        )

    return ExamAttemptReportResponse(
        exam_attempt_id=exam_attempt.id,
        candidate_id=exam_attempt.candidate_id,
        jd_id=exam_attempt.jd_id,
        status=exam_attempt.status.value,
        total_score=exam_attempt.total_score,
        mcq_score=exam_attempt.mcq_score,
        cq_score=exam_attempt.cq_score,
        section_scores=(exam_attempt.metadata_json or {}).get("section_scores", {}),
        ai_risk_score=exam_attempt.ai_risk_score,
        ai_likeness_risk=risk_summary["ai_likeness_risk"],
        ai_risk_reasons=risk_summary["reasons"],
        ai_risk_signals=risk_summary["signals"],
        ai_risk_explanation=explanation,
    )


@router.get(
    "/jd/{jd_id}/candidates",
    summary="List every candidate's sectioned-exam attempt for a job",
)
async def list_exam_candidates(
    jd_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> dict:
    await jd_service.get_jd_orm(jd_id, db, owner_id=owner_scope_for(actor))
    rows = await _load_jd_attempts(jd_id, db)
    return {"jd_id": jd_id, "total": len(rows), "items": rows}


@router.get(
    "/jd/{jd_id}/results",
    summary="Sectioned-exam results for a job, ranked by total score",
)
async def list_exam_results(
    jd_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> dict:
    await jd_service.get_jd_orm(jd_id, db, owner_id=owner_scope_for(actor))
    rows = await _load_jd_attempts(jd_id, db)
    ranked = sorted(
        (r for r in rows if r["total_score"] is not None),
        key=lambda r: r["total_score"],
        reverse=True,
    )
    for rank, row in enumerate(ranked, 1):
        row["rank"] = rank
    return {"jd_id": jd_id, "total": len(ranked), "items": ranked}


async def _load_jd_attempts(jd_id: str, db: AsyncSession) -> list[dict]:
    result = await db.execute(
        select(ExamAttempt, Candidate)
        .join(Candidate, Candidate.id == ExamAttempt.candidate_id)
        .where(ExamAttempt.jd_id == jd_id)
        .order_by(ExamAttempt.assigned_at.desc())
    )
    return [
        {
            "exam_attempt_id": ea.id,
            "candidate_id": candidate.id,
            "candidate_name": candidate.name,
            "candidate_email": candidate.email,
            "status": ea.status.value,
            "total_score": ea.total_score,
            "ai_risk_score": ea.ai_risk_score,
            "assigned_at": ea.assigned_at,
            "submitted_at": ea.submitted_at,
        }
        for ea, candidate in result.all()
    ]
