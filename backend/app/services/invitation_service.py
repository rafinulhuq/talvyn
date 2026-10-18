"""
Invitation Service.

Manages the complete invitation lifecycle:
  create   → generate token → hash → save → send email
  validate → verify token hash → check expiry → check status
  open     → mark OPENED on first visit
  expire   → background job marks PENDING/OPENED as EXPIRED
  revoke   → admin manually revokes
  resend   → generate new token → update hash → extend expiry → resend email
  list     → paginated list for admin dashboard

Security notes:
  - Raw tokens are only ever in: URL params + email body
  - DB only stores HMAC-SHA256(token, secret) — 64-char hex
  - Token lookup uses constant-time comparison
  - Expiry is checked server-side on every validation request
"""

import math
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, NotFoundError, RateLimitExceededError
from app.core.logging import get_logger
from app.core.security import (
    build_magic_link,
    generate_token,
    hash_token,
    is_expired,
    make_expiry,
    verify_token,
)
from app.db.models.candidate import Candidate, CandidateNumberCounter, Invitation
from app.db.models.enums import InvitationStatus, Role, TestStatus
from app.db.models.job_description import JobDescription
from app.db.models.test import Test
from app.db.models.user import User
from app.schemas.invitation import (
    BulkInviteRequest,
    BulkInviteResponse,
    BulkInviteRowResult,
    CreateInvitationRequest,
    CreateInvitationResponse,
    InvitationResponse,
    ResendResponse,
    TokenValidationResponse,
)
from app.services import audit_log_service, cms_service, webhook_service
from app.services.attempt_service import get_test_progress
from app.services.email_service import send_invitation_email

logger = get_logger(__name__)


def _is_bank_mode(tests: list[Test]) -> bool:
    """True if any of these Test rows belong to a question bank (Master
    Prompt 2/3) rather than the legacy one-shot-per-JD generation flow —
    review_bank() sets Test.status=APPROVED on bank section tests too, so
    `question_bank_id` (not status) is the only reliable distinguisher."""
    return any(t.question_bank_id is not None for t in tests)


# ─── Daily email quota (USER role only) ────────────────────────
#
# A self-signup USER may send at most this many candidate emails
# (invitations + resends) per UTC calendar day. ADMIN/SUPER_ADMIN are
# unrestricted — same USER-only split the rest of the app already uses for
# data ownership (see dependencies.owner_scope_for). Enforced inside the
# service layer (not just the route) so bulk_invite's per-row loop through
# create_invitation() is covered for free, and so the limit can't be
# bypassed by a route that forgets to call it.
USER_DAILY_EMAIL_LIMIT = 10


async def _assert_within_daily_email_quota(sender_id: str, db: AsyncSession) -> None:
    """Raise RateLimitExceededError if `sender_id` is a USER who has already
    sent USER_DAILY_EMAIL_LIMIT candidate emails today (UTC). No-op for any
    other role, or if the sender can't be resolved (defensive — the route
    layer already requires a valid actor, this just doesn't double up on
    that check)."""
    result = await db.execute(select(User).where(User.id == sender_id))
    sender = result.scalar_one_or_none()
    if sender is None or sender.role != Role.USER:
        return

    start_of_today = datetime.now(tz=UTC).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    count_result = await db.execute(
        select(func.count())
        .select_from(Invitation)
        .where(
            Invitation.invited_by == sender_id,
            Invitation.email_sent_at >= start_of_today,
        )
    )
    sent_today = count_result.scalar_one()
    if sent_today >= USER_DAILY_EMAIL_LIMIT:
        # User-facing copy — plain language, no status codes/timezones/jargon.
        # The internal UTC-midnight reset is an implementation detail; keep it
        # out of what a recruiter actually reads.
        raise RateLimitExceededError(
            f"You've sent {USER_DAILY_EMAIL_LIMIT} candidate invitations today, "
            "which is today's limit for your account. You can send more "
            "tomorrow, or ask an admin to send urgent invitations today.",
        )


# ─── Create ───────────────────────────────────────────────────

