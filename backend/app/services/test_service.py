"""
Test Service — CRUD operations for Test and Question models.

Keeps route handlers thin; all DB logic lives here.
"""

from datetime import UTC, datetime
from typing import NamedTuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.db.models.enums import QuestionType, TestStatus
from app.db.models.job_description import JobDescription
from app.db.models.question_bank import ExamAttemptQuestion
from app.db.models.test import Question, Test
from app.schemas.test import (
    ApproveTestRequest,
    GenerateTestsResponse,
    QuestionResponse,
    TestResponse,
    TestSummaryResponse,
    UpdateQuestionRequest,
    UpdateTestRequest,
)
from app.services import attempt_service
from app.services.test_generation_service import (
    generate_tests_for_jd,
    regenerate_single_test,
)

logger = get_logger(__name__)


# ─── Generation ───────────────────────────────────────────────

async def trigger_generate_tests(jd_id: str, db: AsyncSession) -> GenerateTestsResponse:
    """
    Orchestrate full test generation for a JD.

    Validates pre-conditions, calls generation service, returns summary.
    Raises HTTPException (via FastAPI) for bad state.
    """
    from fastapi import HTTPException

    # Load JD with extracted data
    result = await db.execute(
        select(JobDescription)
        .options(selectinload(JobDescription.extracted_data))
        .where(JobDescription.id == jd_id)
    )
    jd = result.scalar_one_or_none()
    if jd is None:
        raise NotFoundError("JobDescription", jd_id)

    if jd.extracted_data is None:
        raise HTTPException(
            status_code=409,
            detail=(
                "JD has not been analyzed yet. "
                "Run skill extraction first (POST /jd/{id}/analyze)."
            ),
        )

    existing_test_ids = await _test_ids_for_jd(jd_id, db)
    is_regeneration = bool(existing_test_ids)

    extracted = jd.extracted_data
    diff = extracted.difficulty_distribution or {}

    tests = await generate_tests_for_jd(
        jd_id=jd_id,
        job_title=extracted.job_title or "Unknown Role",
        seniority_level=extracted.seniority_level or "mid",
        must_have_skills=list(extracted.must_have_skills or []),
        tools_technologies=list(extracted.tools_technologies or []),
        recommended_test_topics=list(extracted.recommended_test_topics or []),
        difficulty_distribution=dict(diff),
        db=db,
    )

    summaries = [_test_to_summary(t) for t in tests]
    for stale_test_id in set(existing_test_ids + [t.id for t in tests]):
        await attempt_service.invalidate_test_cache(test_id=stale_test_id)
    await attempt_service.invalidate_test_cache(jd_id=jd_id)
    return GenerateTestsResponse(
        jd_id=jd_id,
        tests=summaries,
        is_regeneration=is_regeneration,
        message=(
            "3 tests regenerated successfully."
            if is_regeneration
            else "3 tests generated successfully."
        ),
    )


async def trigger_regenerate_single(
    test_id: str, jd_id: str, db: AsyncSession
) -> TestResponse:
    """Regenerate one test slot, keeping the other two intact."""
    from fastapi import HTTPException

    result = await db.execute(
        select(JobDescription)
        .options(selectinload(JobDescription.extracted_data))
        .where(JobDescription.id == jd_id)
    )
    jd = result.scalar_one_or_none()
    if jd is None:
        raise NotFoundError("JobDescription", jd_id)

    if jd.extracted_data is None:
        raise HTTPException(
            status_code=409,
            detail="Run skill extraction before regenerating tests.",
        )

    # Get the test's current type
    test_result = await db.execute(
        select(Test).where(Test.id == test_id, Test.jd_id == jd_id)
    )
    test = test_result.scalar_one_or_none()
    if test is None:
        raise NotFoundError("Test", test_id)

    extracted = jd.extracted_data
    updated = await regenerate_single_test(
        test_id=test_id,
        jd_id=jd_id,
        test_type=test.test_type,
        job_title=extracted.job_title or "Unknown Role",
        seniority_level=extracted.seniority_level or "mid",
        must_have_skills=list(extracted.must_have_skills or []),
        tools_technologies=list(extracted.tools_technologies or []),
        recommended_test_topics=list(extracted.recommended_test_topics or []),
        difficulty_distribution=dict(extracted.difficulty_distribution or {}),
        db=db,
    )

    await attempt_service.invalidate_test_cache(test_id=test_id, jd_id=jd_id)
    return _test_to_response(updated)


