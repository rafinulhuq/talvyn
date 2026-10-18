"""
JD Service — business logic for job description lifecycle.

Route handlers in jd.py are kept thin; all DB operations and
orchestration live here so Phase 3 (skill extraction) can call
the same functions without going through HTTP.
"""

import asyncio
import math
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, NamedTuple

if TYPE_CHECKING:
    from app.schemas.jd import GenerateJdRequest

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, NotFoundError
from app.core.logging import get_logger
from app.db.models.enums import FileType, GenerationStatus, JdSource, ParseStatus
from app.db.models.job_description import JobDescription
from app.schemas.jd import (
    AnalyzeJdResponse,
    DifficultyDistributionResponse,
    JdParseStatusResponse,
    JobDescriptionListItem,
    JobDescriptionListResponse,
    JobDescriptionResponse,
)
from app.schemas.test import DifficultyOverride
from app.services.file_service import file_service
from app.services.parser_service import ParseError, clean_text, extract_text
from app.utils.file_validators import validate_upload

logger = get_logger(__name__)


# ─── Create (upload) ──────────────────────────────────────────

async def create_jd(
    *,
    filename: str,
    content: bytes,
    uploader_id: str,
    max_size_bytes: int,
    db: AsyncSession,
) -> tuple[JobDescription, FileType]:
    """
    Validate, store, and record a newly uploaded JD file.

    Returns (JobDescription ORM instance, detected FileType).
    The caller is responsible for triggering the background parse task.
    """
    extension = Path(filename).suffix.lower()

    # 1. Validate file (extension + size + magic bytes)
    file_type = validate_upload(
        filename=filename,
        content=content,
        max_size_bytes=max_size_bytes,
    )

    # 2. Persist to storage with UUID filename
    relative_path = await file_service.save_jd_file(
        content=content,
        original_filename=filename,
        extension=extension,
    )

    # 3. Create DB record
    jd = JobDescription(
        original_filename=filename,
        file_path=relative_path,
        file_type=file_type,
        parse_status=ParseStatus.PENDING,
        uploaded_by=uploader_id,
    )
    db.add(jd)
    await db.flush()   # Populate jd.id before returning
    await db.commit()

    logger.info(
        "JD created",
        jd_id=jd.id,
        filename=filename,
        file_type=file_type.value,
        size_bytes=len(content),
    )
    return jd, file_type


# ─── Client-side (WASM) text extraction ──────────────────────

async def finalize_client_extracted_jd(
    jd_id: str,
    raw_text: str,
    db: AsyncSession,
) -> bool:
    """
    Accept text already extracted in the browser (see frontend wasm-parser),
    skipping the server-side PyMuPDF/python-docx parse entirely.

    Returns True if the text was usable and the JD was marked DONE.
    Returns False if the text was empty/unusable — caller should fall back
    to enqueueing the normal server-side parse job.
    """
    cleaned = clean_text(raw_text)
    if not cleaned.strip():
        return False

    result = await db.execute(
        select(JobDescription).where(JobDescription.id == jd_id)
    )
    jd = result.scalar_one_or_none()
    if jd is None:
        raise NotFoundError("JobDescription", jd_id)

    jd.raw_text = cleaned
    jd.parse_status = ParseStatus.DONE
    await db.commit()

    logger.info(
        "JD finalized from client-side WASM extraction",
        jd_id=jd_id,
        chars=len(cleaned),
        words=len(cleaned.split()),
    )
    return True


# ─── Generated JDs (from an operator brief) ───────────────────

async def create_generated_jd(
    brief: "GenerateJdRequest",
    uploader_id: str,
    db: AsyncSession,
) -> JobDescription:
    """Create the JobDescription row for a generate request, before the text
    exists. raw_text is filled by task_generate_jd. original_filename carries
    the title (there is no file); file_path/file_type stay NULL."""
    jd = JobDescription(
        source=JdSource.GENERATED,
        original_filename=(brief.title.strip()[:255] or "Generated JD"),
        file_path=None,
        file_type=None,
        parse_status=ParseStatus.PENDING,
        generation_status=GenerationStatus.DRAFTING,
        generation_input_json=brief.model_dump(),
        uploaded_by=uploader_id,
    )
    db.add(jd)
    await db.flush()
    await db.commit()
    logger.info("Generated JD row created", jd_id=jd.id, title=jd.original_filename)
    return jd


