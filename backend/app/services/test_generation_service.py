"""
Test Generation Service.

Generates 3 assessment tests from a JD's extracted skills using Ollama/Gemma.

Pipeline per test type:
  1. Build a targeted prompt (different constraints per test type)
  2. Call Ollama with JSON mode enforced
  3. Validate full response with GeneratedTestAI Pydantic model
  4. Retry with correction prompt up to MAX_CORRECTION_ATTEMPTS times
  5. On success: persist Test + Questions to PostgreSQL

Test types and their characteristics:
  TECHNICAL     — deep technical skills, harder MCQs, code/architecture problems
  REASONING     — problem solving, logical thinking, system design reasoning
  PROBLEM_SOLVING — role-specific scenarios, practical application, trade-offs
"""

import asyncio
import json
import time

import redis.asyncio as aioredis
from pydantic import ValidationError
from sqlalchemy import delete as sa_delete
from sqlalchemy import select
from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.exceptions import AIResponseParseError
from app.core.grading import default_passing_marks
from app.core.logging import get_logger
from app.db.models.enums import Difficulty, QuestionType, TestStatus, TestType
from app.db.models.test import Question, Test
from app.prompts import get_prompt_set
from app.schemas.test import GeneratedTestAI
from app.services.ollama_service import ollama_client, parse_json_response
from app.services.rag import retrieval_service
from app.services.rag.embedding_provider import EmbeddingError

logger = get_logger(__name__)

MAX_CORRECTION_ATTEMPTS = 3   # Up from 2 — extra retry for flaky small models

# ── Redis-backed generation progress ─────────────────────────
# Written by generate_tests_for_jd(), read by GET /tests/progress/{jd_id}.
# Redis is shared across all 4 uvicorn workers — the writing worker's update
# is immediately visible to whichever worker handles the next polling request.
# The client (main.py lifespan) calls set_redis_client() on startup.

_redis: aioredis.Redis | None = None


def set_redis_client(client: aioredis.Redis) -> None:
    global _redis
    _redis = client


def _progress_key(jd_id: str) -> str:
    safe = "".join(c for c in jd_id if c.isalnum() or c == "-")
    return f"progress:{safe}"


async def _set_progress(jd_id: str, step: str, pct: int, detail: str = "") -> None:
    if not _redis:
        return
    try:
        await _redis.setex(_progress_key(jd_id), 3600, json.dumps({"step": step, "pct": pct, "detail": detail}))
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

def _overall_difficulty_label(easy_pct: int, medium_pct: int, hard_pct: int) -> str:
    """Derive a test's overall difficulty label from the admin's chosen distribution.

    The admin sets EASY/MEDIUM/HARD percentages; the leading band becomes the
    label, unless no band has a clear lead (within 20 points), in which case
    the test is reported as "MIXED".
    """
    bands = sorted(
        [("EASY", easy_pct), ("MEDIUM", medium_pct), ("HARD", hard_pct)],
        key=lambda b: b[1],
        reverse=True,
    )
    top_label, top_pct = bands[0]
    runner_up_pct = bands[1][1]
    if top_pct - runner_up_pct < 20:
        return "MIXED"
    return top_label


def _question_difficulty_counts(
    total_q: int, easy_pct: int, medium_pct: int, hard_pct: int
) -> tuple[int, int, int]:
    """Split total_q questions into (easy_n, medium_n, hard_n) per the percentages.

    Uses the largest-remainder method: floor each share, then hand out the
    leftover questions to whichever bands lost the most to rounding. This
    guarantees the three counts are non-negative and always sum to total_q —
    naive `round()` + subtraction can go negative (e.g. 50/0/50 split of 7
    questions rounds both 3.5s up to 4, leaving medium with -1).
    """
    raw = {"EASY": total_q * easy_pct / 100, "MEDIUM": total_q * medium_pct / 100, "HARD": total_q * hard_pct / 100}
    counts = {k: int(v) for k, v in raw.items()}
    remainder = total_q - sum(counts.values())
    by_fraction = sorted(raw, key=lambda k: raw[k] - counts[k], reverse=True)
    for i in range(remainder):
        counts[by_fraction[i % 3]] += 1
    return counts["EASY"], counts["MEDIUM"], counts["HARD"]


