"""
Pydantic schemas for Test and Question endpoints.

Layered:
  AI validation schemas  — what Gemma must return (strict)
  DB/API response schemas — what the API returns to Next.js (lenient)
  Request schemas         — what Next.js sends to FastAPI for edits
"""

import random
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.db.models.enums import Difficulty, QuestionType, TestStatus, TestType

# ─────────────────────────────────────────────────────────────
# AI OUTPUT VALIDATION SCHEMAS
# These are validated against every Gemma response before DB writes.
# ─────────────────────────────────────────────────────────────

class MCQOptionAI(BaseModel):
    label: Literal["A", "B", "C", "D"]
    text: str = Field(min_length=1)
    # Small/local models sometimes omit this on distractor options. Defaulting
    # to False lets MCQQuestionAI.fix_correct_flags reconcile the single truth.
    is_correct: bool = False


class MCQQuestionAI(BaseModel):
    # Default "MCQ" so model can omit this field without failing validation
    question_type: Literal["MCQ"] = "MCQ"
    question_text: str = Field(min_length=5)
    skill_tested: str = Field(default="General", min_length=1)
    difficulty: Literal["EASY", "MEDIUM", "HARD"] = "MEDIUM"
    marks: int = Field(ge=1, default=2)

    @field_validator("question_type", mode="before")
    @classmethod
    def normalize_question_type(cls, v: object) -> str:
        if v in (None, ""):
            return "MCQ"
        if isinstance(v, str):
            normalized = v.strip().upper().replace("-", "_").replace(" ", "_")
            if normalized in {"MCQ", "MULTIPLE_CHOICE", "MULTIPLE_CHOICE_QUESTION"}:
                return "MCQ"
        return v

    @field_validator("marks", mode="before")
    @classmethod
    def clamp_mcq_marks(cls, v: int) -> int:
        return max(1, min(int(v), 10))

    @field_validator("options", mode="before")
    @classmethod
    def repair_options(cls, v: object) -> object:
        """
        Auto-repair common model output mistakes:
        1. Dict format: {"A": "text", "B": "text"} or {"A": {"text": ..., "is_correct": ...}}
        2. Fewer than 4 options: pad with placeholder options so we always get 4
        """
        _LABELS = ["A", "B", "C", "D"]

        # Convert dict format → list format
        if isinstance(v, dict):
            repaired = []
            for label in _LABELS:
                val = v.get(label, "")
                if isinstance(val, dict):
                    repaired.append({
                        "label": label,
                        "text": val.get("text") or val.get("option") or str(val) or f"Option {label}",
                        "is_correct": bool(val.get("is_correct", False)),
                    })
                else:
                    repaired.append({
                        "label": label,
                        "text": str(val) if val else f"Option {label}",
                        "is_correct": False,
                    })
            return repaired

        # Pad list if fewer than 4 options were returned
        if isinstance(v, list):
            existing_labels = set()
            result = []
            for opt in v:
                lbl = opt.get("label") if isinstance(opt, dict) else getattr(opt, "label", None)
                if lbl in _LABELS and lbl not in existing_labels:
                    result.append(opt)
                    existing_labels.add(lbl)
            for label in _LABELS:
                if label not in existing_labels:
                    result.append({"label": label, "text": f"Option {label}", "is_correct": False})
            return result[:4]

        return v

    options: list[MCQOptionAI] = Field(min_length=4, max_length=4)
    correct_answer: Literal["A", "B", "C", "D"] = "A"
    explanation: str = Field(default="See correct answer.", min_length=1)

    @model_validator(mode="after")
    def fix_correct_flags(self) -> "MCQQuestionAI":
        """
        Auto-heal two common llama3.2:3b mistakes:
        1. No option marked is_correct=True → mark the one matching correct_answer
        2. correct_answer doesn't match the is_correct option → fix correct_answer
        """
        correct_options = [o for o in self.options if o.is_correct]

        if len(correct_options) == 0:
            # Mark the option whose label matches correct_answer
            for o in self.options:
                o.is_correct = (o.label == self.correct_answer)
        elif len(correct_options) > 1:
            # Keep only first, unmark others
            first = correct_options[0]
            for o in self.options:
                o.is_correct = (o.label == first.label)
            self.correct_answer = first.label
        else:
            # Exactly one correct — make sure correct_answer matches it
            self.correct_answer = correct_options[0].label

        # The model tends to copy the example template and always place the
        # correct answer at "B" — shuffle option order so storage isn't biased.
        random.shuffle(self.options)
        for label, option in zip(["A", "B", "C", "D"], self.options):
            option.label = label
        self.correct_answer = next(o.label for o in self.options if o.is_correct)

        return self