async def generate_jd_background(jd_id: str) -> None:
    """
    Background task: generate the JD text from the stored brief.

    Status transitions:
        DRAFTING → IDLE      (success — raw_text set, parse_status=DONE)
        DRAFTING → FAILED    (on any error)

    Enqueued as "task_generate_jd" by POST /jd/generate. A generated JD needs
    no file parse, so on success parse_status is set to DONE directly.
    Opens its own DB session.
    """
    from app.db.session import AsyncSessionFactory
    from app.schemas.jd import GenerateJdRequest
    from app.services import jd_generation_service

    async with AsyncSessionFactory() as db:
        result = await db.execute(
            select(JobDescription).where(JobDescription.id == jd_id)
        )
        jd = result.scalar_one_or_none()
        if jd is None:
            logger.error("JD not found in generate_jd_background", jd_id=jd_id)
            return

        try:
            jd.generation_status = GenerationStatus.DRAFTING
            jd.generation_error = None
            await db.commit()

            if not jd.generation_input_json:
                raise ValueError("JD has no generation brief.")
            brief = GenerateJdRequest(**jd.generation_input_json)

            ai = await jd_generation_service.generate_jd(brief, db=db)
            if ai is None:
                raise ValueError("The model could not produce a valid job description.")

            jd.raw_text = jd_generation_service.render_raw_text(ai)
            jd.original_filename = (ai.title.strip()[:255] or jd.original_filename)
            jd.parse_status = ParseStatus.DONE
            jd.generation_status = GenerationStatus.IDLE
            await db.commit()
            logger.info("JD generation complete", jd_id=jd_id, chars=len(jd.raw_text or ""))
        except Exception as exc:
            logger.error("JD generation failed", jd_id=jd_id, error=str(exc))
            jd.generation_status = GenerationStatus.FAILED
            jd.generation_error = str(exc)[:500]
            await db.commit()


async def update_jd_text(
    jd_id: str,
    raw_text: str,
    db: AsyncSession,
    *,
    owner_id: str | None,
) -> JobDescription:
    """Replace a JD's raw_text (the review-edit step). Owner-scoped via
    get_jd_orm. Marks parse_status DONE so the edited text is ready to analyze."""
    jd = await get_jd_orm(jd_id, db, owner_id=owner_id)
    cleaned = clean_text(raw_text)
    if not cleaned.strip():
        raise ValueError("Job description text cannot be empty.")
    jd.raw_text = cleaned
    jd.parse_status = ParseStatus.DONE
    await db.commit()
    await db.refresh(jd)
    logger.info("JD text updated", jd_id=jd_id, chars=len(cleaned))
    return jd


async def prepare_regeneration(
    jd_id: str,
    db: AsyncSession,
    *,
    owner_id: str | None,
) -> JobDescription:
    """Reset a GENERATED JD to DRAFTING so its stored brief can be re-run.
    Owner-scoped. The caller enqueues task_generate_jd afterwards."""
    jd = await get_jd_orm(jd_id, db, owner_id=owner_id)
    if jd.source != JdSource.GENERATED or not jd.generation_input_json:
        raise ConflictError("Only AI-generated job descriptions can be regenerated.")
    jd.generation_status = GenerationStatus.DRAFTING
    jd.generation_error = None
    await db.commit()
    logger.info("JD queued for regeneration", jd_id=jd_id)
    return jd


# ─── Read ─────────────────────────────────────────────────────

