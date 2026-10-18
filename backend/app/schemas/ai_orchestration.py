"""
Pydantic schemas for the new AI orchestration tasks (Master Prompt 3):
GLM-generated question banks, GLM question review, and batched (all-3-section)
CQ evaluation. Validated strictly before any DB write or score calculation,
matching the existing pattern in schemas/test.py and schemas/evaluation.py.

Deliberately separate from schemas/test.py's MCQQuestionAI/OpenEndedQuestionAI
— this redesign's bank questions carry extra fields (skill_tags plural,
topic_tags, estimated_time_seconds, expected_answer_points as a list) that
don't exist on the legacy per-JD single-test schema, and conflating the two
would force the legacy schema to grow fields it has no use for.
"""

import random
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

# ─────────────────────────────────────────────────────────────
# Question bank generation (GLM, per section)
# ─────────────────────────────────────────────────────────────

class GlmMcqOptionAI(BaseModel):
    label: Literal["A", "B", "C", "D"]
    text: str = Field(min_length=1)
    is_correct: bool = False


class GlmMcqQuestionAI(BaseModel):
    question_text: str = Field(min_length=5)
    options: list[GlmMcqOptionAI] = Field(min_length=4, max_length=4)
    correct_answer: Literal["A", "B", "C", "D"]
    explanation: str = Field(min_length=1, default="See correct answer.")
    difficulty: Literal["EASY", "MEDIUM", "HARD"] = "MEDIUM"
    skill_tags: list[str] = Field(default_factory=list, max_length=8)
    topic_tags: list[str] = Field(default_factory=list, max_length=8)
    estimated_time_seconds: int = Field(ge=10, le=600, default=60)

    @field_validator("skill_tags", "topic_tags", mode="before")
    @classmethod
    def coerce_tags(cls, v: object) -> list[str]:
        if not isinstance(v, list):
            return []
        return [str(x).strip() for x in v if str(x).strip()][:8]

    @model_validator(mode="after")
    def correct_answer_must_match_an_option(self) -> "GlmMcqQuestionAI":
        labels = {o.label for o in self.options}
        if self.correct_answer not in labels:
            self.correct_answer = self.options[0].label
        # Ensure exactly one option carries is_correct, matching correct_answer.
        for o in self.options:
            o.is_correct = o.label == self.correct_answer

        # The model tends to copy its example template and always place the
        # correct answer at the same position — shuffle so storage isn't
        # biased. Mirrors schemas/test.py's MCQQuestionAI.fix_correct_flags.
        random.shuffle(self.options)
        for label, option in zip(["A", "B", "C", "D"], self.options):
            option.label = label
        self.correct_answer = next(o.label for o in self.options if o.is_correct)

        return self


class GlmCqQuestionAI(BaseModel):
    question_text: str = Field(min_length=5)
    expected_answer_points: list[str] = Field(min_length=1, max_length=10)
    rubric: str = Field(min_length=10)
    total_marks: int = Field(ge=1, le=20, default=10)
    difficulty: Literal["EASY", "MEDIUM", "HARD"] = "MEDIUM"
    skill_tags: list[str] = Field(default_factory=list, max_length=8)
    topic_tags: list[str] = Field(default_factory=list, max_length=8)
    estimated_time_seconds: int = Field(ge=30, le=1800, default=300)

    @field_validator("expected_answer_points", "skill_tags", "topic_tags", mode="before")
    @classmethod
    def coerce_list(cls, v: object) -> list[str]:
        if not isinstance(v, list):
            return []
        return [str(x).strip() for x in v if str(x).strip()]


class GlmBankSectionAI(BaseModel):
    """What GLM must return for ONE section's worth of generated questions."""
    mcq_questions: list[GlmMcqQuestionAI] = Field(min_length=1)
    cq_questions: list[GlmCqQuestionAI] = Field(min_length=1)


# ─────────────────────────────────────────────────────────────
# Question quality review (GLM)
# ─────────────────────────────────────────────────────────────

class GlmQuestionReviewAI(BaseModel):
    quality_score: float = Field(ge=0, le=100)
    questions_to_fix: list[str] = Field(default_factory=list, description="Question IDs/indices flagged for repair")
    duplicate_groups: list[list[str]] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    difficulty_imbalance: str = Field(default="")
    recommended_changes: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("questions_to_fix", "missing_skills", "recommended_changes", mode="before")
    @classmethod
    def coerce_str_list(cls, v: object) -> list[str]:
        if not isinstance(v, list):
            return []
        return [str(x).strip() for x in v if str(x).strip()]


