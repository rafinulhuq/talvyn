# 03 — Codebase Analysis

> Counts and enumerations in this document are cited from `docs/enterprise/_facts.md`
> (13 backend services, 12 DB models, 21 frontend pages, 33 components, 48 API
> endpoints, 14 Docker services). Do not re-derive counts — if something here
> disagrees with `_facts.md`, `_facts.md` is correct.

## 1. Repository Structure

Top-level layout of `Talvyn/` (verified via `ls -la` and `find . -maxdepth 1 -type d`):

```
backend/          FastAPI application, services, models, migrations, tests
frontend/         Next.js 15 application (App Router), Prisma, NextAuth
docs/             Product/architecture docs, including this docs/enterprise/ set
nginx/            OpenResty reverse proxy config + Lua JWT guard
prometheus/       Metrics scrape config
grafana/          Dashboard datasource provisioning
codex-audit/      Third-party AI-generated audit report (legacy, see _facts.md §12)
.github/          CI workflow (ci.yml)
.agents/ .codex/  Empty directories — no tracked content found
.claude/          Claude Code local settings (not part of the application)
start.sh, stop.sh, create-admin.sh, deploy-ngrok.sh   Root-level operational scripts
docker-compose.yml, docker-compose.prod.yml            Container orchestration
```

### `backend/`

FastAPI service exposing the 48 REST endpoints documented in `_facts.md` §1. Internal
structure:

- `app/api/v1/*.py` — route handlers (controllers), one file per resource
  (`health.py`, `jd.py`, `tests.py`, `invitations.py`, `attempts.py`, `evaluation.py`,
  `stats.py`), mounted by `app/api/v1/router.py`.
- `app/services/*.py` — the 13 service modules; all business logic lives here (see
  §2 below).
- `app/db/models/*.py` — the 12 SQLAlchemy ORM models (`_facts.md` §2) plus
  `enums.py` (the 12 enums, `_facts.md` §3) and `_types.py` (custom column types,
  e.g. the pgvector `vector(768)` type used by `Evaluation.embedding`).
- `app/db/base.py` — `Base` declarative class and `create_engine()`, which branches
  pool configuration on whether `DATABASE_URL` is SQLite (tests) or Postgres
  (dev/prod).
- `app/db/session.py` — `get_db()` async session dependency.
- `app/schemas/*.py` — Pydantic request/response models, separated by resource
  (`jd.py`, `test.py`, `invitation.py`, `attempt.py`, `evaluation.py`).
- `app/core/` — cross-cutting concerns: `exceptions.py` (`AppException` hierarchy),
  `logging.py` (structured logger factory), `ratelimit.py` (slowapi + Redis
  limiter instance), `security.py`.
- `app/config.py` — `Settings` (pydantic-settings) and `get_settings()`.
- `app/dependencies.py` — shared FastAPI `Depends()` providers (`DBSession`,
  `AppSettings`, `VerifiedInternal`) — see §3 below.
- `app/main.py` — FastAPI app factory, lifespan (Ollama HTTP client init/teardown),
  middleware, router mounting.
- `app/worker.py` — ARQ worker process definition (separate from the API process).
- `alembic/` + `alembic.ini` — the 5 migrations listed in `_facts.md` §9.
- `tests/` — the 213 tests across 11 files (`_facts.md` §6), run against
  in-memory SQLite.
- `Dockerfile`, `prestart.sh` (runs `alembic upgrade head` before `uvicorn`),
  `requirements.txt`, `pytest.ini`.
- `.venv/` (gitignored) and **`.venv_test/`** — the latter is a real repo-hygiene
  issue: `_facts.md` §12 confirms `.venv_test/` (4,156 files) is currently tracked
  in git because `backend/.gitignore` only excludes the literal `.venv/` pattern.

Depends on: Postgres (via `DATABASE_URL`), Redis (rate limiting, ARQ broker,
generation-progress cache), Ollama (native host process, reached via
`host.docker.internal`), MinIO or local disk (file storage), Resend/SMTP (email).
Consumed by: `frontend/` (via the Next.js `/api/proxy/*` route and direct
server-side calls using `X-Internal-Token`), `nginx` (reverse proxy + JWT guard
in front of it in the containerized topology).

