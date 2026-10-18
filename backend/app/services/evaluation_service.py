"""
Evaluation Service.

Pipeline per attempt:
  1. Load all submitted answers + questions
  2. MCQ auto-scoring (selected_option translated back through the per-attempt
     shuffle, then exact-matched against correct_answer)
  3. Open-ended evaluation via Ollama (one call per answer)
  4. Aggregate Ollama call → strengths, weaknesses, recommendation, summary
  5. Persist Evaluation + QuestionFeedback rows atomically

Strict scoring philosophy (enforced by prompt + Pydantic):
  - Ollama CANNOT give 10/10 without meeting every rubric criterion
  - Partial credit must be explicitly justified
  - STRONG_HIRE requires ≥70% total score AND explicit strength identification
  - The admin always sees is_preliminary=True and must make the final call

Retry logic (inherited from ollama_service):
  - Up to MAX_CORRECTION_ATTEMPTS correction prompts on validation failure
"""

import asyncio
import random
import time
from datetime import UTC, date, datetime

from pydantic import ValidationError
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AIResponseParseError
from app.core.logging import get_logger
from app.db.models.attempt import CandidateAnswer, TestAttempt
from app.db.models.candidate import Candidate, Invitation
from app.db.models.enums import (
    AIDetectionConfidence,
    AIDetectionRecommendation,
    AIRecommendation,
    AttemptStatus,
    EvaluationLevel,
    QuestionType,
)
from app.db.models.evaluation import Evaluation, QuestionFeedback
from app.db.models.job_description import JdExtractedData, JobDescription
from app.db.models.test import Question, Test
from app.prompts import get_prompt_set
from app.schemas.evaluation import AggregateEvalAI, OpenEndedEvalAI
from app.services import webhook_service
from app.services.ai_detection_service import estimate_ai_likeness
from app.services.embedding_service import generate_embedding
from app.services.ollama_service import ollama_client, parse_json_response

logger = get_logger(__name__)

MAX_CORRECTION_ATTEMPTS = 2


# ─── Main entry point ─────────────────────────────────────────

async def evaluate_attempt(attempt_id: str, db: AsyncSession) -> Evaluation:
    """
    Run the full evaluation pipeline for a submitted attempt.

    Idempotent: if an Evaluation already exists for this attempt,
    it is deleted and replaced.

    Args:
        attempt_id: ID of a SUBMITTED TestAttempt
        db:         Async DB session

    Returns:
        Saved Evaluation ORM instance

    Raises:
        HTTPException 404: Attempt not found
        HTTPException 409: Attempt not yet submitted
        AIServiceError:    Ollama unreachable
        AIResponseParseError: AI returned invalid JSON after retries
    """
    from fastapi import HTTPException

    # 1. Load attempt
    result = await db.execute(
        select(TestAttempt).where(TestAttempt.id == attempt_id)
    )
    attempt = result.scalar_one_or_none()
    if attempt is None:
        raise HTTPException(status_code=404, detail="Attempt not found.")
    if attempt.status not in (AttemptStatus.SUBMITTED, AttemptStatus.EVALUATED):
        raise HTTPException(
            status_code=409,
            detail=(
                f"Attempt status is '{attempt.status.value}'. "
                "Evaluation can only run on SUBMITTED attempts."
            ),
        )

    # 2. Delete any existing evaluation (re-evaluation support)
    existing = await db.execute(
        select(Evaluation).where(Evaluation.attempt_id == attempt_id)
    )
    old_eval = existing.scalar_one_or_none()
    if old_eval is not None:
        await db.delete(old_eval)
        attempt.status = AttemptStatus.SUBMITTED  # Reset so pipeline runs
        await db.flush()
        logger.info("Deleted existing evaluation for re-evaluation", attempt_id=attempt_id)

    # 3. Load questions + answers
    questions = await _load_questions(attempt.test_id, db)
    questions = await filter_to_locked_questions(attempt, questions, db)
    answers = await _load_answers(attempt_id, db)
    jd_context = await _load_jd_context(attempt.test_id, db)

    logger.info(
        "Starting evaluation",
        attempt_id=attempt_id,
        questions=len(questions),
        answers=len(answers),
    )

    # 4. Score MCQs
    mcq_feedback = _score_mcqs(questions, answers, attempt_id)

    # 5. Evaluate open-ended + code via Ollama
    oe_feedback = await _evaluate_open_ended(questions, answers)

    # 6. Compute totals
    all_feedback = mcq_feedback + oe_feedback
    mcq_score = sum(f["awarded_score"] for f in mcq_feedback)
    mcq_max = sum(f["max_score"] for f in mcq_feedback)
    oe_score = sum(f["awarded_score"] for f in oe_feedback)
    oe_max = sum(f["max_score"] for f in oe_feedback)
    total_score = mcq_score + oe_score
    max_score = mcq_max + oe_max
    percentage = round((total_score / max_score * 100), 1) if max_score > 0 else 0.0

    # 6b. Compute skill breakdown from per-question data + question metadata
    skill_breakdown = _compute_skill_breakdown(questions, all_feedback)

    # 6c. Compute evaluation level from percentage
    evaluation_level = _compute_evaluation_level(percentage)

    # 7. Aggregate Ollama evaluation
    agg = await _aggregate_evaluation(
        job_title=jd_context.get("job_title", "Unknown Role"),
        seniority_level=jd_context.get("seniority_level", "Unknown"),
        total_score=total_score,
        max_score=max_score,
        percentage=percentage,
        mcq_score=mcq_score,
        mcq_max=mcq_max,
        oe_score=oe_score,
        oe_max=oe_max,
        feedback_items=all_feedback,
    )
    # Hard guardrail: LLM can hallucinate HIRE for 0% scores — enforce rules
    agg = _enforce_recommendation(agg, percentage)

    # 8. Persist
    evaluation = await _persist_evaluation(
        attempt_id=attempt_id,
        total_score=total_score,
        max_score=max_score,
        percentage=percentage,
        mcq_score=mcq_score,
        mcq_max=mcq_max,
        oe_score=oe_score,
        oe_max=oe_max,
        agg=agg,
        feedback_items=all_feedback,
        evaluation_level=evaluation_level,
        skill_breakdown=skill_breakdown,
        db=db,
    )

    # 9. Update attempt status
    attempt.status = AttemptStatus.EVALUATED
    await db.commit()

    logger.info(
        "Evaluation complete",
        attempt_id=attempt_id,
        total=f"{total_score}/{max_score}",
        percentage=percentage,
        recommendation=agg.recommendation,
    )

    await webhook_service.enqueue_event(
        "evaluation.completed",
        {
            "evaluation_id": evaluation.id,
            "attempt_id": attempt_id,
            "percentage": percentage,
            "recommendation": agg.recommendation,
        },
        db,
    )

    return evaluation


