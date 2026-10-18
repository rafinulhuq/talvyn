"""
Question Bank Service (Master Prompt 2).

Generates and manages a reusable, per-JD question bank, scoped behind the
QUESTION_BANK_MODE feature flag. When the flag is off, nothing in this
module runs and the legacy generate_tests_for_jd() flow is unaffected.

Design:
  - One QuestionBank per JD. Actual questions are NOT duplicated into a new
    table — they live in the existing Test/Question tables, linked back via
    Test.question_bank_id. This reuses the schema the legacy flow already
    has instead of forking a parallel question store.
  - One Test row per section (REASONING / PRACTICAL / TECHNICAL), built up
    across MANY small batches (≤5 MCQ + ≤2 OE per LLM call — the ceiling the
    existing GeneratedTestAI schema already enforces) instead of one giant
    all-or-nothing call. Each batch is persisted as soon as it validates —
    a single late-batch failure does not discard earlier successful batches,
    unlike the legacy generate_tests_for_jd() all-or-nothing behavior.
  - Completeness is judged against two thresholds (both configurable via
    Settings): a MINIMUM below which the bank is FAILED and never assignable,
    and a COMMERCIAL recommended size below which the bank is READY but
    flagged "below_recommended" so admins know to keep generating.
"""

import json

import redis.asyncio as aioredis
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.exceptions import AIResponseParseError, ConflictError, NotFoundError
from app.core.grading import default_passing_marks
from app.core.logging import get_logger
from app.db.models.enums import (
    Difficulty,
    QuestionBankStatus,
    QuestionType,
    TestStatus,
    TestType,
)
from app.db.models.job_description import JdExtractedData
from app.db.models.question_bank import QuestionBank
from app.db.models.test import Question, Test
from app.prompts.glm_tasks import BANK_GENERATION, QUESTION_REVIEW
from app.schemas.ai_orchestration import (
    GlmBankSectionAI,
    GlmCqQuestionAI,
    GlmMcqQuestionAI,
    GlmQuestionReviewAI,
)
from app.services import ai_provider_service, ai_task_router_service
from app.services.ai_provider_service import AiGenerateRequest
from app.services.test_generation_service import (
    _TEST_TYPE_CONFIG,
    build_questions_from_batch,
    generate_question_batch,
)

logger = get_logger(__name__)

# Section order is fixed and matches Master Prompt 2's candidate-facing order.
SECTION_ORDER: list[TestType] = [TestType.REASONING, TestType.PRACTICAL, TestType.TECHNICAL]

# Max questions per batch — matches the existing GeneratedTestAI schema's
# truncate_mcq_list/truncate_oe_list ceiling (5 MCQ + 2 OE). Requesting more
# per call would just be silently discarded, so batches are capped here too.
_MAX_BATCH_BATCHES = 12  # hard safety cap: 12 × 5 MCQ = 60 MCQ ceiling per section


# ── Redis-backed generation progress ─────────────────────────
# Same pattern as test_generation_service's progress tracking, but with its
# own key prefix — both features key off jd_id and would otherwise clobber
# each other's progress under the same key. Written by run_bank_sections(),
# read by GET .../question-bank/progress (and its SSE stream variant).
_redis: aioredis.Redis | None = None


def set_redis_client(client: aioredis.Redis) -> None:
    global _redis
    _redis = client


def _progress_key(jd_id: str) -> str:
    safe = "".join(c for c in jd_id if c.isalnum() or c == "-")
    return f"bank_progress:{safe}"


async def _set_progress(jd_id: str, step: str, pct: int, detail: str = "") -> None:
    if not _redis:
        return
    try:
        await _redis.setex(
            _progress_key(jd_id), 3600, json.dumps({"step": step, "pct": pct, "detail": detail})
        )
    except Exception:
        pass


async def get_progress(jd_id: str) -> dict:
    if not _redis:
        return {"step": "", "pct": 0, "detail": ""}
    try:
        raw = await _redis.get(_progress_key(jd_id))
        return json.loads(raw) if raw else {"step": "", "pct": 0, "detail": ""}
    except Exception:
        return {"step": "", "pct": 0, "detail": ""}


async def clear_progress(jd_id: str) -> None:
    if not _redis:
        return
    try:
        await _redis.delete(_progress_key(jd_id))
    except Exception:
        pass

# Same per-call ceiling for the GLM path (see _generate_section_glm) — GLM_MODEL
# is config-driven and may resolve to a small local model, which reliably times
# out or truncates JSON when asked for a full 40+20 section in one call.
_GLM_BATCH_MCQ = 5
_GLM_BATCH_CQ = 2


