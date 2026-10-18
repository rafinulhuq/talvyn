"""
Rate limiting configuration (slowapi).

All routes that call Ollama are protected here.  The key function uses the
X-Uploader-Id header (the authenticated user's DB id, injected by Next.js)
so limits are per-user rather than per-IP.  This matters because every request
to FastAPI comes from the Next.js container — all sharing the same source IP —
so IP-based limiting would treat every user identically.

Public and candidate routes can use the client IP forwarded by the Next.js
proxy, but only when the proxy proves itself with the internal API secret.
Direct API calls fall back to the socket IP.

Rate limits applied:
  POST /jd/{id}/analyze    — 5 calls / minute  (Ollama skill extraction)
  POST /tests/generate     — 3 calls / minute  (Ollama test generation, 3 models)
  POST /jd/upload          — 10 calls / minute (file I/O + background parse)
  POST /evaluation/trigger — 5 calls / minute  (Ollama evaluation pipeline)
"""

import hashlib
import hmac
import ipaddress

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import get_settings

_CLIENT_IP_HEADER = "x-talvyn-client-ip"


def _verified_internal_proxy(request: Request, internal_secret: str) -> bool:
    provided = request.headers.get("x-internal-token")
    if not provided:
        return False

    return hmac.compare_digest(
        hashlib.sha256(internal_secret.encode("utf-8")).digest(),
        hashlib.sha256(provided.encode("utf-8")).digest(),
    )


def _trusted_proxy_client_ip(request: Request, internal_secret: str) -> str | None:
    if not _verified_internal_proxy(request, internal_secret):
        return None

    raw_ip = request.headers.get(_CLIENT_IP_HEADER)
    if not raw_ip:
        return None

    try:
        return str(ipaddress.ip_address(raw_ip.strip()))
    except ValueError:
        return None


def get_client_ip(request: Request) -> str:
    """
    Best-effort real client IP — prefers the proxy-forwarded address (only
    trusted when the Next.js proxy proves itself with the internal secret),
    falling back to the raw socket address for direct calls. Shared by the
    rate limiter's key function and anything else that wants the candidate's
    actual IP (e.g. public-link registration logging — see
    public_link_service.py, where it's a soft admin-review signal only,
    never an auto-block, since shared/NAT IPs are common).
    """
    settings = get_settings()
    proxy_ip = _trusted_proxy_client_ip(request, settings.internal_api_secret)
    if proxy_ip:
        return proxy_ip
    return get_remote_address(request)


def _key_by_user_or_ip(request: Request) -> str:
    """
    Prefer the authenticated user ID injected by the Next.js proxy.
    Public and candidate proxy calls can carry a trusted client IP; direct
    calls fall back to the socket IP.
    """
    user_id = request.headers.get("x-uploader-id")
    if user_id and user_id != "00000000-0000-0000-0000-000000000000":
        return f"user:{user_id}"

    return f"ip:{get_client_ip(request)}"


# Redis-backed storage ensures limits are enforced globally across all
# uvicorn workers — without this, each worker has its own counter and
# a user could make (limit × workers) requests before being throttled.
#
# key_style="endpoint" (default is "url"): slowapi's default scopes each
# limit bucket by the literal resolved request path, which includes path
# parameters. For any rate-limited route with a path param — /jd/{id}/analyze,
# /tests/generate/{jd_id}, /attempts/{attempt_id}/heartbeat, etc. — that means
# every distinct id gets its own counter, so calling the same endpoint with a
# different id each time never accumulates and the limit never triggers.
# "endpoint" scopes by the route's function name instead, which is what
# every limit in this file actually intends: N calls per user/IP to this
# logical action, regardless of which resource id is in the path.
limiter = Limiter(
    key_func=_key_by_user_or_ip,
    storage_uri=get_settings().redis_url,
    key_style="endpoint",
)
