# Testing Documentation

> Audience: QA engineers, developers, and future maintainers who need to
> assess how much of Talvyn is actually verified by automated tests before
> shipping changes or signing off on a release.
>
> All counts below are sourced from `docs/enterprise/_facts.md` §6/§7
> (verified directly against the repository on 2026-06-18) and from direct
> reads of `backend/tests/conftest.py`, all 11 backend test files, the 7
> router files under `backend/app/api/v1/`, and `.github/workflows/ci.yml`.
> Where this document and `_facts.md` disagree, `_facts.md` is correct.

---

## Summary

Talvyn has **213 backend tests across 11 files**, all running against an
in-memory SQLite database with file I/O and background-task execution
mocked. There are **zero frontend tests** (no Jest, Vitest, Playwright, or
Cypress configuration anywhere under `frontend/`) and **zero end-to-end
tests**. CI runs the backend suite plus frontend lint/type-check/build, but
does not execute any frontend tests (because none exist), does not run
against a real Postgres database, and has no deployment, migration, or
security-scanning stage.

The backend suite is strong on unit-level correctness (validation schemas,
security primitives, parser edge cases, AI response-parsing/retry logic) and
on the request/response shape of the most-used endpoints (JD upload,
attempts, test generation). It is noticeably thinner on full HTTP-level
coverage of administrative/reporting endpoints (`stats.py` has no test
coverage at all; several `evaluation.py` and `invitations.py` sub-routes are
untested). These gaps are detailed in the coverage matrix below.

---

## Unit & Integration Tests (Backend)

### Test infrastructure (`backend/tests/conftest.py`)

The fixture setup is a single shared `conftest.py` used by all 11 test
files:

- **In-memory SQLite, not Postgres.** A module-level async engine is created
  against `sqlite+aiosqlite:///:memory:` with `StaticPool` (so all
  connections share the same in-memory database rather than each getting a
  separate, empty one). Required env vars (`DATABASE_URL`,
  `INTERNAL_API_SECRET`, `MAGIC_LINK_SECRET`, `UPLOAD_DIR`,
  `OLLAMA_BASE_URL`, `APP_ENV`) are set via `os.environ.setdefault(...)`
  before any `app.*` module is imported, since several modules read config
  at import time.
- **`create_tables` fixture** (session-scoped, `autouse=True`) runs
  `Base.metadata.create_all` once before the session and `drop_all` after —
  this is what makes the SQLite schema mirror the SQLAlchemy models (it does
  **not** run Alembic migrations, so migration-specific SQL such as the
  PL/pgSQL `calculate_evaluation_scores` function or the pgvector
  `embedding` column/HNSW index from migration `db7cdbbfd2a8` is not present
  or exercised in tests at all).
- **`db_session` fixture** gives each test a fresh `AsyncSession` bound to a
  connection wrapped in a transaction that is rolled back after the test, so
  tests don't leak state into each other.
- **`client` fixture** wires an `httpx.AsyncClient` (via `ASGITransport`) to
  the real FastAPI app, with three things patched in for the duration of the
  test:
  1. The `get_db` dependency is overridden to yield the test's `db_session`.
  2. `file_service.save_jd_file` / `file_service.delete_file` are
     monkey-patched to fake functions that return a synthetic path / `True`
     without touching disk — **no real file I/O happens in tests**.
  3. `app.services.jd_service.parse_jd_background` is patched to an
     `AsyncMock()` so the background JD-parsing task never actually runs
     (the comment in the fixture explains why: it would otherwise open its
     own DB connection outside the test's transaction and operate on
     committed-vs-uncommitted state inconsistently).
  The client also pre-sets the `X-Internal-Token` header to the test secret,
  so any test using `client` is implicitly authenticated as
  `VerifiedInternal` traffic unless it deliberately drops the header.