# ─── Bank-mode question locking (Master Prompt 2/3) ───────────

async def filter_to_locked_questions(
    attempt: TestAttempt, questions: list[Question], db: AsyncSession
) -> list[Question]:
    """
    Constrain `questions` (a full bank-section Test's question list) down to
    only the subset actually locked to this candidate via
    exam_attempt_questions. A no-op (returns `questions` unchanged) for
    every legacy/non-bank-mode attempt, since attempt.exam_attempt_id is
    only ever set on bank-mode attempts — see
    exam_attempt_service.start_or_resume_current_section.

    Shared by evaluate_attempt() (legacy per-section path, kept as an
    admin-triggered fallback) and cq_batch_evaluation_service.py (the
    default bank-mode path, which batches all 3 sections' CQ into one call).
    """
    if not attempt.exam_attempt_id:
        return questions

    from app.db.models.question_bank import ExamAttemptQuestion

    locked_result = await db.execute(
        select(ExamAttemptQuestion.question_id).where(
            ExamAttemptQuestion.exam_attempt_id == attempt.exam_attempt_id
        )
    )
    locked_set = {row[0] for row in locked_result.all()}
    if not locked_set:
        return questions
    return [q for q in questions if q.id in locked_set]


# ─── MCQ scoring ─────────────────────────────────────────────

def _resolve_original_label(
    question: Question, attempt_id: str, selected_label: str
) -> str | None:
    """
    Translate a candidate's chosen option label back to its original label.

    `_safe_question` (attempt_service) shuffles each question's MCQ options
    per-attempt with `random.Random(attempt_id + question.id)` and re-labels
    them A/B/C/D by their new position — so the candidate's "B" may name a
    completely different option than the stored `correct_answer`'s "B".
    Reproducing the identical shuffle (same seed, same length) recovers the
    original label that ended up at the chosen position.
    """
    if not question.options or not selected_label:
        return None

    labels = ["A", "B", "C", "D"]
    try:
        chosen_index = labels.index(selected_label)
    except ValueError:
        return None

    original_labels = [o["label"] for o in question.options]
    rng = random.Random(attempt_id + question.id)
    rng.shuffle(original_labels)

    if chosen_index >= len(original_labels):
        return None
    return original_labels[chosen_index]


def _score_mcqs(
    questions: list[Question],
    answers: dict[str, CandidateAnswer],
    attempt_id: str,
) -> list[dict]:
    """
    Exact-match MCQ scoring.

    Rules:
      - selected_option (translated back to its original label) == correct_answer
        (case-insensitive) → full marks
      - no answer or wrong answer → 0 marks
      - Marks are taken from question.marks (not hardcoded)
    """
    feedback = []
    for q in questions:
        if q.question_type != QuestionType.MCQ:
            continue

        answer = answers.get(q.id)
        selected_label = (answer.selected_option or "").upper() if answer else ""
        original_label = _resolve_original_label(q, attempt_id, selected_label)
        correct = (q.correct_answer or "").upper()
        is_correct = bool(original_label and original_label.upper() == correct)

        feedback.append({
            "question_id": q.id,
            "question_type": "MCQ",
            "awarded_score": q.marks if is_correct else 0,
            "max_score": q.marks,
            "is_correct": is_correct,
            "ai_feedback": None,
            "matched_criteria": [],
            "missed_criteria": [],
        })

    return feedback


# Public alias — cq_batch_evaluation_service.py (Master Prompt 3) reuses this
# exact MCQ-grading/shuffle-reversal logic instead of duplicating it.
score_mcqs = _score_mcqs


# ─── Open-ended evaluation ────────────────────────────────────

async def _evaluate_open_ended(
    questions: list[Question],
    answers: dict[str, CandidateAnswer],
) -> list[dict]:
    """
    Evaluate ALL open-ended answers in PARALLEL via asyncio.gather().

    Previously: sequential for-loop → wall time = N × Ollama latency.
    Now:        asyncio.gather()    → all requests dispatched at once;
                Ollama queues them internally, so wall time ≈ max(latency)
                on a multi-GPU / multi-instance setup, and concurrent
                in-flight requests minimise idle Python wait time on a
                single-GPU setup too.

    Result order matches question order (gather preserves insertion order).
    """
    # Evaluate both OPEN_ENDED and CODE questions via Ollama
    eval_questions = [
        q for q in questions
        if q.question_type in (QuestionType.OPEN_ENDED, QuestionType.CODE)
    ]
    if not eval_questions:
        return []

    async def _eval_one(q: Question) -> dict:
        """Coroutine for a single question — handles the no-answer fast-path."""
        answer = answers.get(q.id)
        candidate_text = (answer.answer_text or "").strip() if answer else ""
        qtype_str = q.question_type.value

        if not candidate_text:
            return {
                "question_id": q.id,
                "question_type": qtype_str,
                "awarded_score": 0,
                "max_score": q.marks,
                "is_correct": None,
                "ai_feedback": "No answer provided.",
                "matched_criteria": [],
                "missed_criteria": _extract_rubric_points(q.scoring_rubric or ""),
            }

        ai_detection = None
        if q.question_type == QuestionType.CODE:
            result = await _eval_one_code(q, candidate_text)
        else:
            result = await _eval_one_open_ended(q, candidate_text)
            # AI-likeness is open-ended only (per spec), opt-in, and never
            # fails the evaluation — estimate_ai_likeness() returns None on
            # any failure mode (disabled, Ollama down, parse failure).
            ai_detection = await estimate_ai_likeness(q.question_text, candidate_text)

        scaled = _scale_score(result.score, 10, q.marks)
        return {
            "question_id": q.id,
            "question_type": qtype_str,
            "awarded_score": scaled,
            "max_score": q.marks,
            "is_correct": None,
            "ai_feedback": result.feedback,
            "matched_criteria": result.matched_criteria,
            "missed_criteria": result.missed_criteria,
            "estimated_ai_percentage": ai_detection.estimated_ai_percentage if ai_detection else None,
            "ai_detection_confidence": ai_detection.confidence if ai_detection else None,
            "suspicious_phrases": ai_detection.suspicious_phrases if ai_detection else None,
            "ai_detection_explanation": ai_detection.explanation if ai_detection else None,
            "ai_detection_recommendation": ai_detection.recommendation if ai_detection else None,
        }

    t0 = time.monotonic()
    feedback: list[dict] = list(
        await asyncio.gather(*(_eval_one(q) for q in eval_questions))
    )
    elapsed = round(time.monotonic() - t0)
    logger.info(
        "Open-ended/code evaluations complete (parallel)",
        count=len(eval_questions),
        elapsed_seconds=elapsed,
    )
    return feedback


