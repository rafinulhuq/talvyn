"""
AI Risk Service (Master Prompt 2, extended by Master Prompt 3).

Computes a hedged "AI-likeness risk" score for one candidate's whole
sectioned exam, combining behavioral signals (already logged via
SuspiciousEvent — tab switches, copy/paste, paste length, time per
question) with the existing textual signal
(Evaluation.overall_ai_likeness_percentage, itself a probabilistic LLM
estimate — see ai_detection_service.py) and a simple cross-candidate
answer-similarity check. An OPTIONAL GLM explanation (get_risk_explanation)
can add a hedged narrative for deep-review-triggered candidates only —
never run automatically for every candidate.

Language policy (binding — see docs/ai-assessment-redesign-audit.md and
Master Prompt 3's explicit instruction not to call this "certainty"):
  - NEVER claim certainty. No string in this module may say "used AI",
    "AI-generated", or similar. get_risk_summary()'s "warning" field and
    every GLM explanation are paired with the same hedge.
  - risk_points on an individual AiRiskSignal are a 0-100 contribution to
    the aggregate, not a percentage probability of anything.
  - ai_likeness_risk is a low/medium/high BUCKET for human triage, not a
    verdict — see _risk_level().

Known limitation (documented, not a silent gap): peer answer similarity
here is a simple normalized-text exact/near-exact match, not an embedding-
based semantic comparison. The embedding infrastructure already used for
"similar evaluations" (embedding_service.py, pgvector) would be a natural
upgrade path for a future prompt.
"""

import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.db.models.attempt import CandidateAnswer, SuspiciousEvent, TestAttempt
from app.db.models.enums import QuestionType
from app.db.models.evaluation import Evaluation
from app.db.models.question_bank import AiRiskSignal, ExamAttempt
from app.db.models.test import Question
from app.prompts.glm_tasks import AI_RISK_EXPLANATION
from app.schemas.ai_orchestration import AiRiskExplanationAI
from app.services import ai_provider_service, ai_task_router_service
from app.services.ai_provider_service import AiGenerateRequest
from app.services.ai_task_router_service import DeepReviewContext

logger = get_logger(__name__)

RISK_WARNING = (
    "This is not proof of AI usage. It should be reviewed with other evidence "
    "before making any decision about this candidate."
)

_COPY_PASTE_EVENTS = {"COPY_ATTEMPT", "PASTE_ATTEMPT", "CUT_ATTEMPT"}
_TAB_SWITCH_EVENTS = {"TAB_SWITCH", "WINDOW_BLUR", "VISIBILITY_HIDDEN"}

# Weights are deliberately conservative: behavioral signals are much
# weaker evidence than the LLM text estimate, which itself already hedges.
_SIGNAL_WEIGHTS = {
    "TAB_SWITCH_COUNT": 0.08,
    "COPY_PASTE_COUNT": 0.12,
    "PASTE_LENGTH": 0.08,
    "TIME_PER_QUESTION_ANOMALY": 0.10,
    "COMPLETION_TIME_ANOMALY": 0.12,
    "TEXT_AI_LIKENESS": 0.38,
    "ANSWER_SIMILARITY_PEER": 0.12,
}