- **Sample file fixtures** — `sample_pdf_bytes` returns a minimal but
  structurally valid PDF (real `%PDF` magic bytes, parseable by PyMuPDF) and
  `sample_docx_bytes` builds a real minimal `.docx` via `python-docx` (with a
  fallback to a fake ZIP magic-byte stub if `python-docx` isn't installed).
  A module-level `_make_valid_pdf()` helper duplicates the PDF bytes for
  tests that need the raw bytes without the fixture.

Net effect: tests run fully offline (no Postgres, no Ollama, no disk, no
background workers, no real network) and fast, but anything that depends on
Postgres-specific behavior (pgvector similarity search, the
`calculate_evaluation_scores` SQL function, real ARQ/Redis task execution) is
outside what this suite can ever catch.

### Per-file coverage (213 tests, 11 files)

| File | ~Tests | What it covers |
|---|---|---|
| `test_attempts.py` | 22 | Candidate attempt lifecycle: `TestStartAttempt` (valid/invalid/expired token, resume returns same attempt, 409 after submit, multi-test-link sequencing, a "stale completed invitation gets repaired" edge case), `TestSaveAnswer` (MCQ/open-ended saving, requires-token-header, answers persist across resume), `TestSubmitAttempt` (200, idempotent re-submit, auto-submit flag), `TestQuestionOwnership` (rejects answers/bulk-save/submit referencing a question from a *different test*, or an unknown question id), `TestSuspiciousEvents` (tab-switch logging, 422 on invalid event type). |
| `test_evaluation.py` | 28 | `TestScoreMCQs`/`TestScaleScore` (pure scoring functions — full/zero/partial marks, case-insensitive matching, rounding), `TestOpenEndedEvalAI`/`TestAggregateEvalAI` (Pydantic validation of the AI's evaluation response — score bounds, feedback-length minimums, recommendation enum, "strong hire requires a stated strength" rule), `TestEvaluationPipeline` (full async pipeline: creates `Evaluation`/`QuestionFeedback` rows, marks results preliminary, re-evaluation replaces prior result), `TestEvaluationAPI` (HTTP: trigger returns 201, 409 on non-submitted attempt, 404 on unknown attempt, PATCH override saves admin recommendation). |
| `test_health.py` | 6 | `GET /health` (200 + shape), root service-info response, unknown route returns 404, `TestHealthReady` for `GET /health/ready` (DB-connectivity probe). |
| `test_invitations.py` | 12 | `TestTokenRoundTrip` (hashed token stored, raw token never persisted), `TestCreateInvitation` (creates candidate+invitation, rejects duplicate active invitation, unknown JD, invalid email, JD with no approved tests), `TestMarkOpened` (validate with correct/wrong/expired token, marks `OPENED`), `TestListInvitations` (200, requires auth). |
| `test_jd_upload.py` | 23 | `TestJdUpload` (PDF/DOCX upload return 201, rejects wrong extension *and* wrong magic bytes — true content-sniffing, rejects oversized file, 422 on missing file, requires internal token), `TestJdList` (shape, pagination, 422 on bad page param), `TestJdGet` (raw text excluded by default, 404 unknown), `TestJdStatus`, `TestJdDelete` (204, removed from list, 404 unknown). |
| `test_ollama_service.py` | 19 | `TestExtractJsonFromText`/`TestParseJsonResponse` (pulling JSON from plain text, fenced code blocks, BOM-stripped/preamble text, rejecting non-object JSON and empty strings), `TestOllamaClientGenerate` (mocks `httpx.AsyncClient`: successful generate, `ConnectError` → `AIServiceError`, model-not-found, **retry succeeds on second attempt after a first failure**, `ping()` true/false). |
| `test_parser.py` | 15 | `TestCleanText` (blank-line/whitespace collapsing, null-byte removal, newline preservation, empty input), `TestPdfExtraction`/`TestDocxExtraction` (valid sample fixtures extract correctly, garbage/empty bytes raise a parse error), `TestExtractText` (dispatch by file type, unsupported type raises, empty extraction result raises). |
| `test_security.py` | 23 | Pure unit tests of the token/crypto primitives behind candidate magic links: `TestGenerateToken` (43-char URL-safe, unique, no unsafe chars), `TestHashToken` (64 hex chars, deterministic), `TestVerifyToken` (correct/wrong/tampered/empty token, constant-time compare), `TestIsExpired`/`TestMakeExpiry` (future/past/naive datetimes, 72h default, custom hours), `TestBuildMagicLink` (contains token/path, no double slash). **Tests the crypto building blocks only — does not exercise the attempt-token ownership guard itself; see Risk Areas.** |
| `test_skill_extraction.py` | 25 | Pydantic validation (`TestDifficultyDistribution` — must sum to 100, rejects under/over/all-zero; `TestSkillExtractionResult` — coerces nested dicts, rejects missing job title/difficulty) and `TestTryValidate` (invalid JSON/schema-mismatch return structured errors, not exceptions). `TestExtractSkillsFromJdText` mocks `ollama_client.generate` to test the **AI self-correction loop**: first-try success, success after one correction round, `AIResponseParseError` after all corrections exhausted, Ollama-unavailable propagation, rejecting empty input, truncating very long input. |
| `test_test_generation.py` | 27 | Validation mirroring the question/test schemas (`TestMCQQuestionAI` — exactly one correct option among ≥4, answer-text must match marked option; `TestOpenEndedQuestionAI` — minimum rubric length, marks capped at 20; `TestGeneratedTestAI` — auto-corrects mismatched total-marks, rejects too few questions/invalid difficulty) and the same `TestTryValidate` pattern. `TestGenerateTestsIntegration` runs the real pipeline against the in-memory DB (generates/saves 3 tests with questions, regeneration deletes old tests first, **a partial-failure case asserting nothing partial is persisted**); `TestGenerateTestsBackgroundCancellation` checks a mid-flight-cancelled job discards its results. |
| `test_tests_api.py` | 13 | HTTP-level tests for the `tests` router: `TestGenerateEndpoint` (409 with no extracted data, 404 unknown JD, creates 3 tests), `TestListTests`, `TestGetTest` (404, requires auth), `TestUpdateTest` (404, 422 on short title), `TestApproveTest` (404, 422 on invalid status), `TestUpdateQuestion` (404, 422 on invalid MCQ options). |

### Coverage matrix — 48 endpoints across 7 routers

Endpoint paths were cross-referenced against literal path strings used in
each test file (`grep` for each route's distinguishing path segment, e.g.
`/cancel/`, `/bulk`, `/regenerate`, `/stats`). A route is marked **tested**
only if a test file actually issues an HTTP request to it via the `client`
fixture; pure unit tests of underlying service functions (e.g. the
evaluation-pipeline tests in `test_evaluation.py` that call
`evaluate_attempt()` directly) are noted separately since they cover the
business logic but not the route/auth/serialization layer.

| Router | Endpoint | HTTP tested? | Test file |
|---|---|---|---|
| `health.py` | `GET /health` | Yes | `test_health.py` |
| `health.py` | `GET /health/ready` | Yes | `test_health.py` (`TestHealthReady`) |
| `jd.py` | `POST /jd/upload` | Yes | `test_jd_upload.py` |
| `jd.py` | `GET /jd/` | Yes | `test_jd_upload.py` |
| `jd.py` | `GET /jd/{jd_id}` | Yes | `test_jd_upload.py` |
| `jd.py` | `GET /jd/{jd_id}/status` | Yes | `test_jd_upload.py` |
| `jd.py` | `DELETE /jd/{jd_id}` | Yes | `test_jd_upload.py` |
| `jd.py` | `POST /jd/{jd_id}/analyze` | **No** | — not referenced by any test file |
| `tests.py` | `POST /tests/generate/{jd_id}` | Yes | `test_tests_api.py` |
| `tests.py` | `POST /tests/cancel/{jd_id}` | Partial | only via service-level cancellation test in `test_test_generation.py` (`TestGenerateTestsBackgroundCancellation`), not a direct HTTP call |
| `tests.py` | `GET /tests/jd/{jd_id}` | Yes | `test_tests_api.py` (`TestListTests`) |
| `tests.py` | `GET /tests/progress/{jd_id}` | **No** | — |
| `tests.py` | `GET /tests/progress/{jd_id}/stream` | **No** | — (SSE endpoint) |
| `tests.py` | `GET /tests/{test_id}` | Yes | `test_tests_api.py` (`TestGetTest`) |
| `tests.py` | `PATCH /tests/{test_id}` | Yes | `test_tests_api.py` (`TestUpdateTest`) |
| `tests.py` | `POST /tests/{test_id}/status` | Yes | `test_tests_api.py` (`TestApproveTest`) |
| `tests.py` | `POST /tests/{test_id}/regenerate` | **No** | — |
| `tests.py` | `DELETE /tests/{test_id}` | **No** | — |
| `tests.py` | `PATCH /tests/questions/{question_id}` | Yes | `test_tests_api.py` (`TestUpdateQuestion`) |
| `tests.py` | `DELETE /tests/questions/{question_id}` | **No** | — |
| `invitations.py` | `POST /invitations/` | Yes | `test_invitations.py` (`TestCreateInvitation`) |
| `invitations.py` | `GET /invitations/jd/{jd_id}` | **No** | — |
| `invitations.py` | `GET /invitations/validate/{token}` | Yes | `test_invitations.py` (`TestMarkOpened`) |
| `invitations.py` | `POST /invitations/bulk` | **No** | — |
| `invitations.py` | `GET /invitations/{invitation_id}` | **No** | — |
| `invitations.py` | `POST /invitations/{invitation_id}/resend` | **No** | — |
| `invitations.py` | `POST /invitations/{invitation_id}/revoke` | **No** | — |
| `attempts.py` | `POST /attempts/start` | Yes | `test_attempts.py` |
| `attempts.py` | `GET /attempts/{attempt_id}/state` | **No** (not called directly by path string in tests) | — |
| `attempts.py` | `POST /attempts/{attempt_id}/answer` | Yes | `test_attempts.py` (`TestSaveAnswer`) |
| `attempts.py` | `POST /attempts/{attempt_id}/bulk-save` | Yes | `test_attempts.py` (`TestQuestionOwnership`) |
| `attempts.py` | `POST /attempts/{attempt_id}/heartbeat` | **No** | — |
| `attempts.py` | `POST /attempts/{attempt_id}/submit` | Yes | `test_attempts.py` (`TestSubmitAttempt`) |
| `attempts.py` | `POST /attempts/{attempt_id}/event` | Yes | `test_attempts.py` (`TestSuspiciousEvents`) |
| `evaluation.py` | `GET /evaluation/` | **No** | — |
| `evaluation.py` | `POST /evaluation/trigger` | Yes | `test_evaluation.py` (`TestEvaluationAPI`) |
| `evaluation.py` | `GET /evaluation/leaderboard` | **No** | — |
| `evaluation.py` | `GET /evaluation/leaderboard/{jd_id}` | **No** | — |
| `evaluation.py` | `GET /evaluation/system-report/{jd_id}` | **No** | — |
| `evaluation.py` | `GET /evaluation/{attempt_id}` | Yes | `test_evaluation.py` (404 case only) |
| `evaluation.py` | `GET /evaluation/{attempt_id}/summary` | **No** | — |
| `evaluation.py` | `PATCH /evaluation/{attempt_id}/override` | Yes | `test_evaluation.py` |
| `evaluation.py` | `PATCH /evaluation/{attempt_id}/question-score` | **No** | — |
| `evaluation.py` | `GET /evaluation/{attempt_id}/verify-scores` | **No** | — |
| `evaluation.py` | `GET /evaluation/{attempt_id}/similar` | **No** | — (pgvector-backed; also untestable against SQLite) |
| `evaluation.py` | `GET /evaluation/{attempt_id}/export` | **No** | — |
| `stats.py` | `GET /stats/` | **No** | — |
| `stats.py` | `GET /stats/completions` | **No** | — |

**Tally: roughly 19 of 48 endpoints have a direct HTTP-level test, 1 has
partial (service-level only) coverage, and 28 have none.** The untested set
skews heavily toward admin-reporting/dashboard endpoints (all of
`stats.py`, most of `evaluation.py`'s read endpoints, invitation
resend/revoke/list-by-id) and toward routes that are inherently hard to
exercise against in-memory SQLite (the SSE progress stream, the
pgvector-backed `/similar` endpoint). The core candidate-facing flow
(start → answer → submit) and the JD-upload flow are the best-covered
paths in the system. This matrix should be treated as a worklist, not a
verdict — business-logic correctness for several of these untested routes
is still partially exercised indirectly through service-level tests (e.g.
the evaluation pipeline tests call `evaluate_attempt()` directly), but the
route layer itself — auth enforcement, serialization, status codes — is
unverified for the endpoints marked "No" above.

---

## E2E Tests

**None exist.** There is no Playwright, Cypress, or any other end-to-end
test suite anywhere in the repository. Nothing automated verifies a full
user journey through the running application — e.g. an admin uploading a
JD, generating tests, inviting a candidate, the candidate completing the
exam in a browser, and an evaluation being produced. Every "integration"
test in the backend suite exercises the FastAPI app in-process via
`httpx.ASGITransport`, which never starts a real server, never renders the
frontend, and never touches the nginx/Lua JWT layer, Next.js middleware, or
real browser behavior (autosave timing, tab-visibility detection, timer
drift). This is a real gap, not a stylistic choice to be downplayed: no
automated process currently catches a regression that breaks the
candidate exam flow end-to-end in a real browser.

---

## Frontend Tests

**Zero**, confirmed in `_facts.md` §6. No Jest, Vitest, Playwright, or
Cypress configuration exists anywhere under `frontend/` — no test runner is
even installed as a dev dependency. None of the 21 pages, 33 components, 3
hooks, or 8 API client files have a single unit, component, or snapshot
test. This includes components with non-trivial client-side logic and no
backend equivalent to fall back on for correctness (see Risk Areas).

---

## CI/CD Coverage

`.github/workflows/ci.yml` defines two jobs, triggered on push/PR to
`main`:

**`backend-tests`** — Python 3.12, installs `backend/requirements.txt` plus
`aiosqlite`, then runs `pytest tests/ -x -q` (stop on first failure) against
the in-memory SQLite configuration described above. Required secrets
(`INTERNAL_API_SECRET`, `MAGIC_LINK_SECRET`, etc.) are supplied as
throwaway CI-only values, not pulled from any real secret store.

**`frontend-checks`** — Node 20, `npm ci`, `npx prisma generate` (against a
placeholder `DATABASE_URL`, used only so the Prisma client generates — no
real database is contacted), then `npm run lint`, `npm run type-check`, and
`npm run build`. No test command runs in this job because there is nothing
to run.

**What does NOT run in CI:**

- No end-to-end tests (none exist to run).
- No frontend unit/component test execution (none exist to run).
- No deployment stage of any kind — CI only validates, it never deploys to
  any environment.
- No check that Alembic migrations apply cleanly against a real Postgres
  instance — the backend job uses SQLite and `Base.metadata.create_all`
  (via the test fixtures), not `alembic upgrade head` against Postgres, so
  a migration that's broken against real Postgres (or against pgvector-
  specific SQL) would not be caught here.
- No security scanning of any kind — no dependency vulnerability scan
  (`pip-audit`, `npm audit`, Dependabot alerts gating the build), no SAST,
  no container image scanning, no secret-scanning step.
- No linting/type-checking gate on the backend (the frontend job lints and
  type-checks; there is no equivalent `ruff`/`mypy`/`flake8` step for
  `backend/`).

A green CI run on this repository means: the backend test suite passes
against SQLite, and the frontend compiles, lints clean, and type-checks. It
does **not** mean the application works end-to-end, deploys successfully,
or is free of known-vulnerable dependencies.

---

## Risk Areas

Synthesizing the coverage matrix and file-level reads above, the highest-risk
areas — where complexity/criticality is high and verified test coverage is
low or absent — are:

1. **The candidate attempt-token ownership guard has no negative test
   proving cross-attempt isolation.** `_load_attempt_for_token()` in
   `attempt_service.py` is the function that should stop candidate A's
   token from being used against candidate B's attempt ID (`_facts.md` §12
   confirms by direct code read that every mutating attempt endpoint calls
   it first). But reading `test_attempts.py` and `test_security.py`
   directly: **no test in either file constructs two separate
   tokens/attempts and asserts token A is rejected against attempt B's
   ID.** `test_attempts.py`'s `TestQuestionOwnership` tests a narrower
   thing — a *valid* token's owner can't submit answers for a question ID
   from a *different test* (cross-question injection within the same
   token), not cross-candidate isolation. `test_security.py` tests the
   token-hashing primitives in isolation only. The guard is almost
   certainly implemented correctly, but it is **not regression-tested** —
   a future refactor could silently reintroduce a cross-candidate access
   bug undetected. This is the single most important test gap to close,
   given the core trust boundary is "candidates can only touch their own
   attempt."

