"""
Test and Question API endpoints.

POST   /api/v1/tests/generate/{jd_id}          Generate 3 tests for a JD
GET    /api/v1/tests/jd/{jd_id}                List tests for a JD (summaries)
GET    /api/v1/tests/{test_id}                 Get full test with questions
PATCH  /api/v1/tests/{test_id}                 Update test metadata
POST   /api/v1/tests/{test_id}/status          Approve / revert / archive
POST   /api/v1/tests/{test_id}/regenerate      Regenerate this one test slot
DELETE /api/v1/tests/{test_id}                 Delete test + questions
POST   /api/v1/tests/bulk-delete               Delete several tests at once

PATCH  /api/v1/tests/questions/{question_id}   Edit a question
DELETE /api/v1/tests/questions/{question_id}   Delete a question
POST   /api/v1/tests/{test_id}/questions/bulk-delete   Delete several questions at once

Delete endpoints accept `?force=true` (or `force` in the bulk-delete body).
Without it, deleting a question already locked into a candidate's exam
attempt is blocked with 409 QUESTIONS_IN_USE instead of silently cascading
that candidate's record away — see test_service.get_in_use_question_ids.
"""

import asyncio
import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AIResponseParseError, AIServiceError
from app.core.logging import get_logger
from app.core.ratelimit import limiter
from app.db.session import get_db
from app.dependencies import CurrentActor, owner_scope_for
from app.schemas.jd import AsyncJobAcceptedResponse
from app.schemas.test import (
    ApproveTestRequest,
    BulkDeleteQuestionsRequest,
    BulkDeleteTestsRequest,
    GenerateTestsRequest,
    QuestionResponse,
    TestResponse,
    TestSummaryResponse,
    UpdateQuestionRequest,
    UpdateTestRequest,
)
from app.services import jd_service, test_service

logger = get_logger(__name__)
router = APIRouter()


# ─── Generation ───────────────────────────────────────────────

@router.post(
    "/generate/{jd_id}",
    response_model=AsyncJobAcceptedResponse,
    status_code=202,
    summary="Start background test generation for an analyzed JD",
    responses={
        202: {"description": "Generation queued — poll /api/v1/jd/{jd_id}/status"},
        409: {"description": "JD has not been analyzed yet"},
        404: {"description": "JD not found"},
    },
)
@limiter.limit("3/minute")
async def generate_tests(
    request: Request,
    jd_id: str,
    body: GenerateTestsRequest,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> AsyncJobAcceptedResponse:
    """
    Queue AI test generation for a JD that has been analyzed.

    - Returns 202 immediately; all 3 tests are generated in the background.
    - Requires the JD to have extracted skill data (run /analyze first).
    - Poll GET /api/v1/jd/{jd_id}/status until generation_status == READY.
      FAILED means an error occurred — check server logs.
    - Calling this again while GENERATING is a no-op guard (status stays GENERATING).
    """
    from sqlalchemy import select as sa_select
    from sqlalchemy.orm import selectinload

    from app.db.models.enums import GenerationStatus
    from app.db.models.job_description import JobDescription

    # Load JD with extracted data to validate pre-conditions (fast, no Ollama)
    jd_stmt = (
        sa_select(JobDescription)
        .options(selectinload(JobDescription.extracted_data))
        .with_for_update()
        .where(JobDescription.id == jd_id)
    )
    _owner = owner_scope_for(actor)
    if _owner is not None:
        jd_stmt = jd_stmt.where(JobDescription.uploaded_by == _owner)
    result = await db.execute(jd_stmt)
    jd = result.scalar_one_or_none()
    if jd is None:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("JobDescription", jd_id)

    if jd.extracted_data is None:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=409,
            detail=(
                "JD has not been analyzed yet. "
                f"Run POST /api/v1/jd/{jd_id}/analyze first."
            ),
        )

    # Guard: don't re-queue if already running
    if jd.generation_status == GenerationStatus.GENERATING:
        return AsyncJobAcceptedResponse(
            jd_id=jd_id,
            generation_status=GenerationStatus.GENERATING,
            message=f"Test generation is already in progress. Poll /api/v1/jd/{jd_id}/status.",
        )

    # Claim the JD before enqueueing so rapid double-clicks/retries cannot
    # queue multiple long-running jobs for the same JD. The worker only runs
    # jobs whose JD is already in GENERATING, so stale queued jobs are harmless.
    jd.generation_status = GenerationStatus.GENERATING
    jd.generation_error = None
    await db.commit()

    do = body.difficulty_distribution
    try:
        await request.app.state.arq_pool.enqueue_job(
            "task_generate_tests",
            jd_id,
            do.model_dump() if do else None,
        )
    except Exception:
        await db.refresh(jd)
        jd.generation_status = GenerationStatus.FAILED
        jd.generation_error = "Could not queue test generation. Please try again."
        await db.commit()
        raise

    logger.info("Test generation queued", jd_id=jd_id)

    return AsyncJobAcceptedResponse(
        jd_id=jd_id,
        generation_status=GenerationStatus.GENERATING,
        message=f"Test generation started. Poll GET /api/v1/jd/{jd_id}/status for progress.",
    )


