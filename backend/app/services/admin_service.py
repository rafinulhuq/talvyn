"""Admin-only maintenance actions."""

import base64
from datetime import UTC, datetime
from enum import Enum
from typing import Any

from sqlalchemy import DateTime, delete, func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.attempt import CandidateAnswer, SuspiciousEvent, TestAttempt
from app.db.models.candidate import Candidate, CandidateNumberCounter, Invitation
from app.db.models.cms import (
    CmsBlogPost,
    CmsContentDocument,
    CmsContentVersion,
    CmsMediaAsset,
)
from app.db.models.evaluation import Evaluation, QuestionFeedback
from app.db.models.job_description import JdExtractedData, JobDescription
from app.db.models.public_link import PublicAssessmentLink
from app.db.models.question_bank import (
    AiRiskSignal,
    CandidateReport,
    ExamAttempt,
    ExamAttemptQuestion,
    ExamTemplate,
    QuestionBank,
)
from app.db.models.test import Question, Test
from app.db.models.user import User
from app.schemas.admin import (
    BackupFile,
    BackupPayload,
    ResetDataResponse,
    RestoreDataResponse,
)
from app.services import audit_log_service
from app.services.file_service import file_service

_RESET_MODELS = [
    QuestionFeedback,
    Evaluation,
    CandidateReport,
    AiRiskSignal,
    SuspiciousEvent,
    CandidateAnswer,
    ExamAttemptQuestion,
    TestAttempt,
    ExamAttempt,
    ExamTemplate,
    Invitation,
    PublicAssessmentLink,
    Question,
    Test,
    QuestionBank,
    JdExtractedData,
    JobDescription,
    Candidate,
]

_BACKUP_MODELS = [
    CandidateNumberCounter,
    CmsContentDocument,
    CmsContentVersion,
    CmsMediaAsset,
    # After CmsMediaAsset: blog posts reference media assets, and restore
    # inserts tables in this order.
    CmsBlogPost,
    Candidate,
    JobDescription,
    JdExtractedData,
    QuestionBank,
    ExamTemplate,
    Test,
    Question,
    PublicAssessmentLink,
    Invitation,
    ExamAttempt,
    TestAttempt,
    ExamAttemptQuestion,
    CandidateAnswer,
    SuspiciousEvent,
    Evaluation,
    QuestionFeedback,
    AiRiskSignal,
    CandidateReport,
]

async def create_backup(db: AsyncSession) -> BackupPayload:
    """Export all hiring/product data plus uploaded JD files as JSON-safe data."""
    tables: dict[str, list[dict[str, Any]]] = {}

    for model in _BACKUP_MODELS:
        rows = (await db.execute(select(model))).scalars().all()
        tables[model.__tablename__] = [_dump_row(model, row) for row in rows]

    files: list[BackupFile] = []
    file_rows = (
        await db.execute(
            select(
                JobDescription.file_path,
                JobDescription.file_type,
            ).where(JobDescription.file_path.is_not(None))
        )
    ).all()
    for path, file_type in file_rows:
        try:
            content = await file_service.read_file(path)
        except Exception:
            continue

        safe_ext = str(getattr(file_type, "value", file_type)).lower()
        content_type = (
            "application/pdf"
            if safe_ext == "pdf"
            else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            if safe_ext == "docx"
            else "application/octet-stream"
        )
        files.append(
            BackupFile(
                path=path,
                content_type=content_type,
                size_bytes=len(content),
                content_base64=base64.b64encode(content).decode("ascii"),
            )
        )

    media_rows = (
        await db.execute(
            select(
                CmsMediaAsset.storage_key,
                CmsMediaAsset.content_type,
            ).where(CmsMediaAsset.storage_key.is_not(None))
        )
    ).all()
    for path, content_type in media_rows:
        try:
            content = await file_service.read_file(path)
        except Exception:
            continue
        files.append(
            BackupFile(
                path=path,
                content_type=content_type or "application/octet-stream",
                size_bytes=len(content),
                content_base64=base64.b64encode(content).decode("ascii"),
            )
        )

    return BackupPayload(
        version=1,
        created_at=datetime.now(UTC),
        tables=tables,
        files=files,
    )


