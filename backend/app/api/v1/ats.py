"""
ATS Checker endpoints.

Companion to the AI Checker, but a different question and a different shape:
scoring is deterministic and fast (see app/services/ats_service.py), so
there is no ARQ job, no polling endpoint, and no Redis job store — the
report comes back on the request that asked for it.

Nothing here writes to the database. A resume is analyzed in memory and
discarded; the only DB read is the optional JD lookup for keyword matching,
which is owner-scoped exactly like every other JD route.
"""

from fastapi import APIRouter, Depends, File, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.core.exceptions import ValidationError
from app.core.logging import get_logger
from app.core.ratelimit import limiter
from app.db.session import get_db
from app.dependencies import CurrentActor, VerifiedInternal, owner_scope_for
from app.schemas.ats import (
    ATSCheckRequest,
    ATSCheckResponse,
    ATSExtractedTextResponse,
)
from app.services import ats_service, jd_service, parser_service
from app.utils.file_validators import validate_upload

logger = get_logger(__name__)

router = APIRouter()

# A JD can carry a long tail of extracted skills. Matching every one of them
# would produce a "missing keywords" list nobody reads, and would drag the
# score down for skills the JD itself treats as marginal. Cap at the front of
# each list, which is the order the extractor emits them in (most important
# first).
MAX_MUST_HAVE_KEYWORDS = 25
MAX_NICE_TO_HAVE_KEYWORDS = 25


@router.post(
    "/check",
    response_model=ATSCheckResponse,
    summary="Score a resume for ATS readability, completeness, and keyword match",
)
@limiter.limit("20/minute")
async def check_resume(
    req: ATSCheckRequest,
    request: Request,
    actor: CurrentActor,
    db: AsyncSession = Depends(get_db),
) -> ATSCheckResponse:
    """
    Run the deterministic ATS analysis over resume text.

    Pass `jd_id` to also score keyword coverage against that job description's
    extracted skills, or `keywords` to supply a list by hand. With neither,
    the keyword category is skipped and the overall score is normalised over
    the remaining categories.
    """
    must_have: list[str] = []
    nice_to_have: list[str] = []
    source: str = "NONE"
    jd_title: str | None = None

    if req.jd_id:
        # Owner-scoped: raises NotFoundError (404) for a JD the actor can't
        # see, so this endpoint can't be used to probe for other tenants' JDs.
        jd = await jd_service.get_jd_orm(
            req.jd_id, db, owner_id=owner_scope_for(actor)
        )
        extracted = jd.extracted_data
        if extracted is None:
            raise ValidationError(
                "This job description has not been analyzed yet, so it has no skills to "
                "match against. Run skill extraction on it first, or check the resume "
                "without selecting a job description.",
                error_code="JD_NOT_ANALYZED",
            )
        must_have = [str(s) for s in (extracted.must_have_skills or [])][
            :MAX_MUST_HAVE_KEYWORDS
        ]
        # Tools/technologies are matched at nice-to-have weight: they are
        # genuinely relevant keywords, but the extractor already promoted the
        # ones it considered mandatory into must_have_skills.
        nice_to_have = [
            str(s)
            for s in [
                *(extracted.nice_to_have_skills or []),
                *(extracted.tools_technologies or []),
            ]
        ][:MAX_NICE_TO_HAVE_KEYWORDS]
        jd_title = extracted.job_title
        source = "JD"
    elif req.keywords:
        must_have = req.keywords[:MAX_MUST_HAVE_KEYWORDS]
        source = "MANUAL"

    result = ats_service.check_resume(
        req.text,
        filename=req.filename,
        extraction_method=req.extraction_method,
        must_have=must_have,
        nice_to_have=nice_to_have,
        keyword_source=source,  # type: ignore[arg-type]
        jd_title=jd_title,
    )

    logger.info(
        "ATS check completed",
        score=result.score,
        band=result.band,
        word_count=result.word_count,
        keyword_source=source,
    )
    return result


@router.post(
    "/extract",
    response_model=ATSExtractedTextResponse,
    summary="Server-side PDF/DOCX text extraction fallback for the ATS Checker",
)
@limiter.limit("10/minute")
async def extract_text_fallback(
    request: Request,
    _auth: VerifiedInternal,
    file: UploadFile = File(...),
    settings: Settings = Depends(get_settings),
) -> ATSExtractedTextResponse:
    """
    Extract resume text server-side when the browser's WASM parser can't.

    Unlike the AI Checker's equivalent, OCR is enabled here: a scanned resume
    is exactly the case the ATS report most needs to tell an admin about, and
    reporting "your resume has no text layer" requires getting far enough to
    know that. The extraction method is returned so the caller can pass it
    back to /check, which turns it into a critical finding.

    Ephemeral — no DB write, no file storage.
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
        result = parser_service.extract_text_detailed(content, file_type, allow_ocr=True)
    except parser_service.ParseError as exc:
        raise ValidationError(str(exc), error_code="PARSE_ERROR") from exc

    return ATSExtractedTextResponse(
        text=result.text,
        extraction_method=result.method,  # type: ignore[arg-type]
    )