def _target_counts(mcq_target: int | None, cq_target: int | None) -> tuple[int, int]:
    s = get_settings()
    return (
        mcq_target or s.bank_mcq_commercial,
        cq_target or s.bank_cq_commercial,
    )


# ─── Create / generate ─────────────────────────────────────────

async def start_bank_generation(
    jd_id: str,
    db: AsyncSession,
    *,
    mcq_target: int | None = None,
    cq_target: int | None = None,
    generation_model: str | None = None,
) -> QuestionBank:
    """
    Fast path: validate + create the QuestionBank row (status=GENERATING)
    and commit. No LLM calls — safe to run synchronously inside an HTTP
    request. The actual section generation (run_bank_sections, which can
    take 20-40+ minutes) is the caller's responsibility to run separately —
    see question_banks.py's /generate endpoint, which enqueues it as an ARQ
    job instead of awaiting it inline.

    Raises:
        ConflictError: a non-archived bank already exists for this JD
                       (call regenerate_bank_for_jd instead)
        NotFoundError: the JD has no extracted skills yet (run JD analysis first)
    """
    settings = get_settings()
    if not settings.question_bank_mode:
        raise ConflictError(
            "Question bank generation is disabled (QUESTION_BANK_MODE=false).",
            error_code="QUESTION_BANK_MODE_DISABLED",
        )

    existing = await _load_active_bank(jd_id, db)
    if existing is not None:
        raise ConflictError(
            f"An active question bank already exists for this job "
            f"(status={existing.status.value}). Archive it first or use regenerate.",
            error_code="BANK_ALREADY_EXISTS",
        )

    jd_result = await db.execute(
        select(JdExtractedData).where(JdExtractedData.jd_id == jd_id)
    )
    extracted = jd_result.scalar_one_or_none()
    if extracted is None:
        raise NotFoundError("JdExtractedData", jd_id)

    target_mcq, target_cq = _target_counts(mcq_target, cq_target)

    # Resolved ONCE per bank — every section uses the same provider, so a
    # bank is never a mix of GLM-quality and local-quality sections. Falls
    # back to "local" automatically when GLM isn't configured (ai_task_router_service).
    provider = ai_task_router_service.choose_provider("question_bank_generation")
    model_name = settings.glm_model if provider == "glm" else settings.ollama_model

    bank = QuestionBank(
        jd_id=jd_id,
        status=QuestionBankStatus.GENERATING,
        generation_model=generation_model or model_name,
        bank_config_json={
            "mcq_target_per_section": target_mcq,
            "cq_target_per_section": target_cq,
            "provider": provider,
        },
        generation_metadata_json={"sections": {}},
    )
    db.add(bank)
    await db.commit()
    await db.refresh(bank)
    # Reset progress immediately so the UI doesn't show 100%/"Done" from a
    # previous run while the new ARQ job is still queued behind whatever
    # else the (single-concurrency) worker is doing.
    await _set_progress(jd_id, "Queued…", 0)
    return bank


async def _remove_existing_section_test(bank_id: str, test_type: TestType, db: AsyncSession) -> None:
    """Delete any Test (and its Questions) already linked to this
    (bank_id, test_type) pair. Called right before generating a section so
    a retried/resumed job replaces a partial prior attempt instead of
    stacking another duplicate Test row alongside it."""
    result = await db.execute(
        select(Test.id).where(Test.question_bank_id == bank_id, Test.test_type == test_type)
    )
    existing_ids = [row[0] for row in result.all()]
    if not existing_ids:
        return
    await db.execute(delete(Question).where(Question.test_id.in_(existing_ids)))
    await db.execute(delete(Test).where(Test.id.in_(existing_ids)))
    await db.commit()