# ─── Read ─────────────────────────────────────────────────────

async def assert_test_owner(
    test_id: str, db: AsyncSession, owner_id: str | None
) -> None:
    """Raise NotFoundError if owner_id is set and does not own the test's JD.
    A no-op for ADMIN+ (owner_id None). Called by mutation routes so a USER
    can only act on tests belonging to a JD they own."""
    if owner_id is None:
        return
    result = await db.execute(
        select(JobDescription.uploaded_by)
        .join(Test, Test.jd_id == JobDescription.id)
        .where(Test.id == test_id)
    )
    jd_owner = result.scalar_one_or_none()
    if jd_owner != owner_id:
        raise NotFoundError("Test", test_id)


async def assert_question_owner(
    question_id: str, db: AsyncSession, owner_id: str | None
) -> None:
    """Raise NotFoundError if owner_id is set and does not own the question's
    JD (via its test). A no-op for ADMIN+."""
    if owner_id is None:
        return
    result = await db.execute(
        select(JobDescription.uploaded_by)
        .join(Test, Test.jd_id == JobDescription.id)
        .join(Question, Question.test_id == Test.id)
        .where(Question.id == question_id)
    )
    jd_owner = result.scalar_one_or_none()
    if jd_owner != owner_id:
        raise NotFoundError("Question", question_id)


async def list_tests_for_jd(
    jd_id: str, db: AsyncSession, *, owner_id: str | None = None
) -> list[TestSummaryResponse]:
    """List all tests for a JD (summary cards, no questions).
    When owner_id is set, tests are returned only if the JD is owned by them."""
    stmt = (
        select(Test)
        .options(selectinload(Test.questions))
        .where(Test.jd_id == jd_id, Test.deleted_at.is_(None))
        .order_by(Test.created_at)
    )
    if owner_id is not None:
        stmt = stmt.join(JobDescription, Test.jd_id == JobDescription.id).where(
            JobDescription.uploaded_by == owner_id
        )
    result = await db.execute(stmt)
    tests = result.scalars().all()
    return [_test_to_summary(t) for t in tests]


async def get_test(
    test_id: str, db: AsyncSession, *, owner_id: str | None = None
) -> TestResponse:
    """Get a single test with all questions. When owner_id is set, a test whose
    JD is owned by someone else is treated as not found."""
    stmt = (
        select(Test)
        .options(selectinload(Test.questions))
        .where(Test.id == test_id, Test.deleted_at.is_(None))
    )
    if owner_id is not None:
        stmt = stmt.join(JobDescription, Test.jd_id == JobDescription.id).where(
            JobDescription.uploaded_by == owner_id
        )
    result = await db.execute(stmt)
    test = result.scalar_one_or_none()
    if test is None:
        raise NotFoundError("Test", test_id)
    return _test_to_response(test)


# ─── Update ───────────────────────────────────────────────────

async def update_test_metadata(
    test_id: str, req: UpdateTestRequest, db: AsyncSession
) -> TestResponse:
    """Update test title, description, duration, or difficulty."""
    result = await db.execute(
        select(Test).options(selectinload(Test.questions)).where(Test.id == test_id)
    )
    test = result.scalar_one_or_none()
    if test is None:
        raise NotFoundError("Test", test_id)

    if req.title is not None:
        test.title = req.title
    if req.description is not None:
        test.description = req.description
    if req.duration_minutes is not None:
        test.duration_minutes = req.duration_minutes
    if req.difficulty is not None:
        test.difficulty = req.difficulty
    if req.passing_marks is not None:
        # A pass mark above the total is unreachable — every candidate would
        # fail and nothing in the UI would explain why. Reject it here rather
        # than let it silently poison the leaderboard's Pass/Fail column.
        if req.passing_marks > test.total_marks:
            raise ValidationError(
                f"Passing marks ({req.passing_marks}) cannot exceed the test's "
                f"total marks ({test.total_marks})."
            )
        test.passing_marks = req.passing_marks

    jd_id = test.jd_id
    await db.commit()
    await attempt_service.invalidate_test_cache(test_id=test_id, jd_id=jd_id)
    await db.refresh(test)
    return _test_to_response(test)


