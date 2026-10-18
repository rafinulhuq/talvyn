"""
Pydantic schemas for the Templates (ExamTemplate) endpoints.

CreateExamTemplateRequest/UpdateExamTemplateRequest inherit UpdateBankConfigRequest
so the mcq_target/cq_target/section_weights fields — and their bounds — stay a
single source of truth shared with PATCH /jd/{jd_id}/question-bank/config.
"""

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.exam import UpdateBankConfigRequest


class CreateExamTemplateRequest(UpdateBankConfigRequest):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1000)


class UpdateExamTemplateRequest(UpdateBankConfigRequest):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1000)


class ExamTemplateResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    name: str
    description: str | None
    config_json: dict
    status: str
    created_by: str
    created_at: datetime
    updated_at: datetime


class ExamTemplateListResponse(BaseModel):
    items: list[ExamTemplateResponse]