async def create_invitation(
    req: CreateInvitationRequest,
    inviter_id: str,
    db: AsyncSession,
) -> CreateInvitationResponse:
    """
    Create a candidate invitation and send the magic link email.

    Steps:
    1. Upsert candidate (create if new, reuse if email exists)
    2. Check no active invitation exists for this candidate+JD
    3. Validate the selected test (if provided) is APPROVED
    4. Generate token, compute hash
    5. Save Invitation record
    6. Send email via Resend
    7. Update email_sent_at

    Raises:
        ConflictError: Active invitation already exists or test not approved
        NotFoundError: JD or test not found
        RateLimitExceededError: inviter is a USER who has hit today's email cap
    """
    await _assert_within_daily_email_quota(inviter_id, db)

    # 1. Upsert candidate
    candidate = await _upsert_candidate(
        email=req.candidate_email.lower().strip(),
        name=req.candidate_name,
        db=db,
    )

    # 2. Guard duplicate active invitation
    existing = await _find_active_invitation(candidate.id, req.jd_id, db)
    if existing is not None:
        raise ConflictError(
            f"An active invitation already exists for {req.candidate_email} "
            f"on this job description. Revoke the existing invitation before "
            "sending a new one.",
            error_code="DUPLICATE_INVITATION",
        )

    # 3. Load JD and tests
    jd_result = await db.execute(
        select(JobDescription)
        .options(selectinload(JobDescription.extracted_data))
        .where(JobDescription.id == req.jd_id)
    )
    jd = jd_result.scalar_one_or_none()
    if jd is None:
        raise NotFoundError("JobDescription", req.jd_id)

    # Resolve which tests to include in the email
    if req.test_id:
        test_result = await db.execute(
            select(Test).where(
                Test.id == req.test_id,
                Test.jd_id == req.jd_id,
            )
        )
        test = test_result.scalar_one_or_none()
        if test is None:
            raise NotFoundError("Test", req.test_id)
        if test.status != TestStatus.APPROVED:
            raise ConflictError(
                f"Test '{test.title}' is not approved. "
                "Approve the test before inviting candidates.",
                error_code="TEST_NOT_APPROVED",
            )
        approved_tests = [test]
    else:
        # Include all approved tests for the JD
        tests_result = await db.execute(
            select(Test).where(
                Test.jd_id == req.jd_id,
                Test.status == TestStatus.APPROVED,
            )
        )
        approved_tests = list(tests_result.scalars().all())
        if not approved_tests:
            raise ConflictError(
                "No approved tests found for this JD. "
                "Approve at least one test before inviting candidates.",
                error_code="NO_APPROVED_TESTS",
            )

    # 4. Generate token
    raw_token = generate_token()
    token_hash_value = hash_token(raw_token)
    expires_at = make_expiry()
    # Bank-mode JDs (Master Prompt 2/3) point candidates at the sectioned
    # exam flow (/exam/<token>) instead of the legacy single-test flow
    # (/tests/<token>) — same token either way, different frontend route.
    # See attempt_service.start_attempt()'s matching guard, which refuses
    # the legacy endpoint for bank-mode tests so an old/manually-typed
    # /tests/ link can't bypass question-bank locking.
    magic_link = build_magic_link(
        raw_token, path_prefix="exam" if _is_bank_mode(approved_tests) else "tests"
    )

    # 5. Save invitation
    invitation = Invitation(
        candidate_id=candidate.id,
        jd_id=req.jd_id,
        invited_by=inviter_id,
        token_hash=token_hash_value,
        expires_at=expires_at,
        status=InvitationStatus.PENDING,
    )
    db.add(invitation)
    try:
        await db.commit()
    except IntegrityError:
        # Lost a race against a concurrent create_invitation for the same
        # candidate+JD — the partial unique index caught what the
        # _find_active_invitation check above couldn't see yet.
        await db.rollback()
        raise ConflictError(
            f"An active invitation already exists for {req.candidate_email} "
            f"on this job description. Revoke the existing invitation before "
            "sending a new one.",
            error_code="DUPLICATE_INVITATION",
        )
    await db.refresh(invitation)

    logger.info(
        "Invitation created",
        invitation_id=invitation.id,
        candidate_email=candidate.email,
        jd_id=req.jd_id,
        test_count=len(approved_tests),
    )

    await webhook_service.enqueue_event(
        "invitation.created",
        {
            "invitation_id": invitation.id,
            "candidate_id": candidate.id,
            "candidate_email": candidate.email,
            "jd_id": req.jd_id,
        },
        db,
    )

    # 6. Send email
    jd_title = (
        jd.extracted_data.job_title
        if jd.extracted_data and jd.extracted_data.job_title
        else jd.original_filename
    )
    email_template = await cms_service.get_published_document(db, "invitation_email")
    email_sent = await send_invitation_email(
        to_email=candidate.email,
        to_name=candidate.name,
        jd_title=jd_title,
        magic_link=magic_link,
        expires_at=expires_at,
        test_titles=[t.title for t in approved_tests],
        cms_template=email_template,
    )

    # 7. Update email_sent_at
    if email_sent:
        invitation.email_sent_at = datetime.now(tz=UTC)
        await db.commit()

    return CreateInvitationResponse(
        invitation_id=invitation.id,
        candidate_id=candidate.id,
        candidate_email=candidate.email,
        status=invitation.status,
        expires_at=expires_at,
        email_sent=email_sent,
        message=(
            "Invitation sent successfully."
            if email_sent
            else (
                "Invitation created but email delivery failed. "
                "Copy the magic link below and share it with the candidate manually."
            )
        ),
        # Expose the magic link when email fails so the admin can share it
        # directly without having to dig through backend logs.
        magic_link=None if email_sent else magic_link,
    )


