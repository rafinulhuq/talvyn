"""
Public Assessment Link Service.

A public link lets an admin share one URL for a JD's approved tests with
any number of candidates. It identifies the assessment only — never a
candidate. Each registration mints a private Invitation (own hashed magic
link token), reusing the same candidate-upsert / token / expiry helpers
the manual invite flow uses.

Lifecycle:
  create_or_get_active_link → idempotent: returns the existing ACTIVE link
                               for a JD, or creates one (requires >=1
                               APPROVED test)
  resolve_public_link       → public, safe summary for the registration page
  register_via_public_link  → public: upsert candidate, mint or reuse a
                               private invitation, never reuse the public
                               slug as the candidate's token
  list_links_for_jd / update_link → admin management

Concurrency:
  - registration_count is incremented with an atomic conditional UPDATE
    (only when max_registrations allows it), not a read-then-write check.
  - Duplicate-email races during registration are caught by the same
    partial unique index (candidate_id, jd_id) WHERE status IN
    ('PENDING','OPENED') that protects the manual invite flow.
"""

import secrets

from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, NotFoundError
from app.core.logging import get_logger
from app.core.security import (
    build_magic_link,
    build_public_link,
    generate_token,
    hash_token,
    is_expired,
    make_expiry,
)
from app.db.models.attempt import TestAttempt
from app.db.models.candidate import Invitation
from app.db.models.enums import InvitationStatus, PublicLinkStatus, TestStatus
from app.db.models.evaluation import Evaluation
from app.db.models.job_description import JobDescription
from app.db.models.public_link import PublicAssessmentLink
from app.db.models.test import Test
from app.schemas.public_link import (
    CreatePublicLinkRequest,
    PublicLinkAnalyticsResponse,
    PublicLinkResolveResponse,
    PublicLinkResponse,
    PublicRegisterRequest,
    PublicRegisterResponse,
    PublicTestSummary,
    UpdatePublicLinkRequest,
)
from app.services.attempt_service import get_test_progress
from app.services.invitation_service import _find_active_invitation, _upsert_candidate

logger = get_logger(__name__)

# Fallback cap applied when a public link is created without an explicit
# max_registrations, so a blank field never yields an unbounded link.
DEFAULT_MAX_REGISTRATIONS = 500


def to_response(link: PublicAssessmentLink) -> PublicLinkResponse:
    return PublicLinkResponse(
        id=link.id,
        jd_id=link.jd_id,
        public_slug=link.public_slug,
        title=link.title,
        status=link.status,
        expires_at=link.expires_at,
        max_registrations=link.max_registrations,
        view_count=link.view_count,
        registration_count=link.registration_count,
        created_at=link.created_at,
        public_url=build_public_link(link.public_slug),
    )


# ─── Admin: create / get ───────────────────────────────────────

async def create_or_get_active_link(
    jd_id: str,
    admin_id: str,
    req: CreatePublicLinkRequest,
    db: AsyncSession,
) -> PublicAssessmentLink:
    """
    Return the JD's existing ACTIVE link, or create a new one.

    Raises:
        NotFoundError: JD not found
        ConflictError: JD has no APPROVED tests
    """
    jd_result = await db.execute(
        select(JobDescription).where(JobDescription.id == jd_id)
    )
    if jd_result.scalar_one_or_none() is None:
        raise NotFoundError("JobDescription", jd_id)

    tests_result = await db.execute(
        select(Test.id).where(Test.jd_id == jd_id, Test.status == TestStatus.APPROVED)
    )
    if tests_result.first() is None:
        raise ConflictError(
            "No approved tests found for this JD. "
            "Approve at least one test before creating a public link.",
            error_code="NO_APPROVED_TESTS",
        )

    existing_result = await db.execute(
        select(PublicAssessmentLink)
        .where(
            PublicAssessmentLink.jd_id == jd_id,
            PublicAssessmentLink.status == PublicLinkStatus.ACTIVE,
        )
        .order_by(PublicAssessmentLink.created_at.desc())
    )
    existing = existing_result.scalars().first()
    if existing is not None:
        if existing.expires_at is not None and is_expired(existing.expires_at):
            existing.status = PublicLinkStatus.EXPIRED
            await db.commit()
        else:
            return existing

    # A null max_registrations previously meant unlimited self-registration —
    # an unbounded public link where every registration mints a private test
    # token. Fall back to a generous default cap so "unlimited" is a deliberate
    # choice, never the accidental result of leaving the field blank.
    max_registrations = (
        req.max_registrations if req.max_registrations is not None else DEFAULT_MAX_REGISTRATIONS
    )
    link = PublicAssessmentLink(
        jd_id=jd_id,
        public_slug=secrets.token_urlsafe(16),
        title=req.title,
        expires_at=req.expires_at,
        max_registrations=max_registrations,
        created_by=admin_id,
        status=PublicLinkStatus.ACTIVE,
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)
    logger.info("Public link created", link_id=link.id, jd_id=jd_id)
    return link


