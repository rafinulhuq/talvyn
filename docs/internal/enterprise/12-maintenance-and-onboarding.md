# Talvyn — Maintenance Handbook & 30-Minute Onboarding Guide

> Numbers and enumerations in this file are cited from `docs/enterprise/_facts.md` (the
> source of truth for `docs/enterprise/*`). If anything here disagrees with `_facts.md`,
> `_facts.md` is correct.

This file has two parts: a **maintenance handbook** (how to safely change Talvyn) and a
**30-minute onboarding guide** (what to read/run, in order, on your first day). Read the
onboarding guide first if you're brand new; use the handbook as a reference afterward.

---

## Part 1 — Maintenance Handbook

### How to add a new feature

Talvyn's layering is consistent across the whole backend: **routes** in
`backend/app/api/v1/*.py` are thin — they parse/validate the request and call into
**services** in `backend/app/services/*.py`, which hold all business logic (DB queries,
Ollama calls, Redis caching, ARQ enqueueing). There are 13 service files (`_facts.md` §4):
`attempt_service.py`, `email_service.py`, `embedding_service.py`, `evaluation_service.py`,
`export_service.py`, `file_service.py`, `invitation_service.py`, `jd_service.py`,
`ollama_service.py`, `parser_service.py`, `skill_extraction_service.py`,
`test_generation_service.py`, `test_service.py`. If you're adding logic and aren't sure
where it goes, it goes in a service — not in the route handler.

On the frontend, pages live under `frontend/src/app/`, reusable UI lives under
`frontend/src/components/{admin,candidate,ui}/`, and all backend communication goes
through one of two paths: `frontend/src/lib/api/*.ts` (axios, client components, via the
`/api/proxy/` route) or `frontend/src/lib/serverFetch.ts` (native `fetch`, server
components, ISR-cached). See `docs/developer-guide.md` § "Frontend — Next.js" for which
one to use where.

**The cross-cutting cost worth naming explicitly:** whenever a feature touches data that
crosses the backend/frontend boundary, you maintain the *same shape* in three to four
places by hand:

1. SQLAlchemy model (`backend/app/db/models/`)
2. Pydantic schema (`backend/app/schemas/`)
3. TypeScript type (`frontend/src/types/`)
4. Sometimes also `frontend/prisma/schema.prisma` (see "known Prisma/Alembic
   consideration" below)

None of these are generated from each other. There is no OpenAPI-to-TypeScript codegen
step in this repo and no shared schema package. If you add a field to the Pydantic
response schema and forget the matching TypeScript type, you won't get a compile error —
you'll get a silent `undefined` in the UI, or a TypeScript type that lies about what the
API actually returns. This is a real, ongoing maintenance cost in this codebase, not a
hypothetical one — budget time for it on every feature that adds/changes a field, and
grep for the field name across all three locations before considering the change done.

### How to add a new API endpoint

Concrete steps, in the order `docs/developer-guide.md` § "Adding a new endpoint" already
documents (see that section for the exact 4-step checklist) — expanded with real file
references:

1. **Pydantic schema** — add request/response models to the matching file in
   `backend/app/schemas/` (e.g. `backend/app/schemas/evaluation.py` for evaluation
   responses).
2. **Route** — add the handler to the right domain file in `backend/app/api/v1/`. There
   are 7 route files mapping to 48 total endpoints (`_facts.md` §1): `health.py` (2),
   `jd.py` (6), `tests.py` (12), `invitations.py` (7), `attempts.py` (7),
   `evaluation.py` (12), `stats.py` (2).
3. **Service function** — add the actual logic to the matching service in
   `backend/app/services/`. Routes should stay thin.
4. **If it triggers Ollama work**, add a task wrapper in `backend/app/worker.py` and
   enqueue via `arq_pool` rather than calling Ollama directly from the route — see
   `docs/developer-guide.md` § "Key Architectural Decisions" ("Why ARQ for Ollama jobs").
5. **Frontend API client method** — add it to the matching file in
   `frontend/src/lib/api/` (8 files: `client.ts`, `serverFetch.ts`, `jd.ts`, `tests.ts`,
   `attempts.ts`, `invitations.ts`, `evaluation.ts`, `health.ts` — `_facts.md` §5).
6. **Frontend TS type** — add the matching type to `frontend/src/types/`.

**Route-ordering gotcha (real, currently mitigated with a comment):**
`backend/app/api/v1/evaluation.py` lines 129–131 contain this comment immediately before
the literal-path routes:

```python
# IMPORTANT: These literal-path routes MUST be registered before /{attempt_id}.
# FastAPI matches routes in registration order; /{attempt_id} would otherwise
# ...
```

FastAPI/Starlette matches routes in the order they're registered, not by specificity. A
literal path like `/leaderboard/{jd_id}` or `/system-report/{jd_id}` must be declared
*before* a catch-all parameterized route like `/{attempt_id}`, or the catch-all will
intercept requests meant for the literal route (e.g. a request for
`/evaluation/leaderboard/abc` would get parsed as `attempt_id="leaderboard"` if
`/{attempt_id}` were registered first). `evaluation.py` currently gets this right and
documents why — but it's a footgun for every new endpoint you add to that file (or any
file with a mix of literal and parameterized sub-paths). When adding a new route, check
where it sits relative to existing `/{param}` routes in the same file before assuming
order doesn't matter.