def _get_counts() -> tuple[int, int]:
    """Return (mcq_count, oe_count) from settings (tuned by start.sh per hardware)."""
    s = get_settings()
    return s.test_mcq_count, s.test_oe_count


def _build_rag_query(
    *,
    job_title: str,
    seniority_level: str,
    must_have_skills: list[str],
    tools_technologies: list[str],
    recommended_test_topics: list[str],
) -> str:
    parts = [
        job_title,
        seniority_level,
        ", ".join(must_have_skills[:12]),
        ", ".join(tools_technologies[:10]),
        ", ".join(recommended_test_topics[:8]),
    ]
    return "\n".join(part for part in parts if part.strip())


def _format_rag_context(hits: list[retrieval_service.SearchHit], max_chars: int) -> str:
    if not hits or max_chars <= 0:
        return ""

    lines = [
        "REFERENCE JD CONTEXT FROM SIMILAR ROLES:",
        (
            "Use these excerpts only to calibrate role realism, seniority, and scenario style. "
            "Do not copy company-specific wording, names, benefits, or requirements unless they "
            "also appear in the current role context."
        ),
    ]
    remaining = max_chars
    for index, hit in enumerate(hits, start=1):
        snippet = " ".join(hit.content.split())
        if not snippet:
            continue
        header = f"[{index}] {hit.document_title} ({hit.filename}, score {hit.score:.2f})"
        allowance = max(0, remaining - len(header) - 12)
        if allowance <= 80:
            break
        excerpt = snippet[:allowance].rstrip()
        if len(snippet) > allowance:
            excerpt += "..."
        block = f"{header}\n{excerpt}"
        lines.append(block)
        remaining -= len(block)
        if remaining <= 120:
            break

    return "\n\n".join(lines) if len(lines) > 2 else ""


def _inject_rag_context(prompt: str, rag_context: str) -> str:
    if not rag_context:
        return prompt
    marker = "\nTEST REQUIREMENTS:"
    if marker in prompt:
        return prompt.replace(marker, f"\n{rag_context}\n{marker}", 1)
    return f"{prompt}\n\n{rag_context}"


async def _get_jd_rag_context(
    *,
    job_title: str,
    seniority_level: str,
    must_have_skills: list[str],
    tools_technologies: list[str],
    recommended_test_topics: list[str],
    db: AsyncSession,
) -> str:
    settings = get_settings()
    if not settings.rag_jd_context_enabled:
        return ""

    query = _build_rag_query(
        job_title=job_title,
        seniority_level=seniority_level,
        must_have_skills=must_have_skills,
        tools_technologies=tools_technologies,
        recommended_test_topics=recommended_test_topics,
    )
    if not query.strip():
        return ""

    try:
        hits = await retrieval_service.search(
            db,
            query,
            top_k=max(settings.rag_jd_context_top_k, 1),
            source_type=settings.rag_jd_context_source_type or None,
        )
    except EmbeddingError as exc:
        logger.info("JD RAG context skipped: embeddings unavailable", error=str(exc))
        return ""
    except Exception as exc:
        logger.warning("JD RAG context retrieval failed", error=str(exc))
        return ""

    context = _format_rag_context(hits, settings.rag_jd_context_max_chars)
    if context:
        logger.info("JD RAG context attached", hit_count=len(hits), chars=len(context))
    return context

# ── Test type metadata ─────────────────────────────────────────
# Used in prompt construction to steer Gemma toward the right style.