async def _eval_one_code(
    question: Question,
    candidate_code: str,
) -> "OpenEndedEvalAI":
    """Evaluate one code submission via Ollama using a code-specific prompt."""
    prompts = get_prompt_set().evaluation
    prompt = prompts.code_eval_template.format(
        question_text=question.question_text,
        language=question.code_language or "any language",
        max_score=10,
        rubric=question.scoring_rubric or "Evaluate based on correctness, quality, and efficiency.",
        expected_answer=question.expected_answer or "Not provided.",
        candidate_code=candidate_code[:4000],
    )

    raw = await ollama_client.generate(prompt=prompt, system=prompts.oe_system)
    result, error = _try_validate_oe(raw)
    if result is not None:
        return result

    logger.warning("Code eval initial response invalid", error=error[:150])

    for attempt in range(1, MAX_CORRECTION_ATTEMPTS + 1):
        correction = prompts.oe_correction_template.format(
            errors=error, max_score=10, previous=raw[:800],
        )
        raw = await ollama_client.generate(
            prompt=correction, system=prompts.oe_system, seed=attempt * 23 + 9,
        )
        result, error = _try_validate_oe(raw)
        if result is not None:
            return result

    raise AIResponseParseError(f"Code eval failed after retries. Last error: {error[:200]}")


async def _eval_one_open_ended(
    question: Question,
    candidate_text: str,
) -> OpenEndedEvalAI:
    """Evaluate one open-ended answer with retry on validation failure."""
    prompts = get_prompt_set().evaluation
    prompt = prompts.oe_eval_template.format(
        question_text=question.question_text,
        max_score=10,   # Always 0-10 from Ollama; we scale afterward
        rubric=question.scoring_rubric or "Evaluate based on correctness and completeness.",
        expected_answer=question.expected_answer or "Not provided.",
        candidate_answer=candidate_text[:3000],  # Truncate very long answers
    )

    raw = await ollama_client.generate(prompt=prompt, system=prompts.oe_system)
    result, error = _try_validate_oe(raw)
    if result is not None:
        return result

    logger.warning("OE eval initial response invalid", error=error[:150])

    for attempt in range(1, MAX_CORRECTION_ATTEMPTS + 1):
        correction = prompts.oe_correction_template.format(
            errors=error,
            max_score=10,
            previous=raw[:800],
        )
        raw = await ollama_client.generate(
            prompt=correction,
            system=prompts.oe_system,
            seed=attempt * 17 + 5,
        )
        result, error = _try_validate_oe(raw)
        if result is not None:
            logger.info("OE eval succeeded after correction", attempt=attempt)
            return result
        logger.warning("OE eval correction invalid", attempt=attempt, error=error[:150])

    raise AIResponseParseError(
        f"Open-ended eval failed after {MAX_CORRECTION_ATTEMPTS + 1} attempts. "
        f"Last error: {error[:200]}"
    )


def _try_validate_oe(raw: str) -> tuple[OpenEndedEvalAI | None, str]:
    try:
        data = parse_json_response(raw)
        return OpenEndedEvalAI.model_validate(data), ""
    except Exception as exc:
        if isinstance(exc, ValidationError):
            summary = "; ".join(
                f"{'.'.join(str(x) for x in e['loc'])}: {e['msg']}"
                for e in exc.errors()[:4]
            )
            return None, f"Validation: {summary}"
        return None, str(exc)


# ─── Aggregate evaluation ─────────────────────────────────────

