# Database Documentation

> Source of truth for table counts and enumerations: [`_facts.md`](./_facts.md) §2
> ("Database Models — 12 tables") and §3 ("Enums — 12 total"). Column-level
> detail in this document was extracted directly from
> `backend/app/db/models/*.py` and the Alembic migrations in
> `backend/alembic/versions/`, not re-derived from memory.

Talvyn persists all application state in a single PostgreSQL 16 database
(`pgvector/pgvector:pg16` image — see `docker-compose.yml`), accessed
exclusively through SQLAlchemy's async ORM (`AsyncSession`, `asyncpg`
driver). There is no synchronous fallback path in application code. Schema
changes are managed by Alembic; the same model files are also exercised
against an in-memory SQLite database in the test suite (213 tests across 11
files — see `_facts.md` §6), which is why several custom column types exist
purely to keep one model definition portable across both dialects.

The schema is intentionally small and linear: 12 tables, organized around one
core entity chain — **Job Description → Test → Invitation → Attempt →
Evaluation** — plus the `User` table for admin authentication.

---

## 1. ER Diagram

```mermaid
erDiagram
    USER ||--o{ JOB_DESCRIPTION : uploads
    USER ||--o{ INVITATION : sends
    USER ||--o{ PUBLIC_ASSESSMENT_LINK : creates

    JOB_DESCRIPTION ||--o| JD_EXTRACTED_DATA : "has extracted data"
    JOB_DESCRIPTION ||--o{ TEST : "generates"
    JOB_DESCRIPTION ||--o{ INVITATION : "is target of"
    JOB_DESCRIPTION ||--o{ PUBLIC_ASSESSMENT_LINK : "is shared via"

    PUBLIC_ASSESSMENT_LINK ||--o{ INVITATION : "mints"

    TEST ||--o{ QUESTION : contains
    TEST ||--o{ TEST_ATTEMPT : "is attempted via"

    CANDIDATE ||--o{ INVITATION : receives
    CANDIDATE ||--o{ TEST_ATTEMPT : attempts

    INVITATION ||--o{ TEST_ATTEMPT : "spawns"

    TEST_ATTEMPT ||--o{ CANDIDATE_ANSWER : "records"
    TEST_ATTEMPT ||--o{ SUSPICIOUS_EVENT : "logs"
    TEST_ATTEMPT ||--o| EVALUATION : "is scored by"

    QUESTION ||--o{ CANDIDATE_ANSWER : "is answered in"
    QUESTION ||--o{ QUESTION_FEEDBACK : "receives"

    EVALUATION ||--o{ QUESTION_FEEDBACK : "is detailed by"

    USER {
        string id PK
        string email UK
        string name
        string password_hash
        enum role
        datetime created_at
        datetime updated_at
    }

    CANDIDATE {
        string id PK
        string email UK
        string name
        string phone
        string linkedin_url
        string resume_url
        datetime created_at
        datetime updated_at
    }

    INVITATION {
        string id PK
        string candidate_id FK
        string jd_id FK
        string invited_by FK
        string public_link_id FK
        string token_hash UK
        datetime expires_at
        enum status
        datetime email_sent_at
        datetime created_at
    }

    PUBLIC_ASSESSMENT_LINK {
        string id PK
        string jd_id FK
        string public_slug UK
        string title
        enum status
        datetime expires_at
        int max_registrations
        int view_count
        int registration_count
        string created_by FK
        datetime created_at
        datetime updated_at
    }

    JOB_DESCRIPTION {
        string id PK
        string uploaded_by FK
        string original_filename
        string file_path
        enum file_type
        text raw_text
        enum parse_status
        enum generation_status
        datetime created_at
        datetime updated_at
    }

    JD_EXTRACTED_DATA {
        string id PK
        string jd_id FK_UK
        string job_title
        string seniority_level
        json must_have_skills
        json nice_to_have_skills
        json tools_technologies
        json responsibilities
        json recommended_test_topics
        json difficulty_distribution
        datetime extracted_at
    }

    TEST {
        string id PK
        string jd_id FK
        enum test_type
        string title
        text description
        int duration_minutes
        int total_marks
        enum difficulty
        enum status
        int passing_marks
        datetime created_at
        datetime updated_at
    }

    QUESTION {
        string id PK
        string test_id FK
        enum question_type
        text question_text
        string skill_tested
        enum difficulty
        int marks
        int order_index
        json options
        string correct_answer
        text explanation
        text expected_answer
        text scoring_rubric
        string code_language
        text code_starter
        datetime created_at
        datetime updated_at
    }

    TEST_ATTEMPT {
        string id PK
        string invitation_id FK
        string candidate_id FK
        string test_id FK
        datetime started_at
        datetime submitted_at
        int time_remaining_seconds
        enum status
        string ip_address
        bool auto_submitted
    }

    CANDIDATE_ANSWER {
        string id PK
        string attempt_id FK
        string question_id FK
        string selected_option
        text answer_text
        bool is_auto_scored
        int auto_score
        datetime saved_at
        datetime updated_at
    }

    SUSPICIOUS_EVENT {
        string id PK
        string attempt_id FK
        string event_type
        datetime occurred_at
        json event_metadata
    }

    EVALUATION {
        string id PK
        string attempt_id FK_UK
        int total_score
        int max_score
        float percentage
        int mcq_score
        int mcq_max
        int open_ended_score
        int open_ended_max
        json ai_strengths
        json ai_weaknesses
        enum ai_recommendation
        text ai_summary
        enum admin_override_recommendation
        text admin_notes
        enum evaluation_level
        json improvement_suggestions
        text suitable_role
        json skill_breakdown
        vector embedding
        bool is_preliminary
        datetime evaluated_at
    }

    QUESTION_FEEDBACK {
        string id PK
        string evaluation_id FK
        string question_id FK
        string attempt_id FK
        string question_type
        int awarded_score
        int max_score
        bool is_correct
        text ai_feedback
        json matched_criteria
        json missed_criteria
        int admin_awarded_score
    }
```

Cardinality notes (verified against the actual `ForeignKey`/`relationship()`
declarations, not assumed):

- `JobDescription ||--o| JdExtractedData` is genuinely **one-to-zero-or-one**:
  `JdExtractedData.jd_id` carries both `ForeignKey(...)` and `unique=True`,
  and the parent-side relationship is declared with `uselist=False`. A JD
  starts with no extracted data row and gets exactly one once skill
  extraction finishes.
- `TestAttempt ||--o| Evaluation` is one-to-zero-or-one for the same reason:
  `Evaluation.attempt_id` is `unique=True`. An attempt has at most one
  evaluation — re-evaluation overwrites/replaces rather than appending.
- Every other relationship in the diagram is a plain one-to-many, enforced by
  a non-unique foreign key on the child side.
