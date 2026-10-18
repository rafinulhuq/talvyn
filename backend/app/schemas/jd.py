"""
Pydantic schemas for Job Description endpoints.
These define the API contract between FastAPI and the Next.js frontend.
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.db.models.enums import FileType, GenerationStatus, JdSource, ParseStatus

# ─── Response schemas ─────────────────────────────────────────

class JdExtractedDataResponse(BaseModel):
    """Extracted skills and metadata from a JD."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    jd_id: str
    job_title: str | None = None
    seniority_level: str | None = None
    must_have_skills: list[str] = Field(default_factory=list)
    nice_to_have_skills: list[str] = Field(default_factory=list)
    tools_technologies: list[str] = Field(default_factory=list)
    responsibilities: list[str] = Field(default_factory=list)
    recommended_test_topics: list[str] = Field(default_factory=list)
    difficulty_distribution: dict[str, Any] = Field(default_factory=dict)
    extracted_at: datetime


class JobDescriptionResponse(BaseModel):
    """Full JD object returned to the frontend."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    uploaded_by: str
    source: JdSource = JdSource.UPLOADED
    original_filename: str
    file_type: FileType | None = None
    parse_status: ParseStatus
    generation_status: GenerationStatus = GenerationStatus.IDLE
    raw_text: str | None = None
    created_at: datetime
    updated_at: datetime
    extracted_data: JdExtractedDataResponse | None = None


class JobDescriptionListItem(BaseModel):
    """Lightweight JD summary for list views — no raw_text."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    uploaded_by: str
    source: JdSource = JdSource.UPLOADED
    original_filename: str
    file_type: FileType | None = None
    parse_status: ParseStatus
    generation_status: GenerationStatus = GenerationStatus.IDLE
    created_at: datetime
    updated_at: datetime
    # Include partial extracted data for list display
    job_title: str | None = None
    seniority_level: str | None = None


class JobDescriptionListResponse(BaseModel):
    """Paginated list of JDs."""
    items: list[JobDescriptionListItem]
    total: int
    page: int
    page_size: int
    total_pages: int


# ─── Upload response ──────────────────────────────────────────

class JdUploadResponse(BaseModel):
    """Returned immediately after file upload — before parsing completes."""
    id: str
    original_filename: str
    file_type: FileType
    parse_status: ParseStatus
    message: str = "File uploaded. Parsing has started in the background."


# ─── Parse / generation status (polling) ─────────────────────

class JdParseStatusResponse(BaseModel):
    """
    Full pipeline status — used for polling by the frontend.

    Poll this after upload, after /analyze, and after /generate.
    Frontend flow:
      1. Upload → poll until parse_status == DONE
      2. POST /analyze → poll until generation_status not in [EXTRACTING]
      3. POST /generate → poll until generation_status == READY (or FAILED)
    """
    id: str
    parse_status: ParseStatus
    generation_status: GenerationStatus
    has_extracted_data: bool
    has_tests: bool
    error_message: str | None = None


# ─── Async-accepted response (202) ───────────────────────────

class AsyncJobAcceptedResponse(BaseModel):
    """
    Returned immediately (HTTP 202) when a background AI job is queued.
    The caller should poll GET /api/v1/jd/{jd_id}/status for progress.
    """
    jd_id: str
    generation_status: GenerationStatus
    message: str


# ─── Skill extraction ─────────────────────────────────────────

class DifficultyDistributionResponse(BaseModel):
    easy_percent: int
    medium_percent: int
    hard_percent: int


class AnalyzeJdResponse(BaseModel):
    """
    Returned after a successful /analyze call.
    Contains the full extracted data immediately (analysis is synchronous).
    """
    jd_id: str
    job_title: str | None
    seniority_level: str | None
    must_have_skills: list[str]
    nice_to_have_skills: list[str]
    tools_technologies: list[str]
    responsibilities: list[str]
    recommended_test_topics: list[str]
    difficulty_distribution: DifficultyDistributionResponse
    is_reanalysis: bool = False
    message: str = "Skill extraction complete."


class AnalyzeJdErrorResponse(BaseModel):
    """Returned when skill extraction fails after all retries."""
    jd_id: str
    error_code: str
    message: str


# ─── JD generation (from a brief) ─────────────────────────────

class GenerateJdRequest(BaseModel):
    """The brief an operator submits to generate a JD in-app. Stored on the JD
    as generation_input_json and fed (fenced) to the generation prompt."""

    title: str = Field(min_length=2, max_length=200)
    seniority: str = Field(min_length=1, max_length=100)
    department: str = Field(default="", max_length=200)
    experience: str = Field(default="", max_length=100)
    must_have_skills: list[str] = Field(min_length=1, max_length=25)
    nice_to_have_skills: list[str] = Field(default_factory=list, max_length=25)
    tools: list[str] = Field(default_factory=list, max_length=25)
    context: str = Field(default="", max_length=2000)
    tone: str = Field(default="Professional", max_length=40)
    length: str = Field(default="Standard", max_length=40)

    @field_validator("must_have_skills", "nice_to_have_skills", "tools", mode="before")
    @classmethod
    def _clean_list(cls, v: object) -> list[str]:
        if not isinstance(v, list):
            return []
        # Trim, drop blanks, cap each entry's length so a pasted blob can't
        # bloat the prompt or the stored brief.
        return [str(x).strip()[:120] for x in v if str(x).strip()]


class GenerateJdResponse(BaseModel):
    """202 response — the JD row is created and generation is queued."""
    jd_id: str
    generation_status: GenerationStatus
    message: str = "JD generation queued. Poll /status for progress."


class UpdateJdTextRequest(BaseModel):
    """The review-edit step: replace a JD's text before analysis."""
    raw_text: str = Field(min_length=1, max_length=100_000)
