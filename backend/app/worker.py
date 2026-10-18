"""
ARQ worker — runs Ollama background jobs isolated from the API process.

Each task function accepts `ctx` as its first argument (ARQ's job context dict).
They delegate immediately to the service layer which holds all business logic.

Start the worker (docker compose handles this automatically):
  docker compose up worker
  # or locally:
  python -m arq app.worker.WorkerSettings

Why ARQ instead of FastAPI BackgroundTasks?
  - BackgroundTasks share the same process/event loop as request handlers; a
    long Ollama call blocks one of the 4 uvicorn workers for minutes.
  - If the backend container restarts mid-generation the in-flight job is lost
    with no retry and no error surfaced to the admin.
  - ARQ is asyncio-native, Redis-backed, and requires zero infrastructure beyond
    the Redis instance we already added in S2-1.
"""

from typing import ClassVar

import redis.asyncio as aioredis
from arq import cron
from arq.connections import RedisSettings

from app.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


async def startup(ctx: dict) -> None:
    """Initialise shared resources for the worker process."""
    from app.services import (
        ai_checker_service,
        attempt_service,
        question_bank_service,
        test_generation_service,
    )
    from app.services.ollama_service import init_http_client

    init_http_client()

    # The worker needs its own Redis client for progress tracking.
    redis_client = aioredis.from_url(get_settings().redis_url, decode_responses=True)
    test_generation_service.set_redis_client(redis_client)
    attempt_service.set_redis_client(redis_client)
    ai_checker_service.set_redis_client(redis_client)
    question_bank_service.set_redis_client(redis_client)
    ctx["redis_client"] = redis_client


async def shutdown(ctx: dict) -> None:
    """Clean up shared resources on worker shutdown."""
    from app.services.ollama_service import close_http_client
    await close_http_client()
    if "redis_client" in ctx:
        await ctx["redis_client"].aclose()


# ── Task functions ─────────────────────────────────────────────
# ARQ requires all registered functions to accept `ctx` as their
# first positional argument.  We keep each wrapper minimal and let
# the service layer own all logic.

async def task_parse_jd(ctx: dict, jd_id: str) -> None:
    from app.services.jd_service import parse_jd_background
    await parse_jd_background(jd_id)


async def task_extract_skills(ctx: dict, jd_id: str) -> None:
    from app.services.jd_service import extract_skills_background
    await extract_skills_background(jd_id)


async def task_generate_jd(ctx: dict, jd_id: str) -> None:
    from app.services.jd_service import generate_jd_background
    await generate_jd_background(jd_id)


async def task_generate_tests(
    ctx: dict,
    jd_id: str,
    difficulty_override: dict | None = None,
) -> None:
    from app.schemas.test import DifficultyOverride
    from app.services.jd_service import generate_tests_background
    do = DifficultyOverride(**difficulty_override) if difficulty_override else None
    await generate_tests_background(jd_id, difficulty_override=do)


async def task_dispatch_webhook(ctx: dict, delivery_id: str) -> None:
    from app.db.session import AsyncSessionFactory
    from app.services.webhook_service import dispatch_delivery

    async with AsyncSessionFactory() as db:
        await dispatch_delivery(delivery_id, db, job_try=ctx["job_try"])


async def task_generate_bank(ctx: dict, jd_id: str) -> None:
    """
    Runs the slow part of question-bank generation/regeneration (3 sections
    of up to dozens of batched Ollama/GLM calls each, 20-40+ minutes) — the
    /generate and /regenerate endpoints already created the GENERATING bank
    row synchronously before enqueuing this job. No client/proxy HTTP
    timeout can orphan the bank anymore: the request returns immediately
    and this keeps running regardless of how long it takes.
    """
    from app.db.session import AsyncSessionFactory
    from app.services.question_bank_service import continue_bank_generation

    async with AsyncSessionFactory() as db:
        await continue_bank_generation(jd_id, db)


async def task_check_ai_document(
    ctx: dict,
    job_id: str,
    text: str,
    title: str | None = None,
) -> None:
    from app.services.ai_checker_service import run_check_job

    await run_check_job(job_id, text, title=title)


