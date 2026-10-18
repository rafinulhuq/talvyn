"""Unit tests for rate-limit key selection."""

from starlette.requests import Request

from app.config import get_settings
from app.core.ratelimit import _key_by_user_or_ip


def _request(
    headers: dict[str, str] | None = None,
    client_host: str = "10.0.0.10",
) -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/api/v1/test",
            "headers": [
                (key.lower().encode("latin-1"), value.encode("latin-1"))
                for key, value in (headers or {}).items()
            ],
            "client": (client_host, 12345),
        }
    )


def test_authenticated_user_id_wins_over_ip() -> None:
    request = _request(
        {
            "X-Uploader-Id": "11111111-1111-1111-1111-111111111111",
            "X-Talvyn-Client-IP": "8.8.8.8",
        }
    )

    assert _key_by_user_or_ip(request) == "user:11111111-1111-1111-1111-111111111111"


def test_candidate_attempt_token_does_not_override_socket_ip() -> None:
    request = _request(
        {"X-Attempt-Token": "candidate-secret-token"},
        client_host="172.18.0.8",
    )

    assert _key_by_user_or_ip(request) == "ip:172.18.0.8"


def test_trusted_proxy_client_ip_used_when_internal_token_matches() -> None:
    settings = get_settings()
    request = _request(
        {
            "X-Internal-Token": settings.internal_api_secret,
            "X-Talvyn-Client-IP": "8.8.8.8",
        },
        client_host="172.18.0.8",
    )

    assert _key_by_user_or_ip(request) == "ip:8.8.8.8"


def test_untrusted_forwarded_ip_falls_back_to_socket_ip() -> None:
    request = _request(
        {
            "X-Internal-Token": "wrong",
            "X-Talvyn-Client-IP": "8.8.8.8",
        },
        client_host="172.18.0.8",
    )

    assert _key_by_user_or_ip(request) == "ip:172.18.0.8"
