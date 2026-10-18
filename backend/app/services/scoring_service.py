"""
Scoring Service (Master Prompt 2, extended by Master Prompt 3).

Combines the 3 section-level Evaluation rows — populated either by the
legacy per-section evaluation_service.evaluate_attempt() or (the default,
as of Master Prompt 3) cq_batch_evaluation_service's single batched CQ
call — into one weighted ExamAttempt-level score.

Within each section: MCQ counts for `section_mcq_weight` (default 40%) and
CQ for `section_cq_weight` (default 60%) of that section's score — an
EXPLICIT blend, not whatever ratio the raw MCQ-vs-CQ mark totals happen to
produce. Across sections: REASONING/PRACTICAL/TECHNICAL are weighted
30/35/35% by default, overridable per-JD.

MCQ grading itself is NOT reimplemented here — it lives in
evaluation_service.score_mcqs(). This service's job is purely the
cross-section aggregation: section scores, weights, normalization.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.exceptions import ConflictError
from app.core.logging import get_logger
from app.db.models.attempt import TestAttempt
from app.db.models.enums import AttemptStatus, TestType
from app.db.models.evaluation import Evaluation
from app.db.models.job_description import JobDescription
from app.db.models.question_bank import ExamAttempt
from app.db.models.test import Test
from app.services.question_bank_service import SECTION_ORDER

logger = get_logger(__name__)


def default_section_weights() -> dict[str, float]:
    s = get_settings()
    return {
        TestType.REASONING.value: s.section_weight_reasoning,
        TestType.PRACTICAL.value: s.section_weight_practical,
        TestType.TECHNICAL.value: s.section_weight_technical,
    }


async def _section_weights_for_jd(jd_id: str, db: AsyncSession) -> dict[str, float]:
    """Per-job override (JobDescription.exam_config_json["section_weights"])
    falling back to global defaults from Settings. Always re-normalized to
    sum to 1.0 so a partial or slightly-off override never silently caps
    the combined score below 100."""
    weights = default_section_weights()

    result = await db.execute(select(JobDescription.exam_config_json).where(JobDescription.id == jd_id))
    config = result.scalar_one_or_none()
    override = (config or {}).get("section_weights") if config else None
    if override:
        weights.update({k: float(v) for k, v in override.items() if k in weights})

    total = sum(weights.values()) or 1.0
    return {k: v / total for k, v in weights.items()}


async def aggregate_exam_score(exam_attempt_id: str, db: AsyncSession) -> ExamAttempt:
    """
    Roll up the 3 section Evaluations into ExamAttempt.total_score/mcq_score/
    cq_score, weighted per section and normalized to a 0-100 scale.

    Raises:
        ConflictError: not every section has a finished Evaluation yet.
    """
    result = await db.execute(select(ExamAttempt).where(ExamAttempt.id == exam_attempt_id))
    exam_attempt = result.scalar_one()

    rows = await db.execute(
        select(Test.test_type, Evaluation)
        .join(TestAttempt, TestAttempt.id == Evaluation.attempt_id)
        .join(Test, Test.id == TestAttempt.test_id)
        .where(TestAttempt.exam_attempt_id == exam_attempt_id)
    )
    by_section: dict[TestType, Evaluation] = {test_type: ev for test_type, ev in rows.all()}

    missing = [s.value for s in SECTION_ORDER if s not in by_section]
    if missing:
        raise ConflictError(
            f"Cannot aggregate score — sections not yet evaluated: {', '.join(missing)}",
            error_code="SECTIONS_NOT_EVALUATED",
        )

    weights = await _section_weights_for_jd(exam_attempt.jd_id, db)
    settings = get_settings()
    mcq_weight, cq_weight = settings.section_mcq_weight, settings.section_cq_weight
    # Normalize the within-section MCQ/CQ split so a misconfigured pair that
    # doesn't sum to 1.0 can't silently miscalibrate a section score. Mirrors
    # the section-weight normalization in _section_weights_for_jd.
    _blend_sum = mcq_weight + cq_weight
    if _blend_sum > 0:
        mcq_weight, cq_weight = mcq_weight / _blend_sum, cq_weight / _blend_sum

    total = 0.0
    mcq_total = 0.0
    cq_total = 0.0
    section_breakdown: dict[str, dict] = {}

    for section in SECTION_ORDER:
        ev = by_section[section]
        weight = weights.get(section.value, 0.0)
        mcq_pct = (ev.mcq_score / ev.mcq_max * 100) if ev.mcq_max else 0.0
        cq_pct = (ev.open_ended_score / ev.open_ended_max * 100) if ev.open_ended_max else 0.0
        # Explicit within-section blend (Master Prompt 3) — NOT ev.percentage,
        # which would implicitly weight MCQ vs CQ by however many raw marks
        # each happens to carry rather than the configured 40/60 split.
        section_score = mcq_pct * mcq_weight + cq_pct * cq_weight

        section_breakdown[section.value] = {
            "mcq_score": ev.mcq_score,
            "mcq_max": ev.mcq_max,
            "mcq_pct": round(mcq_pct, 1),
            "cq_score": ev.open_ended_score,
            "cq_max": ev.open_ended_max,
            "cq_pct": round(cq_pct, 1),
            "section_score": round(section_score, 1),
            "weight": weight,
        }
        total += section_score * weight
        mcq_total += mcq_pct * weight
        cq_total += cq_pct * weight

    exam_attempt.total_score = round(total, 1)
    exam_attempt.mcq_score = round(mcq_total, 1)
    exam_attempt.cq_score = round(cq_total, 1)
    exam_attempt.metadata_json = {
        **(exam_attempt.metadata_json or {}),
        "section_scores": section_breakdown,
    }

    await db.commit()
    await db.refresh(exam_attempt)

    logger.info(
        "Exam score aggregated",
        exam_attempt_id=exam_attempt_id,
        total_score=exam_attempt.total_score,
        weights=weights,
    )
    return exam_attempt


async def all_sections_evaluated(exam_attempt_id: str, db: AsyncSession) -> bool:
    """True once every section TestAttempt for this exam is EVALUATED."""
    result = await db.execute(
        select(TestAttempt.status).where(TestAttempt.exam_attempt_id == exam_attempt_id)
    )
    statuses = [row[0] for row in result.all()]
    return len(statuses) == len(SECTION_ORDER) and all(
        s == AttemptStatus.EVALUATED for s in statuses
    )
