"""
Integration tests for outbound webhooks: subscription CRUD, event fan-out,
signing, and delivery dispatch with retry. DB uses in-memory SQLite.
"""

import hashlib
import hmac
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from arq import Retry
from httpx import AsyncClient
from sqlalchemy import select

from app.core.security import generate_webhook_secret, sign_webhook_payload
from app.db.models.audit_log import AdminAuditLog
from app.db.models.webhook import WebhookDelivery, WebhookSubscription
from app.services import webhook_service

ACTOR_ID = "00000000-0000-0000-0000-000000000000"


@pytest.fixture(autouse=True)
async def _seed_admin_actor(db_session):
    """Webhook routes now require an ADMIN+ actor (require_min_role(ADMIN)).
    The client fixture forwards X-Actor-Id=ACTOR_ID, so seed that user as an
    ADMIN. `merge` is idempotent against the session-scoped in-memory DB."""
    from app.db.models.enums import Role
    from app.db.models.user import User

    await db_session.merge(
        User(
            id=ACTOR_ID,
            email="webhook-admin@example.com",
            name="Webhook Admin",
            password_hash="not-used",
            role=Role.ADMIN,
            is_active=True,
        )
    )
    await db_session.commit()


def _make_mock_response(status_code: int = 200):
    mock = MagicMock()
    mock.status_code = status_code
    return mock


# ─── Subscription CRUD (API) ────────────────────────────────────