async def run_bank_sections(
    bank: QuestionBank,
    extracted: JdExtractedData,
    target_mcq: int,
    target_cq: int,
    provider: str,
    db: AsyncSession,
) -> None:
    """
    The slow part of bank generation: all 3 sections, the automated quality
    review, and the final READY/FAILED status — split out of
    start_bank_generation so it can run inside an ARQ background job
    instead of blocking the HTTP request that kicked it off. Sets bank
    status to FAILED on any unhandled exception rather than leaving it
    stuck at GENERATING forever.
    """
    jd_id = bank.jd_id
    # Each section gets an equal slice of 0-90%; the review pass + finalize
    # take the last 10%. Sections are the only real granularity available
    # without restructuring the batch loops themselves — matches the
    # coarseness of test_generation_service's per-test progress.
    section_span = 90 // len(SECTION_ORDER)
    try:
        await _set_progress(jd_id, "Starting question bank generation…", 0)

        metadata: dict = {"sections": {}}
        seed_base = abs(hash(jd_id)) % 10_000

        for section_index, test_type in enumerate(SECTION_ORDER):
            # Re-check this bank is still the active one before each section.
            # start_bank_regeneration() archives the current bank SYNCHRONOUSLY
            # inside the HTTP request, independent of whatever this (separate
            # worker process) job is doing — if an admin clicks "Regenerate"
            # again while this job is still mid-run, the bank gets archived
            # out from under it. Without this check the job has no way to
            # know and keeps inserting Test rows under a dead bank_id.
            await db.refresh(bank)
            if bank.status != QuestionBankStatus.GENERATING:
                logger.warning(
                    "run_bank_sections: bank superseded mid-run — aborting",
                    bank_id=bank.id,
                    jd_id=jd_id,
                    status=bank.status.value,
                )
                await _set_progress(jd_id, "Superseded by a newer regeneration", 100)
                return

            # If a previous attempt at this section already exists — e.g. an
            # ARQ retry after the worker restarted mid-run — remove it before
            # generating a fresh one. Without this, _generate_section{,_glm}
            # unconditionally inserts a new Test row every time this loop
            # runs, so a retried job stacks duplicate sections instead of
            # replacing the interrupted one.
            await _remove_existing_section_test(bank.id, test_type, db)

            await _set_progress(
                jd_id,
                f"Generating {test_type.value.title()} section…",
                section_index * section_span,
                f"Section {section_index + 1} of {len(SECTION_ORDER)}",
            )
            if provider == "glm":
                section_meta = await _generate_section_glm(
                    bank_id=bank.id,
                    jd_id=jd_id,
                    test_type=test_type,
                    extracted=extracted,
                    target_mcq=target_mcq,
                    target_cq=target_cq,
                    db=db,
                )
            else:
                section_meta = await _generate_section(
                    bank_id=bank.id,
                    jd_id=jd_id,
                    test_type=test_type,
                    extracted=extracted,
                    target_mcq=target_mcq,
                    target_cq=target_cq,
                    seed=seed_base + section_index * 17,
                    db=db,
                )
            metadata["sections"][test_type.value] = section_meta

        # "After generation, run a [quality] review pass" — automatic, not
        # gated behind a separate admin click. Runs BEFORE the completeness
        # check below since marking weak questions inactive can change counts.
        await _set_progress(jd_id, "Reviewing question quality…", 90)
        metadata["review"] = await run_automated_quality_review(bank.id, db, jd_id=jd_id)

        bank.generation_metadata_json = metadata
        completeness = await _completeness_for_bank(bank.id, db)
        bank.status = (
            QuestionBankStatus.READY if completeness["ready"] else QuestionBankStatus.FAILED
        )
        await db.commit()

        logger.info(
            "Question bank generation finished",
            bank_id=bank.id,
            jd_id=jd_id,
            provider=provider,
            status=bank.status.value,
            below_recommended=completeness["below_recommended"],
        )
        await _set_progress(
            jd_id,
            "Done" if bank.status == QuestionBankStatus.READY else "Failed — below minimum size",
            100,
        )
    except Exception:
        logger.exception(
            "Question bank generation failed unexpectedly — marking FAILED",
            bank_id=bank.id,
            jd_id=jd_id,
        )
        bank.status = QuestionBankStatus.FAILED
        await db.commit()
        await _set_progress(jd_id, "Failed — unexpected error", 100)


async def create_bank_for_jd(
    jd_id: str,
    db: AsyncSession,
    *,
    mcq_target: int | None = None,
    cq_target: int | None = None,
    generation_model: str | None = None,
) -> QuestionBank:
    """
    Generate a reusable question bank for a JD end-to-end, synchronously —
    one Test per section, built up from many small batches, persisted
    incrementally. Kept as a single synchronous call for direct callers
    (tests); the API endpoint instead calls start_bank_generation() and
    enqueues run_bank_sections() as a separate ARQ job so the slow part
    never blocks the HTTP request (see question_banks.py).

    Raises:
        ConflictError: a non-archived bank already exists for this JD
                       (call regenerate_bank_for_jd instead)
        NotFoundError: the JD has no extracted skills yet (run JD analysis first)
    """
    jd_result = await db.execute(
        select(JdExtractedData).where(JdExtractedData.jd_id == jd_id)
    )
    extracted = jd_result.scalar_one_or_none()

    bank = await start_bank_generation(
        jd_id,
        db,
        mcq_target=mcq_target,
        cq_target=cq_target,
        generation_model=generation_model,
    )
    target_mcq = bank.bank_config_json["mcq_target_per_section"]
    target_cq = bank.bank_config_json["cq_target_per_section"]
    provider = bank.bank_config_json["provider"]

    await run_bank_sections(bank, extracted, target_mcq, target_cq, provider, db)
    await db.refresh(bank)
    return bank