### `frontend/`

Next.js 15 App Router application. `src/app/` holds the 21 pages and 11 route-level
boilerplate files (loading/error/not-found) enumerated in `_facts.md` §5; `src/app/api/`
holds the 4 Next.js route handlers (NextAuth, JD upload, JD analyze, the generic
proxy). `src/components/` holds the 33 components across `admin/`, `candidate/`,
`landing/`, root-level, and `ui/`. `src/lib/api/` is the typed API client layer (8
files). `src/hooks/` (3 hooks) and `src/contexts/` (1 context, `GenerationContext`)
provide cross-page state. `prisma/` owns the NextAuth user/session schema and
`seed.ts` (auto-creates the default admin on container start). `wasm-parser/` is a
Rust-compiled WASM module used for client-side JD text extraction before upload.
Full page/component inventory is documented in `04-frontend-documentation.md` —
this file does not duplicate it.

Depends on: `backend/` (all data operations, proxied through
`src/app/api/proxy/[...path]/route.ts` using `INTERNAL_API_SECRET`), its own
Postgres-backed Prisma schema for auth (separate from the backend's SQLAlchemy
models — both point at logically related but schema-distinct tables in the same
`DATABASE_URL` per `_facts.md` §10).

### `docs/`

Documentation root. Contains the current docs/enterprise/ effort (this file and its
siblings), narrative docs (`architecture.md`, `deployment.md`, `developer-guide.md`,
`user-guide.md`, `future-improvements.md`), generated reports (`.docx`/`.pdf`/`.html`
AI-model and hardware-spec reports), and one flagged legacy document:
`Talvyn-codebase-analysis-report.md` (dated 2026-06-08, predates nginx, MinIO,
GlitchTip, Prometheus, Grafana, pgvector, the WASM parser, and bulk-invite — see
`_facts.md` §12, item 1). Treat that file as historical, not current.

### `nginx/`

Configuration for the OpenResty container in `docker-compose.yml`'s 14-service
topology. `nginx.conf` is the reverse-proxy config; `lua/jwt_check.lua` implements
a JWT validation guard executed inside nginx via OpenResty's Lua scripting, gating
traffic before it reaches `frontend`/`backend` containers. This is the
containerized nginx — distinct from the host-level nginx assumed by
`docker-compose.prod.yml`/`docs/deployment.md`, and distinct again from the
`deploy-ngrok.sh` nginx-on-8080 setup (three different nginx topologies; see
`_facts.md` §13, not resolved here).

### `prometheus/`

`prometheus.yml` — scrape configuration for the `prometheus` container, one of the
14 Docker services. Pairs with `grafana/` for the metrics/observability stack.

### `grafana/`

`provisioning/datasources/prometheus.yml` — auto-provisions Prometheus as a Grafana
datasource so dashboards work without manual setup after `docker compose up`.

### `codex-audit/`

`Talvyn-full-project-audit.md` — a third-party AI-generated audit (dated
2026-06-14) with Mermaid diagrams and a "Top 20 Risks" table. Per `_facts.md` §12,
five of its P0 findings were independently re-verified on 2026-06-18 and found
**false / already remediated** (tracked `.env` files, attempt-token ownership
bypass, raw token in query string, bypassed production migrations, non-durable AI
jobs). One finding was confirmed true in a different form (`.venv_test/` tracked,
not `.venv/`). Its remaining claims (Prisma/Alembic schema drift, missing DB
uniqueness constraints, scalability tiering) are **not independently verified** —
treat them as hypotheses to spot-check, not facts.

### `.github/`

`workflows/ci.yml` — two CI jobs (`backend-tests`, `frontend-checks`) on push/PR to
`main`. No E2E job, no deployment job. Details in `_facts.md` §7.

### Root-level scripts and compose files

