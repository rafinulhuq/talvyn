"""
AI Task Router Service (Master Prompt 3).

Pure decision logic — no HTTP calls, no DB access — mapping a task_type to
a provider ("local" | "glm"), plus the "deep review" escalation rules that
let a small set of candidates (top performers, borderline scores, high
AI-risk, or an explicit admin request) get a GLM pass on top of the default
local CQ evaluation. Kept separate from ai_provider_service.py so the
routing table itself is independently unit-testable without mocking HTTP.

Routing table (the cost-control core of Master Prompt 3 — see
docs/ai-assessment-redesign-audit.md and the redesign's "never call GLM per
answer" principle):
    jd_skills_extraction      -> local   (cheap, repeated)
    topic_mapping             -> local
    question_bank_generation  -> glm     (once per job post — quality matters)
    rubric_generation         -> glm
    question_review           -> glm
    cq_evaluation             -> local by default; glm only on deep-review trigger
    final_report              -> local by default; glm optional (explicit request)
    ai_risk_explanation       -> glm, and only when a deep-review trigger fires

GLM tasks silently fall back to "local" whenever GLM isn't configured
(glm_enabled=false or no API key) — this router never blocks on a missing
cloud credential; question bank generation/etc. just runs on the local
model instead, exactly as it did before this redesign.
"""

from dataclasses import dataclass

from app.config import get_settings

_TASK_DEFAULT_PROVIDER: dict[str, str] = {
    "jd_skills_extraction": "local",
    "topic_mapping": "local",
    "skill_to_section_planning": "local",
    "question_bank_generation": "glm",
    "rubric_generation": "glm",
    "question_review": "glm",
    "cq_evaluation": "local",
    "final_report": "local",
    "ai_risk_explanation": "glm",
}

# Recommendation-tier boundaries from evaluation_service._score_to_recommendation
# — reused here so "borderline" means "near a hire/no-hire cutoff", not an
# arbitrary number.
_RECOMMENDATION_BOUNDARIES = (80.0, 65.0, 45.0)


@dataclass
class DeepReviewContext:
    """Caller-supplied signals deciding whether a normally-local task should
    escalate to GLM for this one candidate. All optional — omitting a field
    just means that trigger can't fire."""
    is_top_candidate: bool = False
    is_borderline: bool = False
    ai_risk_score: float | None = None
    admin_requested: bool = False
    local_confidence: float | None = None  # 0-1, from the local model's own evaluation_confidence


def glm_configured() -> bool:
    settings = get_settings()
    return bool(settings.glm_enabled and settings.glm_api_base_url and settings.glm_api_key)


def choose_provider(task_type: str, context: DeepReviewContext | None = None) -> str:
    """
    Resolve a task_type (+ optional per-candidate context) to a concrete
    provider. Always returns "local" or "glm" — never "auto".
    """
    default = _TASK_DEFAULT_PROVIDER.get(task_type, "local")

    if default == "glm":
        return "glm" if glm_configured() else "local"

    # default == "local": only cq_evaluation/final_report/ai_risk_explanation
    # ever escalate, and only when GLM is actually configured.
    if context is not None and glm_configured() and should_deep_review(context):
        return "glm"

    return default


def should_deep_review(context: DeepReviewContext) -> bool:
    """True if ANY deep-review trigger fires. Each trigger is independently
    sufficient — this is deliberately an OR, not a scoring formula, so any
    one strong signal (e.g. an explicit admin request) is never diluted by
    the others being absent."""
    settings = get_settings()
    if context.admin_requested:
        return True
    if context.ai_risk_score is not None and context.ai_risk_score >= settings.deep_review_ai_risk_threshold:
        return True
    if context.is_top_candidate or context.is_borderline:
        return True
    return context.local_confidence is not None and context.local_confidence < 0.5


def classify_score(percentage: float) -> tuple[bool, bool]:
    """Returns (is_top_candidate, is_borderline) for a final percentage score,
    used to build a DeepReviewContext without each caller re-deriving the
    thresholds itself."""
    settings = get_settings()
    is_top = percentage >= settings.deep_review_top_candidate_threshold
    is_borderline = any(
        abs(percentage - boundary) <= settings.deep_review_borderline_window
        for boundary in _RECOMMENDATION_BOUNDARIES
    )
    return is_top, is_borderline