# ─────────────────────────────────────────────────────────────
# Batched CQ evaluation (all 15 answers, one call)
# ─────────────────────────────────────────────────────────────

class SectionCqScoreAI(BaseModel):
    cq_score: float = Field(ge=0)
    max_score: float = Field(ge=0)
    feedback: str = Field(default="")


class CqAnswerScoreAI(BaseModel):
    question_id: str
    section_type: Literal["REASONING", "PRACTICAL", "TECHNICAL"]
    score: float = Field(ge=0)
    max_score: float = Field(ge=0)
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    feedback: str = Field(min_length=1, default="")
    confidence: float = Field(ge=0, le=1, default=0.7)

    @field_validator("strengths", "weaknesses", mode="before")
    @classmethod
    def coerce_str_list(cls, v: object) -> list[str]:
        if not isinstance(v, list):
            return []
        return [str(x).strip() for x in v if str(x).strip()]


class BatchedCqEvaluationAI(BaseModel):
    """What the local/GLM model must return for ALL 15 CQ answers in one call
    — the cost-control core of Master Prompt 3 ("do not call AI 15 times")."""
    section_scores: dict[str, SectionCqScoreAI]
    answers: list[CqAnswerScoreAI] = Field(min_length=1)
    overall_strengths: list[str] = Field(default_factory=list)
    overall_weaknesses: list[str] = Field(default_factory=list)
    evaluation_confidence: float = Field(ge=0, le=1, default=0.7)
    recommendation: Literal["shortlist", "reject", "review"] = "review"

    @field_validator("overall_strengths", "overall_weaknesses", mode="before")
    @classmethod
    def coerce_str_list(cls, v: object) -> list[str]:
        if not isinstance(v, list):
            return []
        return [str(x).strip() for x in v if str(x).strip()]

    @field_validator("section_scores", mode="before")
    @classmethod
    def normalize_section_keys(cls, v: object) -> object:
        """Heal lowercase section keys ("reasoning") to the canonical
        uppercase TestType values used everywhere else in this codebase."""
        if not isinstance(v, dict):
            return v
        return {str(k).upper(): val for k, val in v.items()}


# ─────────────────────────────────────────────────────────────
# AI-risk explanation (GLM, optional, deep-review only)
# ─────────────────────────────────────────────────────────────

class AiRiskExplanationAI(BaseModel):
    """
    Hedged narrative explanation for a high-risk/borderline/shortlisted
    candidate's AI-risk signals — never a verdict. The disclaimer is
    enforced in code (ai_risk_service.py), not trusted from the model
    output, but the explanation text itself must stay non-certain.
    """
    explanation: str = Field(min_length=20)
    contributing_signals: list[str] = Field(default_factory=list, max_length=10)

    @field_validator("explanation")
    @classmethod
    def reject_certainty_language(cls, v: str) -> str:
        banned = ("definitely used ai", "ai-generated answer detected", "proof of ai use", "certainly used ai")
        lower = v.lower()
        for phrase in banned:
            if phrase in lower:
                raise ValueError(
                    f"Explanation uses certainty language ('{phrase}') — must stay hedged/probabilistic."
                )
        return v


# ─────────────────────────────────────────────────────────────
# JD generation (from an operator brief)
# ─────────────────────────────────────────────────────────────

class JobDescriptionAI(BaseModel):
    """Structured job description the model must return when generating a JD
    from an operator's brief. Validated before any DB write; the fields are
    then rendered into the plain-text raw_text the existing pipeline consumes."""

    title: str = Field(min_length=2, max_length=200)
    seniority: str = Field(default="", max_length=100)
    summary: str = Field(min_length=20, description="2-4 sentence role overview")
    responsibilities: list[str] = Field(min_length=3, max_length=15)
    requirements: list[str] = Field(min_length=3, max_length=15)
    nice_to_haves: list[str] = Field(default_factory=list, max_length=12)
    tools: list[str] = Field(default_factory=list, max_length=25)

    @field_validator(
        "responsibilities", "requirements", "nice_to_haves", "tools", mode="before"
    )
    @classmethod
    def coerce_str_list(cls, v: object) -> list[str]:
        if not isinstance(v, list):
            return []
        return [str(x).strip() for x in v if str(x).strip()]
