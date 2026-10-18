"""
SQLAlchemy ORM model for cross-provider AI call tracking (Master Prompt 3).

One row per AiProviderService.generate() call, regardless of provider
(local Ollama or cloud GLM) or outcome (success or failure) — this is the
basis for future cost estimation and for verifying the cost-control
principle ("don't call GLM per-answer") is actually being honored.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models._types import GUID


class AiUsageLog(Base):
    __tablename__ = "ai_usage_logs"
    __table_args__ = (
        Index("ix_ai_usage_logs_created_at", "created_at"),
        Index("ix_ai_usage_logs_task_type", "task_type"),
        Index("ix_ai_usage_logs_jd_id", "jd_id"),
        Index("ix_ai_usage_logs_exam_attempt_id", "exam_attempt_id"),
    )

    id: Mapped[str] = mapped_column(
        GUID(), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    # e.g. "jd_skills_extraction" | "question_bank_generation" | "rubric_generation"
    # | "question_review" | "cq_evaluation" | "final_report" | "ai_risk_explanation"
    task_type: Mapped[str] = mapped_column(String(50), nullable=False)
    provider: Mapped[str] = mapped_column(String(20), nullable=False)  # "local" | "glm"
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    jd_id: Mapped[str | None] = mapped_column(
        GUID(), ForeignKey("job_descriptions.id", ondelete="SET NULL"), nullable=True
    )
    candidate_id: Mapped[str | None] = mapped_column(
        GUID(), ForeignKey("candidates.id", ondelete="SET NULL"), nullable=True
    )
    exam_attempt_id: Mapped[str | None] = mapped_column(
        GUID(), ForeignKey("exam_attempts.id", ondelete="SET NULL"), nullable=True
    )
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    error_message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return (
            f"<AiUsageLog task={self.task_type!r} provider={self.provider!r} "
            f"success={self.success}>"
        )
