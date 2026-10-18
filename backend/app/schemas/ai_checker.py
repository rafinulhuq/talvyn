"""Schemas for the standalone admin AI Checker."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator


class AICheckRequest(BaseModel):
    """Text extracted from a document or pasted by an admin."""

    text: str = Field(
        min_length=100,
        max_length=80_000,
        description="Document text to analyze. Upload parsing happens in the frontend.",
    )
    title: str | None = Field(
        default=None,
        max_length=200,
        description="Optional filename or document title for context.",
    )

    @field_validator("text")
    @classmethod
    def text_must_have_words(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned.split()) < 20:
            raise ValueError("Provide at least 20 words for a meaningful estimate.")
        return cleaned

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class ExtractedTextResponse(BaseModel):
    """Server-side fallback extraction result for AI Checker file uploads."""

    text: str


class AICheckResponse(BaseModel):
    """
    Standalone AI-likeness result.

    This is a probabilistic writing-style signal, never proof that a document
    was written by AI.
    """

    estimated_ai_percentage: float = Field(ge=0, le=100)
    confidence: Literal["LOW", "MEDIUM", "HIGH"]
    suspicious_phrases: list[str]
    explanation: str
    recommendation: Literal["NO_CONCERN", "REVIEW_SUGGESTED", "HIGH_CONCERN"]
    chunks_analyzed: int = Field(ge=1)
    word_count: int = Field(ge=0)
    character_count: int = Field(ge=0)
    disclaimer: str = (
        "This is a probabilistic writing-style estimate, not proof of AI use. "
        "Review the document manually before making any decision."
    )


class AICheckJobAcceptedResponse(BaseModel):
    """Response returned immediately after queueing an AI Checker job."""

    job_id: str
    status: Literal["QUEUED"] = "QUEUED"
    detail: str = "AI checker job queued."


class AICheckJobStatusResponse(BaseModel):
    """Pollable status for a background AI Checker job."""

    job_id: str
    status: Literal["QUEUED", "RUNNING", "SUCCEEDED", "FAILED"]
    detail: str
    result: AICheckResponse | None = None
    error: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
