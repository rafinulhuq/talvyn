"""
SQLAlchemy ORM models for Candidate and Invitation tables.

Candidate → can receive many Invitations (one per JD)
Invitation → belongs to one Candidate + one JobDescription
           → has a hashed token (raw token sent by email, never stored)
           → tracks status lifecycle: PENDING → OPENED → COMPLETED
                                                       → EXPIRED / REVOKED
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
    column,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models._types import GUID
from app.db.models.enums import InvitationStatus


class Candidate(Base):
    __tablename__ = "candidates"

    id: Mapped[str] = mapped_column(
        GUID(), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    # Human-readable sequential identifier (e.g. "Candidate #42") — the UUID
    # `id` is what every FK uses, but it's not something an admin can read
    # aloud or scan in a table. Assigned atomically via CandidateNumberCounter
    # in invitation_service._upsert_candidate(), never by reading MAX(...)+1
    # (which races under concurrent candidate creation — see that function).
    candidate_number: Mapped[int] = mapped_column(
        Integer, unique=True, nullable=False
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    linkedin_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    resume_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
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
    # hidden from the candidate directory until restored or purged. Historical
    # attempts/evaluations are retained either way.
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    invitations: Mapped[list["Invitation"]] = relationship(
        "Invitation",
        back_populates="candidate",
        cascade="all, delete-orphan",
        lazy="select",
    )

    def __repr__(self) -> str:
        return f"<Candidate id={self.id!r} email={self.email!r}>"


class CandidateNumberCounter(Base):
    """
    Single-row counter backing Candidate.candidate_number.

    A real Postgres SEQUENCE would be the more typical choice, but
    SQLAlchemy's Sequence construct doesn't transparently work on SQLite
    (used in tests, via Base.metadata.create_all() rather than Alembic) —
    it would silently fail to produce a value there. This table uses the
    same atomic "UPDATE ... SET x = x + 1 RETURNING x" pattern already used
    for PublicAssessmentLink.registration_count/view_count, which behaves
    identically on SQLite and PostgreSQL and is immune to the
    SELECT MAX(candidate_number) + 1 race (two concurrent reads of the same
    max before either INSERT commits would otherwise hand out the same
    number to two different candidates).
    """

    __tablename__ = "candidate_number_counters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    next_value: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    def __repr__(self) -> str:
        return f"<CandidateNumberCounter next_value={self.next_value!r}>"


class Invitation(Base):
    __tablename__ = "invitations"
    __table_args__ = (
        # token_hash already has unique=True → PostgreSQL auto-creates a unique index
        # These two cover FK lookups and "all invitations for a JD/candidate" queries
        Index("ix_invitations_candidate_id", "candidate_id"),
        Index("ix_invitations_jd_id", "jd_id"),
        Index("ix_invitations_public_link_id", "public_link_id"),
        # create_invitation() checks for an existing PENDING/OPENED invitation
        # for this candidate+JD in app code before inserting — a partial unique
        # index makes that the DB's guarantee too, not just an app-level race
        # that two concurrent "invite" clicks could slip through. Terminal
        # statuses (COMPLETED/EXPIRED/REVOKED) are excluded so a candidate can
        # be legitimately re-invited once their previous invitation is done.
        Index(
            "ux_invitations_active_candidate_jd",
            "candidate_id",
            "jd_id",
            unique=True,
            postgresql_where=column("status").in_(["PENDING", "OPENED"]),
        ),
    )

    id: Mapped[str] = mapped_column(
        GUID(), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    candidate_id: Mapped[str] = mapped_column(
        GUID(), ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False
    )
    jd_id: Mapped[str] = mapped_column(
        GUID(), ForeignKey("job_descriptions.id", ondelete="CASCADE"), nullable=False
    )
    invited_by: Mapped[str] = mapped_column(
        GUID(), ForeignKey("users.id"), nullable=False
    )
    # Set when this invitation was created by a candidate self-registering
    # through a public assessment link, rather than a manual admin invite.
    # Null for manually-created invitations.
    public_link_id: Mapped[str | None] = mapped_column(
        GUID(),
        ForeignKey("public_assessment_links.id", ondelete="SET NULL"),
        nullable=True,
    )
    # HMAC-SHA256 hash of the raw token — raw token is only in the email
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    status: Mapped[InvitationStatus] = mapped_column(
        Enum(InvitationStatus, name="InvitationStatus", create_type=False),
        nullable=False,
        default=InvitationStatus.PENDING,
        server_default=InvitationStatus.PENDING.value,
    )
    email_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # Denormalized from the terminating TestAttempt — set when status becomes
    # TERMINATED, so admin list views don't need to join to find out why.
    integrity_violation_reason: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )
    terminated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ── Public self-registration: device/IP tracking (soft anti-cheat signal) ──
    # Captured at registration time, only via the public-link flow (admin-
    # created invitations leave these NULL — that's a trusted path already).
    # registration_ip is logged for admin context only and never used to
    # auto-block — shared/NAT IPs are common and would false-positive badly.
    # device_fingerprint/device_cookie_id ARE compared against terminated
    # invitations for the same JD (see public_link_service._check_duplicate_device)
    # and flip flagged_duplicate_device for a human to review — never an
    # automatic block, since both signals are beatable by a determined user
    # with a different device/browser.
    device_fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True)
    device_cookie_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    registration_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    flagged_duplicate_device: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    flagged_duplicate_reason: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )

    # Relationships
    candidate: Mapped["Candidate"] = relationship(
        "Candidate", back_populates="invitations", lazy="select"
    )

    def __repr__(self) -> str:
        return (
            f"<Invitation id={self.id!r} "
            f"candidate_id={self.candidate_id!r} "
            f"status={self.status!r}>"
        )
