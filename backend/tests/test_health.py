"""
Tests for health check endpoints.
Run with: pytest tests/test_health.py -v

These tests use their own local client fixture that doesn't need
the session-scoped database setup.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from httpx import ASGITransport, AsyncClient


def _make_mock_response(json_body: dict, status_code: int = 200):
    """Build a mock httpx.Response for the Ollama /api/tags call."""
    mock = MagicMock()
    mock.status_code = status_code
    mock.json.return_value = json_body
    mock.raise_for_status = MagicMock(
        side_effect=None if status_code < 400 else Exception(f"HTTP {status_code}")
    )
    return mock


def _make_mock_redis():
    mock_redis = AsyncMock()
    mock_redis.ping = AsyncMock(return_value=True)
    mock_redis.aclose = AsyncMock()
    return mock_redis


@pytest.fixture
async def health_client():
    """
    Lightweight client for health-only tests.
    Uses its own fixture to avoid scope conflicts with db session.
    """
    from app.main import app

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac


async def test_health_live_returns_200(health_client: AsyncClient):
    response = await health_client.get("/api/v1/health")
    assert response.status_code == 200


async def test_health_live_response_structure(health_client: AsyncClient):
    response = await health_client.get("/api/v1/health")
    data = response.json()
    assert "status" in data
    assert "service" in data
    assert "version" in data
    assert "environment" in data
    assert data["status"] == "ok"


async def test_root_returns_service_info(health_client: AsyncClient):
    response = await health_client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "service" in data
    assert "health" in data


async def test_unknown_route_returns_404(health_client: AsyncClient):
    response = await health_client.get("/api/v1/does-not-exist")
    assert response.status_code == 404
    data = response.json()
    assert data["success"] is False
    assert data["error"]["code"] == "NOT_FOUND"


# ─── /api/v1/health/ready ──────────────────────────────────────

class TestHealthReady:

    async def test_returns_503_when_ollama_unreachable(self, client: AsyncClient):
        with patch("httpx.AsyncClient") as MockClient, patch(
            "redis.asyncio.from_url",
            return_value=_make_mock_redis(),
        ):
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_ctx.get = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))
            MockClient.return_value = mock_ctx

            response = await client.get("/api/v1/health/ready")

        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "degraded"
        assert data["checks"]["database"]["status"] == "ok"
        assert data["checks"]["redis"]["status"] == "ok"
        assert data["checks"]["ollama"]["status"] == "unreachable"

    async def test_returns_200_when_all_dependencies_ok(self, client: AsyncClient):
        mock_response = _make_mock_response({"models": [{"name": "gemma3:4b"}]})

        with patch("httpx.AsyncClient") as MockClient, patch(
            "redis.asyncio.from_url",
            return_value=_make_mock_redis(),
        ):
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_ctx.get = AsyncMock(return_value=mock_response)
            MockClient.return_value = mock_ctx

            response = await client.get("/api/v1/health/ready")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["checks"]["database"]["status"] == "ok"
        assert data["checks"]["redis"]["status"] == "ok"
        assert data["checks"]["worker"]["status"] == "ok"
        assert data["checks"]["storage"]["status"] == "ok"
        assert data["checks"]["email"]["status"] in {"ok", "warning"}
        assert data["checks"]["magic_links"]["status"] in {"ok", "warning"}
        assert data["checks"]["ollama"]["status"] == "ok"


# ─── /api/v1/health/models ─────────────────────────────────────

class TestHealthModels:

    async def test_glm_disabled_shows_local_model_everywhere(self, health_client: AsyncClient):
        from app.config import get_settings

        get_settings.cache_clear()
        response = await health_client.get("/api/v1/health/models")

        assert response.status_code == 200
        data = response.json()
        assert data["test_generation"]["model"] == get_settings().ollama_model
        assert data["question_bank_generation"]["tier"] == "local"
        assert data["question_bank_generation"]["model"] == get_settings().ollama_model
        assert data["rubric_generation"]["tier"] == "local"

    async def test_glm_enabled_shows_glm_model_for_quality_tasks(
        self, health_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
    ):
        from app.config import get_settings

        monkeypatch.setenv("GLM_ENABLED", "true")
        monkeypatch.setenv("GLM_API_BASE_URL", "http://localhost:11434/v1")
        monkeypatch.setenv("GLM_API_KEY", "ollama")
        monkeypatch.setenv("GLM_MODEL", "glm4:9b")
        get_settings.cache_clear()

        response = await health_client.get("/api/v1/health/models")
        get_settings.cache_clear()  # restore real env for subsequent tests

        assert response.status_code == 200
        data = response.json()
        assert data["question_bank_generation"] == {"model": "glm4:9b", "tier": "glm"}
        assert data["rubric_generation"] == {"model": "glm4:9b", "tier": "glm"}
        # test_generation never escalates to GLM
        assert data["test_generation"]["model"] != "glm4:9b"

    async def test_ai_detection_disabled_by_default(self, health_client: AsyncClient):
        from app.config import get_settings

        get_settings.cache_clear()
        response = await health_client.get("/api/v1/health/models")
        data = response.json()
        assert data["ai_detection"]["enabled"] is False
        assert data["ai_detection"]["model"] is None
