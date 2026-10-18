"""
Job Description API endpoints.

POST   /api/v1/jd/upload          Upload PDF/DOCX, extract text, save to DB
GET    /api/v1/jd/                 List all JDs (paginated)
GET    /api/v1/jd/{jd_id}          Get JD detail with extracted data
GET    /api/v1/jd/{jd_id}/status   Poll parse status (lightweight)
DELETE /api/v1/jd/{jd_id}          Delete JD and file from storage

Security: all endpoints require X-Internal-Token header.
The uploader_id is passed as X-Uploader-Id header, set by
the Next.js server using the verified NextAuth session.
"""

from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    Request,
    UploadFile,
)
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.core.exceptions import AppException
from app.core.logging import get_logger
from app.core.ratelimit import limiter
from app.db.session import get_db
from app.dependencies import CurrentActor, VerifiedInternal, owner_scope_for
from app.schemas.jd import (
    AsyncJobAcceptedResponse,
    GenerateJdRequest,
    GenerateJdResponse,
    JdParseStatusResponse,
    JdUploadResponse,
    JobDescriptionListResponse,
    JobDescriptionResponse,
    UpdateJdTextRequest,
)
from app.services import jd_service

logger = get_logger(__name__)
router = APIRouter()

# Placeholder UUID used when no session is attached, dev/testing only.
# Production requests should include X-Uploader-Id from the Next.js server.
_DEV_UPLOADER_ID = "00000000-0000-0000-0000-000000000000"


# ─── Upload ───────────────────────────────────────────────────

@router.post(
    "/upload",
    response_model=JdUploadResponse,
    status_code=201,
    summary="Upload a PDF or DOCX job description",
)
@limiter.limit("10/minute")
async def upload_jd(
    request: Request,
    _auth: VerifiedInternal,
    file: UploadFile = File(...),
    extracted_text: Annotated[str | None, Form()] = None,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    x_uploader_id: Annotated[str | None, Header()] = None,
) -> JdUploadResponse:
    """
    Upload a job description file.

    - File is validated by jd_service.create_jd
    - File is stored with a safe UUID filename
    - DB record is created with status PENDING
    - If the browser already extracted text client-side (WASM PDF/DOCX
      parser), `extracted_text` skips the server-side parse entirely and
      the JD is marked DONE immediately. Otherwise text extraction runs
      as a background task and the client should poll /status.
    """

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="No filename provided.",
        )

    try:
        content = await file.read()

        if not content:
            raise HTTPException(
                status_code=400,
                detail="Uploaded file is empty.",
            )

        uploader_id = x_uploader_id or _DEV_UPLOADER_ID

        jd, _file_type = await jd_service.create_jd(
            filename=file.filename,
            content=content,
            uploader_id=uploader_id,
            max_size_bytes=settings.max_upload_size_bytes,
            db=db,
        )

        finalized_client_side = False
        if extracted_text:
            finalized_client_side = await jd_service.finalize_client_extracted_jd(
                jd.id, extracted_text, db
            )

        if not finalized_client_side:
            await request.app.state.arq_pool.enqueue_job("task_parse_jd", jd.id)

        return JdUploadResponse(
            id=jd.id,
            original_filename=jd.original_filename,
            file_type=jd.file_type,
            parse_status=jd.parse_status,
        )

    except (HTTPException, AppException):
        raise

    except Exception as exc:
        logger.error(
            "JD upload failed",
            filename=file.filename,
            error=str(exc),
        )

        raise HTTPException(
            status_code=500,
            detail="Failed to upload job description.",
        )


# ─── Generate (from a brief) ──────────────────────────────────

@router.post(
    "/generate",
    response_model=GenerateJdResponse,
    status_code=202,
    summary="Generate a job description from a brief (self-hosted AI)",
)
@limiter.limit("5/minute")
async def generate_jd(
    request: Request,
    req: GenerateJdRequest,
    _auth: VerifiedInternal,
    db: AsyncSession = Depends(get_db),
    x_uploader_id: Annotated[str | None, Header()] = None,
) -> GenerateJdResponse:
    """
    Create a JD from a short brief and queue text generation.

    - Returns 202 immediately; the JD text is drafted in the background.
    - Poll GET /api/v1/jd/{jd_id}/status until generation_status is IDLE
      (success — then review/edit the text and Analyze) or FAILED.
    - The generated text is editable via PATCH /api/v1/jd/{jd_id}/text before
      analysis. Nothing is sent to candidates automatically.
    """
    uploader_id = x_uploader_id or _DEV_UPLOADER_ID
    jd = await jd_service.create_generated_jd(req, uploader_id, db)
    await request.app.state.arq_pool.enqueue_job("task_generate_jd", jd.id)
    logger.info("JD generation queued", jd_id=jd.id, title=jd.original_filename)
    return GenerateJdResponse(jd_id=jd.id, generation_status=jd.generation_status)


# ─── Edit JD text (review step) ───────────────────────────────

