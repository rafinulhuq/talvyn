"""
Pydantic schemas for evaluation endpoints.

Three schema layers:
  1. OpenEndedEvalAI   — what Ollama MUST return per open-ended question
  2. AggregateEvalAI   — what Ollama MUST return for the holistic evaluation
  3. EvaluationResponse — what the API returns to the Next.js admin dashboard
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# ─────────────────────────────────────────────────────────────
# AI OUTPUT SCHEMAS (strict — validated before any DB write)
# ─────────────────────────────────────────────────────────────

class OpenEndedEvalAI(BaseModel):
    """
    Schema Ollama must conform to when evaluating one open-ended answer.

    Intentionally strict:
    - score must be an integer (not 7.5, not "8/10")
    - feedback must explain the score, not just praise
    - matched/missed criteria must reference the rubric
    """
    score: int = Field(ge=0, le=10)
    feedback: str = Field(
        min_length=20,
        description="2-4 sentences explaining the score. Must reference the rubric.",
    )
    matched_criteria: list[str] = Field(
        default_factory=list,
        description="Rubric criteria the answer satisfies",
    )
    missed_criteria: list[str] = Field(
        default_factory=list,
        description="Rubric criteria the answer missed or addressed poorly",
    )

    @field_validator("feedback")
    @classmethod
    def feedback_must_be_substantive(cls, v: str) -> str:
        # Reject feedback that is too short to explain the score.
        lower = v.lower().strip()
        if len(lower.split()) < 5:
            raise ValueError("Feedback is too short — must explain the score")
        return v


class AggregateEvalAI(BaseModel):
    """
    Schema Ollama must conform to for the holistic evaluation summary.
    Generated after all individual question scores are computed.
    """
    strengths: list[str] = Field(
        min_length=1,
        max_length=5,
        description="Specific technical or professional strengths shown in answers",
    )
    weaknesses: list[str] = Field(
        default_factory=list,
        max_length=5,
        description="Specific gaps or weaknesses shown in answers",
    )
    recommendation: Literal["STRONG_HIRE", "HIRE", "MAYBE", "NO_HIRE"]
    summary: str = Field(
        min_length=30,
        description="2-3 sentence objective summary of candidate performance",
    )
    improvement_suggestions: list[str] = Field(
        default_factory=list,
        max_length=5,
        description="Actionable improvement suggestions for the candidate",
    )
    suitable_role: str = Field(
        default="",
        description="Most suitable role level for this candidate based on performance",
    )

    @field_validator("strengths", "weaknesses", "improvement_suggestions", mode="before")
    @classmethod
    def coerce_to_str_list(cls, v: list) -> list[str]:
        return [str(x).strip() for x in v if str(x).strip()]

    @field_validator("suitable_role", mode="before")
    @classmethod
    def coerce_suitable_role(cls, v: object) -> str:
        return str(v).strip() if v else ""

    @model_validator(mode="after")
    def recommendation_consistent_with_scores(self) -> "AggregateEvalAI":
        if self.recommendation == "STRONG_HIRE" and len(self.strengths) < 1:
            raise ValueError(
                "STRONG_HIRE recommendation requires at least 1 specific strength"
            )
        return self


class AIDetectionEvalAI(BaseModel):
    """
    Schema Ollama must conform to for the AI-likeness estimate of one
    open-ended answer. This is a probabilistic writing-style signal, never
    a verdict — see ai_detection_service.py's module docstring.
    """
    estimated_ai_percentage: float = Field(ge=0, le=100)
    confidence: Literal["LOW", "MEDIUM", "HIGH"]
    suspicious_phrases: list[str] = Field(default_factory=list, max_length=5)
    explanation: str = Field(
        min_length=20,
        description="Brief rationale referencing writing style, specificity, "
        "personalization, reasoning depth, generic phrasing, or consistency.",
    )
    recommendation: Literal["NO_CONCERN", "REVIEW_SUGGESTED", "HIGH_CONCERN"]

    @field_validator("suspicious_phrases", mode="before")
    @classmethod
    def coerce_phrases(cls, v: list) -> list[str]:
        return [str(x).strip() for x in v if str(x).strip()]


# ─────────────────────────────────────────────────────────────
# API RESPONSE SCHEMAS (returned to the admin dashboard)
# ─────────────────────────────────────────────────────────────

class QuestionFeedbackResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    question_id: str
    question_type: str
    awarded_score: int
    max_score: int
    is_correct: bool | None          # MCQ only
    ai_feedback: str | None          # Open-ended only
    matched_criteria: list[str]
    missed_criteria: list[str]
    admin_awarded_score: int | None  # Admin manual override

    # AI-likeness estimate — open-ended only, null if disabled/not analyzed.
    # Probabilistic signal, never a verdict — see ai_detection_service.py.
    estimated_ai_percentage: float | None = None
    ai_detection_confidence: str | None = None
    suspicious_phrases: list[str] | None = None
    ai_detection_explanation: str | None = None
    ai_detection_recommendation: str | None = None

    # Enriched fields (populated by _load_full_evaluation, not stored on model)
    question_text: str | None = None
    question_options: list | None = None   # MCQ: [{label, text, is_correct}]
    correct_answer: str | None = None      # MCQ: "A"|"B"|"C"|"D"
    candidate_answer: str | None = None    # MCQ: selected option letter; OE: text


class EvaluationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    attempt_id: str

    # Scores
    total_score: int
    max_score: int
    percentage: float
    mcq_score: int
    mcq_max: int
    open_ended_score: int
    open_ended_max: int

    # AI narrative
    ai_strengths: list[str]
    ai_weaknesses: list[str]
    ai_recommendation: str
    ai_summary: str

    # Enhanced evaluation
    evaluation_level: str | None
    improvement_suggestions: list[str]
    suitable_role: str | None
    skill_breakdown: dict

    # Admin override
    admin_override_recommendation: str | None
    admin_notes: str | None

    # AI-likeness estimate — aggregated across open-ended answers, null if
    # disabled or there were no open-ended answers to analyze.
    overall_ai_likeness_percentage: float | None = None
    overall_ai_detection_confidence: str | None = None
    flagged_answer_count: int = 0

    # Flags
    is_preliminary: bool
    evaluated_at: datetime

    # Per-question breakdown
    question_feedback: list[QuestionFeedbackResponse]


class EvaluationSummaryResponse(BaseModel):
    """Lightweight summary for list views (no per-question breakdown)."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    attempt_id: str
    total_score: int
    max_score: int
    percentage: float
    ai_recommendation: str
    admin_override_recommendation: str | None
    is_preliminary: bool
    evaluated_at: datetime


