"""
Batched CQ Evaluation Service (Master Prompt 3).

Cost-control core of the AI orchestration redesign: a candidate's 15 CQ
answers (5 per section × 3 sections) are evaluated in ONE LLM call instead
of one call per answer — see docs/ai-assessment-redesign-audit.md and the
prompt's explicit "do not call AI 15 times" principle.

Behavior change from Master Prompt 2: each section used to be evaluated
independently the moment IT was submitted (3 separate background jobs).
Now, evaluation only runs once, after the candidate submits the FINAL
section — MCQ grading still happens immediately (it's deterministic, free,
and doesn't need to wait), but CQ scoring waits so all 15 answers can go
into one prompt. Tradeoff: an admin won't see a section's results until the
whole exam is done, in exchange for ~15x fewer LLM calls per candidate.

Default provider for the batched call is "local" (cheap, repeated task).
A SECOND batched call to GLM only happens for candidates who trip a
deep-review trigger (top scorer, borderline, high AI-risk, or an explicit
admin request) — see ai_task_router_service.should_deep_review(). The GLM
result, when run, supersedes the local one; the local result is always
computed first since the triggers themselves depend on having a score.
"""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError
from app.core.logging import get_logger
from app.db.models.attempt import TestAttempt
from app.db.models.enums import (
    AIDetectionConfidence,
    AIDetectionRecommendation,
    AIRecommendation,
    AttemptStatus,
    ExamAttemptStatus,
    QuestionType,
)
from app.db.models.evaluation import Evaluation, QuestionFeedback
from app.db.models.question_bank import ExamAttempt
from app.db.models.test import Question, Test
from app.prompts.glm_tasks import BATCHED_CQ_EVALUATION
from app.schemas.ai_orchestration import BatchedCqEvaluationAI, CqAnswerScoreAI
from app.services import ai_provider_service, ai_task_router_service, evaluation_service
from app.services.ai_detection_service import estimate_ai_likeness
from app.services.ai_provider_service import AiGenerateRequest
from app.services.ai_task_router_service import DeepReviewContext
from app.services.question_bank_service import SECTION_ORDER

logger = get_logger(__name__)


