"""
Exam Assignment Service (Master Prompt 2).

Assigns a locked subset of questions from a job's question bank to one
candidate's ExamAttempt, using balanced randomization that prefers
under-used questions ("question rotation to reduce cheating").

Invariants:
  - Idempotent: calling assign_questions_for_attempt twice for the same
    exam_attempt returns the existing assignment instead of creating a
    second one (DB-enforced via ux_eaq_attempt_question + the existing-rows
    check below).
  - Locked: once written, exam_attempt_questions rows are never mutated or
    deleted by this service. They are both the assignment lock candidates
    answer against AND the audit trail of who received which questions.
  - No duplicates within one attempt: each section samples from a list with
    no replacement, and the DB unique index is the final guarantee even
    under a concurrent double-assignment race.
"""

import random

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.exceptions import ConflictError
from app.core.logging import get_logger
from app.db.models.enums import QuestionType, TestType
from app.db.models.question_bank import ExamAttempt, ExamAttemptQuestion, QuestionBank
from app.db.models.test import Question
from app.services.question_bank_service import SECTION_ORDER, fetch_active_questions

logger = get_logger(__name__)


async def assign_questions_for_attempt(
    exam_attempt: ExamAttempt,
    bank: QuestionBank,
    db: AsyncSession,
    *,
    seed: int | None = None,
) -> list[ExamAttemptQuestion]:
    """
    Assign 10 MCQ + 5 CQ per section (configurable) from the bank to this
    exam attempt, locking the choice in exam_attempt_questions.

    Raises:
        ConflictError: the bank doesn't have enough active questions in
                        some section to satisfy the configured counts.
    """
    existing = await _load_assigned(exam_attempt.id, db)
    if existing:
        logger.info(
            "Exam attempt already has locked questions — returning existing assignment",
            exam_attempt_id=exam_attempt.id,
        )
        return existing

    settings = get_settings()
    mcq_n = settings.exam_section_mcq_count
    cq_n = settings.exam_section_cq_count
    rng = random.Random(seed) if seed is not None else random.Random()

    rows: list[ExamAttemptQuestion] = []
    used_ids: set[str] = set()
    order = 0

    for section in SECTION_ORDER:
        mcq_pool = await fetch_active_questions(bank.id, section, QuestionType.MCQ, db)
        cq_pool = await fetch_active_questions(bank.id, section, QuestionType.OPEN_ENDED, db)

        if len(mcq_pool) < mcq_n or len(cq_pool) < cq_n:
            raise ConflictError(
                f"Question bank section {section.value} has only "
                f"{len(mcq_pool)} active MCQ / {len(cq_pool)} active CQ, "
                f"but {mcq_n} MCQ / {cq_n} CQ are required per candidate. "
                "Generate more questions for this section before assigning candidates.",
                error_code="INSUFFICIENT_BANK_FOR_ASSIGNMENT",
            )

        chosen = _balanced_sample(mcq_pool, mcq_n, rng) + _balanced_sample(cq_pool, cq_n, rng)
        for q in chosen:
            if q.id in used_ids:
                continue  # defensive — pools are disjoint by question_type, so this never fires
            used_ids.add(q.id)
            rows.append(
                ExamAttemptQuestion(
                    exam_attempt_id=exam_attempt.id,
                    question_id=q.id,
                    section_type=section.value,
                    question_type=q.question_type.value,
                    order_index=order,
                )
            )
            order += 1
            q.usage_count += 1

    for row in rows:
        db.add(row)

    try:
        await db.commit()
    except IntegrityError:
        # Lost a race against a concurrent assignment for this exact
        # exam_attempt_id (e.g. a retried request) — the unique index
        # caught it. Return the winner's rows instead of erroring.
        await db.rollback()
        logger.info(
            "Lost assignment race — loading winning assignment",
            exam_attempt_id=exam_attempt.id,
        )
        return await _load_assigned(exam_attempt.id, db)

    logger.info(
        "Questions assigned to exam attempt",
        exam_attempt_id=exam_attempt.id,
        bank_id=bank.id,
        total_questions=len(rows),
    )
    return rows


def _balanced_sample(pool: list[Question], n: int, rng: random.Random) -> list[Question]:
    """
    Prefer lower-usage questions; randomize among equally-used ones.

    `pool` is already ordered by usage_count ascending (fetch_active_questions).
    Groups by usage_count, shuffles within each tier, and fills from the
    lowest tier upward until `n` questions are chosen.
    """
    if len(pool) <= n:
        return list(pool)

    tiers: dict[int, list[Question]] = {}
    for q in pool:
        tiers.setdefault(q.usage_count, []).append(q)

    chosen: list[Question] = []
    for usage in sorted(tiers.keys()):
        tier = tiers[usage]
        rng.shuffle(tier)
        remaining = n - len(chosen)
        chosen.extend(tier[:remaining])
        if len(chosen) >= n:
            break
    return chosen


async def _load_assigned(exam_attempt_id: str, db: AsyncSession) -> list[ExamAttemptQuestion]:
    result = await db.execute(
        select(ExamAttemptQuestion)
        .where(ExamAttemptQuestion.exam_attempt_id == exam_attempt_id)
        .order_by(ExamAttemptQuestion.order_index)
    )
    return list(result.scalars().all())


async def get_assigned_question_ids(
    exam_attempt_id: str, section: TestType, db: AsyncSession
) -> list[str]:
    """Question IDs locked to this attempt for one section, in assigned order."""
    result = await db.execute(
        select(ExamAttemptQuestion.question_id)
        .where(
            ExamAttemptQuestion.exam_attempt_id == exam_attempt_id,
            ExamAttemptQuestion.section_type == section.value,
        )
        .order_by(ExamAttemptQuestion.order_index)
    )
    return [row[0] for row in result.all()]


async def count_assigned(exam_attempt_id: str, db: AsyncSession) -> int:
    result = await db.execute(
        select(func.count(ExamAttemptQuestion.id)).where(
            ExamAttemptQuestion.exam_attempt_id == exam_attempt_id
        )
    )
    return result.scalar_one()