class OpenEndedQuestionAI(BaseModel):
    # Default "OPEN_ENDED" so model can omit this field without failing validation
    question_type: Literal["OPEN_ENDED"] = "OPEN_ENDED"
    question_text: str = Field(min_length=5)
    skill_tested: str = Field(default="General", min_length=1)
    difficulty: Literal["EASY", "MEDIUM", "HARD"] = "MEDIUM"
    marks: int = Field(ge=1, default=5)

    @field_validator("question_type", mode="before")
    @classmethod
    def normalize_question_type(cls, v: object) -> str:
        if v in (None, ""):
            return "OPEN_ENDED"
        if isinstance(v, str):
            normalized = v.strip().upper().replace("-", "_").replace(" ", "_")
            if normalized in {
                "OPEN_ENDED",
                "OPENENDED",
                "OPEN_END",
                "OPEN_ANSWER",
                "LONG_ANSWER",
                "SHORT_ANSWER",
                "ESSAY",
                "WRITTEN",
                "CQ",
            }:
                return "OPEN_ENDED"
        return v

    @field_validator("marks", mode="before")
    @classmethod
    def clamp_oe_marks(cls, v: int) -> int:
        return max(1, min(int(v), 20))

    expected_answer: str = Field(default="See scoring rubric.", min_length=1)
    scoring_rubric: str = Field(default="Award marks for demonstrating understanding.", min_length=1)

    @field_validator("expected_answer", mode="before")
    @classmethod
    def default_blank_expected_answer(cls, v: object) -> str:
        if not isinstance(v, str) or not v.strip():
            return "Evaluate the answer against the scenario, role requirements, and scoring rubric."
        return v

    @field_validator("scoring_rubric", mode="before")
    @classmethod
    def default_blank_scoring_rubric(cls, v: object) -> str:
        if not isinstance(v, str) or not v.strip():
            return "Award marks for a complete, practical answer with clear reasoning and role-relevant details."
        return v


class GeneratedTestAI(BaseModel):
    """The full test object Gemma must return for each of the 3 test types."""
    title: str = Field(min_length=5)
    description: str = Field(min_length=10)
    duration_minutes: int = Field(ge=15, le=180)
    total_marks: int = Field(ge=1)
    difficulty: Literal["EASY", "MEDIUM", "HARD", "MIXED"]
    mcq_questions: list[MCQQuestionAI] = Field(min_length=1)
    open_ended_questions: list[OpenEndedQuestionAI] = Field(min_length=1)

    @model_validator(mode="before")
    @classmethod
    def normalize_question_keys(cls, data: object) -> object:
        """
        Heal common model output mistakes before field validation runs:
        1. Alternative key names for open-ended questions
        2. Mixed "questions" array → split by question_type
        3. Nested "test" wrapper
        """
        if not isinstance(data, dict):
            return data

        # Unwrap {"test": {...}} wrapper the model sometimes emits
        if "test" in data and isinstance(data["test"], dict) and len(data) == 1:
            data = data["test"]

        # Alternative key names for the open-ended list
        if "open_ended_questions" not in data or not data.get("open_ended_questions"):
            for alt in ("open_ended", "written_questions", "essay_questions",
                        "long_answer_questions", "short_answer_questions", "subjective_questions"):
                if alt in data and isinstance(data[alt], list) and data[alt]:
                    data["open_ended_questions"] = data.pop(alt)
                    break

        # Alternative key names for the MCQ list
        if "mcq_questions" not in data or not data.get("mcq_questions"):
            for alt in ("mcq", "multiple_choice_questions", "multiple_choice",
                        "objective_questions", "choice_questions"):
                if alt in data and isinstance(data[alt], list) and data[alt]:
                    data["mcq_questions"] = data.pop(alt)
                    break

        # Mixed "questions" array — split by question_type
        if (("open_ended_questions" not in data or not data.get("open_ended_questions"))
                and "questions" in data and isinstance(data["questions"], list)):
            all_q = data.pop("questions")
            mcq_types = {"MCQ", "mcq", "multiple_choice", "MULTIPLE_CHOICE"}
            oe_types  = {"OPEN_ENDED", "open_ended", "essay", "ESSAY", "written"}
            mcq_qs = [q for q in all_q if isinstance(q, dict) and q.get("question_type") in mcq_types]
            oe_qs  = [q for q in all_q if isinstance(q, dict) and q.get("question_type") in oe_types]
            if mcq_qs and not data.get("mcq_questions"):
                data["mcq_questions"] = mcq_qs
            if oe_qs:
                data["open_ended_questions"] = oe_qs

        return data

    @field_validator("mcq_questions", mode="before")
    @classmethod
    def truncate_mcq_list(cls, v: object) -> object:
        """
        Silently discard extra MCQs the model emits beyond the requested count.
        Pydantic validates items one-by-one after this, so truncating here
        prevents malformed trailing items from failing the whole test slot.
        """
        if isinstance(v, list) and len(v) > 5:
            return v[:5]
        return v

    @field_validator("open_ended_questions", mode="before")
    @classmethod
    def truncate_oe_list(cls, v: object) -> object:
        """Discard extra open-ended questions beyond the requested count."""
        if isinstance(v, list) and len(v) > 2:
            return v[:2]
        return v

    from pydantic import model_validator

    @model_validator(mode="after")
    def auto_correct_total_marks(self) -> "GeneratedTestAI":
        computed = (
            sum(q.marks for q in self.mcq_questions)
            + sum(q.marks for q in self.open_ended_questions)
        )
        if computed > 0 and abs(self.total_marks - computed) > 5:
            self.total_marks = computed
        return self