async def evaluate_exam_batched(exam_attempt_id: str, db: AsyncSession) -> Evaluation | None:
    """
    Main entrypoint — called once per exam, after the final section is
    submitted. Returns None (and marks the exam FAILED, never crashes) if
    the batched CQ call never succeeds; candidate answers and MCQ scores
    are preserved either way.
    """
    result = await db.execute(select(ExamAttempt).where(ExamAttempt.id == exam_attempt_id))
    exam_attempt = result.scalar_one()

    sections_result = await db.execute(
        select(TestAttempt, Test)
        .join(Test, Test.id == TestAttempt.test_id)
        .where(TestAttempt.exam_attempt_id == exam_attempt_id)
    )
    rows = sections_result.all()
    by_section: dict = {test.test_type: (attempt, test) for attempt, test in rows}

    missing = [s.value for s in SECTION_ORDER if s not in by_section]
    if missing:
        raise ConflictError(
            f"Cannot evaluate — sections not yet submitted: {', '.join(missing)}",
            error_code="SECTIONS_NOT_SUBMITTED",
        )
    not_submitted = [
        s.value for s in SECTION_ORDER
        if by_section[s][0].status not in (AttemptStatus.SUBMITTED, AttemptStatus.EVALUATED)
    ]
    if not_submitted:
        raise ConflictError(
            f"Cannot evaluate — sections not in SUBMITTED state: {', '.join(not_submitted)}",
            error_code="SECTIONS_NOT_SUBMITTED",
        )

    # ── 1. Load locked questions/answers + grade MCQ immediately per section ──
    per_section_data: dict = {}
    cq_items: list[dict] = []

    for section in SECTION_ORDER:
        attempt, test = by_section[section]
        all_questions = await evaluation_service._load_questions(test.id, db)
        questions = await evaluation_service.filter_to_locked_questions(attempt, all_questions, db)
        answers = await evaluation_service._load_answers(attempt.id, db)

        mcq_feedback = evaluation_service.score_mcqs(questions, answers, attempt.id)
        cq_questions = [q for q in questions if q.question_type == QuestionType.OPEN_ENDED]

        per_section_data[section] = {
            "attempt": attempt,
            "test": test,
            "questions": questions,
            "cq_questions": cq_questions,
            "answers": answers,
            "mcq_feedback": mcq_feedback,
        }

        for q in cq_questions:
            answer = answers.get(q.id)
            cq_items.append({
                "question_id": q.id,
                "section_type": section.value,
                "question_text": q.question_text,
                "rubric": q.scoring_rubric or q.expected_answer or "Evaluate based on completeness and correctness.",
                "max_marks": q.marks,
                "candidate_answer": (answer.answer_text or "").strip() if answer else "",
            })

    # ── 2. One batched local call covering every CQ answer in the exam ──
    local_result = await _run_batched_cq(exam_attempt_id, cq_items, provider="local", db=db)

    if local_result is None:
        logger.error("Batched CQ evaluation failed on local provider", exam_attempt_id=exam_attempt_id)
        exam_attempt.status = ExamAttemptStatus.FAILED
        await db.commit()
        return None

    final_result = local_result

    # ── 3. Optional GLM deep-review pass, only if a trigger fires ──
    provisional_pct = _provisional_percentage(per_section_data, local_result)
    is_top, is_borderline = ai_task_router_service.classify_score(provisional_pct)
    context = DeepReviewContext(
        is_top_candidate=is_top,
        is_borderline=is_borderline,
        local_confidence=local_result.evaluation_confidence,
    )
    if ai_task_router_service.should_deep_review(context) and ai_task_router_service.glm_configured():
        glm_result = await _run_batched_cq(exam_attempt_id, cq_items, provider="glm", db=db)
        if glm_result is not None:
            final_result = glm_result
            logger.info("Deep-review GLM pass superseded local CQ evaluation", exam_attempt_id=exam_attempt_id)

    # ── 4. Persist one Evaluation + QuestionFeedback per section ──
    answers_by_qid: dict[str, CqAnswerScoreAI] = {a.question_id: a for a in final_result.answers}
    last_evaluation: Evaluation | None = None

    for section in SECTION_ORDER:
        data = per_section_data[section]
        evaluation = await _persist_section_evaluation(
            attempt=data["attempt"],
            mcq_feedback=data["mcq_feedback"],
            cq_questions=data["cq_questions"],
            candidate_answers=data["answers"],
            answers_by_qid=answers_by_qid,
            section_summary=final_result.section_scores.get(section.value),
            overall_strengths=final_result.overall_strengths,
            overall_weaknesses=final_result.overall_weaknesses,
            db=db,
        )
        data["attempt"].status = AttemptStatus.EVALUATED
        last_evaluation = evaluation

    await db.commit()
    logger.info(
        "Batched CQ evaluation persisted",
        exam_attempt_id=exam_attempt_id,
        provider="glm" if final_result is not local_result else "local",
        cq_answer_count=len(cq_items),
    )
    return last_evaluation


def _provisional_percentage(per_section_data: dict, cq_result: BatchedCqEvaluationAI) -> float:
    """Rough overall percentage from MCQ (known) + the local CQ pass
    (just computed) — used only to decide deep-review eligibility, not
    persisted. The real, weighted score comes from scoring_service after
    section Evaluations are saved."""
    total_score = 0.0
    total_max = 0.0
    for section, data in per_section_data.items():
        mcq_score = sum(f["awarded_score"] for f in data["mcq_feedback"])
        mcq_max = sum(f["max_score"] for f in data["mcq_feedback"])
        section_cq = cq_result.section_scores.get(section.value)
        cq_score = section_cq.cq_score if section_cq else 0.0
        cq_max = section_cq.max_score if section_cq else 0.0
        total_score += mcq_score + cq_score
        total_max += mcq_max + cq_max
    return round(total_score / total_max * 100, 1) if total_max else 0.0


