"""
Attempt Service — test-taking lifecycle management.

Responsible for:
  start_attempt    — validate token, create TestAttempt, shuffle MCQ options
  get_attempt_state — resume support (page refresh)
  save_answer      — upsert a single CandidateAnswer
  bulk_save_answers — upsert many answers at once (used on submit)
  heartbeat        — reconcile server-side timer; detect timeout
  submit_attempt   — finalise submission, prevent double-submit
  log_event        — append a SuspiciousEvent record
  terminate_attempt — hard integrity enforcement: ends this attempt AND the
                      parent invitation (blocking every remaining test) on a
                      candidate-side violation (tab switch, window blur, etc)

Security invariants:
  - Correct answers, explanations, rubrics NEVER leave this service
  - Test IDs are only returned after token validation
  - Submission is idempotent: calling submit twice is safe
  - Timer is authoritative server-side; client is advisory only
  - question_ids in save/bulk-save/submit must belong to the attempt's
    assigned test — see _validate_question_ids
"""

import json
import random
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace

import redis.asyncio as aioredis
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.core.security import hash_token, is_expired, verify_token
from app.db.models.attempt import CandidateAnswer, SuspiciousEvent, TestAttempt
from app.db.models.candidate import Invitation
from app.db.models.enums import (
    AttemptStatus,
    Difficulty,
    InvitationStatus,
    QuestionType,
    TestStatus,
)
from app.db.models.test import Question, Test
from app.schemas.attempt import (
    AttemptStateResponse,
    BulkSaveRequest,
    HeartbeatResponse,
    QuestionForCandidate,
    SaveAnswerRequest,
    SaveAnswerResponse,
    StartAttemptResponse,
    SubmitAttemptRequest,
    SubmitAttemptResponse,
    SuspiciousEventRequest,
    SuspiciousEventResponse,
    TerminateAttemptRequest,
    TerminateAttemptResponse,
)
from app.services import webhook_service

logger = get_logger(__name__)

# ── Redis test cache ───────────────────────────────────────────
# Approved tests (Test + Questions) are cached by test_id and by jd_id.
# This avoids a full selectinload DB round-trip on every candidate
# start_attempt / page-refresh call for the same approved test.

_redis: aioredis.Redis | None = None


def set_redis_client(client: aioredis.Redis) -> None:
    global _redis
    _redis = client


async def invalidate_test_cache(
    *, test_id: str | None = None, jd_id: str | None = None
) -> None:
    """Delete candidate-facing test cache entries after admin test mutations."""
    if not _redis:
        return

    keys: list[str] = []
    if test_id:
        keys.append(f"test:{test_id}")
    if jd_id:
        keys.append(f"approved_tests:{jd_id}")
    if not keys:
        return

    try:
        await _redis.delete(*keys)
    except Exception as exc:
        logger.warning("Failed to invalidate test cache", keys=keys, error=str(exc))


def _serialize_test_to_dict(test: Test) -> dict:
    """Serialize a Test ORM object (with questions loaded) to a plain dict."""
    return {
        "id": test.id,
        "jd_id": test.jd_id,
        "title": test.title,
        "description": test.description,
        "duration_minutes": test.duration_minutes,
        "total_marks": test.total_marks,
        # Needed so start_attempt()'s bank-mode guard still works on a
        # cache hit, not just the first (uncached) load.
        "question_bank_id": test.question_bank_id,
        "difficulty": test.difficulty.value if hasattr(test.difficulty, "value") else str(test.difficulty),
        "status": test.status.value if hasattr(test.status, "value") else str(test.status),
        "questions": [
            {
                "id": q.id,
                "test_id": q.test_id,
                "question_type": q.question_type.value if hasattr(q.question_type, "value") else str(q.question_type),
                "question_text": q.question_text,
                "skill_tested": q.skill_tested or "",
                "difficulty": q.difficulty.value if hasattr(q.difficulty, "value") else str(q.difficulty),
                "marks": q.marks,
                "order_index": q.order_index,
                "options": q.options,
                "correct_answer": q.correct_answer,
                "explanation": q.explanation,
                "expected_answer": q.expected_answer,
                "scoring_rubric": q.scoring_rubric,
                "code_language": q.code_language,
                "code_starter": q.code_starter,
            }
            for q in test.questions
        ],
    }