async def continue_bank_generation(jd_id: str, db: AsyncSession) -> None:
    """
    ARQ background entrypoint: load the active (GENERATING) bank for this
    JD plus the JD's extracted skill data, and run the slow section-by-
    section generation. Used by both /generate and /regenerate — by the
    time this runs, start_bank_generation() has already created (and
    committed) the GENERATING bank row synchronously in the request, so
    there is always exactly one to find here.
    """
    bank = await _load_active_bank(jd_id, db)
    if bank is None or bank.status != QuestionBankStatus.GENERATING:
        logger.error(
            "continue_bank_generation: no GENERATING bank found", jd_id=jd_id
        )
        return

    jd_result = await db.execute(
        select(JdExtractedData).where(JdExtractedData.jd_id == jd_id)
    )
    extracted = jd_result.scalar_one_or_none()
    if extracted is None:
        logger.error(
            "continue_bank_generation: JD has no extracted data", jd_id=jd_id
        )
        bank.status = QuestionBankStatus.FAILED
        await db.commit()
        return

    target_mcq = bank.bank_config_json["mcq_target_per_section"]
    target_cq = bank.bank_config_json["cq_target_per_section"]
    provider = bank.bank_config_json["provider"]

    await run_bank_sections(bank, extracted, target_mcq, target_cq, provider, db)


async def _generate_section(
    *,
    bank_id: str,
    jd_id: str,
    test_type: TestType,
    extracted: JdExtractedData,
    target_mcq: int,
    target_cq: int,
    seed: int,
    db: AsyncSession,
) -> dict:
    """Generate one section's worth of questions in batches, persisting
    each batch as soon as it validates. Returns generation metadata for
    this section — never raises; failures are recorded, not propagated,
    so one section's exhaustion doesn't discard the other two."""
    test = Test(
        jd_id=jd_id,
        question_bank_id=bank_id,
        test_type=test_type,
        title=f"{test_type.value.title()} Section — Question Bank",
        description=f"Reusable {test_type.value.lower()} question bank section.",
        duration_minutes=45,
        total_marks=0,
        difficulty=Difficulty.MIXED,
        status=TestStatus.DRAFT,
    )
    db.add(test)
    await db.flush()

    mcq_count = 0
    cq_count = 0
    order_index = 0
    batches_run = 0
    batch_errors: list[str] = []

    difficulty_distribution = extracted.difficulty_distribution or {}

    while (mcq_count < target_mcq or cq_count < target_cq) and batches_run < _MAX_BATCH_BATCHES:
        batches_run += 1
        try:
            validated = await generate_question_batch(
                test_type=test_type,
                job_title=extracted.job_title or "Unknown Role",
                seniority_level=extracted.seniority_level or "Unknown",
                must_have_skills=extracted.must_have_skills or [],
                tools_technologies=extracted.tools_technologies or [],
                recommended_test_topics=extracted.recommended_test_topics or [],
                difficulty_distribution=difficulty_distribution,
                seed=seed + batches_run,
            )
        except AIResponseParseError as exc:
            batch_errors.append(str(exc)[:200])
            logger.warning(
                "Question bank batch failed — keeping prior batches",
                bank_id=bank_id,
                test_type=test_type.value,
                batch=batches_run,
                error=str(exc)[:200],
            )
            continue

        new_questions = build_questions_from_batch(test.id, validated, order_index)
        for q in new_questions:
            db.add(q)
        await db.flush()

        order_index += len(new_questions)
        mcq_count += sum(1 for q in new_questions if q.question_type == QuestionType.MCQ)
        cq_count += sum(1 for q in new_questions if q.question_type == QuestionType.OPEN_ENDED)

    test.total_marks = await _sum_marks(test.id, db)
    # Set only once the section actually has marks, and never over an admin's
    # manual override — these tests are created with total_marks=0, so the
    # pass mark can't be computed until the questions have landed.
    if test.passing_marks is None:
        test.passing_marks = default_passing_marks(test.total_marks)
    await db.flush()

    return {
        "test_id": test.id,
        "batches_run": batches_run,
        "mcq_generated": mcq_count,
        "cq_generated": cq_count,
        "errors": batch_errors,
    }


async def _sum_marks(test_id: str, db: AsyncSession) -> int:
    result = await db.execute(
        select(func.coalesce(func.sum(Question.marks), 0)).where(Question.test_id == test_id)
    )
    return int(result.scalar_one())