# ─── Token validation (public) ────────────────────────────────

async def validate_token(
    raw_token: str,
    db: AsyncSession,
) -> tuple[TokenValidationResponse, Invitation | None]:
    """
    Validate a magic link token.

    Returns (TokenValidationResponse, invitation_orm_or_None).
    The ORM instance is returned so the caller can mark OPENED.

    This endpoint is intentionally slow-path (no DB index on raw token).
    We look up by token_hash which IS unique-indexed.
    """
    token_hash_value = hash_token(raw_token)

    result = await db.execute(
        select(Invitation)
        .options(
            selectinload(Invitation.candidate),
        )
        .where(Invitation.token_hash == token_hash_value)
    )
    invitation = result.scalar_one_or_none()

    # Not found
    if invitation is None:
        logger.warning("Token validation: not found", token_prefix=raw_token[:8])
        return (
            TokenValidationResponse(valid=False, reason="not_found"),
            None,
        )

    # Double-check HMAC (hash_token already matched via DB query, but be explicit)
    if not verify_token(raw_token, invitation.token_hash):
        logger.error("HMAC verify mismatch — hash collision or DB corruption?")
        return (
            TokenValidationResponse(valid=False, reason="not_found"),
            None,
        )

    # Revoked
    if invitation.status == InvitationStatus.REVOKED:
        return (
            TokenValidationResponse(valid=False, reason="revoked"),
            invitation,
        )

    # Terminated — candidate-side integrity violation (tab switch, etc.). Distinct
    # from REVOKED so the candidate sees a cause-specific message.
    if invitation.status == InvitationStatus.TERMINATED:
        return (
            TokenValidationResponse(valid=False, reason="terminated"),
            invitation,
        )

    # Expired by time
    if is_expired(invitation.expires_at):
        if invitation.status not in (InvitationStatus.EXPIRED, InvitationStatus.REVOKED):
            invitation.status = InvitationStatus.EXPIRED
            await db.commit()
        return (
            TokenValidationResponse(valid=False, reason="expired"),
            invitation,
        )

    # Load JD + tests for the response payload
    jd_result = await db.execute(
        select(JobDescription)
        .options(selectinload(JobDescription.extracted_data))
        .where(JobDescription.id == invitation.jd_id)
    )
    jd = jd_result.scalar_one_or_none()

    tests_result = await db.execute(
        select(Test)
        .where(
            Test.jd_id == invitation.jd_id,
            Test.status == TestStatus.APPROVED,
        )
        .order_by(Test.created_at)
    )
    approved_tests = list(tests_result.scalars().all())

    jd_title = (
        jd.extracted_data.job_title
        if jd and jd.extracted_data and jd.extracted_data.job_title
        else (jd.original_filename if jd else "Assessment")
    )

    # Tell the candidate which test_index to attempt next so a multi-test
    # invitation can be resumed (e.g. they finished test 1 of 2, closed the
    # tab, and reopened the same magic link later).
    next_test_index, total_tests = await get_test_progress(invitation, db)

    # A completed invitation is only truly "already used" once every approved
    # test has a submitted/evaluated attempt. Older code could mark the
    # invitation completed after the first test, so repair that state here.
    if next_test_index is None and total_tests > 0:
        if invitation.status != InvitationStatus.COMPLETED:
            invitation.status = InvitationStatus.COMPLETED
            await db.commit()
        return (
            TokenValidationResponse(valid=False, reason="already_used"),
            invitation,
        )

    if invitation.status == InvitationStatus.COMPLETED and next_test_index is not None:
        invitation.status = InvitationStatus.OPENED
        await db.commit()

    return (
        TokenValidationResponse(
            valid=True,
            candidate_name=invitation.candidate.name,
            jd_title=jd_title,
            test_titles=[t.title for t in approved_tests],
            invitation_status=invitation.status,
            expires_at=invitation.expires_at,
            next_test_index=next_test_index,
            total_tests=total_tests,
        ),
        invitation,
    )


