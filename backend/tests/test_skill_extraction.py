"""
Tests for SkillExtractionResult validation and extract_skills_from_jd_text.
Ollama is fully mocked — no real AI calls happen.
"""

import json
from unittest.mock import AsyncMock, patch

import pytest
from pydantic import ValidationError

from app.core.exceptions import AIResponseParseError, AIServiceError
from app.services.skill_extraction_service import (
    DifficultyDistribution,
    SkillExtractionResult,
    _try_validate,
    extract_skills_from_jd_text,
)

# ─── Fixtures ─────────────────────────────────────────────────

def valid_extraction_dict() -> dict:
    return {
        "job_title": "Senior Backend Engineer",
        "seniority_level": "senior",
        "must_have_skills": ["Python", "FastAPI", "PostgreSQL"],
        "nice_to_have_skills": ["Redis", "Kubernetes"],
        "tools_technologies": ["Docker", "GitHub Actions", "AWS"],
        "responsibilities": [
            "Design and implement RESTful APIs",
            "Write unit and integration tests",
            "Participate in code reviews",
        ],
        "recommended_test_topics": [
            "Python async programming",
            "Database query optimization",
            "System design",
        ],
        "difficulty_distribution": {
            "easy_percent": 20,
            "medium_percent": 50,
            "hard_percent": 30,
        },
    }


def valid_extraction_json() -> str:
    return json.dumps(valid_extraction_dict())


# ─── DifficultyDistribution validation ───────────────────────

class TestDifficultyDistribution:

    def test_valid_sums_to_100(self):
        d = DifficultyDistribution(easy_percent=20, medium_percent=50, hard_percent=30)
        assert d.easy_percent == 20

    def test_raises_when_not_100(self):
        with pytest.raises(ValidationError, match="sum to 100"):
            DifficultyDistribution(easy_percent=30, medium_percent=30, hard_percent=30)

    def test_raises_when_over_100(self):
        with pytest.raises(ValidationError, match="sum to 100"):
            DifficultyDistribution(easy_percent=40, medium_percent=40, hard_percent=40)

    def test_all_zero_raises(self):
        with pytest.raises(ValidationError):
            DifficultyDistribution(easy_percent=0, medium_percent=0, hard_percent=0)

    def test_extreme_values_valid(self):
        d = DifficultyDistribution(easy_percent=0, medium_percent=0, hard_percent=100)
        assert d.hard_percent == 100


# ─── SkillExtractionResult validation ────────────────────────

class TestSkillExtractionResult:

    def test_valid_full_response(self):
        result = SkillExtractionResult.model_validate(valid_extraction_dict())
        assert result.job_title == "Senior Backend Engineer"
        assert result.seniority_level == "senior"
        assert "Python" in result.must_have_skills
        assert result.difficulty_distribution.easy_percent == 20

    def test_coerces_nested_skill_dicts(self):
        """Some models return {"skill": "Python"} instead of "Python" — should flatten."""
        data = valid_extraction_dict()
        data["must_have_skills"] = [{"skill": "Python"}, {"skill": "FastAPI"}]
        result = SkillExtractionResult.model_validate(data)
        assert result.must_have_skills == ["Python", "FastAPI"]

    def test_empty_lists_allowed_for_optional_fields(self):
        data = valid_extraction_dict()
        data["nice_to_have_skills"] = []
        data["tools_technologies"] = []
        result = SkillExtractionResult.model_validate(data)
        assert result.nice_to_have_skills == []

    def test_raises_on_missing_job_title(self):
        data = valid_extraction_dict()
        del data["job_title"]
        with pytest.raises(ValidationError):
            SkillExtractionResult.model_validate(data)

    def test_raises_on_empty_job_title(self):
        data = valid_extraction_dict()
        data["job_title"] = ""
        with pytest.raises(ValidationError):
            SkillExtractionResult.model_validate(data)

    def test_raises_on_missing_difficulty(self):
        data = valid_extraction_dict()
        del data["difficulty_distribution"]
        with pytest.raises(ValidationError):
            SkillExtractionResult.model_validate(data)

    def test_empty_must_have_skills_backfills_from_tools(self):
        """
        Some models (observed: deepseek-r1) return [] for must_have_skills
        on JDs that never use the literal words "must have" (e.g. non-
        engineering roles), then loop on correction without ever fixing it.
        Must never hard-fail — back off to tools_technologies.
        """
        data = valid_extraction_dict()
        data["must_have_skills"] = []
        result = SkillExtractionResult.model_validate(data)
        assert result.must_have_skills == data["tools_technologies"][:5]

    def test_empty_must_have_skills_and_tools_backfills_from_job_title(self):
        data = valid_extraction_dict()
        data["must_have_skills"] = []
        data["tools_technologies"] = []
        result = SkillExtractionResult.model_validate(data)
        assert result.must_have_skills == [data["job_title"]]

    def test_strips_empty_strings_from_lists(self):
        data = valid_extraction_dict()
        data["nice_to_have_skills"] = ["Redis", "", "  ", "Kafka"]
        result = SkillExtractionResult.model_validate(data)
        assert "" not in result.nice_to_have_skills
        assert "  " not in result.nice_to_have_skills
        assert "Redis" in result.nice_to_have_skills


