"""
Outbound webhook admin endpoints.

POST   /api/v1/admin/webhooks                 Create subscription (returns secret once)
GET    /api/v1/admin/webhooks                  List subscriptions
PATCH  /api/v1/admin/webhooks/{id}             Toggle active / update event types
DELETE /api/v1/admin/webhooks/{id}             Delete subscription
GET    /api/v1/admin/webhooks/{id}/deliveries  Paginated delivery log
POST   /api/v1/admin/webhooks/{id}/test        Send a test event immediately

All endpoints require X-Internal-Token (admin-only via Next.js).
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies import ActorId, AdminActor
from app.schemas.webhook import (
    CreateWebhookRequest,
    CreateWebhookResponse,
    UpdateWebhookRequest,
    WebhookDeliveryListResponse,
    WebhookDeliveryResponse,
    WebhookSubscriptionResponse,
)
from app.services import audit_log_service, webhook_service

router = APIRouter()


def _to_subscription_response(sub) -> WebhookSubscriptionResponse:
    return WebhookSubscriptionResponse(
        id=sub.id,
        url=sub.url,
        event_types=sub.event_types,
        is_active=sub.is_active,
        created_at=sub.created_at,
        updated_at=sub.updated_at,
    )


@router.post(
    "/",
    response_model=CreateWebhookResponse,
    status_code=201,
    summary="Create a webhook subscription — returns the signing secret once",
)
async def create_webhook(
    req: CreateWebhookRequest,
    _actor: AdminActor,
    actor_id: ActorId,
    db: AsyncSession = Depends(get_db),
) -> CreateWebhookResponse:
    subscription, raw_secret = await webhook_service.create_subscription(
        req.url, req.event_types, actor_id, db
    )
    await audit_log_service.record(
        db,
        actor_id=actor_id,
        action="WEBHOOK_CREATED",
        target_type="webhook_subscription",
        target_id=subscription.id,
        summary=f"Created webhook subscription for {subscription.url}",
        details={"event_types": subscription.event_types},
    )
    await db.commit()
    return CreateWebhookResponse(
        **_to_subscription_response(subscription).model_dump(),
        secret=raw_secret,
    )


@router.get(
    "/",
    response_model=list[WebhookSubscriptionResponse],
    summary="List webhook subscriptions",
)
async def list_webhooks(
    _actor: AdminActor,
    db: AsyncSession = Depends(get_db),
) -> list[WebhookSubscriptionResponse]:
    subscriptions = await webhook_service.list_subscriptions(db)
    return [_to_subscription_response(s) for s in subscriptions]


@router.patch(
    "/{subscription_id}",
    response_model=WebhookSubscriptionResponse,
    summary="Toggle active state or update event types",
)
async def update_webhook(
    subscription_id: str,
    req: UpdateWebhookRequest,
    _actor: AdminActor,
    actor_id: ActorId,
    db: AsyncSession = Depends(get_db),
) -> WebhookSubscriptionResponse:
    subscription = await webhook_service.update_subscription(
        subscription_id,
        db,
        is_active=req.is_active,
        event_types=req.event_types,
    )
    await audit_log_service.record(
        db,
        actor_id=actor_id,
        action="WEBHOOK_UPDATED",
        target_type="webhook_subscription",
        target_id=subscription.id,
        summary=f"Updated webhook subscription for {subscription.url}",
        details={"is_active": req.is_active, "event_types": req.event_types},
    )
    await db.commit()
    return _to_subscription_response(subscription)


@router.delete(
    "/{subscription_id}",
    status_code=204,
    summary="Delete a webhook subscription",
)
async def delete_webhook(
    subscription_id: str,
    _actor: AdminActor,
    actor_id: ActorId,
    db: AsyncSession = Depends(get_db),
) -> None:
    await webhook_service.delete_subscription(subscription_id, db)
    await audit_log_service.record(
        db,
        actor_id=actor_id,
        action="WEBHOOK_DELETED",
        target_type="webhook_subscription",
        target_id=subscription_id,
    )
    await db.commit()


@router.get(
    "/{subscription_id}/deliveries",
    response_model=WebhookDeliveryListResponse,
    summary="Paginated delivery log for a subscription",
)
async def list_webhook_deliveries(
    subscription_id: str,
    _actor: AdminActor,
    db: AsyncSession = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> WebhookDeliveryListResponse:
    data = await webhook_service.list_deliveries(
        subscription_id, db, page=page, page_size=page_size
    )
    return WebhookDeliveryListResponse(
        items=[WebhookDeliveryResponse.model_validate(d, from_attributes=True) for d in data["items"]],
        total=data["total"],
        page=data["page"],
        page_size=data["page_size"],
        total_pages=data["total_pages"],
    )


@router.post(
    "/{subscription_id}/test",
    response_model=WebhookDeliveryResponse,
    summary="Send a test event immediately",
)
async def test_webhook(
    subscription_id: str,
    _actor: AdminActor,
    db: AsyncSession = Depends(get_db),
) -> WebhookDeliveryResponse:
    delivery = await webhook_service.send_test_event(subscription_id, db)
    return WebhookDeliveryResponse.model_validate(delivery, from_attributes=True)
