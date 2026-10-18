"""
Webhook Service.

Manages outbound webhook subscriptions and delivers events to them:
  enqueue_event()    — called from lifecycle hooks (invitation created,
                        attempt started/submitted, evaluation completed) to
                        fan out a matching event to every active subscription
  dispatch_delivery() — runs in the ARQ worker, does the signed HTTP POST,
                        and retries with backoff on failure

A webhook failure must never break the request it's attached to — enqueue_event
logs and returns rather than raising if anything about delivery setup fails.
"""

import json
from datetime import UTC, datetime
from typing import Any

import httpx
from arq import Retry
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.core.security import generate_webhook_secret, sign_webhook_payload
from app.db.models.webhook import WebhookDelivery, WebhookSubscription

logger = get_logger(__name__)

DELIVERY_TIMEOUT_SECONDS = 10.0
MAX_DELIVERY_ATTEMPTS = 5

# Set once at FastAPI startup (main.py) so service-layer code can enqueue ARQ
# jobs without a Request object — mirrors attempt_service.set_redis_client().
_arq_pool: Any | None = None


def set_arq_pool(pool: Any) -> None:
    global _arq_pool
    _arq_pool = pool


# ─── Subscriptions ──────────────────────────────────────────────

async def create_subscription(
    url: str,
    event_types: list[str],
    actor_id: str | None,
    db: AsyncSession,
) -> tuple[WebhookSubscription, str]:
    """Create a subscription. Returns (subscription, raw_secret) — the secret
    is never persisted in plaintext anywhere else and never returned again."""
    raw_secret = generate_webhook_secret()
    subscription = WebhookSubscription(
        url=url,
        secret=raw_secret,
        event_types=event_types,
        created_by=actor_id,
    )
    db.add(subscription)
    await db.flush()
    await db.refresh(subscription)
    logger.info("Webhook subscription created", subscription_id=subscription.id, url=url)
    return subscription, raw_secret


async def list_subscriptions(db: AsyncSession) -> list[WebhookSubscription]:
    result = await db.execute(
        select(WebhookSubscription).order_by(desc(WebhookSubscription.created_at))
    )
    return list(result.scalars().all())


async def _get_subscription(subscription_id: str, db: AsyncSession) -> WebhookSubscription:
    result = await db.execute(
        select(WebhookSubscription).where(WebhookSubscription.id == subscription_id)
    )
    subscription = result.scalar_one_or_none()
    if subscription is None:
        raise NotFoundError("WebhookSubscription", subscription_id)
    return subscription


async def update_subscription(
    subscription_id: str,
    db: AsyncSession,
    *,
    is_active: bool | None = None,
    event_types: list[str] | None = None,
) -> WebhookSubscription:
    subscription = await _get_subscription(subscription_id, db)
    if is_active is not None:
        subscription.is_active = is_active
    if event_types is not None:
        subscription.event_types = event_types
    await db.flush()
    await db.refresh(subscription)
    return subscription


async def delete_subscription(subscription_id: str, db: AsyncSession) -> None:
    subscription = await _get_subscription(subscription_id, db)
    await db.delete(subscription)
    await db.flush()
    logger.info("Webhook subscription deleted", subscription_id=subscription_id)


# ─── Deliveries ─────────────────────────────────────────────────