@router.patch(
    "/{jd_id}/text",
    response_model=JobDescriptionResponse,
    summary="Replace a JD's text (review/edit before analysis)",
)
@limiter.limit("30/minute")
async def update_jd_text(
    request: Request,
    jd_id: str,
    body: UpdateJdTextRequest,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> JobDescriptionResponse:
    """Edit a JD's text before analysis. Owner-scoped; marks parse_status DONE."""
    await jd_service.update_jd_text(
        jd_id, body.raw_text, db, owner_id=owner_scope_for(actor)
    )
    return await jd_service.get_jd_by_id(jd_id, db, include_raw_text=True)


@router.post(
    "/{jd_id}/regenerate",
    response_model=GenerateJdResponse,
    status_code=202,
    summary="Re-run generation for a generated JD (reuses the original brief)",
)
@limiter.limit("5/minute")
async def regenerate_jd(
    request: Request,
    jd_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> GenerateJdResponse:
    """
    Re-generate a JD's text from its stored brief. Owner-scoped; 409 if the JD
    was not AI-generated. Returns 202 — poll /status until generation_status is
    IDLE (success) or FAILED.
    """
    jd = await jd_service.prepare_regeneration(
        jd_id, db, owner_id=owner_scope_for(actor)
    )
    await request.app.state.arq_pool.enqueue_job("task_generate_jd", jd.id)
    logger.info("JD regeneration queued", jd_id=jd.id)
    return GenerateJdResponse(jd_id=jd.id, generation_status=jd.generation_status)


# ─── List ─────────────────────────────────────────────────────

@router.get(
    "/",
    response_model=JobDescriptionListResponse,
    summary="List all job descriptions paginated",
)
async def list_jds(
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> JobDescriptionListResponse:
    return await jd_service.list_jds(
        db,
        page=page,
        page_size=page_size,
        owner_id=owner_scope_for(actor),
    )


# ─── Get Detail ───────────────────────────────────────────────

@router.get(
    "/{jd_id}",
    response_model=JobDescriptionResponse,
    summary="Get job description detail",
)
async def get_jd(
    jd_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
    include_raw_text: bool = Query(
        default=False,
        description="Set true to include full extracted text in response",
    ),
) -> JobDescriptionResponse:
    return await jd_service.get_jd_by_id(
        jd_id,
        db,
        include_raw_text=include_raw_text,
        owner_id=owner_scope_for(actor),
    )


# ─── Parse Status ─────────────────────────────────────────────
#checks the parse status 

@router.get(
    "/{jd_id}/status",
    response_model=JdParseStatusResponse,
    summary="Poll parse status",
)
async def get_jd_status(
    jd_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> JdParseStatusResponse:
    return await jd_service.get_jd_status(
        jd_id,
        db,
        owner_id=owner_scope_for(actor),
    )


# ─── Delete ───────────────────────────────────────────────────

def _candidates_in_use_conflict(candidate_count: int) -> JSONResponse:
    """Standard 409 body when a JD delete is blocked by linked candidates.
    Pass force=true to delete anyway."""
    return JSONResponse(
        status_code=409,
        content={
            "success": False,
            "error": {
                "code": "JD_HAS_CANDIDATES",
                "message": (
                    f"{candidate_count} candidate(s) are linked to this job description. "
                    "Pass force=true to delete anyway."
                ),
                "details": {"candidate_count": candidate_count},
            },
        },
    )


@router.delete(
    "/{jd_id}",
    status_code=204,
    summary="Delete a job description and its file",
    responses={409: {"description": "Candidates are already linked to this JD"}},
)
async def delete_jd(
    jd_id: str,
    actor: CurrentActor,
    force: bool = False,
    db: AsyncSession = Depends(get_db),
):
    outcome = await jd_service.delete_jd(
        jd_id, db, force=force, owner_id=owner_scope_for(actor)
    )
    if not outcome.deleted:
        return _candidates_in_use_conflict(outcome.candidate_count)
    return None


# ─── Analyze ──────────────────────────────────────────────────

@router.post(
    "/{jd_id}/analyze",
    response_model=AsyncJobAcceptedResponse,
    status_code=202,
    summary="Start background skill extraction for a parsed JD",
    responses={
        202: {"description": "Extraction queued — poll /status for progress"},
        409: {"description": "JD text not yet parsed (parse_status != DONE)"},
        422: {"description": "JD has no text content"},
    },
)
@limiter.limit("5/minute")
async def analyze_jd(
    request: Request,
    jd_id: str,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> AsyncJobAcceptedResponse:
    """
    Queue AI skill extraction for a parsed JD.

    - Returns 202 immediately; extraction runs in the background.
    - Requires parse_status == DONE.
    - Poll GET /api/v1/jd/{jd_id}/status until generation_status is no
      longer EXTRACTING.  IDLE = success, FAILED = error.
    - Safe to call multiple times (re-extraction overwrites previous result).
    """
    from app.db.models.enums import GenerationStatus, ParseStatus

    jd = await jd_service.get_jd_orm(jd_id, db, owner_id=owner_scope_for(actor))

    if jd.parse_status != ParseStatus.DONE:
        raise HTTPException(
            status_code=409,
            detail=(
                f"JD parse_status is '{jd.parse_status.value}'. "
                "Text extraction must complete before skill extraction."
            ),
        )

    if not jd.raw_text or not jd.raw_text.strip():
        raise HTTPException(
            status_code=422,
            detail="JD has no extracted text. Re-upload and re-parse the file.",
        )

    await request.app.state.arq_pool.enqueue_job("task_extract_skills", jd_id)

    logger.info("Skill extraction queued", jd_id=jd_id)

    return AsyncJobAcceptedResponse(
        jd_id=jd_id,
        generation_status=GenerationStatus.EXTRACTING,
        message=f"Skill extraction started. Poll GET /api/v1/jd/{jd_id}/status for progress.",
    )