_TEST_TYPE_CONFIG: dict[TestType, dict[str, str]] = {
    TestType.TECHNICAL: {
        "name": "Technical Screening Test",
        "goal": (
            "Assess core technical knowledge and depth of expertise. "
            "Questions should verify hands-on technical proficiency, "
            "knowledge of best practices, and ability to reason about code, "
            "data structures, algorithms, and system internals."
        ),
        "mcq_style": (
            "Include questions about language features, framework internals, "
            "debugging scenarios, performance characteristics, and trade-offs. "
            "Avoid trivial syntax questions — test deep understanding."
        ),
        "open_ended_style": (
            "Ask candidates to explain complex technical concepts, describe their "
            "approach to technical problems, or analyze a given technical scenario."
        ),
    },
    TestType.REASONING: {
        "name": "Practical Reasoning Test",
        "goal": (
            "Assess logical thinking, problem decomposition, and practical "
            "judgment. Questions should test how candidates reason through "
            "ambiguous situations, prioritize tasks, and make trade-offs."
        ),
        "mcq_style": (
            "Present real-world scenarios requiring logical analysis. Include "
            "questions about debugging approaches, architectural decisions, "
            "team collaboration challenges, and process reasoning."
        ),
        "open_ended_style": (
            "Present open-ended scenarios that require candidates to walk through "
            "their reasoning process, justify decisions, and consider multiple angles."
        ),
    },
    TestType.PROBLEM_SOLVING: {
        "name": "Role-Specific Problem-Solving Test",
        "goal": (
            "Assess practical application of skills in role-specific contexts. "
            "Questions should mirror real tasks the candidate will face on the job "
            "and test ability to apply knowledge to concrete problems."
        ),
        "mcq_style": (
            "Present concrete role-specific problems with realistic scenarios. "
            "Include questions about choosing the right tool, diagnosing realistic "
            "issues, and applying best practices to specific situations."
        ),
        "open_ended_style": (
            "Give candidates a realistic problem they might encounter in this role "
            "and ask them to propose a solution, architecture, or approach with "
            "clear reasoning and consideration of trade-offs."
        ),
    },
    # Section label for the question-bank redesign (Master Prompt 2) —
    # same intent as PROBLEM_SOLVING (practical, role-specific application)
    # but kept as a distinct config entry since the two TestType values now
    # coexist (PROBLEM_SOLVING is the legacy single-test label).
    TestType.PRACTICAL: {
        "name": "Practical Application Test",
        "goal": (
            "Assess practical, hands-on application of the role's core skills. "
            "Questions should mirror real tasks the candidate will face on the "
            "job — using tools, following processes, and applying best practices "
            "to concrete, realistic situations rather than abstract theory."
        ),
        "mcq_style": (
            "Present concrete, role-specific scenarios. Include questions about "
            "choosing the right tool or approach, diagnosing realistic issues, "
            "and applying best practices to specific day-to-day situations."
        ),
        "open_ended_style": (
            "Give candidates a realistic task or problem from this role and ask "
            "them to walk through how they would approach it in practice, with "
            "concrete steps rather than abstract discussion."
        ),
    },
}


# ─── Main generation function ─────────────────────────────────