async def compute_risk_for_exam_attempt(exam_attempt_id: str, db: AsyncSession) -> ExamAttempt:
    """
    Compute and persist ai_risk_signals + the aggregate ExamAttempt.ai_risk_score.

    Never raises on a missing/partial signal — a signal that can't be
    computed (e.g. AI-likeness disabled) is simply omitted from the
    weighted average rather than failing the whole exam attempt.
    """
    result = await db.execute(select(ExamAttempt).where(ExamAttempt.id == exam_attempt_id))
    exam_attempt = result.scalar_one()

    section_attempts_result = await db.execute(
        select(TestAttempt).where(TestAttempt.exam_attempt_id == exam_attempt_id)
    )
    section_attempts = list(section_attempts_result.scalars().all())
    attempt_ids = [a.id for a in section_attempts]

    signals: list[AiRiskSignal] = []

    tab_switches = await _count_events(attempt_ids, _TAB_SWITCH_EVENTS, db)
    signals.append(_make_signal(exam_attempt_id, "TAB_SWITCH_COUNT", tab_switches, min(100.0, tab_switches * 10)))

    copy_paste = await _count_events(attempt_ids, _COPY_PASTE_EVENTS, db)
    signals.append(_make_signal(exam_attempt_id, "COPY_PASTE_COUNT", copy_paste, min(100.0, copy_paste * 15)))

    paste_points, paste_detail = await _paste_length(attempt_ids, db)
    signals.append(_make_signal(exam_attempt_id, "PASTE_LENGTH", paste_detail, paste_points))

    timing_points, timing_detail = _completion_time_anomaly(section_attempts)
    signals.append(_make_signal(exam_attempt_id, "COMPLETION_TIME_ANOMALY", timing_detail, timing_points))

    per_q_points, per_q_detail = await _time_per_question_anomaly(attempt_ids, db)
    signals.append(_make_signal(exam_attempt_id, "TIME_PER_QUESTION_ANOMALY", per_q_detail, per_q_points))

    text_points = await _text_ai_likeness(attempt_ids, db)
    if text_points is not None:
        signals.append(_make_signal(exam_attempt_id, "TEXT_AI_LIKENESS", {"avg_percentage": text_points}, text_points))

    similarity_points, similarity_detail = await _peer_answer_similarity(exam_attempt, attempt_ids, db)
    if similarity_points is not None:
        signals.append(_make_signal(exam_attempt_id, "ANSWER_SIMILARITY_PEER", similarity_detail, similarity_points))

    # Replace any previous signals for this attempt (re-computation support).
    existing = await db.execute(select(AiRiskSignal).where(AiRiskSignal.exam_attempt_id == exam_attempt_id))
    for old in existing.scalars().all():
        await db.delete(old)
    for s in signals:
        db.add(s)

    exam_attempt.ai_risk_score = _aggregate(signals)
    await db.commit()
    await db.refresh(exam_attempt)

    logger.info(
        "AI risk computed for exam attempt",
        exam_attempt_id=exam_attempt_id,
        ai_risk_score=exam_attempt.ai_risk_score,
        signal_count=len(signals),
    )
    return exam_attempt


def _make_signal(exam_attempt_id: str, signal_type: str, value: object, risk_points: float) -> AiRiskSignal:
    return AiRiskSignal(
        exam_attempt_id=exam_attempt_id,
        signal_type=signal_type,
        signal_value_json=value if isinstance(value, dict) else {"value": value},
        risk_points=round(max(0.0, min(100.0, risk_points)), 1),
    )


def _aggregate(signals: list[AiRiskSignal]) -> float:
    """Weighted average over whichever signals were actually computed —
    never penalizes a candidate for a signal that simply wasn't available
    (e.g. AI-likeness disabled)."""
    if not signals:
        return 0.0
    total_weight = 0.0
    weighted_sum = 0.0
    for s in signals:
        w = _SIGNAL_WEIGHTS.get(s.signal_type, 0.1)
        weighted_sum += s.risk_points * w
        total_weight += w
    return round(weighted_sum / total_weight, 1) if total_weight else 0.0


async def _count_events(attempt_ids: list[str], event_types: set[str], db: AsyncSession) -> int:
    if not attempt_ids:
        return 0
    result = await db.execute(
        select(SuspiciousEvent).where(
            SuspiciousEvent.attempt_id.in_(attempt_ids),
            SuspiciousEvent.event_type.in_(event_types),
        )
    )
    return len(result.scalars().all())


def _completion_time_anomaly(section_attempts: list[TestAttempt]) -> tuple[float, dict]:
    """
    Flags unusually fast completion (e.g. a 45-minute section finished in
    under 2 minutes) — a behavioral signal, not proof of anything. Slow
    completion is never flagged; only suspiciously fast.
    """
    fastest_ratio = 1.0
    detail: dict = {}
    for a in section_attempts:
        if a.started_at is None or a.submitted_at is None:
            continue
        elapsed = (a.submitted_at - a.started_at).total_seconds()
        # time_remaining_seconds was initialised to duration*60 at start —
        # reconstruct the original duration from it plus elapsed time is
        # unreliable once autosave has updated it, so use a fixed floor
        # instead: anything under 60s for a whole section is anomalous
        # regardless of the section's configured duration.
        if elapsed < 60:
            fastest_ratio = 0.0
            detail[a.id] = {"elapsed_seconds": elapsed, "flag": "under_60s"}
    points = 0.0 if fastest_ratio == 1.0 else 80.0
    return points, detail


