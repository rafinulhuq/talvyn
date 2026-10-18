"""
Pydantic schemas for Candidate and Invitation endpoints.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.db.models.enums import InvitationStatus

# ─── Requests ────────────────────────────────────────────────

class CreateInvitationRequest(BaseModel):
    """Body for POST /invitations/ — send a test invite to a candidate."""

    candidate_name: str = Field(min_length=1, max_length=255)
    candidate_email: EmailStr
    jd_id: str = Field(min_length=1)
    # Optional: invite to a specific approved test.
    # If omitted, all approved tests for the JD are included in the email.
    test_id: str | None = None

    @field_validator("candidate_name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        return v.strip()


class ResendInvitationRequest(BaseModel):
    """Body for POST /invitations/{id}/resend."""
    # Extend expiry by another 72 hours on resend (default)
    extend_expiry: bool = True


# ─── Responses ───────────────────────────────────────────────

class CandidateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    candidate_number: int
    email: str
    name: str
    phone: str | None
    created_at: datetime


class InvitationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    candidate_id: str
    jd_id: str
    invited_by: str
    status: InvitationStatus
    expires_at: datetime
    email_sent_at: datetime | None
    created_at: datetime
    # Populated via join, not ORM relation
    candidate_number: int | None = None
    candidate_name: str | None = None
    candidate_email: str | None = None
    jd_title: str | None = None
    # Populated for COMPLETED invitations only
    attempt_id: str | None = None
    # Soft anti-cheat signal — see public_link_service._check_duplicate_device.
    # True means this registration's device cookie/fingerprint matched a
    # TERMINATED candidate on the same JD; never auto-enforced, admin review only.
    flagged_duplicate_device: bool = False
    flagged_duplicate_reason: str | None = None


class CreateInvitationResponse(BaseModel):
    """Returned after successfully sending an invitation."""
    invitation_id: str
    candidate_id: str
    candidate_email: str
    status: InvitationStatus
    expires_at: datetime
    email_sent: bool
    message: str = "Invitation sent successfully."
    # Populated only when email_sent=False so the admin can copy the link manually.
    magic_link: str | None = None


class ResendResponse(BaseModel):
    invitation_id: str
    new_expires_at: datetime
    email_sent: bool
    message: str
    # Populated only when email_sent=False so the admin can copy the link manually.
    magic_link: str | None = None


# ─── Token validation (public — no auth) ─────────────────────

class TokenValidationResponse(BaseModel):
    """
    Returned by GET /invitations/validate/{token}.
    Only reveals the minimum needed for the candidate UI.
    Internal IDs are intentionally excluded.
    """
    valid: bool
    # Revealed only when valid=True
    candidate_name: str | None = None
    jd_title: str | None = None
    test_titles: list[str] = Field(default_factory=list)
    invitation_status: InvitationStatus | None = None
    expires_at: datetime | None = None
    # 0-based index of the next approved test the candidate should attempt
    # (matches the `test_index` start_attempt expects), or null if every
    # approved test has already been submitted for this invitation.
    next_test_index: int | None = None
    total_tests: int = 0
    # Revealed only when valid=False
    reason: str | None = None     # "expired" | "already_used" | "not_found" | "revoked" | "terminated"


class RevokeInvitationRequest(BaseModel):
    reason: str | None = None


# ─── Bulk invite ──────────────────────────────────────────────

class BulkInviteRow(BaseModel):
    candidate_email: EmailStr
    candidate_name: str = Field(default="", max_length=255)


class BulkInviteRequest(BaseModel):
    jd_id: str = Field(min_length=1)
    test_id: str | None = None
    candidates: list[BulkInviteRow] = Field(min_length=1, max_length=50)


class BulkInviteRowResult(BaseModel):
    email: str
    name: str
    status: str  # "sent" | "skipped" | "failed"
    error: str | None = None
    invitation_id: str | None = None
    email_sent: bool = False


class BulkInviteResponse(BaseModel):
    total: int
    sent: int
    skipped: int
    failed: int
    results: list[BulkInviteRowResult]