async def generate_tests_for_jd(
    *,
    jd_id: str,
    job_title: str,
    seniority_level: str,
    must_have_skills: list[str],
    tools_technologies: list[str],
    recommended_test_topics: list[str],
    difficulty_distribution: dict[str, int],
    db: AsyncSession,
) -> list[Test]:
    """
    Generate all 3 test types for a JD and persist them.

    Ollama calls run in parallel via asyncio.gather — all 3 prompts are sent
    at the same time so total wait time equals the slowest single generation
    rather than the sum of all three.

    DB writes stay sequential because AsyncSession is not concurrency-safe.

    All-or-nothing: if any of the 3 test types fails validation after all
    retries, nothing is persisted — the caller (generate_tests_background)
    rolls back the session and marks generation_status FAILED. This avoids
    a JD ending up with an incomplete (e.g. 2 of 3) draft test set while
    still reporting READY.

    Returns:
        List of 3 saved Test ORM instances (with questions populated).

    Raises:
        AIServiceError:      Ollama unreachable
        AIResponseParseError: Could not produce valid JSON after retries,
                               for any of the 3 test types
    """
    await _set_progress(jd_id, "Preparing test prompts…", 5)
    await _delete_existing_tests(jd_id, db)

    mcq_count, oe_count = _get_counts()
    settings = get_settings()
    sequential = settings.test_sequential_generation

    _SEED = {
        TestType.TECHNICAL: 101,
        TestType.REASONING: 202,
        TestType.PROBLEM_SOLVING: 303,
    }
    _ORDER = [TestType.TECHNICAL, TestType.REASONING, TestType.PROBLEM_SOLVING]

    # ── Difficulty distribution counts ────────────────────────────
    total_q = mcq_count + oe_count
    easy_pct = difficulty_distribution.get("easy_percent", 30)
    medium_pct = difficulty_distribution.get("medium_percent", 50)
    hard_pct = difficulty_distribution.get("hard_percent", 20)
    easy_n, medium_n, hard_n = _question_difficulty_counts(total_q, easy_pct, medium_pct, hard_pct)
    overall_difficulty = _overall_difficulty_label(easy_pct, medium_pct, hard_pct)

    # ── Build all prompts ─────────────────────────────────────────
    test_gen_prompts = get_prompt_set().test_generation
    rag_context = await _get_jd_rag_context(
        job_title=job_title,
        seniority_level=seniority_level,
        must_have_skills=must_have_skills,
        tools_technologies=tools_technologies,
        recommended_test_topics=recommended_test_topics,
        db=db,
    )
    prompts: list[tuple[TestType, str, int]] = []
    for test_type in _ORDER:
        config = _TEST_TYPE_CONFIG[test_type]
        prompt = test_gen_prompts.generation_template.format(
            test_type_name=config["name"],
            job_title=job_title,
            seniority_level=seniority_level,
            must_have_skills=", ".join(must_have_skills[:15]),
            tools_technologies=", ".join(tools_technologies[:10]),
            recommended_test_topics=", ".join(recommended_test_topics[:8]),
            test_goal=config["goal"],
            mcq_style=config["mcq_style"],
            open_ended_style=config["open_ended_style"],
            mcq_count=mcq_count,
            open_ended_count=oe_count,
            duration_minutes=_duration_for_type(test_type),
            difficulty=overall_difficulty,
            easy_pct=easy_pct,
            medium_pct=medium_pct,
            hard_pct=hard_pct,
            total_q=total_q,
            easy_n=easy_n,
            medium_n=medium_n,
            hard_n=hard_n,
        )
        prompt = _inject_rag_context(prompt, rag_context)
        prompts.append((test_type, prompt, _SEED[test_type]))

    t0 = time.monotonic()

    if sequential:
        # Sequential mode: one Ollama call at a time.
        # Required when OLLAMA_NUM_PARALLEL=1 (default for ≤4 GB VRAM).
        # Parallel mode with NUM_PARALLEL=1 causes the 2nd and 3rd HTTP requests
        # to wait in Ollama's queue, hitting the per-request read timeout (600s)
        # before their generation even starts.
        logger.info(
            "Starting sequential test generation",
            jd_id=jd_id,
            test_types=[t.value for t in _ORDER],
            mcq_count=mcq_count,
            oe_count=oe_count,
        )
        # Progress steps: 10 → 35 → 60 → 85 (each test ~25%)
        _PCT_START = [10, 35, 60]
        raw_results: list[GeneratedTestAI | BaseException] = []
        for idx, (test_type, prompt, seed) in enumerate(prompts):
            type_name = _TEST_TYPE_CONFIG[test_type]["name"]
            await _set_progress(
                jd_id,
                f"Generating {type_name}…",
                _PCT_START[idx],
                f"Test {idx + 1} of {len(prompts)}",
            )
            try:
                result = await _generate_with_retry(prompt, seed=seed)
                raw_results.append(result)
            except Exception as exc:
                raw_results.append(exc)
    else:
        # Parallel mode: all 3 at once.
        # Only use when OLLAMA_NUM_PARALLEL>=3 (≥8 GB VRAM with gemma3:4b,
        # or ≥16 GB VRAM with gemma3:12b).
        logger.info(
            "Starting parallel test generation",
            jd_id=jd_id,
            test_types=[t.value for t in _ORDER],
            mcq_count=mcq_count,
            oe_count=oe_count,
        )
        await _set_progress(jd_id, "Generating all 3 tests simultaneously…", 15, "Starting 3 tests in parallel")

        # Track per-test completion so the progress bar advances as each
        # individual test finishes (15% → 35% → 55% → 75%) instead of
        # jumping straight from 15% to 80% only when the slowest one finishes.
        # asyncio is single-threaded so the counter increment is safe without a lock.
        _completed = [0]
        _PARALLEL_PCT = [35, 55, 75]

        async def _generate_and_track(test_type: TestType, prompt: str, seed: int) -> GeneratedTestAI:
            result = await _generate_with_retry(prompt, seed=seed)
            _completed[0] += 1
            n = _completed[0]
            type_name = _TEST_TYPE_CONFIG[test_type]["name"]
            await _set_progress(
                jd_id,
                f"Tests generating… ({n}/3 done)",
                _PARALLEL_PCT[min(n - 1, 2)],
                f"{type_name} complete",
            )
            return result

        generation_tasks = [
            _generate_and_track(test_type, prompt, seed)
            for test_type, prompt, seed in prompts
        ]
        raw_results = await asyncio.gather(*generation_tasks, return_exceptions=True)
        await _set_progress(jd_id, "All tests generated…", 80, "Validating results")

    _generation_elapsed = round(time.monotonic() - t0)

    # ── Separate successes from failures ──────────────────────────
    successful: list[tuple[TestType, GeneratedTestAI]] = []
    for (test_type, _, _), result in zip(prompts, raw_results):
        if isinstance(result, BaseException):
            logger.error(
                "Ollama generation failed for test type — slot will be skipped",
                jd_id=jd_id,
                test_type=test_type.value,
                error=str(result),
            )
        else:
            successful.append((test_type, result))

    logger.info(
        "Test generation complete",
        jd_id=jd_id,
        elapsed_seconds=_generation_elapsed,
        mode="sequential" if sequential else "parallel",
        succeeded=len(successful),
        failed=len(prompts) - len(successful),
    )

    if len(successful) < len(prompts):
        # All-or-nothing: a partial result (e.g. 2 of 3 test types generated)
        # would leave the JD with an incomplete test set while still reporting
        # READY. Raise here — before any test is persisted — so the caller's
        # exception handler rolls back the (flushed-only) _delete_existing_tests
        # changes and marks generation_status FAILED instead.
        failed_types = [
            test_type.value
            for (test_type, _, _), result in zip(prompts, raw_results)
            if isinstance(result, BaseException)
        ]
        raise AIResponseParseError(
            f"Test generation failed for {len(prompts) - len(successful)} of "
            f"{len(prompts)} test type(s) ({', '.join(failed_types)}) for JD {jd_id}. "
            "No tests were saved — check Ollama / backend logs for details."
        )

    # ── Persist results sequentially (session safety) ─────────────────────
    await _set_progress(jd_id, "Saving tests to database…", 85, f"{len(successful)} tests ready")
    saved_tests: list[Test] = []
    for test_type, validated in successful:
        test = await _persist_test(
            jd_id=jd_id,
            test_type=test_type,
            validated=validated,
            overall_difficulty=overall_difficulty,
            db=db,
        )
        saved_tests.append(test)
        logger.info(
            "Test saved",
            jd_id=jd_id,
            test_type=test_type.value,
            test_id=test.id,
            question_count=len(test.questions),
        )

    await _set_progress(jd_id, "All tests ready!", 100, f"{len(saved_tests)} tests generated")
    return saved_tests


