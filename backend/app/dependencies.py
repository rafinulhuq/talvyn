"""
Shared FastAPI dependencies.
Inject these into route handlers as needed.
"""

import hashlib
import hmac
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.core.logging import get_logger
from app.db.models.enums import Role
from app.db.models.user import User
from app.db.session import get_db

logger = get_logger(__name__)


# ─── Database ─────────────────────────────────────────────────

DBSession = Annotated[AsyncSession, Depends(get_db)]
AppSettings = Annotated[Settings, Depends(get_settings)]


# ─── Internal auth (Next.js → FastAPI) ────────────────────────

async def verify_internal_token(
    x_internal_token: Annotated[str | None, Header()] = None,
    settings: Settings = Depends(get_settings),
) -> None:
    """
    Verifies the shared secret token sent from Next.js API routes.
    This is NOT a substitute for proper auth — it's a lightweight
    layer ensuring only the Next.js server can call FastAPI directly.

    Next.js must include header: X-Internal-Token: <INTERNAL_API_SECRET>
    """
    if x_internal_token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-Internal-Token header",
        )

    # Constant-time comparison to prevent timing attacks
    expected = settings.internal_api_secret.encode()
    provided = x_internal_token.encode()

    if not hmac.compare_digest(
        hashlib.sha256(expected).digest(),
        hashlib.sha256(provided).digest(),
    ):
        logger.warning("Invalid internal token attempt")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal token",
        )


# Type alias for protected routes
VerifiedInternal = Annotated[None, Depends(verify_internal_token)]


async def get_actor_id(
    x_actor_id: Annotated[str | None, Header()] = None,
) -> str | None:
    """
    Optional caller identity for audit logging. Forwarded by the Next.js
    proxy as X-Actor-Id (the NextAuth session user's DB id). None for
    callers without an admin session (e.g. background jobs).
    """
    return x_actor_id


ActorId = Annotated[str | None, Depends(get_actor_id)]


# Role hierarchy (least → most privileged). Used to compare an actor's role
# against a route's minimum required role. Keep in sync with the Role enum.
ROLE_RANK: dict[Role, int] = {
    Role.USER: 1,
    Role.ADMIN: 2,
    Role.SUPER_ADMIN: 3,
}


async def _resolve_active_actor(
    x_actor_id: str | None, db: AsyncSession
) -> User:
    """Resolve the authenticated actor forwarded by Next.js (X-Actor-Id) and
    require that they exist and are active. Raises UnauthorizedError otherwise."""
    if not x_actor_id:
        raise UnauthorizedError("Authenticated actor is required.")
    result = await db.execute(select(User).where(User.id == x_actor_id))
    actor = result.scalar_one_or_none()
    if actor is None or not actor.is_active:
        raise UnauthorizedError("Authenticated actor is not active.")
    return actor


def require_min_role(min_role: Role):
    """
    Dependency factory: require the authenticated actor's role to be at least
    ``min_role`` in the hierarchy (USER < ADMIN < SUPER_ADMIN).

    The internal token proves the request came through the trusted Next.js
    server but does not identify the acting user, so role-gated routes must
    also require X-Actor-Id and re-check the user row server-side — a hidden
    sidebar item is never the authorization boundary.
    """

    async def _dependency(
        _auth: VerifiedInternal,
        x_actor_id: Annotated[str | None, Header()] = None,
        db: AsyncSession = Depends(get_db),
    ) -> User:
        actor = await _resolve_active_actor(x_actor_id, db)
        # .get(..., 0): roles outside ROLE_RANK (e.g. Role.DEV, which is
        # docs-only and deliberately unranked) must fail this check safely
        # rather than KeyError.
        if ROLE_RANK.get(actor.role, 0) < ROLE_RANK[min_role]:
            raise ForbiddenError(f"{min_role.value} access or higher is required.")
        return actor

    return _dependency


# Backward-compatible name kept for existing imports/tests.
require_superadmin_actor = require_min_role(Role.SUPER_ADMIN)

# Convenience aliases for route signatures.
AdminActor = Annotated[User, Depends(require_min_role(Role.ADMIN))]
SuperAdminActor = Annotated[User, Depends(require_min_role(Role.SUPER_ADMIN))]
# Role.USER is the floor of ROLE_RANK, so this reads as "any authenticated
# active user" — used by routes that are self-service rather than role-gated
# (e.g. a user managing their own profile picture).
AnyActiveActor = Annotated[User, Depends(require_min_role(Role.USER))]


# ─── Data ownership scoping ───────────────────────────────────
#
# USER is a self-signup "operator" who must only ever see data they created
# — their own JDs, and the candidates/results from invitations they sent.
# ADMIN and SUPER_ADMIN see everything in the workspace.
#
# Workflow read routes resolve the acting user with `CurrentActor` and pass
# `owner_scope_for(actor)` into the service layer: a non-None value scopes the
# query to that owner id; None means unrestricted (ADMIN+).


async def get_current_actor(
    _auth: VerifiedInternal,
    x_actor_id: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Resolve the authenticated acting user (any role) so the service layer can
    scope data by ownership. Unlike the role-gated dependencies this does not
    restrict by role.

    Returns None when no actor id is forwarded or the id doesn't resolve to a
    user. In production the Next.js proxy always forwards the session user's
    real id (which exists), so None only arises for internal/system calls and
    in tests — those are treated as unscoped (see owner_scope_for), never as a
    USER. The sensitive role-gated routes use require_min_role, which stays
    strict and is unaffected by this."""
    if not x_actor_id:
        return None
    result = await db.execute(select(User).where(User.id == x_actor_id))
    actor = result.scalar_one_or_none()
    if actor is None or not actor.is_active:
        return None
    return actor


# Every route that returns workspace data uses this to identify the caller.
CurrentActor = Annotated[User | None, Depends(get_current_actor)]


def owner_scope_for(actor: User | None) -> str | None:
    """The owner id a query should be restricted to, or None for org-wide
    access. Anything ranked below ADMIN is scoped (to their own id);
    ADMIN/SUPER_ADMIN and an unresolved actor are unscoped.

    Uses ROLE_RANK rather than `actor.role == Role.USER` directly — DEV is
    deliberately excluded from ROLE_RANK (docs-only, see the Role enum),
    which used to make `== Role.USER` fall through to "unscoped" for DEV
    the same as ADMIN/SUPER_ADMIN. .get(..., 0) keeps that failure mode
    closed for any future role added below ADMIN without an explicit
    ROLE_RANK entry, the same way require_min_role already does.
    """
    if actor is None:
        return None
    return actor.id if ROLE_RANK.get(actor.role, 0) < ROLE_RANK[Role.ADMIN] else None
