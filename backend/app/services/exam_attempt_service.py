"""
Exam Attempt Service (Master Prompt 2).

Wraps the existing per-section TestAttempt machinery (attempt_service.py)
with an ExamAttempt that spans all 3 sections of one candidate's sectioned
exam. Deliberately thin: section-level start/save/heartbeat/submit still go
through the same TestAttempt/CandidateAnswer rows and the same validation
(_validate_question_ids, token ownership, idempotent submit) the legacy
single-test flow already relies on — only question *delivery* differs,
since a candidate must only ever see their locked subset of one section's
bank Test, never the full bank.

Status machine (ExamAttemptStatus):
  ASSIGNED → STARTED → SECTION_SUBMITTED (×3, one per section) → SUBMITTED
                                                                 ↘ FAILED
  SUBMITTED → EVALUATING → EVALUATED   (see evaluation_service / worker.py)
"""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.core.logging import get_logger
from app.core.security import hash_token, is_expired, verify_token
from app.db.models.attempt import TestAttempt
from app.db.models.candidate import Invitation
from app.db.models.enums import (
    AttemptStatus,
    ExamAttemptStatus,
    InvitationStatus,
    QuestionBankStatus,
    TestType,
)
from app.db.models.question_bank import ExamAttempt
from app.db.models.test import Question, Test
from app.schemas.attempt import SubmitAttemptRequest
from app.schemas.exam import (
    ExamSectionResponse,
    ExamStatusResponse,
    SectionSubmitResponse,
)
from app.services import attempt_service, exam_assignment_service, question_bank_service
from app.services.question_bank_service import SECTION_ORDER

logger = get_logger(__name__)

# ── ARQ pool (background evaluation) ────────────────────────────
# Mirrors webhook_service's module-level pool pattern: set once at FastAPI
# startup (main.py lifespan), read here so a deep service call doesn't need
# a Request object threaded through every function signature.

_arq_pool: Any | None = None


def set_arq_pool(pool: Any) -> None:
    global _arq_pool
    _arq_pool = pool


async def _enqueue_exam_evaluation(exam_attempt_id: str) -> None:
    """
    Enqueue background evaluation for the WHOLE exam (Master Prompt 3) —
    once, after the final section is submitted, instead of evaluating
    synchronously inside the candidate's submit request. A cloud AI call
    here could otherwise time out the candidate's browser request (see
    docs/ai-assessment-redesign-audit.md risk #2). Never raises — a missing
    ARQ pool (e.g. in a test without full app startup) just skips the
    enqueue; the exam stays SUBMITTED until evaluation is triggered some
    other way (e.g. a manual admin retry — see exam_reports.py).
    """
    if _arq_pool is None:
        logger.warning(
            "No ARQ pool configured — exam evaluation not auto-queued",
            exam_attempt_id=exam_attempt_id,
        )
        return
    try:
        await _arq_pool.enqueue_job("task_evaluate_exam_batched", exam_attempt_id)
    except Exception as exc:
        logger.error("Failed to enqueue exam evaluation", exam_attempt_id=exam_attempt_id, error=str(exc))


# ─── Create (assign) ────────────────────────────────────────────