async def regenerate_single_test(
    *,
    test_id: str,
    jd_id: str,
    test_type: TestType,
    job_title: str,
    seniority_level: str,
    must_have_skills: list[str],
    tools_technologies: list[str],
    recommended_test_topics: list[str],
    difficulty_distribution: dict[str, int],
    db: AsyncSession,
) -> Test:
    """
    Regenerate a single test, replacing its questions.
    Used when the admin clicks "Regenerate" on one test slot.
    """
    mcq_count, oe_count = _get_counts()
    config = _TEST_TYPE_CONFIG[test_type]
    duration = _duration_for_type(test_type)

    total_q = mcq_count + oe_count
    easy_pct = difficulty_distribution.get("easy_percent", 30)
    medium_pct = difficulty_distribution.get("medium_percent", 50)
    hard_pct = difficulty_distribution.get("hard_percent", 20)
    easy_n, medium_n, hard_n = _question_difficulty_counts(total_q, easy_pct, medium_pct, hard_pct)
    overall_difficulty = _overall_difficulty_label(easy_pct, medium_pct, hard_pct)

    prompt = get_prompt_set().test_generation.generation_template.format(
        test_type_name=config["name"],
        job_title=job_title,
        seniority_level=seniority_level,
        must_have_skills=", ".join(must_have_skills[:15]),
        tools_technologies=", ".join(tools_technologies[:10]),
        recommended_test_topics=", ".join(recommended_test_topics[:8]),
        test_goal=config["goal"],
        mcq_style=config["mcq_style"],
        open_ended_style=config["open_ended_style"],
        mcq_count=mcq_count,
        open_ended_count=oe_count,
        duration_minutes=duration,
        difficulty=overall_difficulty,
        easy_pct=easy_pct,
        medium_pct=medium_pct,
        hard_pct=hard_pct,
        total_q=total_q,
        easy_n=easy_n,
        medium_n=medium_n,
        hard_n=hard_n,
    )
    rag_context = await _get_jd_rag_context(
        job_title=job_title,
        seniority_level=seniority_level,
        must_have_skills=must_have_skills,
        tools_technologies=tools_technologies,
        recommended_test_topics=recommended_test_topics,
        db=db,
    )
    prompt = _inject_rag_context(prompt, rag_context)

    import random
    seed = random.randint(1000, 9999)   # Random seed for variety on regenerate
    validated = await _generate_with_retry(prompt, seed=seed)

    # Reload the existing test and replace its questions
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(Test).options(selectinload(Test.questions)).where(Test.id == test_id)
    )
    test = result.scalar_one_or_none()
    if test is None:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("Test", test_id)

    # Clear old questions
    for q in list(test.questions):
        await db.delete(q)
    await db.flush()

    # Update test metadata from new generation
    test.title = validated.title
    test.description = validated.description
    test.duration_minutes = validated.duration_minutes
    test.total_marks = validated.total_marks
    test.difficulty = Difficulty(overall_difficulty)
    test.status = TestStatus.DRAFT   # Reset to draft after regeneration

    # Add new questions
    questions = _build_questions(test.id, validated)
    for q in questions:
        db.add(q)

    await db.commit()
    await db.refresh(test)
    return test