async def _run_batched_cq(
    exam_attempt_id: str, cq_items: list[dict], *, provider: str, db: AsyncSession
) -> BatchedCqEvaluationAI | None:
    if not cq_items:
        return None

    listing = "\n\n".join(
        f"[{item['section_type']}] question_id={item['question_id']} (max {item['max_marks']} marks)\n"
        f"Question: {item['question_text']}\n"
        f"Expected answer points / rubric: {item['rubric']}\n"
        # Fence the candidate answer as untrusted data (see BATCHED_CQ_EVALUATION
        # system prompt) so in-answer instructions can't steer the grader.
        f"[BEGIN CANDIDATE ANSWER]\n{item['candidate_answer'] or '(no answer provided)'}\n[END CANDIDATE ANSWER]"
        for item in cq_items
    )
    prompt = BATCHED_CQ_EVALUATION.evaluation_template.format(
        answer_count=len(cq_items), answers_listing=listing,
    )
    req = AiGenerateRequest(
        task_type="cq_evaluation",
        system_prompt=BATCHED_CQ_EVALUATION.system,
        user_prompt=prompt,
        model_preference=provider,
        expected_json_schema=BatchedCqEvaluationAI,
        metadata={"exam_attempt_id": exam_attempt_id},
    )
    response = await ai_provider_service.generate_with_correction(
        req,
        build_correction_prompt=lambda errors, previous: BATCHED_CQ_EVALUATION.correction_template.format(
            errors=errors, previous_response=previous, answer_count=len(cq_items),
        ),
        max_corrections=2,
        db=db,
    )
    if not response.success or response.parsed_json is None:
        logger.warning(
            "Batched CQ evaluation call failed",
            exam_attempt_id=exam_attempt_id, provider=provider, error=response.error,
        )
        return None
    return response.parsed_json