async def get_jd_by_id(
    jd_id: str,
    db: AsyncSession,
    *,
    include_raw_text: bool = False,
    owner_id: str | None = None,
) -> JobDescriptionResponse:
    """
    Fetch a JD by ID. Raises NotFoundError if missing.
    raw_text is stripped unless include_raw_text=True.
    When owner_id is set, a JD owned by someone else is treated as not found
    (privacy: don't reveal that another owner's JD exists).
    """
    stmt = (
        select(JobDescription)
        .options(selectinload(JobDescription.extracted_data))
        .where(JobDescription.id == jd_id, JobDescription.deleted_at.is_(None))
    )
    if owner_id is not None:
        stmt = stmt.where(JobDescription.uploaded_by == owner_id)
    result = await db.execute(stmt)
    jd = result.scalar_one_or_none()
    if jd is None:
        raise NotFoundError("JobDescription", jd_id)

    response = JobDescriptionResponse.model_validate(jd)
    if not include_raw_text:
        response.raw_text = None
    return response


async def get_jd_orm(
    jd_id: str, db: AsyncSession, *, owner_id: str | None = None
) -> JobDescription:
    """
    Return raw ORM instance for internal use (e.g. skill extraction in Phase 3).
    Raises NotFoundError if missing. Background tasks call this without owner_id
    (unscoped); route handlers pass owner_id to enforce ownership.
    """
    stmt = (
        select(JobDescription)
        .options(selectinload(JobDescription.extracted_data))
        .where(JobDescription.id == jd_id, JobDescription.deleted_at.is_(None))
    )
    if owner_id is not None:
        stmt = stmt.where(JobDescription.uploaded_by == owner_id)
    result = await db.execute(stmt)
    jd = result.scalar_one_or_none()
    if jd is None:
        raise NotFoundError("JobDescription", jd_id)
    return jd


