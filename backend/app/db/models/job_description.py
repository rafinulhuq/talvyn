"""
SQLAlchemy ORM models for job descriptions.

Uses portable column types so the same models work with both
PostgreSQL (production) and SQLite (tests).
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models._types import GUID, JSONType
from app.db.models.enums import FileType, GenerationStatus, JdSource, ParseStatus


class JobDescription(Base):
    __tablename__ = "job_descriptions"
    __table_args__ = (
        # Admin list view orders by created_at DESC — index makes it instant
        Index("ix_jd_created_at", "created_at"),
        # Filtering JDs by uploader (multi-user scenario)
        Index("ix_jd_uploaded_by", "uploaded_by"),
        # Status polling / filtering pending/done JDs
        Index("ix_jd_parse_status", "parse_status"),
    )

    id: Mapped[str] = mapped_column(
        GUID(), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    uploaded_by: Mapped[str] = mapped_column(
        GUID(), ForeignKey("users.id"), nullable=False
    )
    # How this JD originated. Stored as VARCHAR (native_enum=False) so adding a
    # value never needs a PG enum migration — matches generation_status.
    source: Mapped[JdSource] = mapped_column(
        Enum(JdSource, name="JdSource", native_enum=False, create_type=False),
        nullable=False,
        default=JdSource.UPLOADED,
        server_default=JdSource.UPLOADED.value,
    )
    # For a GENERATED JD there is no file, so this carries the job title for the
    # list/detail views (kept NOT NULL — always a display name).
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    # NULL for GENERATED JDs (no underlying file); set for uploads.
    file_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    file_type: Mapped[FileType | None] = mapped_column(
        Enum(FileType, name="FileType", create_type=False), nullable=True
    )
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    parse_status: Mapped[ParseStatus] = mapped_column(
        Enum(ParseStatus, name="ParseStatus", create_type=False),
        nullable=False,
        default=ParseStatus.PENDING,
        server_default=ParseStatus.PENDING.value,
    )
    # AI pipeline status — tracks skill extraction + test generation progress.
    # Stored as VARCHAR(20) to avoid needing a new PostgreSQL enum type.
    generation_status: Mapped[GenerationStatus] = mapped_column(
        Enum(GenerationStatus, name="GenerationStatus", native_enum=False, create_type=False),
        nullable=False,
        default=GenerationStatus.IDLE,
        server_default=GenerationStatus.IDLE.value,
    )
    # The actual exception message when generation_status == FAILED. Without
    # this, FAILED is just an enum value and the frontend can only ever show
    # a generic "something went wrong" — no way to tell a timeout apart from
    # bad JSON apart from Ollama being down. Cleared on each new attempt.
    generation_error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    # Soft-delete timestamp (Trash / recycle-bin). NULL = live; non-NULL means
    # the JD is in the trash — hidden from the normal list/detail views but
    # restorable until it is purged (hard-deleted). Kept nullable so existing
    # rows default to live.
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Per-job overrides for the sectioned-exam redesign (Master Prompt 2):
    # section weights, target bank size, etc. NULL means "use the global
    # defaults from Settings" — see scoring_service.DEFAULT_SECTION_WEIGHTS.
    exam_config_json: Mapped[dict | None] = mapped_column(JSONType(), nullable=True)
    # The brief an operator submitted to generate this JD (title, seniority,
    # skills, tone, …). NULL for uploaded JDs. Enables "regenerate" + provenance.
    generation_input_json: Mapped[dict | None] = mapped_column(JSONType(), nullable=True)

    extracted_data: Mapped["JdExtractedData | None"] = relationship(
        "JdExtractedData",
        back_populates="job_description",
        uselist=False,
        cascade="all, delete-orphan",
        lazy="select",
    )

    def __repr__(self) -> str:
        return (
            f"<JobDescription id={self.id!r} "
            f"file={self.original_filename!r} "
            f"status={self.parse_status!r}>"
        )


class JdExtractedData(Base):
    __tablename__ = "jd_extracted_data"

    id: Mapped[str] = mapped_column(
        GUID(), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    jd_id: Mapped[str] = mapped_column(
        GUID(),
        ForeignKey("job_descriptions.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    job_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    seniority_level: Mapped[str | None] = mapped_column(String(100), nullable=True)
    must_have_skills: Mapped[list[Any]] = mapped_column(JSONType(), nullable=False, default=list)
    nice_to_have_skills: Mapped[list[Any]] = mapped_column(JSONType(), nullable=False, default=list)
    tools_technologies: Mapped[list[Any]] = mapped_column(JSONType(), nullable=False, default=list)
    responsibilities: Mapped[list[Any]] = mapped_column(JSONType(), nullable=False, default=list)
    recommended_test_topics: Mapped[list[Any]] = mapped_column(JSONType(), nullable=False, default=list)
    difficulty_distribution: Mapped[dict[str, Any]] = mapped_column(
        JSONType(), nullable=False, default=dict
    )
    extracted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    job_description: Mapped["JobDescription"] = relationship(
        "JobDescription",
        back_populates="extracted_data",
    )

    def __repr__(self) -> str:
        return f"<JdExtractedData jd_id={self.jd_id!r} title={self.job_title!r}>"