# ─── GLM-path generation (small batches + corrections, like local) ─

async def _generate_section_glm(
    *,
    bank_id: str,
    jd_id: str,
    test_type: TestType,
    extracted: JdExtractedData,
    target_mcq: int,
    target_cq: int,
    db: AsyncSession,
) -> dict:
    """
    Generate one section's worth of questions in small GLM batches (same
    _GLM_BATCH_MCQ/_GLM_BATCH_CQ ceiling as the local path's batches),
    persisting each batch as soon as it validates. GLM_MODEL is config-driven
    and may resolve to a small local model rather than a true cloud "quality"
    model, so asking for the full 40+20 target in one call reliably times out
    or truncates JSON; small batches keep each call's latency and output size
    bounded, and one bad batch no longer zeroes out the whole section.
    """
    test = Test(
        jd_id=jd_id,
        question_bank_id=bank_id,
        test_type=test_type,
        title=f"{test_type.value.title()} Section — Question Bank",
        description=f"Reusable {test_type.value.lower()} question bank section.",
        duration_minutes=45,
        total_marks=0,
        difficulty=Difficulty.MIXED,
        status=TestStatus.DRAFT,
    )
    db.add(test)
    await db.flush()

    config = _TEST_TYPE_CONFIG.get(test_type, _TEST_TYPE_CONFIG[TestType.TECHNICAL])
    difficulty_distribution = extracted.difficulty_distribution or {}

    mcq_count = 0
    cq_count = 0
    order_index = 0
    batches_run = 0
    errors: list[str] = []

    while (mcq_count < target_mcq or cq_count < target_cq) and batches_run < _MAX_BATCH_BATCHES:
        batches_run += 1
        prompt = BANK_GENERATION.generation_template.format(
            mcq_count=_GLM_BATCH_MCQ,
            cq_count=_GLM_BATCH_CQ,
            section_name=test_type.value.title(),
            job_title=extracted.job_title or "Unknown Role",
            seniority_level=extracted.seniority_level or "Unknown",
            must_have_skills=", ".join((extracted.must_have_skills or [])[:15]),
            tools_technologies=", ".join((extracted.tools_technologies or [])[:10]),
            recommended_test_topics=", ".join((extracted.recommended_test_topics or [])[:8]),
            section_goal=config["goal"],
            easy_pct=difficulty_distribution.get("easy_percent", 30),
            medium_pct=difficulty_distribution.get("medium_percent", 50),
            hard_pct=difficulty_distribution.get("hard_percent", 20),
        )

        req = AiGenerateRequest(
            task_type="question_bank_generation",
            system_prompt=BANK_GENERATION.system,
            user_prompt=prompt,
            model_preference="glm",
            expected_json_schema=GlmBankSectionAI,
            metadata={"jd_id": jd_id},
        )
        response = await ai_provider_service.generate_with_correction(
            req,
            build_correction_prompt=lambda errors_, previous: BANK_GENERATION.correction_template.format(
                errors=errors_, previous_response=previous, mcq_count=_GLM_BATCH_MCQ, cq_count=_GLM_BATCH_CQ,
            ),
            max_corrections=2,
            db=db,
        )

        if not (response.success and response.parsed_json is not None):
            errors.append((response.error or "GLM generation failed")[:200])
            logger.warning(
                "GLM bank section batch failed — keeping prior batches",
                bank_id=bank_id,
                test_type=test_type.value,
                batch=batches_run,
                error=errors[-1],
            )
            continue

        validated: GlmBankSectionAI = response.parsed_json
        new_questions = _build_glm_questions(test.id, validated, start_order=order_index)
        for q in new_questions:
            db.add(q)
        await db.flush()

        order_index += len(new_questions)
        mcq_count += sum(1 for q in new_questions if q.question_type == QuestionType.MCQ)
        cq_count += sum(1 for q in new_questions if q.question_type == QuestionType.OPEN_ENDED)

    test.total_marks = await _sum_marks(test.id, db)
    # Set only once the section actually has marks, and never over an admin's
    # manual override — these tests are created with total_marks=0, so the
    # pass mark can't be computed until the questions have landed.
    if test.passing_marks is None:
        test.passing_marks = default_passing_marks(test.total_marks)
    await db.flush()

    return {
        "test_id": test.id,
        "provider": "glm",
        "batches_run": batches_run,
        "mcq_generated": mcq_count,
        "cq_generated": cq_count,
        "errors": errors,
    }


