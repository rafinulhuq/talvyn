"""
SQLAlchemy ORM models for evaluation results.

Evaluation        — one per TestAttempt; stores aggregate scores + AI recommendation
QuestionFeedback  — one per CandidateAnswer; stores per-question AI feedback

Separation rationale:
  - Evaluation is what the admin sees in the results dashboard
  - QuestionFeedback is the drill-down per question (optional detailed view)
  - MCQ answers are auto-scored; open-ended answers go through Ollama
  - Evaluation.is_preliminary = True ALWAYS — this is an AI first-pass only
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models._types import GUID, JSONType, VectorType
from app.db.models.enums import (
    AIDetectionConfidence,
    AIDetectionRecommendation,
    AIRecommendation,
    EvaluationLevel,
)

EMBEDDING_DIM = 768  # nomic-embed-text output size — see embedding_service.py


class Evaluation(Base):
    __tablename__ = "evaluations"

    id: Mapped[str] = mapped_column(
        GUID(), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    attempt_id: Mapped[str] = mapped_column(
        GUID(),
        ForeignKey("test_attempts.id", ondelete="CASCADE"),
        unique=True,          # One evaluation per attempt
        nullable=False,
    )

    # ── Scores ────────────────────────────────────────────────
    total_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    percentage: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    mcq_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    mcq_max: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    open_ended_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    open_ended_max: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # ── AI narrative ──────────────────────────────────────────
    ai_strengths: Mapped[list] = mapped_column(
        JSONType(), nullable=False, default=list
    )
    ai_weaknesses: Mapped[list] = mapped_column(
        JSONType(), nullable=False, default=list
    )
    ai_recommendation: Mapped[AIRecommendation] = mapped_column(
        Enum(AIRecommendation, name="AIRecommendation", create_type=False),
        nullable=False,
    )
    ai_summary: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # ── Admin override ────────────────────────────────────────
    admin_override_recommendation: Mapped[AIRecommendation | None] = mapped_column(
        Enum(AIRecommendation, name="AIRecommendation", create_type=False),
        nullable=True,
    )
    admin_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Enhanced evaluation fields ────────────────────────────
    evaluation_level: Mapped[EvaluationLevel | None] = mapped_column(
        Enum(EvaluationLevel, name="EvaluationLevel", create_type=False),
        nullable=True,
    )
    improvement_suggestions: Mapped[list] = mapped_column(
        JSONType(), nullable=False, default=list
    )
    suitable_role: Mapped[str | None] = mapped_column(Text, nullable=True)
    skill_breakdown: Mapped[dict] = mapped_column(
        JSONType(), nullable=False, default=dict
    )

    # ── Semantic similarity (pgvector, opt-in) ─────────────────
    # NULL unless EMBEDDING_ENABLED=true and embedding generation succeeded.
    # Used by GET /evaluation/{id}/similar to rank "candidates like this one".
    embedding: Mapped[list[float] | None] = mapped_column(
        VectorType(EMBEDDING_DIM), nullable=True
    )

    # ── AI-likeness estimate (opt-in, AI_LIKENESS_ENABLED) ────
    # Aggregated across open-ended answers. NULL unless the feature is
    # enabled and at least one open-ended answer was analyzed. Probabilistic
    # signal, never a verdict — see ai_detection_service.py.
    overall_ai_likeness_percentage: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )
    overall_ai_detection_confidence: Mapped[AIDetectionConfidence | None] = mapped_column(
        Enum(AIDetectionConfidence, name="AIDetectionConfidence", create_type=False),
        nullable=True,
    )
    flagged_answer_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    # ── Section breakdown + model provenance (Master Prompt 2) ─
    # { "REASONING": {"score": .., "max": ..}, "PRACTICAL": {...}, ... }
    section_scores_json: Mapped[dict | None] = mapped_column(JSONType(), nullable=True)
    # Which model produced this evaluation (e.g. "gemma3:4b", "glm-cloud") —
    # not tracked historically; NULL for evaluations created before this field.
    model_used: Mapped[str | None] = mapped_column(String(100), nullable=True)
    raw_model_output_json: Mapped[dict | None] = mapped_column(JSONType(), nullable=True)

    # ── Flags ─────────────────────────────────────────────────
    # ALWAYS True — AI evaluation is preliminary only
    is_preliminary: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    evaluated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # ── Relationships ─────────────────────────────────────────
    question_feedback: Mapped[list["QuestionFeedback"]] = relationship(
        "QuestionFeedback",
        back_populates="evaluation",
        cascade="all, delete-orphan",
        lazy="select",
    )

    def __repr__(self) -> str:
        return (
            f"<Evaluation id={self.id!r} "
            f"attempt={self.attempt_id!r} "
            f"score={self.total_score}/{self.max_score}>"
        )


class QuestionFeedback(Base):
    """Per-question AI feedback — one row per evaluated CandidateAnswer."""

    __tablename__ = "question_feedback"
    __table_args__ = (
        # Loaded in bulk when rendering the results detail page
        Index("ix_qfeedback_evaluation_id", "evaluation_id"),
        # Needed for re-evaluation lookup (delete old feedback by attempt)
        Index("ix_qfeedback_attempt_id", "attempt_id"),
    )

    id: Mapped[str] = mapped_column(
        GUID(), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    evaluation_id: Mapped[str] = mapped_column(
        GUID(),
        ForeignKey("evaluations.id", ondelete="CASCADE"),
        nullable=False,
    )
    question_id: Mapped[str] = mapped_column(
        GUID(),
        ForeignKey("questions.id", ondelete="CASCADE"),
        nullable=False,
    )
    attempt_id: Mapped[str] = mapped_column(
        GUID(),
        ForeignKey("test_attempts.id", ondelete="CASCADE"),
        nullable=False,
    )

    # ── Scoring ───────────────────────────────────────────────
    question_type: Mapped[str] = mapped_column(String(20), nullable=False)
    awarded_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_correct: Mapped[bool | None] = mapped_column(
        Boolean, nullable=True
    )   # Only set for MCQ

    # ── AI feedback (open-ended only) ─────────────────────────
    ai_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    matched_criteria: Mapped[list] = mapped_column(
        JSONType(), nullable=False, default=list
    )
    missed_criteria: Mapped[list] = mapped_column(
        JSONType(), nullable=False, default=list
    )

    # ── Admin manual score override ────────────────────────────
    admin_awarded_score: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # ── AI-likeness estimate (opt-in, open-ended only) ─────────
    # NULL unless AI_LIKENESS_ENABLED=true and this is an open-ended answer.
    # Probabilistic signal, never a verdict — see ai_detection_service.py.
    estimated_ai_percentage: Mapped[float | None] = mapped_column(Float, nullable=True)
    ai_detection_confidence: Mapped[AIDetectionConfidence | None] = mapped_column(
        Enum(AIDetectionConfidence, name="AIDetectionConfidence", create_type=False),
        nullable=True,
    )
    suspicious_phrases: Mapped[list | None] = mapped_column(JSONType(), nullable=True)
    ai_detection_explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_detection_recommendation: Mapped[AIDetectionRecommendation | None] = mapped_column(
        Enum(AIDetectionRecommendation, name="AIDetectionRecommendation", create_type=False),
        nullable=True,
    )

    # ── Relationships ─────────────────────────────────────────
    evaluation: Mapped["Evaluation"] = relationship(
        "Evaluation", back_populates="question_feedback"
    )

    def __repr__(self) -> str:
        return (
            f"<QuestionFeedback q={self.question_id!r} "
            f"score={self.awarded_score}/{self.max_score}>"
        )
