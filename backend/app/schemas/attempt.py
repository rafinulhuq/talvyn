"""
Pydantic schemas for test attempt endpoints.

Separation of concerns:
  - StartAttemptRequest   / StartAttemptResponse   — begin a test
  - SaveAnswerRequest     / SaveAnswerResponse      — autosave one answer
  - HeartbeatRequest      / HeartbeatResponse       — sync timer server-side
  - SubmitAttemptRequest  / SubmitAttemptResponse   — final submission
  - SuspiciousEventRequest                          — log an integrity event
  - AttemptStateResponse                            — resume an in-progress attempt
"""

import json
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

# ─── Start ────────────────────────────────────────────────────

class StartAttemptRequest(BaseModel):
    """POST /attempts/start — candidate begins a specific test."""
    token: str = Field(min_length=10)
    test_index: int = Field(
        ge=0,
        default=0,
        description=(
            "0-based index into the list of approved tests for this invitation. "
            "The candidate UI uses token validation progress to request the "
            "next unfinished test."
        ),
    )


class QuestionForCandidate(BaseModel):
    """
    Question data safe to send to the candidate browser.

    Security: correct_answer, explanation, expected_answer, and
    scoring_rubric are intentionally excluded.
    """
    id: str
    question_type: Literal["MCQ", "OPEN_ENDED", "CODE"]
    question_text: str
    skill_tested: str | None
    difficulty: str
    marks: int
    order_index: int
    # MCQ: options without is_correct flag (answer hidden from client)
    options: list[dict] | None = None
    # CODE: language hint and optional starter snippet; null for MCQ/OPEN_ENDED
    code_language: str | None = None
    code_starter: str | None = None


class StartAttemptResponse(BaseModel):
    attempt_id: str
    test_id: str
    test_title: str
    duration_seconds: int
    total_questions: int
    questions: list[QuestionForCandidate]
    started_at: datetime
    # Any previously saved answers (for resume)
    saved_answers: dict[str, str] = Field(
        default_factory=dict,
        description="Map of question_id → saved answer (selected_option or answer_text)",
    )


# ─── Save answer ──────────────────────────────────────────────

class SaveAnswerRequest(BaseModel):
    question_id: str
    # Exactly one of these must be set
    selected_option: Literal["A", "B", "C", "D"] | None = None
    answer_text: str | None = None

    @field_validator("answer_text")
    @classmethod
    def trim_answer_text(cls, v: str | None) -> str | None:
        if v is None:
            return None
        trimmed = v.strip()
        # Hard cap: 10,000 chars per answer
        return trimmed[:10_000] if trimmed else None

    @model_validator(mode="after")
    def reject_both_set(self) -> "SaveAnswerRequest":
        # Both None is valid (an unanswered/cleared question is silently
        # skipped by the service layer) — only reject the ambiguous case
        # where a client sends both an MCQ option and free text at once.
        if self.selected_option is not None and self.answer_text is not None:
            raise ValueError("Only one of selected_option or answer_text may be set.")
        return self


class SaveAnswerResponse(BaseModel):
    question_id: str
    saved: bool
    saved_at: datetime


# ─── Heartbeat (timer sync) ───────────────────────────────────

class HeartbeatRequest(BaseModel):
    """
    Sent by the client every 30s to sync the server-side timer.
    Client reports its local remaining seconds; server reconciles.
    """
    client_time_remaining_seconds: int = Field(ge=0)


class HeartbeatResponse(BaseModel):
    attempt_id: str
    server_time_remaining_seconds: int
    # If the server says ≤ 0, the client must submit immediately
    force_submit: bool = False
    status: str


# ─── Bulk save ────────────────────────────────────────────────

class BulkSaveRequest(BaseModel):
    """Save multiple answers in one request — used by autosave and on submit."""
    # No real test has more than a few dozen questions; 200 leaves generous
    # headroom while bounding the payload size and the DB upsert loop.
    answers: list[SaveAnswerRequest] = Field(max_length=200)


class BulkSaveResponse(BaseModel):
    """How many answers were written to the database."""
    saved_count: int


# ─── Submit ───────────────────────────────────────────────────

class SubmitAttemptRequest(BaseModel):
    # Final answers snapshot — sent with the submit request to guarantee
    # the last state is captured even if the last autosave was missed.
    answers: list[SaveAnswerRequest] = Field(default_factory=list, max_length=200)
    # True when submit was triggered by timer expiry, not user action
    auto_submitted: bool = False


class SubmitAttemptResponse(BaseModel):
    attempt_id: str
    submitted_at: datetime
    total_questions: int
    answered_questions: int
    auto_submitted: bool
    message: str = "Your assessment has been submitted successfully."
    # Lets the candidate continue a multi-test invitation instead of hitting
    # a dead end: the 0-based index of the next approved test to attempt, or
    # null once every approved test for this invitation has been submitted.
    next_test_index: int | None = None
    total_tests: int = 0


# ─── Suspicious events ────────────────────────────────────────

SUSPICIOUS_EVENT_TYPES = Literal[
    "TAB_SWITCH",
    "WINDOW_BLUR",
    "VISIBILITY_HIDDEN",
    "COPY_ATTEMPT",
    "PASTE_ATTEMPT",
    "CUT_ATTEMPT",
    "CONTEXT_MENU",
    "DEVTOOLS_OPEN",
    "FULLSCREEN_EXIT",
    "BLOCKED_SHORTCUT",
]


class SuspiciousEventRequest(BaseModel):
    event_type: SUSPICIOUS_EVENT_TYPES
    metadata: dict | None = None

    @field_validator("metadata")
    @classmethod
    def bound_metadata_size(cls, v: dict | None) -> dict | None:
        if v is None:
            return None
        # This is structured context like {"count": 3, "duration_ms": 4200} —
        # 2KB of JSON is generous headroom while bounding what gets written
        # to the suspicious_events JSONB column on every logged event.
        if len(json.dumps(v)) > 2048:
            raise ValueError("metadata is too large (max 2KB serialized).")
        return v


class SuspiciousEventResponse(BaseModel):
    logged: bool
    event_type: str


# ─── Terminate (hard integrity enforcement) ───────────────────

class TerminateAttemptRequest(BaseModel):
    """
    POST /attempts/{id}/terminate — candidate-side enforcement calls this on
    the first serious integrity violation (tab switch, window blur, etc).
    Ends this attempt AND the parent invitation — see attempt_service.terminate_attempt.
    """
    reason: SUSPICIOUS_EVENT_TYPES
    metadata: dict | None = None

    @field_validator("metadata")
    @classmethod
    def bound_metadata_size(cls, v: dict | None) -> dict | None:
        if v is None:
            return None
        if len(json.dumps(v)) > 2048:
            raise ValueError("metadata is too large (max 2KB serialized).")
        return v


class TerminateAttemptResponse(BaseModel):
    attempt_id: str
    status: str
    terminated_at: datetime
    message: str = (
        "This assessment was ended due to an integrity violation. "
        "Remaining tests in this invitation are no longer available."
    )


# ─── Attempt state (resume) ───────────────────────────────────

class AttemptStateResponse(BaseModel):
    """Full state for resuming an in-progress attempt after page refresh."""
    attempt_id: str
    test_id: str
    test_title: str
    status: str
    duration_seconds: int
    server_time_remaining_seconds: int
    started_at: datetime
    questions: list[QuestionForCandidate]
    saved_answers: dict[str, str]
    # Populated only when status == "TERMINATED" — lets the frontend render
    # the termination screen with the specific cause on page-refresh resume.
    integrity_violation_reason: str | None = None
    terminated_at: datetime | None = None