# ─── Admin: list / update ──────────────────────────────────────

async def assert_link_owner(
    link_id: str, db: AsyncSession, owner_id: str | None
) -> None:
    """Raise NotFoundError if owner_id is set and does not own the link's JD.
    A no-op for ADMIN+ (owner_id None)."""
    if owner_id is None:
        return
    result = await db.execute(
        select(JobDescription.uploaded_by)
        .join(PublicAssessmentLink, PublicAssessmentLink.jd_id == JobDescription.id)
        .where(PublicAssessmentLink.id == link_id)
    )
    jd_owner = result.scalar_one_or_none()
    if jd_owner != owner_id:
        raise NotFoundError("PublicLink", link_id)


async def list_links_for_jd(jd_id: str, db: AsyncSession) -> list[PublicAssessmentLink]:
    result = await db.execute(
        select(PublicAssessmentLink)
        .where(PublicAssessmentLink.jd_id == jd_id)
        .order_by(PublicAssessmentLink.created_at.desc())
    )
    return list(result.scalars().all())


async def update_link(
    link_id: str, req: UpdatePublicLinkRequest, db: AsyncSession
) -> PublicAssessmentLink:
    result = await db.execute(
        select(PublicAssessmentLink).where(PublicAssessmentLink.id == link_id)
    )
    link = result.scalar_one_or_none()
    if link is None:
        raise NotFoundError("PublicAssessmentLink", link_id)

    if req.status is not None:
        link.status = req.status
    if req.expires_at is not None:
        link.expires_at = req.expires_at
    if req.max_registrations is not None:
        link.max_registrations = req.max_registrations

    await db.commit()
    await db.refresh(link)
    logger.info("Public link updated", link_id=link_id, status=link.status)
    return link


# ─── Shared loader (resolve + register) ────────────────────────

async def _load_link_with_approved_tests(
    slug: str, db: AsyncSession
) -> tuple[PublicAssessmentLink | None, JobDescription | None, list[Test]]:
    result = await db.execute(
        select(PublicAssessmentLink).where(PublicAssessmentLink.public_slug == slug)
    )
    link = result.scalar_one_or_none()
    if link is None:
        return None, None, []

    if link.status == PublicLinkStatus.ACTIVE and link.expires_at is not None and is_expired(link.expires_at):
        link.status = PublicLinkStatus.EXPIRED
        await db.commit()

    jd_result = await db.execute(
        select(JobDescription)
        .options(selectinload(JobDescription.extracted_data))
        .where(JobDescription.id == link.jd_id)
    )
    jd = jd_result.scalar_one_or_none()

    tests_result = await db.execute(
        select(Test)
        .where(Test.jd_id == link.jd_id, Test.status == TestStatus.APPROVED)
        .order_by(Test.created_at)
    )
    tests = list(tests_result.scalars().all())

    return link, jd, tests


def _link_block_reason(link: PublicAssessmentLink, tests: list[Test]) -> str | None:
    """Return the reason this link can't be used right now, or None if usable."""
    if link.status == PublicLinkStatus.DISABLED:
        return "disabled"
    if link.status == PublicLinkStatus.EXPIRED:
        return "expired"
    if link.max_registrations is not None and link.registration_count >= link.max_registrations:
        return "max_reached"
    if not tests:
        return "no_tests"
    return None


# ─── Public: resolve ────────────────────────────────────────────