async def task_evaluate_section_attempt(
    ctx: dict,
    attempt_id: str,
    exam_attempt_id: str | None = None,
) -> None:
    """
    SUPERSEDED by task_evaluate_exam_batched (Master Prompt 3) — kept
    registered (not deleted, per this codebase's additive-change policy)
    but no longer auto-enqueued. exam_attempt_service now only enqueues
    evaluation once, after the FINAL section is submitted, so all 15 CQ
    answers can go into one batched call instead of one call per section.
    Still callable directly (e.g. for a manual single-section re-evaluation)
    since evaluation_service.evaluate_attempt() itself is unchanged.
    """
    from sqlalchemy import select

    from app.db.models.enums import ExamAttemptStatus
    from app.db.models.question_bank import ExamAttempt
    from app.db.session import AsyncSessionFactory
    from app.services import ai_risk_service, evaluation_service, scoring_service

    async with AsyncSessionFactory() as db:
        try:
            await evaluation_service.evaluate_attempt(attempt_id, db)
        except Exception as exc:
            logger.error(
                "Section evaluation failed in background job",
                attempt_id=attempt_id,
                error=str(exc),
            )
            return

        if not exam_attempt_id:
            return
        if not await scoring_service.all_sections_evaluated(exam_attempt_id, db):
            return

        result = await db.execute(select(ExamAttempt).where(ExamAttempt.id == exam_attempt_id))
        exam_attempt = result.scalar_one_or_none()
        if exam_attempt is not None:
            exam_attempt.status = ExamAttemptStatus.EVALUATING
            await db.commit()

        try:
            await scoring_service.aggregate_exam_score(exam_attempt_id, db)
            await ai_risk_service.compute_risk_for_exam_attempt(exam_attempt_id, db)
        except Exception as exc:
            logger.error(
                "Exam-level score/risk aggregation failed",
                exam_attempt_id=exam_attempt_id,
                error=str(exc),
            )
            if exam_attempt is not None:
                exam_attempt.status = ExamAttemptStatus.FAILED
                await db.commit()
            return

        if exam_attempt is not None:
            exam_attempt.status = ExamAttemptStatus.EVALUATED
            await db.commit()


async def task_evaluate_exam_batched(ctx: dict, exam_attempt_id: str) -> None:
    """
    Evaluate a WHOLE exam in the background (Master Prompt 3) — enqueued
    once, after the candidate submits the final section, instead of
    per-section. Grades MCQ immediately inside the batched evaluator (cheap,
    deterministic) and evaluates all 15 CQ answers in ONE call (local by
    default, optionally a second GLM call for deep-review-triggered
    candidates — see cq_batch_evaluation_service.py).

    On any failure, marks the exam FAILED rather than crashing — candidate
    answers and any already-graded MCQ scores are never lost, and an admin
    can retry via the exam-admin retry endpoint (see exam_reports.py).
    """
    from sqlalchemy import select

    from app.db.models.enums import ExamAttemptStatus
    from app.db.models.question_bank import ExamAttempt
    from app.db.session import AsyncSessionFactory
    from app.services import (
        ai_risk_service,
        cq_batch_evaluation_service,
        scoring_service,
    )

    async with AsyncSessionFactory() as db:
        result = await db.execute(select(ExamAttempt).where(ExamAttempt.id == exam_attempt_id))
        exam_attempt = result.scalar_one_or_none()
        if exam_attempt is None:
            logger.error("Exam attempt not found for batched evaluation", exam_attempt_id=exam_attempt_id)
            return

        # Idempotency guard: never re-run a completed evaluation (defends against
        # a duplicate/replayed enqueue — see exam_attempt_service.submit_section).
        if exam_attempt.status == ExamAttemptStatus.EVALUATED:
            logger.info("Exam already evaluated — skipping re-evaluation", exam_attempt_id=exam_attempt_id)
            return

        exam_attempt.status = ExamAttemptStatus.EVALUATING
        await db.commit()

        try:
            evaluation = await cq_batch_evaluation_service.evaluate_exam_batched(exam_attempt_id, db)
        except Exception as exc:
            logger.error(
                "Batched exam evaluation raised unexpectedly",
                exam_attempt_id=exam_attempt_id, error=str(exc),
            )
            exam_attempt.status = ExamAttemptStatus.FAILED
            await db.commit()
            return

        if evaluation is None:
            # cq_batch_evaluation_service already set status=FAILED and committed.
            return

        try:
            await scoring_service.aggregate_exam_score(exam_attempt_id, db)
            await ai_risk_service.compute_risk_for_exam_attempt(exam_attempt_id, db)
        except Exception as exc:
            logger.error(
                "Exam-level score/risk aggregation failed",
                exam_attempt_id=exam_attempt_id, error=str(exc),
            )
            exam_attempt.status = ExamAttemptStatus.FAILED
            await db.commit()
            return

        exam_attempt.status = ExamAttemptStatus.EVALUATED
        await db.commit()