async def mark_opened(invitation: Invitation, db: AsyncSession) -> None:
    """Mark an invitation as OPENED on the candidate's first visit."""
    if invitation.status == InvitationStatus.PENDING:
        invitation.status = InvitationStatus.OPENED
        await db.commit()
        logger.info("Invitation opened", invitation_id=invitation.id)


# ─── Resend ───────────────────────────────────────────────────

async def resend_invitation(
    invitation_id: str,
    extend_expiry: bool,
    db: AsyncSession,
    actor_id: str | None = None,
) -> ResendResponse:
    """
    Resend an invitation with a fresh token.

    - Generates a new token (old one is invalidated by hash replacement)
    - Optionally extends expiry by another 72 hours
    - Resets status to PENDING
    - Counts against the resender's daily email quota if they're a USER

    Raises:
        RateLimitExceededError: actor is a USER who has hit today's email cap
    """
    result = await db.execute(
        select(Invitation)
        .options(selectinload(Invitation.candidate))
        .where(Invitation.id == invitation_id)
    )
    invitation = result.scalar_one_or_none()
    if invitation is None:
        raise NotFoundError("Invitation", invitation_id)

    if invitation.status == InvitationStatus.REVOKED:
        raise ConflictError(
            "Cannot resend a revoked invitation. "
            "Create a new invitation for this candidate instead.",
            error_code="INVITATION_REVOKED",
        )

    if invitation.status == InvitationStatus.COMPLETED:
        raise ConflictError(
            "Cannot resend a completed invitation.",
            error_code="INVITATION_COMPLETED",
        )

    # Resending sends a real email, so it counts against the resender's
    # (not the original inviter's) daily quota — actor_id is None for
    # system/background callers, which are never USER-role, so the quota
    # helper's role lookup naturally no-ops for those.
    if actor_id:
        await _assert_within_daily_email_quota(actor_id, db)

    # New token
    raw_token = generate_token()
    invitation.token_hash = hash_token(raw_token)
    invitation.status = InvitationStatus.PENDING

    if extend_expiry:
        invitation.expires_at = make_expiry()

    await db.flush()

    # Load JD for email
    jd_result = await db.execute(
        select(JobDescription)
        .options(selectinload(JobDescription.extracted_data))
        .where(JobDescription.id == invitation.jd_id)
    )
    jd = jd_result.scalar_one_or_none()
    jd_title = (
        jd.extracted_data.job_title
        if jd and jd.extracted_data
        else (jd.original_filename if jd else "Assessment")
    )

    tests_result = await db.execute(
        select(Test).where(
            Test.jd_id == invitation.jd_id,
            Test.status == TestStatus.APPROVED,
        )
    )
    approved_tests_for_resend = list(tests_result.scalars().all())
    test_titles = [t.title for t in approved_tests_for_resend]

    magic_link = build_magic_link(
        raw_token, path_prefix="exam" if _is_bank_mode(approved_tests_for_resend) else "tests"
    )
    email_template = await cms_service.get_published_document(db, "invitation_email")
    email_sent = await send_invitation_email(
        to_email=invitation.candidate.email,
        to_name=invitation.candidate.name,
        jd_title=jd_title,
        magic_link=magic_link,
        expires_at=invitation.expires_at,
        test_titles=test_titles,
        cms_template=email_template,
    )

    if email_sent:
        invitation.email_sent_at = datetime.now(tz=UTC)

    await audit_log_service.record(
        db,
        actor_id=actor_id,
        action="INVITATION_RESENT",
        target_type="invitation",
        target_id=invitation_id,
        summary=f"Resent invitation to {invitation.candidate.name} ({invitation.candidate.email})",
        details={"extend_expiry": extend_expiry, "email_sent": email_sent},
    )

    await db.commit()

    logger.info(
        "Invitation resent",
        invitation_id=invitation_id,
        email_sent=email_sent,
    )

    return ResendResponse(
        invitation_id=invitation_id,
        new_expires_at=invitation.expires_at,
        email_sent=email_sent,
        message=(
            "Invitation resent successfully."
            if email_sent
            else (
                "Token refreshed but email delivery failed. "
                "Copy the magic link below and share it with the candidate manually."
            )
        ),
        # Expose the magic link when email fails so the admin can share it directly.
        magic_link=None if email_sent else magic_link,
    )