### How to add a new database table

1. Add the SQLAlchemy model to `backend/app/db/models/` (12 existing models live here,
   one file generally covering a related group of tables — see `_facts.md` §2).
2. Generate the migration. The actual command, confirmed from both
   `docs/developer-guide.md` and `future-improvements.md` (P4-4):

   ```bash
   docker exec talvyn_backend alembic revision --autogenerate -m "describe change"
   ```

3. **Review the generated migration file** in `backend/alembic/versions/` before
   applying it — autogenerate can miss things (e.g. it won't autogenerate the PL/pgSQL
   function or extension-creation statements that two of the five existing migrations
   contain; those were hand-written, see `_facts.md` §9).
4. Apply it:

   ```bash
   docker exec talvyn_backend alembic upgrade head
   ```

5. Restart the backend if it isn't already picking up the new schema (migrations also run
   automatically via `backend/prestart.sh` on container restart):

   ```bash
   docker compose restart backend
   ```

**Known Prisma/Alembic dual-schema-ownership consideration — confirmed scope.**
`docs/developer-guide.md` states "Alembic owns all schema changes... Frontend reads
`frontend/prisma/schema.prisma`... must stay in sync." Reading `frontend/prisma/schema.prisma`
directly confirms this is **not** scoped to just the `users` table — it defines all 12
models that Alembic also manages (`User`, `JobDescription`, `JdExtractedData`, `Test`,
`Question`, `Candidate`, `Invitation`, `TestAttempt`, `CandidateAnswer`, `Evaluation`,
`SuspiciousEvent` — `QuestionFeedback` is the one model from `_facts.md` §2 not present in
the Prisma schema at all). This means:

- Prisma's copy of the schema is **already missing fields** that later Alembic migrations
  added — e.g. `Evaluation` in `schema.prisma` has no `embedding`, `evaluation_level`,
  `improvement_suggestions`, `suitable_role`, or `skill_breakdown` columns, and `Question`
  has no `code_language`/`code_starter` columns, even though Alembic migrations
  `c7e2d4f8a1b3` and `db7cdbbfd2a8` (`_facts.md` §9) added exactly these to the real
  database. The Prisma client currently in use does not know these columns exist.
- This is real, currently-existing schema drift, not a hypothetical risk. Because Prisma
  is only used for typed reads in Next.js server components (per `docs/developer-guide.md`),
  it doesn't break anything today — but anyone trying to read `evaluation.embedding` or
  `question.codeLanguage` via Prisma will get `undefined`, not a clear error.