def _build_glm_questions(test_id: str, validated: GlmBankSectionAI, start_order: int = 0) -> list[Question]:
    """Convert GLM's validated bank-section output into Question ORM rows."""
    questions: list[Question] = []
    order = start_order

    for mcq in validated.mcq_questions:
        questions.append(_glm_mcq_to_question(test_id, mcq, order))
        order += 1
    for cq in validated.cq_questions:
        questions.append(_glm_cq_to_question(test_id, cq, order))
        order += 1

    return questions


def _glm_mcq_to_question(test_id: str, mcq: GlmMcqQuestionAI, order: int) -> Question:
    return Question(
        test_id=test_id,
        question_type=QuestionType.MCQ,
        question_text=mcq.question_text,
        skill_tested=mcq.skill_tags[0] if mcq.skill_tags else None,
        skill_tags_json=mcq.skill_tags,
        topic_tags_json=mcq.topic_tags,
        estimated_time_seconds=mcq.estimated_time_seconds,
        difficulty=Difficulty(mcq.difficulty),
        marks=2,
        order_index=order,
        options=[o.model_dump() for o in mcq.options],
        correct_answer=mcq.correct_answer,
        explanation=mcq.explanation,
    )


def _glm_cq_to_question(test_id: str, cq: GlmCqQuestionAI, order: int) -> Question:
    return Question(
        test_id=test_id,
        question_type=QuestionType.OPEN_ENDED,
        question_text=cq.question_text,
        skill_tested=cq.skill_tags[0] if cq.skill_tags else None,
        skill_tags_json=cq.skill_tags,
        topic_tags_json=cq.topic_tags,
        estimated_time_seconds=cq.estimated_time_seconds,
        difficulty=Difficulty(cq.difficulty),
        marks=cq.total_marks,
        order_index=order,
        expected_answer="\n".join(f"- {p}" for p in cq.expected_answer_points),
        scoring_rubric=cq.rubric,
    )


# ─── Completeness / readiness ──────────────────────────────────

async def _completeness_for_bank(bank_id: str, db: AsyncSession) -> dict:
    """Per-section active MCQ/CQ counts vs minimum + commercial thresholds."""
    settings = get_settings()
    result = await db.execute(
        select(Test.test_type, Question.question_type, func.count(Question.id))
        .join(Question, Question.test_id == Test.id)
        .where(Test.question_bank_id == bank_id, Question.is_active.is_(True))
        .group_by(Test.test_type, Question.question_type)
    )
    rows = result.all()

    counts: dict[str, dict[str, int]] = {
        t.value: {"mcq": 0, "cq": 0} for t in SECTION_ORDER
    }
    for test_type, question_type, count in rows:
        key = "mcq" if question_type == QuestionType.MCQ else "cq"
        counts.setdefault(test_type.value, {"mcq": 0, "cq": 0})[key] = count

    sections: dict[str, dict] = {}
    ready = True
    below_recommended = False
    for section in SECTION_ORDER:
        mcq = counts.get(section.value, {}).get("mcq", 0)
        cq = counts.get(section.value, {}).get("cq", 0)
        meets_minimum = mcq >= settings.bank_mcq_minimum and cq >= settings.bank_cq_minimum
        meets_commercial = mcq >= settings.bank_mcq_commercial and cq >= settings.bank_cq_commercial
        if not meets_minimum:
            ready = False
        if not meets_commercial:
            below_recommended = True
        sections[section.value] = {
            "mcq": mcq,
            "cq": cq,
            "meets_minimum": meets_minimum,
            "meets_commercial_recommended": meets_commercial,
        }

    return {"ready": ready, "below_recommended": below_recommended, "sections": sections}


async def get_bank_status(jd_id: str, db: AsyncSession) -> dict:
    """Status payload for GET /jobs/:jobId/question-bank/status."""
    bank = await _load_active_bank(jd_id, db)
    if bank is None:
        return {"exists": False, "status": None, "ready": False, "below_recommended": False, "sections": {}}

    completeness = await _completeness_for_bank(bank.id, db)
    tests_result = await db.execute(select(Test.status).where(Test.question_bank_id == bank.id))
    test_statuses = [row[0] for row in tests_result.all()]
    is_approved = bool(test_statuses) and all(s == TestStatus.APPROVED for s in test_statuses)

    return {
        "exists": True,
        "bank_id": bank.id,
        "status": bank.status.value,
        "ready": completeness["ready"],
        "below_recommended": completeness["below_recommended"],
        "is_approved": is_approved,
        "sections": completeness["sections"],
    }


# ─── Fetch for assignment ──────────────────────────────────────

