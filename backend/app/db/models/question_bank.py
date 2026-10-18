"""
SQLAlchemy ORM models for the question-bank / sectioned-exam redesign
(Master Prompt 2).

QuestionBank          → one per JD; tracks generation lifecycle + config.
                        Actual questions still live in Test/Question
                        (tests.question_bank_id links back here) — this
                        table does not duplicate question storage.
ExamTemplate          → named, reusable question-bank config (mcq_target,
                        cq_target, section_weights) — a library entry an
                        admin applies when generating a bank for any JD,
                        not scoped to one. Owned by whoever created it
                        (created_by), scoped the same way JD ownership is.
ExamAttempt           → wraps the 3 per-section TestAttempt rows for one
                        candidate's whole sectioned exam.
ExamAttemptQuestion   → the exact question IDs locked to one candidate's
                        exam attempt, drawn from the larger bank. Never
                        mutated after creation — this IS the audit trail
                        of which candidate received which questions.
AiRiskSignal          → individual scored signal (behavioral or textual)
                        feeding into ExamAttempt.ai_risk_score.
CandidateReport       → persisted generated report per exam attempt.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
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
from app.db.models._types import GUID, JSONType
from app.db.models.enums import (
    ExamAttemptStatus,
    ExamTemplateStatus,
    QuestionBankStatus,
)


class QuestionBank(Base):
    __tablename__ = "question_banks"
    __table_args__ = (
        Index("ix_question_banks_jd_id", "jd_id"),
    )

    id: Mapped[str] = mapped_column(
        GUID(), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    jd_id: Mapped[str] = mapped_column(
        GUID(), ForeignKey("job_descriptions.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[QuestionBankStatus] = mapped_column(
        Enum(QuestionBankStatus, name="QuestionBankStatus", create_type=False),
        nullable=False,
        default=QuestionBankStatus.DRAFT,
        server_default=QuestionBankStatus.DRAFT.value,
    )
    generation_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    review_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Target counts per section, e.g.
    # {"REASONING": {"mcq": 40, "cq": 20}, "PRACTICAL": {...}, "TECHNICAL": {...}}
    bank_config_json: Mapped[dict] = mapped_column(JSONType(), nullable=False, default=dict)
    # Free-form generation provenance: batches run, failures, timings.
    generation_metadata_json: Mapped[dict] = mapped_column(
        JSONType(), nullable=False, default=dict
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), onupdate=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<QuestionBank id={self.id!r} jd_id={self.jd_id!r} status={self.status!r}>"


class ExamTemplate(Base):
    __tablename__ = "exam_templates"
    __table_args__ = (
        Index("ix_exam_templates_created_by", "created_by"),
    )

    id: Mapped[str] = mapped_column(
        GUID(), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    created_by: Mapped[str] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    # Same shape UpdateBankConfigRequest (app/schemas/exam.py) already
    # accepts and PATCH .../question-bank/config already applies:
    # { "mcq_target": 40, "cq_target": 20,
    #   "section_weights": {"REASONING": 0.30, "PRACTICAL": 0.35, "TECHNICAL": 0.35} }
    config_json: Mapped[dict] = mapped_column(JSONType(), nullable=False, default=dict)
    status: Mapped[ExamTemplateStatus] = mapped_column(
        Enum(ExamTemplateStatus, name="ExamTemplateStatus", create_type=False),
        nullable=False,
        default=ExamTemplateStatus.DRAFT,
        server_default=ExamTemplateStatus.DRAFT.value,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), onupdate=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<ExamTemplate id={self.id!r} name={self.name!r} created_by={self.created_by!r}>"


class ExamAttempt(Base):
    """Wraps the 3 per-section TestAttempt rows for one candidate's exam.

    Status machine: ASSIGNED → STARTED → SECTION_SUBMITTED (×3) → SUBMITTED
                                                                 ↘ FAILED
                     SUBMITTED → EVALUATING → EVALUATED
    """

    __tablename__ = "exam_attempts"
    __table_args__ = (
        Index("ix_exam_attempts_invitation_id", "invitation_id"),
        Index("ix_exam_attempts_candidate_id", "candidate_id"),
        Index("ix_exam_attempts_jd_id", "jd_id"),
        # One exam_attempt per invitation, mirroring the existing
        # ix_attempts_inv_test convention at the wrapper level.
        Index("ux_exam_attempts_invitation", "invitation_id", unique=True),
    )

    id: Mapped[str] = mapped_column(
        GUID(), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    candidate_id: Mapped[str] = mapped_column(
        GUID(), ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False
    )
    invitation_id: Mapped[str] = mapped_column(
        GUID(), ForeignKey("invitations.id", ondelete="CASCADE"), nullable=False
    )
    jd_id: Mapped[str] = mapped_column(
        GUID(), ForeignKey("job_descriptions.id", ondelete="CASCADE"), nullable=False
    )
    exam_template_id: Mapped[str | None] = mapped_column(
        GUID(), ForeignKey("exam_templates.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[ExamAttemptStatus] = mapped_column(
        Enum(ExamAttemptStatus, name="ExamAttemptStatus", create_type=False),
        nullable=False,
        default=ExamAttemptStatus.ASSIGNED,
        server_default=ExamAttemptStatus.ASSIGNED.value,
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    total_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    mcq_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    cq_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Hedged AI-likeness + behavioral composite — see ai_risk_service.py.
    # Never a verdict; always paired with the underlying ai_risk_signals rows.
    ai_risk_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    metadata_json: Mapped[dict] = mapped_column(JSONType(), nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    assigned_questions: Mapped[list["ExamAttemptQuestion"]] = relationship(
        "ExamAttemptQuestion",
        back_populates="exam_attempt",
        cascade="all, delete-orphan",
        lazy="select",
    )
    risk_signals: Mapped[list["AiRiskSignal"]] = relationship(
        "AiRiskSignal",
        back_populates="exam_attempt",
        cascade="all, delete-orphan",
        lazy="select",
    )

    def __repr__(self) -> str:
        return f"<ExamAttempt id={self.id!r} candidate_id={self.candidate_id!r} status={self.status!r}>"


class ExamAttemptQuestion(Base):
    """The locked record of exactly which questions were assigned to one
    candidate's exam attempt, drawn from a larger QuestionBank.

    Rows here are written once at assignment time and never mutated —
    this table is both the assignment lock and the audit trail.
    """

    __tablename__ = "exam_attempt_questions"
    __table_args__ = (
        Index("ix_eaq_exam_attempt_id", "exam_attempt_id"),
        # The same question can never be assigned twice within one attempt.
        Index("ux_eaq_attempt_question", "exam_attempt_id", "question_id", unique=True),
    )

    id: Mapped[str] = mapped_column(
        GUID(), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    exam_attempt_id: Mapped[str] = mapped_column(
        GUID(), ForeignKey("exam_attempts.id", ondelete="CASCADE"), nullable=False
    )
    question_id: Mapped[str] = mapped_column(
        GUID(), ForeignKey("questions.id", ondelete="CASCADE"), nullable=False
    )
    section_type: Mapped[str] = mapped_column(String(30), nullable=False)
    question_type: Mapped[str] = mapped_column(String(20), nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    exam_attempt: Mapped["ExamAttempt"] = relationship(
        "ExamAttempt", back_populates="assigned_questions"
    )

    def __repr__(self) -> str:
        return (
            f"<ExamAttemptQuestion exam_attempt={self.exam_attempt_id!r} "
            f"question={self.question_id!r} section={self.section_type!r}>"
        )


class AiRiskSignal(Base):
    """One scored signal (behavioral or textual) contributing to an
    ExamAttempt's ai_risk_score. Never a verdict on its own — see
    ai_risk_service.py for the hedged-language aggregation rules.
    """

    __tablename__ = "ai_risk_signals"
    __table_args__ = (
        Index("ix_ai_risk_signals_exam_attempt_id", "exam_attempt_id"),
    )

    id: Mapped[str] = mapped_column(
        GUID(), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    exam_attempt_id: Mapped[str] = mapped_column(
        GUID(), ForeignKey("exam_attempts.id", ondelete="CASCADE"), nullable=False
    )
    # e.g. TAB_SWITCH_COUNT | COPY_PASTE_COUNT | COMPLETION_TIME_ANOMALY |
    # TEXT_AI_LIKENESS | ANSWER_SIMILARITY_PEER | ANSWER_SIMILARITY_EXPECTED
    signal_type: Mapped[str] = mapped_column(String(50), nullable=False)
    signal_value_json: Mapped[dict] = mapped_column(JSONType(), nullable=False, default=dict)
    risk_points: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    exam_attempt: Mapped["ExamAttempt"] = relationship(
        "ExamAttempt", back_populates="risk_signals"
    )

    def __repr__(self) -> str:
        return (
            f"<AiRiskSignal exam_attempt={self.exam_attempt_id!r} "
            f"type={self.signal_type!r} points={self.risk_points}>"
        )


class CandidateReport(Base):
    __tablename__ = "candidate_reports"

    id: Mapped[str] = mapped_column(
        GUID(), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    exam_attempt_id: Mapped[str] = mapped_column(
        GUID(),
        ForeignKey("exam_attempts.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    report_json: Mapped[dict] = mapped_column(JSONType(), nullable=False, default=dict)
    report_markdown: Mapped[str | None] = mapped_column(Text, nullable=True)
    generated_by_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<CandidateReport exam_attempt_id={self.exam_attempt_id!r}>"
