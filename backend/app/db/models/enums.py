"""
Python enums mirroring the Prisma schema enums.
Import these in SQLAlchemy models and Pydantic schemas.
"""

import enum


class Role(str, enum.Enum):
    # Ordered least → most privileged. USER is the default self-signup role
    # (a hiring "operator"); ADMIN adds workspace configuration; SUPER_ADMIN
    # adds governance (users, trash, CMS, maintenance). See ROLE_RANK in
    # app/dependencies.py for the hierarchy used by require_min_role().
    USER = "USER"
    ADMIN = "ADMIN"
    SUPER_ADMIN = "SUPER_ADMIN"
    # DEV sits outside the privilege ladder above — it unlocks the internal
    # docs site only (see frontend/src/lib/docs.ts) and is deliberately left
    # out of ROLE_RANK so it can never satisfy a require_min_role() check.
    DEV = "DEV"


class FileType(str, enum.Enum):
    PDF = "PDF"
    DOCX = "DOCX"


class ParseStatus(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    DONE = "DONE"
    FAILED = "FAILED"


class TestType(str, enum.Enum):
    TECHNICAL = "TECHNICAL"
    REASONING = "REASONING"
    PROBLEM_SOLVING = "PROBLEM_SOLVING"
    # Added for the question-bank/sectioned-exam redesign (Master Prompt 2).
    # PROBLEM_SOLVING is kept (never removed) so historical/in-flight Test
    # rows referencing it stay valid — new section-based generation targets
    # REASONING / PRACTICAL / TECHNICAL only.
    PRACTICAL = "PRACTICAL"


class Difficulty(str, enum.Enum):
    EASY = "EASY"
    MEDIUM = "MEDIUM"
    HARD = "HARD"
    MIXED = "MIXED"


class TestStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    APPROVED = "APPROVED"
    ARCHIVED = "ARCHIVED"


class QuestionType(str, enum.Enum):
    MCQ = "MCQ"
    OPEN_ENDED = "OPEN_ENDED"
    CODE = "CODE"


class EvaluationLevel(str, enum.Enum):
    BEGINNER = "BEGINNER"
    INTERMEDIATE = "INTERMEDIATE"
    ADVANCED = "ADVANCED"
    EXPERT = "EXPERT"


class InvitationStatus(str, enum.Enum):
    PENDING = "PENDING"
    OPENED = "OPENED"
    COMPLETED = "COMPLETED"
    EXPIRED = "EXPIRED"
    REVOKED = "REVOKED"
    # System-driven (candidate violated exam integrity), distinct from REVOKED
    # (an explicit admin action) so admin UI can show separate badges.
    TERMINATED = "TERMINATED"


class AttemptStatus(str, enum.Enum):
    NOT_STARTED = "NOT_STARTED"
    IN_PROGRESS = "IN_PROGRESS"
    SUBMITTED = "SUBMITTED"
    EVALUATED = "EVALUATED"
    TERMINATED = "TERMINATED"


class AIRecommendation(str, enum.Enum):
    STRONG_HIRE = "STRONG_HIRE"
    HIRE = "HIRE"
    MAYBE = "MAYBE"
    NO_HIRE = "NO_HIRE"


class GenerationStatus(str, enum.Enum):
    IDLE = "IDLE"               # Nothing running — awaiting next action
    DRAFTING = "DRAFTING"       # JD text being generated from a brief (self-hosted AI)
    EXTRACTING = "EXTRACTING"   # Skill extraction in progress
    GENERATING = "GENERATING"   # Test generation in progress
    READY = "READY"             # Tests are generated and ready
    FAILED = "FAILED"           # Last background operation failed


class JdSource(str, enum.Enum):
    """How a JobDescription originated."""

    UPLOADED = "UPLOADED"       # A file (PDF/DOCX) uploaded by an operator
    GENERATED = "GENERATED"     # Generated in-app from a brief via self-hosted AI


class AIDetectionConfidence(str, enum.Enum):
    """How confident the AI-likeness estimate is in its own assessment —
    not how likely the answer is AI-generated. Always show alongside the
    percentage; a low-confidence HIGH_CONCERN result deserves less weight
    than a high-confidence one."""
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class AIDetectionRecommendation(str, enum.Enum):
    NO_CONCERN = "NO_CONCERN"
    REVIEW_SUGGESTED = "REVIEW_SUGGESTED"
    HIGH_CONCERN = "HIGH_CONCERN"


class PublicLinkStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"      # Open for candidate registrations
    DISABLED = "DISABLED"  # Manually disabled by admin
    EXPIRED = "EXPIRED"    # Past expires_at


# ─── Question bank / sectioned exam (Master Prompt 2) ──────────

class QuestionBankStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    GENERATING = "GENERATING"
    READY = "READY"
    FAILED = "FAILED"
    ARCHIVED = "ARCHIVED"


class ExamTemplateStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    ARCHIVED = "ARCHIVED"


class ExamAttemptStatus(str, enum.Enum):
    """Status machine for the ExamAttempt wrapper (spans all 3 sections).

    ASSIGNED → STARTED → SECTION_SUBMITTED (repeats per section) → SUBMITTED
                                                                  ↘ FAILED
    SUBMITTED → EVALUATING → EVALUATED

    This is independent of (and does not replace) AttemptStatus, which still
    governs each individual per-section TestAttempt row.
    """
    ASSIGNED = "ASSIGNED"
    STARTED = "STARTED"
    SECTION_SUBMITTED = "SECTION_SUBMITTED"
    SUBMITTED = "SUBMITTED"
    EVALUATING = "EVALUATING"
    EVALUATED = "EVALUATED"
    FAILED = "FAILED"


class SectionType(str, enum.Enum):
    """Candidate-facing exam section — maps 1:1 to a Test.test_type slot."""
    REASONING = "REASONING"
    PRACTICAL = "PRACTICAL"
    TECHNICAL = "TECHNICAL"