2. **Admin/reporting endpoints are the least-tested surface.** Per the
   coverage matrix, `stats.py` (both endpoints) has zero coverage, as do
   most of `evaluation.py`'s read endpoints (`leaderboard`,
   `leaderboard/{jd_id}`, `system-report/{jd_id}`, `{attempt_id}/summary`,
   `verify-scores`, `similar`, `export`) and several `invitations.py`
   mutations (`bulk`, `resend`, `revoke`). Several of these (export,
   verify-scores, similar) involve nontrivial logic — PDF/data export
   generation, score verification, pgvector similarity search — that is
   currently unverified by anything automated.

3. **AI retry/self-correction logic is well-tested via mocking — better
   than the simpler JSON-parsing helpers alone would suggest.**
   `test_skill_extraction.py` and `test_test_generation.py` both mock
   `ollama_client.generate` to exercise the multi-attempt self-correction
   loop directly: first-try success, success-after-one-correction, and
   exhaustion of all correction attempts raising `AIResponseParseError`.
   `test_ollama_service.py` separately tests a lower-level HTTP retry
   (connection failure then success). Both the low-level HTTP retry and
   the higher-level "ask the model to fix its own malformed JSON" loop
   have genuine behavioral coverage — this is one of the stronger-tested
   areas of the codebase, not a weak spot.

