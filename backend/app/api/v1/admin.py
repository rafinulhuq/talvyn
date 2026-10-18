"""Admin maintenance endpoints.

All routes here are SUPER_ADMIN-gated: they expose full data backups,
destructive reset/restore, and the audit history. The internal token alone
only proves the request came through the Next.js proxy — it does not say
which admin is acting, so each route resolves X-Actor-Id against the users
table and requires the SUPER_ADMIN role (see require_superadmin_actor).
"""

import html
import re
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.exceptions import ValidationError
from app.db.session import get_db
from app.dependencies import SuperAdminActor
from app.schemas.admin import (
    BackupPayload,
    ResetDataRequest,
    ResetDataResponse,
    RestoreDataRequest,
    RestoreDataResponse,
)
from app.schemas.audit_log import AuditLogListResponse
from app.services import admin_service, audit_log_service
from app.services.email_service import render_email_shell, send_html_email

router = APIRouter()


class HighgardenAlertMetric(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    value: int = Field(ge=0)


class HighgardenAlertRequest(BaseModel):
    recipients: list[EmailStr] = Field(min_length=1, max_length=10)
    subject: str = Field(min_length=1, max_length=160)
    summary: str = Field(min_length=1, max_length=1000)
    metrics: list[HighgardenAlertMetric] = Field(default_factory=list, max_length=12)
    action_url: str | None = Field(default=None, max_length=500)


class HighgardenAlertResponse(BaseModel):
    sent: int
    failed: int


class HighgardenOtpSendRequest(BaseModel):
    code: str = Field(min_length=4, max_length=10)

    @field_validator("code")
    @classmethod
    def code_is_digits(cls, v: str) -> str:
        if not re.fullmatch(r"\d+", v):
            raise ValueError("code must be numeric")
        return v


class HighgardenOtpResponse(BaseModel):
    sent: bool


@router.get(
    "/backup",
    response_model=BackupPayload,
    summary="Create a JSON backup of hiring data (super admin only)",
)
async def create_backup(
    _actor: SuperAdminActor,
    db: AsyncSession = Depends(get_db),
) -> BackupPayload:
    return await admin_service.create_backup(db)


@router.post(
    "/reset-data",
    response_model=ResetDataResponse,
    summary="Delete all hiring data and preserve admin users (super admin only)",
)
async def reset_data(
    req: ResetDataRequest,
    actor: SuperAdminActor,
    db: AsyncSession = Depends(get_db),
) -> ResetDataResponse:
    if req.confirm != "DELETE ALL":
        raise ValidationError("Type DELETE ALL to confirm reset.", "RESET_CONFIRMATION_REQUIRED")
    return await admin_service.reset_application_data(db, actor.id)


@router.post(
    "/restore-data",
    response_model=RestoreDataResponse,
    summary="Restore hiring data from a JSON backup (super admin only)",
)
async def restore_data(
    req: RestoreDataRequest,
    actor: SuperAdminActor,
    db: AsyncSession = Depends(get_db),
) -> RestoreDataResponse:
    if req.confirm != "RESTORE BACKUP":
        raise ValidationError(
            "Type RESTORE BACKUP to confirm restore.",
            "RESTORE_CONFIRMATION_REQUIRED",
        )
    return await admin_service.restore_application_data(db, req.backup, actor.id)


@router.get(
    "/audit-log",
    response_model=AuditLogListResponse,
    summary="List recent admin audit log entries, newest first (super admin only)",
)
async def list_audit_log(
    _actor: SuperAdminActor,
    db: AsyncSession = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> AuditLogListResponse:
    data = await audit_log_service.list_recent(db, page=page, page_size=page_size)
    return AuditLogListResponse(**data)


@router.post(
    "/highgarden-alerts/send",
    response_model=HighgardenAlertResponse,
    summary="Send Highgarden alert digest email (super admin only)",
)
async def send_highgarden_alert_digest(
    req: HighgardenAlertRequest,
    _actor: SuperAdminActor,
) -> HighgardenAlertResponse:
    metric_rows = "".join(
        "<tr>"
        f"<td style=\"padding:8px 0;color:#5b6478;\">{html.escape(metric.label)}</td>"
        f"<td style=\"padding:8px 0;text-align:right;font-weight:700;color:#141c2e;\">{metric.value}</td>"
        "</tr>"
        for metric in req.metrics
    )
    action_link = (
        f'<p style="margin:24px 0 0 0;"><a href="{html.escape(req.action_url, quote=True)}" '
        'style="display:inline-block;background:#e2542d;color:#ffffff;text-decoration:none;'
        'font-weight:700;padding:10px 20px;'
        'border-radius:999px;">Open Highgarden</a></p>'
        if req.action_url
        else ""
    )
    body_html = f"""
              <p style="margin:0 0 18px 0;color:#5b6478;font-size:15px;line-height:1.6;">{html.escape(req.summary)}</p>
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-top:1px solid #dfe3ec;border-bottom:1px solid #dfe3ec;">
                {metric_rows}
              </table>
              {action_link}
    """
    html_body = render_email_shell(
        eyebrow="Highgarden",
        heading=html.escape(req.subject),
        body_html=body_html,
    )

    sent = 0
    failed = 0
    for recipient in req.recipients:
        ok = await send_html_email(
            to_email=str(recipient),
            subject=req.subject,
            html_body=html_body,
        )
        if ok:
            sent += 1
        else:
            failed += 1
    return HighgardenAlertResponse(sent=sent, failed=failed)


@router.post(
    "/highgarden-otp/send",
    response_model=HighgardenOtpResponse,
    summary="Email the HighGarden unlock OTP + attempt notice (super admin only)",
)
async def send_highgarden_otp(
    req: HighgardenOtpSendRequest,
    actor: SuperAdminActor,
) -> HighgardenOtpResponse:
    """
    The recipient is always settings.highgarden_otp_email — never taken from
    the request — so a hijacked Super Admin session can't redirect the code
    to itself. `actor` (the authenticated caller, resolved server-side from
    X-Actor-Id, not client-supplied) names who is attempting the unlock, so
    this email doubles as the "someone is trying to log in" notice.
    """
    settings = get_settings()
    body_html = f"""
              <p style="margin:0 0 18px 0;color:#5b6478;font-size:15px;line-height:1.6;">
                <strong>{html.escape(actor.name)}</strong> ({html.escape(actor.email)})
                is attempting to unlock HighGarden and needs this one-time code to continue.
              </p>
              <p style="margin:0 0 18px 0;text-align:center;font-size:32px;font-weight:700;
                        letter-spacing:0.15em;color:#141c2e;">
                {html.escape(req.code)}
              </p>
              <p style="margin:0;color:#e2542d;font-size:13px;line-height:1.5;">
                This code expires in 5 minutes. If you don't recognize this request,
                that Super Admin session may be compromised — investigate immediately.
              </p>
    """
    html_body = render_email_shell(
        eyebrow="Highgarden Security",
        heading="Unlock code requested",
        body_html=body_html,
    )
    ok = await send_html_email(
        to_email=settings.highgarden_otp_email,
        subject=f"HighGarden unlock code: {req.code}",
        html_body=html_body,
    )
    return HighgardenOtpResponse(sent=ok)


@router.post(
    "/highgarden-otp/confirm",
    response_model=HighgardenOtpResponse,
    summary="Notify the fixed owner address that HighGarden was unlocked (super admin only)",
)
async def confirm_highgarden_unlock(
    actor: SuperAdminActor,
) -> HighgardenOtpResponse:
    settings = get_settings()
    when = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")
    body_html = f"""
              <p style="margin:0;color:#5b6478;font-size:15px;line-height:1.6;">
                <strong>{html.escape(actor.name)}</strong> ({html.escape(actor.email)})
                successfully unlocked HighGarden at {html.escape(when)}.
              </p>
    """
    html_body = render_email_shell(
        eyebrow="Highgarden Security",
        heading="HighGarden was unlocked",
        body_html=body_html,
    )
    ok = await send_html_email(
        to_email=settings.highgarden_otp_email,
        subject="HighGarden was unlocked",
        html_body=html_body,
    )
    return HighgardenOtpResponse(sent=ok)