async def resolve_public_link(slug: str, db: AsyncSession) -> PublicLinkResolveResponse:
    """
    Public endpoint — no auth. Returns the minimum info the candidate
    registration page needs. Never exposes question content or internal IDs.
    """
    link, jd, tests = await _load_link_with_approved_tests(slug, db)
    if link is None:
        return PublicLinkResolveResponse(valid=False, reason="not_found")

    # Top of the funnel: every page load that actually found the link, even
    # if it turns out disabled/expired — the candidate still "viewed" it.
    # Not incremented from register_via_public_link(), which shares this
    # same loader, since that would double-count the view the candidate
    # already generated by loading the page before submitting the form.
    await _increment_view_count(link.id, db)

    reason = _link_block_reason(link, tests)
    if reason is not None:
        return PublicLinkResolveResponse(valid=False, reason=reason)

    jd_title = (
        jd.extracted_data.job_title
        if jd and jd.extracted_data and jd.extracted_data.job_title
        else (jd.original_filename if jd else "Assessment")
    )

    return PublicLinkResolveResponse(
        valid=True,
        jd_title=jd_title,
        link_title=link.title,
        tests=[
            PublicTestSummary(title=t.title, duration_minutes=t.duration_minutes)
            for t in tests
        ],
    )


# ─── Public: register ───────────────────────────────────────────

_BLOCK_REASON_MESSAGES = {
    "disabled": ("This assessment link has been disabled.", "LINK_DISABLED"),
    "expired": ("This assessment link has expired.", "LINK_EXPIRED"),
    "max_reached": (
        "This assessment link has reached its maximum number of registrations.",
        "MAX_REGISTRATIONS_REACHED",
    ),
    "no_tests": (
        "This assessment link has no approved tests available right now.",
        "NO_APPROVED_TESTS",
    ),
}


async def _check_duplicate_device(
    jd_id: str,
    device_cookie_id: str | None,
    device_fingerprint: str | None,
    db: AsyncSession,
) -> str | None:
    """
    Soft anti-cheat signal: does this registration's device cookie or
    browser fingerprint match a candidate already TERMINATED (integrity
    violation) on this same JD?

    Returns a human-readable reason string for admin review, or None.
    Deliberately never blocks registration on its own — both signals are
    beatable by a determined candidate using a different browser/device
    (incognito, cleared cookies, a friend's laptop), and IP isn't checked
    here at all since shared/NAT IPs are the norm and would false-positive
    constantly. This only flags for a human to look at; the hard gate is
    the email-based TERMINATED check above in register_via_public_link.
    """
    if not device_cookie_id and not device_fingerprint:
        return None

    conditions = []
    if device_cookie_id:
        conditions.append(Invitation.device_cookie_id == device_cookie_id)
    if device_fingerprint:
        conditions.append(Invitation.device_fingerprint == device_fingerprint)

    result = await db.execute(
        select(Invitation).where(
            Invitation.jd_id == jd_id,
            Invitation.status == InvitationStatus.TERMINATED,
            or_(*conditions),
        )
    )
    matched = result.scalars().first()
    if matched is None:
        return None

    signal = (
        "device cookie" if matched.device_cookie_id == device_cookie_id and device_cookie_id
        else "browser fingerprint"
    )
    return f"Matches {signal} of terminated invitation {matched.id} (candidate {matched.candidate_id})"