async def create_or_resume_exam_for_token(token: str, db: AsyncSession) -> ExamAttempt:
    """
    Validate the magic-link token, then create (or return the existing)
    ExamAttempt for this invitation, assigning locked questions from the
    JD's active question bank on first creation.

    Raises:
        HTTPException 400: invalid/expired/revoked token
        ConflictError:      no READY question bank exists for this JD yet
    """
    from fastapi import HTTPException

    token_hash = hash_token(token)
    result = await db.execute(
        select(Invitation).where(Invitation.token_hash == token_hash)
    )
    invitation = result.scalar_one_or_none()
    if invitation is None or not verify_token(token, invitation.token_hash):
        raise HTTPException(status_code=400, detail="Invalid or expired link.")
    if invitation.status in (InvitationStatus.REVOKED, InvitationStatus.TERMINATED):
        raise HTTPException(status_code=400, detail="This invitation is no longer active.")
    if is_expired(invitation.expires_at):
        raise HTTPException(status_code=400, detail="This link has expired.")

    existing = await _load_by_invitation(invitation.id, db)
    if existing is not None:
        return existing

    bank = await question_bank_service.get_bank_for_jd(invitation.jd_id, db)
    if bank is None or bank.status != QuestionBankStatus.READY:
        raise ConflictError(
            "No ready question bank exists for this job yet. Contact the recruiter.",
            error_code="NO_READY_BANK",
        )

    exam_attempt = ExamAttempt(
        candidate_id=invitation.candidate_id,
        invitation_id=invitation.id,
        jd_id=invitation.jd_id,
        status=ExamAttemptStatus.ASSIGNED,
    )
    db.add(exam_attempt)
    try:
        await db.flush()
    except IntegrityError:
        # Lost a race against a concurrent create for the same invitation —
        # ux_exam_attempts_invitation caught it. Use the winner's row.
        await db.rollback()
        winner = await _load_by_invitation(invitation.id, db)
        if winner is not None:
            return winner
        raise

    # Locks the assignment in exam_attempt_questions and commits.
    await exam_assignment_service.assign_questions_for_attempt(exam_attempt, bank, db)

    logger.info(
        "Exam attempt created and questions assigned",
        exam_attempt_id=exam_attempt.id,
        invitation_id=invitation.id,
        bank_id=bank.id,
    )
    return exam_attempt


# ─── Start / resume current section ─────────────────────────────

async def start_or_resume_current_section(
    exam_attempt_id: str, token: str, db: AsyncSession
) -> ExamSectionResponse:
    """Start (or resume) whichever section the candidate hasn't finished yet."""
    from fastapi import HTTPException

    exam_attempt = await _load_for_token(exam_attempt_id, token, db)

    if exam_attempt.status in (ExamAttemptStatus.SUBMITTED, ExamAttemptStatus.EVALUATING, ExamAttemptStatus.EVALUATED):
        raise HTTPException(status_code=409, detail="already_submitted")

    section_attempts = await _load_section_attempts(exam_attempt.id, db)
    current_section = _current_section(section_attempts)
    if current_section is None:
        # All 3 sections already have a submitted/evaluated TestAttempt —
        # finalize_exam_attempt should have already run; this is a safety net.
        raise HTTPException(status_code=409, detail="already_submitted")

    locked_ids = await exam_assignment_service.get_assigned_question_ids(
        exam_attempt.id, current_section, db
    )
    if not locked_ids:
        raise HTTPException(
            status_code=409,
            detail="No questions assigned for this section yet — contact the recruiter.",
        )

    questions, test = await _load_locked_questions(locked_ids, db)

    existing_attempt = section_attempts.get(current_section)
    if existing_attempt is not None and existing_attempt.status == AttemptStatus.IN_PROGRESS:
        test_attempt = existing_attempt
    else:
        test_attempt = TestAttempt(
            invitation_id=exam_attempt.invitation_id,
            candidate_id=exam_attempt.candidate_id,
            test_id=test.id,
            exam_attempt_id=exam_attempt.id,
            started_at=datetime.now(tz=UTC),
            time_remaining_seconds=test.duration_minutes * 60,
            status=AttemptStatus.IN_PROGRESS,
        )
        db.add(test_attempt)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            result = await db.execute(
                select(TestAttempt).where(
                    TestAttempt.invitation_id == exam_attempt.invitation_id,
                    TestAttempt.test_id == test.id,
                )
            )
            test_attempt = result.scalar_one()
        await db.refresh(test_attempt)

        if exam_attempt.status == ExamAttemptStatus.ASSIGNED:
            exam_attempt.status = ExamAttemptStatus.STARTED
            exam_attempt.started_at = exam_attempt.started_at or datetime.now(tz=UTC)
            await db.commit()

    saved_answers = await _saved_answers_for(test_attempt.id, db)
    safe_questions = [attempt_service.build_safe_question(q, test_attempt.id) for q in questions]

    return ExamSectionResponse(
        exam_attempt_id=exam_attempt.id,
        attempt_id=test_attempt.id,
        section_type=current_section.value,
        section_index=SECTION_ORDER.index(current_section) + 1,
        total_sections=len(SECTION_ORDER),
        test_title=test.title,
        duration_seconds=test.duration_minutes * 60,
        total_questions=len(safe_questions),
        questions=safe_questions,
        started_at=test_attempt.started_at or datetime.now(tz=UTC),
        saved_answers=saved_answers,
        exam_status=exam_attempt.status.value,
    )