# ─────────────────────────────────────────────────────────────
# API RESPONSE SCHEMAS
# Returned to the Next.js frontend.
# ─────────────────────────────────────────────────────────────

class MCQOptionResponse(BaseModel):
    label: str
    text: str
    is_correct: bool


class QuestionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    test_id: str
    question_type: QuestionType
    question_text: str
    skill_tested: str | None
    difficulty: Difficulty
    marks: int
    order_index: int
    # MCQ
    options: list[MCQOptionResponse] | None = None
    correct_answer: str | None = None
    explanation: str | None = None
    # Open-ended
    expected_answer: str | None = None
    scoring_rubric: str | None = None
    # Coding
    code_language: str | None = None
    code_starter: str | None = None
    created_at: datetime
    updated_at: datetime


class TestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    jd_id: str
    test_type: TestType
    title: str
    description: str | None
    duration_minutes: int
    total_marks: int
    passing_marks: int | None = None
    difficulty: Difficulty
    status: TestStatus
    created_at: datetime
    updated_at: datetime
    questions: list[QuestionResponse] = Field(default_factory=list)


class TestSummaryResponse(BaseModel):
    """Lightweight test card for list views — no questions."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    jd_id: str
    test_type: TestType
    title: str
    duration_minutes: int
    total_marks: int
    difficulty: Difficulty
    status: TestStatus
    passing_marks: int | None = None
    question_count: int = 0
    mcq_count: int = 0
    open_ended_count: int = 0
    code_count: int = 0
    created_at: datetime
    updated_at: datetime


class GenerateTestsResponse(BaseModel):
    """Returned after successfully generating all 3 tests."""
    jd_id: str
    tests: list[TestSummaryResponse]
    message: str = "3 tests generated successfully."
    is_regeneration: bool = False


# ─────────────────────────────────────────────────────────────
# EDIT REQUEST SCHEMAS
# Sent from Next.js when admin edits a question or test metadata.
# ─────────────────────────────────────────────────────────────

class UpdateTestRequest(BaseModel):
    title: str | None = Field(default=None, min_length=5)
    description: str | None = None
    duration_minutes: int | None = Field(default=None, ge=15, le=180)
    difficulty: Difficulty | None = None
    # The score a candidate must reach to be marked Pass. Bounded against the
    # test's own total_marks in update_test_metadata, which is the only place
    # that value is known.
    passing_marks: int | None = Field(default=None, ge=0)


class MCQOptionUpdate(BaseModel):
    label: Literal["A", "B", "C", "D"]
    text: str = Field(min_length=1)
    is_correct: bool


class UpdateQuestionRequest(BaseModel):
    question_text: str | None = Field(default=None, min_length=10)
    skill_tested: str | None = None
    difficulty: Difficulty | None = None
    marks: int | None = Field(default=None, ge=1, le=20)
    # MCQ only
    options: list[MCQOptionUpdate] | None = None
    correct_answer: Literal["A", "B", "C", "D"] | None = None
    explanation: str | None = None
    # Open-ended only
    expected_answer: str | None = None
    scoring_rubric: str | None = None
    # Coding only
    code_language: str | None = None
    code_starter: str | None = None

    @field_validator("options")
    @classmethod
    def validate_options_if_provided(
        cls, opts: list[MCQOptionUpdate] | None
    ) -> list[MCQOptionUpdate] | None:
        if opts is None:
            return opts
        if len(opts) != 4:
            raise ValueError("MCQ must have exactly 4 options")
        correct_count = sum(1 for o in opts if o.is_correct)
        if correct_count != 1:
            raise ValueError("MCQ must have exactly 1 correct option")
        return opts


class ApproveTestRequest(BaseModel):
    status: Literal["APPROVED", "DRAFT", "ARCHIVED"]


class BulkDeleteQuestionsRequest(BaseModel):
    question_ids: list[str] = Field(min_length=1)
    # Skip the in-use check and delete anyway (e.g. user re-submitted after
    # being warned). See test_service.get_in_use_question_ids.
    force: bool = False


class BulkDeleteTestsRequest(BaseModel):
    test_ids: list[str] = Field(min_length=1)
    force: bool = False


class DifficultyOverride(BaseModel):
    easy_percent: int = Field(ge=0, le=100)
    medium_percent: int = Field(ge=0, le=100)
    hard_percent: int = Field(ge=0, le=100)

    @model_validator(mode="after")
    def _sum_must_be_100(self) -> "DifficultyOverride":
        total = self.easy_percent + self.medium_percent + self.hard_percent
        if total != 100:
            raise ValueError(
                f"easy_percent + medium_percent + hard_percent must equal 100, got {total}"
            )
        return self


class GenerateTestsRequest(BaseModel):
    difficulty_distribution: DifficultyOverride | None = None