async def _persist_section_evaluation(
    *,
    attempt: TestAttempt,
    mcq_feedback: list[dict],
    cq_questions: list[Question],
    candidate_answers: dict,
    answers_by_qid: dict[str, CqAnswerScoreAI],
    section_summary,
    overall_strengths: list[str],
    overall_weaknesses: list[str],
    db: AsyncSession,
) -> Evaluation:
    """Persist one section's Evaluation + QuestionFeedback rows from the
    already-computed MCQ feedback + this section's slice of the batched CQ
    result. Idempotent: replaces any existing Evaluation for this attempt
    (re-evaluation / retry support)."""
    existing = await db.execute(select(Evaluation).where(Evaluation.attempt_id == attempt.id))
    old = existing.scalar_one_or_none()
    if old is not None:
        await db.delete(old)
        await db.flush()

    mcq_score = sum(f["awarded_score"] for f in mcq_feedback)
    mcq_max = sum(f["max_score"] for f in mcq_feedback)

    cq_feedback_rows: list[dict] = []
    cq_score = 0.0
    cq_max = 0.0
    for q in cq_questions:
        ans = answers_by_qid.get(q.id)
        candidate_answer = candidate_answers.get(q.id)
        candidate_text = (
            (candidate_answer.answer_text or "").strip()
            if candidate_answer is not None
            else ""
        )
        ai_detection = await estimate_ai_likeness(q.question_text, candidate_text)
        ai_detection_fields = {
            "estimated_ai_percentage": (
                ai_detection.estimated_ai_percentage if ai_detection else None
            ),
            "ai_detection_confidence": ai_detection.confidence if ai_detection else None,
            "suspicious_phrases": ai_detection.suspicious_phrases if ai_detection else None,
            "ai_detection_explanation": ai_detection.explanation if ai_detection else None,
            "ai_detection_recommendation": (
                ai_detection.recommendation if ai_detection else None
            ),
        }
        if ans is None:
            cq_feedback_rows.append({
                "question_id": q.id, "awarded_score": 0, "max_score": q.marks,
                "ai_feedback": "Not evaluated — missing from batched evaluation response.",
                "matched_criteria": [], "missed_criteria": [],
                **ai_detection_fields,
            })
            cq_max += q.marks
            continue
        # Clamp the model-reported score to [0, q.marks]. The schema only
        # enforces score >= 0, and the model controls both score and max_score,
        # so an unclamped value (hallucinated or injected via the candidate's
        # answer text) could push a section over 100%. q.marks is the
        # DB-authoritative maximum — never trust the model's max_score for the
        # denominator. Mirrors the legacy path's le=10 + _scale_score bound.
        awarded = max(0, min(int(round(ans.score)), q.marks))
        cq_feedback_rows.append({
            "question_id": q.id,
            "awarded_score": awarded,
            "max_score": q.marks,
            "ai_feedback": ans.feedback,
            "matched_criteria": ans.strengths,
            "missed_criteria": ans.weaknesses,
            **ai_detection_fields,
        })
        cq_score += awarded
        cq_max += q.marks

    total_score = mcq_score + cq_score
    max_score = mcq_max + cq_max
    # Scores are clamped per question above, so this is already <= 100; the
    # min() is defense-in-depth against any future unclamped contributor.
    percentage = round(min(100.0, total_score / max_score * 100), 1) if max_score else 0.0
    recommendation = evaluation_service.score_to_recommendation(percentage)
    overall_ai_pct, overall_ai_confidence, flagged_count = (
        evaluation_service._aggregate_ai_detection(cq_feedback_rows)
    )

    evaluation = Evaluation(
        attempt_id=attempt.id,
        total_score=round(total_score),
        max_score=round(max_score),
        percentage=percentage,
        mcq_score=round(mcq_score),
        mcq_max=round(mcq_max),
        open_ended_score=round(cq_score),
        open_ended_max=round(cq_max),
        ai_strengths=overall_strengths[:5],
        ai_weaknesses=overall_weaknesses[:5],
        ai_recommendation=AIRecommendation(recommendation),
        ai_summary=(section_summary.feedback if section_summary else "") or "Evaluated via batched CQ pass.",
        overall_ai_likeness_percentage=overall_ai_pct,
        overall_ai_detection_confidence=overall_ai_confidence,
        flagged_answer_count=flagged_count,
        is_preliminary=True,
        evaluated_at=datetime.now(tz=UTC),
    )
    db.add(evaluation)
    await db.flush()

    for fb in mcq_feedback:
        db.add(QuestionFeedback(
            evaluation_id=evaluation.id,
            question_id=fb["question_id"],
            attempt_id=attempt.id,
            question_type="MCQ",
            awarded_score=fb["awarded_score"],
            max_score=fb["max_score"],
            is_correct=fb["is_correct"],
        ))
    for fb in cq_feedback_rows:
        ai_confidence = fb.get("ai_detection_confidence")
        ai_recommendation = fb.get("ai_detection_recommendation")
        db.add(QuestionFeedback(
            evaluation_id=evaluation.id,
            question_id=fb["question_id"],
            attempt_id=attempt.id,
            question_type="OPEN_ENDED",
            awarded_score=fb["awarded_score"],
            max_score=fb["max_score"],
            ai_feedback=fb["ai_feedback"],
            matched_criteria=fb["matched_criteria"],
            missed_criteria=fb["missed_criteria"],
            estimated_ai_percentage=fb.get("estimated_ai_percentage"),
            ai_detection_confidence=(
                AIDetectionConfidence(ai_confidence) if ai_confidence else None
            ),
            suspicious_phrases=fb.get("suspicious_phrases"),
            ai_detection_explanation=fb.get("ai_detection_explanation"),
            ai_detection_recommendation=(
                AIDetectionRecommendation(ai_recommendation)
                if ai_recommendation
                else None
            ),
        ))

    await db.flush()
    return evaluation