def _deserialize_test_from_dict(d: dict) -> SimpleNamespace:
    """Reconstruct a test-like SimpleNamespace from a cached dict.

    Enum fields are restored to their proper enum types so comparisons
    like ``test.status == TestStatus.APPROVED`` continue to work.
    """
    test = SimpleNamespace(**{k: v for k, v in d.items() if k != "questions"})
    test.difficulty = Difficulty(d["difficulty"])
    test.status = TestStatus(d["status"])
    test.questions = []
    for q_data in d["questions"]:
        q = SimpleNamespace(**q_data)
        q.question_type = QuestionType(q_data["question_type"])
        q.difficulty = Difficulty(q_data["difficulty"])
        test.questions.append(q)
    return test


async def _load_test_with_questions_cached(test_id: str, db: AsyncSession):
    """Load a Test + questions, serving from Redis cache when available."""
    if _redis:
        try:
            cached = await _redis.get(f"test:{test_id}")
            if cached:
                return _deserialize_test_from_dict(json.loads(cached))
        except Exception:
            pass

    result = await db.execute(
        select(Test).options(selectinload(Test.questions)).where(Test.id == test_id)
    )
    test = result.scalar_one_or_none()

    if test is not None and test.status == TestStatus.APPROVED and _redis:
        try:
            await _redis.setex(f"test:{test_id}", 3600, json.dumps(_serialize_test_to_dict(test)))
        except Exception:
            pass

    return test


async def _load_approved_tests_for_jd_cached(jd_id: str, db: AsyncSession) -> list:
    """Load all approved tests for a JD, serving from Redis cache when available."""
    if _redis:
        try:
            cached = await _redis.get(f"approved_tests:{jd_id}")
            if cached:
                return [_deserialize_test_from_dict(t) for t in json.loads(cached)]
        except Exception:
            pass

    result = await db.execute(
        select(Test)
        .options(selectinload(Test.questions))
        .where(Test.jd_id == jd_id, Test.status == TestStatus.APPROVED)
        .order_by(Test.created_at)
    )
    tests = list(result.scalars().all())

    if tests and _redis:
        try:
            await _redis.setex(
                f"approved_tests:{jd_id}",
                3600,
                json.dumps([_serialize_test_to_dict(t) for t in tests]),
            )
        except Exception:
            pass

    return tests


# ─── Start ────────────────────────────────────────────────────

