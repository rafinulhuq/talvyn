"""
Exam Template ("Templates") endpoints — reusable question-bank config library.

POST   /api/v1/templates/          Create a template
GET    /api/v1/templates/          List templates (owner-scoped for USER role)
GET    /api/v1/templates/{id}      Get one template
PATCH  /api/v1/templates/{id}      Update a template
POST   /api/v1/templates/{id}/archive  Archive (not delete) a template
DELETE /api/v1/templates/{id}      Hard delete a template

Security: create/update/archive/delete require ADMIN+ (templates drive
generation config, same trust level as editing a JD's exam config
directly). Reading is open to any authenticated active user, owner-scoped
via owner_scope_for() — a USER-role account only sees templates it
created, matching how JD ownership already works.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies import AdminActor, AnyActiveActor, owner_scope_for
from app.schemas.exam_template import (
    CreateExamTemplateRequest,
    ExamTemplateListResponse,
    ExamTemplateResponse,
    UpdateExamTemplateRequest,
)
from app.services import exam_template_service

router = APIRouter()


@router.post("/", response_model=ExamTemplateResponse, status_code=201)
async def create_template(
    req: CreateExamTemplateRequest,
    actor: AdminActor,
    db: AsyncSession = Depends(get_db),
) -> ExamTemplateResponse:
    template = await exam_template_service.create_template(
        name=req.name, description=req.description, config=req, actor=actor, db=db
    )
    return ExamTemplateResponse.model_validate(template)


@router.get("/", response_model=ExamTemplateListResponse)
async def list_templates(
    actor: AnyActiveActor,
    include_archived: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
) -> ExamTemplateListResponse:
    templates = await exam_template_service.list_templates(
        owner_scope=owner_scope_for(actor), include_archived=include_archived, db=db
    )
    return ExamTemplateListResponse(
        items=[ExamTemplateResponse.model_validate(t) for t in templates]
    )


@router.get("/{template_id}", response_model=ExamTemplateResponse)
async def get_template(
    template_id: str,
    actor: AnyActiveActor,
    db: AsyncSession = Depends(get_db),
) -> ExamTemplateResponse:
    template = await exam_template_service.get_template(
        template_id, owner_scope=owner_scope_for(actor), db=db
    )
    return ExamTemplateResponse.model_validate(template)


@router.patch("/{template_id}", response_model=ExamTemplateResponse)
async def update_template(
    template_id: str,
    req: UpdateExamTemplateRequest,
    actor: AdminActor,
    db: AsyncSession = Depends(get_db),
) -> ExamTemplateResponse:
    has_config = req.mcq_target is not None or req.cq_target is not None or req.section_weights is not None
    template = await exam_template_service.update_template(
        template_id,
        name=req.name,
        description=req.description,
        config=req if has_config else None,
        owner_scope=owner_scope_for(actor),
        db=db,
    )
    return ExamTemplateResponse.model_validate(template)


@router.post("/{template_id}/archive", response_model=ExamTemplateResponse)
async def archive_template(
    template_id: str,
    actor: AdminActor,
    db: AsyncSession = Depends(get_db),
) -> ExamTemplateResponse:
    template = await exam_template_service.archive_template(
        template_id, owner_scope=owner_scope_for(actor), db=db
    )
    return ExamTemplateResponse.model_validate(template)


@router.delete("/{template_id}", status_code=204)
async def delete_template(
    template_id: str,
    actor: AdminActor,
    db: AsyncSession = Depends(get_db),
) -> None:
    await exam_template_service.delete_template(
        template_id, owner_scope=owner_scope_for(actor), db=db
    )