async def set_test_status(
    test_id: str, req: ApproveTestRequest, db: AsyncSession
) -> TestResponse:
    """Approve, revert to draft, or archive a test."""
    result = await db.execute(
        select(Test).options(selectinload(Test.questions)).where(Test.id == test_id)
    )
    test = result.scalar_one_or_none()
    if test is None:
        raise NotFoundError("Test", test_id)

    test.status = TestStatus(req.status)
    jd_id = test.jd_id
    await db.commit()
    await attempt_service.invalidate_test_cache(test_id=test_id, jd_id=jd_id)
    await db.refresh(test)
    logger.info("Test status updated", test_id=test_id, status=req.status)
    return _test_to_response(test)


async def update_question(
    question_id: str, req: UpdateQuestionRequest, db: AsyncSession
) -> QuestionResponse:
    """Edit a single question's content."""
    result = await db.execute(
        select(Question)
        .options(selectinload(Question.test))
        .where(Question.id == question_id)
    )
    question = result.scalar_one_or_none()
    if question is None:
        raise NotFoundError("Question", question_id)

    if req.question_text is not None:
        question.question_text = req.question_text
    if req.skill_tested is not None:
        question.skill_tested = req.skill_tested
    if req.difficulty is not None:
        question.difficulty = req.difficulty
    if req.marks is not None:
        question.marks = req.marks

    # MCQ fields
    if req.options is not None:
        question.options = [o.model_dump() for o in req.options]
    if req.correct_answer is not None:
        question.correct_answer = req.correct_answer
    if req.explanation is not None:
        question.explanation = req.explanation

    # Open-ended fields
    if req.expected_answer is not None:
        question.expected_answer = req.expected_answer
    if req.scoring_rubric is not None:
        question.scoring_rubric = req.scoring_rubric

    # Coding fields
    if req.code_language is not None:
        question.code_language = req.code_language
    if req.code_starter is not None:
        question.code_starter = req.code_starter

    # Recompute test's total_marks
    test_id = question.test_id
    jd_id = question.test.jd_id
    await _recompute_total_marks(test_id, db)

    await db.commit()
    await attempt_service.invalidate_test_cache(test_id=test_id, jd_id=jd_id)
    await db.refresh(question)
    return QuestionResponse.model_validate(question)


class DeleteOutcome(NamedTuple):
    """Result of a (possibly blocked) delete. `deleted` is False when
    `in_use_question_ids` is non-empty and the caller didn't pass force=True
    — nothing was touched in that case."""

    deleted: bool
    deleted_count: int
    in_use_question_ids: list[str]


async def get_in_use_question_ids(question_ids: list[str], db: AsyncSession) -> list[str]:
    """Which of these question IDs are already locked into a candidate's
    exam attempt (app.db.models.question_bank.ExamAttemptQuestion). Hard-
    deleting one of these cascades the delete onto that attempt's record
    too (ON DELETE CASCADE) — silently destroying that candidate's audit
    trail — so callers must check this before deleting unless the caller
    explicitly opted in via force=True."""
    if not question_ids:
        return []
    result = await db.execute(
        select(ExamAttemptQuestion.question_id)
        .where(ExamAttemptQuestion.question_id.in_(question_ids))
        .distinct()
    )
    return [row[0] for row in result.all()]


async def delete_question(
    question_id: str, db: AsyncSession, *, force: bool = False
) -> DeleteOutcome:
    """Delete a single question from a test."""
    result = await db.execute(
        select(Question)
        .options(selectinload(Question.test))
        .where(Question.id == question_id)
    )
    question = result.scalar_one_or_none()
    if question is None:
        raise NotFoundError("Question", question_id)

    in_use_ids = await get_in_use_question_ids([question_id], db)
    if in_use_ids and not force:
        return DeleteOutcome(deleted=False, deleted_count=0, in_use_question_ids=in_use_ids)

    test_id = question.test_id
    jd_id = question.test.jd_id
    await db.delete(question)
    await db.flush()
    await _recompute_total_marks(test_id, db)
    await db.commit()
    await attempt_service.invalidate_test_cache(test_id=test_id, jd_id=jd_id)
    logger.info("Question deleted", question_id=question_id, test_id=test_id, force=force)
    return DeleteOutcome(deleted=True, deleted_count=1, in_use_question_ids=[])


