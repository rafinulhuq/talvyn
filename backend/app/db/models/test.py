"""
SQLAlchemy ORM models for Test and Question tables.

Test → has many Questions (cascade delete)
JobDescription → has many Tests (cascade delete)

Uses portable GUID + JSONType for SQLite compat in tests.
"""

import uuid
from datetime import datetime
from typing import Any

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
from app.db.models._types import GUID, JSONType
from app.db.models.enums import Difficulty, QuestionType, TestStatus, TestType


class Test(Base):
    __tablename__ = "tests"
    __table_args__ = (
        # Most-queried path: "give me all tests for JD X"
        Index("ix_tests_jd_id", "jd_id"),
        # Composite: candidate start_attempt filters WHERE jd_id=? AND status='APPROVED'
        Index("ix_tests_jd_id_status", "jd_id", "status"),
    )

    id: Mapped[str] = mapped_column(
        GUID(), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    jd_id: Mapped[str] = mapped_column(
        GUID(), ForeignKey("job_descriptions.id", ondelete="CASCADE"), nullable=False
    )
    test_type: Mapped[TestType] = mapped_column(
        Enum(TestType, name="TestType", create_type=False), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    total_marks: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    difficulty: Mapped[Difficulty] = mapped_column(
        Enum(Difficulty, name="Difficulty", create_type=False), nullable=False
    )
    status: Mapped[TestStatus] = mapped_column(
        Enum(TestStatus, name="TestStatus", create_type=False),
        nullable=False,
        default=TestStatus.DRAFT,
        server_default=TestStatus.DRAFT.value,
    )
    passing_marks: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Set when this test's questions were generated as part of a reusable
    # QuestionBank (Master Prompt 2) rather than the legacy one-shot-per-JD
    # flow. NULL for every test generated before this redesign — those keep
    # working exactly as before, scoped only by jd_id/status as today.
    question_bank_id: Mapped[str | None] = mapped_column(
        GUID(), ForeignKey("question_banks.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    # Soft-delete timestamp (Trash). NULL = live; non-NULL = trashed and
    # hidden from normal test lists until restored or purged.
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    questions: Mapped[list["Question"]] = relationship(
        "Question",
        back_populates="test",
        cascade="all, delete-orphan",
        order_by="Question.order_index",
        lazy="select",
    )

    def __repr__(self) -> str:
        return (
            f"<Test id={self.id!r} type={self.test_type!r} "
            f"status={self.status!r} title={self.title!r}>"
        )


class Question(Base):
    __tablename__ = "questions"
    __table_args__ = (
        # Loaded on every attempt start and evaluation — always filtered by test_id
        Index("ix_questions_test_id", "test_id"),
    )

    id: Mapped[str] = mapped_column(
        GUID(), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    test_id: Mapped[str] = mapped_column(
        GUID(), ForeignKey("tests.id", ondelete="CASCADE"), nullable=False
    )
    question_type: Mapped[QuestionType] = mapped_column(
        Enum(QuestionType, name="QuestionType", create_type=False), nullable=False
    )
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    skill_tested: Mapped[str | None] = mapped_column(String(255), nullable=True)
    difficulty: Mapped[Difficulty] = mapped_column(
        Enum(Difficulty, name="Difficulty", create_type=False), nullable=False
    )
    marks: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # MCQ fields
    # options: list of {label: "A"|"B"|"C"|"D", text: str, is_correct: bool}
    options: Mapped[list[Any] | None] = mapped_column(JSONType(), nullable=True)
    correct_answer: Mapped[str | None] = mapped_column(String(10), nullable=True)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Open-ended fields
    expected_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    scoring_rubric: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Coding question fields
    code_language: Mapped[str | None] = mapped_column(String(50), nullable=True)
    code_starter: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Question-bank fields (Master Prompt 2) ─────────────────
    # Reviewer/quality-model score, 0-100. NULL until a review pass runs.
    quality_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    estimated_time_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    topic_tags_json: Mapped[list] = mapped_column(JSONType(), nullable=False, default=list)
    # Plural skill tags (Master Prompt 3, GLM-generated bank questions) —
    # additive to skill_tested (singular), which every existing reader
    # (e.g. evaluation_service's skill-breakdown grouping) keeps using.
    skill_tags_json: Mapped[list] = mapped_column(JSONType(), nullable=False, default=list)
    # Soft-disable a question without deleting it (e.g. found to be flawed
    # after candidates have already answered it in past attempts).
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    # How many exam_attempt_questions rows reference this question — used by
    # ExamAssignmentService's balanced randomization to prefer under-used
    # questions. Incremented transactionally at assignment time; never
    # decremented, so it reflects lifetime usage, not "currently assigned".
    usage_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    test: Mapped["Test"] = relationship("Test", back_populates="questions")

    def __repr__(self) -> str:
        return (
            f"<Question id={self.id!r} type={self.question_type!r} "
            f"order={self.order_index}>"
        )
