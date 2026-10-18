"""
Public Assessment Link API endpoints.

Admin (requires X-Internal-Token + X-Inviter-Id, forwarded by the Next.js
authenticated proxy):
  POST   /api/v1/public-links/jd/{jd_id}      Create or return the active link
  GET    /api/v1/public-links/jd/{jd_id}      List links for a JD
  PATCH  /api/v1/public-links/{id}            Update status/expiry/max registrations
  GET    /api/v1/public-links/{id}/analytics  Funnel: views/registrations/starts/completions/pass rate

Public (no auth, rate-limited — called directly from the candidate browser):
  GET    /api/v1/public-links/resolve/{slug}      Safe summary for the registration page
  POST   /api/v1/public-links/{slug}/register     Register a candidate, mint a private token
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.logging import get_logger
from app.core.ratelimit import get_client_ip, limiter
from app.core.security import generate_token
from app.db.session import get_db
from app.dependencies import CurrentActor, owner_scope_for
from app.schemas.public_link import (
    CreatePublicLinkRequest,
    PublicLinkAnalyticsResponse,
    PublicLinkListResponse,
    PublicLinkResolveResponse,
    PublicLinkResponse,
    PublicRegisterRequest,
    PublicRegisterResponse,
    UpdatePublicLinkRequest,
)
from app.services import jd_service, public_link_service

logger = get_logger(__name__)
router = APIRouter()


# ─── Admin: create / get ────────────────────────────────────────

@router.post(
    "/jd/{jd_id}",
    response_model=PublicLinkResponse,
    status_code=201,
    summary="Create or return the active public link for a JD",
)
async def create_public_link(
    jd_id: str,
    req: CreatePublicLinkRequest,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
    x_inviter_id: Annotated[str | None, Header()] = None,
) -> PublicLinkResponse:
    """
    Idempotent: if an ACTIVE link already exists for this JD it is returned
    unchanged; otherwise a new one is created. Requires at least one
    APPROVED test on the JD.
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
    await jd_service.get_jd_orm(jd_id, db, owner_id=owner_scope_for(actor))
    link = await public_link_service.create_or_get_active_link(jd_id, x_inviter_id, req, db)
    return public_link_service.to_response(link)


# ─── Admin: list ─────────────────────────────────────────────────

@router.get(
    "/jd/{jd_id}",
    response_model=PublicLinkListResponse,
    summary="List public links for a job description",
)
async def list_public_links(
    jd_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> PublicLinkListResponse:
    await jd_service.get_jd_orm(jd_id, db, owner_id=owner_scope_for(actor))
    links = await public_link_service.list_links_for_jd(jd_id, db)
    return PublicLinkListResponse(
        items=[public_link_service.to_response(link) for link in links]
    )


# ─── Admin: update ───────────────────────────────────────────────

@router.patch(
    "/{link_id}",
    response_model=PublicLinkResponse,
    summary="Enable/disable a link or change its expiry / registration cap",
)
async def update_public_link(
    link_id: str,
    req: UpdatePublicLinkRequest,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> PublicLinkResponse:
    await public_link_service.assert_link_owner(link_id, db, owner_scope_for(actor))
    link = await public_link_service.update_link(link_id, req, db)
    return public_link_service.to_response(link)


# ─── Admin: analytics ────────────────────────────────────────────

@router.get(
    "/{link_id}/analytics",
    response_model=PublicLinkAnalyticsResponse,
    summary="Funnel analytics for a public link (views/registrations/starts/completions/pass rate)",
)
async def get_public_link_analytics(
    link_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> PublicLinkAnalyticsResponse:
    await public_link_service.assert_link_owner(link_id, db, owner_scope_for(actor))
    return await public_link_service.get_link_analytics(link_id, db)


# ─── Public: resolve ─────────────────────────────────────────────

@router.get(
    "/resolve/{slug}",
    response_model=PublicLinkResolveResponse,
    summary="Resolve a public link into a safe candidate-facing summary (no auth)",
)
@limiter.limit("30/minute")
async def resolve_public_link(
    request: Request,
    slug: str,
    db: AsyncSession = Depends(get_db),
) -> PublicLinkResolveResponse:
    """
    Public endpoint — no X-Internal-Token required. Never exposes question
    content, internal IDs, or anything beyond the JD title and test list.
    """
    return await public_link_service.resolve_public_link(slug, db)


# ─── Public: register ────────────────────────────────────────────

DEVICE_COOKIE_NAME = "rp_device_id"
DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 2  # 2 years


@router.post(
    "/{slug}/register",
    response_model=PublicRegisterResponse,
    status_code=201,
    summary="Register a candidate through a public link (no auth)",
)
@limiter.limit("5/minute")
async def register_via_public_link(
    request: Request,
    response: Response,
    slug: str,
    req: PublicRegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> PublicRegisterResponse:
    """
    Creates (or reuses) a private invitation for the candidate and returns
    the redirect token. The public slug is never reused as the candidate's
    own token — each candidate gets a unique magic link.

    Also sets/refreshes a long-lived device-id cookie (HttpOnly, so it
    survives a localStorage/sessionStorage clear) used as a soft anti-cheat
    signal — see public_link_service._check_duplicate_device. This is a
    deterrent, not a lock: a different browser/device defeats it entirely.
    """
    device_cookie_id = request.cookies.get(DEVICE_COOKIE_NAME) or generate_token()
    result = await public_link_service.register_via_public_link(
        slug,
        req,
        db,
        device_cookie_id=device_cookie_id,
        registration_ip=get_client_ip(request),
    )
    response.set_cookie(
        DEVICE_COOKIE_NAME,
        device_cookie_id,
        max_age=DEVICE_COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=get_settings().app_env == "production",
    )
    return result