async def bulk_delete_questions(
    test_id: str, question_ids: list[str], db: AsyncSession, *, force: bool = False
) -> DeleteOutcome:
    """Delete multiple questions from one test in a single transaction."""
    result = await db.execute(
        select(Question).where(Question.test_id == test_id, Question.id.in_(question_ids))
    )
    questions = list(result.scalars().all())
    if not questions:
        return DeleteOutcome(deleted=True, deleted_count=0, in_use_question_ids=[])

    found_ids = [q.id for q in questions]
    in_use_ids = await get_in_use_question_ids(found_ids, db)
    if in_use_ids and not force:
        return DeleteOutcome(deleted=False, deleted_count=0, in_use_question_ids=in_use_ids)

    test_result = await db.execute(select(Test.jd_id).where(Test.id == test_id))
    jd_id = test_result.scalar_one_or_none()

    for question in questions:
        await db.delete(question)
    await db.flush()
    await _recompute_total_marks(test_id, db)
    await db.commit()
    await attempt_service.invalidate_test_cache(test_id=test_id, jd_id=jd_id)
    logger.info(
        "Questions bulk deleted", test_id=test_id, count=len(questions), force=force
    )
    return DeleteOutcome(deleted=True, deleted_count=len(questions), in_use_question_ids=[])


# ─── Delete ───────────────────────────────────────────────────

async def delete_test(test_id: str, db: AsyncSession, *, force: bool = False) -> DeleteOutcome:
    """Delete a test and all its questions (cascade)."""
    result = await db.execute(
        select(Test).where(Test.id == test_id, Test.deleted_at.is_(None))
    )
    test = result.scalar_one_or_none()
    if test is None:
        raise NotFoundError("Test", test_id)

    question_ids_result = await db.execute(
        select(Question.id).where(Question.test_id == test_id)
    )
    question_ids = [row[0] for row in question_ids_result.all()]
    in_use_ids = await get_in_use_question_ids(question_ids, db)
    if in_use_ids and not force:
        return DeleteOutcome(deleted=False, deleted_count=0, in_use_question_ids=in_use_ids)

    jd_id = test.jd_id
    test.deleted_at = datetime.now(UTC)
    await db.commit()
    await attempt_service.invalidate_test_cache(test_id=test_id, jd_id=jd_id)
    logger.info("Test trashed", test_id=test_id, force=force)
    return DeleteOutcome(deleted=True, deleted_count=1, in_use_question_ids=[])


async def bulk_delete_tests(
    test_ids: list[str], db: AsyncSession, *, force: bool = False,
    owner_id: str | None = None,
) -> DeleteOutcome:
    """Delete multiple tests (and their questions) in one transaction —
    used by both "delete selected" and "delete all" on the tests list page.
    When owner_id is set, only tests under a JD owned by them are deleted
    (others in the list are silently skipped)."""
    stmt = select(Test).where(Test.id.in_(test_ids), Test.deleted_at.is_(None))
    if owner_id is not None:
        stmt = stmt.join(JobDescription, Test.jd_id == JobDescription.id).where(
            JobDescription.uploaded_by == owner_id
        )
    result = await db.execute(stmt)
    tests = list(result.scalars().all())
    if not tests:
        return DeleteOutcome(deleted=True, deleted_count=0, in_use_question_ids=[])

    found_test_ids = [t.id for t in tests]
    question_ids_result = await db.execute(
        select(Question.id).where(Question.test_id.in_(found_test_ids))
    )
    question_ids = [row[0] for row in question_ids_result.all()]
    in_use_ids = await get_in_use_question_ids(question_ids, db)
    if in_use_ids and not force:
        return DeleteOutcome(deleted=False, deleted_count=0, in_use_question_ids=in_use_ids)

    # Capture id/jd_id pairs before committing — the ORM objects are expired
    # after commit, so reading attributes off `test` afterwards would re-query.
    test_jd_pairs = [(t.id, t.jd_id) for t in tests]
    now = datetime.now(UTC)
    for test in tests:
        test.deleted_at = now
    await db.commit()
    for deleted_test_id, jd_id in test_jd_pairs:
        await attempt_service.invalidate_test_cache(test_id=deleted_test_id, jd_id=jd_id)
    logger.info("Tests bulk trashed", count=len(tests), force=force)
    return DeleteOutcome(deleted=True, deleted_count=len(tests), in_use_question_ids=[])