- **Practical rule:** any new column on `JdExtractedData`, `Test`, `Question`,
  `CandidateAnswer`, or `Evaluation` should also be added to `schema.prisma` and followed
  by `docker exec talvyn_frontend npx prisma generate` (per
  `docs/developer-guide.md` § "Schema migration workflow" step 5) if any frontend server
  component will ever need to read that field. If no frontend code reads it, it's lower
  priority but still worth doing for consistency — don't let the drift grow further.

### How to add a new frontend page

1. Create `page.tsx` under the correct route group: admin pages go under
   `frontend/src/app/(admin)/dashboard/...`, candidate-facing test pages go under
   `frontend/src/app/test/[token]/...` (separate layout, no sidebar — per
   `docs/developer-guide.md` § "Page routing").
2. **If it's an admin page**, add a nav entry to
   `frontend/src/components/admin/Sidebar.tsx` — pages don't automatically appear in
   navigation just by existing under `(admin)/dashboard/`.
3. **Decide server vs. client component.** Per `docs/developer-guide.md`: server
   components (no `"use client"`) use `serverFetch.ts` and benefit from Next.js ISR
   (`revalidate: 30`); client components use `apiClient` (axios via `/api/proxy/`) and are
   for interactive UI. Default to server component unless you need interactivity —
   `serverFetch` gets you caching and request deduplication for free.
4. **Add `loading.tsx`** in the same directory if the page does server-side data
   fetching. There are 11 loading/error/not-found boilerplate files already in the repo
   (`_facts.md` §5) — follow their pattern of pixel-matching skeletons rather than a
   generic spinner (see `future-improvements.md` NEW-2 for the rationale: instant
   shell render via React Suspense streaming instead of a blank screen).

### How to deploy changes

See `docs/deployment.md` for the full walkthrough (server prep, Docker, Ollama, env vars,
HTTPS). One thing to flag before following it: per `_facts.md` §13, there are **three**
different documented/scripted ways to run Talvyn in production, and they disagree —
`docker-compose.yml` (14 containerized services behind OpenResty on port 81),
`docker-compose.prod.yml` (3 services, expects host-level nginx on 80/443), and
`deploy-ngrok.sh` (dev stack + nginx on 8080 + an ngrok tunnel). **`docs/deployment.md`
currently documents only the second model** (`docker-compose.prod.yml` + host nginx) — it
does not describe the `docker-compose.yml` topology you get by default when running
`./start.sh` locally. Know which topology you're actually deploying before following the
doc literally; see `docs/enterprise/09-devops-documentation.md` for more detail on the
drift (it is flagged there, not resolved).

### Common Pitfalls

- **Route ordering in `evaluation.py`** — covered above. Literal paths before
  `/{attempt_id}`-style catch-alls, in registration order.
