"""
Internal transactional-email endpoint tests.

These back the signup/access-request flow, whose data lives entirely in
Prisma on the Next.js side — FastAPI has no user row to look at here, so
these endpoints are guarded by the internal token alone (see the module
docstring on app/api/v1/internal_emails.py). That makes the token check the
only thing standing between an untrusted caller and an email-sending
endpoint, which is why it is tested explicitly below.

send_html_email is patched throughout: the point is the endpoint contract
and the rendered content, not the SMTP/Resend transport.
"""

import unittest.mock as mock

import pytest

APPROVED_PAYLOAD = {
    "to_email": "requester@example.com",
    "to_name": "Ada Lovelace",
    "decision": "APPROVED",
}

REQUEST_PAYLOAD = {
    "admin_emails": ["super1@example.com", "super2@example.com"],
    "requester_name": "Ada Lovelace",
    "requester_email": "requester@example.com",
    "company_name": "Analytical Engines Ltd",
}


def _patch_send(return_value=True):
    return mock.patch(
        "app.api.v1.internal_emails.send_html_email",
        new=mock.AsyncMock(return_value=return_value),
    )


# ─── Approval / rejection notice ─────────────────────────────


@pytest.mark.asyncio
async def test_approval_email_is_sent_to_the_requester(client):
    with _patch_send() as send:
        res = await client.post(
            "/api/v1/internal/emails/signup-decision", json=APPROVED_PAYLOAD
        )

    assert res.status_code == 200, res.text
    assert res.json() == {"sent": 1, "failed": 0}

    send.assert_awaited_once()
    kwargs = send.await_args.kwargs
    assert kwargs["to_email"] == "requester@example.com"
    assert "approved" in kwargs["subject"].lower()
    body = kwargs["html_body"]
    assert "Ada Lovelace" in body
    assert "approved your access" in body
    # The whole point of the email is that the user can now get in.
    assert "/login" in body
    assert "Sign in" in body


@pytest.mark.asyncio
async def test_rejection_email_differs_from_the_approval_email(client):
    with _patch_send() as send:
        res = await client.post(
            "/api/v1/internal/emails/signup-decision",
            json={**APPROVED_PAYLOAD, "decision": "REJECTED"},
        )

    assert res.status_code == 200
    body = send.await_args.kwargs["html_body"]
    assert "declined" in send.await_args.kwargs["subject"].lower()
    assert "declined it" in body
    # A rejected requester must not be handed a sign-in call to action.
    assert "Sign in" not in body


@pytest.mark.asyncio
async def test_decision_endpoint_reports_a_send_failure(client):
    """Delivery failures are reported, not swallowed — the caller logs them."""
    with _patch_send(return_value=False):
        res = await client.post(
            "/api/v1/internal/emails/signup-decision", json=APPROVED_PAYLOAD
        )

    assert res.status_code == 200
    assert res.json() == {"sent": 0, "failed": 1}


@pytest.mark.asyncio
async def test_decision_endpoint_rejects_an_unknown_decision(client):
    with _patch_send() as send:
        res = await client.post(
            "/api/v1/internal/emails/signup-decision",
            json={**APPROVED_PAYLOAD, "decision": "MAYBE"},
        )

    assert res.status_code == 422
    send.assert_not_awaited()


@pytest.mark.asyncio
async def test_decision_endpoint_rejects_a_malformed_email(client):
    with _patch_send() as send:
        res = await client.post(
            "/api/v1/internal/emails/signup-decision",
            json={**APPROVED_PAYLOAD, "to_email": "not-an-email"},
        )

    assert res.status_code == 422
    send.assert_not_awaited()


@pytest.mark.asyncio
async def test_recipient_name_is_html_escaped(client):
    """
    to_name comes from a public signup form, so it is attacker-controlled and
    lands directly in an HTML email body.
    """
    with _patch_send() as send:
        res = await client.post(
            "/api/v1/internal/emails/signup-decision",
            json={**APPROVED_PAYLOAD, "to_name": "<script>alert(1)</script>"},
        )

    assert res.status_code == 200
    body = send.await_args.kwargs["html_body"]
    assert "<script>" not in body
    assert "&lt;script&gt;" in body


@pytest.mark.asyncio
async def test_decision_endpoint_requires_the_internal_token(client):
    with _patch_send() as send:
        res = await client.post(
            "/api/v1/internal/emails/signup-decision",
            json=APPROVED_PAYLOAD,
            headers={"X-Internal-Token": "wrong"},
        )

    assert res.status_code in (401, 403)
    send.assert_not_awaited()


# ─── New-request notice to Super Admins ──────────────────────