# ─── Section submit ──────────────────────────────────────────────

async def submit_section(
    exam_attempt_id: str,
    section_type: TestType,
    req: SubmitAttemptRequest,
    token: str,
    db: AsyncSession,
) -> SectionSubmitResponse:
    """
    Submit one section. Delegates the actual TestAttempt finalization to
    attempt_service.submit_attempt() (same idempotency, same final-answers
    snapshot save) — this function only manages the ExamAttempt-level
    status transition and tells the candidate what's next.
    """
    from fastapi import HTTPException

    exam_attempt = await _load_for_token(exam_attempt_id, token, db)
    # Terminal-status guard (mirrors start_or_resume_current_section). Without
    # it, a candidate could replay a section submit after the exam finished to
    # re-trigger the whole batched evaluation — status regression, wasted AI
    # compute, and (evaluation is non-deterministic) a score re-roll.
    if exam_attempt.status in (
        ExamAttemptStatus.SUBMITTED,
        ExamAttemptStatus.EVALUATING,
        ExamAttemptStatus.EVALUATED,
    ):
        raise HTTPException(status_code=409, detail="already_submitted")
    section_attempts = await _load_section_attempts(exam_attempt.id, db)
    test_attempt = section_attempts.get(section_type)
    if test_attempt is None:
        raise HTTPException(
            status_code=409,
            detail=f"Section {section_type.value} has not been started for this exam.",
        )

    await attempt_service.submit_attempt(test_attempt.id, req, token, db)

    section_attempts = await _load_section_attempts(exam_attempt.id, db)
    next_section = _current_section(section_attempts)

    if next_section is None:
        # Final section just submitted — NOW (and only now) is CQ evaluation
        # enqueued, as ONE batched call covering all 3 sections' answers
        # (Master Prompt 3), not per-section as Master Prompt 2 originally did.
        exam_attempt.status = ExamAttemptStatus.SUBMITTED
        exam_attempt.submitted_at = datetime.now(tz=UTC)
        await db.commit()
        await _enqueue_exam_evaluation(exam_attempt.id)
    else:
        exam_attempt.status = ExamAttemptStatus.SECTION_SUBMITTED
        await db.commit()

    logger.info(
        "Exam section submitted",
        exam_attempt_id=exam_attempt.id,
        section=section_type.value,
        next_section=next_section.value if next_section else None,
    )

    return SectionSubmitResponse(
        exam_attempt_id=exam_attempt.id,
        section_type=section_type.value,
        next_section_type=next_section.value if next_section else None,
        exam_status=exam_attempt.status.value,
        message=(
            "All sections submitted — your exam is now queued for evaluation."
            if next_section is None
            else f"Section submitted. Continue with the {next_section.value.title()} section."
        ),
    )


# ─── Final submit (idempotent confirmation) ─────────────────────

async def submit_exam(exam_attempt_id: str, token: str, db: AsyncSession) -> ExamAttempt:
    """
    Idempotent final-submission check. By the time every section has been
    submitted via submit_section(), the ExamAttempt is already SUBMITTED —
    this endpoint exists for the candidate UI to explicitly confirm
    completion (per Master Prompt 2's POST /candidate-exams/{id}/submit)
    without needing to re-derive that from the last section's response.
    """
    from fastapi import HTTPException

    exam_attempt = await _load_for_token(exam_attempt_id, token, db)
    if exam_attempt.status in (ExamAttemptStatus.ASSIGNED, ExamAttemptStatus.STARTED, ExamAttemptStatus.SECTION_SUBMITTED):
        raise HTTPException(
            status_code=409,
            detail="Not every section has been submitted yet.",
        )
    return exam_attempt


# ─── Status ──────────────────────────────────────────────────────