- `CandidateAnswer` is conceptually a many-to-many *junction* between
  `TestAttempt` and `Question`, but it carries its own surrogate UUID primary
  key (it is not a pure association table) and a composite **unique** index
  on `(attempt_id, question_id)`, so in practice it's one row per
  (attempt, question) pair — never more.
- `PublicAssessmentLink ||--o{ Invitation` is **nullable** on the child side:
  `Invitation.public_link_id` is `NULL` for every invitation created through
  the manual/bulk admin invite flow, and only set when the invitation was
  minted by a candidate self-registering through a public link. The FK is
  `ondelete="SET NULL"` rather than `CASCADE` — deleting a public link must
  never delete the invitations (and the attempts/results behind them) that
  it already produced.

---

## 2. Tables

### 2.1 `users` — `User` (`backend/app/db/models/user.py`)

**Purpose.** Admin/staff accounts — the only humans with standing
credentials in the system. Candidates never get a `users` row; they
authenticate solely via single-use invitation tokens (see `Invitation`
below). `users` is the FK target for "who uploaded this JD" and "who sent
this invitation," giving every JD and every invitation an audit trail back
to a named staff member.

| Column | Type | Constraints |
|---|---|---|
| `id` | `GUID()` (PG: native `UUID`; SQLite: `CHAR(36)`) | PK, default `uuid4()` |
| `email` | `String(255)` | NOT NULL, **UNIQUE** |
| `name` | `String(255)` | NOT NULL |
| `password_hash` | `String(255)` | NOT NULL |
| `role` | `Enum(Role)` — `ADMIN` \| `SUPER_ADMIN` | NOT NULL, default/`server_default` `ADMIN` |
| `created_at` | `DateTime(timezone=True)` | NOT NULL, `server_default=now()` |
| `updated_at` | `DateTime(timezone=True)` | NOT NULL, `default=now()`, `onupdate=now()` |

No explicit indexes beyond the implicit unique index PostgreSQL creates for
the `email` unique constraint (used on every login lookup). No outbound FKs.
Inbound: `JobDescription.uploaded_by`, `Invitation.invited_by` both reference
`users.id` with **no `ondelete`** specified — deleting a `User` row is
expected to be blocked by the database's default `ON DELETE NO ACTION`
unless the referencing rows are reassigned/removed first. There is
deliberately no cascade here: a JD or invitation should never silently lose
its "uploaded/sent by" attribution just because an admin account is removed.

### 2.2 `candidates` — `Candidate` (`backend/app/db/models/candidate.py`)

**Purpose.** A real person being assessed. One `Candidate` row is shared
across every JD they're invited to apply for — the table is deduplicated by
email, not created per-invitation, so the same person interviewing for two
different roles produces one `Candidate` and two `Invitation` rows.

| Column | Type | Constraints |
|---|---|---|
| `id` | `GUID()` | PK, default `uuid4()` |
| `email` | `String(255)` | NOT NULL, **UNIQUE** |
| `name` | `String(255)` | NOT NULL |
| `phone` | `String(50)` | NULLABLE |
| `linkedin_url` | `String(500)` | NULLABLE |
| `resume_url` | `String(500)` | NULLABLE |
| `created_at` | `DateTime(timezone=True)` | NOT NULL, `server_default=now()` |
| `updated_at` | `DateTime(timezone=True)` | NOT NULL, `default=now()`, `onupdate=now()` |

`linkedin_url` and `resume_url` are only ever populated by the public
self-registration form (`/apply/<slug>`) — the manual/bulk admin invite form
only collects name and email, so these two columns are `NULL` for candidates
who were never invited through a public link.

**Relationships.** `invitations` (one-to-many, `cascade="all, delete-orphan"`
at the ORM level — deleting a `Candidate` through the ORM deletes its
`Invitation` rows in Python before flush). At the database level the FK from
`invitations.candidate_id` is also declared `ondelete="CASCADE"`, so the
cascade is enforced redundantly both in the ORM and in the schema — a raw SQL
`DELETE FROM candidates` (bypassing the ORM) still cascades correctly.

### 2.3 `invitations` — `Invitation` (`backend/app/db/models/candidate.py`)

**Purpose.** A single-use, time-boxed link sent to one candidate for one job
description, and the security boundary candidates operate within. The raw
token is emailed once and never persisted — only its HMAC-SHA256 hash
(`token_hash`) is stored, so a database leak alone cannot be used to forge
working test-taking links. Status moves `PENDING → OPENED → COMPLETED`, or
sideways to `EXPIRED` (time-based) / `REVOKED` (admin action).

| Column | Type | Constraints |
|---|---|---|
| `id` | `GUID()` | PK, default `uuid4()` |
| `candidate_id` | `GUID()` | FK → `candidates.id`, `ondelete="CASCADE"`, NOT NULL |
| `jd_id` | `GUID()` | FK → `job_descriptions.id`, `ondelete="CASCADE"`, NOT NULL |
| `invited_by` | `GUID()` | FK → `users.id`, NOT NULL, no `ondelete` |
| `public_link_id` | `GUID()` | FK → `public_assessment_links.id`, `ondelete="SET NULL"`, NULLABLE |
| `token_hash` | `String(64)` | NOT NULL, **UNIQUE** (HMAC-SHA256 hex digest) |
| `expires_at` | `DateTime(timezone=True)` | NOT NULL |
| `status` | `Enum(InvitationStatus)` — `PENDING`\|`OPENED`\|`COMPLETED`\|`EXPIRED`\|`REVOKED` | NOT NULL, default/`server_default` `PENDING` |
| `email_sent_at` | `DateTime(timezone=True)` | NULLABLE |
| `created_at` | `DateTime(timezone=True)` | NOT NULL, `server_default=now()` |

`public_link_id` is `NULL` for invitations created by the manual single/bulk
admin invite flow, and set to the originating `PublicAssessmentLink.id` when
a candidate self-registered through `/apply/<slug>` instead. It exists
purely for attribution/reporting — nothing in the invitation or attempt
lifecycle (`validate_token`, `start_attempt`, `submit_attempt`) branches on
whether this column is set. `invited_by` is still populated on these rows —
it's set to the public link's `created_by` (the admin who created the link),
not to a placeholder, so `invited_by` has the same NOT NULL/FK-to-`users.id`
guarantee regardless of how the invitation was created.

**Indexes** (`__table_args__`): `ix_invitations_candidate_id` on
`candidate_id`, `ix_invitations_jd_id` on `jd_id`, `ix_invitations_public_link_id`
on `public_link_id` — these support "all invitations for this
candidate/JD/public-link" admin queries. `token_hash`'s `unique=True`
already gives PostgreSQL an implicit unique index, which doubles as the fast
path for validating an inbound token on every candidate-facing request.