- **`test_sequential_generation` defaults to sequential, not parallel** — verified
  current and accurate. `backend/app/config.py` line 75 sets
  `test_sequential_generation: bool = True`, and `backend/.env.hardware` also sets
  `TEST_SEQUENTIAL_GENERATION=true`. The `asyncio.gather()` parallel-generation code from
  `future-improvements.md` P1-1 still exists and is used when this flag is `False`, but
  the documented reasoning (also in `docs/developer-guide.md` § "Key Architectural
  Decisions") is that most real deployments run `OLLAMA_NUM_PARALLEL=1` because a single
  GPU/CPU can't actually serve 3 concurrent generations — sending 3 requests at once just
  means requests 2 and 3 burn their own timeout budget idling in Ollama's queue. Don't
  "fix" this by flipping the flag without first confirming the target machine has
  `OLLAMA_NUM_PARALLEL > 1` set and the VRAM to back it.
- **Never hardcode `OLLAMA_MODEL` in `docker-compose.yml`'s `environment:` block**
  (`future-improvements.md` S4-1, a real bug that shipped and was fixed). Docker Compose's
  `environment:` always wins over `env_file:`. `start.sh` auto-detects GPU VRAM and writes
  the correct model into `backend/.env.hardware`, loaded via `env_file:`. A hardcoded
  `OLLAMA_MODEL=gemma3:12b` under `environment:` silently overrides that and breaks
  smaller-VRAM machines with `Model 'gemma3:12b' not found in Ollama`. Both
  `docker-compose.yml` and `docs/developer-guide.md` now carry explicit comments warning
  against re-adding this — read them before touching that block.
- **Forgetting to rebuild Docker images after adding a dependency.** Confirmed from
  `docker-compose.yml` comments (lines 178–179): the frontend service mounts
  `./frontend:/app` for hot-reload, but `/app/node_modules` and `/app/.next` are
  **anonymous volumes** specifically so the image's installed `node_modules` isn't
  shadowed by your host's (possibly absent or stale) `node_modules`. This means adding an
  npm package to `package.json` and just restarting the container will **not** install it
  — the anonymous volume still has the old `node_modules` baked into the image layer.
  Same logic applies to Python packages in `requirements.txt`: per
  `docs/developer-guide.md` § "Rebuilding after package changes", you must run
  `docker compose build backend worker && docker compose up -d backend worker`. For the
  frontend, rebuild the image (`docker compose build frontend`) after a `package.json`
  change — restart alone is not sufficient.
- **`docker compose restart` vs. `docker compose up -d`** — per `future-improvements.md`
  S4-1, `restart` does not pick up `docker-compose.yml` file changes (env var edits,
  volume changes, etc.); you need `up -d <service>` to recreate the container.

### Technical Debt & Known Limitations

- **`backend/.venv_test` is committed to git** — 4,156 files, confirmed via
  `git ls-tree -r HEAD --name-only`, present across at least two historical commits
  (`_facts.md` §12). `backend/.gitignore` only excludes the literal pattern `.venv/`,
  which does not match `.venv_test/`. This bloats clone size and repo history for no
  benefit — it should be removed from git and the `.gitignore` pattern broadened (e.g. to
  `.venv*/`).
- **Three-topology deployment drift** — see "How to deploy changes" above and
  `_facts.md` §13. `docs/deployment.md` only documents one of the three real ways this
  app is run. This is flagged, not resolved, by design (per explicit prior instruction
  recorded in `_facts.md`).
- **Zero frontend tests.** `_facts.md` §6 confirms no Jest/Vitest/Playwright/Cypress
  config exists anywhere under `frontend/`. The CI `frontend-checks` job (`_facts.md` §7)
  runs lint, type-check, and build — but no test execution, because there's nothing to
  run. Backend has 213 tests across 11 files (in-memory SQLite); frontend has none. Any
  frontend regression (broken form, broken SSE handling, broken bulk-invite CSV parsing)
  is currently only caught by manual testing or a user report.
- **`create-admin.sh` is likely redundant given automatic seeding.** Since
  `future-improvements.md` S4-3, `frontend/prisma/seed.ts` automatically and idempotently
  creates the default admin (`acmeai@Talvyn.com`) on every container start via
  `frontend/scripts/start-dev.sh`. `create-admin.sh` (a standalone bash script supporting
  `--local`/`--docker`/`--prod` modes, custom email/password/role, and a custom
  `ADMIN_DATABASE_URL` override) still exists at the repo root and is more
  flexible/manual — useful for creating a *second* admin or resetting a password outside
  the default seed, but redundant for the common "give me an admin account" case the seed
  already covers automatically. Worth an explicit comment in the script (or its `--help`
  text) framing it as "manual override / additional admin," not the primary onboarding
  path, so a future contributor doesn't assume it's required setup.
- **Large service modules.** `wc -l backend/app/services/*.py` shows real size
  concentration:

  | File | Lines |
  | --- | --- |
  | `evaluation_service.py` | 1,174 |
  | `attempt_service.py` | 905 |
  | `test_generation_service.py` | 804 |
  | `invitation_service.py` | 674 |
  | `jd_service.py` | 664 |

  `evaluation_service.py` at 1,174 lines is the largest file in the backend by a wide
  margin (the next-largest, `attempt_service.py`, is 905) and combines MCQ auto-scoring,
  parallel Ollama-based open-ended grading, score aggregation/override endpoints support,
  DOCX export triggering, and `find_similar_evaluations()` (pgvector). It is the single
  riskiest file to make a confident change in without reading it end-to-end first.

### Refactoring Opportunities

1. **Split `evaluation_service.py` (1,174 lines) by concern.** It currently does at least
   four distinct things: MCQ scoring, Ollama-based open-ended evaluation, score
   aggregation/admin-override support, and pgvector similarity search
   (`find_similar_evaluations()`, added in `future-improvements.md` S2-9). Splitting the
   pgvector similarity code and the admin-override/verify-scores logic into their own
   modules (e.g. `evaluation_similarity_service.py`, kept thin since it's opt-in and
   currently inert by default) would shrink the core file and make the
   always-active grading path easier to review in isolation from the optional
   embeddings feature.
2. **Close the Prisma/Alembic drift identified above**, at minimum for the columns
   already missing from `schema.prisma` (`Evaluation.embedding`, `evaluation_level`,
   `improvement_suggestions`, `suitable_role`, `skill_breakdown`; `Question.codeLanguage`,
   `Question.codeStarter`) and the wholly-absent `QuestionFeedback` model. Either bring
   `schema.prisma` current, or add an explicit comment/CI check that fails when Alembic
   models diverge from `schema.prisma` so the drift doesn't silently keep growing.
3. **Resolve `backend/.venv_test` in git.** A one-line fix
   (`git rm -r --cached backend/.venv_test` + broaden `.gitignore` to `.venv*/`) with a
   real, measurable benefit (clone size, history size) and effectively zero risk.
4. **Add a minimal frontend test layer**, even narrow in scope. Given zero frontend tests
   currently exist, the highest-value first slice is probably not full E2E coverage but a
   handful of unit/component tests around the highest-risk client logic already flagged
   elsewhere in this codebase's own docs: `useAutoSave.ts` (bulk-save batching logic,
   `future-improvements.md` P2-2), the CSV parsing in `BulkInviteForm.tsx`, and the
   `EventSource`/SSE handling in `GenerateTestsButton.tsx` — all three are non-trivial
   client-side logic with no automated safety net today, sitting in a CI pipeline
   (`_facts.md` §7) that otherwise only lints/type-checks/builds the frontend.

