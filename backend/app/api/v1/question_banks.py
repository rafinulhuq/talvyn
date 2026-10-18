"""
Question bank API endpoints (Master Prompt 2) — admin/job side.

Mounted at /api/v1/jd/{jd_id}/question-bank — "jd_id" is this codebase's
existing identifier for what Master Prompt 2 calls a "job post" (see
JobDescription model); no new "jobs" resource was introduced to avoid
duplicating an identifier that already means the same thing.

All endpoints require X-Internal-Token (admin-only via Next.js), matching
every other admin-facing router in this codebase.
"""

import asyncio
import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.db.session import get_db
from app.dependencies import CurrentActor, owner_scope_for
from app.schemas.exam import (
    BankStatusResponse,
    GenerateBankRequest,
    ReviewBankRequest,
    UpdateBankConfigRequest,
)
from app.services import jd_service, question_bank_service

logger = get_logger(__name__)
router = APIRouter()


@router.post(
    "/generate",
    status_code=202,
    summary="Queue background generation of a reusable question bank for this job (Master Prompt 2)",
    responses={
        202: {"description": "Generation queued — poll GET .../question-bank/status"},
        409: {"description": "A bank already exists, or QUESTION_BANK_MODE is disabled"},
        404: {"description": "JD has no extracted skills yet — run /analyze first"},
    },
)
async def generate_bank(
    request: Request,
    jd_id: str,
    req: GenerateBankRequest,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> BankStatusResponse:
    """
    Creates the bank row (status=GENERATING) immediately, then queues the
    actual generation of 3 section Tests (REASONING / PRACTICAL / TECHNICAL)
    as an ARQ background job — each section is built up from many small
    batches until the configured target (or commercial default) is reached.
    Requires QUESTION_BANK_MODE=true.

    Returns 202 right away; poll GET .../question-bank/status for progress.
    Generation used to run synchronously inside this request (20-40+
    minutes) — far longer than any browser/proxy timeout could reasonably
    cover, and a client that gave up got no signal the backend was still
    working. This mirrors the same enqueue pattern as /tests/generate.
    """
    await jd_service.get_jd_orm(jd_id, db, owner_id=owner_scope_for(actor))
    bank = await question_bank_service.start_bank_generation(
        jd_id, db, mcq_target=req.mcq_target, cq_target=req.cq_target
    )
    await request.app.state.arq_pool.enqueue_job("task_generate_bank", jd_id)
    logger.info("Question bank generation queued", jd_id=jd_id, bank_id=bank.id)

    status = await question_bank_service.get_bank_status(jd_id, db)
    return BankStatusResponse(**status)


@router.post(
    "/regenerate",
    status_code=202,
    summary="Archive the current bank and queue a fresh one in the background",
    responses={
        202: {"description": "Regeneration queued — poll GET .../question-bank/status"},
        409: {"description": "QUESTION_BANK_MODE is disabled"},
        404: {"description": "JD has no extracted skills yet — run /analyze first"},
    },
)
async def regenerate_bank(
    request: Request,
    jd_id: str,
    req: GenerateBankRequest,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> BankStatusResponse:
    """Same async pattern as /generate — see its docstring."""
    await jd_service.get_jd_orm(jd_id, db, owner_id=owner_scope_for(actor))
    bank = await question_bank_service.start_bank_regeneration(
        jd_id, db, mcq_target=req.mcq_target, cq_target=req.cq_target
    )
    await request.app.state.arq_pool.enqueue_job("task_generate_bank", jd_id)
    logger.info("Question bank regeneration queued", jd_id=jd_id, bank_id=bank.id)

    status = await question_bank_service.get_bank_status(jd_id, db)
    return BankStatusResponse(**status)


@router.get(
    "/progress",
    summary="Real-time bank generation progress for a JD (single snapshot)",
)
async def get_generation_progress(
    jd_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> dict:
    # Owner check: don't leak another operator's generation progress by jd_id.
    await jd_service.get_jd_orm(jd_id, db, owner_id=owner_scope_for(actor))
    return await question_bank_service.get_progress(jd_id)


@router.get(
    "/progress/stream",
    summary="Server-Sent Events stream of bank generation progress",
)
async def stream_generation_progress(
    jd_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    # Verify ownership once before opening the stream (raises 404 if not owned).
    await jd_service.get_jd_orm(jd_id, db, owner_id=owner_scope_for(actor))
    """
    Same SSE shape as GET /tests/progress/{jd_id}/stream: pushes a snapshot
    every 2 seconds until pct >= 100, then closes.

    Event format:  data: {"step": "...", "pct": 0-100, "detail": "..."}\n\n
    """

    async def event_generator():
        try:
            while True:
                progress = await question_bank_service.get_progress(jd_id)
                yield f"data: {json.dumps(progress)}\n\n"
                if progress.get("pct", 0) >= 100:
                    break
                await asyncio.sleep(2)
        except asyncio.CancelledError:
            pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.get(
    "",
    summary="Get the current question bank status and per-section counts",
)
async def get_bank(
    jd_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> BankStatusResponse:
    await jd_service.get_jd_orm(jd_id, db, owner_id=owner_scope_for(actor))
    status = await question_bank_service.get_bank_status(jd_id, db)
    return BankStatusResponse(**status)


@router.get(
    "/status",
    summary="Lightweight bank readiness check (alias of GET /question-bank)",
)
async def get_bank_status(
    jd_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> BankStatusResponse:
    await jd_service.get_jd_orm(jd_id, db, owner_id=owner_scope_for(actor))
    status = await question_bank_service.get_bank_status(jd_id, db)
    return BankStatusResponse(**status)


@router.post(
    "/review",
    summary="Admin reviews and approves a READY bank, making it assignable",
)
async def review_bank(
    jd_id: str,
    req: ReviewBankRequest,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> BankStatusResponse:
    """
    Human-in-the-loop approval — NOT an automated LLM quality pass (see
    question_bank_service.review_bank docstring for why that's deferred).
    """
    await jd_service.get_jd_orm(jd_id, db, owner_id=owner_scope_for(actor))
    bank = await question_bank_service.get_bank_for_jd(jd_id, db)
    if bank is None:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("QuestionBank", jd_id)

    await question_bank_service.review_bank(bank.id, db, reviewer_model=req.reviewer_model)
    status = await question_bank_service.get_bank_status(jd_id, db)
    return BankStatusResponse(**status)


@router.patch(
    "/config",
    summary="Update per-job exam config (section weights, bank size targets)",
)
async def update_bank_config(
    jd_id: str,
    req: UpdateBankConfigRequest,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Persists overrides to JobDescription.exam_config_json — read by
    scoring_service for section weights, and by question_bank_service the
    next time a bank is (re)generated for mcq/cq targets.
    """
    from sqlalchemy import select

    from app.core.exceptions import NotFoundError
    from app.db.models.job_description import JobDescription

    stmt = select(JobDescription).where(JobDescription.id == jd_id)
    _owner = owner_scope_for(actor)
    if _owner is not None:
        stmt = stmt.where(JobDescription.uploaded_by == _owner)
    result = await db.execute(stmt)
    jd = result.scalar_one_or_none()
    if jd is None:
        raise NotFoundError("JobDescription", jd_id)

    config = dict(jd.exam_config_json or {})
    if req.mcq_target is not None:
        config["mcq_target"] = req.mcq_target
    if req.cq_target is not None:
        config["cq_target"] = req.cq_target
    if req.section_weights is not None:
        config["section_weights"] = req.section_weights
    jd.exam_config_json = config

    await db.commit()
    logger.info("Exam config updated", jd_id=jd_id, config=config)
    return {"jd_id": jd_id, "exam_config_json": config}