async def _aggregate_evaluation(
    *,
    job_title: str,
    seniority_level: str,
    total_score: int,
    max_score: int,
    percentage: float,
    mcq_score: int,
    mcq_max: int,
    oe_score: int,
    oe_max: int,
    feedback_items: list[dict],
) -> AggregateEvalAI:
    """
    Generate holistic strengths/weaknesses/recommendation via Ollama.
    Uses per-question feedback as context.
    """
    required_rec = _score_to_recommendation(percentage)

    # Build concise per-question summary for the prompt
    lines = []
    for i, fb in enumerate(feedback_items, 1):
        qtype = fb["question_type"]
        score = fb["awarded_score"]
        max_s = fb["max_score"]
        pct = round(score / max_s * 100) if max_s else 0
        line = f"Q{i} [{qtype}]: {score}/{max_s} ({pct}%)"
        if fb.get("ai_feedback"):
            line += f" — {fb['ai_feedback'][:120]}"
        elif fb.get("is_correct") is not None:
            line += f" — {'Correct' if fb['is_correct'] else 'Incorrect'}"
        lines.append(line)

    prompts = get_prompt_set().evaluation
    prompt = prompts.agg_eval_template.format(
        job_title=job_title,
        seniority_level=seniority_level,
        total_score=total_score,
        max_score=max_score,
        percentage=percentage,
        mcq_score=mcq_score,
        mcq_max=mcq_max,
        oe_score=oe_score,
        oe_max=oe_max,
        required_recommendation=required_rec,
        feedback_summary="\n".join(lines),
    )

    raw = await ollama_client.generate(
        prompt=prompt, system=prompts.agg_system, seed=99
    )
    result, error = _try_validate_agg(raw)
    if result is not None:
        return result

    logger.warning("Aggregate eval initial response invalid", error=error[:150])

    for attempt in range(1, MAX_CORRECTION_ATTEMPTS + 1):
        correction = prompts.agg_correction_template.format(errors=error)
        raw = await ollama_client.generate(
            prompt=correction,
            system=prompts.agg_system,
            seed=attempt * 31 + 7,
        )
        result, error = _try_validate_agg(raw)
        if result is not None:
            logger.info("Aggregate eval succeeded after correction", attempt=attempt)
            return result

    raise AIResponseParseError(
        f"Aggregate evaluation failed after {MAX_CORRECTION_ATTEMPTS + 1} attempts. "
        f"Last error: {error[:200]}"
    )


def _try_validate_agg(raw: str) -> tuple[AggregateEvalAI | None, str]:
    try:
        data = parse_json_response(raw)
        return AggregateEvalAI.model_validate(data), ""
    except Exception as exc:
        if isinstance(exc, ValidationError):
            summary = "; ".join(
                f"{'.'.join(str(x) for x in e['loc'])}: {e['msg']}"
                for e in exc.errors()[:4]
            )
            return None, f"Validation: {summary}"
        return None, str(exc)


# ─── AI-likeness aggregation ───────────────────────────────────

_CONFIDENCE_ORDER = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}


def _aggregate_ai_detection(
    feedback_items: list[dict],
) -> tuple[float | None, AIDetectionConfidence | None, int]:
    """
    Roll up per-answer AI-likeness estimates into attempt-level aggregates.

    Returns (overall_percentage, overall_confidence, flagged_count).
    All None/0 if AI-likeness wasn't run for any answer (feature disabled,
    no open-ended questions, or every analysis failed).

    Confidence aggregation is deliberately conservative — "weakest link":
    if any individual answer's estimate was LOW confidence, the aggregate
    is LOW too, never overstating certainty just because other answers
    happened to score higher confidence.
    """
    percentages = [
        fb["estimated_ai_percentage"]
        for fb in feedback_items
        if fb.get("estimated_ai_percentage") is not None
    ]
    if not percentages:
        return None, None, 0

    overall_percentage = sum(percentages) / len(percentages)

    confidences = [
        fb["ai_detection_confidence"]
        for fb in feedback_items
        if fb.get("ai_detection_confidence") is not None
    ]
    weakest = min(confidences, key=lambda c: _CONFIDENCE_ORDER[c])
    overall_confidence = AIDetectionConfidence(weakest)

    flagged_count = sum(
        1
        for fb in feedback_items
        if fb.get("ai_detection_recommendation") not in (None, "NO_CONCERN")
    )

    return round(overall_percentage, 1), overall_confidence, flagged_count


# ─── Persistence ──────────────────────────────────────────────

async def _persist_evaluation(
    *,
    attempt_id: str,
    total_score: int,
    max_score: int,
    percentage: float,
    mcq_score: int,
    mcq_max: int,
    oe_score: int,
    oe_max: int,
    agg: AggregateEvalAI,
    feedback_items: list[dict],
    evaluation_level: EvaluationLevel,
    skill_breakdown: dict,
    db: AsyncSession,
) -> Evaluation:
    """Save Evaluation + QuestionFeedback rows in a single transaction."""
    embedding_text = "\n".join(
        part
        for part in (
            agg.summary,
            "Strengths: " + "; ".join(agg.strengths) if agg.strengths else "",
            "Weaknesses: " + "; ".join(agg.weaknesses) if agg.weaknesses else "",
            f"Suitable role: {agg.suitable_role}" if agg.suitable_role else "",
        )
        if part
    )
    # Best-effort — generate_embedding() returns None (never raises) when
    # the feature is disabled or Ollama's embedding model isn't available.
    embedding = await generate_embedding(embedding_text)

    overall_ai_pct, overall_ai_confidence, flagged_count = _aggregate_ai_detection(
        feedback_items
    )

    evaluation = Evaluation(
        attempt_id=attempt_id,
        total_score=total_score,
        max_score=max_score,
        percentage=percentage,
        mcq_score=mcq_score,
        mcq_max=mcq_max,
        open_ended_score=oe_score,
        open_ended_max=oe_max,
        ai_strengths=agg.strengths,
        ai_weaknesses=agg.weaknesses,
        ai_recommendation=AIRecommendation(agg.recommendation),
        ai_summary=agg.summary,
        evaluation_level=evaluation_level,
        improvement_suggestions=agg.improvement_suggestions,
        suitable_role=agg.suitable_role or None,
        skill_breakdown=skill_breakdown,
        embedding=embedding,
        overall_ai_likeness_percentage=overall_ai_pct,
        overall_ai_detection_confidence=overall_ai_confidence,
        flagged_answer_count=flagged_count,
        is_preliminary=True,
    )
    db.add(evaluation)
    await db.flush()  # Get evaluation.id

    for fb in feedback_items:
        ai_rec = fb.get("ai_detection_recommendation")
        qf = QuestionFeedback(
            evaluation_id=evaluation.id,
            question_id=fb["question_id"],
            attempt_id=attempt_id,
            question_type=fb["question_type"],
            awarded_score=fb["awarded_score"],
            max_score=fb["max_score"],
            is_correct=fb.get("is_correct"),
            ai_feedback=fb.get("ai_feedback"),
            matched_criteria=fb.get("matched_criteria", []),
            missed_criteria=fb.get("missed_criteria", []),
            estimated_ai_percentage=fb.get("estimated_ai_percentage"),
            ai_detection_confidence=(
                AIDetectionConfidence(fb["ai_detection_confidence"])
                if fb.get("ai_detection_confidence")
                else None
            ),
            suspicious_phrases=fb.get("suspicious_phrases"),
            ai_detection_explanation=fb.get("ai_detection_explanation"),
            ai_detection_recommendation=(
                AIDetectionRecommendation(ai_rec) if ai_rec else None
            ),
        )
        db.add(qf)

    await db.commit()
    await db.refresh(evaluation)
    return evaluation