async def fetch_active_questions(
    bank_id: str, section_type: TestType, question_type: QuestionType, db: AsyncSession
) -> list[Question]:
    """Active questions for one section/type — the pool ExamAssignmentService
    draws a locked subset from. Ordered by usage_count ascending so the
    caller can prefer under-used questions without a second query."""
    result = await db.execute(
        select(Question)
        .join(Test, Test.id == Question.test_id)
        .where(
            Test.question_bank_id == bank_id,
            Test.test_type == section_type,
            Question.question_type == question_type,
            Question.is_active.is_(True),
        )
        .order_by(Question.usage_count.asc())
    )
    return list(result.scalars().all())


# ─── Archive / regenerate ───────────────────────────────────────

async def archive_bank(bank_id: str, db: AsyncSession) -> QuestionBank:
    """Archive a bank and its section Test rows without deleting anything —
    exam_attempt_questions rows already locked against these questions
    remain valid (the audit trail must never disappear)."""
    bank = await _load_bank(bank_id, db)
    bank.status = QuestionBankStatus.ARCHIVED
    result = await db.execute(select(Test).where(Test.question_bank_id == bank_id))
    for test in result.scalars().all():
        test.status = TestStatus.ARCHIVED
    await db.commit()
    await db.refresh(bank)
    logger.info("Question bank archived", bank_id=bank_id)
    return bank


async def start_bank_regeneration(
    jd_id: str,
    db: AsyncSession,
    *,
    mcq_target: int | None = None,
    cq_target: int | None = None,
) -> QuestionBank:
    """
    Fast path: archive the current active bank (if any) and create a fresh
    GENERATING shell row — no LLM calls, safe to run synchronously inside
    an HTTP request. Mirrors start_bank_generation(); the caller (the
    /regenerate endpoint) enqueues run_bank_sections() as a separate ARQ
    job for the slow part.
    """
    existing = await _load_active_bank(jd_id, db)
    if existing is not None:
        await archive_bank(existing.id, db)

    return await start_bank_generation(jd_id, db, mcq_target=mcq_target, cq_target=cq_target)


async def regenerate_bank_for_jd(
    jd_id: str,
    db: AsyncSession,
    *,
    mcq_target: int | None = None,
    cq_target: int | None = None,
) -> QuestionBank:
    """Archive the current active bank (if any) and generate a fresh one,
    end-to-end, synchronously. Kept for direct callers (tests); the API
    endpoint uses start_bank_regeneration() + an ARQ job instead — see
    regenerate_bank_for_jd's docstring twin, create_bank_for_jd.

    A new QuestionBank id is created rather than mutating the old one in
    place — historical exam_attempt_questions rows keep pointing at the
    old (now-archived) questions, which is the whole point of the audit
    trail this redesign requires.
    """
    existing = await _load_active_bank(jd_id, db)
    if existing is not None:
        await archive_bank(existing.id, db)

    return await create_bank_for_jd(jd_id, db, mcq_target=mcq_target, cq_target=cq_target)


# ─── Quality review (Master Prompt 3) ──────────────────────────

async def run_automated_quality_review(bank_id: str, db: AsyncSession, *, jd_id: str | None = None) -> dict:
    """
    GLM (or local-fallback) review pass over each section's active
    questions: relevance, duplicate detection, difficulty balance, vague/
    impossible/answer-leaking questions, rubric usability, MCQ plausibility.

    Flagged questions are deactivated immediately, then ONE combined repair
    attempt is made per section for all flagged questions together (one
    call, not one per question — same cost-control principle as everything
    else in this redesign). Successfully-repaired questions are reactivated
    with their fixed text; questions that fail repair stay inactive,
    exactly matching the prompt's own fallback rule ("if not possible, mark
    inactive and generate replacements later").

    Never raises — a review failure just means quality_score stays None
    and no questions get deactivated; the bank's readiness is unaffected.
    """
    provider = ai_task_router_service.choose_provider("question_review")
    review_summary: dict[str, dict] = {}

    for section in SECTION_ORDER:
        result = await db.execute(
            select(Question)
            .join(Test, Test.id == Question.test_id)
            .where(
                Test.question_bank_id == bank_id,
                Test.test_type == section,
                Question.is_active.is_(True),
            )
            .order_by(Question.order_index)
        )
        questions = list(result.scalars().all())
        if not questions:
            continue

        listing = "\n".join(f"{i}: {q.question_text}" for i, q in enumerate(questions))
        prompt = QUESTION_REVIEW.review_template.format(
            question_count=len(questions),
            section_name=section.value.title(),
            job_title="this role",
            seniority_level="",
            questions_listing=listing,
        )
        req = AiGenerateRequest(
            task_type="question_review",
            system_prompt=QUESTION_REVIEW.system,
            user_prompt=prompt,
            model_preference=provider,
            expected_json_schema=GlmQuestionReviewAI,
            metadata={"jd_id": jd_id} if jd_id else {},
        )
        response = await ai_provider_service.generate(req, db=db)

        if not response.success or response.parsed_json is None:
            logger.warning(
                "Question review failed — skipping for this section",
                bank_id=bank_id, section=section.value, error=response.error,
            )
            continue

        review: GlmQuestionReviewAI = response.parsed_json
        flagged_indices = {int(i) for i in review.questions_to_fix if i.isdigit() and int(i) < len(questions)}
        for i in flagged_indices:
            questions[i].quality_score = review.quality_score
            questions[i].is_active = False

        repaired = 0
        if flagged_indices:
            repaired = await _attempt_repair(bank_id, section, [questions[i] for i in flagged_indices], provider, db)

        for q in questions:
            if q.quality_score is None:
                q.quality_score = review.quality_score

        await db.flush()
        review_summary[section.value] = {
            "quality_score": review.quality_score,
            "flagged_count": len(flagged_indices),
            "repaired_count": repaired,
            "duplicate_groups": review.duplicate_groups,
            "difficulty_imbalance": review.difficulty_imbalance,
        }

    return review_summary


