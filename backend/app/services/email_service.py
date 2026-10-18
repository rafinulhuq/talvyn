"""
Email service using Resend.

Provides:
  send_invitation_email() — sends the magic link to the candidate
  send_test_reminder()    — (future) reminder before expiry

Template design:
  Clean, accessible HTML email. No external images or CDN dependencies.
  Uses inline CSS for maximum email client compatibility.
  Tested structure (Outlook-safe table layout).
"""

import asyncio
import functools
import html
import smtplib
from datetime import UTC, datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

from app.cms.defaults import DEFAULT_INVITATION_EMAIL_CONTENT
from app.config import get_settings
from app.core.logging import get_logger
from app.services import cms_service

logger = get_logger(__name__)


def _mask_magic_link(magic_link: str) -> str:
    """
    Redact the bearer token from a magic link for safe production logging.
    Keeps the host/path structure (useful for spotting misconfigured
    MAGIC_LINK_BASE_URL) but reduces the token itself to its length and a
    short prefix — not enough to reconstruct or guess the real token.
    """
    base, _, token = magic_link.rpartition("/")
    if not token:
        return "<unrecognised magic link format>"
    visible = token[:4]
    return f"{base}/{visible}…({len(token)} chars redacted)"


# ─── Email sender ────────────────────────────────────────────

async def send_invitation_email(
    *,
    to_email: str,
    to_name: str,
    jd_title: str,
    magic_link: str,
    expires_at: datetime,
    test_titles: list[str],
    invited_by_name: str = "The Assessment Team",
    cms_template: dict[str, str] | None = None,
) -> bool:
    """
    Send a candidate invitation email via Resend.

    Args:
        to_email:        Candidate's email address
        to_name:         Candidate's full name
        jd_title:        Job title they're being assessed for
        magic_link:      Full signed URL (e.g. https://app.com/tests/<token>)
        expires_at:      UTC datetime when the link expires
        test_titles:     List of test names included in the assessment
        invited_by_name: Admin's name to show in the email footer

    Returns:
        True if sent successfully, False on failure.
        Never raises — email errors are logged, not propagated.
    """
    settings = get_settings()

    # The magic link is a bearer credential — logging it in full means
    # production logs (and any log aggregator they ship to) become login
    # tokens. Only log the raw, copy-pasteable link outside production,
    # where it's the primary way to use the link without a working email
    # provider. In production, log a masked form that's useful for
    # correlating "which candidate, which link" without granting access.
    if settings.app_env == "production":
        logger.info(
            "Magic link generated (masked — see candidate email for the real link)",
            link_masked=_mask_magic_link(magic_link),
            to_email=to_email,
        )
    else:
        logger.info(
            "MAGIC LINK (copy if email fails)",
            link=magic_link,
            to_email=to_email,
        )

    template = {**DEFAULT_INVITATION_EMAIL_CONTENT, **(cms_template or {})}
    variables = {
        "candidateName": to_name,
        "jdTitle": jd_title,
        "invitedByName": invited_by_name,
        "platformName": settings.email_from_name,
        "magicLink": magic_link,
    }

    # Build subject + HTML once — used by both SMTP and Resend paths.
    subject = cms_service.render_template(
        str(template.get("subject") or DEFAULT_INVITATION_EMAIL_CONTENT["subject"]),
        variables,
    ).replace("\r", " ").replace("\n", " ").strip()
    html_body = _build_invitation_html(
        candidate_name=to_name,
        jd_title=jd_title,
        magic_link=magic_link,
        expires_at=expires_at,
        test_titles=test_titles,
        invited_by_name=invited_by_name,
        platform_name=settings.email_from_name,
        cms_template=template,
    )

    # ── SMTP path (Mailpit in dev, any SMTP server in staging) ────────────────
    # Preferred when SMTP_HOST is configured — no domain verification needed.
    if settings.smtp_host:
        return await _send_via_smtp(
            to_email=to_email,
            subject=subject,
            html_body=html_body,
            settings=settings,
        )

    # ── Resend HTTP API path (production) ─────────────────────────────────────
    if not settings.resend_api_key or settings.resend_api_key == "re_your_key_here":
        logger.warning(
            "Resend API key not configured — skipping email send. "
            "Set RESEND_API_KEY in backend/.env and recreate the container. "
            "Or add SMTP_HOST=mailpit to use local Mailpit for development.",
            to_email=to_email,
        )
        return False

    try:
        import resend

        resend.api_key = settings.resend_api_key

        params: dict[str, Any] = {
            "from": f"{settings.email_from_name} <{settings.email_from}>",
            "to": [to_email],
            "subject": subject,
            "html": html_body,
        }

        # resend.Emails.send() is a synchronous call that would block the event
        # loop.  Run it in a thread-pool executor so FastAPI stays responsive
        # while the HTTP request to Resend is in flight.
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, functools.partial(resend.Emails.send, params)
        )
        email_id = getattr(result, "id", None) or (result.get("id") if isinstance(result, dict) else None)

        logger.info(
            "Invitation email sent via Resend",
            to_email=to_email,
            resend_id=email_id,
            jd_title=jd_title,
        )
        return True

    except Exception as exc:
        # Log the full exception detail so misconfiguration (bad domain,
        # invalid API key, unverified sender) is easy to diagnose.
        logger.error(
            "Failed to send invitation email via Resend",
            to_email=to_email,
            error_type=type(exc).__name__,
            error=str(exc),
            hint=(
                "Check: (1) RESEND_API_KEY is a real key, not the placeholder. "
                "(2) EMAIL_FROM is a verified domain/address in your Resend account. "
                "(3) Container was recreated after .env was updated (docker compose up -d backend)."
            ),
        )
        return False