async def start_attempt(
    token: str,
    test_index: int,
    ip_address: str | None,
    db: AsyncSession,
) -> StartAttemptResponse:
    """
    Begin a test attempt.

    Steps:
    1. Validate token → load invitation
    2. Mark invitation OPENED if still PENDING
    3. Load approved tests for the JD
    4. Select the test at test_index
    5. Check for an existing IN_PROGRESS attempt (resume) or NOT_STARTED
    6. Create TestAttempt (or reuse existing one)
    7. Shuffle MCQ options per attempt (so option positions differ across candidates)
    8. Strip correct answers before returning questions

    Raises:
        HTTPException 400 — invalid/expired token
        HTTPException 409 — test already submitted
        HTTPException 404 — test_index out of range
    """
    from fastapi import HTTPException

    # 1. Validate token
    token_hash = hash_token(token)
    inv_result = await db.execute(
        select(Invitation)
        .options(selectinload(Invitation.candidate))
        .where(Invitation.token_hash == token_hash)
    )
    invitation = inv_result.scalar_one_or_none()

    if invitation is None or not verify_token(token, invitation.token_hash):
        raise HTTPException(status_code=400, detail="Invalid or expired link.")

    if invitation.status == InvitationStatus.REVOKED:
        raise HTTPException(status_code=400, detail="This invitation has been revoked.")

    if invitation.status == InvitationStatus.TERMINATED:
        raise HTTPException(
            status_code=403,
            detail=(
                "This assessment was ended due to an integrity violation and "
                "cannot be resumed."
            ),
        )

    if is_expired(invitation.expires_at):
        if invitation.status not in (InvitationStatus.EXPIRED, InvitationStatus.REVOKED):
            invitation.status = InvitationStatus.EXPIRED
            await db.commit()
        raise HTTPException(status_code=400, detail="This link has expired.")

    # 2. Mark OPENED
    if invitation.status == InvitationStatus.PENDING:
        invitation.status = InvitationStatus.OPENED
        await db.flush()

    # 3. Load approved tests for this JD (Redis-cached after first load)
    approved_tests = await _load_approved_tests_for_jd_cached(invitation.jd_id, db)

    if not approved_tests:
        raise HTTPException(
            status_code=409,
            detail="No approved tests found. Contact the recruiter.",
        )

    # Bank-mode guard (Master Prompt 2/3): a question-bank section Test
    # holds the FULL bank (e.g. 40 MCQ + 20 CQ), not the 10+5 locked subset
    # a candidate should actually see. Refuse the legacy endpoint here so
    # an old or manually-typed /tests/ link can never bypass question-bank
    # locking/assignment — the candidate must use /exam/<token> instead,
    # which exam_attempt_service.create_or_resume_exam_for_token() serves
    # off the exact same invitation token.
    if any(getattr(t, "question_bank_id", None) is not None for t in approved_tests):
        raise HTTPException(
            status_code=400,
            detail=(
                "This assessment uses the sectioned exam flow. Please use the "
                "link from your invitation email exactly as sent (it should "
                "open a 3-section exam, not a single timed test)."
            ),
        )

    submitted_result = await db.execute(
        select(TestAttempt.test_id).where(
            TestAttempt.invitation_id == invitation.id,
            TestAttempt.status.in_([AttemptStatus.SUBMITTED, AttemptStatus.EVALUATED]),
        )
    )
    completed_test_ids = {row[0] for row in submitted_result.all()}

    next_test_index = next(
        (
            index
            for index, approved_test in enumerate(approved_tests)
            if approved_test.id not in completed_test_ids
        ),
        None,
    )

    if next_test_index is None:
        if invitation.status != InvitationStatus.COMPLETED:
            invitation.status = InvitationStatus.COMPLETED
            await db.commit()
        raise HTTPException(status_code=409, detail="already_submitted")

    # Repair stale COMPLETED invitations from older single-test completion logic.
    if invitation.status == InvitationStatus.COMPLETED:
        invitation.status = InvitationStatus.OPENED
        await db.flush()

    # 4. Select test
    if test_index >= len(approved_tests):
        raise HTTPException(
            status_code=404,
            detail=f"test_index {test_index} out of range (0–{len(approved_tests)-1}).",
        )

    # If the caller asks for a test already submitted, continue with the next
    # unfinished approved test. This keeps old magic links working after test 1.
    if approved_tests[test_index].id in completed_test_ids:
        test_index = next_test_index

    test = approved_tests[test_index]

    # 5. Check existing attempt
    existing_result = await db.execute(
        select(TestAttempt).where(
            TestAttempt.invitation_id == invitation.id,
            TestAttempt.test_id == test.id,
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing is not None:
        if existing.status == AttemptStatus.TERMINATED:
            raise HTTPException(
                status_code=403,
                detail=(
                    "This assessment was ended due to an integrity violation and "
                    "cannot be resumed."
                ),
            )
        if existing.status in (AttemptStatus.SUBMITTED, AttemptStatus.EVALUATED):
            raise HTTPException(status_code=409, detail="already_submitted")
        if existing.status == AttemptStatus.IN_PROGRESS:
            # Resume — return current state
            logger.info(
                "Resuming existing attempt",
                attempt_id=existing.id,
                time_remaining=existing.time_remaining_seconds,
            )
            return await _build_start_response(existing, test, db)

    # 6. Create new attempt
    attempt = TestAttempt(
        invitation_id=invitation.id,
        candidate_id=invitation.candidate_id,
        test_id=test.id,
        started_at=datetime.now(tz=UTC),
        time_remaining_seconds=test.duration_minutes * 60,
        status=AttemptStatus.IN_PROGRESS,
        ip_address=ip_address,
    )
    db.add(attempt)
    try:
        await db.commit()
    except IntegrityError:
        # Lost a race against a concurrent start_attempt for the same
        # (invitation_id, test_id) — the unique index caught what the
        # SELECT above couldn't see yet. The winner's row is now
        # committed; fetch it and resume from there instead of erroring.
        await db.rollback()
        existing_result = await db.execute(
            select(TestAttempt).where(
                TestAttempt.invitation_id == invitation.id,
                TestAttempt.test_id == test.id,
            )
        )
        attempt = existing_result.scalar_one()
        return await _build_start_response(attempt, test, db)
    await db.refresh(attempt)

    logger.info(
        "Attempt started",
        attempt_id=attempt.id,
        test_id=test.id,
        candidate_id=invitation.candidate_id,
        duration_seconds=test.duration_minutes * 60,
    )

    await webhook_service.enqueue_event(
        "attempt.started",
        {
            "attempt_id": attempt.id,
            "invitation_id": invitation.id,
            "candidate_id": invitation.candidate_id,
            "test_id": test.id,
        },
        db,
    )

    return await _build_start_response(attempt, test, db)


async def _build_start_response(
    attempt: TestAttempt, test: Test, db: AsyncSession
) -> StartAttemptResponse:
    """Build the StartAttemptResponse from a TestAttempt + Test."""
    # Load existing answers for resume support
    answers_result = await db.execute(
        select(CandidateAnswer).where(CandidateAnswer.attempt_id == attempt.id)
    )
    saved_raw = answers_result.scalars().all()
    saved_answers: dict[str, str] = {}
    for ans in saved_raw:
        if ans.selected_option:
            saved_answers[ans.question_id] = ans.selected_option
        elif ans.answer_text:
            saved_answers[ans.question_id] = ans.answer_text

    # Build safe question list (no correct answers)
    questions = [_safe_question(q, attempt.id) for q in test.questions]

    return StartAttemptResponse(
        attempt_id=attempt.id,
        test_id=test.id,
        test_title=test.title,
        duration_seconds=test.duration_minutes * 60,
        total_questions=len(questions),
        questions=questions,
        started_at=attempt.started_at or datetime.now(tz=UTC),
        saved_answers=saved_answers,
    )


def _safe_question(q: Question, attempt_id: str) -> QuestionForCandidate:
    """
    Strip sensitive fields (correct_answer, explanation, expected_answer,
    scoring_rubric, is_correct on options) before sending to the client.
    MCQ options are shuffled per attempt for fairness.
    """
    safe_options = None
    if q.options:
        # Remove is_correct flag
        options = [
            {"label": o["label"], "text": o["text"]}
            for o in q.options
        ]
        # Shuffle using attempt_id as seed for deterministic per-attempt ordering
        rng = random.Random(attempt_id + q.id)
        rng.shuffle(options)
        # Re-label A/B/C/D after shuffle
        labels = ["A", "B", "C", "D"]
        safe_options = [
            {"label": labels[i], "text": opt["text"]}
            for i, opt in enumerate(options)
        ]

    return QuestionForCandidate(
        id=q.id,
        question_type=q.question_type.value,
        question_text=q.question_text,
        skill_tested=q.skill_tested,
        difficulty=q.difficulty.value,
        marks=q.marks,
        order_index=q.order_index,
        options=safe_options,
        code_language=q.code_language,
        code_starter=q.code_starter,
    )


# Public alias — exam_attempt_service.py (Master Prompt 2) reuses this same
# answer-stripping/shuffle logic to build sectioned-exam responses from a
# candidate's locked question subset, instead of a Test's full question list.
build_safe_question = _safe_question


# ─── Get state (resume) ───────────────────────────────────────

async def get_attempt_state(
    attempt_id: str, token: str, db: AsyncSession
) -> AttemptStateResponse:
    """Return current attempt state for a page-refresh resume."""
    from fastapi import HTTPException

    attempt = await _load_attempt_for_token(attempt_id, token, db)

    test = await _load_test_with_questions_cached(attempt.test_id, db)
    if test is None:
        raise HTTPException(status_code=404, detail="Test not found.")

    # Recalculate server-side time remaining
    time_remaining = _compute_time_remaining(attempt, test)

    answers_result = await db.execute(
        select(CandidateAnswer).where(CandidateAnswer.attempt_id == attempt_id)
    )
    saved_raw = answers_result.scalars().all()
    saved_answers = {
        ans.question_id: (ans.selected_option or ans.answer_text or "")
        for ans in saved_raw
        if (ans.selected_option or ans.answer_text)
    }

    return AttemptStateResponse(
        attempt_id=attempt.id,
        test_id=test.id,
        test_title=test.title,
        status=attempt.status.value,
        duration_seconds=test.duration_minutes * 60,
        server_time_remaining_seconds=max(0, time_remaining),
        started_at=attempt.started_at or datetime.now(tz=UTC),
        questions=[_safe_question(q, attempt.id) for q in test.questions],
        saved_answers=saved_answers,
        integrity_violation_reason=attempt.integrity_violation_reason,
        terminated_at=attempt.terminated_at,
    )


# ─── Save answer ──────────────────────────────────────────────

async def save_answer(
    attempt_id: str,
    req: SaveAnswerRequest,
    token: str,
    db: AsyncSession,
) -> SaveAnswerResponse:
    """
    Upsert a single candidate answer.
    Silently ignored if the attempt is already submitted.
    """
    attempt = await _load_attempt_for_token(attempt_id, token, db)

    if attempt.status != AttemptStatus.IN_PROGRESS:
        # Don't raise — return gracefully so the client doesn't error mid-test
        return SaveAnswerResponse(
            question_id=req.question_id,
            saved=False,
            saved_at=datetime.now(tz=UTC),
        )

    # Server-side timer enforcement: reject answers submitted after the deadline.
    test = (
        await db.execute(select(Test).where(Test.id == attempt.test_id))
    ).scalar_one_or_none()
    if test is not None and _is_past_deadline(attempt, test):
        return SaveAnswerResponse(
            question_id=req.question_id,
            saved=False,
            saved_at=datetime.now(tz=UTC),
        )

    await _validate_question_ids(attempt, {req.question_id}, db)

    await _upsert_answer(attempt_id, req, db)
    await db.commit()

    return SaveAnswerResponse(
        question_id=req.question_id,
        saved=True,
        saved_at=datetime.now(tz=UTC),
    )


async def bulk_save_answers(
    attempt_id: str,
    req: BulkSaveRequest,
    token: str,
    db: AsyncSession,
) -> int:
    """
    Upsert all answers in a SINGLE SQL statement instead of N SELECT+INSERT/UPDATE pairs.

    Uses PostgreSQL INSERT … ON CONFLICT (attempt_id, question_id) DO UPDATE SET …
    which is atomic and needs only one round-trip regardless of how many answers are
    in the payload. The conflict target is the unique index ix_answers_attempt_question
    created in P1-2.

    Returns the number of rows included in the upsert.
    """
    attempt = await _load_attempt_for_token(attempt_id, token, db)
    return await _bulk_save_answers_for_attempt(attempt, req, db)


async def _bulk_save_answers_for_attempt(
    attempt: TestAttempt,
    req: BulkSaveRequest,
    db: AsyncSession,
) -> int:
    """
    Same as bulk_save_answers but for an attempt whose token ownership has
    already been verified by the caller (used by submit_attempt).
    """
    if attempt.status != AttemptStatus.IN_PROGRESS:
        return 0

    # Server-side timer enforcement: drop answers that arrive past the deadline.
    # On final submit this means the submission still completes, but only the
    # answers already autosaved within time are counted — no late writes.
    test = (
        await db.execute(select(Test).where(Test.id == attempt.test_id))
    ).scalar_one_or_none()
    if test is not None and _is_past_deadline(attempt, test):
        return 0

    await _validate_question_ids(
        attempt, {answer.question_id for answer in req.answers}, db
    )

    now = datetime.now(tz=UTC)
    rows = [
        {
            "id": str(uuid.uuid4()),
            "attempt_id": attempt.id,
            "question_id": answer.question_id,
            "selected_option": answer.selected_option,
            "answer_text": answer.answer_text,
            "is_auto_scored": False,   # ORM default not applied on raw INSERT
            "auto_score": None,
            "saved_at": now,
            "updated_at": now,
        }
        for answer in req.answers
        if answer.selected_option is not None or answer.answer_text is not None
    ]

    if not rows:
        return 0

    stmt = pg_insert(CandidateAnswer).values(rows)
    stmt = stmt.on_conflict_do_update(
        # Targets the unique index on (attempt_id, question_id) added in P1-2
        index_elements=["attempt_id", "question_id"],
        set_={
            "selected_option": stmt.excluded.selected_option,
            "answer_text":     stmt.excluded.answer_text,
            "saved_at":        stmt.excluded.saved_at,
            "updated_at":      stmt.excluded.updated_at,
        },
    )
    await db.execute(stmt)
    await db.commit()
    return len(rows)


async def _upsert_answer(
    attempt_id: str, req: SaveAnswerRequest, db: AsyncSession
) -> None:
    """
    Upsert a single CandidateAnswer using one PostgreSQL ON CONFLICT statement.
    Replaces the old SELECT + conditional INSERT/UPDATE (2 round-trips → 1).
    """
    now = datetime.now(tz=UTC)
    stmt = pg_insert(CandidateAnswer).values(
        id=str(uuid.uuid4()),
        attempt_id=attempt_id,
        question_id=req.question_id,
        selected_option=req.selected_option,
        answer_text=req.answer_text,
        is_auto_scored=False,   # ORM default not applied on raw INSERT
        auto_score=None,
        saved_at=now,
        updated_at=now,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["attempt_id", "question_id"],
        set_={
            "selected_option": stmt.excluded.selected_option,
            "answer_text":     stmt.excluded.answer_text,
            "saved_at":        stmt.excluded.saved_at,
            "updated_at":      stmt.excluded.updated_at,
        },
    )
    await db.execute(stmt)


# ─── Heartbeat ────────────────────────────────────────────────

async def heartbeat(
    attempt_id: str,
    client_remaining: int,
    token: str,
    db: AsyncSession,
) -> HeartbeatResponse:
    """
    Sync the server-side timer.

    The server computes remaining time from (started_at + duration).
    It accepts the client's value only if it's within a 30-second tolerance
    (client clocks can drift slightly). If the server determines time is up,
    it sets force_submit=True.
    """
    attempt = await _load_attempt_for_token(attempt_id, token, db)

    if attempt.status != AttemptStatus.IN_PROGRESS:
        return HeartbeatResponse(
            attempt_id=attempt_id,
            server_time_remaining_seconds=0,
            force_submit=False,
            status=attempt.status.value,
        )

    test_result = await db.execute(
        select(Test).where(Test.id == attempt.test_id)
    )
    test = test_result.scalar_one_or_none()
    if test is None:
        return HeartbeatResponse(
            attempt_id=attempt_id,
            server_time_remaining_seconds=0,
            force_submit=True,
            status=AttemptStatus.IN_PROGRESS.value,
        )

    server_remaining = _compute_time_remaining(attempt, test)

    # Accept client value if within ±30s of server — prevents small clock skew
    # from causing spurious force-submits
    tolerance = 30
    if abs(client_remaining - server_remaining) <= tolerance:
        authoritative = client_remaining
    else:
        authoritative = server_remaining
        logger.warning(
            "Client/server timer drift",
            attempt_id=attempt_id,
            client=client_remaining,
            server=server_remaining,
            drift=client_remaining - server_remaining,
        )

    # Update stored remaining time
    attempt.time_remaining_seconds = max(0, authoritative)
    await db.commit()

    force_submit = authoritative <= 0
    return HeartbeatResponse(
        attempt_id=attempt_id,
        server_time_remaining_seconds=max(0, authoritative),
        force_submit=force_submit,
        status=AttemptStatus.IN_PROGRESS.value,
    )


# ─── Submit ───────────────────────────────────────────────────

async def submit_attempt(
    attempt_id: str,
    req: SubmitAttemptRequest,
    token: str,
    db: AsyncSession,
) -> SubmitAttemptResponse:
    """
    Finalise a test attempt.

    - Saves any final answers from the request payload
    - Marks attempt SUBMITTED (idempotent: already-submitted returns current state)
    - Marks invitation COMPLETED when ALL approved tests have been submitted,
      and tells the candidate which test_index to attempt next (if any) so
      they can continue a multi-test invitation instead of hitting a dead end.
    """
    from fastapi import HTTPException

    attempt = await _load_attempt_for_token(attempt_id, token, db)

    if attempt.status == AttemptStatus.TERMINATED:
        raise HTTPException(
            status_code=403,
            detail=(
                "This assessment was ended due to an integrity violation and "
                "cannot be submitted."
            ),
        )

    # Idempotency — if already submitted, return success without error
    if attempt.status == AttemptStatus.SUBMITTED:
        answers_count = await _count_answers(attempt_id, db)
        invitation = await _load_invitation_by_id(attempt.invitation_id, db)
        next_test_index, total_tests = (
            await get_test_progress(invitation, db) if invitation else (None, 0)
        )
        return SubmitAttemptResponse(
            attempt_id=attempt_id,
            submitted_at=attempt.submitted_at or datetime.now(tz=UTC),
            total_questions=0,
            answered_questions=answers_count,
            auto_submitted=attempt.auto_submitted,
            message="Already submitted.",
            next_test_index=next_test_index,
            total_tests=total_tests,
        )

    # Save final answers snapshot
    if req.answers:
        await _bulk_save_answers_for_attempt(
            attempt,
            type("R", (), {"answers": req.answers})(),  # duck-typed BulkSaveRequest
            db,
        )

    # Mark submitted
    now = datetime.now(tz=UTC)
    attempt.status = AttemptStatus.SUBMITTED
    attempt.submitted_at = now
    attempt.auto_submitted = req.auto_submitted
    await db.commit()

    await webhook_service.enqueue_event(
        "attempt.submitted",
        {
            "attempt_id": attempt.id,
            "invitation_id": attempt.invitation_id,
            "candidate_id": attempt.candidate_id,
            "test_id": attempt.test_id,
            "auto_submitted": req.auto_submitted,
        },
        db,
    )

    answered = await _count_answers(attempt_id, db)

    from sqlalchemy import func as sqlfunc
    q_count_result = await db.execute(
        select(sqlfunc.count(Question.id)).where(Question.test_id == attempt.test_id)
    )
    total = q_count_result.scalar_one_or_none() or 0

    # Determine which approved test (if any) the candidate should attempt
    # next, and mark the invitation COMPLETED once none remain.
    invitation = await _load_invitation_by_id(attempt.invitation_id, db)
    next_test_index, total_tests = (
        await get_test_progress(invitation, db) if invitation else (None, 0)
    )
    if invitation is not None and next_test_index is None:
        invitation.status = InvitationStatus.COMPLETED
        await db.commit()
        logger.info("Invitation completed", invitation_id=invitation.id)

    logger.info(
        "Attempt submitted",
        attempt_id=attempt_id,
        auto=req.auto_submitted,
        answered=answered,
        total=total,
        next_test_index=next_test_index,
        total_tests=total_tests,
    )

    return SubmitAttemptResponse(
        attempt_id=attempt_id,
        submitted_at=now,
        total_questions=total,
        answered_questions=answered,
        auto_submitted=req.auto_submitted,
        next_test_index=next_test_index,
        total_tests=total_tests,
    )


# ─── Suspicious events ────────────────────────────────────────

async def log_suspicious_event(
    attempt_id: str,
    req: SuspiciousEventRequest,
    token: str,
    db: AsyncSession,
) -> SuspiciousEventResponse:
    """
    Append a suspicious event for admin review.
    Never fails — integrity logging should not interrupt the test.
    """
    attempt = await _load_attempt_for_token(attempt_id, token, db)

    try:
        # Only log while the test is in progress
        if attempt.status == AttemptStatus.IN_PROGRESS:
            event = SuspiciousEvent(
                attempt_id=attempt_id,
                event_type=req.event_type,
                event_metadata=req.metadata,
            )
            db.add(event)
            await db.commit()
            logger.info(
                "Suspicious event logged",
                attempt_id=attempt_id,
                event_type=req.event_type,
            )
            return SuspiciousEventResponse(logged=True, event_type=req.event_type)
    except Exception as exc:
        logger.error(
            "Failed to log suspicious event",
            attempt_id=attempt_id,
            error=str(exc),
        )

    return SuspiciousEventResponse(logged=False, event_type=req.event_type)


# ─── Terminate (hard integrity enforcement) ────────────────────

async def terminate_attempt(
    attempt_id: str,
    req: TerminateAttemptRequest,
    token: str,
    db: AsyncSession,
) -> TerminateAttemptResponse:
    """
    Hard-terminate an attempt on a candidate-side integrity violation
    (tab switch, window blur, leaving the exam window).

    Ends BOTH this attempt and its parent invitation — this is what blocks
    every other test in a multi-test invitation, not just the current one.
    Idempotent: terminating an already-terminated (or otherwise finished)
    attempt returns its current state instead of erroring, so a frontend
    retry-after-network-failure can't double-write or crash.
    """
    attempt = await _load_attempt_for_token(attempt_id, token, db)

    if attempt.status in (
        AttemptStatus.SUBMITTED,
        AttemptStatus.EVALUATED,
        AttemptStatus.TERMINATED,
    ):
        return TerminateAttemptResponse(
            attempt_id=attempt.id,
            status=attempt.status.value,
            terminated_at=attempt.terminated_at or datetime.now(tz=UTC),
        )

    now = datetime.now(tz=UTC)
    attempt.status = AttemptStatus.TERMINATED
    attempt.terminated_at = now
    attempt.integrity_violation_reason = req.reason

    db.add(SuspiciousEvent(
        attempt_id=attempt_id,
        event_type=req.reason,
        event_metadata={**(req.metadata or {}), "led_to_termination": True},
    ))

    invitation = await _load_invitation_by_id(attempt.invitation_id, db)
    if invitation is not None:
        invitation.status = InvitationStatus.TERMINATED
        invitation.terminated_at = now
        invitation.integrity_violation_reason = req.reason

    await db.commit()

    logger.warning(
        "Attempt terminated for integrity violation",
        attempt_id=attempt_id,
        invitation_id=attempt.invitation_id,
        reason=req.reason,
    )

    await webhook_service.enqueue_event(
        "attempt.terminated",
        {
            "attempt_id": attempt.id,
            "invitation_id": attempt.invitation_id,
            "candidate_id": attempt.candidate_id,
            "test_id": attempt.test_id,
            "reason": req.reason,
        },
        db,
    )

    return TerminateAttemptResponse(
        attempt_id=attempt.id,
        status=attempt.status.value,
        terminated_at=now,
    )


# ─── Private helpers ──────────────────────────────────────────

async def _load_attempt(attempt_id: str, db: AsyncSession) -> TestAttempt:
    result = await db.execute(
        select(TestAttempt).where(TestAttempt.id == attempt_id)
    )
    attempt = result.scalar_one_or_none()
    if attempt is None:
        raise NotFoundError("TestAttempt", attempt_id)
    return attempt


async def _load_attempt_for_token(
    attempt_id: str, token: str, db: AsyncSession
) -> TestAttempt:
    """
    Load a TestAttempt and verify the supplied magic-link token belongs to it.

    Every candidate-facing mutation (save / bulk-save / heartbeat / submit / event)
    must go through this — not _load_attempt — so a valid token for one attempt
    can't be replayed against a different attempt_id.
    """
    from fastapi import HTTPException

    attempt = await _load_attempt(attempt_id, db)

    invitation = await _load_invitation_by_id(attempt.invitation_id, db)
    if invitation is None or not verify_token(token, invitation.token_hash):
        raise HTTPException(status_code=403, detail="Token does not match this attempt.")

    return attempt


async def _validate_question_ids(
    attempt: TestAttempt, question_ids: set[str], db: AsyncSession
) -> None:
    """
    Ensure every id in `question_ids` belongs to the test assigned to this
    attempt (Question.test_id == attempt.test_id).

    Every candidate-facing answer write (save / bulk-save / submit) must call
    this before touching CandidateAnswer rows, so a candidate can't use their
    valid token to write answers against questions from a different test.
    """
    from fastapi import HTTPException

    if not question_ids:
        return

    result = await db.execute(
        select(Question.id).where(
            Question.test_id == attempt.test_id,
            Question.id.in_(question_ids),
        )
    )
    valid_ids = {row[0] for row in result.all()}
    if valid_ids != question_ids:
        raise HTTPException(
            status_code=400,
            detail="One or more questions do not belong to this test.",
        )


def _compute_time_remaining(attempt: TestAttempt, test: Test) -> int:
    """
    Compute authoritative seconds remaining from server wall clock.
    Returns 0 if already expired.
    """
    if attempt.started_at is None:
        return test.duration_minutes * 60

    started = attempt.started_at
    if started.tzinfo is None:
        started = started.replace(tzinfo=UTC)

    elapsed = int((datetime.now(tz=UTC) - started).total_seconds())
    total = test.duration_minutes * 60
    return max(0, total - elapsed)


# Small tolerance for clock skew and an autosave that was already in flight when
# the timer hit zero. Writes arriving beyond this are past the real deadline.
_WRITE_GRACE_SECONDS = 15


def _is_past_deadline(attempt: TestAttempt, test: Test) -> bool:
    """True once the attempt is past its server-side deadline (+grace).

    The exam countdown is authoritative on the SERVER, computed from
    started_at + duration — not from the client. Answer writes are rejected
    past this point so a tampered/paused client can't keep answering after
    time expires. (See heartbeat, which surfaces force_submit to honest
    clients; this is the enforcement that does not depend on the client.)
    """
    if attempt.started_at is None:
        return False
    started = attempt.started_at
    if started.tzinfo is None:
        started = started.replace(tzinfo=UTC)
    elapsed = int((datetime.now(tz=UTC) - started).total_seconds())
    total = test.duration_minutes * 60
    return elapsed > total + _WRITE_GRACE_SECONDS


async def _count_answers(attempt_id: str, db: AsyncSession) -> int:
    from sqlalchemy import func
    result = await db.execute(
        select(func.count(CandidateAnswer.id)).where(
            CandidateAnswer.attempt_id == attempt_id
        )
    )
    return result.scalar_one()


async def _load_invitation_by_id(invitation_id: str, db: AsyncSession) -> Invitation | None:
    result = await db.execute(
        select(Invitation).where(Invitation.id == invitation_id)
    )
    return result.scalar_one_or_none()


async def get_test_progress(
    invitation: Invitation, db: AsyncSession
) -> tuple[int | None, int]:
    """
    Work out which approved-test index the candidate should attempt next.

    Tests are presented in the same `created_at` order `start_attempt` uses
    to resolve `test_index`, so the candidate UI can reuse this index directly.

    Returns (next_test_index, total_tests):
      - next_test_index — 0-based index of the first approved test that does
        NOT yet have a SUBMITTED/EVALUATED attempt for this invitation, or
        None once every approved test has been submitted/evaluated.
      - total_tests — number of approved tests in this invitation.
    """
    tests_result = await db.execute(
        select(Test.id)
        .where(
            Test.jd_id == invitation.jd_id,
            Test.status == TestStatus.APPROVED,
        )
        .order_by(Test.created_at)
    )
    approved_test_ids = [row[0] for row in tests_result.all()]

    submitted_result = await db.execute(
        select(TestAttempt.test_id).where(
            TestAttempt.invitation_id == invitation.id,
            TestAttempt.status.in_([AttemptStatus.SUBMITTED, AttemptStatus.EVALUATED]),
        )
    )
    submitted_test_ids = {row[0] for row in submitted_result.all()}

    for index, test_id in enumerate(approved_test_ids):
        if test_id not in submitted_test_ids:
            return index, len(approved_test_ids)

    return None, len(approved_test_ids)
