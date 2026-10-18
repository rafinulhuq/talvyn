"""
Unit tests for OllamaClient and JSON extraction helpers.
All HTTP calls are mocked — Ollama does not need to be running.
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.exceptions import AIResponseParseError, AIServiceError
from app.services.ollama_service import (
    OllamaClient,
    _extract_json_from_text,
    parse_json_response,
)

# ─── _extract_json_from_text ──────────────────────────────────

class TestExtractJsonFromText:

    def test_plain_json_object(self):
        raw = '{"key": "value", "num": 42}'
        assert _extract_json_from_text(raw) == raw

    def test_strips_whitespace(self):
        raw = '   {"key": "value"}   '
        result = _extract_json_from_text(raw)
        assert result == '{"key": "value"}'

    def test_extracts_from_json_fence(self):
        raw = '```json\n{"key": "value"}\n```'
        result = _extract_json_from_text(raw)
        assert result == '{"key": "value"}'

    def test_extracts_from_plain_fence(self):
        raw = '```\n{"key": "value"}\n```'
        result = _extract_json_from_text(raw)
        assert result == '{"key": "value"}'

    def test_extracts_json_from_surrounding_text(self):
        raw = 'Here is the JSON: {"key": "value"} Thank you.'
        result = _extract_json_from_text(raw)
        assert result == '{"key": "value"}'

    def test_strips_bom(self):
        raw = '\ufeff{"key": "value"}'
        result = _extract_json_from_text(raw)
        assert result == '{"key": "value"}'

    def test_preamble_plus_fence(self):
        raw = 'Sure! Here is the JSON:\n```json\n{"a": 1}\n```\nHope that helps.'
        result = _extract_json_from_text(raw)
        assert result == '{"a": 1}'


# ─── parse_json_response ──────────────────────────────────────

class TestParseJsonResponse:

    def test_valid_json_object(self):
        raw = '{"name": "Python", "level": "senior"}'
        result = parse_json_response(raw)
        assert result == {"name": "Python", "level": "senior"}

    def test_json_inside_fence(self):
        raw = '```json\n{"key": "val"}\n```'
        result = parse_json_response(raw)
        assert result == {"key": "val"}

    def test_raises_on_invalid_json(self):
        with pytest.raises(AIResponseParseError, match="not valid JSON"):
            parse_json_response("this is not json at all")

    def test_raises_on_json_array(self):
        with pytest.raises(AIResponseParseError, match="list"):
            parse_json_response("[1, 2, 3]")

    def test_raises_on_empty_string(self):
        with pytest.raises(AIResponseParseError):
            parse_json_response("")

    def test_nested_json_object(self):
        raw = '{"a": {"b": [1, 2, 3]}, "c": true}'
        result = parse_json_response(raw)
        assert result["a"]["b"] == [1, 2, 3]


# ─── OllamaClient ────────────────────────────────────────────

def _make_mock_response(json_body: dict, status_code: int = 200):
    """Build a mock httpx.Response."""
    mock = MagicMock()
    mock.status_code = status_code
    mock.json.return_value = json_body
    mock.text = json.dumps(json_body)
    mock.raise_for_status = MagicMock(
        side_effect=None if status_code < 400 else Exception(f"HTTP {status_code}")
    )
    return mock


class TestOllamaClientGenerate:

    @pytest.fixture
    def client(self):
        return OllamaClient()

    async def test_successful_generate(self, client):
        """Happy path — Ollama returns valid response."""
        mock_response = _make_mock_response({
            "response": '{"job_title": "Senior Engineer"}',
            "model": "gemma3:12b",
            "prompt_eval_count": 100,
            "eval_count": 50,
        })

        with patch("httpx.AsyncClient") as MockClient:
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_ctx.post = AsyncMock(return_value=mock_response)
            MockClient.return_value = mock_ctx

            result = await client.generate(prompt="test", system="test system")

        assert result == '{"job_title": "Senior Engineer"}'

    async def test_raises_on_connect_error(self, client):
        """ConnectError → AIServiceError."""
        import httpx

        with patch("httpx.AsyncClient") as MockClient:
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_ctx.post = AsyncMock(
                side_effect=httpx.ConnectError("Connection refused")
            )
            MockClient.return_value = mock_ctx

            # max_retries=3, each with sleep — override to speed up test
            with patch("app.services.ollama_service.get_settings") as mock_settings:
                mock_settings.return_value.ollama_base_url = client.base_url
                mock_settings.return_value.ollama_model = client.model
                mock_settings.return_value.ollama_timeout_seconds = 5
                mock_settings.return_value.ollama_max_retries = 1
                with patch("asyncio.sleep", AsyncMock()):
                    with pytest.raises(AIServiceError, match="Cannot connect"):
                        await client._post_with_retry("/api/generate", {})

    async def test_raises_on_model_not_found(self, client):
        """HTTP 404 → AIServiceError with helpful message."""
        mock_response = _make_mock_response({}, status_code=404)

        with patch("httpx.AsyncClient") as MockClient:
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_ctx.post = AsyncMock(return_value=mock_response)
            MockClient.return_value = mock_ctx

            with pytest.raises(AIServiceError, match="not found in Ollama"):
                await client._post_once("/api/generate", {})

    async def test_retry_succeeds_on_second_attempt(self, client):
        """First call fails, second succeeds — retry works."""
        import httpx

        good_response = _make_mock_response({
            "response": '{"ok": true}',
            "eval_count": 10,
            "prompt_eval_count": 5,
        })

        call_count = 0

        async def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise httpx.ConnectError("First attempt fails")
            return good_response

        with patch("httpx.AsyncClient") as MockClient:
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_ctx.post = side_effect
            MockClient.return_value = mock_ctx

            with patch("asyncio.sleep", AsyncMock()):
                result = await client.generate(prompt="test", system="sys")

        assert result == '{"ok": true}'
        assert call_count == 2

    async def test_ping_returns_true_when_reachable(self, client):
        mock_response = MagicMock()
        mock_response.status_code = 200

        with patch("httpx.AsyncClient") as MockClient:
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_ctx.get = AsyncMock(return_value=mock_response)
            MockClient.return_value = mock_ctx

            result = await client.ping()

        assert result is True

    async def test_ping_returns_false_when_unreachable(self, client):
        import httpx

        with patch("httpx.AsyncClient") as MockClient:
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_ctx.get = AsyncMock(side_effect=httpx.ConnectError("refused"))
            MockClient.return_value = mock_ctx

            result = await client.ping()

        assert result is False
