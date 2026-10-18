"""Schemas for outbound webhook subscriptions and deliveries."""

import ipaddress
from datetime import datetime
from urllib.parse import urlsplit

from pydantic import BaseModel, Field, field_validator

_BLOCKED_DNS_SUFFIXES = (
    ".arpa",
    ".corp",
    ".home",
    ".internal",
    ".lan",
    ".local",
    ".localhost",
    ".localdomain",
)
_BLOCKED_HOSTS = {
    "localhost",
    "localhost.localdomain",
    "metadata.google.internal",
}


def _is_unsafe_ip(hostname: str) -> bool:
    try:
        ip = ipaddress.ip_address(hostname)
    except ValueError:
        return False

    return any(
        (
            ip.is_loopback,
            ip.is_private,
            ip.is_link_local,
            ip.is_multicast,
            ip.is_reserved,
            ip.is_unspecified,
        )
    )


def _validate_webhook_url(url: str) -> str:
    parsed = urlsplit(url)
    if parsed.scheme != "https":
        raise ValueError("Webhook URL must use https.")
    if parsed.username or parsed.password:
        raise ValueError("Webhook URL must not include credentials.")
    if not parsed.hostname:
        raise ValueError("Webhook URL must include a host.")

    host = parsed.hostname.rstrip(".").lower()
    if host in _BLOCKED_HOSTS or host.endswith(_BLOCKED_DNS_SUFFIXES):
        raise ValueError("Webhook URL host is not allowed.")
    if "." not in host and not _is_unsafe_ip(host):
        raise ValueError("Webhook URL must use a public fully qualified host.")
    if _is_unsafe_ip(host):
        raise ValueError("Webhook URL must not target private or local IP ranges.")

    return url


class CreateWebhookRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2048)
    event_types: list[str] = Field(min_length=1)

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        return _validate_webhook_url(value)


class UpdateWebhookRequest(BaseModel):
    is_active: bool | None = None
    event_types: list[str] | None = None


class WebhookSubscriptionResponse(BaseModel):
    id: str
    url: str
    event_types: list[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime


class CreateWebhookResponse(WebhookSubscriptionResponse):
    # Only ever present on the creation response — never re-displayed.
    secret: str


class WebhookDeliveryResponse(BaseModel):
    id: str
    event_type: str
    status: str
    response_status_code: int | None
    attempt_count: int
    error_message: str | None
    created_at: datetime
    delivered_at: datetime | None


class WebhookDeliveryListResponse(BaseModel):
    items: list[WebhookDeliveryResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
