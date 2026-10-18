"""
Invitation and Candidate API endpoints.

POST   /api/v1/invitations/                    Create + send invitation
GET    /api/v1/invitations/jd/{jd_id}          List invitations for a JD
GET    /api/v1/invitations/validate/{token}    Validate token (PUBLIC — no auth)
POST   /api/v1/invitations/{id}/resend         Resend with fresh token
POST   /api/v1/invitations/{id}/revoke         Revoke invitation
GET    /api/v1/invitations/{id}                Get invitation details
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.core.ratelimit import limiter
from app.db.session import get_db
from app.dependencies import ActorId, CurrentActor, owner_scope_for
from app.schemas.invitation import (
    BulkInviteRequest,
    BulkInviteResponse,
    CreateInvitationRequest,
    CreateInvitationResponse,
    InvitationResponse,
    ResendInvitationRequest,
    ResendResponse,
    TokenValidationResponse,
)
from app.services import invitation_service, jd_service

logger = get_logger(__name__)
router = APIRouter()

# ─── Create invitation ────────────────────────────────────────

@router.post(
    "/",
    response_model=CreateInvitationResponse,
    status_code=201,
    summary="Send a test invitation to a candidate",
)
async def create_invitation(
    req: CreateInvitationRequest,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
    x_inviter_id: Annotated[str | None, Header()] = None,
) -> CreateInvitationResponse:
    """
    Create a candidate record (or reuse existing) and send a magic link email.

    - Requires at least one APPROVED test to exist for the JD
    - Rejects duplicate active invitations for the same candidate+JD
    - Email is sent via Resend; if it fails the invitation is still created
    - Returns the invitation ID and whether email delivery succeeded

    X-Inviter-Id is forwarded by the Next.js proxy from the authenticated
    user's session (token.sub = users.id). It is required because
    invitations.invited_by has a FK → users.id.
    """
    if not x_inviter_id:
        raise HTTPException(
            status_code=400,
            detail=(
                "X-Inviter-Id header is required. "
                "This header is set automatically by the Next.js proxy from "
                "the authenticated session."
            ),
        )
    # A USER may only invite candidates for a JD they own.
    await jd_service.get_jd_orm(req.jd_id, db, owner_id=owner_scope_for(actor))
    return await invitation_service.create_invitation(req, x_inviter_id, db)


# ─── List invitations for JD ──────────────────────────────────

@router.get(
    "/jd/{jd_id}",
    summary="List invitations for a job description",
)
async def list_invitations(
    jd_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> dict:
    return await invitation_service.list_invitations_for_jd(
        jd_id, db, page=page, page_size=page_size, owner_id=owner_scope_for(actor)
    )


# ─── Token validation (PUBLIC) ────────────────────────────────

@router.get(
    "/validate/{token}",
    response_model=TokenValidationResponse,
    summary="Validate a magic link token (no auth required)",
)
@limiter.limit("20/minute")
async def validate_token(
    request: Request,
    token: str,
    db: AsyncSession = Depends(get_db),
    mark_opened: bool = Query(
        default=True,
        description="Set to false to skip marking the invitation as OPENED",
    ),
) -> TokenValidationResponse:
    """
    Public endpoint — no X-Internal-Token required.

    Called by the candidate's browser when they open the magic link.
    Returns minimum information needed to render the test entry page.
    Internal IDs (test IDs, invitation IDs) are never returned here.

    If mark_opened=true and the token is valid, marks the invitation as OPENED.
    """
    response, invitation = await invitation_service.validate_token(token, db)

    if response.valid and mark_opened and invitation is not None:
        await invitation_service.mark_opened(invitation, db)

    return response


# ─── Bulk invite ─────────────────────────────────────────────

@router.post(
    "/bulk",
    response_model=BulkInviteResponse,
    status_code=200,
    summary="Bulk-invite candidates from pre-parsed CSV data (max 50 rows)",
)
async def bulk_invite_candidates(
    req: BulkInviteRequest,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
    x_inviter_id: Annotated[str | None, Header()] = None,
) -> BulkInviteResponse:
    """
    Accept a pre-parsed list of candidates and send each a magic link email.

    CSV parsing is done on the client — this endpoint receives a JSON array.
    Each row is processed independently; duplicates are skipped, failures
    are recorded per-row rather than aborting the batch.

    Returns per-row results plus overall sent / skipped / failed counts.
    """
    if not x_inviter_id:
        raise HTTPException(
            status_code=400,
            detail=(
                "X-Inviter-Id header is required. "
                "This header is set automatically by the Next.js proxy."
            ),
        )
    await jd_service.get_jd_orm(req.jd_id, db, owner_id=owner_scope_for(actor))
    return await invitation_service.bulk_invite(req, x_inviter_id, db)


# ─── Get invitation detail ────────────────────────────────────

@router.get(
    "/{invitation_id}",
    response_model=InvitationResponse,
    summary="Get invitation details",
)
async def get_invitation(
    invitation_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> InvitationResponse:
    await invitation_service.assert_invitation_owner(invitation_id, db, owner_scope_for(actor))
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.core.exceptions import NotFoundError
    from app.db.models.candidate import Invitation

    result = await db.execute(
        select(Invitation)
        .options(selectinload(Invitation.candidate))
        .where(Invitation.id == invitation_id)
    )
    inv = result.scalar_one_or_none()
    if inv is None:
        raise NotFoundError("Invitation", invitation_id)

    return InvitationResponse(
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
        flagged_duplicate_device=inv.flagged_duplicate_device,
        flagged_duplicate_reason=inv.flagged_duplicate_reason,
    )


# ─── Resend ───────────────────────────────────────────────────

@router.post(
    "/{invitation_id}/resend",
    response_model=ResendResponse,
    summary="Resend invitation with a fresh token",
)
async def resend_invitation(
    invitation_id: str,
    req: ResendInvitationRequest,
    actor: CurrentActor,
    actor_id: ActorId,
    db: AsyncSession = Depends(get_db),
) -> ResendResponse:
    await invitation_service.assert_invitation_owner(invitation_id, db, owner_scope_for(actor))
    """
    Generate a new token (invalidating the old one) and resend the email.
    Status resets to PENDING; expiry is extended by 72h if extend_expiry=true.
    """
    return await invitation_service.resend_invitation(
        invitation_id, req.extend_expiry, db, actor_id
    )


# ─── Revoke ───────────────────────────────────────────────────

@router.post(
    "/{invitation_id}/revoke",
    status_code=204,
    summary="Revoke an invitation permanently",
)
async def revoke_invitation(
    invitation_id: str,
    actor: CurrentActor,
    actor_id: ActorId,
    db: AsyncSession = Depends(get_db),
) -> None:
    await invitation_service.assert_invitation_owner(invitation_id, db, owner_scope_for(actor))
    await invitation_service.revoke_invitation(invitation_id, db, actor_id)
