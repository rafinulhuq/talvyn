"""
Exam Template Service — reusable question-bank config library ("Templates").

A template is a named, reusable {mcq_target, cq_target, section_weights}
preset — the same shape UpdateBankConfigRequest already accepts via
PATCH /jd/{jd_id}/question-bank/config. Applying a template is a
frontend-only convenience (populate that existing request from a saved
template's config_json); this service only owns the CRUD library itself —
it never touches JobDescription, QuestionBank, or the generation pipeline.

Ownership mirrors JobDescription.uploaded_by: a USER-role account only
sees templates it created; ADMIN/SUPER_ADMIN see all (via the same
owner_scope_for() helper JD list queries already use).
"""

import math

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.db.models.question_bank import ExamTemplate, ExamTemplateStatus
from app.db.models.user import User
from app.schemas.exam import UpdateBankConfigRequest
from app.services.question_bank_service import SECTION_ORDER

_VALID_SECTIONS = {section.value for section in SECTION_ORDER}


def _validate_config(config: UpdateBankConfigRequest) -> dict:
    """Templates are meant to be "validated, reusable" presets — hold them to
    a stricter bar than the ad-hoc PATCH .../question-bank/config endpoint,
    which stores section_weights as-is with no checks."""
    if config.section_weights is not None:
        keys = set(config.section_weights.keys())
        if keys != _VALID_SECTIONS:
            raise ValidationError(
                f"section_weights must have exactly these keys: {sorted(_VALID_SECTIONS)}",
                "INVALID_SECTION_WEIGHTS",
            )
        total = sum(config.section_weights.values())
        if not math.isclose(total, 1.0, abs_tol=0.01):
            raise ValidationError(
                f"section_weights must sum to 1.0 (got {total:.3f})",
                "INVALID_SECTION_WEIGHTS",
            )

    result: dict = {}
    if config.mcq_target is not None:
        result["mcq_target"] = config.mcq_target
    if config.cq_target is not None:
        result["cq_target"] = config.cq_target
    if config.section_weights is not None:
        result["section_weights"] = config.section_weights
    return result


async def create_template(
    *,
    name: str,
    description: str | None,
    config: UpdateBankConfigRequest,
    actor: User,
    db: AsyncSession,
) -> ExamTemplate:
    template = ExamTemplate(
        created_by=actor.id,
        name=name,
        description=description,
        config_json=_validate_config(config),
        status=ExamTemplateStatus.ACTIVE,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


async def list_templates(
    *,
    owner_scope: str | None,
    include_archived: bool,
    db: AsyncSession,
) -> list[ExamTemplate]:
    query = select(ExamTemplate)
    if owner_scope is not None:
        query = query.where(ExamTemplate.created_by == owner_scope)
    if not include_archived:
        query = query.where(ExamTemplate.status != ExamTemplateStatus.ARCHIVED)
    query = query.order_by(ExamTemplate.updated_at.desc())
    result = await db.execute(query)
    return list(result.scalars().all())


async def _get_owned(
    template_id: str, *, owner_scope: str | None, db: AsyncSession
) -> ExamTemplate:
    template = await db.get(ExamTemplate, template_id)
    if template is None:
        raise NotFoundError("ExamTemplate", template_id)
    if owner_scope is not None and template.created_by != owner_scope:
        raise NotFoundError("ExamTemplate", template_id)
    return template


async def get_template(
    template_id: str, *, owner_scope: str | None, db: AsyncSession
) -> ExamTemplate:
    return await _get_owned(template_id, owner_scope=owner_scope, db=db)


async def update_template(
    template_id: str,
    *,
    name: str | None,
    description: str | None,
    config: UpdateBankConfigRequest | None,
    owner_scope: str | None,
    db: AsyncSession,
) -> ExamTemplate:
    template = await _get_owned(template_id, owner_scope=owner_scope, db=db)
    if name is not None:
        template.name = name
    if description is not None:
        template.description = description
    if config is not None:
        template.config_json = {**template.config_json, **_validate_config(config)}
    await db.commit()
    await db.refresh(template)
    return template


async def archive_template(
    template_id: str, *, owner_scope: str | None, db: AsyncSession
) -> ExamTemplate:
    template = await _get_owned(template_id, owner_scope=owner_scope, db=db)
    template.status = ExamTemplateStatus.ARCHIVED
    await db.commit()
    await db.refresh(template)
    return template


async def delete_template(
    template_id: str, *, owner_scope: str | None, db: AsyncSession
) -> None:
    template = await _get_owned(template_id, owner_scope=owner_scope, db=db)
    await db.delete(template)
    await db.commit()