# ─── Trash (soft-delete) operations ───────────────────────────

async def list_trashed_tests(db: AsyncSession) -> list[Test]:
    """Return tests currently in the trash, most-recently-deleted first."""
    result = await db.execute(
        select(Test)
        .options(selectinload(Test.questions))
        .where(Test.deleted_at.is_not(None))
        .order_by(Test.deleted_at.desc())
    )
    return list(result.scalars().all())


async def restore_test(test_id: str, db: AsyncSession) -> None:
    """Restore a trashed test (clear deleted_at)."""
    result = await db.execute(
        select(Test).where(Test.id == test_id, Test.deleted_at.is_not(None))
    )
    test = result.scalar_one_or_none()
    if test is None:
        raise NotFoundError("Test", test_id)
    jd_id = test.jd_id
    test.deleted_at = None
    await db.commit()
    await attempt_service.invalidate_test_cache(test_id=test_id, jd_id=jd_id)
    logger.info("Test restored", test_id=test_id)


async def purge_test(test_id: str, db: AsyncSession) -> None:
    """Permanently delete a trashed test and its questions (cascade)."""
    result = await db.execute(
        select(Test).where(Test.id == test_id, Test.deleted_at.is_not(None))
    )
    test = result.scalar_one_or_none()
    if test is None:
        raise NotFoundError("Test", test_id)
    jd_id = test.jd_id
    await db.delete(test)
    await db.commit()
    await attempt_service.invalidate_test_cache(test_id=test_id, jd_id=jd_id)
    logger.info("Test purged", test_id=test_id)


# ─── Private helpers ──────────────────────────────────────────

def _test_to_summary(test: Test) -> TestSummaryResponse:
    mcq_count = sum(1 for q in test.questions if q.question_type == QuestionType.MCQ)
    oe_count = sum(
        1 for q in test.questions if q.question_type == QuestionType.OPEN_ENDED
    )
    code_count = sum(1 for q in test.questions if q.question_type == QuestionType.CODE)
    return TestSummaryResponse(
        id=test.id,
        jd_id=test.jd_id,
        test_type=test.test_type,
        title=test.title,
        duration_minutes=test.duration_minutes,
        total_marks=test.total_marks,
        difficulty=test.difficulty,
        status=test.status,
        passing_marks=test.passing_marks,
        question_count=len(test.questions),
        mcq_count=mcq_count,
        open_ended_count=oe_count,
        code_count=code_count,
        created_at=test.created_at,
        updated_at=test.updated_at,
    )


def _test_to_response(test: Test) -> TestResponse:
    questions = [QuestionResponse.model_validate(q) for q in test.questions]
    return TestResponse(
        id=test.id,
        jd_id=test.jd_id,
        test_type=test.test_type,
        title=test.title,
        description=test.description,
        duration_minutes=test.duration_minutes,
        total_marks=test.total_marks,
        passing_marks=test.passing_marks,
        difficulty=test.difficulty,
        status=test.status,
        questions=questions,
        created_at=test.created_at,
        updated_at=test.updated_at,
    )


async def _has_existing_tests(jd_id: str, db: AsyncSession) -> bool:
    return bool(await _test_ids_for_jd(jd_id, db))


async def _test_ids_for_jd(jd_id: str, db: AsyncSession) -> list[str]:
    result = await db.execute(select(Test.id).where(Test.jd_id == jd_id))
    return [row[0] for row in result.all()]


async def _recompute_total_marks(test_id: str, db: AsyncSession) -> None:
    """After any question change, recompute and save total_marks on the test."""
    result = await db.execute(
        select(Question.marks).where(Question.test_id == test_id)
    )
    marks = [row[0] for row in result.all()]
    total = sum(marks)

    test_result = await db.execute(select(Test).where(Test.id == test_id))
    test = test_result.scalar_one_or_none()
    if test:
        test.total_marks = total