async def send_html_email(
    *,
    to_email: str,
    subject: str,
    html_body: str,
) -> bool:
    """Send a generic transactional HTML email using the configured provider."""
    settings = get_settings()
    subject = subject.replace("\r", " ").replace("\n", " ").strip()[:200]

    if settings.smtp_host:
        return await _send_via_smtp(
            to_email=to_email,
            subject=subject,
            html_body=html_body,
            settings=settings,
        )

    if not settings.resend_api_key or settings.resend_api_key == "re_your_key_here":
        logger.warning(
            "Email provider not configured — skipping generic email send",
            to_email=to_email,
            subject=subject,
        )
        return False

    try:
        import resend

        resend.api_key = settings.resend_api_key
        params: dict[str, Any] = {
            "from": f"{settings.email_from_name} <{settings.email_from}>",
            "to": [to_email],
            "subject": subject,
            "html": html_body,
        }
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, functools.partial(resend.Emails.send, params)
        )
        email_id = getattr(result, "id", None) or (result.get("id") if isinstance(result, dict) else None)
        logger.info("Generic email sent via Resend", to_email=to_email, resend_id=email_id)
        return True
    except Exception as exc:
        logger.error(
            "Failed to send generic email via Resend",
            to_email=to_email,
            error_type=type(exc).__name__,
            error=str(exc),
        )
        return False


# ─── SMTP helper ─────────────────────────────────────────────

async def _send_via_smtp(
    *,
    to_email: str,
    subject: str,
    html_body: str,
    settings: Any,
) -> bool:
    """
    Send an email via SMTP (runs in a thread-pool executor to avoid
    blocking the async event loop).

    Used for:
      - Development: Mailpit (SMTP_HOST=mailpit, SMTP_PORT=1025)
      - Staging: any plain SMTP relay
    """
    from_addr = f"{settings.email_from_name} <{settings.email_from}>"

    def _send() -> None:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = from_addr
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            # Mailpit (dev) has no TLS support; real mail servers (port 587)
            # require STARTTLS before LOGIN or credentials go out in plaintext.
            if server.has_extn("starttls"):
                server.starttls()
            if settings.smtp_username and settings.smtp_password:
                server.login(settings.smtp_username, settings.smtp_password)
            server.sendmail(settings.email_from, [to_email], msg.as_string())

    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _send)
        logger.info(
            "Email sent via SMTP",
            to_email=to_email,
            smtp_host=settings.smtp_host,
            smtp_port=settings.smtp_port,
        )
        return True
    except Exception as exc:
        logger.error(
            "Failed to send email via SMTP",
            to_email=to_email,
            smtp_host=settings.smtp_host,
            error_type=type(exc).__name__,
            error=str(exc),
        )
        return False


# ─── Shared HTML shell ──────────────────────────────────────
# Every transactional email (invitation, admin alert digests, and any new
# notification types) shares the same outer chrome — dark branded header,
# white card, optional footer. Extracted here so callers only build their
# own body content and never re-hand-roll the header/card/footer table
# markup (this used to be duplicated between _build_invitation_html and
# admin.py's Highgarden digest builder). Colors match the Teal + Coral
# visual system (tailwind.config.ts: brand-900 #0d3d3a, accent-600
# #e2542d, paper #f6f7fb) — the header bar is teal (structural), the CTA
# button is the one coral element, matching the "coral for primary actions
# only" rule the rest of the app follows.