# ── Expired-attempt reaper ─────────────────────────────────────

# Only reap attempts that are clearly past the deadline, to avoid racing an
# autosave/submit that was already in flight when the timer hit zero.
_REAPER_GRACE_SECONDS = 120


async def task_reap_expired_attempts(ctx: dict) -> None:
    """Auto-submit IN_PROGRESS attempts whose server-side deadline has passed.

    The exam countdown is authoritative on the server (started_at + duration).
    A client that stops sending heartbeats — a closed tab, a crash, or a
    tampered client trying to keep answering — must not leave an attempt open
    forever. Answer writes past the deadline are already rejected
    (attempt_service._is_past_deadline); this cron closes the loop by
    finalizing the attempt so it can be scored.

    Conservative by design:
      * A legacy attempt is marked SUBMITTED (auto_submitted). Evaluation stays
        admin-triggered, exactly as for a normal legacy submit.
      * A bank-mode SECTION attempt is marked SUBMITTED; the parent ExamAttempt
        is finalized and its batched evaluation enqueued ONLY when every section
        is now terminal (the common "ran out of time on the last section" case).
        A partially-started exam (some sections never opened) is left for an
        admin rather than auto-finalizing an incomplete exam.
    """
    from datetime import UTC, datetime, timedelta

    from sqlalchemy import select

    from app.db.models.attempt import TestAttempt
    from app.db.models.enums import AttemptStatus, ExamAttemptStatus
    from app.db.models.question_bank import ExamAttempt
    from app.db.models.test import Test
    from app.db.session import AsyncSessionFactory
    from app.services.question_bank_service import SECTION_ORDER

    _TERMINAL = {
        AttemptStatus.SUBMITTED,
        AttemptStatus.EVALUATED,
        AttemptStatus.TERMINATED,
    }

    async with AsyncSessionFactory() as db:
        now = datetime.now(tz=UTC)
        rows = (
            await db.execute(
                select(TestAttempt, Test)
                .join(Test, Test.id == TestAttempt.test_id)
                .where(
                    TestAttempt.status == AttemptStatus.IN_PROGRESS,
                    TestAttempt.started_at.is_not(None),
                )
            )
        ).all()

        exam_ids: set[str] = set()
        reaped = 0
        for attempt, test in rows:
            started = attempt.started_at
            if started.tzinfo is None:
                started = started.replace(tzinfo=UTC)
            deadline = started + timedelta(
                minutes=test.duration_minutes, seconds=_REAPER_GRACE_SECONDS
            )
            if now < deadline:
                continue
            attempt.status = AttemptStatus.SUBMITTED
            attempt.submitted_at = now
            attempt.auto_submitted = True
            reaped += 1
            if attempt.exam_attempt_id:
                exam_ids.add(attempt.exam_attempt_id)

        if reaped == 0:
            return
        await db.commit()
        logger.info("Reaper auto-submitted expired attempts", count=reaped)

        # Finalize bank-mode exams whose sections are now ALL terminal.
        for exam_id in exam_ids:
            try:
                exam = (
                    await db.execute(select(ExamAttempt).where(ExamAttempt.id == exam_id))
                ).scalar_one_or_none()
                if exam is None or exam.status in (
                    ExamAttemptStatus.SUBMITTED,
                    ExamAttemptStatus.EVALUATING,
                    ExamAttemptStatus.EVALUATED,
                ):
                    continue
                sections = (
                    await db.execute(
                        select(TestAttempt).where(TestAttempt.exam_attempt_id == exam_id)
                    )
                ).scalars().all()
                if len(sections) == len(SECTION_ORDER) and all(
                    s.status in _TERMINAL for s in sections
                ):
                    exam.status = ExamAttemptStatus.SUBMITTED
                    exam.submitted_at = now
                    await db.commit()
                    await ctx["redis"].enqueue_job("task_evaluate_exam_batched", exam_id)
                    logger.info("Reaper finalized exam and enqueued evaluation", exam_attempt_id=exam_id)
            except Exception as exc:  # noqa: BLE001 — one bad exam must not stop the reap
                logger.error("Reaper failed to finalize exam", exam_attempt_id=exam_id, error=str(exc))
                await db.rollback()