async def register_via_public_link(
    slug: str,
    req: PublicRegisterRequest,
    db: AsyncSession,
    *,
    device_cookie_id: str | None = None,
    registration_ip: str | None = None,
) -> PublicRegisterResponse:
    """
    Register a candidate through a public link.

    Steps:
    1. Validate the link is usable (active, not expired, under any
       registration cap, JD still has approved tests)
    2. Upsert candidate by email
    3. If the candidate already completed every approved test for this
       JD → return status="already_completed" (no token issued)
    4. If the candidate has a still-usable (PENDING/OPENED) invitation for
       this JD → rotate its token (same mechanism as resend) and redirect
       there — never reuse the public slug as a private token
    5. Otherwise create a brand-new invitation, atomically incrementing
       the link's registration_count, and redirect to its fresh token

    Raises:
        NotFoundError: link slug doesn't exist
        ConflictError: link not usable right now (disabled/expired/full/no tests)
    """
    link, _jd, tests = await _load_link_with_approved_tests(slug, db)
    if link is None:
        raise NotFoundError("PublicAssessmentLink", slug)

    reason = _link_block_reason(link, tests)
    if reason is not None:
        message, error_code = _BLOCK_REASON_MESSAGES[reason]
        raise ConflictError(message, error_code=error_code)

    jd_id = link.jd_id
    email = str(req.email).lower().strip()

    candidate = await _upsert_candidate(
        email=email,
        name=req.full_name,
        db=db,
        phone=req.phone,
        linkedin_url=req.linkedin_url,
        resume_url=req.resume_url,
    )

    # Already finished every approved test for this JD — don't re-register.
    completed_result = await db.execute(
        select(Invitation).where(
            Invitation.candidate_id == candidate.id,
            Invitation.jd_id == jd_id,
            Invitation.status == InvitationStatus.COMPLETED,
        )
    )
    if completed_result.scalars().first() is not None:
        return PublicRegisterResponse(
            status="already_completed",
            message="You have already completed this assessment. Thanks for applying!",
        )

    # Previously terminated for an integrity violation on this JD — refuse a
    # fresh start. _find_active_invitation below only matches PENDING/OPENED
    # (deliberately, so it doesn't block a brand-new admin-issued invite
    # forever), which means without this check a terminated candidate could
    # just resubmit this same form with the same email and get a brand-new
    # token, bypassing termination entirely.
    terminated_result = await db.execute(
        select(Invitation).where(
            Invitation.candidate_id == candidate.id,
            Invitation.jd_id == jd_id,
            Invitation.status == InvitationStatus.TERMINATED,
        )
    )
    if terminated_result.scalars().first() is not None:
        return PublicRegisterResponse(
            status="terminated",
            message=(
                "Your access to this assessment was ended due to an integrity "
                "violation. If you believe this is a mistake, contact whoever "
                "shared this link with you."
            ),
        )

    # Still-usable invitation already exists — rotate its token and reuse it
    # rather than minting a second one for the same candidate+JD.
    existing = await _find_active_invitation(candidate.id, jd_id, db)
    if existing is not None:
        return await _reissue_token(existing, db)

    # Fresh registration — atomically claim a registration slot first so a
    # burst of concurrent submissions can't all squeeze past max_registrations.
    incremented = await _try_increment_registration(link, db)
    if not incremented:
        raise ConflictError(
            "This assessment link has reached its maximum number of registrations.",
            error_code="MAX_REGISTRATIONS_REACHED",
        )

    duplicate_reason = await _check_duplicate_device(
        jd_id, device_cookie_id, req.device_fingerprint, db
    )
    if duplicate_reason:
        logger.warning(
            "Public registration flagged as possible duplicate device",
            jd_id=jd_id, candidate_id=candidate.id, reason=duplicate_reason,
        )

    raw_token = generate_token()
    invitation = Invitation(
        candidate_id=candidate.id,
        jd_id=jd_id,
        invited_by=link.created_by,
        public_link_id=link.id,
        token_hash=hash_token(raw_token),
        expires_at=make_expiry(),
        status=InvitationStatus.PENDING,
        device_fingerprint=req.device_fingerprint,
        device_cookie_id=device_cookie_id,
        registration_ip=registration_ip,
        flagged_duplicate_device=duplicate_reason is not None,
        flagged_duplicate_reason=duplicate_reason,
    )
    db.add(invitation)
    try:
        await db.commit()
    except IntegrityError:
        # Lost a race against a concurrent registration for the same
        # candidate+JD (e.g. a double-submitted form) — the partial unique
        # index caught it. Recover by reusing whatever invitation won.
        await db.rollback()
        winner = await _find_active_invitation(candidate.id, jd_id, db)
        if winner is None:
            raise ConflictError(
                "Could not complete registration. Please try again.",
                error_code="REGISTRATION_CONFLICT",
            )
        return await _reissue_token(winner, db)

    logger.info(
        "Candidate registered via public link",
        link_id=link.id,
        candidate_email=candidate.email,
        jd_id=jd_id,
    )

    return PublicRegisterResponse(
        status="redirect",
        token=raw_token,
        redirect_url=build_magic_link(raw_token),
        message="Registration successful.",
    )


