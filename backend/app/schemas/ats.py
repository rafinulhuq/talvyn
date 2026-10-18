"""
Schemas for the standalone ATS Checker.

The ATS Checker answers a different question from the AI Checker: not "was
this written by a machine" but "will an applicant tracking system be able to
read this resume, and does it contain what a recruiter's filter looks for".

Scoring is deterministic (see app/services/ats_service.py) — no model call,
no job queue. The response is therefore returned synchronously and is stable
for identical input, which is also how real ATS parsers behave.
"""

from typing import Literal

from pydantic import BaseModel, Field, field_validator

# Category identifiers. Kept as a Literal so the frontend can key its
# per-category copy/icons off a closed set rather than free-form strings.
ATSCategoryKey = Literal[
    "parseability",
    "contact",
    "sections",
    "content",
    "formatting",
    "keywords",
]

ATSSeverity = Literal["CRITICAL", "WARNING", "INFO", "GOOD"]

ATSBand = Literal["EXCELLENT", "GOOD", "NEEDS_WORK", "POOR"]


class ATSCheckRequest(BaseModel):
    """Resume text extracted from a document or pasted by an admin."""

    text: str = Field(
        min_length=50,
        max_length=80_000,
        description="Resume/CV text to analyze. Upload parsing happens in the frontend.",
    )
    filename: str | None = Field(
        default=None,
        max_length=255,
        description="Original filename — used for the file-type formatting check.",
    )
    extraction_method: Literal["native", "ocr"] | None = Field(
        default=None,
        description=(
            "How the text was obtained. 'ocr' means the source PDF had no "
            "embedded text layer, which is the single worst thing for ATS "
            "parseability — reported as a critical finding when known."
        ),
    )
    jd_id: str | None = Field(
        default=None,
        max_length=64,
        description=(
            "Optional job description to match keywords against. Scoped to the "
            "calling actor; an unknown or unreachable id is a 404."
        ),
    )
    keywords: list[str] | None = Field(
        default=None,
        max_length=200,
        description=(
            "Explicit keyword list, used when no jd_id is given (e.g. an admin "
            "pasting a role's must-have skills by hand)."
        ),
    )

    @field_validator("text")
    @classmethod
    def text_must_have_words(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned.split()) < 30:
            raise ValueError("Provide at least 30 words for a meaningful ATS check.")
        return cleaned

    @field_validator("filename", "jd_id")
    @classmethod
    def clean_optional_str(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None

    @field_validator("keywords")
    @classmethod
    def clean_keywords(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        cleaned = [kw.strip() for kw in value if kw and kw.strip()]
        return cleaned or None


class ATSFinding(BaseModel):
    """One specific, actionable observation about the resume."""

    category: ATSCategoryKey
    severity: ATSSeverity
    message: str = Field(description="What was observed.")
    suggestion: str = Field(
        default="",
        description="How to fix it. Empty for GOOD findings, which need no action.",
    )


class ATSCategoryResult(BaseModel):
    """Per-category score. `max_score` is 0 when a category did not apply."""

    key: ATSCategoryKey
    label: str
    score: float = Field(ge=0)
    max_score: float = Field(ge=0)
    summary: str


class ATSKeywordMatch(BaseModel):
    """Keyword coverage against a JD. Empty when no JD/keywords were supplied."""

    source: Literal["JD", "MANUAL", "NONE"] = "NONE"
    jd_title: str | None = None
    matched: list[str] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)
    # Must-have coverage is reported separately because a resume can score
    # well on total coverage while missing every hard requirement.
    must_have_matched: list[str] = Field(default_factory=list)
    must_have_missing: list[str] = Field(default_factory=list)
    coverage_percent: float = Field(default=0.0, ge=0, le=100)


class ATSDetectedContact(BaseModel):
    """Which contact fields an ATS would be able to pull out of the header."""

    email: str | None = None
    phone: str | None = None
    location: str | None = None
    links: list[str] = Field(default_factory=list)


class ATSCheckResponse(BaseModel):
    """Full deterministic ATS report."""

    score: int = Field(ge=0, le=100, description="Overall score out of 100.")
    band: ATSBand
    headline: str = Field(description="One-line verdict for the score band.")
    categories: list[ATSCategoryResult]
    findings: list[ATSFinding]
    keyword_match: ATSKeywordMatch
    detected_sections: list[str]
    missing_sections: list[str]
    detected_contact: ATSDetectedContact
    word_count: int = Field(ge=0)
    estimated_pages: float = Field(ge=0)
    disclaimer: str = (
        "This is a heuristic readability and completeness check modelled on how "
        "applicant tracking systems parse resumes. It is not a hiring signal and "
        "says nothing about a candidate's suitability."
    )


class ATSExtractedTextResponse(BaseModel):
    """Server-side fallback extraction result for ATS Checker file uploads."""

    text: str
    extraction_method: Literal["native", "ocr"]