async def reset_application_data(
    db: AsyncSession,
    actor_id: str | None = None,
) -> ResetDataResponse:
    """
    Delete all hiring/product data while preserving admin users and auth.

    This resets:
    - uploaded JDs and extracted data
    - generated tests/questions
    - public links and invitations
    - candidates, attempts, answers, suspicious events, evaluations
    - candidate numbering back to 1
    """
    file_paths = await _current_file_paths(db)
    deleted_counts = await _delete_application_rows(db)
    await _ensure_candidate_counter(db)

    await audit_log_service.record(
        db,
        actor_id=actor_id,
        action="DATA_RESET",
        target_type="application_data",
        summary="Deleted all hiring/product data",
        details={"deleted_counts": deleted_counts},
    )

    await db.commit()

    deleted_files = 0
    for path in file_paths:
        try:
            if await file_service.delete_file(path):
                deleted_files += 1
        except Exception:
            continue

    return ResetDataResponse(
        deleted_counts=deleted_counts,
        deleted_files=deleted_files,
        message="All hiring data deleted. Admin users were preserved.",
    )


async def restore_application_data(
    db: AsyncSession,
    backup: BackupPayload,
    actor_id: str | None = None,
) -> RestoreDataResponse:
    """Replace current hiring/product data with a Talvyn JSON backup."""
    if backup.version != 1:
        from app.core.exceptions import ValidationError
        raise ValidationError("Unsupported backup version.", "UNSUPPORTED_BACKUP_VERSION")

    old_file_paths = await _current_file_paths(db)
    await _delete_application_rows(db)

    # Backups don't include users (admin accounts are preserved, not
    # restored — see the "not included" note on the Settings page). A
    # backup taken under a different admin account (e.g. before a reseed)
    # can reference a `users.id` that no longer exists, which would
    # otherwise fail every affected row with a FK violation. Reassign those
    # rows to the admin performing the restore instead of failing outright.
    valid_user_ids = set((await db.execute(select(User.id))).scalars().all())
    fallback_user_id = actor_id if actor_id in valid_user_ids else next(iter(valid_user_ids), None)
    backup_model_table_names = {model.__tablename__ for model in _BACKUP_MODELS}
    restored_ids_by_table = {
        table_name: {
            row["id"]
            for row in backup.tables.get(table_name, [])
            if isinstance(row, dict) and row.get("id") is not None
        }
        for table_name in backup_model_table_names
    }

    restored_counts: dict[str, int] = {}
    remapped_owners = 0
    nulled_missing_references = 0
    for model in _BACKUP_MODELS:
        table_name = model.__tablename__
        rows = backup.tables.get(table_name, [])
        restored_counts[table_name] = len(rows)
        cleaned_rows = [_restore_row(model, row) for row in rows]
        user_fk_columns = _user_fk_columns(model)
        if user_fk_columns and cleaned_rows:
            for clean_row in cleaned_rows:
                for column_name, nullable in user_fk_columns:
                    value = clean_row.get(column_name)
                    if value is not None and value not in valid_user_ids:
                        clean_row[column_name] = None if nullable else fallback_user_id
                        remapped_owners += 1
        nullable_fk_columns = _nullable_fk_columns(model)
        if nullable_fk_columns and cleaned_rows:
            for clean_row in cleaned_rows:
                for column_name, target_table in nullable_fk_columns:
                    value = clean_row.get(column_name)
                    if (
                        value is not None
                        and target_table in backup_model_table_names
                        and value not in restored_ids_by_table[target_table]
                    ):
                        clean_row[column_name] = None
                        nulled_missing_references += 1
        if cleaned_rows:
            await db.execute(insert(model), cleaned_rows)

    await _ensure_candidate_counter(db)

    await audit_log_service.record(
        db,
        actor_id=actor_id,
        action="DATA_RESTORED",
        target_type="application_data",
        summary="Restored hiring/product data from a backup",
        details={
            "restored_counts": restored_counts,
            "backup_created_at": backup.created_at.isoformat(),
            "remapped_owner_references": remapped_owners,
            "nulled_missing_references": nulled_missing_references,
        },
    )

    await db.commit()

    backup_paths = {file.path for file in backup.files}
    for path in old_file_paths:
        if path not in backup_paths:
            try:
                await file_service.delete_file(path)
            except Exception:
                continue

    restored_files = 0
    for file in backup.files:
        try:
            content = base64.b64decode(file.content_base64.encode("ascii"), validate=True)
            await file_service.write_file(
                file.path,
                content,
                file.content_type or "application/octet-stream",
            )
            restored_files += 1
        except Exception:
            continue

    message = "Backup restored. Admin users were preserved."
    if remapped_owners:
        message += (
            f" {remapped_owners} record(s) referenced an admin account not present"
            " in this system and were reassigned to you."
        )
    if nulled_missing_references:
        message += (
            f" {nulled_missing_references} optional reference(s) pointed to records"
            " not present in the backup and were cleared."
        )

    return RestoreDataResponse(
        restored_counts=restored_counts,
        restored_files=restored_files,
        message=message,
    )