async def _attempt_repair(
    bank_id: str, section: TestType, flagged: list[Question], provider: str, db: AsyncSession
) -> int:
    """One combined repair call for every flagged question in a section.
    Returns how many were successfully fixed and reactivated."""
    logger.info(
        "Attempting automatic repair of flagged questions",
        bank_id=bank_id, section=section.value, flagged_count=len(flagged),
    )
    listing = "\n".join(f"{i}: [{q.question_type.value}] {q.question_text}" for i, q in enumerate(flagged))
    prompt = (
        f"The following {len(flagged)} questions were flagged as weak during review. "
        f"Rewrite each one to fix the issue (vague, impossible, leaks the answer, etc.) "
        f"while keeping the same question_type and approximate difficulty.\n\n{listing}\n\n"
        'Respond with {"fixed_questions": [{"index": int, "question_text": str}]} only.'
    )
    req = AiGenerateRequest(
        task_type="question_review",
        system_prompt=QUESTION_REVIEW.system,
        user_prompt=prompt,
        model_preference=provider,
        metadata={},
    )
    response = await ai_provider_service.generate(req, db=db)
    if not response.success or not response.raw_text:
        return 0

    try:
        from app.services.ollama_service import parse_json_response
        data = parse_json_response(response.raw_text)
        fixes = {int(f["index"]): str(f["question_text"]).strip() for f in data.get("fixed_questions", [])}
    except Exception:
        return 0

    repaired = 0
    for i, q in enumerate(flagged):
        new_text = fixes.get(i)
        if new_text and len(new_text) >= 5:
            q.question_text = new_text
            q.is_active = True
            repaired += 1
    return repaired


async def review_bank(bank_id: str, db: AsyncSession, *, reviewer_model: str | None = None) -> QuestionBank:
    """
    Mark a bank's section tests APPROVED, making them assignable. This is
    the human "admin signs off" step — the automated GLM/local quality
    review pass already ran at generation time (run_automated_quality_review);
    `reviewer_model` here just records who/what made the final approve call.
    """
    bank = await _load_bank(bank_id, db)
    if bank.status != QuestionBankStatus.READY:
        raise ConflictError(
            f"Cannot review a bank in status {bank.status.value}; it must be READY.",
            error_code="BANK_NOT_READY",
        )

    result = await db.execute(select(Test).where(Test.question_bank_id == bank_id))
    for test in result.scalars().all():
        test.status = TestStatus.APPROVED

    bank.review_model = reviewer_model
    await db.commit()
    await db.refresh(bank)
    logger.info("Question bank reviewed/approved", bank_id=bank_id, reviewer_model=reviewer_model)
    return bank


# ─── Loaders ────────────────────────────────────────────────────

async def _load_bank(bank_id: str, db: AsyncSession) -> QuestionBank:
    result = await db.execute(select(QuestionBank).where(QuestionBank.id == bank_id))
    bank = result.scalar_one_or_none()
    if bank is None:
        raise NotFoundError("QuestionBank", bank_id)
    return bank


async def _load_active_bank(jd_id: str, db: AsyncSession) -> QuestionBank | None:
    result = await db.execute(
        select(QuestionBank)
        .where(QuestionBank.jd_id == jd_id, QuestionBank.status != QuestionBankStatus.ARCHIVED)
        .order_by(QuestionBank.created_at.desc())
    )
    return result.scalars().first()


async def get_bank_for_jd(jd_id: str, db: AsyncSession) -> QuestionBank | None:
    return await _load_active_bank(jd_id, db)