async def list_deliveries(
    subscription_id: str,
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    offset = (page - 1) * page_size

    total_result = await db.execute(
        select(func.count(WebhookDelivery.id)).where(
            WebhookDelivery.subscription_id == subscription_id
        )
    )
    total: int = total_result.scalar_one()

    rows_result = await db.execute(
        select(WebhookDelivery)
        .where(WebhookDelivery.subscription_id == subscription_id)
        .order_by(desc(WebhookDelivery.created_at))
        .offset(offset)
        .limit(page_size)
    )
    items = list(rows_result.scalars().all())

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, -(-total // page_size)) if total else 1,
    }


async def enqueue_event(event_type: str, data: dict[str, Any], db: AsyncSession) -> None:
    """
    Fan an event out to every active subscription whose event_types include it.
    Called from invitation_service.create_invitation, attempt_service.start_attempt
    / submit_attempt, and evaluation_service.evaluate_attempt.
    """
    if _arq_pool is None:
        logger.debug("Webhook dispatch skipped — arq pool not set", event_type=event_type)
        return

    try:
        result = await db.execute(
            select(WebhookSubscription).where(WebhookSubscription.is_active.is_(True))
        )
        subscriptions = [
            s for s in result.scalars().all() if event_type in (s.event_types or [])
        ]
        if not subscriptions:
            return

        for subscription in subscriptions:
            delivery = WebhookDelivery(
                subscription_id=subscription.id,
                event_type=event_type,
                payload=data,
                status="PENDING",
            )
            db.add(delivery)
            await db.flush()
            await _arq_pool.enqueue_job("task_dispatch_webhook", delivery.id)

        await db.commit()
    except Exception:
        logger.exception("Failed to enqueue webhook event", event_type=event_type)


def _build_envelope(delivery: WebhookDelivery) -> bytes:
    envelope = {
        "event": delivery.event_type,
        "event_id": delivery.id,
        "created_at": delivery.created_at.isoformat(),
        "data": delivery.payload,
    }
    return json.dumps(envelope).encode("utf-8")


async def dispatch_delivery(delivery_id: str, db: AsyncSession, job_try: int) -> None:
    """Runs in the ARQ worker. Signs + POSTs the delivery, updates its status,
    and raises arq.Retry with backoff on failure (up to MAX_DELIVERY_ATTEMPTS)."""
    result = await db.execute(
        select(WebhookDelivery).where(WebhookDelivery.id == delivery_id)
    )
    delivery = result.scalar_one_or_none()
    if delivery is None:
        logger.warning("Webhook delivery not found, skipping", delivery_id=delivery_id)
        return

    sub_result = await db.execute(
        select(WebhookSubscription).where(WebhookSubscription.id == delivery.subscription_id)
    )
    subscription = sub_result.scalar_one_or_none()
    if subscription is None or not subscription.is_active:
        delivery.status = "FAILED"
        delivery.error_message = "Subscription deleted or deactivated"
        await db.commit()
        return

    body = _build_envelope(delivery)
    signature = sign_webhook_payload(subscription.secret, body)
    delivery.attempt_count = job_try

    try:
        async with httpx.AsyncClient(timeout=DELIVERY_TIMEOUT_SECONDS) as client:
            response = await client.post(
                subscription.url,
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Talvyn-Event": delivery.event_type,
                    "X-Talvyn-Delivery": delivery.id,
                    "X-Talvyn-Signature": f"sha256={signature}",
                },
            )
        delivery.response_status_code = response.status_code

        if 200 <= response.status_code < 300:
            delivery.status = "SUCCESS"
            delivery.delivered_at = datetime.now(tz=UTC)
            delivery.error_message = None
            await db.commit()
            return

        delivery.error_message = f"Upstream returned {response.status_code}"
    except httpx.HTTPError as exc:
        delivery.error_message = str(exc)[:500]

    if job_try >= MAX_DELIVERY_ATTEMPTS:
        delivery.status = "FAILED"
        await db.commit()
        logger.warning(
            "Webhook delivery failed permanently",
            delivery_id=delivery_id,
            attempts=job_try,
        )
        return

    await db.commit()
    # Exponential backoff: 5s, 25s, 125s, 625s ...
    raise Retry(defer=5 * (5 ** (job_try - 1)))


async def send_test_event(subscription_id: str, db: AsyncSession) -> WebhookDelivery:
    """Builds and immediately dispatches a synthetic webhook.test event,
    bypassing the queue so the admin gets instant feedback."""
    subscription = await _get_subscription(subscription_id, db)
    delivery = WebhookDelivery(
        subscription_id=subscription.id,
        event_type="webhook.test",
        payload={"message": "This is a test event from Talvyn."},
        status="PENDING",
    )
    db.add(delivery)
    await db.commit()
    await db.refresh(delivery)

    # job_try == MAX_DELIVERY_ATTEMPTS short-circuits dispatch_delivery's retry
    # branch, so a failure here marks FAILED immediately instead of queuing —
    # the admin gets a definitive result rather than "pending forever".
    await dispatch_delivery(delivery.id, db, job_try=MAX_DELIVERY_ATTEMPTS)

    await db.refresh(delivery)
    return delivery