# ─── Retry loop ───────────────────────────────────────────────

async def _generate_with_retry(
    prompt: str,
    seed: int,
) -> GeneratedTestAI:
    """
    Call Ollama and validate. Retry with correction prompt on failure.
    """
    mcq_count, oe_count = _get_counts()
    prompts = get_prompt_set().test_generation

    raw = await ollama_client.generate(
        prompt=prompt, system=prompts.system, seed=seed
    )
    last_raw = raw

    result, error_msg = _try_validate(raw)
    if result is not None:
        return result

    logger.warning("Initial test generation invalid", error=error_msg[:200])

    for attempt in range(1, MAX_CORRECTION_ATTEMPTS + 1):
        correction = prompts.correction_template.format(
            errors=error_msg,
            mcq_count=mcq_count,
            open_ended_count=oe_count,
            previous_response=last_raw[:1200],
        )
        raw = await ollama_client.generate(
            prompt=correction,
            system=prompts.system,
            seed=seed + attempt * 13,
        )
        last_raw = raw
        result, error_msg = _try_validate(raw)
        if result is not None:
            logger.info("Test generation succeeded after correction", attempt=attempt)
            return result

        logger.warning(
            "Correction attempt invalid",
            attempt=attempt,
            error=error_msg[:200],
        )

    raise AIResponseParseError(
        f"Test generation failed after {MAX_CORRECTION_ATTEMPTS + 1} attempts. "
        f"Last error: {error_msg[:300]}"
    )