- **`start.sh`** — "Auto-configuring Talvyn launcher." Detects host hardware
  (GPU VRAM, CPU cores, RAM) and picks one of 6 hardware profiles
  (ultra/high/medium/low/cpu_fast/cpu_slow), writing the result to
  `backend/.env.hardware` (loaded by `docker-compose.yml`). Supports `--cpu-only`
  and `--status` flags. This is the primary dev entry point.
- **`stop.sh`** — "Stop everything started by `./start.sh`." Stops Docker services
  and the natively-running Ollama process. `--wipe-db` additionally deletes
  database volumes (irreversible).
- **`create-admin.sh`** — Creates or resets a Talvyn admin account, with
  `--docker`/`--prod`/local modes and non-interactive password support via
  `ADMIN_PASSWORD`. Per `_facts.md` §11, this is **largely redundant** now that
  `frontend/prisma/seed.ts` auto-creates the default admin on every container
  start — worth treating as a manual-override tool rather than a required setup
  step, and a candidate for removal/clarification.
- **`deploy-ngrok.sh`** — "Public access via nginx + ngrok." A third deployment
  path distinct from both `docker-compose.yml` (containerized nginx on host port
  81) and `docker-compose.prod.yml` (host-level nginx on 80/443): it runs its own
  nginx on port 8080 (chosen to avoid clashing with a host Apache install) and
  tunnels it through ngrok for public HTTPS demo access. Requires an ngrok
  auth-token and sudo for local nginx install/config.
- **`docker-compose.yml`** — the primary, current dev/local-prod-like topology: 14
  services as enumerated in `_facts.md` §8 (postgres with pgvector, redis,
  mailpit, backend, worker, frontend, nginx/OpenResty, minio, glitchtip stack,
  prometheus, grafana). Notably runs Ollama **natively on the host**, not in
  Docker — the file's own comments explain this avoids GPU-in-Docker /
  nvidia-container-toolkit complexity on the dev machine's RTX 3060 Ti, with the
  backend reaching it via `host.docker.internal`.
  Postgres image is `pgvector/pgvector:pg16` specifically so the optional
  embedding feature (`EMBEDDING_ENABLED=true`) has the `vector` column type
  available without a separate extension-install step.
- **`docker-compose.prod.yml`** — a slimmer 3-service topology (postgres, backend,
  frontend only), expecting a host-level (non-Docker) nginx on ports 80/443 in
  front of it, with the backend running multiple workers and no `--reload`/no
  source mounts. This is the topology `docs/deployment.md` documents — see the
  configuration-drift note in `_facts.md` §13: the three deployment descriptions
  in this repo (this file, `docker-compose.yml`, `deploy-ngrok.sh`) genuinely
  disagree on port and proxy topology, and that inconsistency is surfaced (not
  resolved) in `09-devops-documentation.md`.

---

## 2. Module Documentation

### 2.1 Backend Services (13 files in `backend/app/services/`)

Each subsection below is sourced directly from the named file's module docstring
and top-level function/class signatures.

#### `attempt_service.py`

Owns the candidate test-taking lifecycle end to end: starting an attempt, saving
answers, heartbeat/timer reconciliation, submission, and suspicious-event logging.
Its stated security invariants (module docstring) are that correct
answers/explanations/rubrics never leave the service, submission is idempotent,
the server-side timer is authoritative, and every mutating function validates
question ownership against the attempt's assigned test. Depends on `Test`,
`Question`, `TestAttempt`, `CandidateAnswer`, `SuspiciousEvent`, `Invitation`
models and a Redis client (`set_redis_client`) for cached test lookups.

Key functions: `start_attempt`, `get_attempt_state`, `save_answer`,
`bulk_save_answers`, `heartbeat`, `submit_attempt`, `log_suspicious_event`,
`get_test_progress`, plus private helpers `_load_attempt_for_token` (token →
attempt resolution, used as the first call in every mutating endpoint) and
`_validate_question_ids`.

#### `email_service.py`

Sends transactional email via Resend (with an SMTP fallback path,
`_send_via_smtp`), specifically the candidate invitation magic link. Builds
Outlook-safe inline-CSS HTML (`_build_invitation_html`) with no external image/CDN
dependencies. Depends only on `app.config` for credentials/sender address — no
model or other-service dependencies.