**Cascade behavior.** Deleting a `Candidate` or a `JobDescription` cascades
to delete their `Invitation` rows at the database level
(`ondelete="CASCADE"` on both FKs). Deleting a `User` does **not** cascade to
`invitations.invited_by` — there's no `ondelete` clause, so the constraint
defaults to blocking the delete (or, if the application deletes via plain
SQL with constraints deferred, would otherwise need explicit handling).
Deleting a `PublicAssessmentLink` does **not** delete the invitations it
produced — `public_link_id` is `ondelete="SET NULL"`, so removing a link
only severs the attribution, leaving the candidate's invitation, attempts,
and results intact.

### 2.4 `job_descriptions` — `JobDescription` (`backend/app/db/models/job_description.py`)

**Purpose.** The root entity of the entire candidate-assessment chain. One
row per uploaded JD file (PDF/DOCX). Tracks two independent state machines
on the same row: `parse_status` (did text extraction from the uploaded file
succeed?) and `generation_status` (where is the AI pipeline — skill
extraction, then test generation — in its lifecycle?). Splitting these into
two enums instead of one composite status lets the UI show "file parsed
fine, but AI generation failed" as a distinct, recoverable state rather than
collapsing everything into a single ambiguous status.

| Column | Type | Constraints |
|---|---|---|
| `id` | `GUID()` | PK, default `uuid4()` |
| `uploaded_by` | `GUID()` | FK → `users.id`, NOT NULL, no `ondelete` |
| `original_filename` | `String(255)` | NOT NULL |
| `file_path` | `String(500)` | NOT NULL (storage path/key, not the file content) |
| `file_type` | `Enum(FileType)` — `PDF`\|`DOCX` | NOT NULL |
| `raw_text` | `Text` | NULLABLE (populated once parsing completes) |
| `parse_status` | `Enum(ParseStatus)` — `PENDING`\|`PROCESSING`\|`DONE`\|`FAILED` | NOT NULL, default/`server_default` `PENDING` |
| `generation_status` | `Enum(GenerationStatus, native_enum=False)` — `IDLE`\|`EXTRACTING`\|`GENERATING`\|`READY`\|`FAILED` | NOT NULL, default/`server_default` `IDLE` |
| `created_at` | `DateTime(timezone=True)` | NOT NULL, `server_default=now()` |
| `updated_at` | `DateTime(timezone=True)` | NOT NULL, `default=now()`, `onupdate=now()` |

Note `generation_status` is declared with `native_enum=False`, meaning it is
stored as `VARCHAR(20)` rather than a PostgreSQL `CREATE TYPE ... AS ENUM`
— deliberately, per the inline comment, "to avoid needing a new PostgreSQL
enum type." This is the only enum column in the schema using that strategy;
every other enum column is backed by a real Postgres enum type.

**Indexes** (`__table_args__`): `ix_jd_created_at` on `created_at` (the admin
JD list view sorts by this descending), `ix_jd_uploaded_by` on `uploaded_by`
(per-uploader filtering), `ix_jd_parse_status` on `parse_status` (polling for
pending/done JDs).

**Relationships.** `extracted_data` — one-to-zero-or-one with
`JdExtractedData`, `uselist=False`, `cascade="all, delete-orphan"`. Also the
parent of `Test` (via `tests.jd_id`, not modeled as a Python relationship
attribute on this side, but enforced at the DB level with
`ondelete="CASCADE"`) and of `Invitation` (same).

**Cascade behavior on delete.** Deleting a `JobDescription` cascades, at the
database level, through: `jd_extracted_data` (CASCADE), `tests` (CASCADE) →
which in turn cascades to `questions` (CASCADE) → which cascades to
`candidate_answers` and `question_feedback` referencing those questions
(CASCADE) — and `invitations` (CASCADE) → which cascades to `test_attempts`
(CASCADE) → which cascades to `candidate_answers`, `suspicious_events`, and
`evaluations` (CASCADE) → which cascades to `question_feedback` (CASCADE).
In short: **deleting a JobDescription deletes the entire history for every
candidate who was ever invited to it.** There is no soft-delete or archival
table — this is a destructive, irreversible operation by design, and the
absence of any `RESTRICT`/`NO ACTION` anywhere in this branch of the FK graph
means the application has no DB-level guard rail against it.

### 2.5 `jd_extracted_data` — `JdExtractedData` (`backend/app/db/models/job_description.py`)

**Purpose.** The structured output of running an LLM skill-extraction pass
over `JobDescription.raw_text`. Exists as a separate table (rather than extra
columns on `job_descriptions`) because it's optional, generated
asynchronously after upload, and entirely re-derivable/replaceable — keeping
it separate means a re-extraction can simply delete-and-reinsert this one row
without touching the parent JD's own audit columns.

| Column | Type | Constraints |
|---|---|---|
| `id` | `GUID()` | PK, default `uuid4()` |
| `jd_id` | `GUID()` | FK → `job_descriptions.id`, `ondelete="CASCADE"`, **UNIQUE**, NOT NULL |
| `job_title` | `String(255)` | NULLABLE |
| `seniority_level` | `String(100)` | NULLABLE |
| `must_have_skills` | `JSONType()` (PG: `JSONB`; SQLite: `JSON`) | NOT NULL, default `list` |
| `nice_to_have_skills` | `JSONType()` | NOT NULL, default `list` |
| `tools_technologies` | `JSONType()` | NOT NULL, default `list` |
| `responsibilities` | `JSONType()` | NOT NULL, default `list` |
| `recommended_test_topics` | `JSONType()` | NOT NULL, default `list` |
| `difficulty_distribution` | `JSONType()` | NOT NULL, default `dict` |
| `extracted_at` | `DateTime(timezone=True)` | NOT NULL, `server_default=now()` |

The `unique=True` on `jd_id` is what makes the relationship genuinely
one-to-one rather than one-to-many — the database itself rejects a second
extraction row for the same JD, not just application-level convention. All
six "content" columns are JSON arrays/objects rather than normalized child
tables because their shape is LLM-generated free-form data (lists of skill
strings, a topic-weighting dict) that's always read and written as a whole
unit per JD — there's no query pattern in the codebase that needs to filter
or join on an individual skill, so normalizing them into rows would add
write complexity (multiple INSERTs per extraction) for no query benefit.

### 2.6 `tests` — `Test` (`backend/app/db/models/test.py`)