# ─────────────────────────────────────────────────────────────
# REQUEST SCHEMAS
# ─────────────────────────────────────────────────────────────

class EvaluationListResponse(BaseModel):
    """Paginated list of evaluation summaries for the admin results page."""
    items: list[EvaluationSummaryResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


# ─────────────────────────────────────────────────────────────
# RESULTS INBOX (cross-JD attempts list — admin Results landing page)
# ─────────────────────────────────────────────────────────────

class ResultsInboxItem(BaseModel):
    """
    One row in the Results Inbox — a concluded attempt (submitted, evaluated,
    or terminated for an integrity violation) with enough candidate/JD/test
    context to render a table row without a follow-up request per row.
    """

    attempt_id: str
    attempt_status: str  # SUBMITTED | EVALUATED | TERMINATED
    submitted_at: datetime | None
    terminated_at: datetime | None
    integrity_violation_reason: str | None

    candidate_id: str
    candidate_number: int
    candidate_name: str
    candidate_email: str

    jd_id: str
    jd_title: str

    test_id: str
    test_title: str

    evaluation_id: str | None
    percentage: float | None
    recommendation: str | None  # admin override if set, else AI recommendation
    evaluation_level: str | None


class ResultsInboxResponse(BaseModel):
    """Paginated, filterable list of attempts for the Results Inbox."""
    items: list[ResultsInboxItem]
    total: int
    page: int
    page_size: int
    total_pages: int


class TriggerEvaluationRequest(BaseModel):
    """POST /evaluation/trigger — admin kicks off evaluation for an attempt."""
    attempt_id: str


class AdminOverrideRequest(BaseModel):
    """PATCH /evaluation/{id}/override — admin overrides the AI recommendation."""
    recommendation: Literal["STRONG_HIRE", "HIRE", "MAYBE", "NO_HIRE"] | None = None
    notes: str | None = Field(default=None, max_length=2000)


class AdminQuestionScoreRequest(BaseModel):
    """PATCH /evaluation/{attempt_id}/question-score — admin sets per-question score."""
    question_feedback_id: str
    admin_score: int | None = Field(default=None, ge=0)


class SimilarEvaluationItem(BaseModel):
    """One semantically-similar candidate (pgvector cosine similarity)."""
    attempt_id: str
    candidate_id: str
    candidate_name: str
    percentage: float
    ai_recommendation: str
    similarity: float = Field(description="Cosine similarity, 0.0-1.0 (higher = more similar)")


class SimilarEvaluationsResponse(BaseModel):
    """GET /evaluation/{attempt_id}/similar — opt-in, empty when embeddings are disabled."""
    attempt_id: str
    items: list[SimilarEvaluationItem]
    embeddings_enabled: bool


class LeaderboardEntry(BaseModel):
    """One candidate's entry on the leaderboard."""
    rank: int
    attempt_id: str
    candidate_name: str
    candidate_email: str
    percentage: float
    total_score: int
    max_score: int
    evaluation_level: str | None
    ai_recommendation: str
    admin_override_recommendation: str | None
    evaluated_at: datetime
    passing_marks: int | None
    passed: bool | None


class LeaderboardResponse(BaseModel):
    """GET /evaluation/leaderboard/{jd_id}"""
    jd_id: str
    job_title: str
    total_candidates: int
    avg_percentage: float
    pass_rate: float | None
    entries: list[LeaderboardEntry]


class SystemReportResponse(BaseModel):
    """GET /evaluation/system-report/{jd_id} — aggregate per-JD analytics."""
    jd_id: str
    job_title: str
    total_evaluated: int
    avg_percentage: float
    highest_percentage: float
    lowest_percentage: float
    pass_rate: float | None
    recommendation_counts: dict  # {STRONG_HIRE: N, HIRE: N, ...}
    level_counts: dict           # {EXPERT: N, ADVANCED: N, ...}
    common_weak_skills: list[str]
    common_strong_skills: list[str]


class GlobalLeaderboardEntry(BaseModel):
    """One row in the global cross-JD leaderboard."""
    rank: int
    attempt_id: str
    candidate_name: str
    candidate_email: str
    candidate_id: str | None = None
    candidate_phone: str | None = None
    candidate_linkedin_url: str | None = None
    candidate_resume_url: str | None = None
    candidate_number: int | None = None
    invited_by_id: str | None = None
    invited_by_name: str | None = None
    invited_by_email: str | None = None
    company_name: str | None = None
    ai_likeness_percentage: float | None = None
    flagged_answer_count: int = 0
    jd_id: str
    jd_title: str
    test_id: str
    test_type: str
    test_title: str
    percentage: float
    total_score: int
    max_score: int
    mcq_score: int
    mcq_max: int
    open_ended_score: int
    open_ended_max: int
    evaluation_level: str | None
    ai_recommendation: str
    admin_override_recommendation: str | None
    ai_summary: str | None
    evaluated_at: datetime
    passing_marks: int | None
    passed: bool | None


class GlobalLeaderboardResponse(BaseModel):
    """GET /evaluation/leaderboard — all candidates across all JDs."""
    total_candidates: int
    entries: list[GlobalLeaderboardEntry]