# ─── Cancel generation ────────────────────────────────────────

@router.post(
    "/cancel/{jd_id}",
    status_code=200,
    summary="Cancel an in-progress test generation and reset to IDLE",
)
async def cancel_generation(
    jd_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Reset a JD's generation_status from GENERATING back to IDLE so the admin
    can retry without waiting for a stuck job or a server restart.

    The background task may still be running — this only marks the DB status.
    Draft tests created so far are deleted so generation starts fresh on retry.
    If the running task finishes afterwards, it detects that generation_status
    is no longer GENERATING and discards its results instead of overwriting
    this cancellation (see generate_tests_background).
    """
    from sqlalchemy import delete as sa_delete
    from sqlalchemy import select as sa_select

    from app.core.exceptions import NotFoundError
    from app.db.models.enums import GenerationStatus, TestStatus
    from app.db.models.job_description import JobDescription
    from app.db.models.test import Test

    cancel_stmt = sa_select(JobDescription).where(JobDescription.id == jd_id)
    _owner = owner_scope_for(actor)
    if _owner is not None:
        cancel_stmt = cancel_stmt.where(JobDescription.uploaded_by == _owner)
    result = await db.execute(cancel_stmt)
    jd = result.scalar_one_or_none()
    if jd is None:
        raise NotFoundError("JobDescription", jd_id)

    # Delete DRAFT tests that may have been partially created
    await db.execute(
        sa_delete(Test).where(
            Test.jd_id == jd_id,
            Test.status == TestStatus.DRAFT,
        )
    )

    jd.generation_status = GenerationStatus.IDLE
    await db.commit()

    logger.info("Generation cancelled by admin", jd_id=jd_id)
    return {"jd_id": jd_id, "generation_status": "IDLE", "message": "Generation cancelled."}


# ─── List ─────────────────────────────────────────────────────

@router.get(
    "/jd/{jd_id}",
    response_model=list[TestSummaryResponse],
    summary="List all tests for a JD",
)
async def list_tests(
    jd_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> list[TestSummaryResponse]:
    return await test_service.list_tests_for_jd(
        jd_id, db, owner_id=owner_scope_for(actor)
    )


# ─── Generation progress ─────────────────────────────────────
# IMPORTANT: must be registered before /{test_id} to avoid the
# parameterized route catching /progress/<jd_id>.

@router.get(
    "/progress/{jd_id}",
    summary="Real-time generation progress for a JD (single snapshot)",
)
async def get_generation_progress(
    jd_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> dict:
    # Owner check: don't leak another operator's generation progress by jd_id.
    await jd_service.get_jd_orm(jd_id, db, owner_id=owner_scope_for(actor))
    from app.services.test_generation_service import get_progress
    return await get_progress(jd_id)


@router.get(
    "/progress/{jd_id}/stream",
    summary="Server-Sent Events stream of generation progress",
)
async def stream_generation_progress(
    jd_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """
    SSE endpoint that pushes progress updates every 2 seconds until pct >= 100.
    The client connects once and receives real-time updates — no polling needed.

    Event format:  data: {"step": "...", "pct": 0-100, "detail": "..."}\n\n
    Terminal event: data: {"step": "done", "pct": 100, "detail": ""}\n\n

    The X-Accel-Buffering: no header disables Nginx response buffering so
    events reach the browser immediately (required when Nginx sits in front).
    """
    # Verify ownership once before opening the stream (raises 404 if not owned).
    await jd_service.get_jd_orm(jd_id, db, owner_id=owner_scope_for(actor))
    from app.services.test_generation_service import get_progress

    async def event_generator():
        try:
            while True:
                progress = await get_progress(jd_id)
                payload = json.dumps(progress)
                yield f"data: {payload}\n\n"

                if progress.get("pct", 0) >= 100:
                    break

                await asyncio.sleep(2)
        except asyncio.CancelledError:
            # Client disconnected — stop silently
            pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # disable Nginx buffering
            "Connection": "keep-alive",
        },
    )


# ─── Get single test ──────────────────────────────────────────

@router.get(
    "/{test_id}",
    response_model=TestResponse,
    summary="Get a single test with all questions",
)
async def get_test(
    test_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> TestResponse:
    return await test_service.get_test(
        test_id, db, owner_id=owner_scope_for(actor)
    )


# ─── Update test metadata ─────────────────────────────────────

@router.patch(
    "/{test_id}",
    response_model=TestResponse,
    summary="Update test title, description, duration, or difficulty",
)
async def update_test(
    test_id: str,
    req: UpdateTestRequest,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> TestResponse:
    await test_service.assert_test_owner(test_id, db, owner_scope_for(actor))
    return await test_service.update_test_metadata(test_id, req, db)


# ─── Approve / status change ──────────────────────────────────

@router.post(
    "/{test_id}/status",
    response_model=TestResponse,
    summary="Set test status (APPROVED / DRAFT / ARCHIVED)",
)
async def set_status(
    test_id: str,
    req: ApproveTestRequest,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> TestResponse:
    await test_service.assert_test_owner(test_id, db, owner_scope_for(actor))
    return await test_service.set_test_status(test_id, req, db)


# ─── Regenerate single test ───────────────────────────────────

@router.post(
    "/{test_id}/regenerate",
    response_model=TestResponse,
    summary="Regenerate questions for a single test slot",
)
async def regenerate_test(
    test_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
):
    """
    Regenerate one test, leaving the other two untouched.
    The test type stays the same; questions are replaced.
    Status resets to DRAFT.
    """
    await test_service.assert_test_owner(test_id, db, owner_scope_for(actor))
    # Get the JD id from the test record
    from sqlalchemy import select as sa_select

    from app.db.models.test import Test as TestModel
    t_result = await db.execute(
        sa_select(TestModel.jd_id).where(TestModel.id == test_id)
    )
    jd_id = t_result.scalar_one_or_none()
    if jd_id is None:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("Test", test_id)

    try:
        return await test_service.trigger_regenerate_single(test_id, jd_id, db)
    except (AIServiceError, AIResponseParseError) as exc:
        error_code = (
            "AI_SERVICE_UNAVAILABLE"
            if isinstance(exc, AIServiceError)
            else "AI_PARSE_ERROR"
        )
        status_code = 503 if isinstance(exc, AIServiceError) else 502
        return JSONResponse(
            status_code=status_code,
            content={"error": {"code": error_code, "message": str(exc)}},
        )


# ─── Delete test ──────────────────────────────────────────────

def _in_use_conflict(in_use_question_ids: list[str]) -> JSONResponse:
    """Standard 409 body when a delete is blocked by already-assigned
    questions. `details.in_use_question_ids` lets the frontend show which
    ones, and resubmit with force=true if the admin wants to proceed."""
    return JSONResponse(
        status_code=409,
        content={
            "success": False,
            "error": {
                "code": "QUESTIONS_IN_USE",
                "message": (
                    f"{len(in_use_question_ids)} question(s) already assigned to a "
                    "candidate's exam attempt. Pass force=true to delete anyway."
                ),
                "details": {"in_use_question_ids": in_use_question_ids},
            },
        },
    )


@router.post(
    "/bulk-delete",
    summary="Delete several tests (and their questions) at once",
    responses={409: {"description": "A question in one of these tests is already assigned to a candidate"}},
)
async def bulk_delete_tests(
    req: BulkDeleteTestsRequest,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> dict:
    outcome = await test_service.bulk_delete_tests(
        req.test_ids, db, force=req.force, owner_id=owner_scope_for(actor)
    )
    if not outcome.deleted:
        return _in_use_conflict(outcome.in_use_question_ids)
    return {"deleted_count": outcome.deleted_count}


@router.delete(
    "/{test_id}",
    status_code=204,
    summary="Delete a test and its questions",
    responses={409: {"description": "A question in this test is already assigned to a candidate"}},
)
async def delete_test(
    test_id: str,
    actor: CurrentActor,
    force: bool = False,
    db: AsyncSession = Depends(get_db),
):
    await test_service.assert_test_owner(test_id, db, owner_scope_for(actor))
    outcome = await test_service.delete_test(test_id, db, force=force)
    if not outcome.deleted:
        return _in_use_conflict(outcome.in_use_question_ids)
    return None


# ─── Question CRUD ────────────────────────────────────────────

@router.patch(
    "/questions/{question_id}",
    response_model=QuestionResponse,
    summary="Edit a single question",
)
async def update_question(
    question_id: str,
    req: UpdateQuestionRequest,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> QuestionResponse:
    await test_service.assert_question_owner(question_id, db, owner_scope_for(actor))
    return await test_service.update_question(question_id, req, db)


@router.delete(
    "/questions/{question_id}",
    status_code=204,
    summary="Delete a single question",
    responses={409: {"description": "Question is already assigned to a candidate"}},
)
async def delete_question(
    question_id: str,
    actor: CurrentActor,
    force: bool = False,
    db: AsyncSession = Depends(get_db),
):
    await test_service.assert_question_owner(question_id, db, owner_scope_for(actor))
    outcome = await test_service.delete_question(question_id, db, force=force)
    if not outcome.deleted:
        return _in_use_conflict(outcome.in_use_question_ids)
    return None


@router.post(
    "/{test_id}/questions/bulk-delete",
    summary="Delete several questions from one test at once",
    responses={409: {"description": "One or more questions are already assigned to a candidate"}},
)
async def bulk_delete_questions(
    test_id: str,
    req: BulkDeleteQuestionsRequest,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> dict:
    await test_service.assert_test_owner(test_id, db, owner_scope_for(actor))
    outcome = await test_service.bulk_delete_questions(
        test_id, req.question_ids, db, force=req.force
    )
    if not outcome.deleted:
        return _in_use_conflict(outcome.in_use_question_ids)
    return {"deleted_count": outcome.deleted_count}
