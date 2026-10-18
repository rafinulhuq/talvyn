"""
Internal-token-guarded endpoints for transactional emails triggered by
Next.js server-side code that has no FastAPI-side data access for what
it's acting on — specifically the Prisma-only signup/access-request flow
(frontend/src/app/api/signup/route.ts,
frontend/src/app/api/admin/users/[id]/signup-status/route.ts).

Guarded by VerifiedInternal only, not an actor/role dependency: the caller
for /signup-request is an unauthenticated visitor submitting a signup form
(there is no session to check), and the caller for /signup-decision has
already had its Super Admin session verified by NextAuth server-side
before this call is made. Neither case has a FastAPI-recognized actor.
"""

import html
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, EmailStr, Field

from app.config import get_settings
from app.dependencies import VerifiedInternal
from app.services.email_service import render_email_shell, send_html_email

router = APIRouter()


class SignupRequestNotification(BaseModel):
    admin_emails: list[EmailStr] = Field(min_length=1, max_length=50)
    requester_name: str = Field(min_length=1, max_length=255)
    requester_email: EmailStr
    company_name: str = Field(min_length=1, max_length=255)


class SignupDecisionNotification(BaseModel):
    to_email: EmailStr
    to_name: str = Field(min_length=1, max_length=255)
    decision: Literal["APPROVED", "REJECTED"]


class PasswordResetNotification(BaseModel):
    to_email: EmailStr
    to_name: str = Field(min_length=1, max_length=255)
    token: str = Field(min_length=64, max_length=64)


class PasswordChangedNotification(BaseModel):
    to_email: EmailStr
    to_name: str = Field(min_length=1, max_length=255)


class EmailDispatchResponse(BaseModel):
    sent: int
    failed: int


@router.post(
    "/signup-request",
    response_model=EmailDispatchResponse,
    summary="Notify Super Admins of a new access request",
)
async def notify_signup_request(
    req: SignupRequestNotification,
    _auth: VerifiedInternal,
) -> EmailDispatchResponse:
    body_html = f"""
              <p style="margin:0 0 18px 0;color:#5b6478;font-size:15px;line-height:1.6;">
                <strong>{html.escape(req.requester_name)}</strong>
                ({html.escape(req.requester_email)}) from
                <strong>{html.escape(req.company_name)}</strong> has requested
                admin access to Talvyn.
              </p>
              <p style="margin:0;color:#5b6478;font-size:15px;line-height:1.6;">
                Review this request in Settings &rarr; Users.
              </p>
    """
    html_body = render_email_shell(
        eyebrow="Talvyn Platform",
        heading="New access request",
        body_html=body_html,
    )
    sent = 0
    failed = 0
    for admin_email in req.admin_emails:
        ok = await send_html_email(
            to_email=str(admin_email),
            subject=f"New access request from {req.company_name}",
            html_body=html_body,
        )
        if ok:
            sent += 1
        else:
            failed += 1
    return EmailDispatchResponse(sent=sent, failed=failed)


@router.post(
    "/signup-decision",
    response_model=EmailDispatchResponse,
    summary="Notify a requester their access request was approved or rejected",
)
async def notify_signup_decision(
    req: SignupDecisionNotification,
    _auth: VerifiedInternal,
) -> EmailDispatchResponse:
    settings = get_settings()
    login_link = f"{settings.magic_link_base_url.rstrip('/')}/login"

    if req.decision == "APPROVED":
        heading = "Your access request was approved"
        subject = "Your Talvyn access request was approved"
        body_html = f"""
              <p style="margin:0 0 20px 0;color:#5b6478;font-size:15px;line-height:1.6;">
                Hi {html.escape(req.to_name)}, a Super Admin approved your access
                request. You can sign in now with the email and password you
                registered with.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
                <tr>
                  <td align="center">
                    <a href="{html.escape(login_link, quote=True)}"
                       style="display:inline-block;background-color:#e2542d;
                              color:#ffffff;font-size:15px;font-weight:700;
                              text-decoration:none;padding:14px 36px;
                              border-radius:999px;
                              letter-spacing:0.01em;">
                      Sign in
                    </a>
                  </td>
                </tr>
              </table>
        """
    else:
        heading = "Your access request was declined"
        subject = "Your Talvyn access request was declined"
        body_html = f"""
              <p style="margin:0;color:#5b6478;font-size:15px;line-height:1.6;">
                Hi {html.escape(req.to_name)}, a Super Admin reviewed your access
                request and declined it. If you believe this is a mistake,
                reply to this email.
              </p>
        """

    html_body = render_email_shell(eyebrow="Talvyn Platform", heading=heading, body_html=body_html)
    ok = await send_html_email(to_email=str(req.to_email), subject=subject, html_body=html_body)
    return EmailDispatchResponse(sent=1 if ok else 0, failed=0 if ok else 1)


@router.post(
    "/password-reset",
    response_model=EmailDispatchResponse,
    summary="Send single-use password reset link",
)
async def notify_password_reset(
    req: PasswordResetNotification,
    _auth: VerifiedInternal,
) -> EmailDispatchResponse:
    settings = get_settings()
    reset_link = f"{settings.magic_link_base_url.rstrip('/')}/reset-password?token={req.token}"
    body_html = f"""
          <p style="margin:0 0 18px 0;color:#5b6478;font-size:15px;line-height:1.6;">
            Hi {html.escape(req.to_name)}, we received a request to reset your
            password for your Talvyn account.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px;">
            <tr>
              <td align="center">
                <a href="{html.escape(reset_link, quote=True)}"
                   style="display:inline-block;background-color:#e2542d;
                          color:#ffffff;font-size:15px;font-weight:700;
                          text-decoration:none;padding:14px 36px;
                          border-radius:999px;
                          letter-spacing:0.01em;">
                  Reset Password
                </a>
              </td>
            </tr>
          </table>
          <p style="margin:0;color:#8a94a6;font-size:13px;line-height:1.5;">
            This link expires in 30 minutes and can only be used once.
            If you didn&apos;t request this, you can safely ignore this email.
          </p>
    """
    html_body = render_email_shell(
        eyebrow="Talvyn Security",
        heading="Reset your password",
        body_html=body_html,
    )
    ok = await send_html_email(
        to_email=str(req.to_email),
        subject="Reset your Talvyn password",
        html_body=html_body,
    )
    return EmailDispatchResponse(sent=1 if ok else 0, failed=0 if ok else 1)


@router.post(
    "/password-changed",
    response_model=EmailDispatchResponse,
    summary="Notify account owner that their password was changed",
)
async def notify_password_changed(
    req: PasswordChangedNotification,
    _auth: VerifiedInternal,
) -> EmailDispatchResponse:
    body_html = f"""
          <p style="margin:0 0 18px 0;color:#5b6478;font-size:15px;line-height:1.6;">
            Hi {html.escape(req.to_name)}, your Talvyn account password was
            recently changed.
          </p>
          <p style="margin:0;color:#e2542d;font-size:13px;line-height:1.5;">
            If you did not perform or authorize this change, please contact your administrator immediately.
          </p>
    """
    html_body = render_email_shell(
        eyebrow="Talvyn Security",
        heading="Password changed",
        body_html=body_html,
    )
    ok = await send_html_email(
        to_email=str(req.to_email),
        subject="Your Talvyn password was changed",
        html_body=html_body,
    )
    return EmailDispatchResponse(sent=1 if ok else 0, failed=0 if ok else 1)
