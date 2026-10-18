"""
Pydantic schemas for candidate-centric admin endpoints.

These are distinct from app/schemas/invitation.py's CandidateResponse /
InvitationResponse — those describe one invitation at a time, scoped to a
single JD. This module describes a candidate's full history across every
JD/invitation/test they've ever touched, for the global Candidates directory
and the per-candidate profile page.
"""

from datetime import datetime

from pydantic import BaseModel, Field

from app.db.models.enums import AIRecommendation, InvitationStatus

# ─── List ───────────────────────────────────────────────────────

class CandidateListItem(BaseModel):
    id: str
    candidate_number: int
    name: str
    email: str
    phone: str | None
    created_at: datetime
    total_attempts: int
    completed_attempts: int
    # Most recent activity across any of this candidate's attempts —
    # submitted_at if they've submitted anything, else started_at, else
    # the candidate's own created_at. Null only if somehow neither exists.
    last_activity_at: datetime | None


class CandidateListResponse(BaseModel):
    items: list[CandidateListItem]
    total: int
    page: int
    page_size: int
    total_pages: int


# ─── Profile ──────────────────────────────────────────────────────

class CandidateProfileResponse(BaseModel):
    id: str
    candidate_number: int
    name: str
    email: str
    phone: str | None
    linkedin_url: str | None
    resume_url: str | None
    created_at: datetime
    total_invitations: int
    total_attempts: int
    completed_attempts: int


# ─── Attempt history ──────────────────────────────────────────────

class CandidateAttemptItem(BaseModel):
    """One test attempt, with enough JD/test/score context to render a
    candidate's full history without the admin needing to open each
    invitation separately."""

    attempt_id: str
    invitation_id: str
    invitation_status: InvitationStatus
    jd_id: str
    jd_title: str
    test_id: str
    test_title: str
    attempt_status: str
    started_at: datetime | None
    submitted_at: datetime | None
    has_evaluation: bool
    total_score: int | None = None
    max_score: int | None = None
    percentage: float | None = None
    ai_recommendation: AIRecommendation | None = None
    admin_override_recommendation: AIRecommendation | None = None
    # Populated only when attempt_status == "TERMINATED"
    integrity_violation_reason: str | None = None
    terminated_at: datetime | None = None


class CandidateAttemptsResponse(BaseModel):
    items: list[CandidateAttemptItem] = Field(default_factory=list)