def _try_validate(raw: str) -> tuple[GeneratedTestAI | None, str]:
    """Parse + validate a raw LLM response. Returns (result, "") or (None, error)."""
    try:
        data = parse_json_response(raw)
        result = GeneratedTestAI.model_validate(data)
        return result, ""
    except Exception as exc:
        if isinstance(exc, ValidationError):
            errors = exc.errors()
            summary = "; ".join(
                f"{'.'.join(str(x) for x in e['loc'])}: {e['msg']}"
                for e in errors[:8]
            )
            return None, f"Validation: {summary}"
        return None, str(exc)


# ─── DB helpers ───────────────────────────────────────────────

async def _delete_existing_tests(jd_id: str, db: AsyncSession) -> None:
    """Prepare for regeneration without destroying candidate data.

    - DRAFT tests (never sent to anyone): hard-deleted.
    - APPROVED tests (may have candidate attempts + evaluations attached):
      archived instead of deleted so the ON DELETE CASCADE on test_attempts
      is never triggered and all evaluation history is preserved.
    """
    # Hard-delete drafts — no candidate data attached.
    draft_result = await db.execute(
        sa_delete(Test).where(
            Test.jd_id == jd_id,
            Test.status == TestStatus.DRAFT,
        )
    )

    # Archive approved tests — preserves test_attempts / evaluations via FK.
    archive_result = await db.execute(
        sa_update(Test)
        .where(
            Test.jd_id == jd_id,
            Test.status == TestStatus.APPROVED,
        )
        .values(status=TestStatus.ARCHIVED)
    )

    await db.flush()
    logger.info(
        "Prepared tests for regeneration",
        jd_id=jd_id,
        drafts_deleted=draft_result.rowcount,
        approved_archived=archive_result.rowcount,
    )


async def _persist_test(
    *,
    jd_id: str,
    test_type: TestType,
    validated: GeneratedTestAI,
    overall_difficulty: str,
    db: AsyncSession,
) -> Test:
    """Save a validated GeneratedTestAI to the database.

    The test-level `difficulty` is set from the admin's chosen distribution
    (overall_difficulty), not the LLM's echoed value — small local models
    don't reliably follow the "Overall difficulty: X" instruction, which
    would otherwise make the badge inconsistent across the 3 generated tests.
    """
    test = Test(
        jd_id=jd_id,
        test_type=test_type,
        title=validated.title,
        description=validated.description,
        duration_minutes=validated.duration_minutes,
        total_marks=validated.total_marks,
        # Without this the test is created with passing_marks=NULL and every
        # evaluation against it reports passed=None forever — no Pass/Fail
        # anywhere in the product. Admins can override it per test afterwards.
        passing_marks=default_passing_marks(validated.total_marks),
        difficulty=Difficulty(overall_difficulty),
        status=TestStatus.DRAFT,
    )
    db.add(test)
    await db.flush()   # Get test.id before creating questions

    questions = _build_questions(test.id, validated)
    for q in questions:
        db.add(q)

    await db.commit()

    # Eager-load questions so callers can access test.questions safely
    from sqlalchemy.orm import selectinload as _sil
    refreshed = await db.execute(
        select(Test).options(_sil(Test.questions)).where(Test.id == test.id)
    )
    return refreshed.scalar_one()


def _build_questions(test_id: str, validated: GeneratedTestAI) -> list[Question]:
    """Convert validated AI output into Question ORM instances."""
    questions: list[Question] = []
    order = 0

    for mcq in validated.mcq_questions:
        options_data = [o.model_dump() for o in mcq.options]
        questions.append(
            Question(
                test_id=test_id,
                question_type=QuestionType.MCQ,
                question_text=mcq.question_text,
                skill_tested=mcq.skill_tested,
                difficulty=Difficulty(mcq.difficulty),
                marks=mcq.marks,
                order_index=order,
                options=options_data,
                correct_answer=mcq.correct_answer,
                explanation=mcq.explanation,
            )
        )
        order += 1

    for oe in validated.open_ended_questions:
        questions.append(
            Question(
                test_id=test_id,
                question_type=QuestionType.OPEN_ENDED,
                question_text=oe.question_text,
                skill_tested=oe.skill_tested,
                difficulty=Difficulty(oe.difficulty),
                marks=oe.marks,
                order_index=order,
                expected_answer=oe.expected_answer,
                scoring_rubric=oe.scoring_rubric,
            )
        )
        order += 1

    return questions