async def _paste_length(attempt_ids: list[str], db: AsyncSession) -> tuple[float, dict]:
    """
    Sum of pasted-content length across PASTE_ATTEMPT events, from
    event_metadata (the candidate-side integrity logger may include a
    `length` field — see attempt_service.log_suspicious_event /
    SuspiciousEventRequest.metadata). Missing/absent length metadata is
    treated as 0 for that event, not skipped — older clients that don't
    report length simply don't contribute to this signal.
    """
    if not attempt_ids:
        return 0.0, {}
    result = await db.execute(
        select(SuspiciousEvent.event_metadata).where(
            SuspiciousEvent.attempt_id.in_(attempt_ids),
            SuspiciousEvent.event_type == "PASTE_ATTEMPT",
        )
    )
    total_length = sum((row[0] or {}).get("length", 0) for row in result.all())
    points = min(100.0, total_length / 20.0)  # 2000+ pasted chars -> max points
    return points, {"total_pasted_chars": total_length}


async def _time_per_question_anomaly(attempt_ids: list[str], db: AsyncSession) -> tuple[float, dict]:
    """
    Flags an implausibly low average time-per-answer across the whole exam —
    a behavioral signal (fast typing/pasting), not proof of anything.
    Approximated from CandidateAnswer.saved_at spacing within each attempt,
    since this codebase doesn't log a per-question open timestamp.
    """
    if not attempt_ids:
        return 0.0, {}
    result = await db.execute(
        select(CandidateAnswer.attempt_id, CandidateAnswer.saved_at)
        .where(CandidateAnswer.attempt_id.in_(attempt_ids))
        .order_by(CandidateAnswer.attempt_id, CandidateAnswer.saved_at)
    )
    rows = result.all()
    if len(rows) < 2:
        return 0.0, {}

    gaps: list[float] = []
    prev_attempt, prev_time = None, None
    for attempt_id, saved_at in rows:
        if attempt_id == prev_attempt and prev_time is not None:
            gaps.append((saved_at - prev_time).total_seconds())
        prev_attempt, prev_time = attempt_id, saved_at

    if not gaps:
        return 0.0, {}
    avg_gap = sum(gaps) / len(gaps)
    # Under 5s average between answers across a whole exam is implausible
    # for genuinely reading and answering each question.
    points = 0.0 if avg_gap >= 5.0 else min(100.0, (5.0 - avg_gap) * 20)
    return points, {"avg_seconds_between_answers": round(avg_gap, 1)}


async def _text_ai_likeness(attempt_ids: list[str], db: AsyncSession) -> float | None:
    """Average of the existing per-section Evaluation.overall_ai_likeness_percentage.
    Returns None (not 0) when the feature is disabled or no section has a
    value yet — None is excluded from the weighted average entirely,
    whereas 0 would wrongly count as "definitely not AI-like"."""
    if not attempt_ids:
        return None
    result = await db.execute(
        select(Evaluation.overall_ai_likeness_percentage).where(
            Evaluation.attempt_id.in_(attempt_ids),
            Evaluation.overall_ai_likeness_percentage.is_not(None),
        )
    )
    values = [row[0] for row in result.all()]
    if not values:
        return None
    return round(sum(values) / len(values), 1)


_WORD_RE = re.compile(r"[a-z0-9]+")


def _normalize(text: str) -> str:
    return " ".join(_WORD_RE.findall(text.lower()))


async def _peer_answer_similarity(
    exam_attempt: ExamAttempt, attempt_ids: list[str], db: AsyncSession
) -> tuple[float | None, dict]:
    """
    Simple near-exact-match check: for each of this candidate's open-ended
    answers, look for another candidate's answer to the SAME question
    (same question_id, different exam attempt) that normalizes to the same
    text. Short answers (<40 normalized chars) are excluded — short generic
    answers ("not sure", "n/a") would otherwise produce noisy false flags.
    """
    if not attempt_ids:
        return None, {}

    own_answers_result = await db.execute(
        select(CandidateAnswer.question_id, CandidateAnswer.answer_text)
        .join(Question, Question.id == CandidateAnswer.question_id)
        .where(
            CandidateAnswer.attempt_id.in_(attempt_ids),
            Question.question_type == QuestionType.OPEN_ENDED,
            CandidateAnswer.answer_text.is_not(None),
        )
    )
    own_answers = [(qid, text) for qid, text in own_answers_result.all() if text and len(_normalize(text)) >= 40]
    if not own_answers:
        return None, {}

    matches: list[dict] = []
    for question_id, text in own_answers:
        normalized = _normalize(text)
        peer_result = await db.execute(
            select(CandidateAnswer.attempt_id, CandidateAnswer.answer_text)
            .join(TestAttempt, TestAttempt.id == CandidateAnswer.attempt_id)
            .where(
                CandidateAnswer.question_id == question_id,
                TestAttempt.exam_attempt_id != exam_attempt.id,
                TestAttempt.exam_attempt_id.is_not(None),
                CandidateAnswer.answer_text.is_not(None),
            )
        )
        for peer_attempt_id, peer_text in peer_result.all():
            if peer_text and _normalize(peer_text) == normalized:
                matches.append({"question_id": question_id, "peer_attempt_id": peer_attempt_id})

    if not matches:
        return 0.0, {"matches": []}

    points = min(100.0, len(matches) * 35.0)
    return points, {"matches": matches}