---

## Part 2 — 30-Minute Onboarding Guide

### 1. What to read first (in order)

1. **This file** (`docs/enterprise/12-maintenance-and-onboarding.md`) — you're here.
2. **`docs/enterprise/00-executive-summary.md`** — what Talvyn is and who uses it, in
   plain language (it's a hiring tool: upload a JD → AI generates 3 tests → admin approves
   → candidates take the test via a magic link → AI grades it → admin reviews/overrides).
3. **`docs/enterprise/02-system-architecture.md`** — the technical architecture: how the
   14 Docker services (`_facts.md` §8) fit together, the request flow through
   Nginx/OpenResty → Next.js → FastAPI → Postgres/Redis/Ollama, and the ARQ background-job
   pattern.
4. **`docs/developer-guide.md`** — keep this open as a working reference once you start
   touching code; it has the exact commands for local setup, migrations, and common
   operations referenced throughout this handbook.

### 2. Architecture overview

Talvyn is a Next.js 15 (App Router, TypeScript) admin/candidate frontend and a FastAPI
(Python 3.12, async SQLAlchemy) backend, both behind an OpenResty (Nginx + Lua) reverse
proxy that does a fast structural JWT check before any request reaches Python. The
frontend talks to the backend through a server-side Next.js proxy route
(`/api/proxy/[...path]`) that injects an internal shared secret so it never reaches the
browser; candidates use a separate, simpler magic-link/HMAC-token auth model with no
account. Heavy AI work (JD skill extraction, test generation, evaluation grading) runs
through Ollama (a local LLM, Gemma 3) via an ARQ background worker process — never
directly inside an API request handler — so a 15-minute generation job never blocks the
web server. PostgreSQL (with the pgvector extension, used only if explicitly enabled) is
the single source of truth for data; Redis backs caching, rate limiting, and cross-worker
progress tracking. See `docs/enterprise/02-system-architecture.md` for diagrams and the
full request-flow breakdown.