def _duration_for_type(test_type: TestType) -> int:
    """Return the suggested duration in minutes for each test type."""
    return {
        TestType.TECHNICAL: 60,
        TestType.REASONING: 45,
        TestType.PROBLEM_SOLVING: 75,
        TestType.PRACTICAL: 75,
    }[test_type]


# ─── Question-bank batch generation (Master Prompt 2) ─────────
# Generates ONE small batch (≤5 MCQ + ≤2 OE — the validated ceiling
# GeneratedTestAI.truncate_*_list enforces regardless of what's requested)
# for a single section. question_bank_service.py calls this repeatedly,
# accumulating batches, to build up a much larger per-section bank without
# needing a single LLM call to return 40+ questions at once — small local
# models are unreliable at that scale, and a single giant all-or-nothing
# call would reintroduce the exact fragility this redesign is meant to
# reduce (see docs/ai-assessment-redesign-audit.md, risk #4).

async def generate_question_batch(
    *,
    test_type: TestType,
    job_title: str,
    seniority_level: str,
    must_have_skills: list[str],
    tools_technologies: list[str],
    recommended_test_topics: list[str],
    difficulty_distribution: dict[str, int],
    seed: int,
) -> GeneratedTestAI:
    """Generate one validated batch of questions for one exam section.

    Reuses the same prompt templates, retry/correction loop, and Pydantic
    validation as the legacy generate_tests_for_jd() — only the caller and
    persistence strategy differ (question_bank_service persists per-batch
    instead of all-or-nothing across all 3 sections).
    """
    config = _TEST_TYPE_CONFIG[test_type]
    mcq_count, oe_count = _get_counts()

    total_q = mcq_count + oe_count
    easy_pct = difficulty_distribution.get("easy_percent", 30)
    medium_pct = difficulty_distribution.get("medium_percent", 50)
    hard_pct = difficulty_distribution.get("hard_percent", 20)
    easy_n, medium_n, hard_n = _question_difficulty_counts(total_q, easy_pct, medium_pct, hard_pct)
    overall_difficulty = _overall_difficulty_label(easy_pct, medium_pct, hard_pct)

    prompt = get_prompt_set().test_generation.generation_template.format(
        test_type_name=config["name"],
        job_title=job_title,
        seniority_level=seniority_level,
        must_have_skills=", ".join(must_have_skills[:15]),
        tools_technologies=", ".join(tools_technologies[:10]),
        recommended_test_topics=", ".join(recommended_test_topics[:8]),
        test_goal=config["goal"],
        mcq_style=config["mcq_style"],
        open_ended_style=config["open_ended_style"],
        mcq_count=mcq_count,
        open_ended_count=oe_count,
        duration_minutes=_duration_for_type(test_type),
        difficulty=overall_difficulty,
        easy_pct=easy_pct,
        medium_pct=medium_pct,
        hard_pct=hard_pct,
        total_q=total_q,
        easy_n=easy_n,
        medium_n=medium_n,
        hard_n=hard_n,
    )
    return await _generate_with_retry(prompt, seed=seed)


def build_questions_from_batch(test_id: str, validated: GeneratedTestAI, order_start: int) -> list[Question]:
    """Public wrapper around _build_questions for batch accumulation —
    order_index continues from order_start instead of always starting at 0,
    so successive batches in the same section Test don't collide."""
    questions = _build_questions(test_id, validated)
    for offset, q in enumerate(questions):
        q.order_index = order_start + offset
    return questions
