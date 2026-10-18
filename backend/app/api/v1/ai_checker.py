"""Standalone AI Checker endpoints for admins."""

from fastapi import APIRouter, Depends, File, Request, UploadFile, status

from app.config import Settings, get_settings
from app.core.exceptions import AIServiceError, NotFoundError, ValidationError
from app.core.ratelimit import limiter
from app.dependencies import VerifiedInternal
from app.schemas.ai_checker import (
    AICheckJobAcceptedResponse,
    AICheckJobStatusResponse,
    AICheckRequest,
    AICheckResponse,
    ExtractedTextResponse,
)
from app.services import ai_checker_service, parser_service
from app.services.ai_detection_service import estimate_document_ai_likeness
from app.utils.file_validators import validate_upload

router = APIRouter()


@router.post(
    "/check",
    response_model=AICheckResponse,
    summary="Estimate AI-likeness for pasted or extracted document text",
)
@limiter.limit("10/minute")
async def check_document_ai_likeness(
    req: AICheckRequest,
    request: Request,
    _auth: VerifiedInternal,
) -> AICheckResponse:
    # Synchronous, GPU/CPU-heavy analysis reachable via the authenticated proxy
    # by any signed-in user — rate-limit per user so it can't be used for
    # compute exhaustion. (The module's other Ollama routes are already limited.)
    result = await estimate_document_ai_likeness(req.text, title=req.title)
    if result is None:
        raise AIServiceError(
            "AI checker could not analyze this text. Confirm the analysis service is running and try again."
        )

    return AICheckResponse(
        estimated_ai_percentage=result.estimated_ai_percentage,
        confidence=result.confidence,
        suspicious_phrases=result.suspicious_phrases,
        explanation=result.explanation,
        recommendation=result.recommendation,
        chunks_analyzed=result.chunks_analyzed,
        word_count=result.word_count,
        character_count=result.character_count,
    )


@router.post(
    "/jobs",
    response_model=AICheckJobAcceptedResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Queue an AI-likeness check for pasted or extracted document text",
)
@limiter.limit("10/minute")
async def queue_document_ai_likeness_check(
    req: AICheckRequest,
    request: Request,
    _auth: VerifiedInternal,
) -> AICheckJobAcceptedResponse:
    """
    Queue the long writing analysis in ARQ instead of holding a browser request
    open. This avoids Vercel/proxy/network timeouts for larger documents.
    """
    if not hasattr(request.app.state, "arq_pool"):
        raise AIServiceError("AI checker worker queue is unavailable.")

    try:
        job_id = await ai_checker_service.create_check_job()
    except RuntimeError as exc:
        raise AIServiceError(str(exc)) from exc

    await request.app.state.arq_pool.enqueue_job(
        "task_check_ai_document",
        job_id,
        req.text,
        req.title,
    )

    return AICheckJobAcceptedResponse(
        job_id=job_id,
        detail="AI checker job queued. Poll the job status endpoint for results.",
    )


@router.get(
    "/jobs/{job_id}",
    response_model=AICheckJobStatusResponse,
    summary="Read the status/result for a queued AI-likeness check",
)
async def get_document_ai_likeness_job(
    job_id: str,
    _auth: VerifiedInternal,
) -> AICheckJobStatusResponse:
    try:
        job = await ai_checker_service.get_check_job(job_id)
    except RuntimeError as exc:
        raise AIServiceError(str(exc)) from exc
    if not job:
        raise NotFoundError("AI checker job", job_id)
    return AICheckJobStatusResponse(**job)


@router.post(
    "/extract",
    response_model=ExtractedTextResponse,
    summary="Server-side PDF/DOCX text extraction fallback for the AI Checker",
)
@limiter.limit("10/minute")
async def extract_text_fallback(
    request: Request,
    _auth: VerifiedInternal,
    file: UploadFile = File(...),
    settings: Settings = Depends(get_settings),
) -> ExtractedTextResponse:
    """
    The AI Checker normally extracts PDF/DOCX text in the browser via the
    same WASM parser used for JD upload. That parser's contract is "return
    null and let the caller fall back to server-side parsing" — JD upload
    honors that with a PyMuPDF/python-docx fallback; this endpoint gives the
    AI Checker the same fallback instead of hard-failing on files the
    browser parser can't handle (complex PDFs, certain DOCX structures).
    Ephemeral only — no DB write, no file storage, unlike /jd/upload.
    """
    if not file.filename:
        raise ValidationError("No filename provided.")

    content = await file.read()
    if not content:
        raise ValidationError("Uploaded file is empty.")

    file_type = validate_upload(
        filename=file.filename,
        content=content,
        max_size_bytes=settings.max_upload_size_bytes,
    )

    try:
        text = parser_service.extract_text(content, file_type)
    except parser_service.ParseError as exc:
        raise ValidationError(str(exc), error_code="PARSE_ERROR") from exc

    return ExtractedTextResponse(text=text)