**Purpose.** A generated assessment (e.g., "Technical Screening — Backend
Engineer") belonging to one JD. A single JD can have multiple tests, e.g. one
`TECHNICAL` and one `REASONING` test, generated independently and each
independently approved before candidates can attempt them.

| Column | Type | Constraints |
|---|---|---|
| `id` | `GUID()` | PK, default `uuid4()` |
| `jd_id` | `GUID()` | FK → `job_descriptions.id`, `ondelete="CASCADE"`, NOT NULL |
| `test_type` | `Enum(TestType)` — `TECHNICAL`\|`REASONING`\|`PROBLEM_SOLVING` | NOT NULL |
| `title` | `String(255)` | NOT NULL |
| `description` | `Text` | NULLABLE |
| `duration_minutes` | `Integer` | NOT NULL, default `60` |
| `total_marks` | `Integer` | NOT NULL, default `0` |
| `difficulty` | `Enum(Difficulty)` — `EASY`\|`MEDIUM`\|`HARD`\|`MIXED` | NOT NULL |
| `status` | `Enum(TestStatus)` — `DRAFT`\|`APPROVED`\|`ARCHIVED` | NOT NULL, default/`server_default` `DRAFT` |
| `passing_marks` | `Integer` | NULLABLE (added in migration `c7e2d4f8a1b3`) |
| `created_at` | `DateTime(timezone=True)` | NOT NULL, `server_default=now()` |
| `updated_at` | `DateTime(timezone=True)` | NOT NULL, `default=now()`, `onupdate=now()` |

**Indexes:** `ix_tests_jd_id` on `jd_id`; composite `ix_tests_jd_id_status`
on `(jd_id, status)` — the inline comment notes this exists specifically
because the candidate-facing `start_attempt` flow filters
`WHERE jd_id = ? AND status = 'APPROVED'`, and a composite index serves that
two-column predicate far better than two separate single-column indexes.

`passing_marks` being nullable is meaningful, not incidental: `NULL` means
"no pass/fail threshold has been configured for this test," and downstream
logic (including the `calculate_evaluation_scores` PL/pgSQL function, §3
below) explicitly treats `NULL` as "pass/fail not applicable" rather than
coercing it to a default of 0 or 100.

**Relationships.** `questions` — one-to-many, `cascade="all, delete-orphan"`,
loaded in `order_index` order so the candidate always sees questions in the
sequence an admin arranged them.

### 2.7 `questions` — `Question` (`backend/app/db/models/test.py`)

**Purpose.** A single test item. One table serves three structurally
different question types (`MCQ`, `OPEN_ENDED`, `CODE`) via a wide nullable
schema rather than three separate tables joined by type — every question
type shares the same lifecycle (attempted, answered, scored, fed back on),
so a single polymorphic table avoids `UNION`-ing three tables every time the
candidate UI or evaluation pipeline needs "all questions for this test."

| Column | Type | Constraints |
|---|---|---|
| `id` | `GUID()` | PK, default `uuid4()` |
| `test_id` | `GUID()` | FK → `tests.id`, `ondelete="CASCADE"`, NOT NULL |
| `question_type` | `Enum(QuestionType)` — `MCQ`\|`OPEN_ENDED`\|`CODE` | NOT NULL |
| `question_text` | `Text` | NOT NULL |
| `skill_tested` | `String(255)` | NULLABLE |
| `difficulty` | `Enum(Difficulty)` | NOT NULL |
| `marks` | `Integer` | NOT NULL, default `1` |
| `order_index` | `Integer` | NOT NULL, default `0` |
| `options` | `JSONType()` | NULLABLE — MCQ only |
| `correct_answer` | `String(10)` | NULLABLE — MCQ only |
| `explanation` | `Text` | NULLABLE — MCQ only |
| `expected_answer` | `Text` | NULLABLE — open-ended only |
| `scoring_rubric` | `Text` | NULLABLE — open-ended only |
| `code_language` | `String(50)` | NULLABLE — code only (added in `c7e2d4f8a1b3`) |
| `code_starter` | `Text` | NULLABLE — code only (added in `c7e2d4f8a1b3`) |
| `created_at` | `DateTime(timezone=True)` | NOT NULL, `server_default=now()` |
| `updated_at` | `DateTime(timezone=True)` | NOT NULL, `default=now()`, `onupdate=now()` |

**Index:** `ix_questions_test_id` on `test_id` — per the inline comment,
questions are "loaded on every attempt start and evaluation," always
filtered by `test_id`.

`options` is JSON, not a normalized `question_options` table, because each
option is a small fixed-shape object (`{label, text, is_correct}`), there are
always exactly up to 4 of them, they are never queried independently of
their parent question, and they're written once at generation time and read
as a whole array on every render — normalizing would mean a join and 4 extra
rows per MCQ question for zero query flexibility gained. The same shape
appears in the comment in `test.py`: `options: list of {label: "A"|"B"|"C"|"D",
text: str, is_correct: bool}`.

### 2.8 `test_attempts` — `TestAttempt` (`backend/app/db/models/attempt.py`)

**Purpose.** One row per candidate's attempt at one specific test, created
the moment a candidate clicks "start" on a test from their invitation link
(via `start_attempt()` in `attempt_service.py`). This is the row that owns
the exam-session state machine: `NOT_STARTED → IN_PROGRESS → SUBMITTED →
EVALUATED`, with `SUBMITTED` reachable either by explicit candidate
submission or automatically on timer expiry.

| Column | Type | Constraints |
|---|---|---|
| `id` | `GUID()` | PK, default `uuid4()` |
| `invitation_id` | `GUID()` | FK → `invitations.id`, `ondelete="CASCADE"`, NOT NULL |
| `candidate_id` | `GUID()` | FK → `candidates.id`, `ondelete="CASCADE"`, NOT NULL |
| `test_id` | `GUID()` | FK → `tests.id`, `ondelete="CASCADE"`, NOT NULL |
| `started_at` | `DateTime(timezone=True)` | NULLABLE |
| `submitted_at` | `DateTime(timezone=True)` | NULLABLE |
| `time_remaining_seconds` | `Integer` | NULLABLE |
| `status` | `Enum(AttemptStatus)` — `NOT_STARTED`\|`IN_PROGRESS`\|`SUBMITTED`\|`EVALUATED` | NOT NULL, default/`server_default` `NOT_STARTED` |
| `ip_address` | `String(45)` | NULLABLE (sized for IPv6) |
| `auto_submitted` | `Boolean` | NOT NULL, default `False` |

**Indexes:** `ix_attempts_invitation_id`, `ix_attempts_test_id`,
`ix_attempts_candidate_id` (single-column, FK lookups), plus a composite
`ix_attempts_inv_test` on `(invitation_id, test_id)` — explicitly added,
per the inline comment, because `start_attempt`'s resume-check queries
`WHERE invitation_id = ? AND test_id = ?` as an exact two-column predicate.

`time_remaining_seconds` exists *in addition to* `started_at`/`submitted_at`
rather than being computed purely from timestamp arithmetic because the exam
timer can be paused/extended by network hiccups and the candidate's own
client polls and reconciles against this server-stored value via a heartbeat
endpoint — `started_at` answers "when did the clock start," but
`time_remaining_seconds` is the authoritative, mutable countdown that the
server trusts over whatever the client claims, closing a class of "edit the
JS timer" cheating vectors. It's initialized from
`test.duration_minutes * 60` at attempt creation and decremented via the
heartbeat round-trip in `attempt_service.py`.

**Relationships.** `answers` (one-to-many → `CandidateAnswer`,
`cascade="all, delete-orphan"`), `events` (one-to-many →
`SuspiciousEvent`, `cascade="all, delete-orphan"`).

### 2.9 `candidate_answers` — `CandidateAnswer` (`backend/app/db/models/attempt.py`)

**Purpose.** One row per (attempt, question) — the candidate's actual
response, continuously overwritten as they work through the test via
autosave. This table is the write-heaviest in the schema: every keystroke
debounce and every "next question" click triggers an upsert against it.

| Column | Type | Constraints |
|---|---|---|
| `id` | `GUID()` | PK, default `uuid4()` |
| `attempt_id` | `GUID()` | FK → `test_attempts.id`, `ondelete="CASCADE"`, NOT NULL |
| `question_id` | `GUID()` | FK → `questions.id`, `ondelete="CASCADE"`, NOT NULL |
| `selected_option` | `String(10)` | NULLABLE — MCQ (`"A"`\|`"B"`\|`"C"`\|`"D"`) |
| `answer_text` | `Text` | NULLABLE — open-ended/code free text |
| `is_auto_scored` | `Boolean` | NOT NULL, default `False` |
| `auto_score` | `Integer` | NULLABLE — set post-evaluation |
| `saved_at` | `DateTime(timezone=True)` | NOT NULL, `server_default=now()` |
| `updated_at` | `DateTime(timezone=True)` | NOT NULL, `default=now()`, `onupdate=now()` |

**Indexes:** `ix_answers_attempt_id` (every autosave/resume/submit filters by
`attempt_id`); and critically, `ix_answers_attempt_question` — a **unique**
composite index on `(attempt_id, question_id)`. The inline comment in
`attempt.py` is explicit about its dual purpose: it both enforces
"one answer per (attempt, question)" *and* serves as the conflict target for
the PostgreSQL `INSERT ... ON CONFLICT` upsert used by autosave (see §4
Data Flow below) — there is no separate uniqueness constraint, the index
itself is load-bearing for both correctness and the upsert mechanism.

### 2.10 `suspicious_events` — `SuspiciousEvent` (`backend/app/db/models/attempt.py`)

**Purpose.** An append-only integrity/anti-cheating log captured client-side
during an active attempt (tab switches, copy/paste attempts, window blur,
visibility changes, right-click, devtools open) and shipped to the backend
in near-real-time. Never updated once written — each suspicious action is
its own row, and the admin results UI aggregates/counts them per attempt
rather than mutating a running tally column.

| Column | Type | Constraints |
|---|---|---|
| `id` | `GUID()` | PK, default `uuid4()` |
| `attempt_id` | `GUID()` | FK → `test_attempts.id`, `ondelete="CASCADE"`, NOT NULL |
| `event_type` | `String(50)` | NOT NULL — free-text enum-like values: `TAB_SWITCH`, `COPY_ATTEMPT`, `PASTE_ATTEMPT`, `WINDOW_BLUR`, `VISIBILITY_HIDDEN`, `CONTEXT_MENU`, `DEVTOOLS_OPEN` (per inline comment; not a DB-level enum, so new event types can be added by the frontend without a migration) |
| `occurred_at` | `DateTime(timezone=True)` | NOT NULL, `server_default=now()` |
| `event_metadata` | `JSONType()` | NULLABLE — optional structured context, e.g. `{"count": 3, "duration_ms": 4200}` |

**Index:** `ix_events_attempt_id` — both for the admin "events grouped by
attempt" view and for every `log_suspicious_event` call's own write path.

### 2.11 `evaluations` — `Evaluation` (`backend/app/db/models/evaluation.py`)

**Purpose.** The aggregate, AI-generated scoring result for one
`TestAttempt` — this is what populates the admin results dashboard: total
score, per-category breakdown, AI hire/no-hire recommendation, and narrative
strengths/weaknesses. There is at most one `Evaluation` per attempt
(`attempt_id` is `unique=True`); re-running evaluation is a row
replace/delete-and-recreate operation, not an append.

| Column | Type | Constraints |
|---|---|---|
| `id` | `GUID()` | PK, default `uuid4()` |
| `attempt_id` | `GUID()` | FK → `test_attempts.id`, `ondelete="CASCADE"`, **UNIQUE**, NOT NULL |
| `total_score` | `Integer` | NOT NULL, default `0` |
| `max_score` | `Integer` | NOT NULL, default `0` |
| `percentage` | `Float` | NOT NULL, default `0.0` |
| `mcq_score` | `Integer` | NOT NULL, default `0` |
| `mcq_max` | `Integer` | NOT NULL, default `0` |
| `open_ended_score` | `Integer` | NOT NULL, default `0` |
| `open_ended_max` | `Integer` | NOT NULL, default `0` |
| `ai_strengths` | `JSONType()` | NOT NULL, default `list` |
| `ai_weaknesses` | `JSONType()` | NOT NULL, default `list` |
| `ai_recommendation` | `Enum(AIRecommendation)` — `STRONG_HIRE`\|`HIRE`\|`MAYBE`\|`NO_HIRE` | NOT NULL |
| `ai_summary` | `Text` | NOT NULL, default `""` |
| `admin_override_recommendation` | `Enum(AIRecommendation)` | NULLABLE |
| `admin_notes` | `Text` | NULLABLE |
| `evaluation_level` | `Enum(EvaluationLevel)` — `BEGINNER`\|`INTERMEDIATE`\|`ADVANCED`\|`EXPERT` | NULLABLE (added in `c7e2d4f8a1b3`) |
| `improvement_suggestions` | `JSONType()` | NOT NULL, default `list` (added in `c7e2d4f8a1b3`) |
| `suitable_role` | `Text` | NULLABLE (added in `c7e2d4f8a1b3`) |
| `skill_breakdown` | `JSONType()` | NOT NULL, default `dict` — skill name → percentage (added in `c7e2d4f8a1b3`) |
| `embedding` | `VectorType(768)` | NULLABLE (added in `db7cdbbfd2a8`) |
| `is_preliminary` | `Boolean` | NOT NULL, default `True` |
| `evaluated_at` | `DateTime(timezone=True)` | NOT NULL, `server_default=now()` |

No `__table_args__`/explicit indexes beyond the implicit unique index on
`attempt_id` and the HNSW vector index described below.

**`is_preliminary` is always `True`.** Per the module docstring in
`evaluation.py`: *"Evaluation.is_preliminary = True ALWAYS — this is an AI
first-pass only."* There is no code path in the codebase that ever sets it
to `False`. The column exists as a forward-compatible signal to the frontend
and any future "admin certifies final score" workflow that nothing in this
table should be treated as a final, human-confirmed hiring decision — the AI
recommendation is a first pass that a human (via `admin_override_recommendation`
and `admin_notes`) is expected to review and potentially override, but the
schema currently has no mechanism to flip a row from preliminary to final.
It is effectively a placeholder/contract for a feature that doesn't exist
yet, kept `True` so existing UI logic that checks the flag degrades safely.

**`embedding` — the pgvector column.** `VectorType(768)` (defined in
`_types.py`, see §3) renders as PostgreSQL's native `vector(768)` column type
via the `pgvector` SQLAlchemy integration, but only on the PostgreSQL
dialect — on SQLite it silently falls back to a JSON-encoded float array
(read/write works in tests, similarity search does not, since the `<->`/`<=>`
operators are pgvector-specific). 768 is `nomic-embed-text`'s output
dimensionality (the embedding model used by `embedding_service.py`, called
through Ollama). The column is **opt-in**: it stays `NULL` unless the
`EMBEDDING_ENABLED` setting is `true` *and* `generate_embedding()` succeeds;
`generate_embedding()` is designed to never raise, so evaluation persistence
is never blocked by embedding failures — a JD that never ran with embeddings
enabled simply has `embedding = NULL` on all of its evaluations forever,
unless those attempts are re-evaluated later. It backs
`GET /evaluation/{id}/similar`, which ranks "candidates who answered similarly
to this one" using pgvector's `<=>` cosine-distance operator
(`1 - (e.embedding <=> CAST(:emb AS vector)) AS similarity` in
`evaluation_service.find_similar_evaluations`), filtering out rows where
`embedding IS NULL`.

**Relationships.** `question_feedback` — one-to-many, `cascade="all,
delete-orphan"`.

### 2.12 `question_feedback` — `QuestionFeedback` (`backend/app/db/models/evaluation.py`)

**Purpose.** The per-question drill-down behind one `Evaluation` —
one row per evaluated `CandidateAnswer`. Where `Evaluation` is what the admin
sees first (the dashboard summary), `QuestionFeedback` is the optional
detail view: which specific questions scored well/poorly, what the AI's
free-text feedback was, and (for open-ended/code answers) which rubric
criteria were matched or missed.

| Column | Type | Constraints |
|---|---|---|
| `id` | `GUID()` | PK, default `uuid4()` |
| `evaluation_id` | `GUID()` | FK → `evaluations.id`, `ondelete="CASCADE"`, NOT NULL |
| `question_id` | `GUID()` | FK → `questions.id`, `ondelete="CASCADE"`, NOT NULL |
| `attempt_id` | `GUID()` | FK → `test_attempts.id`, `ondelete="CASCADE"`, NOT NULL |
| `question_type` | `String(20)` | NOT NULL — denormalized copy of the question's type at evaluation time |
| `awarded_score` | `Integer` | NOT NULL, default `0` |
| `max_score` | `Integer` | NOT NULL, default `0` |
| `is_correct` | `Boolean` | NULLABLE — only meaningful/set for MCQ |
| `ai_feedback` | `Text` | NULLABLE — open-ended/code only |
| `matched_criteria` | `JSONType()` | NOT NULL, default `list` |
| `missed_criteria` | `JSONType()` | NOT NULL, default `list` |
| `admin_awarded_score` | `Integer` | NULLABLE (added in `f3a9c1d2e4b5` — lets an admin manually override the AI's per-question score without destroying the original `awarded_score`) |

**Indexes:** `ix_qfeedback_evaluation_id` (bulk-loaded when rendering the
results detail page) and `ix_qfeedback_attempt_id` — the latter exists
specifically, per the inline comment, "for re-evaluation lookup (delete old
feedback by attempt)": when an attempt is re-evaluated, old feedback rows are
deleted by `attempt_id` directly rather than via a join through
`evaluation_id`, because the old `Evaluation` row itself may already be
slated for replacement in the same transaction.

`attempt_id` is technically a denormalized FK here — it's derivable by
joining `evaluation_id → evaluations.attempt_id` — but it's stored directly
specifically to support that attempt-scoped bulk-delete during re-evaluation
without a join, at the cost of needing both FKs to stay consistent (both
point at rows that, by construction, always belong to the same attempt).

### 2.13 `public_assessment_links` — `PublicAssessmentLink` (`backend/app/db/models/public_link.py`)

**Purpose.** A shareable, unauthenticated registration link for one JD's
approved tests — the entry point for the "post one link on a job board"
flow, as opposed to the admin inviting candidates one at a time or via CSV.
A `PublicAssessmentLink` identifies the **assessment only**; it never
identifies or authenticates a specific candidate. Each candidate who
registers through it gets their own `Invitation` row (see `public_link_id`
on `invitations` above) with its own independently-hashed magic-link token —
the public link's `public_slug` is never reused as a candidate's private
token.

| Column | Type | Constraints |
|---|---|---|
| `id` | `GUID()` | PK, default `uuid4()` |
| `jd_id` | `GUID()` | FK → `job_descriptions.id`, `ondelete="CASCADE"`, NOT NULL |
| `public_slug` | `String(43)` | NOT NULL, **UNIQUE** |
| `title` | `String(255)` | NULLABLE — optional admin-facing label |
| `status` | `Enum(PublicLinkStatus)` — `ACTIVE`\|`DISABLED`\|`EXPIRED` | NOT NULL, default/`server_default` `ACTIVE` |
| `expires_at` | `DateTime(timezone=True)` | NULLABLE — no expiry unless explicitly set |
| `max_registrations` | `Integer` | NULLABLE — no cap unless explicitly set |
| `view_count` | `Integer` | NOT NULL, default `0` — top of the funnel; every resolved page load that finds the link |
| `registration_count` | `Integer` | NOT NULL, default `0` |
| `created_by` | `GUID()` | FK → `users.id`, NULLABLE, no `ondelete` |
| `created_at` | `DateTime(timezone=True)` | NOT NULL, `server_default=now()` |
| `updated_at` | `DateTime(timezone=True)` | NOT NULL, `default=now()`, `onupdate=now()` |

`public_slug` deliberately stores the raw value rather than a hash. Unlike
`Invitation.token_hash`, the slug is not a secret — it's meant to be posted
publicly (job boards, careers pages) and only ever resolves to assessment
metadata (JD title, list of approved test titles/durations), never to a
candidate's identity or attempt data. `public_link_service.resolve_public_link()`
and `register_via_public_link()` both look it up directly via
`select(PublicAssessmentLink).where(PublicAssessmentLink.public_slug == slug)`.

**Indexes:** `ix_public_links_jd_id` on `jd_id` — supports "list all public
links ever created for this JD" on the admin Candidates page. `public_slug`'s
`unique=True` gives PostgreSQL an implicit unique index, which is the lookup
path for every `/apply/<slug>` page load and registration submit.

**`registration_count` concurrency.** This column is never updated via a
read-then-write Python increment. `public_link_service._try_increment_registration()`
issues a single conditional `UPDATE ... SET registration_count =
registration_count + 1 WHERE id = :id AND (max_registrations IS NULL OR
registration_count < max_registrations)` and checks `rowcount` — so a burst
of concurrent registrations against a link with a `max_registrations` cap
cannot all squeeze past the limit the way a SELECT-then-INSERT check could
under a race. A candidate reusing an existing usable invitation (same email,
still `PENDING`/`OPENED`) does **not** increment this counter — only a
brand-new `Invitation` row counts as a registration.

**`view_count`** is incremented unconditionally (no cap to check) by
`resolve_public_link()` only — never by `register_via_public_link()`, even
though both share the same `_load_link_with_approved_tests()` loader, so a
registration submit doesn't double-count the view the candidate already
generated by loading the page first. It's incremented even when the link
turns out disabled/expired/full, since the candidate still reached the page;
`GET /api/v1/public-links/{id}/analytics` (`public_link_service.get_link_analytics()`)
reads it straight off this column alongside a live join through
`invitations.public_link_id` / `test_attempts` / `evaluations` for the
starts/completions/pass-rate stages of the funnel — those are computed on
read, not maintained as counters.

**Relationships.** No ORM-level `relationship()` is declared to `Invitation`
on this side (the link only needs to be looked up by slug, never joined from
its invitations in the current code), but the FK exists at the database
level via `invitations.public_link_id`.

**Cascade behavior.** Deleting a `JobDescription` cascades to delete its
`PublicAssessmentLink` rows (`ondelete="CASCADE"`). Deleting a `User` does
**not** cascade to `public_assessment_links.created_by` — same no-`ondelete`
pattern as `invitations.invited_by` above. Deleting a `PublicAssessmentLink`
itself does **not** delete the invitations it produced (see the
`invitations` section above) — only `SET NULL`s their `public_link_id`.

---

## 3. Custom Cross-Dialect Column Types (`backend/app/db/models/_types.py`)

Three `TypeDecorator` subclasses let every model file be written once and
run unmodified against both PostgreSQL (production/Docker) and SQLite
(the in-memory database backing all 213 backend tests). Each picks a
different concrete implementation per dialect via `load_dialect_impl`:

**`GUID`** — `impl = String(36)`. On PostgreSQL it loads the dialect's
native `UUID` type descriptor; the implementation comment notes the same
column also needs to interoperate with rows created by Prisma elsewhere in
the stack (the frontend's `prisma/seed.ts` creates the admin user), and
"Prisma creates ID columns as TEXT, not native UUID" — hence
`load_dialect_impl` actually returns a generic `String()` type descriptor
rather than PostgreSQL's `UUID` type, deliberately keeping IDs as
text-compatible values across both ORMs rather than fighting a type
mismatch between SQLAlchemy and Prisma's own ID generation. On SQLite it
stores as `CHAR(36)` hyphenated strings. `process_bind_param`/
`process_result_value` both coerce to/from `str()`, so application code
always sees plain Python strings regardless of dialect.

**`JSONType`** — `impl = JSON`. On PostgreSQL it loads `JSONB` (binary,
indexable, supports containment/operator queries) instead of plain `JSON`;
on every other dialect (SQLite) it falls back to standard `JSON`. This is
the type behind every `JSONType()` column described above
(`must_have_skills`, `options`, `ai_strengths`, `event_metadata`, etc.) —
production gets PostgreSQL's faster binary JSON storage, tests get SQLite's
plain-text JSON without requiring a different model definition.

**`VectorType(dim)`** — `impl = JSON`, parameterized by embedding
dimensionality. On PostgreSQL (with the `pgvector` extension installed) it
loads `pgvector.sqlalchemy.Vector(dim)`, the real native `vector(dim)` type
that supports HNSW indexing and distance operators. On any other dialect it
falls back to plain `JSON`, storing the embedding as a JSON-encoded list of
floats — reads and writes work identically in tests, but the actual
similarity search code (raw SQL using the `<=>` operator) is only ever
issued against PostgreSQL, so this fallback exists purely so the ORM layer
and model definitions don't need dialect-specific branches; SQLite tests
simply never exercise the similarity-search code path.

All three share `cache_ok = True`, signaling to SQLAlchemy that their bind/
result processing is deterministic and safe to cache in compiled-statement
caches.

---

## 4. The `calculate_evaluation_scores` PL/pgSQL Function

Introduced in Alembic migration `d9e8f7a6b5c4` (`backend/alembic/versions/
d9e8f7a6b5c4_add_calculate_evaluation_scores_function.py`), this is the only
piece of database-resident logic in the schema — everything else is plain
DDL. Signature:

```sql
calculate_evaluation_scores(p_attempt_id UUID)
  RETURNS TABLE (
    total_questions     INT,
    mcq_count            INT,
    open_ended_count     INT,
    code_count           INT,
    mcq_awarded          NUMERIC,
    mcq_max              NUMERIC,
    open_ended_awarded   NUMERIC,
    open_ended_max       NUMERIC,
    total_awarded        NUMERIC,
    total_max             NUMERIC,
    percentage            NUMERIC,
    passing_marks         INT,
    passed                BOOLEAN
  )
```

It re-aggregates scores directly from `question_feedback` rows for a given
`attempt_id`, rather than trusting whatever totals are cached on
`evaluations`. Logic, read straight from the migration body:

1. Looks up `passing_marks` from `tests` by joining
   `test_attempts.test_id = tests.id` for the given attempt. If the test
   has no configured threshold, `passing_marks` (and therefore `passed`) is
   `NULL` — pass/fail is explicitly "not applicable," never coerced to
   `FALSE`.
2. Counts questions per type using `COUNT(*) FILTER (WHERE question_type =
   ...)` against `MCQ`, `OPEN_ENDED`, `CODE`.
3. Sums `awarded_score`/`max_score` separately for `MCQ` vs. the combined
   `OPEN_ENDED`+`CODE` bucket (open-ended and code questions are graded with
   the same AI-rubric machinery, so they're aggregated together).
4. Computes `percentage` as `ROUND(awarded / max * 100, 1)`, explicitly
   guarding the zero-max-score case to return `0` instead of dividing by
   zero (`COALESCE(SUM(max_score), 0) = 0 THEN 0`).
5. Computes `passed` as `total_awarded >= v_passing_marks`, but only when
   `v_passing_marks IS NOT NULL` and `total_max > 0`; otherwise `NULL` or
   `FALSE` respectively, per the `CASE` ladder in the function body.

Per the migration docstring, this exists for three forward-looking purposes:
score verification (confirming the cached totals on `evaluations` actually
match the underlying `question_feedback` rows), recomputing pass/fail after
an admin changes `tests.passing_marks` retroactively, and future admin
override flows that adjust individual question scores and need the
aggregate recalculated without re-running the whole AI evaluation pipeline.
The function is idempotent and read-only (`SELECT`-only body) — it does not
write back to `evaluations`; any caller wanting to persist a recalculated
total must do that itself.

`downgrade()` simply does `DROP FUNCTION IF EXISTS
calculate_evaluation_scores(UUID);`.

---

## 5. Data Flow — Core Entity Chain

This walks the lifecycle of one job description from upload through final
candidate evaluation, with the relevant tables, FK writes, and cascade
behavior at each step.

**1. JD created.** Admin uploads a PDF/DOCX → one `job_descriptions` row is
inserted with `parse_status=PENDING`, `generation_status=IDLE`,
`uploaded_by` set to the admin's `users.id`. A background parser
(`parser_service.py`) extracts text into `raw_text` and flips `parse_status`
to `PROCESSING` → `DONE` (or `FAILED`).

**2. `JdExtractedData` created (1:1).** Once parsing succeeds,
`generation_status` moves to `EXTRACTING` and `skill_extraction_service.py`
runs an LLM pass over `raw_text`, inserting exactly one `jd_extracted_data`
row (`jd_id` unique-constrained, enforced at the DB level — a second
extraction for the same JD must `UPDATE`/replace the existing row, not
`INSERT` a second one). `generation_status` then moves to `GENERATING` or
back to `IDLE`/`READY` depending on whether test generation is triggered
immediately.

**3. `Test` + `Question` rows created (generation).**
`test_generation_service.py` uses the extracted skills/topics to generate
one or more `tests` rows (`status=DRAFT` initially) each with a batch of
`questions` rows (`order_index` assigned sequentially, `test_id` FK set).
An admin reviews and flips `tests.status` to `APPROVED` before candidates can
attempt it — `start_attempt()` explicitly filters
`WHERE jd_id = ? AND status = 'APPROVED'` (the reason the composite index
`ix_tests_jd_id_status` exists).

**4. `Invitation` created.** Admin invites a candidate to the JD:
`invitation_service.py` looks up or creates a `candidates` row by email,
then inserts an `invitations` row with `candidate_id`, `jd_id`,
`invited_by`, a freshly generated `token_hash` (the raw token is emailed and
never stored), `expires_at`, `status=PENDING`. Per a noted prior change, the
service's `create_invitation` can also accept an optional `test_id`
parameter, scoping which test(s) the invitation targets.

**5. `TestAttempt` created.** The candidate opens their emailed link;
`start_attempt()` in `attempt_service.py` validates the token against
`token_hash`, flips `invitations.status` from `PENDING` to `OPENED`, loads
the JD's `APPROVED` tests, and either resumes an existing `IN_PROGRESS`
`test_attempts` row for `(invitation_id, test_id)` or inserts a new one with
`status=IN_PROGRESS`, `started_at=now()`, and
`time_remaining_seconds = test.duration_minutes * 60`. If every approved
test for the JD already has a `SUBMITTED`/`EVALUATED` attempt under this
invitation, `invitations.status` is instead set to `COMPLETED` and the
request is rejected with `409 already_submitted`.

**6. `CandidateAnswer` rows upserted.** As the candidate answers questions,
the frontend autosaves via `save_answer`/`bulk_save_answers`. Both paths
build a PostgreSQL-specific `INSERT ... ON CONFLICT (attempt_id,
question_id) DO UPDATE SET ...` statement (via `sqlalchemy.dialects.postgresql.insert`,
aliased `pg_insert` in `attempt_service.py`) targeting the unique index
`ix_answers_attempt_question`. This is a single atomic round-trip per
save — there is no separate SELECT-then-INSERT-or-UPDATE branch in the
current code; the conflict clause overwrites `selected_option`,
`answer_text`, `saved_at`, `updated_at` from the new values
(`stmt.excluded.<col>`), leaving `is_auto_scored`/`auto_score` untouched on
update (they're only meaningful post-evaluation). `bulk_save_answers`
batches every answer in the request into one multi-row `VALUES` list inside
a single `INSERT`, rather than one statement per answer, specifically to
avoid N round-trips.

When the candidate submits (or the timer expires and the heartbeat endpoint
auto-submits), `submit_attempt()` flips `test_attempts.status` to
`SUBMITTED`, sets `submitted_at`, and — if triggered by expiry —
`auto_submitted=True`. Throughout the attempt, client-detected integrity
violations are appended as `suspicious_events` rows (never updated, only
inserted).

**7. `Evaluation` + `QuestionFeedback` created.** `evaluation_service.py`'s
`evaluate_attempt()` loads the attempt's `candidate_answers` joined against
their `questions`, auto-scores MCQs deterministically, and sends open-ended/
code answers to an LLM for rubric-based scoring. `_persist_evaluation`
inserts one `evaluations` row (`attempt_id` unique — re-evaluating an
already-evaluated attempt must replace this row, not append a second one)
with the aggregated scores, AI recommendation, narrative summary,
`is_preliminary=True` (always), and — if `EMBEDDING_ENABLED` and the Ollama
embedding model call succeeds — a 768-dim `embedding` vector built from the
evaluation's text fields. It then inserts one `question_feedback` row per
evaluated `CandidateAnswer`, each carrying its own `evaluation_id`,
`question_id`, and (denormalized) `attempt_id`. Finally `test_attempts.status`
moves to `EVALUATED`.

**Cascade-delete summary.** Every FK in this chain below `job_descriptions`
is `ondelete="CASCADE"` with no exceptions (`jd_extracted_data`, `tests`,
`questions`, `invitations`, `test_attempts`, `candidate_answers`,
`suspicious_events`, `evaluations`, `question_feedback`). Deleting a
`JobDescription` therefore deletes its extracted data, every test and
question generated from it, every invitation ever sent against it, and —
transitively, through those invitations' attempts — every answer,
suspicious-event log, evaluation, and per-question feedback row tied to any
candidate who ever took one of its tests. The only FK in the entire schema
without `ondelete="CASCADE"` is the pair pointing at `users.id`
(`job_descriptions.uploaded_by`, `invitations.invited_by`) — deleting an
admin account is deliberately *not* wired to cascade-delete the JDs or
invitations they created, since that data needs to outlive the staff member
who happened to create it.
