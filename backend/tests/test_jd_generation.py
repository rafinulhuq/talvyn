"""Unit tests for JD generation — schema bounds + the raw_text renderer.

Pure/validation tests; no Ollama, no DB. Covers the guarantees the rest of the
pipeline relies on: a generated JD is well-formed, and it renders into text the
skill-extraction step can consume.
"""

import pytest
from pydantic import ValidationError

from app.schemas.ai_orchestration import JobDescriptionAI
from app.schemas.jd import GenerateJdRequest
from app.services.jd_generation_service import render_raw_text


def _ai(**over) -> JobDescriptionAI:
    data = dict(
        title="Senior Project Manager",
        seniority="Senior",
        summary="Owns delivery for two product squads and drives outcomes end to end.",
        responsibilities=["Own delivery", "Manage risk", "Report to stakeholders"],
        requirements=["5+ years PM", "Agile", "Budgeting"],
        nice_to_haves=[],
        tools=[],
    )
    data.update(over)
    return JobDescriptionAI(**data)


# ── JobDescriptionAI (model output) ──────────────────────────

def test_requires_at_least_three_responsibilities():
    with pytest.raises(ValidationError):
        _ai(responsibilities=["only one", "two"])


def test_requires_at_least_three_requirements():
    with pytest.raises(ValidationError):
        _ai(requirements=["one", "two"])


def test_summary_must_be_substantive():
    with pytest.raises(ValidationError):
        _ai(summary="too short")


def test_list_fields_coerce_and_drop_blanks():
    ai = _ai(tools=[" Jira ", "", "   ", "Confluence"])
    assert ai.tools == ["Jira", "Confluence"]


# ── render_raw_text (pure) ───────────────────────────────────

def test_render_has_title_summary_and_sections():
    ai = _ai(tools=["Jira", "Confluence"], nice_to_haves=["PMP"])
    txt = render_raw_text(ai)
    assert txt.startswith("Senior Project Manager")
    assert "Senior" in txt
    assert "Owns delivery" in txt
    for heading in ("Responsibilities", "Requirements", "Nice to have", "Tools & technologies"):
        assert heading in txt
    assert "- Own delivery" in txt
    assert "- Jira" in txt


def test_render_omits_empty_sections():
    ai = _ai(nice_to_haves=[], tools=[])
    txt = render_raw_text(ai)
    assert "Nice to have" not in txt
    assert "Tools & technologies" not in txt


# ── GenerateJdRequest (operator brief) ───────────────────────

def test_brief_requires_a_must_have_skill():
    with pytest.raises(ValidationError):
        GenerateJdRequest(title="PM", seniority="Senior", must_have_skills=[])


def test_brief_cleans_skill_list():
    r = GenerateJdRequest(
        title="PM", seniority="Senior", must_have_skills=[" Agile ", "", "Risk"]
    )
    assert r.must_have_skills == ["Agile", "Risk"]


def test_brief_defaults():
    r = GenerateJdRequest(title="PM", seniority="Senior", must_have_skills=["Agile"])
    assert r.tone == "Professional"
    assert r.nice_to_have_skills == []
    assert r.context == ""


# ── JobDescriptionResponse (generated JD has no file) ────────

def test_response_serializes_generated_jd_without_file():
    from datetime import UTC, datetime

    from app.schemas.jd import JobDescriptionResponse

    r = JobDescriptionResponse(
        id="jd-1",
        uploaded_by="user-1",
        source="GENERATED",
        original_filename="Senior Project Manager",
        file_type=None,
        parse_status="DONE",
        generation_status="IDLE",
        raw_text="Senior Project Manager\n...",
        created_at=datetime.now(tz=UTC),
        updated_at=datetime.now(tz=UTC),
    )
    assert r.file_type is None
    assert r.source.value == "GENERATED"