# ── Worker configuration ───────────────────────────────────────

def _compute_job_timeout() -> int:
    s = get_settings()
    # job_timeout is one value shared by every function in this worker — it
    # has to cover whichever job is slowest. Take the max of:
    #   - 3-test generation: 3 tests × (1 + max_retries) calls × per-request timeout
    #   - question-bank generation (task_generate_bank): a fixed ceiling
    #     (see below), not a multiplicative worst case.
    test_generation = s.ollama_timeout_seconds * (1 + s.ollama_max_retries) * 3 + 120
    # Bank generation's true worst case compounds badly: 3 sections × up to 12
    # batches each (_MAX_BATCH_BATCHES) × up to 3 generate_with_correction
    # attempts per batch × up to glm_max_retries (or ollama_max_retries) HTTP
    # attempts per generate() call, optionally ×2 again for a GLM fallback
    # model. That product is many hours regardless of which provider is
    # configured — e.g. an all-GLM-failure run is 120s × 2 retries × 2
    # (primary+fallback) × 3 corrections × 12 batches × 3 sections ≈ 14h.
    # With max_jobs=1, a job stuck anywhere near that ceiling monopolizes the
    # only worker slot and blocks every other JD's generation behind it (this
    # happened in production: a GLM bank job sat "in progress" for 6+ hours
    # before the old ollama_timeout_seconds-based formula would even have
    # fired). Observed real runs take ~25-40 min, so a fixed, generous-but-
    # bounded ceiling protects the queue without affecting normal runs.
    bank_generation = 90 * 60  # 90 minutes
    return max(test_generation, bank_generation)


class WorkerSettings:
    functions: ClassVar[list] = [
        task_parse_jd,
        task_extract_skills,
        task_generate_jd,
        task_generate_tests,
        task_dispatch_webhook,
        task_check_ai_document,
        task_evaluate_section_attempt,
        task_evaluate_exam_batched,
        task_generate_bank,
        task_reap_expired_attempts,
    ]
    # Auto-submit expired attempts every 5 minutes. Cheap (DB-only), but with
    # max_jobs=1 it waits behind any in-flight Ollama job — fine, reaping isn't
    # time-critical to the second, and answer writes are already blocked at the
    # deadline regardless.
    cron_jobs: ClassVar[list] = [
        cron(task_reap_expired_attempts, minute=set(range(0, 60, 5)), run_at_startup=False),
    ]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
    # Only 1 Ollama job at a time — matches OLLAMA_NUM_PARALLEL=1.
    # Increase to 3 if you move to OLLAMA_NUM_PARALLEL=3 (≥16 GB VRAM).
    max_jobs = 1
    # Covers 3 tests × up to 4 Ollama calls each (1 initial + 3 correction retries).
    # For gemma3:4b (medium profile, 600s per-request timeout) this is ~7320s ≈ 2 h.
    job_timeout = _compute_job_timeout()
    keep_result = 3600  # keep completed job results in Redis for 1 h
