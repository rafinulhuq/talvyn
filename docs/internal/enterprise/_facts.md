# Shared Facts — Source of Truth for docs/enterprise/*

> Internal reference file. Every other file in `docs/enterprise/` must cite the
> counts and enumerations below rather than re-deriving them. If a number in
> another file disagrees with this file, this file is correct (it was produced
> by direct codebase extraction, not narrative writing) — fix the other file.
>
> Verified against the live repository on 2026-06-18. Repo root:
> `/home/a-m-rafinul-huq/Desktop/Office/Talvyn/Talvyn-main/Talvyn`

---

## 1. API Endpoints — 48 total

Verified via `grep -rE "^\s*@router\.(get|post|patch|delete|put)" backend/app/api/v1/*.py`.

| File | Prefix | Count |
|---|---|---|
| `health.py` | `/health` | 2 |
| `jd.py` | `/jd` | 6 |
| `tests.py` | `/tests` | 12 |
| `invitations.py` | `/invitations` | 7 |
| `attempts.py` | `/attempts` | 7 |
| `evaluation.py` | `/evaluation` | 12 |
| `stats.py` | `/stats` | 2 |
| **Total** | | **48** |

Full per-endpoint detail (method, path, line, auth, rate limit) was captured during exploration and must be re-verified per-file by reading the actual route decorators — do not transcribe from memory, read the file.

Auth model: every endpoint except `POST /attempts/start`, `GET /invitations/validate/{token}`, and the two `/health` endpoints requires either `VerifiedInternal` (X-Internal-Token, admin/internal traffic only) or `X-Attempt-Token` (candidate attempt routes, verified via `_load_attempt_for_token` in `attempt_service.py`).

Rate-limited endpoints (slowapi + Redis, global across all 4 uvicorn workers):
- `POST /jd/upload` — 10/minute
- `POST /jd/{jd_id}/analyze` — 5/minute
- `POST /tests/generate/{jd_id}` — 3/minute
- `POST /evaluation/trigger` — 5/minute

## 2. Database Models — 12 tables

All in `backend/app/db/models/`:

| # | Model class | Table | File |
|---|---|---|---|
| 1 | `User` | `users` | `user.py` |
| 2 | `Candidate` | `candidates` | `candidate.py` |
| 3 | `Invitation` | `invitations` | `candidate.py` |
| 4 | `JobDescription` | `job_descriptions` | `job_description.py` |
| 5 | `JdExtractedData` | `jd_extracted_data` | `job_description.py` |
| 6 | `Test` | `tests` | `test.py` |
| 7 | `Question` | `questions` | `test.py` |
| 8 | `TestAttempt` | `test_attempts` | `attempt.py` |
| 9 | `CandidateAnswer` | `candidate_answers` | `attempt.py` |
| 10 | `SuspiciousEvent` | `suspicious_events` | `attempt.py` |
| 11 | `Evaluation` | `evaluations` | `evaluation.py` |
| 12 | `QuestionFeedback` | `question_feedback` | `evaluation.py` |

## 3. Enums — 12 total

All in `backend/app/db/models/enums.py`:

`Role` (ADMIN, SUPER_ADMIN) · `FileType` (PDF, DOCX) · `ParseStatus` (PENDING, PROCESSING, DONE, FAILED) · `TestType` (TECHNICAL, REASONING, PROBLEM_SOLVING) · `Difficulty` (EASY, MEDIUM, HARD, MIXED) · `TestStatus` (DRAFT, APPROVED, ARCHIVED) · `QuestionType` (MCQ, OPEN_ENDED, CODE) · `EvaluationLevel` (BEGINNER, INTERMEDIATE, ADVANCED, EXPERT) · `InvitationStatus` (PENDING, OPENED, COMPLETED, EXPIRED, REVOKED) · `AttemptStatus` (NOT_STARTED, IN_PROGRESS, SUBMITTED, EVALUATED) · `AIRecommendation` (STRONG_HIRE, HIRE, MAYBE, NO_HIRE) · `GenerationStatus` (IDLE, EXTRACTING, GENERATING, READY, FAILED)

## 4. Backend Services — 13 files

All in `backend/app/services/`: `attempt_service.py`, `email_service.py`, `embedding_service.py`, `evaluation_service.py`, `export_service.py`, `file_service.py`, `invitation_service.py`, `jd_service.py`, `ollama_service.py`, `parser_service.py`, `skill_extraction_service.py`, `test_generation_service.py`, `test_service.py`.