# ─── Semantic similarity (pgvector, opt-in) ───────────────────

async def find_similar_evaluations(
    attempt_id: str,
    db: AsyncSession,
    *,
    limit: int = 5,
) -> list[dict]:
    """
    Return up to `limit` other evaluations ranked by embedding cosine
    similarity to this attempt's evaluation, most similar first.

    Returns [] (never raises for this reason) when:
      - embeddings are disabled (no evaluation has one)
      - this evaluation has no embedding (generated before the feature
        was enabled, or generation failed for this attempt)
      - no other evaluation has an embedding yet to compare against

    Raises NotFoundError if the attempt has no evaluation at all.
    """
    from sqlalchemy import text

    result = await db.execute(
        select(Evaluation).where(Evaluation.attempt_id == attempt_id)
    )
    evaluation = result.scalar_one_or_none()
    if evaluation is None:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("Evaluation", attempt_id)

    if not evaluation.embedding:
        return []

    # pgvector literal format: '[0.1,0.2,...]'::vector — built from floats
    # we generated ourselves, never from user input, so this is injection-safe.
    emb_literal = "[" + ",".join(str(x) for x in evaluation.embedding) + "]"

    rows = await db.execute(
        text("""
            SELECT
                e.attempt_id,
                ta.candidate_id,
                c.name AS candidate_name,
                e.percentage,
                e.ai_recommendation::text AS ai_recommendation,
                1 - (e.embedding <=> CAST(:emb AS vector)) AS similarity
            FROM evaluations e
            JOIN test_attempts ta ON ta.id = e.attempt_id
            JOIN candidates c ON c.id = ta.candidate_id
            WHERE e.embedding IS NOT NULL
              AND e.attempt_id != :attempt_id
            ORDER BY e.embedding <=> CAST(:emb AS vector)
            LIMIT :limit
        """),
        {"emb": emb_literal, "attempt_id": attempt_id, "limit": limit},
    )
    return [dict(row) for row in rows.mappings().all()]


# ─── DB helpers ───────────────────────────────────────────────

async def _load_questions(test_id: str, db: AsyncSession) -> list[Question]:
    result = await db.execute(
        select(Question)
        .where(Question.test_id == test_id)
        .order_by(Question.order_index)
    )
    return list(result.scalars().all())


async def _load_answers(
    attempt_id: str, db: AsyncSession
) -> dict[str, CandidateAnswer]:
    result = await db.execute(
        select(CandidateAnswer).where(CandidateAnswer.attempt_id == attempt_id)
    )
    return {a.question_id: a for a in result.scalars().all()}


async def _load_jd_context(test_id: str, db: AsyncSession) -> dict:
    """Load job title and seniority from the JD for the aggregate prompt."""
    from app.db.models.job_description import JdExtractedData
    from app.db.models.test import Test

    result = await db.execute(
        select(Test).where(Test.id == test_id)
    )
    test = result.scalar_one_or_none()
    if test is None:
        return {}

    jd_result = await db.execute(
        select(JdExtractedData).where(JdExtractedData.jd_id == test.jd_id)
    )
    extracted = jd_result.scalar_one_or_none()
    if extracted is None:
        return {}

    return {
        "job_title": extracted.job_title or "Unknown Role",
        "seniority_level": extracted.seniority_level or "Unknown",
    }


# ─── Scoring helpers ─────────────────────────────────────────

def _score_to_recommendation(percentage: float) -> str:
    """Map a percentage to the correct recommendation tier."""
    if percentage >= 80:
        return "STRONG_HIRE"
    if percentage >= 65:
        return "HIRE"
    if percentage >= 45:
        return "MAYBE"
    return "NO_HIRE"


# Public alias — cq_batch_evaluation_service.py (Master Prompt 3) reuses this
# tier mapping for each section's recommendation instead of re-deriving it.
score_to_recommendation = _score_to_recommendation


def _enforce_recommendation(agg: "AggregateEvalAI", percentage: float) -> "AggregateEvalAI":
    """
    Hard guardrail: if the LLM returned a recommendation more positive than
    the score warrants, downgrade it. Prevents 0% → HIRE hallucinations.
    """
    _order = ["NO_HIRE", "MAYBE", "HIRE", "STRONG_HIRE"]
    correct = _score_to_recommendation(percentage)
    if _order.index(agg.recommendation) > _order.index(correct):
        logger.warning(
            "Overriding over-optimistic AI recommendation",
            ai_gave=agg.recommendation,
            score_requires=correct,
            percentage=percentage,
        )
        agg.recommendation = correct
    return agg


def _compute_evaluation_level(percentage: float) -> EvaluationLevel:
    """Map a percentage score to a candidate proficiency level."""
    if percentage >= 85:
        return EvaluationLevel.EXPERT
    if percentage >= 70:
        return EvaluationLevel.ADVANCED
    if percentage >= 50:
        return EvaluationLevel.INTERMEDIATE
    return EvaluationLevel.BEGINNER


def _compute_skill_breakdown(
    questions: list[Question],
    feedback_items: list[dict],
) -> dict:
    """
    Build a per-skill performance dict: { skill_name: percentage }.
    Groups feedback by question.skill_tested, averages scores per skill.
    """
    fb_by_qid = {f["question_id"]: f for f in feedback_items}
    skill_scores: dict[str, list[float]] = {}

    for q in questions:
        skill = (q.skill_tested or "General").strip()
        fb = fb_by_qid.get(q.id)
        if fb and fb["max_score"] > 0:
            pct = round(fb["awarded_score"] / fb["max_score"] * 100, 1)
            skill_scores.setdefault(skill, []).append(pct)

    return {
        skill: round(sum(scores) / len(scores), 1)
        for skill, scores in skill_scores.items()
        if scores
    }