Key functions: `send_invitation_email`, `_send_via_smtp`, `_build_invitation_html`.

#### `embedding_service.py`

Generates 768-dim text embeddings for semantic candidate-similarity search
(pgvector), gated entirely behind `EMBEDDING_ENABLED`. Uses a dedicated small
Ollama embedding model (default `nomic-embed-text`) kept separate from the main
generation model so the two don't compete for VRAM. By design every failure mode
(disabled, model missing, Ollama unreachable, malformed response) is swallowed and
returns `None` rather than raising — callers must treat `None` as "skip," not as an
error. Depends on `ollama_service` for the HTTP call.

Key function: `generate_embedding(text: str) -> list[float] | None`.

#### `evaluation_service.py`

The largest service (42 KB) — the full evaluation pipeline for a submitted
attempt: load answers/questions, auto-score MCQs (re-mapping shuffled options back
to canonical labels), evaluate open-ended/code answers via Ollama one call at a
time, aggregate into strengths/weaknesses/recommendation/summary, then persist
`Evaluation` + `QuestionFeedback` atomically. Enforces a strict scoring philosophy
in the prompt and via Pydantic validation: Ollama cannot award full marks without
meeting every rubric criterion, and `STRONG_HIRE` requires both ≥70% score and an
explicit strength citation; every evaluation is surfaced to the admin as
`is_preliminary=True`. Depends on `embedding_service` (for similarity search),
`ollama_service` (generation + JSON parsing), and the `CandidateAnswer`,
`TestAttempt`, `Question`, `Evaluation`, `QuestionFeedback` models.

Key functions: `evaluate_attempt`, `_score_mcqs`, `_evaluate_open_ended`,
`_aggregate_evaluation`, `_persist_evaluation`, `find_similar_evaluations`,
`get_leaderboard`, `get_global_leaderboard`, `get_system_report`,
`list_evaluations`.

#### `export_service.py`

Generates DOCX evaluation reports for download, using `python-docx` directly
(table cell backgrounds, headings, key/value rows). Pure presentation logic —
takes an already-built `EvaluationResponse` schema object and has no DB or other
service dependency.

Key function: `build_docx(ev: EvaluationResponse) -> bytes`.

#### `file_service.py`

Storage abstraction with two interchangeable backends selected by
`STORAGE_BACKEND`: `local` (filesystem under the uploads Docker volume) or `s3`
(MinIO). Both backends implement the same `StorageBackend` `Protocol`
(`save`/`read`/`delete`), so the `FileService` facade and its callers never branch
on backend type. A module-level singleton (`file_service = FileService()`,
`file_service.py:234`) picks the concrete backend once at import time based on
settings — see §3 (Design Patterns) for why this is closer to a Strategy pattern
than a classic Factory.

Key class/functions: `FileService.save_jd_file`, `read_file`, `delete_file`,
`resolve_path`; private backends `_LocalBackend`, `_MinioBackend`.

#### `invitation_service.py`

Owns the full invitation lifecycle: create → hash token → save → email; validate
→ check expiry/status; mark opened; auto-expire stale invitations; admin revoke;
resend (rotates token); paginated listing; bulk invite. Security model (module
docstring): raw tokens only ever exist in URL params and email body — the DB
stores only `HMAC-SHA256(token, secret)`, compared in constant time. Depends on
`attempt_service.get_test_progress` (for dashboard status) and
`email_service.send_invitation_email`, plus `Invitation`/`Candidate` models.

Key functions: `create_invitation`, `validate_token`, `mark_opened`,
`resend_invitation`, `revoke_invitation`, `list_invitations_for_jd`, `bulk_invite`,
`_auto_expire_stale`.

#### `jd_service.py`

Business logic for the job-description lifecycle (upload → parse → extract skills
→ generate tests), explicitly designed so route handlers in `api/v1/jd.py` stay
thin and the same functions are reusable from background workers without going
through HTTP (module docstring). Depends on `file_service` (storage),
`parser_service` (text extraction), and is itself depended on by `worker.py`'s
task wrappers (`task_parse_jd`, `task_extract_skills`, `task_generate_tests`) and
indirectly drives `skill_extraction_service` and `test_generation_service` via its
`*_background` functions.