def render_email_shell(
    *,
    eyebrow: str,
    heading: str,
    body_html: str,
    footer_html: str = "",
) -> str:
    """
    Wrap pre-built body HTML in the shared branded header/card/footer shell.

    `eyebrow` is HTML-escaped by this function — pass plain text.
    `heading`, `body_html`, and `footer_html` are inserted as-is (callers
    are responsible for escaping/rendering their own content, since some of
    it is already-safe HTML built via cms_service.render_html_template()).
    """
    footer_row = (
        f"""
          <tr>
            <td style="background-color:#f6f7fb;border-top:1px solid #dfe3ec;
                       padding:20px 36px;">
              <p style="margin:0;font-size:12px;color:#5b6478;line-height:1.6;">
                {footer_html}
              </p>
            </td>
          </tr>"""
        if footer_html
        else ""
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Talvyn</title>
</head>
<body style="margin:0;padding:0;background-color:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:#f6f7fb;padding:40px 20px;">
    <tr>
      <td align="center">

        <!-- Card -->
        <table width="560" cellpadding="0" cellspacing="0" border="0"
               style="background-color:#ffffff;border-radius:12px;
                      border:1px solid #dfe3ec;overflow:hidden;
                      max-width:560px;width:100%;">

          <!-- Header bar -->
          <tr>
            <td style="background-color:#0d3d3a;padding:28px 36px;">
              <p style="margin:0;font-size:13px;font-weight:600;
                        color:#9dc4bf;letter-spacing:0.05em;
                        text-transform:uppercase;">
                {html.escape(eyebrow)}
              </p>
              <h1 style="margin:6px 0 0 0;font-size:22px;font-weight:700;
                         color:#ffffff;line-height:1.3;">
                {heading}
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 36px;">
              {body_html}
            </td>
          </tr>
          {footer_row}

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>

</body>
</html>"""


# ─── HTML template ────────────────────────────────────────────

def _build_invitation_html(
    *,
    candidate_name: str,
    jd_title: str,
    magic_link: str,
    expires_at: datetime,
    test_titles: list[str],
    invited_by_name: str,
    platform_name: str,
    cms_template: dict[str, str] | None = None,
) -> str:
    """
    Build a clean, responsive HTML email for candidate invitations.

    Uses table-based layout for Outlook compatibility.
    All CSS is inlined — no external stylesheets.
    """
    # Normalise expiry to UTC display
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    expiry_str = expires_at.strftime("%A, %B %-d at %-I:%M %p UTC")
    template = {**DEFAULT_INVITATION_EMAIL_CONTENT, **(cms_template or {})}
    html_variables = {
        "candidateName": candidate_name,
        "jdTitle": jd_title,
        "invitedByName": invited_by_name,
        "platformName": platform_name,
        "magicLink": magic_link,
    }
    safe_magic_link = html.escape(magic_link, quote=True)

    # Build test list HTML
    test_list_items = "".join(
        f'<li style="margin-bottom:6px;color:#5b6478;">'
        f'<strong>{html.escape(title)}</strong>'
        f'</li>'
        for title in test_titles
    )
    test_list_html = (
        f'<ul style="margin:12px 0 0 0;padding-left:20px;">'
        f'{test_list_items}'
        f'</ul>'
        if test_list_items
        else ""
    )

    body_html = f"""
              <!-- Greeting -->
              <p style="margin:0 0 16px 0;font-size:15px;color:#141c2e;line-height:1.6;">
                {cms_service.render_html_template(str(template.get("greeting", "")), html_variables)}
              </p>
              <p style="margin:0 0 20px 0;font-size:15px;color:#5b6478;line-height:1.6;">
                {cms_service.render_html_template(str(template.get("intro", "")), html_variables)}
              </p>

              <!-- Assessment details box -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background-color:#eafaf7;border:1px solid #cdf3ec;
                            border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 8px 0;font-size:12px;font-weight:600;
                               color:#0d5f59;letter-spacing:0.05em;
                               text-transform:uppercase;">
                      {cms_service.render_html_template(str(template.get("includedLabel", "")), html_variables)}
                    </p>
                    {test_list_html}
                  </td>
                </tr>
              </table>

              <!-- CTA button -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <a href="{safe_magic_link}"
                       style="display:inline-block;background-color:#e2542d;
                              color:#ffffff;font-size:15px;font-weight:700;
                              text-decoration:none;padding:14px 36px;
                              border-radius:999px;letter-spacing:0.01em;">
                      {cms_service.render_html_template(str(template.get("ctaLabel", "")), html_variables)}
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Expiry warning -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background-color:#fffbeb;border:1px solid #fde68a;
                            border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:12px 16px;">
                    <p style="margin:0;font-size:13px;color:#92400e;line-height:1.5;">
                      <strong>&#9888; {cms_service.render_html_template(str(template.get("expiryLabel", "")), html_variables)}</strong> {html.escape(expiry_str)}<br>
                      {cms_service.render_html_template(str(template.get("expiryBody", "")), html_variables)}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Raw link fallback -->
              <p style="margin:0 0 8px 0;font-size:13px;color:#5b6478;">
                {cms_service.render_html_template(str(template.get("fallbackLabel", "")), html_variables)}
              </p>
              <p style="margin:0 0 24px 0;font-size:12px;color:#0d5f59;
                        word-break:break-all;font-family:monospace;">
                {safe_magic_link}
              </p>

              <!-- Instructions -->
              <p style="margin:0;font-size:13px;color:#5b6478;line-height:1.6;">
                {cms_service.render_html_template(str(template.get("instructions", "")), html_variables)}
              </p>
    """

    return render_email_shell(
        eyebrow=platform_name,
        heading=cms_service.render_html_template(str(template.get("heading", "")), html_variables),
        body_html=body_html,
        footer_html=cms_service.render_html_template(str(template.get("footer", "")), html_variables),
    )