class TestWebhookCRUD:
    async def test_create_returns_secret_once(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/admin/webhooks/",
            json={"url": "https://example.com/hook", "event_types": ["invitation.created"]},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert "secret" in body and len(body["secret"]) == 64
        assert body["url"] == "https://example.com/hook"
        assert body["is_active"] is True

    async def test_list_never_exposes_secret(self, client: AsyncClient):
        create_resp = await client.post(
            "/api/v1/admin/webhooks/",
            json={"url": "https://example.com/hook", "event_types": ["invitation.created"]},
        )
        sub_id = create_resp.json()["id"]

        resp = await client.get("/api/v1/admin/webhooks/")
        assert resp.status_code == 200
        items = resp.json()
        own_item = next(item for item in items if item["id"] == sub_id)
        assert "secret" not in own_item
        assert all("secret" not in item for item in items)

    async def test_update_toggles_active(self, client: AsyncClient):
        create_resp = await client.post(
            "/api/v1/admin/webhooks/",
            json={"url": "https://example.com/hook", "event_types": ["invitation.created"]},
        )
        sub_id = create_resp.json()["id"]

        resp = await client.patch(
            f"/api/v1/admin/webhooks/{sub_id}", json={"is_active": False}
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False

    async def test_delete_removes_subscription(self, client: AsyncClient, db_session):
        create_resp = await client.post(
            "/api/v1/admin/webhooks/",
            json={"url": "https://example.com/hook", "event_types": ["invitation.created"]},
        )
        sub_id = create_resp.json()["id"]

        resp = await client.delete(f"/api/v1/admin/webhooks/{sub_id}")
        assert resp.status_code == 204

        result = await db_session.execute(
            select(WebhookSubscription).where(WebhookSubscription.id == sub_id)
        )
        assert result.scalar_one_or_none() is None

    async def test_mutations_write_audit_log(self, client: AsyncClient, db_session):
        create_resp = await client.post(
            "/api/v1/admin/webhooks/",
            json={"url": "https://example.com/hook", "event_types": ["invitation.created"]},
        )
        sub_id = create_resp.json()["id"]
        await client.delete(f"/api/v1/admin/webhooks/{sub_id}")

        result = await db_session.execute(
            select(AdminAuditLog).where(AdminAuditLog.target_id == sub_id)
        )
        actions = {e.action for e in result.scalars().all()}
        assert actions == {"WEBHOOK_CREATED", "WEBHOOK_DELETED"}

    async def test_create_rejects_non_https_url(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/admin/webhooks/",
            json={"url": "http://example.com/hook", "event_types": ["invitation.created"]},
        )
        assert resp.status_code == 422

    async def test_create_rejects_localhost_url(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/admin/webhooks/",
            json={"url": "https://localhost/hook", "event_types": ["invitation.created"]},
        )
        assert resp.status_code == 422

    async def test_create_rejects_private_ip_url(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/admin/webhooks/",
            json={"url": "https://10.0.0.5/hook", "event_types": ["invitation.created"]},
        )
        assert resp.status_code == 422


# ─── Signing ─────────────────────────────────────────────────────

class TestSigning:
    def test_sign_and_verify_round_trip(self):
        secret = generate_webhook_secret()
        body = b'{"event":"invitation.created"}'
        signature = sign_webhook_payload(secret, body)

        expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        assert hmac.compare_digest(signature, expected)

    def test_different_secrets_produce_different_signatures(self):
        body = b'{"event":"invitation.created"}'
        sig1 = sign_webhook_payload(generate_webhook_secret(), body)
        sig2 = sign_webhook_payload(generate_webhook_secret(), body)
        assert sig1 != sig2


# ─── enqueue_event ───────────────────────────────────────────────

class TestEnqueueEvent:
    """
    Each test uses its own unique event-type token (rather than a shared
    real event name like "invitation.created") so a subscription leaked
    from an unrelated test can never coincidentally match and pollute the
    assertions here — these tests only care about *this* subscription's
    matching logic, not the table's total contents.
    """

    async def test_enqueues_for_matching_active_subscription(self, db_session):
        event_type = "test.enqueue.matching"
        sub = WebhookSubscription(
            url="https://example.com/hook",
            secret=generate_webhook_secret(),
            event_types=[event_type],
        )
        db_session.add(sub)
        await db_session.commit()

        mock_pool = MagicMock()
        mock_pool.enqueue_job = AsyncMock()
        webhook_service.set_arq_pool(mock_pool)
        try:
            await webhook_service.enqueue_event(
                event_type, {"invitation_id": "abc"}, db_session
            )
        finally:
            webhook_service.set_arq_pool(None)

        mock_pool.enqueue_job.assert_called_once()
        assert mock_pool.enqueue_job.call_args[0][0] == "task_dispatch_webhook"

        result = await db_session.execute(
            select(WebhookDelivery).where(WebhookDelivery.subscription_id == sub.id)
        )
        deliveries = result.scalars().all()
        assert len(deliveries) == 1
        assert deliveries[0].event_type == event_type
        assert deliveries[0].status == "PENDING"

    async def test_skips_inactive_subscription(self, db_session):
        event_type = "test.enqueue.inactive"
        sub = WebhookSubscription(
            url="https://example.com/hook",
            secret=generate_webhook_secret(),
            event_types=[event_type],
            is_active=False,
        )
        db_session.add(sub)
        await db_session.commit()

        mock_pool = MagicMock()
        mock_pool.enqueue_job = AsyncMock()
        webhook_service.set_arq_pool(mock_pool)
        try:
            await webhook_service.enqueue_event(
                event_type, {"invitation_id": "abc"}, db_session
            )
        finally:
            webhook_service.set_arq_pool(None)

        mock_pool.enqueue_job.assert_not_called()
        result = await db_session.execute(
            select(WebhookDelivery).where(WebhookDelivery.subscription_id == sub.id)
        )
        assert result.scalars().all() == []

    async def test_skips_non_matching_event_type(self, db_session):
        sub = WebhookSubscription(
            url="https://example.com/hook",
            secret=generate_webhook_secret(),
            event_types=["test.enqueue.other_type"],
        )
        db_session.add(sub)
        await db_session.commit()

        mock_pool = MagicMock()
        mock_pool.enqueue_job = AsyncMock()
        webhook_service.set_arq_pool(mock_pool)
        try:
            await webhook_service.enqueue_event(
                "test.enqueue.unmatched", {"invitation_id": "abc"}, db_session
            )
        finally:
            webhook_service.set_arq_pool(None)

        result = await db_session.execute(
            select(WebhookDelivery).where(WebhookDelivery.subscription_id == sub.id)
        )
        assert result.scalars().all() == []

    async def test_noop_when_pool_not_set(self, db_session):
        event_type = "test.enqueue.no_pool"
        sub = WebhookSubscription(
            url="https://example.com/hook",
            secret=generate_webhook_secret(),
            event_types=[event_type],
        )
        db_session.add(sub)
        await db_session.commit()

        webhook_service.set_arq_pool(None)
        # Must not raise even though a matching subscription exists.
        await webhook_service.enqueue_event(
            event_type, {"invitation_id": "abc"}, db_session
        )

        result = await db_session.execute(
            select(WebhookDelivery).where(WebhookDelivery.subscription_id == sub.id)
        )
        assert result.scalars().all() == []


# ─── dispatch_delivery ───────────────────────────────────────────

class TestDispatchDelivery:
    async def _seed_delivery(self, db_session) -> tuple[WebhookSubscription, WebhookDelivery]:
        sub = WebhookSubscription(
            url="https://example.com/hook",
            secret=generate_webhook_secret(),
            event_types=["invitation.created"],
        )
        db_session.add(sub)
        await db_session.flush()
        delivery = WebhookDelivery(
            subscription_id=sub.id,
            event_type="invitation.created",
            payload={"invitation_id": "abc"},
            status="PENDING",
        )
        db_session.add(delivery)
        await db_session.commit()
        return sub, delivery

    async def test_success_marks_delivered(self, db_session):
        sub, delivery = await self._seed_delivery(db_session)

        with patch("app.services.webhook_service.httpx.AsyncClient") as MockClient:
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_ctx.post = AsyncMock(return_value=_make_mock_response(200))
            MockClient.return_value = mock_ctx

            await webhook_service.dispatch_delivery(delivery.id, db_session, job_try=1)

        await db_session.refresh(delivery)
        assert delivery.status == "SUCCESS"
        assert delivery.response_status_code == 200
        assert delivery.delivered_at is not None

        # Signature header must verify against the subscription's secret.
        sent_kwargs = mock_ctx.post.call_args.kwargs
        signature = sent_kwargs["headers"]["X-Talvyn-Signature"].removeprefix("sha256=")
        expected = sign_webhook_payload(sub.secret, sent_kwargs["content"])
        assert hmac.compare_digest(signature, expected)

    async def test_failure_retries_with_backoff(self, db_session):
        _, delivery = await self._seed_delivery(db_session)

        with patch("app.services.webhook_service.httpx.AsyncClient") as MockClient:
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_ctx.post = AsyncMock(return_value=_make_mock_response(500))
            MockClient.return_value = mock_ctx

            with pytest.raises(Retry):
                await webhook_service.dispatch_delivery(delivery.id, db_session, job_try=1)

        await db_session.refresh(delivery)
        assert delivery.status == "PENDING"
        assert delivery.response_status_code == 500

    async def test_gives_up_after_max_attempts(self, db_session):
        _, delivery = await self._seed_delivery(db_session)

        with patch("app.services.webhook_service.httpx.AsyncClient") as MockClient:
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_ctx.post = AsyncMock(return_value=_make_mock_response(500))
            MockClient.return_value = mock_ctx

            # Should NOT raise once max attempts are reached — gives up cleanly.
            await webhook_service.dispatch_delivery(
                delivery.id, db_session, job_try=webhook_service.MAX_DELIVERY_ATTEMPTS
            )

        await db_session.refresh(delivery)
        assert delivery.status == "FAILED"


# ─── Lifecycle hook wiring ───────────────────────────────────────

class TestLifecycleHooks:
    async def test_create_invitation_enqueues_webhook(self, client: AsyncClient, db_session):
        import uuid

        from app.db.models.enums import (
            Difficulty,
            FileType,
            ParseStatus,
            TestStatus,
            TestType,
        )
        from app.db.models.job_description import JdExtractedData, JobDescription
        from app.db.models.test import Test

        jd_id = str(uuid.uuid4())
        jd = JobDescription(
            id=jd_id,
            uploaded_by=ACTOR_ID,
            original_filename="role.pdf",
            file_path="jds/role.pdf",
            file_type=FileType.PDF,
            raw_text="Role",
            parse_status=ParseStatus.DONE,
        )
        extracted = JdExtractedData(
            jd_id=jd_id, job_title="Engineer", seniority_level="senior",
            must_have_skills=[], nice_to_have_skills=[], tools_technologies=[],
            responsibilities=[], recommended_test_topics=[], difficulty_distribution={},
        )
        test = Test(
            id=str(uuid.uuid4()), jd_id=jd_id, test_type=TestType.TECHNICAL,
            title="Screening", duration_minutes=30, total_marks=20,
            difficulty=Difficulty.MIXED, status=TestStatus.APPROVED,
        )
        db_session.add_all([jd, extracted, test])

        sub = WebhookSubscription(
            url="https://example.com/hook",
            secret=generate_webhook_secret(),
            event_types=["invitation.created"],
        )
        db_session.add(sub)
        await db_session.commit()

        with patch(
            "app.services.invitation_service.send_invitation_email",
            new=AsyncMock(return_value=True),
        ):
            resp = await client.post(
                "/api/v1/invitations/",
                json={
                    "candidate_name": "Eve",
                    "candidate_email": "eve@example.com",
                    "jd_id": jd_id,
                },
            )
        assert resp.status_code == 201

        result = await db_session.execute(
            select(WebhookDelivery).where(WebhookDelivery.subscription_id == sub.id)
        )
        deliveries = result.scalars().all()
        assert len(deliveries) == 1
        assert deliveries[0].event_type == "invitation.created"
        assert deliveries[0].payload["candidate_email"] == "eve@example.com"