async def _current_file_paths(db: AsyncSession) -> list[str]:
    jd_paths = list(
        (
            await db.execute(
                select(JobDescription.file_path).where(JobDescription.file_path.is_not(None))
            )
        ).scalars().all()
    )
    media_paths = list(
        (
            await db.execute(
                select(CmsMediaAsset.storage_key).where(CmsMediaAsset.storage_key.is_not(None))
            )
        ).scalars().all()
    )
    return jd_paths + media_paths


async def _delete_application_rows(db: AsyncSession) -> dict[str, int]:
    deleted_counts: dict[str, int] = {}
    for model in _RESET_MODELS:
        table_name = model.__tablename__
        count = (
            await db.execute(select(func.count()).select_from(model))
        ).scalar_one()
        deleted_counts[table_name] = int(count or 0)
        await db.execute(delete(model))

    await db.execute(delete(CandidateNumberCounter))
    return deleted_counts


async def _ensure_candidate_counter(db: AsyncSession) -> None:
    max_candidate_number = (
        await db.execute(select(func.max(Candidate.candidate_number)))
    ).scalar_one()
    next_value = int(max_candidate_number or 0) + 1

    existing = (
        await db.execute(select(CandidateNumberCounter).where(CandidateNumberCounter.id == 1))
    ).scalar_one_or_none()
    if existing is None:
        await db.execute(
            insert(CandidateNumberCounter).values(id=1, next_value=next_value)
        )
        return

    if existing.next_value < next_value:
        await db.execute(
            update(CandidateNumberCounter)
            .where(CandidateNumberCounter.id == 1)
            .values(next_value=next_value)
        )


def _dump_row(model: type, row: Any) -> dict[str, Any]:
    data: dict[str, Any] = {}
    for column in model.__table__.columns:
        value = getattr(row, column.name)
        if isinstance(value, datetime):
            data[column.name] = value.isoformat()
        elif isinstance(value, Enum):
            data[column.name] = value.value
        else:
            data[column.name] = value
    return data


def _user_fk_columns(model: type) -> list[tuple[str, bool]]:
    """(column_name, nullable) pairs for columns on `model` that are foreign keys into users.id."""
    columns: list[tuple[str, bool]] = []
    for column in model.__table__.columns:
        for fk in column.foreign_keys:
            if fk.target_fullname == "users.id":
                columns.append((column.name, column.nullable))
    return columns


def _nullable_fk_columns(model: type) -> list[tuple[str, str]]:
    """(column_name, target_table) pairs for nullable non-user foreign keys."""
    columns: list[tuple[str, str]] = []
    for column in model.__table__.columns:
        if not column.nullable:
            continue
        for fk in column.foreign_keys:
            if fk.target_fullname == "users.id":
                continue
            columns.append((column.name, fk.column.table.name))
    return columns


def _restore_row(model: type, row: dict[str, Any]) -> dict[str, Any]:
    restored: dict[str, Any] = {}
    for column in model.__table__.columns:
        if column.name not in row:
            continue
        value = row[column.name]
        if value is not None and isinstance(column.type, DateTime) and isinstance(value, str):
            value = datetime.fromisoformat(value)
        restored[column.name] = value
    return restored
