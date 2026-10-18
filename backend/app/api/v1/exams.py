"""
Sectioned exam API endpoints (Master Prompt 2) — candidate side.

Mounted at /api/v1/candidate-exams. Mirrors attempts.py's auth model:
  - /start validates the magic-link token from the request body (public)
  - every other route requires X-Attempt-Token, the same raw token,
    verified against the owning invitation per request

Known deviation from Master Prompt 2's literal route shapes: the prompt
specifies POST /candidate/exams/:jobId/start, but this codebase's candidate
flow has never put job/JD identifiers in candidate-facing URLs — the token
alone identifies the invitation (and therefore the job) via
exam_attempt_service.create_or_resume_exam_for_token. Introducing a jobId
path param here would either duplicate that lookup or require trusting an
unauthenticated path segment, so /start takes the token in the body instead.

Not yet wired into the Next.js candidate proxy allowlist
(/api/candidate/[...path] currently only forwards /api/v1/attempts/*) —
see deliverables doc, "Known limitations".
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.core.ratelimit import limiter
from app.db.models.enums import TestType
from app.db.session import get_db
from app.schemas.attempt import SubmitAttemptRequest
from app.schemas.exam import (
    ExamSectionResponse,
    ExamStatusResponse,
    ExamSubmitResponse,
    SectionSubmitResponse,
    StartExamRequest,
)
from app.services import exam_attempt_service

logger = get_logger(__name__)
router = APIRouter()


async def _verify_attempt_token(
    x_attempt_token: Annotated[str | None, Header()] = None,
) -> str:
    if x_attempt_token is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Missing X-Attempt-Token header.")
    return x_attempt_token


AttemptToken = Annotated[str, Depends(_verify_attempt_token)]


@router.post(
    "/start",
    response_model=ExamSectionResponse,
    status_code=201,
    summary="Start (or resume) a candidate's sectioned exam",
)
@limiter.limit("10/minute")
async def start_exam(
    req: StartExamRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ExamSectionResponse:
    """
    Validates the magic-link token, assigns locked questions from the JD's
    question bank on first call (idempotent on retry), and returns the
    candidate's current (or first) section.
    """
    exam_attempt = await exam_attempt_service.create_or_resume_exam_for_token(req.token, db)
    return await exam_attempt_service.start_or_resume_current_section(
        exam_attempt.id, req.token, db
    )


@router.get(
    "/{exam_attempt_id}/current",
    response_model=ExamSectionResponse,
    summary="Get the current section (for page-refresh resume)",
)
async def get_current_section(
    exam_attempt_id: str,
    token: AttemptToken,
    db: AsyncSession = Depends(get_db),
) -> ExamSectionResponse:
    return await exam_attempt_service.start_or_resume_current_section(exam_attempt_id, token, db)


@router.post(
    "/{exam_attempt_id}/section/{section_type}/submit",
    response_model=SectionSubmitResponse,
    summary="Submit one section and advance to the next",
)
@limiter.limit("10/minute")
async def submit_section(
    exam_attempt_id: str,
    section_type: TestType,
    req: SubmitAttemptRequest,
    request: Request,
    token: AttemptToken,
    db: AsyncSession = Depends(get_db),
) -> SectionSubmitResponse:
    """
    Idempotent per-section submit. Section evaluation is queued in the
    background (never run synchronously here) — see worker.task_evaluate_section_attempt.
    """
    return await exam_attempt_service.submit_section(exam_attempt_id, section_type, req, token, db)


@router.post(
    "/{exam_attempt_id}/submit",
    response_model=ExamSubmitResponse,
    summary="Confirm final submission once every section is submitted",
)
async def submit_exam(
    exam_attempt_id: str,
    token: AttemptToken,
    db: AsyncSession = Depends(get_db),
) -> ExamSubmitResponse:
    exam_attempt = await exam_attempt_service.submit_exam(exam_attempt_id, token, db)
    return ExamSubmitResponse(
        exam_attempt_id=exam_attempt.id,
        exam_status=exam_attempt.status.value,
        submitted_at=exam_attempt.submitted_at,
    )


@router.get(
    "/{exam_attempt_id}/status",
    response_model=ExamStatusResponse,
    summary="Get exam-level status and scores (once evaluated)",
)
async def get_exam_status(
    exam_attempt_id: str,
    token: AttemptToken,
    db: AsyncSession = Depends(get_db),
) -> ExamStatusResponse:
    return await exam_attempt_service.get_status(exam_attempt_id, token, db)