Key functions: `create_jd`, `get_jd_by_id`, `list_jds`, `get_jd_status`,
`delete_jd`, `parse_jd_background`, `extract_skills_background`,
`generate_tests_background`, `trigger_skill_extraction`.

#### `ollama_service.py`

The single HTTP transport layer for all Ollama calls — the module docstring
explicitly instructs other code to go through higher-level services rather than
import this directly. Maintains one persistent `httpx.AsyncClient`
(`init_http_client`/`close_http_client`, wired into the FastAPI lifespan and the
ARQ worker's `startup`/`shutdown`) to avoid per-call TCP/TLS handshake overhead,
with per-request timeout overrides so 5s health checks and long generation calls
share the same client safely. Implements exponential-backoff retry
(`_post_with_retry`) and JSON-mode enforcement/extraction
(`_extract_json_from_text`, `parse_json_response`). Exposes a module-level
singleton, `ollama_client = OllamaClient()` (`ollama_service.py:350`), imported by
`embedding_service`, `evaluation_service`, `skill_extraction_service`, and
`test_generation_service`. No model dependencies — pure HTTP/text layer.

Key class: `OllamaClient` (`generate`, `_post_with_retry`); module functions
`init_http_client`, `close_http_client`, `parse_json_response`.

#### `parser_service.py`

Extracts plain UTF-8 text from PDF (PyMuPDF/`fitz`) and DOCX
(`python-docx`) files, preserving paragraph breaks and reading order, stripping
excess whitespace, and raising a dedicated `ParseError` on corrupt/unreadable
input. No model or other-service dependencies — pure parsing utility consumed by
`jd_service.parse_jd_background`.

Key functions: `extract_text(content: bytes, file_type: FileType) -> str`,
`clean_text`, `ParseError`.

#### `skill_extraction_service.py`

Owns the prompt-build → Ollama call → Pydantic-validate → correction-retry →
persist pipeline for extracting structured skills/difficulty data from a parsed
JD. The module docstring explicitly states the separation of concerns: transport
lives in `ollama_service`, orchestration lives in `jd_service`, and prompt design
plus validation plus DB writes live here. Depends on `ollama_service.ollama_client`
and `JdExtractedData`/`JobDescription` models.

Key functions: `extract_skills_from_jd_text`, `save_extracted_skills`,
`_try_validate`; schema classes `DifficultyDistribution`, `SkillExtractionResult`.

#### `test_generation_service.py`

Generates the three assessment tests (TECHNICAL, REASONING, PROBLEM_SOLVING) per
JD from extracted skills, following the same prompt → Ollama → validate → retry →
persist pipeline as skill extraction, but per test type with different prompt
constraints. Tracks generation progress in Redis (`_set_progress`/`get_progress`,
keyed per JD) so the frontend's `GenerationContext`/`GenerationBanner` can poll
status. Depends on `ollama_service.ollama_client`, `Test`/`Question` models, and a
Redis client (`set_redis_client`) — invoked from `worker.py`'s
`task_generate_tests` rather than directly from a request handler, since
generation is long-running.

Key functions: `generate_tests_for_jd`, `regenerate_single_test`,
`_generate_with_retry`, `_persist_test`, `_build_questions`, `get_progress`,
`clear_progress`.

#### `test_service.py`

Thin CRUD layer for `Test`/`Question` records — explicitly states in its docstring
that it exists to keep route handlers in `api/v1/tests.py` thin. Delegates actual
generation to `test_generation_service` (`trigger_generate_tests`,
`trigger_regenerate_single` wrap and validate before delegating) and otherwise
performs direct ORM reads/writes (list, get, update metadata, update/delete
question, delete test, recompute total marks).

Key functions: `trigger_generate_tests`, `list_tests_for_jd`, `get_test`,
`update_test_metadata`, `set_test_status`, `update_question`, `delete_question`,
`delete_test`, `_recompute_total_marks`.

### 2.2 Service Dependency Graph

Cross-service imports found via `grep "^from app.services" backend/app/services/*.py`:

```
embedding_service        → ollama_service
evaluation_service        → embedding_service, ollama_service
skill_extraction_service  → ollama_service
test_generation_service   → ollama_service
test_service              → test_generation_service
invitation_service        → attempt_service, email_service
jd_service                → file_service, parser_service
```

`ollama_service` and `parser_service` are leaf dependencies (no service imports);
`email_service`, `export_service`, and `embedding_service`'s only inbound caller is
`evaluation_service`. `jd_service` is the orchestration hub for the JD pipeline but
is itself only invoked from `api/v1/jd.py` and `worker.py`, never imported by
another service module.

### 2.3 Frontend Module Organization (brief — see `04-frontend-documentation.md`)

- **API client layer** — `frontend/src/lib/api/` (8 files, `_facts.md` §5):
  `client.ts` builds the shared `axios` instance, branching base URL by execution
  context (`frontend/src/lib/api/client.ts`): server-side calls hit
  `FASTAPI_INTERNAL_URL` directly, browser-side calls go through
  `/api/proxy/...` so `INTERNAL_API_SECRET` never reaches the client. `serverFetch.ts`
  is the server-only fetch wrapper; `jd.ts`, `tests.ts`, `attempts.ts`,
  `invitations.ts`, `evaluation.ts`, `health.ts` are per-resource typed wrappers
  mirroring the backend's `api/v1/*.py` resource split.
- **Hooks** (`frontend/src/hooks/`, 3 files) — `useAutoSave.ts`,
  `useSuspiciousEvents.ts`, `useTestTimer.ts` encapsulate candidate-exam-page
  behavior (debounced answer persistence, proctoring event capture, the
  client-side countdown that mirrors the backend's authoritative server timer).
- **Contexts** (`frontend/src/contexts/`, 1 file) — `GenerationContext.tsx`
  provides global polling/state for the JD skill-extraction and test-generation
  async pipeline, consumed by `GenerationBanner` and related admin components.

Full page-by-page and component-by-component documentation lives in
`04-frontend-documentation.md`; this section intentionally stops at the
organizational layer.

---

## 3. Design Patterns

### Service Layer Pattern — present, clearly

`backend/app/services/` is a textbook service layer: all 13 modules hold business
logic, and route handlers in `backend/app/api/v1/*.py` are kept deliberately thin.
This is stated explicitly, not just observed — `jd_service.py:1-7`'s module
docstring: *"Route handlers in jd.py are kept thin; all DB operations and
orchestration live here so Phase 3 (skill extraction) can call the same functions
without going through HTTP."* `test_service.py:1-4` states the identical intent.
Confirms in practice: `api/v1/jd.py` imports `from app.services import jd_service`
and its handlers are mostly parameter validation + a single service call.

### Dependency Injection — present, via FastAPI `Depends()`

`backend/app/dependencies.py` defines the shared injectables: `DBSession =
Annotated[AsyncSession, Depends(get_db)]` (`dependencies.py:22`), `AppSettings =
Annotated[Settings, Depends(get_settings)]` (`dependencies.py:23`), and
`VerifiedInternal = Annotated[None, Depends(verify_internal_token)]`
(`dependencies.py:61`), where `verify_internal_token`
(`dependencies.py:28-57`) does constant-time HMAC comparison of the
`X-Internal-Token` header against `settings.internal_api_secret`. Route handlers
declare these as typed parameters (e.g. `api/v1/jd.py` uses `VerifiedInternal` to
gate every endpoint per `_facts.md` §1's auth model). This is real, idiomatic
FastAPI DI — not a hand-rolled container.

### Repository Pattern — not present; services talk to the ORM directly

There is **no repository abstraction layer**. `backend/app/db/models/` defines 12
SQLAlchemy declarative models (`Base` in `db/base.py:12`), but services issue
`select()`/`db.execute()` calls directly against those models rather than going
through a `XRepository` class — confirmed by `grep -rn "class.*Repository" backend/app`
returning zero matches, and by reading e.g. `evaluation_service.py:29-39`, which
imports `select` from `sqlalchemy` directly alongside the `CandidateAnswer`,
`TestAttempt`, `Question`, `Evaluation` models and queries them inline. The
`*_service.py` modules **are** the data-access layer in this codebase; calling
this "repository pattern" would overstate what's there. If a true repository
abstraction is wanted later, it would sit between today's services and the ORM —
it doesn't exist today.

### Factory Pattern — partially present, but closer to Strategy

`backend/app/services/ollama_service.py:134-165` defines `OllamaClient` as a plain
class instantiated once into a module-level singleton, `ollama_client =
OllamaClient()` (`ollama_service.py:350`) — this is a singleton/service-locator
idiom, not a factory (nothing decides *which* class to instantiate at runtime; it's
always `OllamaClient`). The pattern that actually matches "select an
implementation at runtime" is in `file_service.py`: `FileService.__init__`
(`file_service.py:156-165`) branches on `settings.storage_backend` to assign
`self._backend` to either `_MinioBackend()` or `_LocalBackend(base)`, both
satisfying the same `StorageBackend` `Protocol` (`file_service.py:38`). That is a
**Strategy pattern** (interchangeable algorithms/backends behind one interface),
not a GoF Factory (no separate factory class/method whose sole job is object
creation decoupled from the caller). Classic GoF Factory Method/Abstract Factory:
**not clearly present** anywhere in `backend/app/services/`.

### Event-Driven / Async-Queue Pattern — present, via ARQ

`backend/app/worker.py` is a dedicated ARQ worker process, separate from the API
process, registering three task functions — `task_parse_jd`, `task_extract_skills`,
`task_generate_tests` (`worker.py:54-72`) — each a thin wrapper delegating to the
corresponding `jd_service.*_background` function. The module docstring
(`worker.py:12-18`) gives the explicit rationale: FastAPI `BackgroundTasks` would
block one of the 4 uvicorn workers for the duration of a long Ollama call and
loses in-flight jobs on container restart with no retry; ARQ is asyncio-native and
Redis-backed instead. `WorkerSettings` (`worker.py:86-97`) caps concurrency at
`max_jobs = 1` (matching `OLLAMA_NUM_PARALLEL=1`) and computes `job_timeout`
dynamically from the retry/timeout settings. This is a genuine
producer/consumer queue pattern: API handlers enqueue jobs (not shown in this
file, but consumed via `app.worker`'s task names), the worker process consumes
them independently, and Redis is the broker — confirming the "14 Docker services"
inventory's separate `worker` container in `_facts.md` §8.

### MVC-Equivalent — present, as Router / Schema / Service / Model

FastAPI's idiomatic split maps cleanly onto MVC roles:

| MVC role | Talvyn equivalent |
|---|---|
| Controller | `backend/app/api/v1/*.py` route handlers — parse request, call service, return response |
| View / DTO | `backend/app/schemas/*.py` Pydantic request/response models |
| Model | `backend/app/db/models/*.py` SQLAlchemy ORM classes |
| (extra layer, not in classic MVC) | `backend/app/services/*.py` — business logic, sitting between controller and model |

This is a four-layer variant of MVC (Router-Service-Schema-Model) rather than
strict three-layer MVC; the extra service layer is what keeps controllers thin (see
above). The pattern is consistent across all 7 router files and all 13 services.

### Patterns checked but not found

- **Classic GoF Factory / Abstract Factory** — not present; see above (closest
  analog is `FileService`'s Strategy-style backend selection).
- **Strategy pattern (explicit)** — present once, in `file_service.py`'s storage
  backend selection (see above); not used elsewhere in the service layer.
- **Repository pattern** — not present; services query the ORM directly (see
  above).
- **Observer pattern** — not found; the closest analog is Redis-backed progress
  polling (`test_generation_service._set_progress`/`get_progress`), which is a
  polling/shared-state mechanism, not a push-based observer/subscriber
  relationship.
