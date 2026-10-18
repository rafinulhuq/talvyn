"""
Pydantic schemas for the sectioned-exam endpoints (Master Prompt 2).

Reuses QuestionForCandidate from schemas/attempt.py for the actual
per-question shape (same answer-stripping guarantees), and wraps it with
exam-level (cross-section) context.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.attempt import QuestionForCandidate


class StartExamRequest(BaseModel):
    """POST /candidate-exams/start — token identifies the invitation/JD."""
    token: str = Field(min_length=10)


class ExamSectionResponse(BaseModel):
    """Current or newly-started section for a candidate's sectioned exam."""
    exam_attempt_id: str
    attempt_id: str  # underlying TestAttempt id for this section
    section_type: str
    section_index: int  # 1-based, e.g. 2 of 3
    total_sections: int = 3
    test_title: str
    duration_seconds: int
    total_questions: int
    questions: list[QuestionForCandidate]
    started_at: datetime
    saved_answers: dict[str, str] = Field(default_factory=dict)
    exam_status: str


class SectionSubmitResponse(BaseModel):
    exam_attempt_id: str
    section_type: str
    section_submitted: bool = True
    next_section_type: str | None = None
    exam_status: str
    message: str = "Section submitted successfully."


class ExamSubmitResponse(BaseModel):
    exam_attempt_id: str
    exam_status: str
    submitted_at: datetime | None = None
    message: str = "Your exam has been submitted and is queued for evaluation."


class ExamStatusResponse(BaseModel):
    exam_attempt_id: str
    status: str
    current_section_type: str | None = None
    sections_completed: int
    total_sections: int = 3
    total_score: float | None = None
    mcq_score: float | None = None
    cq_score: float | None = None
    ai_risk_score: float | None = None


# ─── Admin: question bank ───────────────────────────────────────

class GenerateBankRequest(BaseModel):
    mcq_target: int | None = Field(default=None, ge=1, le=200)
    cq_target: int | None = Field(default=None, ge=1, le=100)


class BankSectionStatus(BaseModel):
    mcq: int
    cq: int
    meets_minimum: bool
    meets_commercial_recommended: bool


class BankStatusResponse(BaseModel):
    exists: bool
    bank_id: str | None = None
    status: str | None = None
    ready: bool = False
    below_recommended: bool = False
    # True once every section's Test row is APPROVED (review_bank() in
    # question_bank_service.py) — distinct from `status`/`ready`, which only
    # track generation completeness. QuestionBank itself has no separate
    # "approved" status value; approval lives on the Test rows.
    is_approved: bool = False
    sections: dict[str, BankSectionStatus] = Field(default_factory=dict)


class ReviewBankRequest(BaseModel):
    reviewer_model: str | None = None


class UpdateBankConfigRequest(BaseModel):
    mcq_target: int | None = Field(default=None, ge=1, le=200)
    cq_target: int | None = Field(default=None, ge=1, le=100)
    section_weights: dict[str, float] | None = None


# ─── Admin: reports ─────────────────────────────────────────────

class ExamAttemptReportResponse(BaseModel):
    exam_attempt_id: str
    candidate_id: str
    jd_id: str
    status: str
    total_score: float | None = None
    mcq_score: float | None = None
    cq_score: float | None = None
    section_scores: dict[str, dict] = Field(default_factory=dict)
    ai_risk_score: float | None = None
    ai_likeness_risk: Literal["low", "medium", "high"] | None = None
    ai_risk_reasons: list[str] = Field(default_factory=list)
    ai_risk_signals: list[dict] = Field(default_factory=list)
    ai_risk_explanation: str | None = Field(
        default=None,
        description="Optional GLM-generated hedged narrative — only populated for "
        "deep-review-triggered candidates or an explicit admin request.",
    )
    ai_risk_disclaimer: str = (
        "This score reflects behavioral and writing-style signals only. "
        "It is not proof of AI use and should never be the sole basis for "
        "a hiring decision — always review the candidate's actual answers."
    )
