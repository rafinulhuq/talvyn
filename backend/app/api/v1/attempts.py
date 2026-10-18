"""
Test attempt API endpoints — all called from the candidate browser.

POST   /api/v1/attempts/start              Begin (or resume) a test
GET    /api/v1/attempts/{id}/state         Get state for resume after page refresh
POST   /api/v1/attempts/{id}/answer        Autosave one answer
POST   /api/v1/attempts/{id}/heartbeat     Sync server-side timer
POST   /api/v1/attempts/{id}/submit        Final submission
POST   /api/v1/attempts/{id}/event         Log a suspicious event
POST   /api/v1/attempts/{id}/terminate     Hard-terminate on an integrity violation

Security:
  - /start validates the magic link token (public)
  - All other endpoints require a matching attempt_id + token pair
    passed as X-Attempt-Token header so internal IDs stay off the URL
  - These endpoints have NO X-Internal-Token requirement because they
    are called directly from the candidate browser (no Next.js server in between)
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.core.ratelimit import limiter
from app.db.session import get_db
from app.schemas.attempt import (
    AttemptStateResponse,
    BulkSaveRequest,
    BulkSaveResponse,
    HeartbeatRequest,
    HeartbeatResponse,
    SaveAnswerRequest,
    SaveAnswerResponse,
    StartAttemptRequest,
    StartAttemptResponse,
    SubmitAttemptRequest,
    SubmitAttemptResponse,
    SuspiciousEventRequest,
    SuspiciousEventResponse,
    TerminateAttemptRequest,
    TerminateAttemptResponse,
)
from app.services import attempt_service

logger = get_logger(__name__)
router = APIRouter()


# ─── Start / resume ───────────────────────────────────────────

@router.post(
    "/start",
    response_model=StartAttemptResponse,
    status_code=201,
    summary="Start or resume a test attempt",
)
@limiter.limit("10/minute")
async def start_attempt(
    req: StartAttemptRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> StartAttemptResponse:
    """
    Public endpoint — validates the magic link token and begins the test.

    If an IN_PROGRESS attempt already exists for this token+test, it is
    resumed (same questions, same saved answers, remaining time recalculated).

    Returns questions with MCQ options shuffled (correct_answer stripped).
    """
    ip = request.client.host if request.client else None
    return await attempt_service.start_attempt(
        token=req.token,
        test_index=req.test_index,
        ip_address=ip,
        db=db,
    )


# ─── Token guard for attempt-specific routes ──────────────────

async def _verify_attempt_token(
    x_attempt_token: Annotated[str | None, Header()] = None,
) -> str:
    """
    Dependency: require X-Attempt-Token header on all attempt routes
    that go beyond /start. This is the raw magic link token — we verify
    it belongs to this attempt inside each service call.
    """
    if x_attempt_token is None:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=401,
            detail="Missing X-Attempt-Token header.",
        )
    return x_attempt_token


AttemptToken = Annotated[str, Depends(_verify_attempt_token)]


# ─── State (resume) ───────────────────────────────────────────

@router.get(
    "/{attempt_id}/state",
    response_model=AttemptStateResponse,
    summary="Get current attempt state (for page-refresh resume)",
)
@limiter.limit("30/minute")
async def get_state(
    request: Request,
    attempt_id: str,
    token: AttemptToken,
    db: AsyncSession = Depends(get_db),
) -> AttemptStateResponse:
    return await attempt_service.get_attempt_state(attempt_id, token, db)


# ─── Autosave answer ──────────────────────────────────────────

@router.post(
    "/{attempt_id}/answer",
    response_model=SaveAnswerResponse,
    summary="Save a single answer (autosave)",
)
@limiter.limit("60/minute")
async def save_answer(
    request: Request,
    attempt_id: str,
    req: SaveAnswerRequest,
    token: AttemptToken,
    db: AsyncSession = Depends(get_db),
) -> SaveAnswerResponse:
    """
    Called automatically every 10 seconds and on every answer change.
    Idempotent — safe to call multiple times.
    If the attempt is already submitted, returns saved=false gracefully.
    """
    return await attempt_service.save_answer(attempt_id, req, token, db)


# ─── Bulk autosave ────────────────────────────────────────────

@router.post(
    "/{attempt_id}/bulk-save",
    response_model=BulkSaveResponse,
    summary="Save multiple answers in one request (autosave)",
)
@limiter.limit("30/minute")
async def bulk_save_answers(
    request: Request,
    attempt_id: str,
    req: BulkSaveRequest,
    token: AttemptToken,
    db: AsyncSession = Depends(get_db),
) -> BulkSaveResponse:
    """
    Saves all dirty answers in a single HTTP request.

    Called by the frontend autosave hook instead of N individual /answer
    calls — reduces network overhead from N round-trips to 1.
    Silently ignores an already-submitted attempt (returns saved_count=0).
    """
    count = await attempt_service.bulk_save_answers(attempt_id, req, token, db)
    return BulkSaveResponse(saved_count=count)


# ─── Heartbeat ────────────────────────────────────────────────

@router.post(
    "/{attempt_id}/heartbeat",
    response_model=HeartbeatResponse,
    summary="Sync server-side timer",
)
@limiter.limit("20/minute")
async def heartbeat(
    request: Request,
    attempt_id: str,
    req: HeartbeatRequest,
    token: AttemptToken,
    db: AsyncSession = Depends(get_db),
) -> HeartbeatResponse:
    """
    Called every 30 seconds to sync the timer.
    If force_submit=true in the response, the client must submit immediately.
    """
    return await attempt_service.heartbeat(
        attempt_id, req.client_time_remaining_seconds, token, db
    )


# ─── Submit ───────────────────────────────────────────────────

@router.post(
    "/{attempt_id}/submit",
    response_model=SubmitAttemptResponse,
    summary="Submit the test (manual or auto on timer expiry)",
)
@limiter.limit("10/minute")
async def submit_attempt(
    request: Request,
    attempt_id: str,
    req: SubmitAttemptRequest,
    token: AttemptToken,
    db: AsyncSession = Depends(get_db),
) -> SubmitAttemptResponse:
    """
    Idempotent — calling submit twice returns the same result without error.
    Pass auto_submitted=true when the timer triggered submission.
    """
    return await attempt_service.submit_attempt(attempt_id, req, token, db)


# ─── Suspicious event ─────────────────────────────────────────

@router.post(
    "/{attempt_id}/event",
    response_model=SuspiciousEventResponse,
    summary="Log a suspicious event",
)
@limiter.limit("60/minute")
async def log_event(
    request: Request,
    attempt_id: str,
    req: SuspiciousEventRequest,
    token: AttemptToken,
    db: AsyncSession = Depends(get_db),
) -> SuspiciousEventResponse:
    """
    Silently logs integrity events for admin review.
    Never returns an error to avoid interrupting the candidate.
    """
    return await attempt_service.log_suspicious_event(attempt_id, req, token, db)


# ─── Terminate (hard integrity enforcement) ───────────────────

@router.post(
    "/{attempt_id}/terminate",
    response_model=TerminateAttemptResponse,
    summary="Hard-terminate this attempt and its invitation on an integrity violation",
)
@limiter.limit("10/minute")
async def terminate_attempt(
    request: Request,
    attempt_id: str,
    req: TerminateAttemptRequest,
    token: AttemptToken,
    db: AsyncSession = Depends(get_db),
) -> TerminateAttemptResponse:
    """
    Called by the candidate exam page on the first serious integrity
    violation (tab switch, window blur, leaving the exam window). Ends this
    attempt AND its parent invitation, blocking every remaining test in the
    invitation. Idempotent — safe to retry on network failure.
    """
    return await attempt_service.terminate_attempt(attempt_id, req, token, db)
