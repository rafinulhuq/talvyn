"""
Skill Extraction Service.

Owns the complete skill extraction pipeline:
  1. Build a structured prompt around the JD text
  2. Call Ollama via OllamaClient
  3. Parse and validate the JSON response (Pydantic)
  4. Retry with a correction prompt if initial response is invalid
  5. Persist the validated result to PostgreSQL

Separation of concerns:
- ollama_service.py  → HTTP transport, retry, raw text
- skill_extraction_service.py → prompts, validation, DB writes
- jd_service.py      → orchestration (calls this service)
"""

from typing import Any

from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AIResponseParseError
from app.core.logging import get_logger
from app.db.models.job_description import JdExtractedData
from app.prompts import get_prompt_set
from app.services.ollama_service import ollama_client, parse_json_response

logger = get_logger(__name__)


# ─── Pydantic validation schema ───────────────────────────────
#
# This is the schema Ollama MUST conform to.
# It is separate from the API response schema (schemas/jd.py) so the
# two can evolve independently.

class DifficultyDistribution(BaseModel):
    easy_percent: int = Field(ge=0, le=100)
    medium_percent: int = Field(ge=0, le=100)
    hard_percent: int = Field(ge=0, le=100)

    @field_validator("hard_percent")
    @classmethod
    def percentages_sum_to_100(cls, hard: int, info) -> int:
        easy = info.data.get("easy_percent", 0)
        medium = info.data.get("medium_percent", 0)
        total = easy + medium + hard
        if total != 100:
            raise ValueError(
                f"Difficulty percentages must sum to 100, got {total} "
                f"(easy={easy}, medium={medium}, hard={hard})"
            )
        return hard


class SkillExtractionResult(BaseModel):
    """
    The exact JSON structure we expect Ollama to return.
    All list fields default to empty lists so partial responses are handled
    gracefully rather than crashing.
    """
    job_title: str = Field(min_length=1)
    seniority_level: str = Field(
        description="One of: junior, mid, senior, lead, principal, or a custom level"
    )
    must_have_skills: list[str] = Field(default_factory=list)
    nice_to_have_skills: list[str] = Field(default_factory=list)
    tools_technologies: list[str] = Field(default_factory=list)
    responsibilities: list[str] = Field(default_factory=list)
    recommended_test_topics: list[str] = Field(default_factory=list)
    difficulty_distribution: DifficultyDistribution

    @model_validator(mode="after")
    def fill_must_have_skills(self) -> "SkillExtractionResult":
        """
        Backfill must_have_skills if the model returned an empty list.

        Every assessed role needs at least one skill to build a test
        against — but some models take the prompt's "use [] if nothing
        applies" permission literally for JDs that never use the words
        "must have" (e.g. non-engineering roles), which used to hard-fail
        validation and retry-loop instead of ever succeeding. A deterministic
        fallback is more reliable than hoping a correction prompt fixes it.
        """
        if self.must_have_skills:
            return self
        if self.tools_technologies:
            self.must_have_skills = self.tools_technologies[:5]
        else:
            self.must_have_skills = [self.job_title]
        return self

    @model_validator(mode="after")
    def fill_recommended_topics(self) -> "SkillExtractionResult":
        """Fall back to must_have_skills when model returns empty recommended_test_topics."""
        if not self.recommended_test_topics and self.must_have_skills:
            self.recommended_test_topics = self.must_have_skills[:5]
        return self

    @field_validator(
        "must_have_skills",
        "nice_to_have_skills",
        "tools_technologies",
        "responsibilities",
        "recommended_test_topics",
        mode="before",
    )
    @classmethod
    def coerce_list_items_to_str(cls, v: Any) -> list[str]:
        """Ensure every list element is a plain string, not a nested dict."""
        if not isinstance(v, list):
            return []
        result = []
        for item in v:
            if isinstance(item, str):
                result.append(item.strip())
            elif isinstance(item, dict):
                # Some models wrap items: {"skill": "Python"} — flatten it
                result.append(", ".join(str(x) for x in item.values() if x))
            else:
                result.append(str(item).strip())
        return [x for x in result if x]   # drop empty strings


# ─── Main extraction function ─────────────────────────────────