# ─── Revoke ───────────────────────────────────────────────────

async def revoke_invitation(
    invitation_id: str,
    db: AsyncSession,
    actor_id: str | None = None,
) -> None:
    """Permanently revoke an invitation. Cannot be undone."""
    result = await db.execute(
        select(Invitation)
        .options(selectinload(Invitation.candidate))
        .where(Invitation.id == invitation_id)
    )
    invitation = result.scalar_one_or_none()
    if invitation is None:
        raise NotFoundError("Invitation", invitation_id)

    invitation.status = InvitationStatus.REVOKED

    await audit_log_service.record(
        db,
        actor_id=actor_id,
        action="INVITATION_REVOKED",
        target_type="invitation",
        target_id=invitation_id,
        summary=f"Revoked invitation for {invitation.candidate.name} ({invitation.candidate.email})",
    )

    await db.commit()
    logger.info("Invitation revoked", invitation_id=invitation_id)


# ─── List ─────────────────────────────────────────────────────

async def assert_invitation_owner(
    invitation_id: str, db: AsyncSession, owner_id: str | None
) -> None:
    """Raise NotFoundError if owner_id is set and did not send this invitation.
    A no-op for ADMIN+ (owner_id None)."""
    if owner_id is None:
        return
    result = await db.execute(
        select(Invitation.invited_by).where(Invitation.id == invitation_id)
    )
    inviter = result.scalar_one_or_none()
    if inviter != owner_id:
        raise NotFoundError("Invitation", invitation_id)


