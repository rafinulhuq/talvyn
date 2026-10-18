"""Generate a JobDescription from an operator brief, using self-hosted AI.

Produces a validated ``JobDescriptionAI`` (via ai_provider_service, with the
same validate → correction-retry pattern as the other orchestration tasks) and
renders it into the plain-text ``raw_text`` the existing pipeline consumes
(skill extraction → test generation → invitations). See
docs/superpowers/specs/2026-08-19-jd-generation-design.md.
"""

from typing import Any

from app.core.logging import get_logger
from app.prompts.glm_tasks import JD_GENERATION
from app.schemas.ai_orchestration import JobDescriptionAI
from app.schemas.jd import GenerateJdRequest
from app.services import ai_provider_service
from app.services.ai_provider_service import AiGenerateRequest

logger = get_logger(__name__)

# A little warmth for varied phrasing — still controlled, and the output is
# schema-validated regardless.
_JD_TEMPERATURE = 0.4


def _fmt_list(items: list[str]) -> str:
    return ", ".join(items) if items else "(none given)"


async def generate_jd(
    brief: GenerateJdRequest, db: Any | None = None
) -> JobDescriptionAI | None:
    """Call the model and return a validated JD, or None on failure (the caller
    marks the JD FAILED). Never raises for model/parse errors — ai_provider_service
    is result-based."""
    prompt = JD_GENERATION.generation_template.format(
        title=brief.title,
        seniority=brief.seniority,
        department=brief.department or "(not specified)",
        experience=brief.experience or "(not specified)",
        must_have_skills=_fmt_list(brief.must_have_skills),
        nice_to_have_skills=_fmt_list(brief.nice_to_have_skills),
        tools=_fmt_list(brief.tools),
        context=brief.context or "(none given)",
        tone=brief.tone,
        length=brief.length,
    )
    req = AiGenerateRequest(
        task_type="jd_generation",
        system_prompt=JD_GENERATION.system,
        user_prompt=prompt,
        expected_json_schema=JobDescriptionAI,
        temperature=_JD_TEMPERATURE,
    )
    resp = await ai_provider_service.generate_with_correction(
        req,
        build_correction_prompt=lambda errors, previous: JD_GENERATION.correction_template.format(
            errors=errors, previous_response=previous,
        ),
        max_corrections=2,
        db=db,
    )
    if not resp.success or resp.parsed_json is None:
        logger.warning("JD generation failed", title=brief.title, error=resp.error)
        return None
    return resp.parsed_json


def render_raw_text(ai: JobDescriptionAI) -> str:
    """Assemble a validated JD into the plain-text raw_text the existing
    pipeline reads. Pure function — no I/O."""
    lines: list[str] = [ai.title.strip()]
    if ai.seniority.strip():
        lines.append(ai.seniority.strip())
    lines.append("")
    lines.append(ai.summary.strip())

    def _section(heading: str, items: list[str]) -> None:
        cleaned = [it.strip() for it in items if it.strip()]
        if not cleaned:
            return
        lines.append("")
        lines.append(heading)
        lines.extend(f"- {it}" for it in cleaned)

    _section("Responsibilities", ai.responsibilities)
    _section("Requirements", ai.requirements)
    _section("Nice to have", ai.nice_to_haves)
    _section("Tools & technologies", ai.tools)
    return "\n".join(lines).strip()