@pytest.mark.asyncio
async def test_signup_request_notifies_every_super_admin(client):
    with _patch_send() as send:
        res = await client.post(
            "/api/v1/internal/emails/signup-request", json=REQUEST_PAYLOAD
        )

    assert res.status_code == 200, res.text
    assert res.json() == {"sent": 2, "failed": 0}
    assert send.await_count == 2
    recipients = {call.kwargs["to_email"] for call in send.await_args_list}
    assert recipients == {"super1@example.com", "super2@example.com"}

    body = send.await_args_list[0].kwargs["html_body"]
    assert "Ada Lovelace" in body
    assert "Analytical Engines Ltd" in body


@pytest.mark.asyncio
async def test_signup_request_counts_partial_delivery_failures(client):
    with mock.patch(
        "app.api.v1.internal_emails.send_html_email",
        new=mock.AsyncMock(side_effect=[True, False]),
    ):
        res = await client.post(
            "/api/v1/internal/emails/signup-request", json=REQUEST_PAYLOAD
        )

    assert res.json() == {"sent": 1, "failed": 1}


@pytest.mark.asyncio
async def test_signup_request_requires_at_least_one_admin(client):
    with _patch_send() as send:
        res = await client.post(
            "/api/v1/internal/emails/signup-request",
            json={**REQUEST_PAYLOAD, "admin_emails": []},
        )

    assert res.status_code == 422
    send.assert_not_awaited()


@pytest.mark.asyncio
async def test_signup_request_escapes_requester_supplied_fields(client):
    with _patch_send() as send:
        res = await client.post(
            "/api/v1/internal/emails/signup-request",
            json={**REQUEST_PAYLOAD, "company_name": "<img src=x onerror=alert(1)>"},
        )

    assert res.status_code == 200
    body = send.await_args.kwargs["html_body"]
    assert "<img" not in body
    assert "&lt;img" in body


@pytest.mark.asyncio
async def test_signup_request_requires_the_internal_token(client):
    with _patch_send() as send:
        res = await client.post(
            "/api/v1/internal/emails/signup-request",
            json=REQUEST_PAYLOAD,
            headers={"X-Internal-Token": "wrong"},
        )

    assert res.status_code in (401, 403)
    send.assert_not_awaited()


# ─── Password reset notification ─────────────────────────────


@pytest.mark.asyncio
async def test_password_reset_email_is_sent_with_token_link(client):
    payload = {
        "to_email": "user@example.com",
        "to_name": "Test User",
        "token": "a" * 64,
    }
    with _patch_send() as send:
        res = await client.post("/api/v1/internal/emails/password-reset", json=payload)

    assert res.status_code == 200, res.text
    assert res.json() == {"sent": 1, "failed": 0}

    send.assert_awaited_once()
    kwargs = send.await_args.kwargs
    assert kwargs["to_email"] == "user@example.com"
    assert "reset your talvyn password" in kwargs["subject"].lower()
    body = kwargs["html_body"]
    assert "Test User" in body
    assert f"/reset-password?token={'a' * 64}" in body
    assert "Reset Password" in body


@pytest.mark.asyncio
async def test_password_reset_email_rejects_invalid_token(client):
    payload = {
        "to_email": "user@example.com",
        "to_name": "Test User",
        "token": "too-short",
    }
    with _patch_send() as send:
        res = await client.post("/api/v1/internal/emails/password-reset", json=payload)

    assert res.status_code == 422
    send.assert_not_awaited()


@pytest.mark.asyncio
async def test_password_reset_requires_internal_token(client):
    payload = {
        "to_email": "user@example.com",
        "to_name": "Test User",
        "token": "b" * 64,
    }
    with _patch_send() as send:
        res = await client.post(
            "/api/v1/internal/emails/password-reset",
            json=payload,
            headers={"X-Internal-Token": "wrong"},
        )

    assert res.status_code in (401, 403)
    send.assert_not_awaited()


# ─── Password changed notice ─────────────────────────────────


@pytest.mark.asyncio
async def test_password_changed_email_is_sent(client):
    payload = {
        "to_email": "user@example.com",
        "to_name": "Test User",
    }
    with _patch_send() as send:
        res = await client.post("/api/v1/internal/emails/password-changed", json=payload)

    assert res.status_code == 200, res.text
    assert res.json() == {"sent": 1, "failed": 0}

    send.assert_awaited_once()
    kwargs = send.await_args.kwargs
    assert kwargs["to_email"] == "user@example.com"
    assert "password was changed" in kwargs["subject"].lower()
    body = kwargs["html_body"]
    assert "Test User" in body
    assert "contact your administrator immediately" in body


@pytest.mark.asyncio
async def test_password_changed_requires_internal_token(client):
    payload = {
        "to_email": "user@example.com",
        "to_name": "Test User",
    }
    with _patch_send() as send:
        res = await client.post(
            "/api/v1/internal/emails/password-changed",
            json=payload,
            headers={"X-Internal-Token": "wrong"},
        )

    assert res.status_code in (401, 403)
    send.assert_not_awaited()