async def list_invitations_for_jd(
    jd_id: str,
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    owner_id: str | None = None,
) -> dict:
    """
    List invitations for a JD with candidate details.
    Auto-expires PENDING/OPENED invitations whose time has passed.
    When owner_id is set, only invitations sent by that owner are returned.
    """
    from sqlalchemy import func

    # Auto-expire stale invitations before listing
    await _auto_expire_stale(jd_id, db)

    filters = [Invitation.jd_id == jd_id]
    if owner_id is not None:
        filters.append(Invitation.invited_by == owner_id)

    # Count
    count_result = await db.execute(
        select(func.count(Invitation.id)).where(*filters)
    )
    total = count_result.scalar_one()

    # Fetch
    offset = (page - 1) * page_size
    result = await db.execute(
        select(Invitation)
        .options(selectinload(Invitation.candidate))
        .where(*filters)
        .order_by(Invitation.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    invitations = list(result.scalars().all())

    # Batch-fetch the most-recent submitted attempt for COMPLETED invitations
    from app.db.models.attempt import TestAttempt
    from app.db.models.enums import AttemptStatus

    completed_ids = [
        inv.id for inv in invitations if inv.status == InvitationStatus.COMPLETED
    ]
    attempt_map: dict[str, str] = {}
    if completed_ids:
        att_result = await db.execute(
            select(TestAttempt.invitation_id, TestAttempt.id)
            .where(
                TestAttempt.invitation_id.in_(completed_ids),
                TestAttempt.status.in_(
                    [AttemptStatus.SUBMITTED, AttemptStatus.EVALUATED]
                ),
            )
            .order_by(TestAttempt.submitted_at.desc())
        )
        for inv_id, att_id in att_result.all():
            if inv_id not in attempt_map:  # keep most-recent per invitation
                attempt_map[inv_id] = att_id

    items = [
        InvitationResponse(
            id=inv.id,
            candidate_id=inv.candidate_id,
            jd_id=inv.jd_id,
            invited_by=inv.invited_by,
            status=inv.status,
            expires_at=inv.expires_at,
            email_sent_at=inv.email_sent_at,
            created_at=inv.created_at,
            candidate_number=inv.candidate.candidate_number,
            candidate_name=inv.candidate.name,
            candidate_email=inv.candidate.email,
            attempt_id=attempt_map.get(inv.id),
            flagged_duplicate_device=inv.flagged_duplicate_device,
            flagged_duplicate_reason=inv.flagged_duplicate_reason,
        )
        for inv in invitations
    ]

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": math.ceil(total / page_size) if total > 0 else 0,
    }


# ─── Bulk invite ──────────────────────────────────────────────

async def bulk_invite(
    req: BulkInviteRequest,
    inviter_id: str,
    db: AsyncSession,
) -> BulkInviteResponse:
    """
    Invite up to 50 candidates from a pre-parsed list.

    Each row is processed independently — failures and duplicates are recorded
    per-row rather than aborting the entire batch.  Duplicate active invitations
    are logged as "skipped" (not counted as failures).
    """
    results: list[BulkInviteRowResult] = []
    sent = skipped = failed = 0

    for row in req.candidates:
        email = str(row.candidate_email).lower().strip()
        name = row.candidate_name.strip() or email.split("@")[0]
        try:
            single_req = CreateInvitationRequest(
                candidate_name=name,
                candidate_email=email,
                jd_id=req.jd_id,
                test_id=req.test_id,
            )
            result = await create_invitation(single_req, inviter_id, db)
            sent += 1
            results.append(BulkInviteRowResult(
                email=email,
                name=name,
                status="sent",
                invitation_id=result.invitation_id,
                email_sent=result.email_sent,
            ))
        except ConflictError as e:
            if e.error_code == "DUPLICATE_INVITATION":
                skipped += 1
                results.append(BulkInviteRowResult(
                    email=email, name=name, status="skipped",
                    error="Active invitation already exists — skipped.",
                ))
            else:
                failed += 1
                results.append(BulkInviteRowResult(
                    email=email, name=name, status="failed", error=e.message,
                ))
        except RateLimitExceededError:
            # Daily cap hit partway through the batch — everything sent so
            # far in this request stays sent; the rest (this row onward)
            # is reported as skipped rather than failed, since it's an
            # expected boundary, not an error. No point calling
            # create_invitation again for later rows: the count only goes
            # up, so mark the remainder skipped without retrying each one.
            for remaining in req.candidates[len(results):]:
                remaining_email = str(remaining.candidate_email).lower().strip()
                remaining_name = remaining.candidate_name.strip() or remaining_email.split("@")[0]
                skipped += 1
                results.append(BulkInviteRowResult(
                    email=remaining_email, name=remaining_name, status="skipped",
                    error=f"Skipped — you've reached today's limit of {USER_DAILY_EMAIL_LIMIT} invitations.",
                ))
            break
        except NotFoundError as e:
            failed += 1
            results.append(BulkInviteRowResult(
                email=email, name=name, status="failed", error=e.message,
            ))
        except Exception as e:
            failed += 1
            results.append(BulkInviteRowResult(
                email=email, name=name, status="failed", error=str(e),
            ))

    logger.info(
        "Bulk invite complete",
        jd_id=req.jd_id,
        total=len(req.candidates),
        sent=sent,
        skipped=skipped,
        failed=failed,
    )
    return BulkInviteResponse(
        total=len(req.candidates),
        sent=sent,
        skipped=skipped,
        failed=failed,
        results=results,
    )


# ─── Private helpers ──────────────────────────────────────────

async def _next_candidate_number(db: AsyncSession) -> int:
    """
    Atomically claim the next sequential candidate number.

    Uses the same "UPDATE ... SET x = x + 1 RETURNING x" pattern as
    PublicAssessmentLink.registration_count/view_count rather than
    SELECT MAX(candidate_number) + 1, which would race under concurrent
    candidate creation (two reads of the same max before either INSERT
    commits would hand out the same number to two different candidates).
    """
    result = await db.execute(
        update(CandidateNumberCounter)
        .where(CandidateNumberCounter.id == 1)
        .values(next_value=CandidateNumberCounter.next_value + 1)
        .returning(CandidateNumberCounter.next_value)
    )
    row = result.first()
    if row is not None:
        return row[0] - 1

    # Counter row missing — only happens in SQLite test databases, which are
    # created via Base.metadata.create_all() and never run the Alembic
    # migration that seeds this row. Production always has it from day one.
    db.add(CandidateNumberCounter(id=1, next_value=2))
    await db.flush()
    return 1


async def _upsert_candidate(
    email: str,
    name: str,
    db: AsyncSession,
    phone: str | None = None,
    linkedin_url: str | None = None,
    resume_url: str | None = None,
) -> Candidate:
    """
    Find existing candidate by email or create a new one.

    phone/linkedin_url/resume_url are only set when provided (public
    self-registration collects them; the manual admin invite form does not).
    """
    result = await db.execute(
        select(Candidate).where(Candidate.email == email)
    )
    candidate = result.scalar_one_or_none()

    if candidate is None:
        candidate = Candidate(
            candidate_number=await _next_candidate_number(db),
            email=email,
            name=name,
            phone=phone,
            linkedin_url=linkedin_url,
            resume_url=resume_url,
        )
        db.add(candidate)
        await db.flush()
        logger.info("New candidate created", email=email, candidate_number=candidate.candidate_number)
    else:
        dirty = False
        if candidate.name != name:
            candidate.name = name
            dirty = True
        if phone is not None and candidate.phone != phone:
            candidate.phone = phone
            dirty = True
        if linkedin_url is not None and candidate.linkedin_url != linkedin_url:
            candidate.linkedin_url = linkedin_url
            dirty = True
        if resume_url is not None and candidate.resume_url != resume_url:
            candidate.resume_url = resume_url
            dirty = True
        if dirty:
            await db.flush()

    return candidate


async def _find_active_invitation(
    candidate_id: str, jd_id: str, db: AsyncSession
) -> Invitation | None:
    """Return any non-terminal invitation for this candidate+JD."""
    active_statuses = [InvitationStatus.PENDING, InvitationStatus.OPENED]
    result = await db.execute(
        select(Invitation).where(
            Invitation.candidate_id == candidate_id,
            Invitation.jd_id == jd_id,
            Invitation.status.in_(active_statuses),
        )
    )
    return result.scalar_one_or_none()


async def _auto_expire_stale(jd_id: str, db: AsyncSession) -> None:
    """
    Mark PENDING/OPENED invitations as EXPIRED if their time has passed.
    Called lazily before list views — no background job needed.
    """
    now = datetime.now(tz=UTC)
    await db.execute(
        update(Invitation)
        .where(
            Invitation.jd_id == jd_id,
            Invitation.expires_at < now,
            Invitation.status.in_(
                [InvitationStatus.PENDING, InvitationStatus.OPENED]
            ),
        )
        .values(status=InvitationStatus.EXPIRED)
    )
    await db.commit()