# ─── Utility ─────────────────────────────────────────────────

def _scale_score(score: int, from_max: int, to_max: int) -> int:
    """Scale a score from one max to another, rounding to nearest integer."""
    if from_max == 0:
        return 0
    return round(score / from_max * to_max)


def _extract_rubric_points(rubric: str) -> list[str]:
    """
    Extract bullet points from a rubric string for the missed_criteria list.
    Handles both newline-separated and sentence-style rubrics.
    """
    if not rubric:
        return []
    lines = [line.strip().lstrip("-•*").strip() for line in rubric.split("\n")]
    return [line for line in lines if len(line) > 5][:5]  # Cap at 5 points


# ─── Leaderboard ──────────────────────────────────────────────

async def get_leaderboard(
    jd_id: str, db: AsyncSession, *, owner_id: str | None = None
) -> dict:
    """
    Return all evaluated candidates for a JD sorted by percentage descending.
    Joins: Evaluation → TestAttempt → Invitation → Candidate + Test (for passing_marks).
    When owner_id is set, only results from that owner's invitations are shown.
    """
    from app.db.models.attempt import TestAttempt
    from app.db.models.candidate import Candidate, Invitation
    from app.db.models.job_description import JdExtractedData, JobDescription
    from app.db.models.test import Test

    # Get JD info
    jd_result = await db.execute(
        select(JobDescription, JdExtractedData)
        .outerjoin(JdExtractedData, JdExtractedData.jd_id == JobDescription.id)
        .where(JobDescription.id == jd_id)
    )
    jd_row = jd_result.first()
    job_title = (jd_row[1].job_title if jd_row and jd_row[1] else None) or "Unknown Role"

    # Get all evaluations for this JD via attempt → invitation path
    rows_stmt = (
        select(Evaluation, TestAttempt, Candidate, Test)
        .join(TestAttempt, TestAttempt.id == Evaluation.attempt_id)
        .join(Invitation, Invitation.id == TestAttempt.invitation_id)
        .join(Candidate, Candidate.id == TestAttempt.candidate_id)
        .join(Test, Test.id == TestAttempt.test_id)
        .where(Invitation.jd_id == jd_id)
        .order_by(Evaluation.percentage.desc())
    )
    if owner_id is not None:
        rows_stmt = rows_stmt.where(Invitation.invited_by == owner_id)
    rows_result = await db.execute(rows_stmt)
    rows = rows_result.all()

    entries = []
    for rank, (ev, attempt, candidate, test) in enumerate(rows, 1):
        passed: bool | None = None
        if test.passing_marks is not None and ev.max_score > 0:
            passed = ev.total_score >= test.passing_marks

        entries.append({
            "rank": rank,
            "attempt_id": ev.attempt_id,
            "candidate_name": candidate.name,
            "candidate_email": candidate.email,
            "percentage": ev.percentage,
            "total_score": ev.total_score,
            "max_score": ev.max_score,
            "evaluation_level": ev.evaluation_level.value if ev.evaluation_level else None,
            "ai_recommendation": ev.ai_recommendation.value,
            "admin_override_recommendation": (
                ev.admin_override_recommendation.value
                if ev.admin_override_recommendation else None
            ),
            "evaluated_at": ev.evaluated_at,
            "passing_marks": test.passing_marks,
            "passed": passed,
        })

    return {
        "jd_id": jd_id,
        "job_title": job_title,
        "total_candidates": len(entries),
        "avg_percentage": round(sum(e["percentage"] for e in entries) / len(entries), 1) if entries else 0.0,
        "pass_rate": (
            round(sum(1 for e in entries if e["passed"]) / len(entries) * 100, 1)
            if entries and entries[0]["passing_marks"] is not None else None
        ),
        "entries": entries,
    }


async def get_global_leaderboard(
    db: AsyncSession,
    *,
    owner_id: str | None = None,
    company_name: str | None = None,
) -> dict:
    """
    Return all evaluated candidates across every JD, ranked by percentage.
    Includes JD name, test type/title, and per-section scores.
    When owner_id is set, only results from that owner's invitations are shown.
    When company_name is set, only results from recruiters/users of that company are shown.
    """
    from app.db.models.attempt import TestAttempt
    from app.db.models.candidate import Candidate, Invitation
    from app.db.models.job_description import JdExtractedData, JobDescription
    from app.db.models.test import Test
    from app.db.models.user import User

    global_stmt = (
        select(Evaluation, TestAttempt, Candidate, Test, JobDescription, JdExtractedData, User)
        .join(TestAttempt, TestAttempt.id == Evaluation.attempt_id)
        .join(Invitation, Invitation.id == TestAttempt.invitation_id)
        .join(Candidate, Candidate.id == TestAttempt.candidate_id)
        .join(Test, Test.id == TestAttempt.test_id)
        .join(JobDescription, JobDescription.id == Invitation.jd_id)
        .outerjoin(JdExtractedData, JdExtractedData.jd_id == JobDescription.id)
        .outerjoin(User, User.id == Invitation.invited_by)
        .order_by(Evaluation.percentage.desc())
    )
    if owner_id is not None:
        global_stmt = global_stmt.where(Invitation.invited_by == owner_id)
    if company_name is not None and company_name.strip():
        global_stmt = global_stmt.where(func.lower(User.company_name) == func.lower(company_name.strip()))
    rows_result = await db.execute(global_stmt)
    rows = rows_result.all()

    entries = []
    for rank, (ev, attempt, candidate, test, jd, jd_data, user) in enumerate(rows, 1):
        passed: bool | None = None
        if test.passing_marks is not None and ev.max_score > 0:
            passed = ev.total_score >= test.passing_marks

        entries.append({
            "rank": rank,
            "attempt_id": ev.attempt_id,
            "candidate_name": candidate.name,
            "candidate_email": candidate.email,
            "candidate_id": candidate.id,
            "candidate_phone": candidate.phone,
            "candidate_linkedin_url": candidate.linkedin_url,
            "candidate_resume_url": candidate.resume_url,
            "candidate_number": candidate.candidate_number,
            "invited_by_id": user.id if user else None,
            "invited_by_name": user.name if user else None,
            "invited_by_email": user.email if user else None,
            "company_name": user.company_name if user else None,
            "ai_likeness_percentage": ev.overall_ai_likeness_percentage,
            "flagged_answer_count": ev.flagged_answer_count or 0,
            "jd_id": jd.id,
            "jd_title": (jd_data.job_title if jd_data else None) or jd.original_filename,
            "test_id": test.id,
            "test_type": test.test_type.value,
            "test_title": test.title,
            "percentage": ev.percentage,
            "total_score": ev.total_score,
            "max_score": ev.max_score,
            "mcq_score": ev.mcq_score,
            "mcq_max": ev.mcq_max,
            "open_ended_score": ev.open_ended_score,
            "open_ended_max": ev.open_ended_max,
            "evaluation_level": ev.evaluation_level.value if ev.evaluation_level else None,
            "ai_recommendation": ev.ai_recommendation.value,
            "admin_override_recommendation": (
                ev.admin_override_recommendation.value
                if ev.admin_override_recommendation else None
            ),
            "ai_summary": ev.ai_summary,
            "evaluated_at": ev.evaluated_at,
            "passing_marks": test.passing_marks,
            "passed": passed,
        })

    return {"total_candidates": len(entries), "entries": entries}


