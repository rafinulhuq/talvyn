"""
SQLAlchemy ORM models for test attempt lifecycle.

TestAttempt  — one per (invitation × test); tracks timer and status
CandidateAnswer — one per (attempt × question); updated on each autosave
SuspiciousEvent — append-only log of integrity events during a test

Status machine:
  NOT_STARTED → IN_PROGRESS → SUBMITTED → EVALUATED
                            ↘ SUBMITTED (auto on timeout)
                            ↘ TERMINATED (candidate-side integrity violation — terminal,
                              cannot resume; see attempt_service.terminate_attempt)
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
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
from app.db.models.enums import AttemptStatus


class TestAttempt(Base):
    __tablename__ = "test_attempts"
    __table_args__ = (
        # start_attempt checks WHERE invitation_id=? AND test_id=? for existing attempt
        Index("ix_attempts_invitation_id", "invitation_id"),
        Index("ix_attempts_test_id", "test_id"),
        Index("ix_attempts_candidate_id", "candidate_id"),
        # Composite covers the exact 2-column WHERE in start_attempt resume check.
        # UNIQUE so the DB — not just the SELECT-then-INSERT in start_attempt —
        # guarantees at most one attempt per (invitation, test), even under
        # concurrent requests (double-click, two tabs).
        Index("ix_attempts_inv_test", "invitation_id", "test_id", unique=True),
        # ExamAttemptService loads all 3 section attempts for one exam_attempt
        Index("ix_attempts_exam_attempt_id", "exam_attempt_id"),
    )

    id: Mapped[str] = mapped_column(
        GUID(), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    invitation_id: Mapped[str] = mapped_column(
        GUID(),
        ForeignKey("invitations.id", ondelete="CASCADE"),
        nullable=False,
    )
    candidate_id: Mapped[str] = mapped_column(
        GUID(),
        ForeignKey("candidates.id", ondelete="CASCADE"),
        nullable=False,
    )
    test_id: Mapped[str] = mapped_column(
        GUID(),
        ForeignKey("tests.id", ondelete="CASCADE"),
        nullable=False,
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    submitted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Remaining seconds stored server-side; updated on autosave heartbeat
    # Initialised from test.duration_minutes * 60 when the attempt starts
    time_remaining_seconds: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )
    status: Mapped[AttemptStatus] = mapped_column(
        Enum(AttemptStatus, name="AttemptStatus", create_type=False),
        nullable=False,
        default=AttemptStatus.NOT_STARTED,
        server_default=AttemptStatus.NOT_STARTED.value,
    )
    # IP address of the candidate at start time
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    # Whether this submission was triggered by timer expiry
    auto_submitted: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    # Set when status becomes TERMINATED — reuses the SuspiciousEvent event_type
    # vocabulary (e.g. "VISIBILITY_HIDDEN", "WINDOW_BLUR") for the violation that
    # ended this attempt.
    integrity_violation_reason: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )
    terminated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Back-reference to the ExamAttempt wrapper (Master Prompt 2) that
    # groups this section attempt with its siblings for one candidate's
    # whole sectioned exam. NULL for every attempt created before the
    # redesign, and for any attempt created with QUESTION_BANK_MODE=false —
    # those keep behaving exactly as a standalone per-test attempt always has.
    exam_attempt_id: Mapped[str | None] = mapped_column(
        GUID(), ForeignKey("exam_attempts.id", ondelete="SET NULL"), nullable=True
    )

    # Relationships
    answers: Mapped[list["CandidateAnswer"]] = relationship(
        "CandidateAnswer",
        back_populates="attempt",
        cascade="all, delete-orphan",
        lazy="select",
    )
    events: Mapped[list["SuspiciousEvent"]] = relationship(
        "SuspiciousEvent",
        back_populates="attempt",
        cascade="all, delete-orphan",
        lazy="select",
    )

    def __repr__(self) -> str:
        return (
            f"<TestAttempt id={self.id!r} "
            f"test={self.test_id!r} "
            f"status={self.status!r}>"
        )


class CandidateAnswer(Base):
    __tablename__ = "candidate_answers"
    __table_args__ = (
        # Every autosave, resume, and submit filters by attempt_id
        Index("ix_answers_attempt_id", "attempt_id"),
        # Unique composite: one answer per (attempt, question) — also enables
        # the PostgreSQL ON CONFLICT upsert in P2-3 without a separate constraint
        Index("ix_answers_attempt_question", "attempt_id", "question_id", unique=True),
    )

    id: Mapped[str] = mapped_column(
        GUID(), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    attempt_id: Mapped[str] = mapped_column(
        GUID(),
        ForeignKey("test_attempts.id", ondelete="CASCADE"),
        nullable=False,
    )
    question_id: Mapped[str] = mapped_column(
        GUID(),
        ForeignKey("questions.id", ondelete="CASCADE"),
        nullable=False,
    )
    # MCQ: one of "A" | "B" | "C" | "D"
    selected_option: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # Open-ended: free text
    answer_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Set after evaluation in Phase 7
    is_auto_scored: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    auto_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    saved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    attempt: Mapped["TestAttempt"] = relationship(
        "TestAttempt", back_populates="answers"
    )

    def __repr__(self) -> str:
        return (
            f"<CandidateAnswer attempt={self.attempt_id!r} "
            f"question={self.question_id!r}>"
        )


class SuspiciousEvent(Base):
    __tablename__ = "suspicious_events"
    __table_args__ = (
        # Admin views events grouped by attempt; also filtered on every log_event call
        Index("ix_events_attempt_id", "attempt_id"),
    )

    id: Mapped[str] = mapped_column(
        GUID(), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    attempt_id: Mapped[str] = mapped_column(
        GUID(),
        ForeignKey("test_attempts.id", ondelete="CASCADE"),
        nullable=False,
    )
    # TAB_SWITCH | COPY_ATTEMPT | PASTE_ATTEMPT | CUT_ATTEMPT | WINDOW_BLUR |
    # VISIBILITY_HIDDEN | CONTEXT_MENU | DEVTOOLS_OPEN | FULLSCREEN_EXIT |
    # BLOCKED_SHORTCUT
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # Optional structured context: { "count": 3, "duration_ms": 4200 }
    event_metadata: Mapped[dict | None] = mapped_column(JSONType(), nullable=True)

    attempt: Mapped["TestAttempt"] = relationship(
        "TestAttempt", back_populates="events"
    )

    def __repr__(self) -> str:
        return (
            f"<SuspiciousEvent attempt={self.attempt_id!r} "
            f"type={self.event_type!r}>"
        )