async def _reissue_token(invitation: Invitation, db: AsyncSession) -> PublicRegisterResponse:
    """
    Mint a fresh token for an already-usable invitation. The original raw
    token (sent only at creation/redirect time) can't be recovered since
    only its hash is stored — rotating mirrors resend_invitation().
    """
    next_test_index, total_tests = await get_test_progress(invitation, db)
    if next_test_index is None and total_tests > 0:
        invitation.status = InvitationStatus.COMPLETED
        await db.commit()
        return PublicRegisterResponse(
            status="already_completed",
            message="You have already completed this assessment. Thanks for applying!",
        )

    raw_token = generate_token()
    invitation.token_hash = hash_token(raw_token)
    await db.commit()

    return PublicRegisterResponse(
        status="redirect",
        token=raw_token,
        redirect_url=build_magic_link(raw_token),
        message="Welcome back — redirecting you to your assessment.",
    )


async def _try_increment_registration(
    link: PublicAssessmentLink, db: AsyncSession
) -> bool:
    """
    Atomically increment registration_count if under max_registrations.
    Returns False (and leaves the count unchanged) if the link is full.
    """
    result = await db.execute(
        update(PublicAssessmentLink)
        .where(
            PublicAssessmentLink.id == link.id,
            or_(
                PublicAssessmentLink.max_registrations.is_(None),
                PublicAssessmentLink.registration_count < PublicAssessmentLink.max_registrations,
            ),
        )
        .values(registration_count=PublicAssessmentLink.registration_count + 1)
    )
    # SQLAlchemy's ORM-enabled bulk UPDATE auto-synchronizes the matching
    # in-memory object's attributes (synchronize_session="auto") — no
    # manual `link.registration_count += 1` needed here.
    return result.rowcount > 0


async def _increment_view_count(link_id: str, db: AsyncSession) -> None:
    """Unconditional atomic increment — no cap to check, unlike registrations."""
    await db.execute(
        update(PublicAssessmentLink)
        .where(PublicAssessmentLink.id == link_id)
        .values(view_count=PublicAssessmentLink.view_count + 1)
    )
    await db.commit()


# ─── Admin: analytics ───────────────────────────────────────────

async def get_link_analytics(link_id: str, db: AsyncSession) -> PublicLinkAnalyticsResponse:
    """
    Funnel for one public link. views/registrations come straight off the
    link row; starts/completions/evaluated are computed by joining through
    invitations.public_link_id, which is only ever set for invitations this
    link actually produced.
    """
    result = await db.execute(
        select(PublicAssessmentLink).where(PublicAssessmentLink.id == link_id)
    )
    link = result.scalar_one_or_none()
    if link is None:
        raise NotFoundError("PublicAssessmentLink", link_id)

    starts_result = await db.execute(
        select(func.count(func.distinct(TestAttempt.invitation_id)))
        .join(Invitation, Invitation.id == TestAttempt.invitation_id)
        .where(
            Invitation.public_link_id == link_id,
            TestAttempt.started_at.isnot(None),
        )
    )
    starts = starts_result.scalar_one()

    completions_result = await db.execute(
        select(func.count(Invitation.id)).where(
            Invitation.public_link_id == link_id,
            Invitation.status == InvitationStatus.COMPLETED,
        )
    )
    completions = completions_result.scalar_one()

    # Admin override takes precedence over the AI's own recommendation, same
    # as every results page already shows — never count by ai_recommendation
    # alone once a human has overridden it.
    final_recommendation = func.coalesce(
        Evaluation.admin_override_recommendation, Evaluation.ai_recommendation
    )
    breakdown_result = await db.execute(
        select(final_recommendation, func.count(Evaluation.id))
        .join(TestAttempt, TestAttempt.id == Evaluation.attempt_id)
        .join(Invitation, Invitation.id == TestAttempt.invitation_id)
        .where(Invitation.public_link_id == link_id)
        .group_by(final_recommendation)
    )
    recommendation_breakdown = {
        recommendation.value: count for recommendation, count in breakdown_result.all()
    }
    evaluated_attempts = sum(recommendation_breakdown.values())
    positive = recommendation_breakdown.get("STRONG_HIRE", 0) + recommendation_breakdown.get("HIRE", 0)
    pass_rate = (positive / evaluated_attempts) if evaluated_attempts else None

    return PublicLinkAnalyticsResponse(
        link_id=link.id,
        views=link.view_count,
        registrations=link.registration_count,
        starts=starts,
        completions=completions,
        evaluated_attempts=evaluated_attempts,
        recommendation_breakdown=recommendation_breakdown,
        pass_rate=pass_rate,
    )