async def extract_skills_from_jd_text(
    jd_text: str,
    *,
    max_correction_attempts: int = 2,
) -> SkillExtractionResult:
    """
    Extract structured skills from raw JD text via Ollama.

    Attempt sequence:
      1. Send full extraction prompt
      2. Parse JSON + validate with Pydantic
      3. If invalid: send correction prompt with the error message (up to max_correction_attempts)
      4. If still invalid: raise AIResponseParseError

    Args:
        jd_text:                  Raw text extracted from the JD file
        max_correction_attempts:  How many times to retry with a correction prompt

    Returns:
        SkillExtractionResult — fully validated Pydantic model

    Raises:
        AIServiceError:      Ollama is unreachable
        AIResponseParseError: Could not get valid JSON after all retries
    """
    if not jd_text or not jd_text.strip():
        raise ValueError("JD text is empty — cannot extract skills")

    # Truncate very long JDs to avoid exceeding context window
    # Most JDs fit in 4k tokens; 12k chars ≈ 3k tokens leaving room for output
    jd_excerpt = jd_text[:12_000]
    if len(jd_text) > 12_000:
        logger.warning(
            "JD text truncated for skill extraction",
            original_chars=len(jd_text),
            truncated_chars=12_000,
        )

    prompts = get_prompt_set().skill_extraction
    prompt = prompts.extraction_template.format(jd_text=jd_excerpt)

    logger.info("Starting skill extraction", jd_chars=len(jd_excerpt))

    # ── Initial attempt ───────────────────────────────────────
    raw = await ollama_client.generate(prompt=prompt, system=prompts.system)
    last_raw = raw

    result, error_msg = _try_validate(raw)
    if result is not None:
        logger.info("Skill extraction succeeded on first attempt")
        return result

    logger.warning("Initial extraction response invalid", error=error_msg)

    # ── Correction attempts ────────────────────────────────────
    for attempt in range(1, max_correction_attempts + 1):
        correction_prompt = prompts.correction_template.format(
            error=error_msg,
            previous_attempt=last_raw[:1000],  # Keep correction prompt lean
        )

        logger.info(
            "Sending correction prompt",
            attempt=attempt,
            max_attempts=max_correction_attempts,
        )

        raw = await ollama_client.generate(
            prompt=correction_prompt,
            system=prompts.system,
            seed=attempt * 7 + 42,   # Different seed per retry for variation
        )
        last_raw = raw

        result, error_msg = _try_validate(raw)
        if result is not None:
            logger.info(
                "Skill extraction succeeded after correction",
                attempt=attempt,
            )
            return result

        logger.warning(
            "Correction attempt invalid",
            attempt=attempt,
            error=error_msg,
        )

    raise AIResponseParseError(
        f"Skill extraction failed after {max_correction_attempts + 1} attempts. "
        f"Last error: {error_msg}. Last response snippet: {last_raw[:300]!r}"
    )


# ─── DB persistence ───────────────────────────────────────────

async def save_extracted_skills(
    jd_id: str,
    result: SkillExtractionResult,
    db: AsyncSession,
) -> JdExtractedData:
    """
    Upsert the extraction result into jd_extracted_data.
    If a record already exists for this JD it is replaced (re-analysis case).

    Returns the saved ORM instance.
    """
    # Check for existing record
    existing = await db.execute(
        select(JdExtractedData).where(JdExtractedData.jd_id == jd_id)
    )
    extracted = existing.scalar_one_or_none()

    data_dict = {
        "job_title": result.job_title,
        "seniority_level": result.seniority_level,
        "must_have_skills": result.must_have_skills,
        "nice_to_have_skills": result.nice_to_have_skills,
        "tools_technologies": result.tools_technologies,
        "responsibilities": result.responsibilities,
        "recommended_test_topics": result.recommended_test_topics,
        "difficulty_distribution": result.difficulty_distribution.model_dump(),
    }

    if extracted is not None:
        # Update in place
        for key, value in data_dict.items():
            setattr(extracted, key, value)
        logger.info("Updated existing extracted data", jd_id=jd_id)
    else:
        extracted = JdExtractedData(jd_id=jd_id, **data_dict)
        db.add(extracted)
        logger.info("Created new extracted data", jd_id=jd_id)

    await db.commit()
    await db.refresh(extracted)
    return extracted


# ─── Helpers ──────────────────────────────────────────────────

def _try_validate(raw: str) -> tuple[SkillExtractionResult | None, str]:
    """
    Try to parse and validate a raw LLM response.
    Returns (result, "") on success, (None, error_message) on failure.
    """
    try:
        data = parse_json_response(raw)
        result = SkillExtractionResult.model_validate(data)
        return result, ""
    except AIResponseParseError as exc:
        return None, str(exc)
    except ValidationError as exc:
        # Produce a terse, model-readable error description
        errors = exc.errors()
        summary = "; ".join(
            f"{'.'.join(str(x) for x in e['loc'])}: {e['msg']}"
            for e in errors[:5]   # Cap at 5 to avoid token-bombing the correction prompt
        )
        return None, f"Pydantic validation failed: {summary}"
    except Exception as exc:
        return None, f"Unexpected error: {exc}"