async def get_system_report(
    jd_id: str, db: AsyncSession, *, owner_id: str | None = None
) -> dict:
    """
    Return aggregate analytics for all candidates evaluated for a JD.
    When owner_id is set, only that owner's invitations are counted.
    """
    from app.db.models.attempt import TestAttempt
    from app.db.models.candidate import Invitation
    from app.db.models.job_description import JdExtractedData, JobDescription
    from app.db.models.test import Test

    jd_result = await db.execute(
        select(JobDescription, JdExtractedData)
        .outerjoin(JdExtractedData, JdExtractedData.jd_id == JobDescription.id)
        .where(JobDescription.id == jd_id)
    )
    jd_row = jd_result.first()
    job_title = (jd_row[1].job_title if jd_row and jd_row[1] else None) or "Unknown Role"

    report_stmt = (
        select(Evaluation, Test)
        .join(TestAttempt, TestAttempt.id == Evaluation.attempt_id)
        .join(Invitation, Invitation.id == TestAttempt.invitation_id)
        .join(Test, Test.id == TestAttempt.test_id)
        .where(Invitation.jd_id == jd_id)
    )
    if owner_id is not None:
        report_stmt = report_stmt.where(Invitation.invited_by == owner_id)
    rows_result = await db.execute(report_stmt)
    rows = rows_result.all()

    if not rows:
        return {
            "jd_id": jd_id, "job_title": job_title, "total_evaluated": 0,
            "avg_percentage": 0.0, "highest_percentage": 0.0, "lowest_percentage": 0.0,
            "pass_rate": None, "recommendation_counts": {}, "level_counts": {},
            "common_weak_skills": [], "common_strong_skills": [],
        }

    percentages = [ev.percentage for ev, _ in rows]
    test = rows[0][1]

    rec_counts: dict[str, int] = {}
    level_counts: dict[str, int] = {}
    skill_scores: dict[str, list[float]] = {}

    for ev, _ in rows:
        rec = ev.ai_recommendation.value
        rec_counts[rec] = rec_counts.get(rec, 0) + 1
        if ev.evaluation_level:
            lvl = ev.evaluation_level.value
            level_counts[lvl] = level_counts.get(lvl, 0) + 1
        for skill, pct in (ev.skill_breakdown or {}).items():
            skill_scores.setdefault(skill, []).append(pct)

    avg_per_skill = {
        s: round(sum(v) / len(v), 1) for s, v in skill_scores.items()
    }
    sorted_skills = sorted(avg_per_skill.items(), key=lambda x: x[1])
    weak_skills = [s for s, _ in sorted_skills[:5] if _ < 60]
    strong_skills = [s for s, _ in sorted(avg_per_skill.items(), key=lambda x: -x[1])[:5] if _ >= 70]

    has_passing = test.passing_marks is not None
    pass_rate: float | None = None
    if has_passing:
        passed_count = sum(1 for ev, t in rows if ev.total_score >= (t.passing_marks or 0))
        pass_rate = round(passed_count / len(rows) * 100, 1)

    return {
        "jd_id": jd_id,
        "job_title": job_title,
        "total_evaluated": len(rows),
        "avg_percentage": round(sum(percentages) / len(percentages), 1),
        "highest_percentage": max(percentages),
        "lowest_percentage": min(percentages),
        "pass_rate": pass_rate,
        "recommendation_counts": rec_counts,
        "level_counts": level_counts,
        "common_weak_skills": weak_skills,
        "common_strong_skills": strong_skills,
    }


async def assert_attempt_owner(
    attempt_id: str, db: AsyncSession, owner_id: str | None
) -> None:
    """Raise NotFoundError if owner_id is set and did not send the invitation
    behind this attempt. A no-op for ADMIN+ (owner_id None). Used to scope
    per-attempt evaluation reads/mutations to the owner's own assessments."""
    if owner_id is None:
        return
    from app.core.exceptions import NotFoundError
    from app.db.models.attempt import TestAttempt
    from app.db.models.candidate import Invitation

    result = await db.execute(
        select(Invitation.invited_by)
        .join(TestAttempt, TestAttempt.invitation_id == Invitation.id)
        .where(TestAttempt.id == attempt_id)
    )
    inviter = result.scalar_one_or_none()
    if inviter != owner_id:
        raise NotFoundError("Evaluation", attempt_id)


# ─── List evaluations (paginated) ─────────────────────────────

