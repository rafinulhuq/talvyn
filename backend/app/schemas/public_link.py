"""
Pydantic schemas for Public Assessment Link endpoints.
"""

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.db.models.enums import PublicLinkStatus

# ─── Admin requests ────────────────────────────────────────────

class CreatePublicLinkRequest(BaseModel):
    """Body for POST /public-links/jd/{jd_id}. All fields optional."""

    title: str | None = Field(default=None, max_length=255)
    expires_at: datetime | None = None
    max_registrations: int | None = Field(default=None, ge=1)


class UpdatePublicLinkRequest(BaseModel):
    """Body for PATCH /public-links/{id}. Only provided fields are changed."""

    status: PublicLinkStatus | None = None
    expires_at: datetime | None = None
    max_registrations: int | None = Field(default=None, ge=1)


# ─── Admin responses ───────────────────────────────────────────

class PublicLinkResponse(BaseModel):
    id: str
    jd_id: str
    public_slug: str
    title: str | None
    status: PublicLinkStatus
    expires_at: datetime | None
    max_registrations: int | None
    view_count: int
    registration_count: int
    created_at: datetime
    # Full shareable URL, e.g. https://your-domain.com/apply/<slug>
    public_url: str


class PublicLinkListResponse(BaseModel):
    items: list[PublicLinkResponse]


# ─── Admin: analytics ───────────────────────────────────────────

class PublicLinkAnalyticsResponse(BaseModel):
    """
    Funnel for one public link: views -> registrations -> starts ->
    completions, plus a recommendation breakdown / pass rate over whatever
    has been evaluated so far.

    Counts at each funnel stage are independent denominators (a candidate who
    registered but never started is in `registrations` but not `starts`) —
    they are not meant to be read as a strict subset chain across multiple
    points in time, since a registration cap or link edit can change who's
    eligible to reach later stages.
    """

    link_id: str
    views: int
    registrations: int
    # Distinct candidates (invitations) under this link with at least one
    # started TestAttempt.
    starts: int
    # Distinct invitations under this link with every approved test submitted.
    completions: int
    # Total evaluated TestAttempts under this link (not deduplicated by
    # candidate — a multi-test invitation contributes one count per test).
    evaluated_attempts: int
    # Keyed by AIRecommendation value; admin override takes precedence over
    # the AI's own recommendation, same as the results pages already show.
    recommendation_breakdown: dict[str, int] = Field(default_factory=dict)
    # (STRONG_HIRE + HIRE) / evaluated_attempts, or null if nothing has been
    # evaluated yet — never reported as 0% when the real answer is "no data".
    pass_rate: float | None = None


# ─── Public (unauthenticated) ──────────────────────────────────

class PublicTestSummary(BaseModel):
    """Safe-to-expose test metadata — no questions, no answers."""

    title: str
    duration_minutes: int


class PublicLinkResolveResponse(BaseModel):
    """
    Returned by GET /public-links/resolve/{slug}.
    Only reveals what the candidate registration page needs to render.
    """

    valid: bool
    jd_title: str | None = None
    link_title: str | None = None
    tests: list[PublicTestSummary] = Field(default_factory=list)
    # Revealed only when valid=False
    reason: str | None = None  # "not_found" | "disabled" | "expired" | "no_tests" | "max_reached"


class PublicRegisterRequest(BaseModel):
    """Body for POST /public-links/{slug}/register."""

    full_name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=50)
    linkedin_url: str | None = Field(default=None, max_length=500)
    resume_url: str | None = Field(default=None, max_length=500)
    # Client-computed hash of stable browser/device signals (canvas, WebGL
    # renderer, screen, timezone, etc.) — a soft anti-cheat signal only, see
    # public_link_service._check_duplicate_device. Optional: older clients
    # or privacy-restricted browsers may not send one.
    device_fingerprint: str | None = Field(default=None, max_length=64)

    @field_validator("full_name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        return v.strip()


class PublicRegisterResponse(BaseModel):
    """
    Returned by POST /public-links/{slug}/register.

    status="redirect"           → token/redirect_url are populated; the
                                   frontend should navigate to /tests/<token>
    status="already_completed"  → candidate already finished every approved
                                   test for this JD; no token is issued
    status="terminated"         → candidate was previously terminated for an
                                   integrity violation on this JD; no token issued
    """

    status: str
    token: str | None = None
    redirect_url: str | None = None
    message: str