# ─── Risk-level bucketing + summary (Master Prompt 3) ──────────

def _risk_level(score: float) -> str:
    """low/medium/high BUCKET for human triage — never a verdict.
    Boundaries are deliberately coarse (33/66) rather than a fine-grained
    percentile, so small score differences near a boundary don't imply
    false precision."""
    if score >= 66.0:
        return "high"
    if score >= 33.0:
        return "medium"
    return "low"


async def get_risk_summary(exam_attempt_id: str, db: AsyncSession) -> dict:
    """
    Master Prompt 3's exact output shape:
        {"ai_likeness_risk": "low"|"medium"|"high", "risk_score": float,
         "reasons": [...], "signals": [...], "warning": str}
    Reads already-persisted ai_risk_signals (compute_risk_for_exam_attempt
    must have run first) rather than recomputing — this is a read view, not
    a second computation pass.
    """
    result = await db.execute(select(ExamAttempt).where(ExamAttempt.id == exam_attempt_id))
    exam_attempt = result.scalar_one()

    signals_result = await db.execute(
        select(AiRiskSignal).where(AiRiskSignal.exam_attempt_id == exam_attempt_id)
    )
    signals = list(signals_result.scalars().all())

    score = exam_attempt.ai_risk_score or 0.0
    reasons = [
        f"{s.signal_type.replace('_', ' ').title()} (contributed {s.risk_points:.0f}/100)"
        for s in signals
        if s.risk_points >= 30.0
    ]

    return {
        "ai_likeness_risk": _risk_level(score),
        "risk_score": score,
        "reasons": reasons,
        "signals": [
            {"signal_type": s.signal_type, "risk_points": s.risk_points, "value": s.signal_value_json}
            for s in signals
        ],
        "warning": RISK_WARNING,
    }


# ─── Optional GLM explanation (deep-review only) ───────────────

async def get_risk_explanation(
    exam_attempt_id: str, db: AsyncSession, *, admin_requested: bool = False
) -> str | None:
    """
    Optional hedged narrative explanation of this candidate's risk signals —
    NEVER computed automatically for every candidate. Only runs when a
    deep-review trigger fires (high risk score, top/borderline candidate)
    or an admin explicitly asks. Returns None (not an error) if GLM isn't
    configured or the call fails — the numeric risk_score/signals from
    get_risk_summary() are always available regardless.
    """
    summary = await get_risk_summary(exam_attempt_id, db)
    context = DeepReviewContext(
        ai_risk_score=summary["risk_score"],
        admin_requested=admin_requested,
    )
    if not ai_task_router_service.should_deep_review(context) and not admin_requested:
        return None
    if not ai_task_router_service.glm_configured():
        return None

    signals_listing = "\n".join(
        f"- {s['signal_type']}: {s['risk_points']:.0f}/100 ({s['value']})" for s in summary["signals"]
    )
    prompt = AI_RISK_EXPLANATION.explanation_template.format(
        signals_listing=signals_listing or "(no signals recorded)",
        risk_score=summary["risk_score"],
        risk_level=summary["ai_likeness_risk"],
    )
    req = AiGenerateRequest(
        task_type="ai_risk_explanation",
        system_prompt=AI_RISK_EXPLANATION.system,
        user_prompt=prompt,
        model_preference="glm",
        expected_json_schema=AiRiskExplanationAI,
        metadata={"exam_attempt_id": exam_attempt_id},
    )
    response = await ai_provider_service.generate(req, db=db)
    if not response.success or response.parsed_json is None:
        logger.warning("AI-risk explanation call failed", exam_attempt_id=exam_attempt_id, error=response.error)
        return None

    explanation: AiRiskExplanationAI = response.parsed_json
    return explanation.explanation