# ─── _try_validate ────────────────────────────────────────────

class TestTryValidate:

    def test_valid_json_returns_result(self):
        result, error = _try_validate(valid_extraction_json())
        assert result is not None
        assert error == ""
        assert isinstance(result, SkillExtractionResult)

    def test_invalid_json_returns_error(self):
        result, error = _try_validate("not json at all")
        assert result is None
        assert "not valid JSON" in error

    def test_valid_json_invalid_schema_returns_error(self):
        bad = json.dumps({"job_title": "", "seniority_level": "senior"})
        result, error = _try_validate(bad)
        assert result is None
        assert error != ""

    def test_wrong_difficulty_sum_returns_error(self):
        data = valid_extraction_dict()
        data["difficulty_distribution"] = {"easy_percent": 50, "medium_percent": 50, "hard_percent": 50}
        result, error = _try_validate(json.dumps(data))
        assert result is None
        assert "100" in error or "sum" in error.lower()

    def test_json_in_fence_is_parsed(self):
        fenced = f"```json\n{valid_extraction_json()}\n```"
        result, error = _try_validate(fenced)
        assert result is not None


# ─── extract_skills_from_jd_text ──────────────────────────────

SAMPLE_JD = """
Senior Python Backend Engineer

We are looking for a Senior Python Backend Engineer to join our team.

Requirements (must have):
- 5+ years of Python experience
- Experience with FastAPI or Django
- Strong PostgreSQL skills
- Experience with Docker and Kubernetes

Nice to have:
- Experience with Redis
- Knowledge of message queues (RabbitMQ, Kafka)

Responsibilities:
- Design and implement scalable REST APIs
- Write comprehensive tests
- Participate in architecture decisions
"""


class TestExtractSkillsFromJdText:

    async def test_successful_extraction_first_attempt(self):
        """Mock Ollama returning valid JSON on first try."""
        with patch(
            "app.services.skill_extraction_service.ollama_client.generate",
            new=AsyncMock(return_value=valid_extraction_json()),
        ):
            result = await extract_skills_from_jd_text(SAMPLE_JD)

        assert result.job_title == "Senior Backend Engineer"
        assert "Python" in result.must_have_skills

    async def test_succeeds_after_correction(self):
        """First response invalid, second (correction) response valid."""
        bad_json = '{"job_title": "Engineer", "oops": true}'
        good_json = valid_extraction_json()

        call_count = 0

        async def mock_generate(prompt, system, **kwargs):
            nonlocal call_count
            call_count += 1
            return bad_json if call_count == 1 else good_json

        with patch(
            "app.services.skill_extraction_service.ollama_client.generate",
            side_effect=mock_generate,
        ):
            result = await extract_skills_from_jd_text(SAMPLE_JD, max_correction_attempts=1)

        assert result is not None
        assert call_count == 2

    async def test_raises_after_all_retries_fail(self):
        """All attempts return invalid JSON — should raise AIResponseParseError."""
        with patch(
            "app.services.skill_extraction_service.ollama_client.generate",
            new=AsyncMock(return_value='{"broken": true}'),
        ):
            with pytest.raises(AIResponseParseError):
                await extract_skills_from_jd_text(
                    SAMPLE_JD, max_correction_attempts=1
                )

    async def test_raises_on_ollama_unavailable(self):
        """OllamaClient raises AIServiceError — propagated up."""
        with patch(
            "app.services.skill_extraction_service.ollama_client.generate",
            new=AsyncMock(side_effect=AIServiceError("Ollama is down")),
        ):
            with pytest.raises(AIServiceError, match="Ollama is down"):
                await extract_skills_from_jd_text(SAMPLE_JD)

    async def test_raises_on_empty_text(self):
        with pytest.raises(ValueError, match="empty"):
            await extract_skills_from_jd_text("")

    async def test_raises_on_whitespace_only_text(self):
        with pytest.raises(ValueError, match="empty"):
            await extract_skills_from_jd_text("   \n\t  ")

    async def test_truncates_very_long_text(self):
        """Text > 12000 chars should be truncated, not crash."""
        long_jd = SAMPLE_JD * 200  # ~20k+ chars

        captured_prompts = []

        async def capturing_generate(prompt, system, **kwargs):
            captured_prompts.append(prompt)
            return valid_extraction_json()

        with patch(
            "app.services.skill_extraction_service.ollama_client.generate",
            side_effect=capturing_generate,
        ):
            result = await extract_skills_from_jd_text(long_jd)

        assert result is not None
        # The prompt should contain the truncated JD, not the full thing
        assert len(captured_prompts[0]) < len(long_jd) + 2000  # prompt overhead