async def list_jds(
    db: AsyncSession,
    *,
    page: int = 1,
    page_size: int = 20,
    owner_id: str | None = None,
) -> JobDescriptionListResponse:
    """Return a paginated list of JDs with flattened extracted_data fields.
    When owner_id is set, only that owner's JDs are returned."""
    offset = (page - 1) * page_size

    filters = [JobDescription.deleted_at.is_(None)]
    if owner_id is not None:
        filters.append(JobDescription.uploaded_by == owner_id)

    count_result = await db.execute(
        select(func.count(JobDescription.id)).where(*filters)
    )
    total = count_result.scalar_one()

    result = await db.execute(
        select(JobDescription)
        .options(selectinload(JobDescription.extracted_data))
        .where(*filters)
        .order_by(JobDescription.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    jds = result.scalars().all()

    items = [
        JobDescriptionListItem(
            id=jd.id,
            uploaded_by=jd.uploaded_by,
            original_filename=jd.original_filename,
            file_type=jd.file_type,
            parse_status=jd.parse_status,
            created_at=jd.created_at,
            updated_at=jd.updated_at,
            job_title=jd.extracted_data.job_title if jd.extracted_data else None,
            seniority_level=(
                jd.extracted_data.seniority_level if jd.extracted_data else None
            ),
        )
        for jd in jds
    ]

    return JobDescriptionListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total > 0 else 0,
    )


async def get_jd_status(
    jd_id: str,
    db: AsyncSession,
    *,
    owner_id: str | None = None,
) -> JdParseStatusResponse:
    """
    Return full pipeline status for polling.

    P2-6 optimisation: only fetches the 3 status columns instead of loading
    the full JD row (which includes raw_text, potentially 50 KB+) and eagerly
    loading extracted_data via selectinload.  This endpoint is called every
    15 seconds per user during generation — keeping it as light as possible
    matters.

    DB cost: 3 tiny queries (3 columns + 2 COUNT(*)) vs the old
             2 full-row SELECTs (raw_text + all extracted JSON columns).
    """
    from app.db.models.job_description import JdExtractedData
    from app.db.models.test import Test

    # ── 1. Fetch only the columns we need ──────────────────────
    status_stmt = select(
        JobDescription.id,
        JobDescription.parse_status,
        JobDescription.generation_status,
        JobDescription.generation_error,
    ).where(JobDescription.id == jd_id)
    if owner_id is not None:
        status_stmt = status_stmt.where(JobDescription.uploaded_by == owner_id)
    status_result = await db.execute(status_stmt)
    row = status_result.one_or_none()
    if row is None:
        raise NotFoundError("JobDescription", jd_id)

    # ── 2. Has extracted data? (COUNT instead of selectinload) ─
    extracted_result = await db.execute(
        select(func.count(JdExtractedData.jd_id))
        .where(JdExtractedData.jd_id == jd_id)
    )
    has_extracted_data = (extracted_result.scalar_one() or 0) > 0

    # ── 3. Has tests? ─────────────────────────────────────────
    test_count_result = await db.execute(
        select(func.count(Test.id)).where(Test.jd_id == jd_id)
    )
    has_tests = (test_count_result.scalar_one() or 0) > 0

    return JdParseStatusResponse(
        id=row.id,
        parse_status=row.parse_status,
        generation_status=row.generation_status,
        has_extracted_data=has_extracted_data,
        has_tests=has_tests,
        error_message=row.generation_error,
    )


# ─── Delete ───────────────────────────────────────────────────

class JdDeleteOutcome(NamedTuple):
    """`deleted` is False when the JD has linked candidates and the caller
    didn't pass force=True — nothing was touched in that case."""

    deleted: bool
    candidate_count: int


async def get_jd_candidate_count(jd_id: str, db: AsyncSession) -> int:
    """Distinct candidates invited against this JD — deleting the JD
    cascades onto their invitations/tests/exam attempts (ON DELETE CASCADE),
    so callers must check this before deleting unless force=True."""
    from app.db.models.candidate import Invitation

    result = await db.execute(
        select(func.count(func.distinct(Invitation.candidate_id)))
        .where(Invitation.jd_id == jd_id)
    )
    return result.scalar_one() or 0


async def delete_jd(
    jd_id: str, db: AsyncSession, *, force: bool = False, owner_id: str | None = None
) -> JdDeleteOutcome:
    """
    Soft-delete a JD: move it to the trash (set deleted_at) instead of
    hard-deleting. The row, its file, and its related tests/invitations are
    all retained so the JD can be restored. Purging (hard delete) happens
    separately via purge_jd().

    Keeps the existing "candidates already linked" guard: without force, a JD
    that already has candidate attempts returns a conflict rather than being
    trashed silently. When owner_id is set, only that owner's JD can be deleted.
    """
    stmt = select(JobDescription).where(
        JobDescription.id == jd_id, JobDescription.deleted_at.is_(None)
    )
    if owner_id is not None:
        stmt = stmt.where(JobDescription.uploaded_by == owner_id)
    result = await db.execute(stmt)
    jd = result.scalar_one_or_none()
    if jd is None:
        raise NotFoundError("JobDescription", jd_id)

    candidate_count = await get_jd_candidate_count(jd_id, db)
    if candidate_count and not force:
        return JdDeleteOutcome(deleted=False, candidate_count=candidate_count)

    jd.deleted_at = datetime.now(UTC)
    await db.commit()

    logger.info("JD trashed", jd_id=jd_id, force=force, candidate_count=candidate_count)
    return JdDeleteOutcome(deleted=True, candidate_count=candidate_count)


# ─── Trash (soft-delete) operations ───────────────────────────

async def list_trashed_jds(db: AsyncSession) -> list[JobDescription]:
    """Return JDs currently in the trash, most-recently-deleted first."""
    result = await db.execute(
        select(JobDescription)
        .options(selectinload(JobDescription.extracted_data))
        .where(JobDescription.deleted_at.is_not(None))
        .order_by(JobDescription.deleted_at.desc())
    )
    return list(result.scalars().all())


async def restore_jd(jd_id: str, db: AsyncSession) -> None:
    """Restore a trashed JD (clear deleted_at)."""
    result = await db.execute(
        select(JobDescription).where(
            JobDescription.id == jd_id, JobDescription.deleted_at.is_not(None)
        )
    )
    jd = result.scalar_one_or_none()
    if jd is None:
        raise NotFoundError("JobDescription", jd_id)
    jd.deleted_at = None
    await db.commit()
    logger.info("JD restored", jd_id=jd_id)


async def purge_jd(jd_id: str, db: AsyncSession) -> None:
    """Permanently delete a trashed JD and its stored file. Cascades to
    extracted_data, tests, invitations via DB constraints."""
    result = await db.execute(
        select(JobDescription).where(
            JobDescription.id == jd_id, JobDescription.deleted_at.is_not(None)
        )
    )
    jd = result.scalar_one_or_none()
    if jd is None:
        raise NotFoundError("JobDescription", jd_id)
    await file_service.delete_file(jd.file_path)
    await db.delete(jd)
    await db.commit()
    logger.info("JD purged", jd_id=jd_id)


# ─── Background parse task ────────────────────────────────────

async def parse_jd_background(jd_id: str) -> None:
    """
    Background task: extract raw text from a JD file and persist.

    Status transitions:
        PENDING → PROCESSING → DONE
        PENDING → PROCESSING → FAILED (on any error)

    File content is loaded from storage via jd.file_path — the file is already
    persisted by create_jd() before this task is enqueued, so there is no need
    to pass the raw bytes through the ARQ/Redis queue (which has a memory limit).
    """
    from app.db.session import AsyncSessionFactory

    async with AsyncSessionFactory() as db:
        result = await db.execute(
            select(JobDescription).where(JobDescription.id == jd_id)
        )
        jd = result.scalar_one_or_none()
        if jd is None:
            logger.error("JD not found in background parse task", jd_id=jd_id)
            return

        try:
            jd.parse_status = ParseStatus.PROCESSING
            await db.commit()

            # Read file content from storage (avoid passing large bytes through Redis).
            content = await file_service.read_file(jd.file_path)
            file_type = jd.file_type

            logger.info(
                "Background parse started",
                jd_id=jd_id,
                file_type=file_type.value,
            )

            # extract_text() uses PyMuPDF / python-docx — CPU-bound work that
            # would block the async event loop and freeze all other requests
            # while running.  run_in_executor offloads it to the default
            # ThreadPoolExecutor so the event loop stays free.
            import asyncio
            from functools import partial
            loop = asyncio.get_running_loop()
            raw_text = await loop.run_in_executor(
                None, partial(extract_text, content=content, file_type=file_type)
            )

            jd.raw_text = raw_text
            jd.parse_status = ParseStatus.DONE
            await db.commit()

            logger.info(
                "Background parse complete",
                jd_id=jd_id,
                chars=len(raw_text),
                words=len(raw_text.split()),
            )

        except ParseError as exc:
            logger.error("Parse error", jd_id=jd_id, error=str(exc))
            await db.rollback()
            # Re-load after rollback to update status
            result = await db.execute(
                select(JobDescription).where(JobDescription.id == jd_id)
            )
            jd = result.scalar_one_or_none()
            if jd:
                jd.parse_status = ParseStatus.FAILED
                await db.commit()

        except Exception:
            logger.exception("Unexpected parse error", jd_id=jd_id)
            await db.rollback()
            result = await db.execute(
                select(JobDescription).where(JobDescription.id == jd_id)
            )
            jd = result.scalar_one_or_none()
            if jd:
                jd.parse_status = ParseStatus.FAILED
                await db.commit()


# ─── Background: skill extraction ────────────────────────────

async def extract_skills_background(jd_id: str) -> None:
    """
    Background task: run skill extraction and persist results.

    Status transitions:
        IDLE → EXTRACTING → IDLE   (success, ready for test generation)
        IDLE → EXTRACTING → FAILED (on any error)

    Enqueued as "task_extract_skills" by POST /jd/{jd_id}/analyze (ARQ, not
    FastAPI BackgroundTasks — see app/worker.py).
    Opens its own DB session — never shares a session with the request.
    """
    from app.db.session import AsyncSessionFactory
    from app.services.skill_extraction_service import (
        extract_skills_from_jd_text,
        save_extracted_skills,
    )

    async with AsyncSessionFactory() as db:
        result = await db.execute(
            select(JobDescription).where(JobDescription.id == jd_id)
        )
        jd = result.scalar_one_or_none()
        if jd is None:
            logger.error("JD not found in extract_skills_background", jd_id=jd_id)
            return

        try:
            jd.generation_status = GenerationStatus.EXTRACTING
            jd.generation_error = None
            await db.commit()

            logger.info("Background skill extraction started", jd_id=jd_id)

            if not jd.raw_text or not jd.raw_text.strip():
                raise ValueError("JD has no extracted text — re-upload the file.")

            skills = await extract_skills_from_jd_text(jd.raw_text)
            await save_extracted_skills(jd_id, skills, db)

            # Re-fetch to get a fresh instance after save_extracted_skills commits
            result2 = await db.execute(
                select(JobDescription).where(JobDescription.id == jd_id)
            )
            jd_fresh = result2.scalar_one_or_none()
            if jd_fresh:
                if jd_fresh.generation_status != GenerationStatus.EXTRACTING:
                    # Status was changed externally while extraction ran — honor it.
                    logger.warning(
                        "Skill extraction cancelled mid-flight — discarding results",
                        jd_id=jd_id,
                        status=jd_fresh.generation_status.value,
                    )
                    return
                jd_fresh.generation_status = GenerationStatus.IDLE
                await db.commit()

            logger.info(
                "Background skill extraction complete",
                jd_id=jd_id,
                job_title=skills.job_title,
            )

        except Exception as exc:
            logger.error(
                "Background skill extraction failed",
                jd_id=jd_id,
                error=str(exc),
            )
            await db.rollback()
            result_err = await db.execute(
                select(JobDescription).where(JobDescription.id == jd_id)
            )
            jd_err = result_err.scalar_one_or_none()
            if jd_err:
                jd_err.generation_status = GenerationStatus.FAILED
                jd_err.generation_error = str(exc)[:500]
                await db.commit()


# ─── Background: test generation ─────────────────────────────

async def generate_tests_background(
    jd_id: str,
    difficulty_override: DifficultyOverride | None = None,
) -> None:
    """
    Background task: generate 3 tests for a JD that has extracted skills.

    Status transitions:
        IDLE → GENERATING → READY  (success)
        IDLE → GENERATING → FAILED (on any error)

    Enqueued as "task_generate_tests" by POST /tests/generate/{jd_id} (ARQ, not
    FastAPI BackgroundTasks — see app/worker.py).
    Opens its own DB session — never shares a session with the request.
    """
    from app.db.session import AsyncSessionFactory
    from app.services.test_generation_service import (
        clear_progress,
        generate_tests_for_jd,
    )

    async with AsyncSessionFactory() as db:
        result = await db.execute(
            select(JobDescription)
            .options(selectinload(JobDescription.extracted_data))
            .where(JobDescription.id == jd_id)
        )
        jd = result.scalar_one_or_none()
        if jd is None:
            logger.error("JD not found in generate_tests_background", jd_id=jd_id)
            return

        if jd.extracted_data is None:
            logger.error(
                "No extracted skills — run /analyze before /generate",
                jd_id=jd_id,
            )
            jd.generation_status = GenerationStatus.FAILED
            jd.generation_error = "JD has not been analyzed yet — run /analyze first."
            await db.commit()
            return

        if jd.generation_status != GenerationStatus.GENERATING:
            logger.warning(
                "Skipping stale test generation job",
                jd_id=jd_id,
                status=jd.generation_status.value,
            )
            return

        try:
            jd.generation_error = None
            await db.commit()

            logger.info("Background test generation started", jd_id=jd_id)

            extracted = jd.extracted_data
            saved_tests = await generate_tests_for_jd(
                jd_id=jd_id,
                job_title=extracted.job_title or "Unknown Role",
                seniority_level=extracted.seniority_level or "mid",
                must_have_skills=list(extracted.must_have_skills or []),
                tools_technologies=list(extracted.tools_technologies or []),
                recommended_test_topics=list(extracted.recommended_test_topics or []),
                difficulty_distribution=(
                {
                    "easy_percent": difficulty_override.easy_percent,
                    "medium_percent": difficulty_override.medium_percent,
                    "hard_percent": difficulty_override.hard_percent,
                }
                if difficulty_override
                else dict(extracted.difficulty_distribution or {})
            ),
                db=db,
            )

            # Re-fetch to avoid stale state after multiple internal commits
            result2 = await db.execute(
                select(JobDescription).where(JobDescription.id == jd_id)
            )
            jd_fresh = result2.scalar_one_or_none()
            if jd_fresh is None:
                return

            if jd_fresh.generation_status != GenerationStatus.GENERATING:
                # The admin called /cancel while this task was still running
                # (status was reset to IDLE). Honor the cancellation: discard
                # the tests we just saved instead of flipping back to READY.
                logger.warning(
                    "Generation cancelled mid-flight — discarding results",
                    jd_id=jd_id,
                    status=jd_fresh.generation_status.value,
                )
                for test in saved_tests:
                    await db.delete(test)
                await db.commit()
                await clear_progress(jd_id)
                return

            jd_fresh.generation_status = GenerationStatus.READY
            await db.commit()

            logger.info(
                "Background test generation complete",
                jd_id=jd_id,
                tests_saved=len(saved_tests),
            )
            # Keep pct=100 visible briefly so the frontend bar reaches 100%,
            # then clear so stale progress isn't served on next generation.
            await asyncio.sleep(3)
            await clear_progress(jd_id)

        except Exception as exc:
            logger.error(
                "Background test generation failed",
                jd_id=jd_id,
                error=str(exc),
            )
            await clear_progress(jd_id)
            await db.rollback()
            result_err = await db.execute(
                select(JobDescription).where(JobDescription.id == jd_id)
            )
            jd_err = result_err.scalar_one_or_none()
            if jd_err and jd_err.generation_status == GenerationStatus.GENERATING:
                jd_err.generation_status = GenerationStatus.FAILED
                jd_err.generation_error = str(exc)[:500]
                await db.commit()


# ─── Skill extraction (manual / synchronous) ──────────────────

async def trigger_skill_extraction(
    jd_id: str,
    db: AsyncSession,
) -> "AnalyzeJdResponse":
    """
    Orchestrate skill extraction for a parsed JD.

    1. Load the JD, validate it is in DONE state
    2. Call skill_extraction_service.extract_skills_from_jd_text()
    3. Persist the result
    4. Return an AnalyzeJdResponse

    Raises:
        NotFoundError:       JD does not exist
        ValidationError:     JD text is empty or JD not yet parsed
        AIServiceError:      Ollama unreachable
        AIResponseParseError: Could not get valid JSON after retries
    """
    from fastapi import HTTPException

    from app.services.skill_extraction_service import (
        extract_skills_from_jd_text,
        save_extracted_skills,
    )

    # Load JD
    jd = await get_jd_orm(jd_id, db)

    if jd.parse_status != ParseStatus.DONE:
        raise HTTPException(
            status_code=409,
            detail=(
                f"JD parse_status is '{jd.parse_status.value}' — "
                "text extraction must complete before skill extraction."
            ),
        )

    if not jd.raw_text or not jd.raw_text.strip():
        raise HTTPException(
            status_code=422,
            detail="JD has no extracted text. Re-upload and re-parse the file.",
        )

    is_reanalysis = jd.extracted_data is not None

    logger.info(
        "Triggering skill extraction",
        jd_id=jd_id,
        is_reanalysis=is_reanalysis,
        text_chars=len(jd.raw_text),
    )

    # Run extraction (may raise AIServiceError / AIResponseParseError)
    result = await extract_skills_from_jd_text(jd.raw_text)

    # Persist
    await save_extracted_skills(jd_id, result, db)

    logger.info(
        "Skill extraction persisted",
        jd_id=jd_id,
        job_title=result.job_title,
        must_have_count=len(result.must_have_skills),
    )

    return AnalyzeJdResponse(
        jd_id=jd_id,
        job_title=result.job_title,
        seniority_level=result.seniority_level,
        must_have_skills=result.must_have_skills,
        nice_to_have_skills=result.nice_to_have_skills,
        tools_technologies=result.tools_technologies,
        responsibilities=result.responsibilities,
        recommended_test_topics=result.recommended_test_topics,
        difficulty_distribution=DifficultyDistributionResponse(
            **result.difficulty_distribution.model_dump()
        ),
        is_reanalysis=is_reanalysis,
        message=(
            "Re-analysis complete. Skills have been updated."
            if is_reanalysis
            else "Skill extraction complete."
        ),
    )