async def get_status(exam_attempt_id: str, token: str, db: AsyncSession) -> ExamStatusResponse:
    exam_attempt = await _load_for_token(exam_attempt_id, token, db)
    section_attempts = await _load_section_attempts(exam_attempt.id, db)
    current = _current_section(section_attempts)
    completed = sum(
        1 for a in section_attempts.values()
        if a.status in (AttemptStatus.SUBMITTED, AttemptStatus.EVALUATED)
    )

    return ExamStatusResponse(
        exam_attempt_id=exam_attempt.id,
        status=exam_attempt.status.value,
        current_section_type=current.value if current else None,
        sections_completed=completed,
        total_sections=len(SECTION_ORDER),
        total_score=exam_attempt.total_score,
        mcq_score=exam_attempt.mcq_score,
        cq_score=exam_attempt.cq_score,
        ai_risk_score=exam_attempt.ai_risk_score,
    )


# ─── Helpers ──────────────────────────────────────────────────────

async def _load_by_invitation(invitation_id: str, db: AsyncSession) -> ExamAttempt | None:
    result = await db.execute(
        select(ExamAttempt).where(ExamAttempt.invitation_id == invitation_id)
    )
    return result.scalar_one_or_none()


async def _load_exam_attempt(exam_attempt_id: str, db: AsyncSession) -> ExamAttempt:
    result = await db.execute(select(ExamAttempt).where(ExamAttempt.id == exam_attempt_id))
    exam_attempt = result.scalar_one_or_none()
    if exam_attempt is None:
        raise NotFoundError("ExamAttempt", exam_attempt_id)
    return exam_attempt


async def _load_for_token(exam_attempt_id: str, token: str, db: AsyncSession) -> ExamAttempt:
    """Same token-ownership guarantee attempt_service._load_attempt_for_token
    gives per-section attempts, at the exam-attempt level."""
    exam_attempt = await _load_exam_attempt(exam_attempt_id, db)
    result = await db.execute(
        select(Invitation).where(Invitation.id == exam_attempt.invitation_id)
    )
    invitation = result.scalar_one_or_none()
    if invitation is None or not verify_token(token, invitation.token_hash):
        raise ForbiddenError("Token does not match this exam attempt.")
    return exam_attempt


async def _load_section_attempts(
    exam_attempt_id: str, db: AsyncSession
) -> dict[TestType, TestAttempt]:
    result = await db.execute(
        select(TestAttempt, Test.test_type)
        .join(Test, Test.id == TestAttempt.test_id)
        .where(TestAttempt.exam_attempt_id == exam_attempt_id)
    )
    return {test_type: attempt for attempt, test_type in result.all()}


def _current_section(section_attempts: dict[TestType, TestAttempt]) -> TestType | None:
    """First section in SECTION_ORDER without a submitted/evaluated attempt."""
    for section in SECTION_ORDER:
        attempt = section_attempts.get(section)
        if attempt is None or attempt.status not in (AttemptStatus.SUBMITTED, AttemptStatus.EVALUATED):
            return section
    return None


async def _load_locked_questions(
    question_ids: list[str], db: AsyncSession
) -> tuple[list[Question], Test]:
    """Load locked questions in assignment order, plus their shared Test row."""
    result = await db.execute(select(Question).where(Question.id.in_(question_ids)))
    by_id = {q.id: q for q in result.scalars().all()}
    questions = [by_id[qid] for qid in question_ids if qid in by_id]
    if not questions:
        raise NotFoundError("Question", ",".join(question_ids[:3]))

    test_result = await db.execute(select(Test).where(Test.id == questions[0].test_id))
    test = test_result.scalar_one()
    return questions, test


async def _saved_answers_for(attempt_id: str, db: AsyncSession) -> dict[str, str]:
    from app.db.models.attempt import CandidateAnswer

    result = await db.execute(
        select(CandidateAnswer).where(CandidateAnswer.attempt_id == attempt_id)
    )
    saved: dict[str, str] = {}
    for ans in result.scalars().all():
        if ans.selected_option:
            saved[ans.question_id] = ans.selected_option
        elif ans.answer_text:
            saved[ans.question_id] = ans.answer_text
    return saved