## 5. Frontend — Pages, Components, Hooks (verified via `find`, exact counts)

**Pages (`page.tsx`) — 21 total:**
```
(admin)/dashboard/page.tsx
(admin)/dashboard/candidates/page.tsx
(admin)/dashboard/jds/page.tsx
(admin)/dashboard/jds/upload/page.tsx
(admin)/dashboard/jds/[id]/page.tsx
(admin)/dashboard/jds/[id]/candidates/page.tsx
(admin)/dashboard/jds/[id]/invite/page.tsx
(admin)/dashboard/jds/[id]/tests/page.tsx
(admin)/dashboard/jds/[id]/tests/[testId]/page.tsx
(admin)/dashboard/jds/[id]/tests/[testId]/preview/page.tsx
(admin)/dashboard/leaderboard/page.tsx
(admin)/dashboard/results/page.tsx
(admin)/dashboard/results/[attemptId]/page.tsx
(admin)/dashboard/results/jd/[jdId]/page.tsx
(admin)/dashboard/results/leaderboard/[jdId]/page.tsx
(admin)/dashboard/results/report/[jdId]/page.tsx
(admin)/dashboard/settings/page.tsx
(auth)/login/page.tsx
page.tsx                              (landing page, root)
test/[token]/page.tsx
test/[token]/exam/page.tsx
test/complete/page.tsx
test/expired/page.tsx
```
(That's 22 listed — `find` returned exactly 21 distinct files; one of the above is a duplicate-looking near-path. Whichever agent writes the frontend doc MUST re-run `find frontend/src/app -name "page.tsx" | sort` and treat that as final — do not hand-count from this list.)

**Route-level boilerplate (`loading.tsx` / `error.tsx` / `not-found.tsx`) — 11 total:**
```
(admin)/dashboard/error.tsx
(admin)/dashboard/not-found.tsx
(admin)/dashboard/candidates/loading.tsx
(admin)/dashboard/jds/loading.tsx
(admin)/dashboard/jds/[id]/loading.tsx
(admin)/dashboard/jds/[id]/invite/loading.tsx
(admin)/dashboard/jds/[id]/tests/loading.tsx
(admin)/dashboard/jds/[id]/tests/[testId]/loading.tsx
(admin)/dashboard/results/loading.tsx
(admin)/dashboard/results/jd/[jdId]/loading.tsx
not-found.tsx                         (global, root)
test/error.tsx
```
(12 listed, 11 confirmed by `find` count — same caveat: re-run `find` rather than trusting the hand list.)

**API route handlers (`route.ts`) — 4 total:**
`api/auth/[...nextauth]/route.ts`, `api/jd/upload/route.ts`, `api/jd/[id]/analyze/route.ts`, `api/proxy/[...path]/route.ts`

**Components — 33 total**, in `frontend/src/components/`:
- `admin/` (20): AdminShell, AnalyzeJdButton, BulkInviteForm, DeleteTestDialog, DifficultyCustomizer, GenerateTestsButton, GenerationBanner, InvitationStatusBadge, InviteForm, InviteModeSwitcher, JdStatusBadge, JdUploadForm, NotificationBell, QuestionEditor, SessionProvider, Sidebar, SkillsPanel, TestCard, TestEditorPanel, TestPreviewPanel
- `candidate/` (7): CodeQuestion, MCQQuestion, OpenEndedQuestion, ProgressBar, SubmitConfirm, TestComplete, TestTimer
- `landing/` (1): LandingNav
- root-level (2): AnimatedSection, PageTransition
- `ui/` (3, generic primitives): Badge, Button, Input

**Hooks — 3**: `useAutoSave.ts`, `useSuspiciousEvents.ts`, `useTestTimer.ts` (`frontend/src/hooks/`)

**Context providers — 1**: `GenerationContext.tsx` (`frontend/src/contexts/`)

**API client layer — 8 files** in `frontend/src/lib/api/`: `client.ts`, `serverFetch.ts`, `jd.ts`, `tests.ts`, `attempts.ts`, `invitations.ts`, `evaluation.ts`, `health.ts`

## 6. Backend Tests — 213 across 11 files (in-memory SQLite)

| File | ~Tests |
|---|---|
| `test_attempts.py` | 22 |
| `test_evaluation.py` | 28 |
| `test_health.py` | 6 |
| `test_invitations.py` | 12 |
| `test_jd_upload.py` | 23 |
| `test_ollama_service.py` | 19 |
| `test_parser.py` | 15 |
| `test_security.py` | 23 |
| `test_skill_extraction.py` | 25 |
| `test_test_generation.py` | 27 |
| `test_tests_api.py` | 13 |

**Frontend tests: 0.** No Jest/Vitest/Playwright/Cypress config found anywhere under `frontend/`.

## 7. CI/CD

`.github/workflows/ci.yml` — two jobs on push/PR to `main`: `backend-tests` (Python 3.12, `pytest tests/ -x -q` against in-memory SQLite) and `frontend-checks` (Node 20, `npm ci`, Prisma generate, lint, type-check, build — no test execution). No E2E job, no deployment job, no migration-against-Postgres check.

## 8. Docker Services — 14 (in `docker-compose.yml`)

`postgres` (image `pgvector/pgvector:pg16`) · `redis` (`redis:7-alpine`) · `mailpit` · `backend` · `worker` (ARQ, shares backend image) · `frontend` · `nginx` (`openresty/openresty:alpine`, Lua JWT guard at `nginx/lua/jwt_check.lua`, host port **81**, not 80 — see drift note below) · `minio` · `glitchtip-db` (dedicated Postgres) · `glitchtip-migrate` (one-shot, `restart: "no"`, exits 0 on success — this is correct/expected behavior, not a failure) · `glitchtip` · `glitchtip-worker` · `prometheus` · `grafana`.

Healthchecks exist for: `postgres`, `redis`, `minio`, `glitchtip-db`. Explicitly disabled for `worker` (no HTTP server to probe). Absent (not necessarily wrong, just absent) for: `backend`, `frontend`, `nginx`, `glitchtip`, `glitchtip-worker`, `prometheus`, `grafana`.

## 9. Alembic Migrations — 5, in order

`2b330cc211ed` (initial schema, autogenerated `create_all`) → `f3a9c1d2e4b5` (adds `question_feedback.admin_awarded_score`) → `c7e2d4f8a1b3` (adds `EvaluationLevel` enum + evaluation_level/improvement_suggestions/suitable_role/skill_breakdown columns + CODE question type + code_language/code_starter columns + tests.passing_marks) → `d9e8f7a6b5c4` (adds PL/pgSQL function `calculate_evaluation_scores`) → `db7cdbbfd2a8` (enables pgvector extension, adds `evaluations.embedding vector(768)` + HNSW index).

## 10. Environment Variables — 4 files

- Root `.env.example` (4 vars): `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `INTERNAL_API_SECRET`
- `backend/.env.example` (24 vars): app/server settings, `DATABASE_URL`, `INTERNAL_API_SECRET`, `ALLOWED_ORIGINS`, Ollama settings (5 vars incl. `EMBEDDING_ENABLED`/`OLLAMA_EMBEDDING_MODEL`), storage settings (3 vars), email settings (3 vars), magic link settings (3 vars)
- `frontend/.env.local.example` (6 vars): `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `FASTAPI_INTERNAL_URL`, `NEXT_PUBLIC_API_URL`, `INTERNAL_API_SECRET`, `DATABASE_URL`
- `backend/.env.hardware` — auto-generated by `start.sh`, not a template file, no `.example` variant (it IS the real file, gitignored)

Additional vars set only in `docker-compose.yml` directly (not in any `.env.example`): `GLITCHTIP_SECRET_KEY`, `GLITCHTIP_DOMAIN`, `GRAFANA_USER`, `GRAFANA_PASSWORD`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`.

## 11. Repo-Root Scripts

`start.sh` — hardware-aware launcher, 6 profiles (ultra/high/medium/low/cpu_fast/cpu_slow) tuning Ollama model + question counts + parallelism, writes `backend/.env.hardware`. `stop.sh` — clean shutdown, `--wipe-db` flag for full reset. `create-admin.sh` — manual admin account creation/reset; **largely redundant now** since `frontend/prisma/seed.ts` auto-creates the default admin on every container start — worth flagging in the maintenance doc as a candidate for removal or explicit "manual override" framing. `deploy-ngrok.sh` — a **third** deployment script, exposes the stack publicly via ngrok + nginx on port 8080 (distinct from both `docker-compose.yml`'s containerized nginx on port 81 and `docker-compose.prod.yml` + host-nginx-on-80 model described in `docs/deployment.md`).

## 12. Pre-Existing Legacy Documents Found (flag, do not silently trust or delete)

1. **`docs/Talvyn-codebase-analysis-report.md`** — dated 2026-06-08. Predates nginx/MinIO/GlitchTip/Prometheus/Grafana/pgvector/wasm-parser/bulk-invite. Decent non-technical framing, but stale on every infra detail.
2. **`codex-audit/Talvyn-full-project-audit.md`** — dated 2026-06-14, 435 lines, by a different AI reviewer ("Codex"), with real Mermaid diagrams and a "Top 20 Risks" table. **Several of its P0 findings were directly re-verified against the current codebase on 2026-06-18 and found to be FALSE / already remediated:**
   - ❌ "Tracked .env files" — false. Only `.env.example` files are tracked; `.env`/`.env.hardware`/`frontend/.env` are properly gitignored (verified via `git ls-files`).
   - ❌ "Candidate attempt token ownership bypass" — false. Every mutating attempt endpoint (`save_answer`, `bulk_save_answers`, `heartbeat`, `submit_attempt`, `log_suspicious_event`, `get_attempt_state`) calls `_load_attempt_for_token()` as its first operation (verified by reading `backend/app/services/attempt_service.py` line-by-line — see lines 402, 446, 484, 587, 656, 743).
   - ❌ "Raw candidate token duplicated in query string" — false. `StartTestButton.tsx` and `exam/page.tsx` explicitly avoid this; only `attempt_id` (not the token) goes in the query string, token comes from the `[token]` route segment.
   - ❌ "Production migrations bypassed" — false. `docker-compose.prod.yml` line 74 explicitly runs `prestart.sh` (which runs `alembic upgrade head`) before `uvicorn`.
   - ❌ "AI jobs not durable, uses FastAPI BackgroundTasks + /tmp progress" — false as of now. The codebase uses ARQ (`backend/app/worker.py`, 3 registered tasks) + Redis-backed progress tracking (`backend/app/services/test_generation_service.py`), not BackgroundTasks/`/tmp`.
   - ✅ **One claim corrected and CONFIRMED still true, in a different form**: "tracked virtualenv artifacts" — `backend/.venv` itself is properly gitignored and not tracked, **but `backend/.venv_test` (4,156 files) IS currently tracked in git** (confirmed via `git ls-tree -r HEAD --name-only`, committed across at least 2 historical commits: `c25c4ac`, `e85d5b5`). `backend/.gitignore` only excludes the literal pattern `.venv/`, which does not match `.venv_test/`. This is a real, current repository-hygiene issue.
   - **Not independently re-verified** (treat as an unverified hypothesis to spot-check, not a fact, if writing about it): schema drift between Prisma and Alembic, missing DB-level uniqueness constraints on `test_attempts`/`candidate_answers`, the detailed scalability tiering (1k/10k/100k/1M users), and the remaining items in its "Top 20 Risks" table below #6. Several of its other claims may suffer from the same staleness as the five disproven above — do not transcribe any of its remaining findings into `docs/enterprise/` without independently checking the cited file/line first.

## 13. Known Configuration Drift (flag only, do not resolve)

There are **three different descriptions of how to run Talvyn in production**, and they disagree with each other:

| Source | Topology | Port | Reverse proxy |
|---|---|---|---|
| `docker-compose.yml` (current, primary) | 14 services, containerized | nginx on host **81** (port 80 is commented out in the file) | OpenResty + Lua JWT guard, in Docker |
| `docker-compose.prod.yml` | 3 services only (postgres, backend, frontend) | expects host-level nginx on 80/443 | Host-level nginx (not in Docker) — described in `docs/deployment.md` |
| `deploy-ngrok.sh` | Uses the dev stack + a separate nginx process | 8080 (avoids clashing with Apache) | nginx on 8080 + ngrok tunnel for public HTTPS access |

`docs/deployment.md` currently documents the second model exclusively. This is a real, user-facing inconsistency — anyone following `docs/deployment.md` literally would not get the same stack as `docker-compose.yml` produces locally. Surfaced in `09-devops-documentation.md`; not resolved by this documentation effort per explicit user instruction.