async def list_evaluations(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    owner_id: str | None = None,
) -> dict:
    """
    Return a paginated list of evaluation summaries ordered by most recent first.

    Used by the admin Results page when a "list all evaluations" view is needed.
    Returns lightweight EvaluationSummaryResponse objects (no per-question breakdown).
    When owner_id is set, only evaluations from that owner's invitations show.
    """
    from app.db.models.attempt import TestAttempt
    from app.db.models.candidate import Invitation

    offset = (page - 1) * page_size

    count_stmt = select(func.count(Evaluation.id))
    rows_stmt = select(Evaluation)
    if owner_id is not None:
        scoped = (
            select(Evaluation.id)
            .join(TestAttempt, TestAttempt.id == Evaluation.attempt_id)
            .join(Invitation, Invitation.id == TestAttempt.invitation_id)
            .where(Invitation.invited_by == owner_id)
        )
        count_stmt = count_stmt.where(Evaluation.id.in_(scoped))
        rows_stmt = rows_stmt.where(Evaluation.id.in_(scoped))

    total_result = await db.execute(count_stmt)
    total: int = total_result.scalar_one()

    rows_result = await db.execute(
        rows_stmt
        .order_by(Evaluation.evaluated_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    items = list(rows_result.scalars().all())

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, -(-total // page_size)),  # ceiling division
    }


# ─── Results Inbox (cross-JD, filterable) ──────────────────────

_CONCLUDED_STATUSES = (
    AttemptStatus.SUBMITTED,
    AttemptStatus.EVALUATED,
    AttemptStatus.TERMINATED,
)


async def list_inbox(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    search: str | None = None,
    jd_id: str | None = None,
    status: str | None = None,
    recommendation: str | None = None,
    integrity: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    owner_id: str | None = None,
) -> dict:
    """
    Cross-JD list of concluded attempts (submitted, evaluated, or terminated
    for an integrity violation) for the admin Results Inbox.

    Unlike list_evaluations() (which is rooted at Evaluation and therefore
    can only ever show attempts that already have a finished evaluation),
    this is rooted at TestAttempt so submitted-but-not-yet-evaluated and
    terminated attempts also show up — that's the whole point of an inbox
    admins use to find what still needs review.
    """
    concluded_at = func.coalesce(TestAttempt.submitted_at, TestAttempt.terminated_at)
    effective_recommendation = func.coalesce(
        Evaluation.admin_override_recommendation, Evaluation.ai_recommendation
    )

    conditions = [TestAttempt.status.in_(_CONCLUDED_STATUSES)]

    if owner_id is not None:
        conditions.append(Invitation.invited_by == owner_id)

    if search:
        term = f"%{search.lower().strip()}%"
        search_filters = [
            func.lower(Candidate.name).like(term),
            func.lower(Candidate.email).like(term),
        ]
        if search.strip().isdigit():
            search_filters.append(Candidate.candidate_number == int(search.strip()))
        conditions.append(or_(*search_filters))

    if jd_id:
        conditions.append(Invitation.jd_id == jd_id)

    if status:
        conditions.append(TestAttempt.status == AttemptStatus(status))

    if recommendation:
        conditions.append(effective_recommendation == AIRecommendation(recommendation))

    if integrity == "violation":
        conditions.append(TestAttempt.status == AttemptStatus.TERMINATED)
    elif integrity == "clean":
        conditions.append(TestAttempt.status != AttemptStatus.TERMINATED)

    if date_from:
        conditions.append(
            concluded_at
            >= datetime.combine(date_from, datetime.min.time(), tzinfo=UTC)
        )
    if date_to:
        conditions.append(
            concluded_at
            <= datetime.combine(date_to, datetime.max.time(), tzinfo=UTC)
        )

    base_query = (
        select(
            TestAttempt.id.label("attempt_id"),
            TestAttempt.status.label("attempt_status"),
            TestAttempt.submitted_at,
            TestAttempt.terminated_at,
            TestAttempt.integrity_violation_reason,
            Candidate.id.label("candidate_id"),
            Candidate.candidate_number,
            Candidate.name.label("candidate_name"),
            Candidate.email.label("candidate_email"),
            JobDescription.id.label("jd_id"),
            JdExtractedData.job_title,
            JobDescription.original_filename,
            Test.id.label("test_id"),
            Test.title.label("test_title"),
            Evaluation.id.label("evaluation_id"),
            Evaluation.percentage,
            effective_recommendation.label("recommendation"),
            Evaluation.evaluation_level,
        )
        .join(Candidate, TestAttempt.candidate_id == Candidate.id)
        .join(Test, TestAttempt.test_id == Test.id)
        .join(Invitation, TestAttempt.invitation_id == Invitation.id)
        .join(JobDescription, Invitation.jd_id == JobDescription.id)
        .outerjoin(JdExtractedData, JdExtractedData.jd_id == JobDescription.id)
        .outerjoin(Evaluation, Evaluation.attempt_id == TestAttempt.id)
        .where(*conditions)
    )

    total = (
        await db.execute(select(func.count()).select_from(base_query.subquery()))
    ).scalar_one()

    offset = (page - 1) * page_size
    rows = (
        await db.execute(
            base_query.order_by(concluded_at.desc()).offset(offset).limit(page_size)
        )
    ).all()

    items = [
        {
            "attempt_id": row.attempt_id,
            "attempt_status": row.attempt_status.value,
            "submitted_at": row.submitted_at,
            "terminated_at": row.terminated_at,
            "integrity_violation_reason": row.integrity_violation_reason,
            "candidate_id": row.candidate_id,
            "candidate_number": row.candidate_number,
            "candidate_name": row.candidate_name,
            "candidate_email": row.candidate_email,
            "jd_id": row.jd_id,
            "jd_title": row.job_title or row.original_filename,
            "test_id": row.test_id,
            "test_title": row.test_title,
            "evaluation_id": row.evaluation_id,
            "percentage": row.percentage,
            "recommendation": row.recommendation.value if row.recommendation else None,
            "evaluation_level": row.evaluation_level.value if row.evaluation_level else None,
        }
        for row in rows
    ]

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, -(-total // page_size)) if total else 1,
    }