4. **Frontend has zero coverage of nontrivial client-side logic, and this
   is a clear, real risk.** The three custom hooks
   (`useAutoSave.ts`, `useSuspiciousEvents.ts`, `useTestTimer.ts`) implement
   exactly the kind of logic that tends to regress silently: debounced
   autosave timing, timer synchronization against server state (relevant
   to exam time limits), and suspicious-event detection (tab-switching,
   focus loss — part of the anti-cheating mechanism that
   `test_attempts.py`'s `TestSuspiciousEvents` only tests from the
   receiving/logging side on the backend, never from the
   detection/triggering side in the browser). None of these hooks, nor any
   of the 33 components (including exam-flow components like
   `TestTimer`, `MCQQuestion`, `CodeQuestion`, `SubmitConfirm`), have any
   automated test. A bug in autosave-debounce timing or timer-sync logic
   would currently only be caught by manual QA or by a candidate losing
   exam progress in production.

5. **Postgres-specific and migration-dependent behavior is entirely
   outside the test suite's reach.** Because tests run against in-memory
   SQLite built via `Base.metadata.create_all` rather than via Alembic, the
   PL/pgSQL `calculate_evaluation_scores` function (migration
   `d9e8f7a6b5c4`) and the pgvector `embedding` column / HNSW index and any
   vector-similarity query built on it (migration `db7cdbbfd2a8`, and the
   untested `GET /evaluation/{attempt_id}/similar` endpoint) cannot be
   exercised by this suite under any circumstance, regardless of how many
   more SQLite-backed tests are added. Closing this gap requires either a
   Postgres-backed test job in CI or a separate integration-test tier.