### 3. How to run locally

```bash
git clone <repo-url> && cd Talvyn
cp .env.example .env
cp frontend/.env.local.example frontend/.env.local
# set NEXTAUTH_SECRET and INTERNAL_API_SECRET (same value) in both .env files — see
# docs/developer-guide.md "Local Setup" for exact generation commands
./start.sh
```

`./start.sh` auto-detects your GPU/CPU, writes `backend/.env.hardware` (model choice,
timeouts, question counts), starts Ollama natively on the host, and brings up all Docker
services. **Access the app at `http://localhost` — Nginx listens on host port 81 in the
primary `docker-compose.yml` topology** (`_facts.md` §13; note port 80 is commented out in
the compose file). Default admin login is auto-seeded:
`acmeai@Talvyn.com` / `acmeai@r2026p#`. Use `./stop.sh` to shut down
(`--wipe-db` for a full reset).

### 4. Important modules to know

- **Backend services** — all business logic lives in the 13 files under
  `backend/app/services/` listed in `_facts.md` §4. `evaluation_service.py` (1,174 lines)
  and `attempt_service.py` (905 lines) are the two largest and handle the most
  business-critical paths (grading and candidate test-taking, respectively) — read those
  two first if you'll be working anywhere near scoring or the candidate exam flow.
- **Frontend API client layer** — 8 files under `frontend/src/lib/api/`
  (`_facts.md` §5): `client.ts` (axios instance for client components),
  `serverFetch.ts` (native fetch for server components, ISR-cached), plus one file per
  domain (`jd.ts`, `tests.ts`, `attempts.ts`, `invitations.ts`, `evaluation.ts`,
  `health.ts`). Any new frontend-to-backend call should go through one of these, not a
  one-off `fetch`/`axios` call inline in a component.
- For deeper detail on both: `docs/enterprise/03-codebase-analysis.md` (file-by-file
  breakdown) and `docs/enterprise/02-system-architecture.md` (how they fit the bigger
  request-flow picture).

### 5. Development workflow

- Branch off `main`, make your change following the relevant "How to add a..." section
  in Part 1 above.
- Run the backend test suite locally before pushing — 213 tests across 11 files,
  in-memory SQLite (`_facts.md` §6):

  ```bash
  docker exec talvyn_backend pytest tests/ -v
  ```

- **CI (`.github/workflows/ci.yml`) runs two jobs on every push/PR to `main`**
  (`_facts.md` §7): `backend-tests` (Python 3.12, `pytest tests/ -x -q` against in-memory
  SQLite) and `frontend-checks` (Node 20, `npm ci`, Prisma generate, lint, type-check,
  build). **There is no frontend test execution in CI** (none exist yet — see Technical
  Debt above) and **no E2E job, no deployment job, and no migration-against-Postgres
  check** — passing CI does not guarantee your Alembic migration actually applies cleanly
  against real Postgres; test that manually with `alembic upgrade head` against a Postgres
  instance before merging schema changes.
- If you touched any Pydantic schema or SQLAlchemy model, re-check the
  schema/type/Prisma duplication points from Part 1 before opening your PR.

### 6. Deployment workflow

See `docs/enterprise/09-devops-documentation.md` for the CI/CD and infra overview, and
`docs/deployment.md` for the step-by-step production deployment walkthrough. Remember the
three-topology caveat from Part 1 — confirm which of the three (`docker-compose.yml`,
`docker-compose.prod.yml`, or `deploy-ngrok.sh`) matches your actual target environment
before following any single doc literally.
