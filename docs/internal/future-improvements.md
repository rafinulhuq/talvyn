# Talvyn — Future Improvements & Performance Fixes

> Generated: 2026-05-25  
> Last updated: 2026-06-21  
> Source: Full codebase bottleneck analysis + implementation log  
> To apply any of these: paste the relevant section into Claude Code and say "implement this improvement"
>
> **2026-06-18 audit:** every item in this file was individually re-checked against the
> live codebase (grep for the actual function/file/config named in each entry, not just
> trusting the existing status marker). All 50 items are confirmed ✅ DONE. A few entries
> had stale `❌ TODO` headers left over from before they were implemented in a later
> session — those are now corrected with a note explaining what superseded them.

---

## Status Legend

| Symbol  | Meaning                                           |
|---------|---------------------------------------------------|
| ✅ DONE | Implemented and verified in the running container |
| ❌ TODO | Not yet implemented                               |

---

## How to Use This File

Each improvement is self-contained. You can give Claude Code one section at a time.  
They are ordered by **priority** — fix the top ones first for maximum impact.

---

## Recently Implemented Product Feature — Public Assessment Links

### ✅ DONE — Share one public assessment link with many candidates

**Goal:**
Admins should be able to create one public link for a JD's approved tests, share
that link broadly, and still track each candidate separately.

**Implementation status:**
Implemented in the public assessment link feature set:

- `backend/app/db/models/public_link.py`
- `backend/app/api/v1/public_links.py`
- `backend/app/services/public_link_service.py`
- `backend/alembic/versions/b4c6f0a1d8e2_add_public_assessment_links.py`
- `frontend/src/components/admin/PublicLinkSection.tsx`
- `frontend/src/app/apply/[slug]/page.tsx`
- `frontend/src/app/api/public/[...path]/route.ts`

**Important design rule:**
The public link should identify only the assessment. It must not be the private
candidate test token. When a candidate opens the public link, they should enter
their name and email. The backend then creates or reuses a `Candidate` and
creates a unique private invitation token, then redirects the candidate to:

```text
https://acmeTalvyn.vercel.app/tests/<unique-private-token>
```

**Implemented flow:**

```text
Admin creates public assessment link for a JD with approved tests
    → Candidate opens /apply/<slug>
    → Candidate enters full name + email
    → Backend creates/reuses candidate
    → Backend creates unique private invitation/token
    → Candidate is redirected to /tests/<unique-private-token>
    → Results remain tied to that individual candidate
```

**Why not share one private magic token?**

- Candidate identity cannot be trusted without collecting name/email.
- Attempts/results would be mixed together.
- The link could not be truly one-time-use.
- One candidate could submit on another candidate's behalf.

**Notes for future hardening:**

- Add UI controls for expiry and max registrations if admins need to set them
  without using the API directly.
- Add recruiter-facing reporting for public-link conversion rate.
- Consider email verification before redirecting if public links are shared on
  high-traffic job boards.

---

## 🔴 PRIORITY 1 — Critical (Do These First)

---

### ✅ DONE — [P1-1] Parallelize Test Generation (3× Speed Improvement)

**Problem:**  
`backend/app/services/test_generation_service.py` generates 3 tests **sequentially** in a `for` loop.
Each test takes 2–6 min via Ollama → total = 6–18 min. The docker-compose already sets
`OLLAMA_NUM_PARALLEL=3`, so Ollama can handle 3 concurrent requests.

**Files changed:**

- `backend/app/services/test_generation_service.py`

**What was done:**  
In `generate_tests_for_jd()`, replaced the sequential `for` loop with `asyncio.gather()` for all 3
Ollama calls. Results are then persisted sequentially (DB session is not concurrency-safe).

**Result:** Test generation dropped from 6–18 min to 2–6 min (1 test's time) — **when**
`test_sequential_generation=False` and `OLLAMA_NUM_PARALLEL>1`.

> **Later correction (verified 2026-06-18):** `test_sequential_generation` defaults to
> `True` in `app/config.py`, and the codebase now runs **sequentially by default** — see
> `docs/architecture.md` § "Why sequential test generation (not parallel)". Most real
> deployments run `OLLAMA_NUM_PARALLEL=1` (a single GPU/CPU can't actually serve 3
> concurrent generations), so sending 3 requests at once just means request #2 and #3
> idle in Ollama's queue burning their own timeout budget before they even start.
> The `asyncio.gather()` path from this item is still in the code and used when
> `test_sequential_generation=False` (multi-GPU / `OLLAMA_NUM_PARALLEL>1` setups).

---

### ✅ DONE — [P1-2] Add Missing Database Indexes

**Problem:**  
No explicit indexes on hot-query foreign key columns. Every lookup on `jd_id`, `token_hash`,
`attempt_id`, `invitation_id` was a full table scan.

**Files changed:**

- `backend/app/db/models/job_description.py`
- `backend/app/db/models/test.py`
- `backend/app/db/models/candidate.py`
- `backend/app/db/models/attempt.py`
- `backend/app/db/models/evaluation.py`

**What was done:**  
Added `__table_args__` with `Index(...)` to all 5 models covering all hot-query columns.

**Result:** All per-attempt, per-test, per-JD lookups go from O(n) scan to O(log n) index seek.

---

### ✅ DONE — [P1-3] Fix Next.js Caching — Replace axios with native fetch in Server Components

**Problem:**  
All server-side data fetching used `axios` (`apiClient`). Next.js ISR (`export const revalidate = 30`)
and request deduplication only work with the native `fetch()` API — axios bypasses it entirely.

**Files changed:**

- `frontend/src/lib/api/serverFetch.ts` — new server-side fetch helper
- `frontend/src/app/(admin)/dashboard/jds/page.tsx`
- `frontend/src/app/(admin)/dashboard/jds/[id]/page.tsx`
- `frontend/src/app/(admin)/dashboard/jds/[id]/tests/page.tsx`
- `frontend/src/app/(admin)/dashboard/jds/[id]/tests/[testId]/page.tsx`
- `frontend/src/app/(admin)/dashboard/jds/[id]/invite/page.tsx`
- `frontend/src/app/(admin)/dashboard/candidates/page.tsx`
- `frontend/src/app/(admin)/dashboard/results/page.tsx`

**What was done:**  
Created `serverFetch.ts` using native `fetch()` with `next: { revalidate, tags }`. Migrated all
server components from `apiClient.get()` to `serverFetch()`. Used React `cache()` to deduplicate
`generateMetadata` + page component fetches within the same render cycle.

**Result:** ISR (`revalidate: 30`) now actually works. Double backend calls on JD detail page eliminated.

---

### ✅ DONE — [P1-4] Cache NextAuth Session in Proxy to Avoid Per-Request Overhead

**Problem:**  
`frontend/src/app/api/proxy/[...path]/route.ts` called `getServerSession(authOptions)` on every
proxied request, running JWT + session callbacks and allocating a full session object each time.

**Files changed:**

- `frontend/src/app/api/proxy/[...path]/route.ts`

**What was done:**  
Replaced `getServerSession(authOptions)` with `getToken({ req, secret })` from `next-auth/jwt`.
`getToken()` only decrypts the cookie and verifies the HMAC — no callbacks, no object allocation.

**Result:** Proxy overhead on every autosave, heartbeat, and status poll reduced to a pure in-process
crypto operation.

---

## 🟠 PRIORITY 2 — High Impact, Low Effort

---

### ✅ DONE — [P2-1] Use a Persistent httpx Client for Ollama (Connection Pooling)

**Problem:**  
`ollama_service.py` created a new `httpx.AsyncClient` on every Ollama call — 10+ TCP connection
setups per candidate (3 generation + 7 evaluation calls).

**Files changed:**

- `backend/app/services/ollama_service.py`
- `backend/app/main.py`

**What was done:**  
Added module-level `_http_client: httpx.AsyncClient` initialized in FastAPI `lifespan` startup
and closed on shutdown. `_post_once` reuses the persistent client; fallback path kept for unit tests.

**Result:** No TCP connection overhead per Ollama call. Connections are reused.

---

### ✅ DONE — [P2-2] Fix Autosave to Use Bulk Endpoint Instead of N Individual Requests

**Problem:**  
`useAutoSave.ts` sent one API request per dirty question ID — `N` requests per autosave cycle.
A bulk endpoint (`POST /attempts/{id}/bulk-save`) already existed on the backend.

**Files changed:**

- `frontend/src/hooks/useAutoSave.ts`

**What was done:**  
Replaced `Promise.all(toSave.map(...saveAnswer))` with a single `attemptsApi.bulkSave()` call.

**Result:** N proxy + DB calls → 1 call per autosave cycle, regardless of how many answers changed.

---

### ✅ DONE — [P2-3] Replace SELECT+INSERT Upsert with PostgreSQL ON CONFLICT

**Problem:**  
`attempt_service.py` did SELECT then INSERT/UPDATE = 2 DB round trips per answer save.
On a 7-question bulk save that was 14 DB operations instead of 7.

**Files changed:**

- `backend/app/services/attempt_service.py`

**What was done:**  
Replaced both `_upsert_answer` (single) and `bulk_save_answers` (multi-row) with
`pg_insert(...).on_conflict_do_update(index_elements=["attempt_id", "question_id"], ...)`.
Explicitly set `is_auto_scored=False` and `updated_at=now` since ORM-level defaults don't
fire on raw SQL.

**Result:** Answer saves go from 2 DB round trips to 1. Bulk save is a single statement.

---

### ✅ DONE — [P2-4] Parallelize Open-Ended Question Evaluation

**Problem:**  
`evaluation_service.py` evaluated open-ended answers sequentially — up to 6 sequential Ollama
calls with `OLLAMA_NUM_PARALLEL=3` sitting idle.

**Files changed:**

- `backend/app/services/evaluation_service.py`

**What was done:**  
Replaced sequential `for` loop in `_evaluate_open_ended()` with `asyncio.gather()`.
Added `time.monotonic()` timing and structured log with `count` + `elapsed_seconds`.

**Result:** Evaluation time drops from (N × avg_ollama_time) to avg_ollama_time.

---

### ✅ DONE — [P2-5] Fix docker-compose to Not Run npm install on Every Container Restart

**Problem:**  
`docker-compose.yml` ran `npm install && npm run dev` on every container restart (30–120s startup).

**Files changed:**

- `frontend/Dockerfile.dev` (new file)
- `docker-compose.yml`

**What was done:**  
Created `Dockerfile.dev` that runs `npm ci` at image build time. `docker-compose.yml` now uses
`build: { dockerfile: Dockerfile.dev }` and only mounts `src/` and `public/` (not `node_modules`).
An anonymous volume preserves the `.next` compile cache across restarts.

**Result:** Container restart goes from 30–120s to ~2s.

---

### ✅ DONE — [P2-6] Optimize Status Polling — Only Fetch Status Columns

**Problem:**  
`jd_service.py:get_jd_status()` loaded the entire JD row (including `raw_text` 50KB+) plus
`selectinload(extracted_data)` on every 15-second poll during generation.

**Files changed:**

- `backend/app/services/jd_service.py`

**What was done:**  
Replaced full ORM load with column-level `select(JD.id, JD.parse_status, JD.generation_status)`.
`has_extracted_data` and `has_tests` now use `COUNT(*)` subqueries.

**Result:** Status polling loads ~100 bytes instead of 50KB+ on every tick.

---

## 🟡 PRIORITY 3 — Medium Impact

---

### ✅ DONE — [P3-1] Run uvicorn With Multiple Workers + Offload CPU Work to Thread Pool

**Problem:**  
`backend/Dockerfile:33` runs a single uvicorn worker. PDF parsing (`extract_text()` via PyMuPDF)
is CPU-bound and runs directly in the async event loop — blocking all other requests while parsing.

**Files changed:**

- `backend/Dockerfile`
- `backend/app/services/jd_service.py`
- `backend/prestart.sh` (new — runs Alembic migrations before workers start)

**What was done:**
1. `extract_text()` in `parse_jd_background()` now runs via `loop.run_in_executor(None, ...)` —
   CPU-bound PDF/DOCX parsing is offloaded to the thread pool, freeing the event loop.
2. Dockerfile CMD changed to `bash /app/prestart.sh && uvicorn ... --workers 4`.
   Alembic runs once (with DB-level advisory lock) before 4 workers fork — no race condition.

**Result:** PDF parsing no longer blocks the event loop. 4 independent worker processes
handle concurrent requests. Verified: all 4 workers start and API responds healthy.

---

### ✅ DONE — [P3-2] Fix Redundant API Call in JD Detail Page generateMetadata

**Problem:**  
`jds/[id]/page.tsx` made 2 separate FastAPI calls for the same JD — `generateMetadata` and the
page component both fetched `/api/v1/jd/{id}`.

**Files changed:**

- `frontend/src/app/(admin)/dashboard/jds/[id]/page.tsx`

**What was done:**  
Wrapped `serverFetch` in React's `cache()` so both `generateMetadata` and the page component
share the same HTTP response within a render cycle.

**Result:** 2 backend calls → 1 per JD detail page load.

---

### ✅ DONE — [P3-3] Use Adaptive Polling Instead of Hard-Coded 15s Interval

**Problem:**  
`GenerateTestsButton.tsx` polled every 15s for up to 15 min (60 polls). With P1-1 parallel
generation taking 2–6 min, the first 8 polls (first 2 min) were guaranteed wasted.

**Files changed:**

- `frontend/src/components/admin/GenerateTestsButton.tsx`

**What was done:**  
Added `getPollInterval(pollIndex)` function with 3-tier backoff:
- Polls 0–3 (0–2 min): **30 s** — generation never finishes this early
- Polls 4–11 (2–4 min): **15 s** — most likely completion window  
- Polls 12+ (4+ min): **10 s** — overdue, tighten up

Total timeout: 4×30 + 8×15 + 48×10 = **~12 min** (was 15 min).
Also updated the UI copy from "10–15 minutes" to "2–6 minutes" to reflect P1-1.

**Result:** ~50% fewer polling requests in the first 2 minutes. Same responsiveness.

---

### ✅ DONE — [P3-4] Optimize _delete_existing_tests to Use SQL DELETE Instead of ORM Load

**Problem:**  
`test_generation_service.py:_delete_existing_tests()` loaded all Test + Question ORM objects
into memory just to delete them — O(n) Python allocations for a pure delete operation.
`ondelete="CASCADE"` was already defined on the `Question.test_id` FK.

**Files changed:**

- `backend/app/services/test_generation_service.py`

**What was done:**  
Imported `delete as sa_delete` from sqlalchemy. Replaced ORM load + loop with:
```python
result = await db.execute(sa_delete(Test).where(Test.jd_id == jd_id))
deleted_count = result.rowcount
```
The DB CASCADE handles Question deletion automatically. No Python objects loaded.

**Result:** Test deletion goes from loading N+M objects into Python → 1 SQL DELETE statement.

---

### ✅ DONE — [P3-5] Add Redis Cache for Approved Test Data (Candidate-Facing)

**Problem:**  
Every candidate who starts or resumes a test triggers a full DB load of the Test + all its
Questions. For approved tests (which never change), this is redundant work on every start/resume.

**Files changed:**

- `backend/app/services/attempt_service.py`

**What was done:**
Added `_load_test_with_questions_cached(test_id, db)` and
`_load_approved_tests_for_jd_cached(jd_id, db)`, both cache-aside around Redis (shared
Redis instance/client added in S2-1, reused here via `set_redis_client()`). Test +
Questions are serialised to a plain dict (`_serialize_test_to_dict`) and cached under
`test:{test_id}` / `approved_tests:{jd_id}` with a 1-hour TTL — only when
`status == TestStatus.APPROVED` (draft/unapproved tests are never cached, since they
can still change). `_deserialize_test_from_dict` restores enum fields
(`Difficulty`, `TestStatus`, `QuestionType`) onto a `SimpleNamespace` so downstream code
comparing `test.status == TestStatus.APPROVED` works identically to a real ORM object.
Every Redis call is wrapped in a bare `try/except: pass` — a Redis outage degrades to a
normal DB load, it never breaks the candidate flow.

**Result:** Approved test loads served from Redis after the first request — no DB hit per
candidate start/resume for the common case. Verified present in the running codebase
(2026-06-18 audit).

---

## 🔵 PRIORITY 4 — Future Architecture

---

### ✅ DONE — [P4-1] Replace Polling with Server-Sent Events (SSE) for Generation Status

> Superseded by S2-7 further below, which implements this (and gains extra value from
> S2-1's Redis progress + S2-3's ARQ worker). Verified: `app/api/v1/tests.py` has a
> `text/event-stream` route and `GenerateTestsButton.tsx` uses `EventSource`.

**Problem:**  
The frontend polls `/api/v1/jd/{id}/status` every 10–30 seconds while generation runs.
Server-Sent Events push updates only when something actually changes.

**Files to change:**

- `backend/app/api/v1/jd.py` — add SSE endpoint
- `frontend/src/components/admin/GenerateTestsButton.tsx` — use EventSource

**What to do:**  
```python
from fastapi.responses import StreamingResponse

@router.get("/{jd_id}/stream-status")
async def stream_status(jd_id: str, _auth: VerifiedInternal, db: AsyncSession = Depends(get_db)):
    async def generate():
        while True:
            status = await jd_service.get_jd_status(jd_id, db)
            yield f"data: {status.model_dump_json()}\n\n"
            if status.generation_status in ("IDLE", "FAILED", "READY"):
                break
            await asyncio.sleep(3)
    return StreamingResponse(generate(), media_type="text/event-stream")
```

Use `EventSource` in the React component instead of `setInterval`.

**Expected result:** Zero polling overhead. Client is notified within 3 seconds of completion.

---

### ✅ DONE — [P4-2] Move Ollama Background Jobs to a Task Queue (Celery / ARQ)

> Superseded by S2-3 ("Move Ollama Jobs to ARQ Task Queue") further below, which
> implements exactly this. `backend/app/worker.py` exists, `task_parse_jd`/
> `task_extract_skills`/`task_generate_tests` are all enqueued via `arq_pool.enqueue_job(...)`
> in `app/api/v1/jd.py` and `app/api/v1/tests.py` — no route still uses
> `background_tasks.add_task`. (Two stale docstring comments in `jd_service.py` still said
> "via FastAPI BackgroundTasks" — fixed during the 2026-06-18 audit; the actual code was
> already on ARQ.)

**Problem:**  
All Ollama work runs via FastAPI `BackgroundTasks` — same process and event loop as the API.
If a generation job crashes the worker, it takes down API requests too. No retry on restart,
no job persistence, no visibility.

**Stack recommendation:** ARQ (async Redis Queue) — asyncio-native, fits existing stack.

**Expected result:** AI jobs isolated from API process. Jobs survive restarts. Concurrent workers possible.

---

### ✅ DONE — [P4-3] Add Request-Level Rate Limiting to API Endpoints

**Problem:**  
`slowapi` is in `requirements.txt` but is **not configured anywhere** in the codebase.
A single user can spam `/analyze` or `/generate` to queue unlimited Ollama jobs.

**Files changed:**

- `backend/app/core/ratelimit.py` (new — shared limiter with per-user key function)
- `backend/app/main.py` — wired `SlowAPIMiddleware` + `RateLimitExceeded` handler
- `backend/app/api/v1/jd.py` — `@limiter.limit` on `/upload` and `/{id}/analyze`
- `backend/app/api/v1/tests.py` — `@limiter.limit` on `/generate/{jd_id}`
- `backend/app/api/v1/evaluation.py` — `@limiter.limit` on `/trigger`

**What was done:**
Created `app/core/ratelimit.py` with a user-aware key function: keys on `X-Uploader-Id`
header (the authenticated user ID injected by Next.js) rather than IP address, because all
requests to FastAPI come from the same Next.js container IP. Limits applied:
- `POST /jd/upload` — 10/minute
- `POST /jd/{id}/analyze` — 5/minute (Ollama skill extraction)
- `POST /tests/generate/{id}` — 3/minute (3-model parallel generation)
- `POST /evaluation/trigger` — 5/minute (Ollama evaluation pipeline)

**Result:** Protection against accidental or intentional API abuse that would queue excessive Ollama jobs. Returns HTTP 429 with a clean JSON body on limit exceeded.

---

### ✅ DONE — [P4-4] Implement Alembic Migrations Instead of create_all on Startup

**Problem:**  
`backend/app/main.py:83` runs `Base.metadata.create_all` on every startup.
`main.py:92` has a hardcoded `ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS generation_status…`
Any new column added to a model is silently ignored on existing databases.

**Files changed:**

- `backend/alembic/` (new directory — env.py configured for async SQLAlchemy)
- `backend/alembic.ini` (configured, URL read from `DATABASE_URL` env var)
- `backend/alembic/versions/2b330cc211ed_initial_schema.py` (autogenerated from live DB)
- `backend/prestart.sh` (new — runs `alembic upgrade head` before uvicorn starts)
- `backend/Dockerfile` — CMD now calls `prestart.sh` first
- `backend/app/main.py` — removed `create_all`, removed 80 lines of `ALTER TABLE` / index SQL

**What was done:**
Ran `alembic init` inside the container, rewrote `env.py` to use the asyncio bridge
(no psycopg2 needed — reuses asyncpg), autogenerated the initial migration from the live
schema (`alembic revision --autogenerate`), applied it (`alembic upgrade head`), then
cleaned up `main.py` to remove all schema management code. `prestart.sh` now handles
migrations atomically before any worker starts.

To create a future migration after model changes:
```bash
docker exec jd_assessment_backend alembic revision --autogenerate -m "describe change"
docker exec jd_assessment_backend alembic upgrade head
```

**Result:** Versioned, reversible schema migrations. Production-safe deploys. No race condition
with multiple workers. The hardcoded `ALTER TABLE` time-bomb is gone.

---

## 🆕 ADDITIONAL ISSUES — Found in Full Project Scan (2026-05-25)

These issues were **not in the original improvement plan** but were found during a comprehensive
codebase audit.

---

### ✅ DONE — [NEW-1] Credential Leak in Server Logs — auth.ts

**Problem:**  
`frontend/src/lib/auth.ts` had 5 `console.log` statements that printed the user's email address,
password validation results, and user objects on every login attempt. These appeared in Docker logs
and any production log aggregators in plaintext — a security and privacy risk.

**Files changed:**

- `frontend/src/lib/auth.ts`

**What was done:**  
Removed all 5 `console.log` calls from the `authorize()` function. The `debug: process.env.NODE_ENV === "development"` NextAuth option at the bottom of the file already provides framework-level debug output in dev mode — the manual logs were redundant.

**Result:** No PII in production logs.

---

### ✅ DONE — [NEW-2] No `loading.tsx` Files — Pages Show Blank Screen While Fetching

**Problem:**  
No `loading.tsx` files exist anywhere in the app router. Server component pages (JD list,
candidates, results, tests) show a completely blank screen while the server fetches data.
Next.js 15 App Router supports React Suspense streaming — the shell renders instantly and
content streams in — but only if `loading.tsx` is present.

**Files created:**
- `frontend/src/app/(admin)/dashboard/jds/loading.tsx`
- `frontend/src/app/(admin)/dashboard/jds/[id]/loading.tsx`
- `frontend/src/app/(admin)/dashboard/jds/[id]/tests/loading.tsx`
- `frontend/src/app/(admin)/dashboard/jds/[id]/tests/[testId]/loading.tsx`
- `frontend/src/app/(admin)/dashboard/jds/[id]/invite/loading.tsx`
- `frontend/src/app/(admin)/dashboard/candidates/loading.tsx`
- `frontend/src/app/(admin)/dashboard/results/loading.tsx`

**What was done:**  
Created pixel-accurate skeleton UIs for every server-component page. Each skeleton mirrors
the exact layout of its corresponding page: same `max-w-*` wrapper, same header/button placement,
same card structure with `animate-pulse` placeholder blocks. No generic spinners — every
skeleton previews the actual content shape.

**Result:** First byte instant — layout and skeleton visible before data arrives.
Eliminates blank-screen flash on every page navigation.

---

### ✅ DONE — [NEW-3] No `error.tsx` Files — Route Segments Have No Error Boundary

**Problem:**  
No `error.tsx` exists in any route segment. If any server component throws an unhandled error
(network failure, DB timeout, unexpected `null`), the entire page crashes with Next.js's generic
500 error screen. Per-segment error boundaries contain failures and let users retry without
a full page reload.

**Files created:**
- `frontend/src/app/(admin)/dashboard/error.tsx` (catches all /dashboard/* routes)

**What was done:**  
Created a client-component error boundary at the dashboard segment level. Shows the error
message, the server-side `error.digest` ID (useful for support), a "Try again" button that
calls `reset()` to re-render the segment, and a "Dashboard" fallback link. Logs to
`console.error` for dev tools visibility.

**Result:** Errors are contained to the affected segment. Users see a retry button
instead of a blank crash screen.

---

### ✅ DONE — [NEW-4] No `not-found.tsx` — Custom 404 Page Missing

**Problem:**  
The `notFound()` calls scattered across page components fall through to Next.js's built-in
generic 404 page which doesn't match the app's design.

**Files created:**
- `frontend/src/app/not-found.tsx` — global fallback (full-screen, no sidebar)
- `frontend/src/app/(admin)/dashboard/not-found.tsx` — dashboard-scoped (renders inside admin layout with sidebar)

**What was done:**  
Two-tier 404 strategy: the dashboard-scoped file intercepts all `notFound()` calls from page
components (missing JD, test, etc.) and renders inside the admin shell so the sidebar stays
visible. The global file catches truly unknown URLs (typos, old bookmarks) and renders a
full-screen branded page with links to dashboard and login.

**Result:** 404 pages match the app's design system. `notFound()` callers get a contextual
in-layout page; unknown routes get a full-screen fallback.

---

### ✅ DONE — [NEW-5] Hardcoded ALTER TABLE Migration in main.py

**Problem:**  
`backend/app/main.py:92` contains a raw `ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS generation_status TEXT NOT NULL DEFAULT 'IDLE'` executed on every startup. This is the same root cause as P4-4 but is an active time-bomb:
- Adding more columns requires more hardcoded `ALTER TABLE` blocks
- Any column rename or type change cannot be expressed this way
- Duplicate of the P4-4 Alembic migration task — listed separately to highlight the specific dangerous pattern

**Fix:** Covered by P4-4 (Alembic). Remove the `ALTER TABLE` block after the first migration is generated and applied.

---

### ✅ DONE — [NEW-6] No Pagination on Evaluation/Results List Endpoint

**Problem:**  
`backend/app/services/evaluation_service.py:590` uses unbounded `scalars().all()` to fetch all
evaluation results for the admin results page. The JD list endpoint has `page`/`page_size`
pagination; the results endpoint does not. As evaluations accumulate this will return an
ever-growing payload.

**Files to change:**

- `backend/app/services/evaluation_service.py`
- `backend/app/api/v1/evaluation.py`
- `frontend/src/app/(admin)/dashboard/results/page.tsx`

**What to do:**  
Add `page: int = 1, page_size: int = 20` query params to the list endpoint and apply
`.offset((page - 1) * page_size).limit(page_size)` to the query. Return a paginated response
matching the `JobDescriptionListResponse` pattern already used in the JD endpoint.

**Expected result:** Results page scales to thousands of evaluations without degrading.

---

### ✅ DONE — [NEW-7] `openapi_url` Disabled Globally in Production — No Staging Override

**Problem:**  
`backend/app/main.py` sets `openapi_url="/openapi.json" if settings.debug else None`.
This completely hides the OpenAPI docs in any non-debug environment. There is no way to
enable docs for a staging environment without turning on full debug mode.

**Files to change:**

- `backend/app/config.py`
- `backend/app/main.py`

**What to do:**  
Add a separate `show_docs` setting:
```python
# config.py
show_docs: bool = False   # set to True in .env for staging
```
```python
# main.py
openapi_url="/openapi.json" if (settings.debug or settings.show_docs) else None,
```

**Expected result:** OpenAPI docs can be enabled for staging review without enabling full debug mode.

---

## 📋 Implementation Status (Updated)

```
✅ P1-1 — Parallel test generation      (done)
✅ P1-2 — DB indexes                    (done)
✅ P1-3 — Fix Next.js caching           (done)
✅ P1-4 — getToken() in proxy           (done)
✅ P2-1 — Persistent httpx client       (done)
✅ P2-2 — Bulk autosave                 (done)
✅ P2-3 — ON CONFLICT upsert            (done)
✅ P2-4 — Parallel evaluation           (done)
✅ P2-5 — Fix docker npm install        (done)
✅ P2-6 — Slim status polling           (done)
✅ P3-2 — Fix generateMetadata double   (done)
✅ P3-3 — Adaptive polling              (done)
✅ P3-4 — SQL DELETE for tests          (done)
✅ NEW-1 — Remove console.log from auth (done)
✅ NEW-2 — loading.tsx skeleton UI      (done — 7 files)
✅ NEW-3 — error.tsx error boundaries   (done)
✅ NEW-4 — not-found.tsx custom 404     (done — 2 files)

✅ P3-1 — uvicorn workers + thread pool  (done — 4 workers + run_in_executor)
✅ P4-3 — Rate limiting (slowapi)        (done — per-user key, 4 endpoints)
✅ P4-4 — Alembic migrations             (done — prestart.sh + initial migration)
✅ NEW-5 — Remove ALTER TABLE from main.py (done — covered by P4-4)
✅ NEW-6 — Results list pagination       (done — GET /evaluation/ with page/page_size)
✅ NEW-7 — show_docs staging flag        (done — SHOW_DOCS=true env var)

✅ P3-5 — Redis cache for test data      (done — see Session 2 section)
✅ P4-1 — SSE instead of polling         (done — superseded by S2-7)
✅ P4-2 — ARQ task queue                 (done — superseded by S2-3)
```

> This block is the original 2026-05-25 snapshot. The three items below were TODO at
> that time but are done as of later sessions — see their full writeups further down.

---

*Last updated: 2026-05-25 | Analysis by Claude Code*

---

---

# SESSION 2 ADDITIONS — 2026-06-17

> Context: These improvements were identified in a second analysis session focused on
> infrastructure reliability, observability, and production-readiness.
> All tools/services listed below are **100% free and open source — self-hosted on your own server**.
> No paid cloud accounts, no API keys, no usage limits.
>
> **Current stack recap:**
> - Backend: Python FastAPI (async, uvicorn, 4 workers)
> - Frontend: Next.js (TypeScript, Prisma)
> - Database: PostgreSQL 16
> - AI: Ollama (Gemma 3 12B) running natively on host (RTX 3060 Ti), OLLAMA_NUM_PARALLEL=1
> - Deployment: Docker Compose behind a stable domain + reverse proxy (ngrok retired)
> - Email: Resend (prod) / Mailpit (dev)

---

## 🔴 PRIORITY 1 — Real Bugs (Fix These First)

---

### ✅ DONE — [S2-1] Fix Inter-Worker Progress Tracking — Replace /tmp Files with Redis

**Problem (ACTIVE BUG):**
`backend/app/services/test_generation_service.py` uses `/tmp/talvyn_progress/*.json` files
to communicate generation progress between uvicorn workers. With 4 uvicorn workers (added in P3-1),
the worker that *writes* the progress file is almost never the same worker that *reads* it
in response to a polling request. The result: the frontend polls progress and gets stale/missing
data, or the file is partially written when read.

This is the #1 reliability issue in the current codebase.

**Root cause:**
```python
# test_generation_service.py
_PROGRESS_DIR = "/tmp/talvyn_progress"
# "Files instead of a module-level dict because uvicorn runs 4 worker
# processes; each process has its own memory"
```
The comment acknowledges the multi-worker problem but the /tmp solution is fragile:
file writes are not atomic, and /tmp layout can vary across container restarts.

**Files to change:**

- `backend/app/services/test_generation_service.py` — replace `_set_progress` / `_get_progress` with Redis calls
- `backend/app/api/v1/jd.py` — progress endpoint reads from Redis instead of file
- `backend/app/main.py` — init Redis client in lifespan startup/shutdown
- `docker-compose.yml` — add Redis service
- `backend/requirements.txt` — add `redis[asyncio]`

**What to do:**

```yaml
# docker-compose.yml — add this service:
redis:
  image: redis:7-alpine
  container_name: talvyn_redis
  restart: unless-stopped
  ports:
    - "6379:6379"
  command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 10s
    timeout: 5s
    retries: 5
```

```
# backend/requirements.txt — add:
redis[asyncio]==5.2.1
```

```python
# backend/app/main.py — add to lifespan:
import redis.asyncio as aioredis
from app.services import test_generation_service

@asynccontextmanager
async def lifespan(app: FastAPI):
    # existing: init_http_client()
    redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)
    test_generation_service.set_redis_client(redis_client)
    yield
    # existing: close_http_client()
    await redis_client.aclose()
```

```python
# backend/app/config.py — add:
redis_url: str = "redis://localhost:6379"
```

```python
# backend/app/services/test_generation_service.py — replace file functions:
import redis.asyncio as aioredis
import json

_redis: aioredis.Redis | None = None

def set_redis_client(client: aioredis.Redis) -> None:
    global _redis
    _redis = client

async def _set_progress(jd_id: str, step: str, pct: int, detail: str = "") -> None:
    safe = "".join(c for c in jd_id if c.isalnum() or c == "-")
    data = json.dumps({"step": step, "pct": pct, "detail": detail})
    if _redis:
        await _redis.setex(f"progress:{safe}", 3600, data)  # expires 1h

async def _get_progress(jd_id: str) -> dict | None:
    safe = "".join(c for c in jd_id if c.isalnum() or c == "-")
    if _redis:
        raw = await _redis.get(f"progress:{safe}")
        return json.loads(raw) if raw else None
    return None
```

Also update the progress GET endpoint in `jd.py` to call the async `_get_progress()` instead
of reading from the filesystem.

**Expected result:** Progress updates are visible to all 4 uvicorn workers. No more stale
progress reads. Fixes silent "generation stuck at 0%" UX bug under concurrent load.

---

### ✅ DONE — [S2-2] Fix Rate Limiter to Be Redis-Backed (Per-User Global, Not Per-Worker)

**Problem (ACTIVE BUG):**
`backend/app/core/ratelimit.py` uses slowapi with in-memory storage (default). With 4 uvicorn
workers, each worker has its own in-memory counter. A user can make 5 × 4 = 20 requests to
`/analyze` before hitting the limit, because each worker counts independently.

```python
# ratelimit.py — current:
limiter = Limiter(key_func=_key_by_user_or_ip)
# No storage= argument → defaults to in-memory per-process
```

**Files to change:**

- `backend/app/core/ratelimit.py` — add Redis storage backend
- `backend/app/main.py` — pass Redis URL to limiter (after S2-1 Redis is added)

**What to do:**
```python
# backend/app/core/ratelimit.py
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.config import get_settings

def _key_by_user_or_ip(request):
    user_id = request.headers.get("x-uploader-id")
    if user_id and user_id != "00000000-0000-0000-0000-000000000000":
        return f"user:{user_id}"
    return get_remote_address(request)

settings = get_settings()
limiter = Limiter(
    key_func=_key_by_user_or_ip,
    storage_uri=settings.redis_url,   # Redis-backed: limits are global across all workers
)
```

**Expected result:** Rate limits are enforced globally across all 4 workers. A user cannot
bypass limits by hitting different workers.

---

## 🟠 PRIORITY 2 — High Impact Infrastructure

---

### ✅ DONE — [S2-3] Move Ollama Jobs to ARQ Task Queue (Replaces BackgroundTasks)

**Context:** This is an expansion of the existing P4-2 item. ARQ runs on top of Redis (S2-1),
so implement S2-1 first.

**Problem:**
All Ollama work (JD analysis, test generation, evaluation) runs via FastAPI `BackgroundTasks`.
This means:
- Ollama jobs share the same process/event loop as API request handlers
- If the worker crashes mid-generation, the job is lost with no retry
- No way to inspect queued/running/failed jobs
- Under load, background tasks compete with request handling for event loop time

**Stack:** ARQ (Async Redis Queue) — asyncio-native, minimal, fits the existing Python stack.
Do NOT use BullMQ (that is Node.js only). Do NOT use Celery (overkill, requires separate broker config).

**Files to change:**

- `backend/app/worker.py` (new file)
- `backend/app/services/jd_service.py` — enqueue instead of `background_tasks.add_task`
- `backend/app/services/evaluation_service.py` — same pattern
- `docker-compose.yml` — add `worker` service
- `backend/requirements.txt` — add `arq==0.26.1`

**What to do:**

```
# backend/requirements.txt — add:
arq==0.26.1
```

```python
# backend/app/worker.py (new file)
from arq import cron
from app.services.jd_service import parse_jd_background, analyze_jd_background
from app.services.test_generation_service import generate_tests_for_jd
from app.services.evaluation_service import run_evaluation
from app.db.session import get_db_session
from app.config import get_settings

async def startup(ctx):
    from app.services.ollama_service import init_http_client
    init_http_client()

async def shutdown(ctx):
    from app.services.ollama_service import close_http_client
    await close_http_client()

class WorkerSettings:
    functions = [parse_jd_background, analyze_jd_background, generate_tests_for_jd, run_evaluation]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
    max_jobs = 1          # Only 1 Ollama job at a time (OLLAMA_NUM_PARALLEL=1)
    job_timeout = 700     # Match OLLAMA_TIMEOUT_SECONDS
    keep_result = 3600    # Keep results 1h for polling
```

```yaml
# docker-compose.yml — add worker service:
worker:
  build:
    context: ./backend
    dockerfile: Dockerfile
  container_name: talvyn_worker
  restart: unless-stopped
  command: python -m arq app.worker.WorkerSettings
  environment:
    - DATABASE_URL=postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
    - REDIS_URL=redis://redis:6379
    - OLLAMA_BASE_URL=http://host.docker.internal:11434
    - OLLAMA_MODEL=gemma3:12b
  extra_hosts:
    - "host.docker.internal:host-gateway"
  depends_on:
    redis:
      condition: service_healthy
    postgres:
      condition: service_healthy
  env_file:
    - ./backend/.env
```

In `jd_service.py`, replace:
```python
background_tasks.add_task(parse_jd_background, jd_id, ...)
```
with:
```python
await redis.enqueue_job("parse_jd_background", jd_id, ...)
```

**Expected result:** Ollama jobs are isolated from the API process. Jobs survive container
restarts. `max_jobs=1` enforces serial Ollama access matching OLLAMA_NUM_PARALLEL=1.
Failed jobs are logged and retryable.

---

### ✅ DONE — [S2-4] Add GlitchTip for Error Tracking (Self-Hosted Sentry Alternative)

> Verified: `docker-compose.yml` has `glitchtip` + `glitchtip-db` services,
> `backend/app/main.py` calls `sentry_sdk.init(dsn=settings.glitchtip_dsn, ...)` gated
> on `GLITCHTIP_DSN` being set, and `frontend/sentry.client.config.ts` /
> `sentry.server.config.ts` mirror this on the Next.js side.

**What it is:** GlitchTip is an open-source, self-hosted error tracking platform compatible
with the Sentry SDK. It is significantly lighter than self-hosted Sentry (~256MB RAM vs 4GB).

**Why you need it:** Silent failures in the Ollama pipeline (AIResponseParseError exhausted,
retry loops that never succeed, Pydantic validation failures) are currently invisible.
You only know about them when a user reports a problem. GlitchTip captures every unhandled
exception with full stack trace, request context, and user ID.

**Files to change:**

- `docker-compose.yml` — add GlitchTip service + its PostgreSQL DB
- `backend/requirements.txt` — add `sentry-sdk`
- `backend/app/main.py` — init Sentry SDK on startup
- `frontend/package.json` — add `@sentry/nextjs`
- `frontend/next.config.ts` — wrap with Sentry

**What to do:**

```yaml
# docker-compose.yml — add:
glitchtip-db:
  image: postgres:16-alpine
  container_name: talvyn_glitchtip_db
  environment:
    POSTGRES_DB: glitchtip
    POSTGRES_USER: glitchtip
    POSTGRES_PASSWORD: glitchtip_pass
  volumes:
    - glitchtip_db_data:/var/lib/postgresql/data

glitchtip:
  image: glitchtip/glitchtip:latest
  container_name: talvyn_glitchtip
  restart: unless-stopped
  ports:
    - "8080:8080"
  environment:
    - DATABASE_URL=postgresql://glitchtip:glitchtip_pass@glitchtip-db/glitchtip
    - SECRET_KEY=your-random-secret-key-here   # generate with: openssl rand -hex 32
    - EMAIL_URL=consolemail://
    - GLITCHTIP_DOMAIN=http://localhost:8080
    - DEFAULT_FROM_EMAIL=glitchtip@localhost
    - CELERY_WORKER_CONCURRENCY=2
  depends_on:
    - glitchtip-db
```

```
# backend/requirements.txt — add:
sentry-sdk[fastapi]==2.19.2
```

```python
# backend/app/main.py — add at top of file, before app creation:
import sentry_sdk
sentry_sdk.init(
    dsn=settings.glitchtip_dsn,   # set in .env: GLITCHTIP_DSN=http://...@localhost:8080/1
    traces_sample_rate=0.1,        # 10% of requests traced (performance)
    environment="production",
)
```

```python
# backend/app/config.py — add:
glitchtip_dsn: str = ""   # Leave empty to disable
```

After docker compose up, visit http://localhost:8080, create an account, create a project,
copy the DSN into `backend/.env` as `GLITCHTIP_DSN=...`.

**Expected result:** Every unhandled exception in FastAPI and Next.js appears in the GlitchTip
dashboard with full context. Silent Ollama pipeline failures are visible immediately.

---

### ✅ DONE — [S2-5] Replace Docker Volume for Uploads with MinIO Object Storage

> Verified: `docker-compose.yml` has a `minio` service, `backend/app/services/file_service.py`
> has a `_MinioBackend` class used when `STORAGE_BACKEND=s3`, and `requirements.txt` has
> `miniopy-async`. Default remains `STORAGE_BACKEND=local` (Docker volume) — MinIO is
> there as an opt-in alternative, not a hard switch-over, since most self-hosted
> single-server deployments don't need it.

**Problem:**
Uploaded PDF/DOCX files go to a Docker named volume (`uploads_data`). This is fine for a
single-server setup but has these risks:
- Volume data is tied to the Docker daemon on one machine
- No deduplication — same file uploaded twice = stored twice
- No direct URL access — files must be served through FastAPI
- Can't scale to multiple backend instances without shared storage

**What it is:** MinIO is a self-hosted, S3-compatible object storage server. It is
fully free and open source (AGPL-3.0). Your existing code uses `aiofiles` for file I/O —
replacing it with MinIO's async Python client is a contained change.

**Files to change:**

- `docker-compose.yml` — add MinIO service
- `backend/requirements.txt` — add `miniopy-async`
- `backend/app/services/file_service.py` — replace local file read/write with MinIO put/get
- `backend/app/config.py` — add MinIO settings
- `backend/.env.example` — document new env vars

**What to do:**

```yaml
# docker-compose.yml — add:
minio:
  image: minio/minio:latest
  container_name: talvyn_minio
  restart: unless-stopped
  ports:
    - "9001:9000"    # S3 API
    - "9002:9001"    # MinIO web console
  environment:
    - MINIO_ROOT_USER=${MINIO_ROOT_USER:-talvyn_minio}
    - MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD:-talvyn_minio_pass}
  command: server /data --console-address ":9001"
  volumes:
    - minio_data:/data
  healthcheck:
    test: ["CMD", "mc", "ready", "local"]
    interval: 30s
    timeout: 10s
    retries: 3

# Add to volumes section:
# minio_data:
```

```
# backend/requirements.txt — add:
miniopy-async==1.21.1
```

```python
# backend/app/config.py — add:
minio_endpoint: str = "minio:9000"
minio_access_key: str = "talvyn_minio"
minio_secret_key: str = "talvyn_minio_pass"
minio_bucket: str = "Talvyn-uploads"
minio_secure: bool = False   # True in production with HTTPS
```

In `file_service.py`, replace `aiofiles.open()` reads/writes with:
```python
from miniopy_async import Minio

_minio = Minio(settings.minio_endpoint, settings.minio_access_key, settings.minio_secret_key, secure=False)

async def save_upload(filename: str, content: bytes, content_type: str) -> str:
    await _minio.put_object(settings.minio_bucket, filename, io.BytesIO(content), len(content), content_type=content_type)
    return filename

async def load_upload(filename: str) -> bytes:
    response = await _minio.get_object(settings.minio_bucket, filename)
    return await response.read()
```

**Expected result:** Files stored in MinIO survive Docker volume recreation. Web console at
http://localhost:9002 shows all uploaded files. Foundation for multi-instance deployment.

---

## 🟡 PRIORITY 3 — Production-Readiness

---

### ✅ DONE — [S2-6] Add Nginx as Reverse Proxy (Single Entry Point)

> Shipped directly as OpenResty (nginx + LuaJIT) rather than plain nginx, combining this
> with S3-2 (Lua JWT validation) in one piece of work. Verified: `docker-compose.yml` has
> an `nginx` service on port 80 running `openresty/openresty:alpine`, with
> `nginx/nginx.conf` + `nginx/lua/jwt_check.lua` present.

**Problem:**
Currently the stack exposes raw ports directly:
- Frontend: `localhost:3003`
- Backend: `localhost:9000`
- Mailpit: `localhost:8026`

In production this means CORS issues, no SSL, no unified URL, and clients must know
internal port numbers. Nginx as a reverse proxy gives a single entry point on port 80/443.

**Files to change:**

- `nginx/nginx.conf` (new file)
- `docker-compose.yml` — add nginx service, remove direct port exposure from frontend/backend

**What to do:**

```nginx
# nginx/nginx.conf
events { worker_connections 1024; }

http {
    upstream backend  { server backend:8000; }
    upstream frontend { server frontend:3000; }

    server {
        listen 80;

        # Frontend (Next.js)
        location / {
            proxy_pass         http://frontend;
            proxy_set_header   Host $host;
            proxy_set_header   X-Real-IP $remote_addr;
            proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        }

        # Backend API
        location /api/v1/ {
            proxy_pass         http://backend;
            proxy_set_header   Host $host;
            proxy_set_header   X-Real-IP $remote_addr;
            client_max_body_size 20M;   # allow JD file uploads
            proxy_read_timeout 700s;    # match OLLAMA_TIMEOUT_SECONDS
        }

        # Mailpit (dev only)
        location /mailpit/ {
            proxy_pass http://mailpit:8025/;
        }
    }
}
```

```yaml
# docker-compose.yml — add nginx service:
nginx:
  image: nginx:alpine
  container_name: talvyn_nginx
  restart: unless-stopped
  ports:
    - "80:80"
  volumes:
    - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
  depends_on:
    - frontend
    - backend
```

Remove the host port mappings from `frontend` and `backend` services (they're now only
reachable via nginx internally). Keep the direct port on backend for local dev if needed.

**Expected result:** Single entry point at http://localhost. All routing handled by Nginx.
Ready for SSL via Certbot (`certbot --nginx`) when deploying publicly.

---

### ✅ DONE — [S2-7] Replace Polling with Server-Sent Events (SSE) for Generation Progress

> Verified: `backend/app/api/v1/tests.py` has a `GET /progress/{jd_id}/stream` route
> returning `StreamingResponse(..., media_type="text/event-stream")` that reads from
> Redis (S2-1), and `frontend/src/components/admin/GenerateTestsButton.tsx` connects via
> `EventSource` instead of `setInterval`.

**Context:** This is the same as P4-1 (already listed above) but gains additional value
after S2-1 (Redis progress) and S2-3 (ARQ worker) are implemented, because the SSE endpoint
can simply read from Redis rather than polling the DB.

**Problem:**
`GenerateTestsButton.tsx` polls `/api/v1/jd/{id}/status` on a timer (10–30s intervals).
This wastes requests and means the UI can be up to 30 seconds behind the actual state.

**Files to change:**

- `backend/app/api/v1/jd.py` — add `GET /{jd_id}/progress/stream` SSE endpoint
- `frontend/src/components/admin/GenerateTestsButton.tsx` — replace setInterval with EventSource

**Backend:**
```python
from fastapi.responses import StreamingResponse
import asyncio

@router.get("/{jd_id}/progress/stream")
async def stream_progress(jd_id: str, _auth: VerifiedInternal):
    async def generate():
        while True:
            progress = await _get_progress(jd_id)   # reads from Redis (S2-1)
            if progress:
                yield f"data: {json.dumps(progress)}\n\n"
                if progress.get("pct") >= 100:
                    break
            else:
                yield f"data: {json.dumps({'step': 'waiting', 'pct': 0})}\n\n"
            await asyncio.sleep(2)
    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
```

**Frontend:**
```typescript
// Replace setInterval with:
const source = new EventSource(`/api/proxy/jd/${jdId}/progress/stream`)
source.onmessage = (e) => {
    const data = JSON.parse(e.data)
    setProgress(data.pct)
    if (data.pct >= 100) source.close()
}
```

**Expected result:** UI updates within 2 seconds of actual progress change. Zero polling overhead.
The `X-Accel-Buffering: no` header is required when Nginx (S2-6) is in front.

---

## 🔵 PRIORITY 4 — Future / Optional

---

### ✅ DONE — [S2-8] Add Prometheus + Grafana for Metrics

> Verified: `backend/app/main.py` wires up `Instrumentator(...).instrument(app).expose(app)`,
> `docker-compose.yml` has `prometheus` (port 9090) and `grafana` (port 3001) services, and
> `grafana/provisioning/datasources/prometheus.yml` auto-provisions Prometheus as the
> default datasource.

**What it is:** Prometheus scrapes metrics from FastAPI (via `prometheus-fastapi-instrumentator`).
Grafana visualizes them. Both are free and self-hosted via Docker.

**Why:** Once you have real users you need to know: Ollama latency per endpoint, evaluation
success/failure rates, queue depth (after S2-3), DB query times, request throughput.
Without this you're flying blind.

**Files to change:**

- `docker-compose.yml` — add prometheus + grafana services
- `backend/requirements.txt` — add `prometheus-fastapi-instrumentator`
- `backend/app/main.py` — mount metrics endpoint
- `prometheus/prometheus.yml` (new file)

```
# backend/requirements.txt — add:
prometheus-fastapi-instrumentator==7.0.0
```

```python
# backend/app/main.py — add after app creation:
from prometheus_fastapi_instrumentator import Instrumentator
Instrumentator().instrument(app).expose(app, endpoint="/metrics")
```

```yaml
# docker-compose.yml — add:
prometheus:
  image: prom/prometheus:latest
  container_name: talvyn_prometheus
  restart: unless-stopped
  ports:
    - "9090:9090"
  volumes:
    - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
    - prometheus_data:/prometheus

grafana:
  image: grafana/grafana-oss:latest
  container_name: talvyn_grafana
  restart: unless-stopped
  ports:
    - "3001:3000"
  environment:
    - GF_SECURITY_ADMIN_PASSWORD=admin
  volumes:
    - grafana_data:/var/lib/grafana
```

```yaml
# prometheus/prometheus.yml
global:
  scrape_interval: 15s
scrape_configs:
  - job_name: talvyn_backend
    static_configs:
      - targets: ["backend:8000"]
    metrics_path: /metrics
```

**Expected result:** Grafana dashboard at http://localhost:3001 showing all API + Ollama metrics.

---

### ✅ DONE — [S2-9] Add pgvector for Semantic Candidate Matching

**Problem:** Candidates were matched to roles purely by score. There was no way to ask
"find candidates similar to this strong hire."

**Files changed:**

- `docker-compose.yml` — postgres image changed to `pgvector/pgvector:pg16`
- `backend/requirements.txt` — added `pgvector==0.3.6`
- `backend/alembic/versions/db7cdbbfd2a8_add_pgvector_embedding_column.py` (new) —
  `CREATE EXTENSION IF NOT EXISTS vector`, adds nullable `embedding vector(768)` column
  on `evaluations`, plus an HNSW cosine-similarity index
- `backend/app/db/models/_types.py` — new `VectorType` TypeDecorator: native
  `pgvector.sqlalchemy.Vector(dim)` on PostgreSQL, JSON fallback on SQLite (tests)
- `backend/app/db/models/evaluation.py` — `Evaluation.embedding: list[float] | None`
- `backend/app/config.py` — `embedding_enabled: bool = False`,
  `ollama_embedding_model: str = "nomic-embed-text"` (opt-in, off by default)
- `backend/app/services/embedding_service.py` (new) — calls Ollama `/api/embeddings`
  with the dedicated embedding model; every failure mode (disabled, model not pulled,
  Ollama unreachable, malformed response) is logged and swallowed by returning `None`
- `backend/app/services/evaluation_service.py` — `_persist_evaluation()` now generates
  an embedding from the AI summary/strengths/weaknesses/suitable-role text and stores
  it on the `Evaluation` row; new `find_similar_evaluations()` runs a raw-SQL
  `ORDER BY embedding <=> :emb LIMIT :n` cosine-distance query
- `backend/app/schemas/evaluation.py` — `SimilarEvaluationItem`, `SimilarEvaluationsResponse`
- `backend/app/api/v1/evaluation.py` — `GET /evaluation/{attempt_id}/similar`
- `backend/.env.example` — documented `EMBEDDING_ENABLED` / `OLLAMA_EMBEDDING_MODEL`

**What was done:** Embedding generation is fully opt-in (`EMBEDDING_ENABLED=true` +
`ollama pull nomic-embed-text`) and never blocks or fails the evaluation pipeline —
`generate_embedding()` returns `None` on any error and the row is simply stored with
`embedding=NULL`. The similarity endpoint returns an empty list (not an error) whenever
embeddings are disabled or unavailable for that attempt, so the feature is fully inert
until explicitly turned on.

**Result:** `GET /api/v1/evaluation/{attempt_id}/similar` ranks other evaluated candidates
by cosine similarity. Zero impact on existing behaviour when the flag is left off (the
default).

---

## 📋 Full Implementation Status (Session 2)

```
# SESSION 1 (all done — see above for details)
✅ P1-1 — Parallel test generation
✅ P1-2 — DB indexes
✅ P1-3 — Fix Next.js caching
✅ P1-4 — getToken() in proxy
✅ P2-1 — Persistent httpx client
✅ P2-2 — Bulk autosave
✅ P2-3 — ON CONFLICT upsert
✅ P2-4 — Parallel evaluation
✅ P2-5 — Fix docker npm install
✅ P2-6 — Slim status polling
✅ P3-1 — uvicorn workers + thread pool
✅ P3-2 — Fix generateMetadata double fetch
✅ P3-3 — Adaptive polling
✅ P3-4 — SQL DELETE for tests
✅ P4-3 — Rate limiting (slowapi)
✅ P4-4 — Alembic migrations
✅ NEW-1 — Remove console.log from auth
✅ NEW-2 — loading.tsx skeleton UI
✅ NEW-3 — error.tsx error boundaries
✅ NEW-4 — not-found.tsx custom 404
✅ NEW-5 — Remove ALTER TABLE from main.py
✅ NEW-6 — Results list pagination
✅ NEW-7 — show_docs staging flag

# STILL TODO FROM SESSION 1
✅ P3-5 — Redis cache for approved test data    ← done
✅ P4-1 — SSE instead of polling               ← done (see S2-7)

# SESSION 2
✅ S2-1 — Fix /tmp progress tracking → Redis   ← done
✅ S2-2 — Fix rate limiter → Redis-backed       ← done
✅ S2-3 — ARQ task queue for Ollama jobs        ← done
✅ S2-4 — GlitchTip error tracking             ← done
✅ S2-5 — MinIO for file uploads               ← done
✅ S2-6 — Nginx reverse proxy                  ← done (shipped directly as OpenResty, see S3-2)
✅ S2-7 — SSE for generation progress          ← done
✅ S2-8 — Prometheus + Grafana metrics         ← done
✅ S2-9 — pgvector semantic search             ← done (opt-in, EMBEDDING_ENABLED=true)
```

**Everything in this backlog is now done.** S2-9 ships disabled by default since it
requires pulling an extra Ollama model — see the S2-9 entry above for the env vars to turn it on.

**RAM budget for all new services (rough estimates):**
| Service | RAM |
|---|---|
| Redis | ~30 MB |
| ARQ worker | ~80 MB |
| GlitchTip + its DB | ~512 MB |
| MinIO | ~128 MB |
| Nginx | ~5 MB |
| Prometheus | ~64 MB |
| Grafana | ~128 MB |
| **Total new** | **~950 MB** |

All services together add roughly **~1 GB RAM** on top of the existing stack.
Skip GlitchTip if RAM is tight — it's the heaviest single addition.

---

*Last updated: 2026-06-17 | Session 2 additions by Claude Code*

---

---

# SESSION 3 ADDITIONS — 2026-06-17

> Topic: Additional language integrations to improve performance and reliability.
> All options below are **100% free and open source**.
> No new paid services, no cloud accounts, no API keys required.
>
> **Key principle:** These are language-level additions, not new services.
> Ordered by impact vs. implementation effort.

---

## 🔴 PRIORITY 1 — Highest Value, Already In Your Stack

---

### ✅ DONE — [S3-1] PL/pgSQL — Move Score Aggregation Into PostgreSQL

> Implemented as `calculate_evaluation_scores()` in
> `backend/alembic/versions/d9e8f7a6b5c4_add_calculate_evaluation_scores_function.py`,
> exposed via `GET /evaluation/{attempt_id}/verify-scores`. The plan below describes
> the approach taken (signature differs slightly — see the migration for the actual SQL).

**What it is:**
PL/pgSQL is PostgreSQL's built-in procedural language. You already have PostgreSQL — this
adds zero new services, zero new Docker containers, zero new dependencies.

**Problem:**
`backend/app/services/evaluation_service.py` currently:
1. Fetches ALL `QuestionFeedback` rows for an attempt into Python memory
2. Loops through them in Python to calculate totals, percentages, pass/fail
3. Writes back a single summary `Evaluation` row

This is 2 DB round trips + Python computation on every evaluation. As the evaluations table
grows, the Python loop becomes the bottleneck. The database can do this in one call, on the
server, with no data transfer.

**Files to change:**

- New Alembic migration — creates the PL/pgSQL function
- `backend/app/services/evaluation_service.py` — replace Python aggregation with a `SELECT calculate_evaluation_scores(attempt_id)` call

**What to do:**

Create a new Alembic migration file:
```bash
# Run inside the backend container:
docker exec talvyn_backend alembic revision --autogenerate -m "add_evaluation_score_function"
```

Then edit the generated migration to add the function:

```python
# In the new migration file — upgrade():
op.execute("""
    CREATE OR REPLACE FUNCTION calculate_evaluation_scores(p_attempt_id UUID)
    RETURNS TABLE (
        total_questions     INT,
        mcq_count           INT,
        open_ended_count    INT,
        mcq_score           NUMERIC,
        open_ended_score    NUMERIC,
        total_score         NUMERIC,
        mcq_passed          BOOLEAN,
        open_ended_passed   BOOLEAN,
        overall_passed      BOOLEAN
    )
    LANGUAGE plpgsql
    AS $$
    DECLARE
        v_passing_marks NUMERIC;
    BEGIN
        -- Get passing marks from the test linked to this attempt
        SELECT t.passing_marks INTO v_passing_marks
        FROM test_attempts ta
        JOIN tests t ON t.id = ta.test_id
        WHERE ta.id = p_attempt_id;

        RETURN QUERY
        SELECT
            COUNT(*)::INT                                                    AS total_questions,
            COUNT(*) FILTER (WHERE question_type = 'MCQ')::INT              AS mcq_count,
            COUNT(*) FILTER (WHERE question_type = 'OPEN_ENDED')::INT       AS open_ended_count,

            COALESCE(AVG(score) FILTER (WHERE question_type = 'MCQ'), 0)    AS mcq_score,
            COALESCE(AVG(score) FILTER (WHERE question_type = 'OPEN_ENDED'), 0) AS open_ended_score,
            COALESCE(AVG(score), 0)                                          AS total_score,

            COALESCE(AVG(score) FILTER (WHERE question_type = 'MCQ'), 0)
                >= v_passing_marks                                           AS mcq_passed,
            COALESCE(AVG(score) FILTER (WHERE question_type = 'OPEN_ENDED'), 0)
                >= v_passing_marks                                           AS open_ended_passed,
            COALESCE(AVG(score), 0) >= v_passing_marks                      AS overall_passed

        FROM question_feedback
        WHERE attempt_id = p_attempt_id;
    END;
    $$;
""")

# downgrade():
op.execute("DROP FUNCTION IF EXISTS calculate_evaluation_scores(UUID);")
```

In `evaluation_service.py`, replace the Python aggregation loop with:
```python
from sqlalchemy import text

result = await db.execute(
    text("SELECT * FROM calculate_evaluation_scores(:attempt_id)"),
    {"attempt_id": str(attempt_id)}
)
scores = result.mappings().one()

# scores.total_score, scores.mcq_passed, scores.overall_passed etc.
# are now available directly — no Python loop needed
```

**Expected result:**
- Score aggregation goes from 2 DB round trips + Python loop → 1 DB call
- Zero data transfer for intermediate rows (all computation happens inside PostgreSQL)
- Scales to thousands of evaluations with no Python memory impact
- Function is reusable from any future service or reporting query

---

## 🟠 PRIORITY 2 — Add After Nginx (S2-6)

---

### ✅ DONE — [S3-2] Lua (OpenResty) — JWT Validation and Rate Limiting at the Proxy Layer

> Implemented directly as part of S2-6 — `nginx/nginx.conf` + `nginx/lua/jwt_check.lua`,
> running `openresty/openresty:alpine` in `docker-compose.yml`. S2-6 and S3-2 shipped
> as one piece of work rather than two separate steps.

**What it is:**
OpenResty is Nginx with an embedded Lua runtime. It is free, open source (BSD), and runs
as a drop-in replacement for the plain Nginx container added in S2-6.

**Why — and why it matters here:**
Currently all JWT validation and rate limiting happens inside FastAPI (Python). This means
every single request — including ones with an obviously invalid or expired token — travels
all the way through the Docker network to the FastAPI container before being rejected.

With OpenResty + Lua, invalid tokens and rate-limited requests are **rejected at the proxy**
in ~1ms, before touching Python at all. This is the pattern used by Kong, Cloudflare, and
most high-throughput API gateways.

**Prerequisite:** Implement S2-6 (Nginx) first. Then replace the `nginx:alpine` image with
`openresty/openresty:alpine`.

**Files to change:**

- `docker-compose.yml` — change nginx image to `openresty/openresty:alpine`
- `nginx/nginx.conf` — add Lua blocks for JWT check and rate limiting
- `nginx/lua/jwt_check.lua` (new file)
- `backend/requirements.txt` — no change needed (Lua runs inside OpenResty, not Python)

**What to do:**

```yaml
# docker-compose.yml — change nginx service image:
nginx:
  image: openresty/openresty:alpine   # was: nginx:alpine
  container_name: talvyn_nginx
  restart: unless-stopped
  ports:
    - "80:80"
  volumes:
    - ./nginx/nginx.conf:/usr/local/openresty/nginx/conf/nginx.conf:ro
    - ./nginx/lua:/usr/local/openresty/nginx/lua:ro
  depends_on:
    - frontend
    - backend
```

```lua
-- nginx/lua/jwt_check.lua
-- Validates the NextAuth JWT cookie before passing to FastAPI.
-- Rejects requests with missing/malformed tokens immediately at the proxy.
-- Note: this is a structural check only (base64 decode + JSON parse).
-- Full HMAC verification requires the NEXTAUTH_SECRET — add if needed.

local cjson = require "cjson"
local b64 = require "ngx.base64"

local function reject(status, msg)
    ngx.status = status
    ngx.header["Content-Type"] = "application/json"
    ngx.say(cjson.encode({ detail = msg }))
    ngx.exit(status)
end

-- Only guard API routes that require auth
local uri = ngx.var.uri
if not uri:match("^/api/v1/") then
    return  -- pass through non-API routes
end

-- Allow public routes
local public = {
    ["/api/v1/health"] = true,
    ["/api/v1/attempts"] = true,   -- candidate-facing, auth handled differently
}
if public[uri] then return end

-- Check for session cookie (NextAuth sets next-auth.session-token)
local cookie = ngx.var.cookie_session
    or ngx.var["cookie_next-auth.session-token"]
    or ngx.var["cookie___Secure-next-auth.session-token"]

if not cookie then
    reject(401, "Authentication required")
end

-- Basic structural check — token must be 3 dot-separated base64 segments
local parts = {}
for part in cookie:gmatch("[^.]+") do
    parts[#parts + 1] = part
end
if #parts ~= 3 then
    reject(401, "Malformed session token")
end
-- Request passes — continue to FastAPI
```

```nginx
# nginx/nginx.conf — add to /api/v1/ location block:
location /api/v1/ {
    access_by_lua_file  /usr/local/openresty/nginx/lua/jwt_check.lua;

    # Per-IP rate limiting at the proxy (coarse guard — FastAPI still does per-user limiting)
    limit_req zone=api burst=20 nodelay;

    proxy_pass         http://backend;
    proxy_set_header   Host $host;
    proxy_set_header   X-Real-IP $remote_addr;
    client_max_body_size 20M;
    proxy_read_timeout   700s;
}

# Add to http block:
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;
```

**Expected result:**
- Unauthenticated requests rejected at the proxy in <1ms — FastAPI never touched
- Per-IP coarse rate limiting at the proxy layer (FastAPI's per-user Redis limits still apply inside)
- Drop-in replacement for Nginx — no changes to FastAPI or Next.js needed

---

## 🔵 PRIORITY 3 — Future / When You Need It

---

### ✅ DONE — [S3-3] WebAssembly (Rust → Wasm) — Client-Side Document Parsing

**Files changed:**

- `frontend/wasm-parser/Cargo.toml`, `frontend/wasm-parser/src/lib.rs` (new) — Rust
  crate exporting `extract_pdf_text()` (via the pure-Rust `pdf-extract` crate) and
  `extract_docx_text()` (via `zip` + `quick-xml`, walking WordprocessingML paragraphs
  and tables in document order — mirrors `backend/app/services/parser_service.py`
  exactly, including the `" | "` cell-join and blank-line-between-blocks formatting)
- `frontend/wasm-parser/build.sh` (new) — builds with `cargo build --target
  wasm32-unknown-unknown --release` + `wasm-bindgen --target web`, copies the compiled
  `.wasm` into `frontend/public/wasm/` and the JS/`.d.ts` glue into `frontend/src/lib/wasm/`
- `frontend/package.json` — added `"build:wasm": "bash wasm-parser/build.sh"`
- `frontend/.gitignore` — ignores `wasm-parser/target/` and `wasm-parser/pkg/`
  (build intermediates); the final `public/wasm/*.wasm` + `src/lib/wasm/*.js,*.d.ts`
  ARE committed so contributors never need the Rust toolchain to run the app
- `frontend/src/lib/wasm/jdParser.ts` (new) — `extractTextClientSide(file)` loads the
  wasm module (explicit `fetch('/wasm/talvyn_parser_bg.wasm')`, no bundler magic
  needed since the file lives in `public/`) and returns extracted text or `null`
- `frontend/src/components/admin/JdUploadForm.tsx` — tries client-side extraction
  before upload; sends the result as an `extracted_text` form field alongside the file
- `frontend/src/lib/api/jd.ts`, `frontend/src/app/api/jd/upload/route.ts` — pass
  `extracted_text` through the upload call and the Next.js proxy route
- `backend/app/services/parser_service.py` — exposed `clean_text()` (public wrapper
  around the existing `_clean_text()`) so client-supplied text gets the same
  normalisation as server-extracted text
- `backend/app/services/jd_service.py` — new `finalize_client_extracted_jd()`: if the
  cleaned client text is non-empty, marks the JD `DONE` immediately with that text
  and returns `True`; returns `False` (caller falls back to the normal ARQ parse job)
  if the text was empty/unusable
- `backend/app/api/v1/jd.py` — `POST /jd/upload` accepts an optional `extracted_text`
  form field; only enqueues `task_parse_jd` when client-side extraction wasn't
  provided or didn't produce usable text

**What was done:** Chose the *fast-path-with-fallback* design over fully removing
server-side parsing: the original file is still uploaded and stored (no change to the
storage/audit contract), but the slow PyMuPDF/python-docx CPU work is skipped whenever
the browser already produced usable text. If WASM fails to load, the file type isn't
supported, or extraction errors (corrupt file, scanned PDF with no text layer), the
upload silently falls back to the existing server-side parse + poll flow — nothing
breaks, candidates/admins never see a difference except sometimes the JD shows "Ready"
instantly instead of after a few seconds of polling.

Verified end-to-end against this repo's own real PDF (`docs/Talvyn-ai-model-report.pdf`,
10,153 chars extracted in ~10-80ms) and real DOCX (`docs/talvyn_Codebase_Analysis_Report.docx`,
42,549 chars, tables included) files, loading the actual committed `public/wasm/` +
`src/lib/wasm/` artifacts in Node — output matched the Python extractor's format exactly.

**Result:** Compiled WASM bundle is ~1.1MB (`opt-level = "z"`, `lto = true`, `strip =
true`) — loaded once per browser session and cached. Zero raw PDF/DOCX parsing CPU time
on the backend for the common case; `parser_service.py`/PyMuPDF/python-docx remain as
the always-correct fallback, never removed.

---

## 📋 Full Implementation Status (Session 3)

```
# SESSION 3 — all done:
✅ S3-1 — PL/pgSQL score aggregation
✅ S3-2 — Lua/OpenResty JWT + rate limit
✅ S3-3 — WebAssembly client-side parsing
```

**Language additions summary (all sessions):**

| Language | Where | New Service? | Effort | Status |
|---|---|---|---|---|
| PL/pgSQL | PostgreSQL score functions | No | Low | ✅ DONE |
| Lua (OpenResty) | Nginx proxy layer auth | Replaces Nginx | Medium | ✅ DONE |
| WebAssembly (Rust) | Browser PDF parsing | No | High | ✅ DONE |

**What was ruled out and why:**

| Language | Reason NOT added |
|---|---|
| Go | Adds new service but OLLAMA_NUM_PARALLEL=1 means no real concurrency gain; ARQ (S2-3) solves the same problem in Python |
| Rust (microservice) | PyMuPDF already uses C (MuPDF) under the hood — no meaningful speed gain |
| Java/Kotlin | JVM overhead, heavy containers, no advantage over existing Python stack |
| Elixir | ARQ + Redis solves the concurrency/queue problem without a new language |
| C/C++ | asyncpg and PyMuPDF already delegate to C extensions — already benefiting |

---

*Last updated: 2026-06-17 | Session 3 additions by Claude Code*

---

---

## SESSION 4 — Bug Fixes & Infrastructure Hardening — 2026-06-17

> Topic: Three production bugs fixed, persistent admin account added, and frontend startup
> stabilised. No new services — all changes are to existing configuration and code.

---

## 🔴 PRIORITY 1 — Active Bugs Fixed

---

### ✅ DONE — [S4-1] Fix OLLAMA_MODEL Override — docker-compose environment Silently Wins Over .env.hardware

**Problem (ACTIVE BUG):**
`docker-compose.yml` had `- OLLAMA_MODEL=gemma3:12b` hardcoded under both the `backend` and
`worker` `environment:` blocks. Docker Compose rule: `environment:` always takes precedence
over `env_file:`. `start.sh` auto-detects GPU VRAM and writes the correct model to
`backend/.env.hardware`, loaded via `env_file:` — but the hardcoded value in `environment:`
silently overrode it on every container start. The result: the backend tried to use
`gemma3:12b` on a 4 GB VRAM machine that only had `gemma3:4b` installed, causing every
analysis and test generation to fail with `Model 'gemma3:12b' not found in Ollama`.

**Files changed:**

- `docker-compose.yml` — removed `- OLLAMA_MODEL=gemma3:12b` from both `backend` and `worker`
  `environment:` blocks; added comments explaining why it must stay absent

**What was done:**

Removed the hardcoded `OLLAMA_MODEL` line from both service `environment:` blocks. Added
explanatory comments so future contributors don't re-add it:

```yaml
# backend and worker environment: blocks now read:
- OLLAMA_BASE_URL=http://host.docker.internal:11434
# OLLAMA_MODEL comes from backend/.env.hardware (written by start.sh).
# DO NOT set it here — environment: overrides env_file: and would ignore
# the hardware auto-detection.
```

**Note:** `docker compose restart` does NOT pick up compose file changes. Must use
`docker compose up -d backend worker` to recreate containers after this change.

**Result:** `OLLAMA_MODEL` is now always read from `.env.hardware` as intended.
`gemma3:4b` on medium-profile machines, `gemma3:12b` on large-profile, etc.

---

### ✅ DONE — [S4-2] Fix ARQ Job Timeout — 700s Was Per-Request Limit, Not Per-Job Limit

**Problem (ACTIVE BUG):**
`backend/app/worker.py` had `job_timeout = 700` hardcoded — the same value as
`OLLAMA_TIMEOUT_SECONDS`. This was a misunderstanding of what `job_timeout` covers:

- `OLLAMA_TIMEOUT_SECONDS` = timeout for **one single Ollama HTTP request**
- `job_timeout` = total allowed time for the **entire ARQ job** (all 3 tests)

Each test generation job runs 3 tests sequentially. Each test can need up to
`1 initial + max_retries (3) = 4` Ollama calls. At 600s per call, the worst case is
`4 × 3 × 600 = 7200s`. With `job_timeout = 700`, almost every generation job was
terminated by ARQ before it could finish, appearing in logs as:
`700.01s ! task_generate_tests failed, TimeoutError`

**Root cause discovered from logs:**

- Test 1: 3 Ollama calls × ~150s = ~410s (needed correction retries)
- Test 2: ~145s
- Test 3: started its 2nd call when the 700s wall hit → job killed

**Files changed:**

- `backend/app/worker.py` — replaced `job_timeout = 700` with a dynamic computation

**What was done:**

```python
def _compute_job_timeout() -> int:
    s = get_settings()
    # job_timeout covers the ENTIRE 3-test generation job, not a single Ollama request.
    # Each test may need (1 initial + max_retries correction) Ollama calls,
    # each capped at ollama_timeout_seconds.
    # Formula: 3 tests × (1 + max_retries) calls × per-request timeout + 120s overhead
    return s.ollama_timeout_seconds * (1 + s.ollama_max_retries) * 3 + 120

class WorkerSettings:
    ...
    job_timeout = _compute_job_timeout()
    # For gemma3:4b (600s timeout, 3 max_retries): 600 × 4 × 3 + 120 = 7320s ≈ 2h
```

**Result:** Job timeout now correctly covers the worst-case 3-test batch. Generation jobs
that legitimately take 15–30 minutes no longer time out prematurely.

---

## 🟠 PRIORITY 2 — Infrastructure Hardening

---

### ✅ DONE — [S4-3] Persistent Admin Account — Seeded on Container Start, Survives Git Pushes

**Problem:**
The admin account (`acmeai@Talvyn.com`) had to be created manually with a one-off script
after each fresh deployment. On a new machine or after a `--wipe-db`, the account was gone
and the app was inaccessible until someone ran the create-admin script. This was
undocumented and easy to forget.

**Files changed:**

- `frontend/prisma/seed.ts` (new file) — idempotent admin seeder
- `frontend/scripts/start-dev.sh` (new file) — runs seed then starts Next.js
- `frontend/package.json` — added `"prisma": { "seed": "tsx prisma/seed.ts" }`
- `docker-compose.yml` — frontend `command` overridden to run startup script;
  `DATABASE_URL` added to frontend environment; `depends_on` updated to wait for postgres

**What was done:**

`seed.ts` creates the admin account if it does not already exist (idempotent — safe to run
on every container start):

```typescript
const SEED_ADMINS = [
  { email: 'acmeai@Talvyn.com', name: 'ACME AI Admin',
    password: 'acmeai@r2026p#', role: Role.ADMIN },
];

async function main() {
  for (const admin of SEED_ADMINS) {
    const existing = await prisma.user.findUnique({ where: { email: admin.email } });
    if (existing) { console.log(`[seed] Admin already exists: ${admin.email}`); continue; }
    const passwordHash = await bcrypt.hash(admin.password, 12);
    await prisma.user.create({ data: { email: admin.email, name: admin.name,
                                       passwordHash, role: admin.role } });
    console.log(`[seed] Admin created: ${admin.email}`);
  }
}
```

`start-dev.sh` is the frontend container entrypoint:

```sh
#!/bin/sh
set -e
echo "[startup] Seeding default admin..."
npx prisma db seed
echo "[startup] Starting Next.js..."
exec npm run dev
```

**Result:** Admin account is created automatically on every fresh stack or `--wipe-db`
restart. No manual intervention needed. Adding the account to git means it works on any
machine without any setup step.

---

### ✅ DONE — [S4-4] Fix Frontend Crash Loop — Remove Prisma Schema Sync from Startup

**Problem:**
After the admin seeding work was added, the frontend container entered a crash loop on every
startup. Root cause: the startup script originally called `prisma migrate deploy`, which
requires a `_prisma_migrations` table. The database was created with `prisma db push`
(no migration tracking), so `migrate deploy` raised:

```
Error: P3005 — The database schema is not empty. Read more about how to baseline
an existing production database.
```

A second attempt with `prisma db push --accept-data-loss` also crashed:

```
cannot drop index invitations_token_hash_key because constraint
invitations_token_hash_key on table invitations requires it
```

**Resolution — two steps:**

Step 1 (one-off fix): Baseline the existing migration in the running DB so Prisma knows it
was already applied:

```bash
docker compose run --rm --no-deps frontend sh -c \
  "npx prisma migrate resolve --applied 20260522053630_init"
# Output: Migration 20260522053630_init marked as applied.
```

Step 2 (permanent fix): Remove ALL schema management from the startup script. Alembic
(P4-4) already owns schema changes on the backend side; the frontend only needs Prisma
Client to be generated (done at Docker image build time), not schema sync at runtime.

Final `start-dev.sh` (no schema sync, only seed + start):

```sh
#!/bin/sh
set -e
npx prisma db seed
exec npm run dev
```

**Files changed:**

- `frontend/scripts/start-dev.sh` — removed `prisma migrate deploy` and `prisma db push`
  calls; final script is seed + Next.js only

**Result:** Frontend starts cleanly on every container start. Crash loop eliminated.
Schema management is Alembic's responsibility; startup script only seeds data.

---

## 📋 Full Implementation Status (Session 4)

```
# SESSION 4 — Bug fixes and hardening (all done):
✅ S4-1 — OLLAMA_MODEL override fix (docker-compose environment: vs env_file:)
✅ S4-2 — ARQ job_timeout fix (700s → computed: ollama_timeout × (1 + retries) × 3 + 120)
✅ S4-3 — Persistent admin seeding (frontend/prisma/seed.ts + scripts/start-dev.sh)
✅ S4-4 — Frontend startup script stabilised (no schema sync, seed only)

# CUMULATIVE STATUS — all sessions:
# Session 1: P1-1 through P1-4, P2-1 through P2-6, P3-1 through P3-4,
#             P4-3, P4-4, NEW-1 through NEW-7 — all ✅ DONE
# Session 2: S2-1 through S2-9 — all ✅ DONE (S2-9 is opt-in, off by default)
# Session 3: S3-1, S3-2, S3-3 — all ✅ DONE
# Session 4: S4-1 through S4-4 — ✅ DONE
# Session 5: S5-1 through S5-7 — ✅ DONE (see below)
```

**Every item in this backlog is implemented.** The only thing left is operator choice:
S2-9 (pgvector similarity) stays disabled until `EMBEDDING_ENABLED=true` is set and
`nomic-embed-text` is pulled — everything else is on by default.

---

*Last updated: 2026-06-18 | Session 4 additions by Claude Code*

---

---

## SESSION 5 — Frontend Audit Fixes — 2026-06-19

> Context: A frontend audit (type-check, build, lint, `npm audit`, manual review of the
> candidate exam flow) surfaced two live candidate-facing bugs, a non-functional lint
> setup, a stale dependency tree with 27 known CVEs, and a missing auto-respect for
> `prefers-reduced-motion`. All items below were verified with `npm run type-check`,
> `npm run build`, and `npm run lint` after the change.

---

### ✅ DONE — [S5-1] Fix Candidate Timer Showing 00:00 and Auto-Submitting Within 1 Second

**Problem (ACTIVE BUG):**
`frontend/src/hooks/useTestTimer.ts` seeded its `remaining` state from `initialSeconds`
only once, via `useState(initialSeconds)`. The exam page (`frontend/src/app/test/[token]/exam/page.tsx`)
mounts with `initialSeconds = 0` and only learns the real value after `getState()` resolves —
by which point the hook's `remaining` state was already frozen at `0` from the first render.
The moment the timer became `enabled`, the next 1-second tick computed `Math.max(0, 0 - 1) = 0`,
treated that as expiry, and called `onExpire()` — auto-submitting the candidate's test
within a second of the exam page becoming active, every time.

**Files changed:**
- `frontend/src/hooks/useTestTimer.ts`

**What was done:**
Added a `prevInitialSecondsRef` + effect that resyncs `remaining`, `remainingRef`, and
`expiredRef` whenever `initialSeconds` actually changes (i.e. once, right after `getState()`
resolves) instead of only seeding state on mount.

**Result:** The timer now starts from the real server-provided remaining time instead of `0`.

---

### ✅ DONE — [S5-2] Stop Faking a Successful Submission When the Network Call Fails

**Problem (ACTIVE BUG):**
In `doSubmit()` (exam page), a failed `attemptsApi.submit()` call was caught and the page
showed the post-submit completion screen anyway, with the message "Submitted (network error
on confirmation)." The candidate's answers were never actually persisted as a submission on
the backend, but the UI told them they were done.

**Files changed:**
- `frontend/src/app/test/[token]/exam/page.tsx`

**What was done:**
On submit failure, `hasSubmittedRef` is reset (so retry is possible), no fake `submitResult`
is set, and a `submitError` banner is shown with a "Retry submit" button that re-runs
`doSubmit()` with the same `auto_submitted` flag. Autosave already persists answers
continuously, so nothing is lost while the candidate retries.

**Result:** Candidates only see the completion screen once the backend actually confirms
the submission. A failed submit is recoverable instead of silently misleading.

---

### ✅ DONE — [S5-3] Remove Redundant JWT Verification in Middleware for `/api/proxy/*`

**Problem:**
`frontend/src/middleware.ts` ran `getToken()` on every request, including every
`/api/proxy/*` call — even though the middleware never uses that token for anything on proxy
paths (it only gates `/dashboard` and `/login`). `proxyRequest()` itself already calls
`getToken()` to authenticate. Since this route is hit on every autosave (10s), heartbeat
(30s), and status poll (15s), every one of those requests verified the JWT twice.

**Files changed:**
- `frontend/src/middleware.ts`

**What was done:**
Added `/api/proxy` to `PUBLIC_PREFIXES` so middleware passes those requests straight through
without touching `getToken()`. The route's own auth check is unaffected and still rejects
unauthenticated requests (verified live: `GET /api/proxy/health` without a session cookie
still returns `401`).

**Result:** One JWT verification per proxied request instead of two, with no change in
auth behavior.

---

### ✅ DONE — [S5-4] Add HSTS Header

**Files changed:**
- `frontend/next.config.ts`

**What was done:**
Added `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` alongside
the existing `X-Frame-Options` / `X-Content-Type-Options` / `Referrer-Policy` /
`Permissions-Policy` headers.

**Note:** A Content-Security-Policy header was deliberately **not** added in this pass — it
needs a careful enumeration of every legitimate script/style/connect source (Sentry/GlitchTip
ingest, fonts, the FastAPI origin, Next.js inline scripts) and a wrong policy would silently
break the app in production. Left as a follow-up requiring dedicated testing.

---

### ✅ DONE — [S5-5] Make `npm run lint` Actually Work

**Problem:**
No ESLint config file existed despite `eslint`, `eslint-config-next`, and the
TypeScript ESLint plugins being installed and `package.json`'s `lint` script calling
`next lint`. Running it opened Next's interactive "no ESLint config found" setup prompt,
so lint was not usable in CI.

**Files changed:**
- `frontend/eslint.config.mjs` (new)
- `frontend/package.json` — added `@eslint/eslintrc` (bridges the legacy
  `eslint-config-next` share config into ESLint's flat config format)
- `frontend/next.config.ts` — added `eslint: { ignoreDuringBuilds: true }`

**What was done:**
Added a flat config using `FlatCompat` to extend `next/core-web-vitals` + `next/typescript`.
This immediately surfaced ~50 pre-existing lint errors across the codebase (mostly
`@typescript-eslint/no-explicit-any` and `react/no-unescaped-entities`) that predate this
change. Rather than mass-editing ~20 unrelated files in a single pass, lint was decoupled
from the production build (`ignoreDuringBuilds: true`) so the existing build keeps passing
while `npm run lint` becomes a real, separately-run signal for catching new issues and
paying down the backlog incrementally.

**Result:** `npm run lint` runs and reports real findings. `npm run build` is unaffected by
the pre-existing backlog. No new lint errors were introduced by any other change in this
session (verified by re-running lint after every edit).

**Backlog (not done — needs a dedicated pass):** ~50 pre-existing lint errors, concentrated in
`components/admin/*` (`AnalyzeJdButton`, `GenerateTestsButton`, `InviteForm`, `JdUploadForm`,
`QuestionEditor`, `TestCard`, `TestEditorPanel`) and a handful of `lib/api/*` files — mostly
`no-explicit-any` and a few `react/no-unescaped-entities` / `prefer-const`.

---

### ✅ DONE — [S5-6] Patch Next.js to Close 1 Critical + Most High/Moderate CVEs

**Problem:**
`npm audit --omit=dev` reported 27 vulnerabilities (1 critical, 3 high, 23 moderate),
almost all against Next.js itself (RSC RCE, middleware auth bypass, cache poisoning, DoS,
request smuggling, etc.) — `next` was pinned to the exact version `15.1.3`, far behind the
patched `15.x` line.

**Files changed:**
- `frontend/package.json` — `next` 15.1.3 → 15.5.19, `eslint-config-next` matched to the
  same version

**What was done:**
Bumped to the latest `15.x` release (same major version, no breaking API removals) and ran
`npm install`, `npm run type-check`, `npm run build`, and a dev-server smoke test
(home, `/login`, `/api/proxy/health`) to confirm nothing broke. Also ran `npm audit fix`
(non-forced) which patched a `form-data` CRLF-injection advisory for free.

**Result:** The critical CVE is gone entirely; vulnerability count dropped from 27 (1
critical/3 high/23 moderate) to 26 (2 high/24 moderate) with zero code changes beyond the
version bump.

**Backlog (not done — needs a breaking-change decision, not auto-applied):**
- `rollup` (high) — only fixable by `@sentry/nextjs` 8.x → 10.x (major SDK bump)
- `uuid` (moderate) — only fixable via a `next-auth` major-version change
- A flagged `next/node_modules/postcss` advisory whose only "fix" per `npm audit` is
  downgrading `next` to `9.x` — this is npm's resolver being impractical, not a real action
  item; ignored.

Both real remaining items touch auth (`next-auth`) and error-reporting (`Sentry`) wiring that
need dedicated review and testing before upgrading, not a blind `npm audit fix --force`.

---

### ✅ DONE — [S5-7] Respect `prefers-reduced-motion` in Landing-Page Animations

**Files changed:**
- `frontend/src/components/AnimatedSection.tsx`
- `frontend/src/components/PageTransition.tsx`

**What was done:**
Added Tailwind's `motion-reduce:` variant: `AnimatedSection` now forces full opacity / no
translate / no transition, and `PageTransition` disables the `animate-page-enter` keyframe,
whenever the OS-level reduced-motion preference is set.

**Result:** Users with `prefers-reduced-motion: reduce` no longer get fade/slide/page-enter
animations on the landing page and route transitions.

---

## 📋 Implementation Status (Session 5)

```
✅ S5-1 — Fix candidate timer auto-submit-at-0s bug
✅ S5-2 — Stop faking submit success on network failure
✅ S5-3 — Remove duplicate JWT check in middleware for /api/proxy
✅ S5-4 — Add HSTS header
✅ S5-5 — Working ESLint flat config, decoupled from build
✅ S5-6 — Next.js 15.1.3 → 15.5.19 (closes 1 critical + form-data high)
✅ S5-7 — prefers-reduced-motion support

# STILL OPEN (flagged, not auto-applied — see individual entries above):
❌ CSP header — needs source enumeration before it's safe to add
❌ ~50 pre-existing lint errors (no-explicit-any, unescaped entities) — incremental cleanup
❌ Sentry SDK 8.x → 10.x major bump — clears the `rollup` high-severity CVE
❌ next-auth major-version change — clears the `uuid` moderate CVE
❌ No frontend test suite (no Vitest/Jest/Playwright) — needs a framework decision
❌ Large client components (results page ~924 lines, landing page ~780, leaderboard ~608,
   GenerateTestsButton ~513) — splitting is a real refactor, not attempted in this pass
❌ Hard-coded landing-page testimonials/companies and absolute claims ("0 bias", "100%
   consistent") — a content/product decision, not a code fix
❌ Settings page is static/non-functional — needs a product decision on whether to wire it
   to real config or label it as a preview
```

---

*Last updated: 2026-06-19 | Session 5 additions by Claude Code*

---

---

## SESSION 6 — Backend Audit Fixes — 2026-06-19

> Context: A backend audit (security hardening, DB concurrency, test/CI hygiene) flagged
> bearer-token logging, missing rate limits on public candidate endpoints, app-code-only
> concurrency guards, a misleading "advisory lock" comment, Docker hardening gaps, and a
> tracked virtualenv. Every fix below was verified against the **live** stack (rebuilt
> images, recreated containers, `npm`/`pytest`/`ruff`/migration checks, and direct
> `curl`/Redis inspection) — not just code review.

---

### ✅ DONE — [S6-1] Stop Logging Full Magic Link Tokens in Production

**Problem (ACTIVE SECURITY ISSUE):**
`send_invitation_email()` in `backend/app/services/email_service.py` always logged the
complete magic link — a bearer credential — at `info` level. In production this means
every login token for every candidate lands in stdout/log aggregators in plaintext.

**Files changed:**
- `backend/app/services/email_service.py`

**What was done:**
Added `_mask_magic_link()` which keeps the base URL/path for diagnosing a misconfigured
`MAGIC_LINK_BASE_URL` but reduces the token to a 4-char prefix + length
(`http://host/test/aBcD…(20 chars redacted)`). The full link is only logged when
`APP_ENV != production` (where it's the primary way to use the link without a configured
email provider). Verified live: `_mask_magic_link()` called directly against a real-shaped
URL produces the redacted form shown above.

---

### ✅ DONE — [S6-2] Add Rate Limits to Public Candidate Endpoints

**Problem:**
`backend/app/api/v1/attempts.py` and the `validate/{token}` route in
`backend/app/api/v1/invitations.py` are public (no `X-Internal-Token`, called directly from
the candidate browser) and had no rate limiting at all, despite the project already having
a Redis-backed `slowapi` limiter (P4-3/S2-2) wired up for admin-side Ollama routes.

**Files changed:**
- `backend/app/api/v1/attempts.py` — `/start` 10/min, `/state` 30/min, `/answer` 60/min,
  `/bulk-save` 30/min, `/heartbeat` 20/min, `/submit` 10/min, `/event` 60/min
- `backend/app/api/v1/invitations.py` — `/validate/{token}` 20/min

**What was done:** Reused the existing shared `limiter` (`app/core/ratelimit.py`) rather
than building a second one. Each route needed a `request: Request` parameter added (slowapi
requirement) — none of these routes had one before, since none needed `Request` directly.

---

### ✅ DONE — [S6-3] Found and Fixed a Real Bug in the Existing Rate Limiter

**Problem (ACTIVE BUG, discovered while smoke-testing S6-2):**
Hitting `/api/v1/invitations/validate/{token}` 25 times with 25 *different* token values
never triggered the 20/minute limit. Inspecting Redis showed why: slowapi's default
`key_style="url"` scopes each limit bucket by the **literal resolved request path**,
which includes path parameters. Every distinct token (or `attempt_id`, or `jd_id`) got its
own counter, so the limit could only ever apply to repeated calls with the exact same path —
trivially bypassed by varying the id. This silently affected every *existing* path-parameter
rate limit too: `/jd/{id}/analyze` and `/tests/generate/{jd_id}` (from P4-3) had the same
loophole — a user could exhaust Ollama generation slots indefinitely by varying `jd_id`.

**Files changed:**
- `backend/app/core/ratelimit.py`

**What was done:** Added `key_style="endpoint"` to the shared `Limiter(...)` — this scopes
buckets by the route's function name instead of the resolved URL, so all calls to the same
logical action share one counter regardless of which id is in the path. Verified live:
cleared Redis, hit `/validate/{token}` with 25 distinct tokens — first 20 returned 200,
requests 21–25 returned 429 (previously: all 25 returned 200).

---

### ✅ DONE — [S6-4] DB-Level Uniqueness for Two App-Code-Only Concurrency Guards

**Problem (ACTIVE RACE CONDITION):**
Two invariants were only enforced by a SELECT-then-INSERT check in service code, both with
a real TOCTOU window under concurrent requests:
- `start_attempt()`: checked for an existing `TestAttempt` row for
  `(invitation_id, test_id)` before inserting a new one — two simultaneous requests (double
  click, two tabs) could both pass the check and both insert, leaving two attempt rows for
  the same test.
- `create_invitation()`: checked for an existing active invitation for
  `(candidate_id, jd_id)` the same way — two simultaneous "Invite" clicks could create two
  active invitations for the same candidate+JD.

**Files changed:**
- `backend/app/db/models/attempt.py` — `ix_attempts_inv_test` promoted to a unique index
- `backend/app/db/models/candidate.py` — new partial unique index
  `ux_invitations_active_candidate_jd` on `(candidate_id, jd_id) WHERE status IN
  ('PENDING','OPENED')` (terminal statuses excluded so a candidate can be re-invited later)
- `backend/alembic/versions/a1b2c3d4e5f6_add_concurrency_unique_constraints.py` (new)
- `backend/app/services/attempt_service.py` — `start_attempt()` catches `IntegrityError` on
  the losing side of the race, rolls back, and resumes from the winner's row instead of
  raising
- `backend/app/services/invitation_service.py` — `create_invitation()` catches
  `IntegrityError` and raises the same `ConflictError`/`DUPLICATE_INVITATION` the app-level
  check already raised, so the API contract is unchanged — only the race window closes

**What was done:** Checked the live database for existing duplicate rows under both
constraints before writing the migration (none found — no backfill needed). Applied the
migration to the live `jd_assessment` database and confirmed both indexes exist via
`\d test_attempts` / `\d invitations`.

---

### ✅ DONE — [S6-5] Implement the Postgres Advisory Lock That Was Only a Comment

**Problem:**
`backend/Dockerfile` and `backend/prestart.sh` both claim "Alembic runs migrations using a
PostgreSQL advisory lock so concurrent worker start-up doesn't race" — `alembic/env.py` had
no such lock. Today's single-container `prestart.sh → uvicorn --workers 4` setup doesn't
actually hit this (migrations run once, before workers fork), but if the backend were ever
scaled to multiple containers (`docker compose up --scale backend=2`), two containers
running `alembic upgrade head` at the same time could race on the same DDL.

**Files changed:**
- `backend/alembic/env.py`

**What was done:** Wrapped the migration run in `pg_advisory_lock`/`pg_advisory_unlock` on
a fixed lock id, acquired on the same connection Alembic uses for the migration itself.
Verified live: `alembic upgrade head` ran cleanly with the lock in place (lock acquired,
migrations applied/no-op, lock released, no errors).

---

### 🚩 FLAGGED — [S6-6] Alembic's "Initial Migration" Creates the *Current* Schema, Not a Historical Snapshot

**Problem:**
`backend/alembic/versions/2b330cc211ed_initial_schema.py` calls
`Base.metadata.create_all(bind=op.get_bind(), checkfirst=True)` instead of explicit
`op.create_table(...)` calls — so a fresh install's "initial" migration creates whatever
the ORM models look like *today*, not what they looked like when this migration was written.

**Investigated, not fixed — here's why:** This isn't a simple "freeze the DDL" fix. The
actual database schema's source of truth is split: `frontend/prisma/schema.prisma` defines
the same tables/enums independently (the DB was originally created via `prisma db push`,
per Session 4/S4-4), and every later Alembic migration
(`f3a9c1d2e4b5`/`c7e2d4f8a1b3`/`db7cdbbfd2a8`) explicitly uses `ADD COLUMN IF NOT EXISTS` /
`CREATE TYPE ... EXCEPTION WHEN duplicate_object` specifically *because* they assume
`create_all()` already created those columns/types on a fresh install. Freezing the initial
migration to a true historical snapshot (generated and verified column-by-column against
each later migration) is mechanically possible — see the dumped DDL approach used to
investigate this — but it's an architecture decision about which system (Prisma or
Alembic) is the actual schema authority going forward, not something to silently rewrite.

**Recommendation:** Decide whether Prisma or Alembic owns schema authority going forward,
then do a deliberate, fully-tested rewrite of the initial migration as its own piece of work.

---

### ✅ DONE — [S6-7] Tighten Request Validation Bounds

**Problem:** `SaveAnswerRequest` allowed both `selected_option` and `answer_text` to be set
simultaneously (ambiguous); `BulkSaveRequest.answers` / `SubmitAttemptRequest.answers` had no
max length; `SuspiciousEventRequest.metadata` had no size bound.

**Files changed:**
- `backend/app/schemas/attempt.py`

**What was done:** Added a `model_validator` rejecting `selected_option` + `answer_text`
both set (both `None` is still valid — that's the existing "unanswered" case the service
layer already skips). Capped `answers` lists at 200 items (real tests have a handful of
questions). Capped `SuspiciousEventRequest.metadata` at 2KB serialized.

---

### ✅ DONE — [S6-8] Docker Hardening: Multi-Stage Build + Non-Root User

**Problem:** `backend/Dockerfile` ran as root with `gcc`/`libffi-dev`/`libssl-dev` still
present in the runtime image (build tools that should never ship to production).

**Files changed:**
- `backend/Dockerfile`

**What was done:** Split into a `builder` stage (installs build tools + pip packages into
`/install`) and a runtime stage (only `curl` for the healthcheck, no compiler toolchain) that
copies the installed packages from the builder and runs as a new non-root `appuser` (uid
1000). Verified live: `docker compose run --rm backend whoami` → `appuser`; full image
rebuild + `docker compose up -d backend worker` succeeded; container reports healthy.

---

### ✅ DONE — [S6-9] Bind Backend Dev Port to Localhost

**Files changed:**
- `docker-compose.yml`

**What was done:** Changed `"9000:8000"` to `"127.0.0.1:9000:8000"`. Nginx (port 80, S2-6)
is already the public entry point and proxies `/api/v1/` to this service — direct access on
9000 was unintentionally public. Other services (Postgres, Redis, MinIO, Grafana,
Prometheus, Mailpit) have the same exposure pattern and weren't changed in this pass — flagged
below, not fixed, since narrowing all of them without confirming which are intentionally
used for direct admin/debugging access risks breaking someone's workflow.

---

### ✅ DONE — [S6-10] Untrack `backend/.venv_test` (270MB, 4156 files) From Git

**Files changed:**
- `.gitignore` — added `backend/.venv_test/`
- `git rm -r --cached backend/.venv_test` (staged, not committed — left for explicit review)

**What was done:** Confirmed it was genuinely tracked (not just present locally) and that
the actual cause of "test venv missing redis/arq/sentry_sdk/miniopy_async" was this venv
being stale/incomplete, not a `requirements.txt` gap — every one of those packages is
already pinned in `requirements.txt` and installs cleanly into a fresh image.

---

### ✅ DONE — [S6-11] Fix Test-Suite Determinism — Found and Fixed the Actual "DEBUG=release" Class of Bug

**Problem (the audit's literal "pytest could not complete" symptom, root-caused):**
`tests/conftest.py` used `os.environ.setdefault(...)` for `DATABASE_URL`,
`INTERNAL_API_SECRET`, `MAGIC_LINK_SECRET`, `UPLOAD_DIR`, `OLLAMA_BASE_URL`, and never set
`DEBUG`/`APP_ENV` at all — so any of these already present in the ambient environment (a
developer's shell, or `docker compose run backend pytest`, which inherits the real
`backend/.env` via `env_file`) silently override what the test fixtures assume. Two
concrete failure modes found by actually running the suite end to end:
1. `DEBUG=release` (or any non-bool value) in the shell breaks `Settings()` construction
   outright — this is what the audit hit.
2. A real `INTERNAL_API_SECRET` from `.env` (instead of the test's hardcoded
   `test_secret_that_is_32_chars_long_x`) makes the `client` fixture's `X-Internal-Token`
   header mismatch what `Settings()` expects — every authenticated-route test fails with an
   unrelated-looking `401`, with no indication the cause was environmental.

**Files changed:**
- `backend/tests/conftest.py`
- `backend/requirements.txt` — added `aiosqlite==0.20.0` (was only ever installed ad hoc in
  CI; missing it made `pip install -r requirements.txt` alone insufficient to run tests at all)
- `.github/workflows/ci.yml` — removed the now-redundant ad hoc `aiosqlite` install and the
  now-dead env vars on the `pytest` step (conftest owns them unconditionally)

**What was done:** Force-set (not `setdefault`) every test-critical env var, so the suite is
identical regardless of what's lying around outside the test process. Verified by running
the full suite via `docker compose run --rm backend pytest` — the single worst-case
environment, since it inherits the real `.env` — going from a conftest `ImportError`
(missing `aiosqlite`) → 78 failures (env mismatch) → 32 failures (all pre-existing, see
S6-13) as each cause was fixed.

---

### ✅ DONE — [S6-12] Found and Fixed a Second Real Bug: Rate Limiter Ate Its Own Test Suite

**Problem (discovered while chasing S6-11's failures):** Once the env mismatch was fixed,
22 more tests failed with `ratelimit 10 per 1 minute exceeded at endpoint: /attempts/start`.
The S6-2 rate limits are Redis-backed by design (so they're enforced across uvicorn workers
in production) — which also means they're shared across **pytest runs** against the same
Redis, and accumulate **within** a run since many tests legitimately call `/attempts/start`
more than 10 times in a session.

**Files changed:**
- `backend/tests/conftest.py`

**What was done:** `from app.core.ratelimit import limiter; limiter.enabled = False` at
module load, before the app is imported anywhere else. Tests exercise endpoint behavior, not
rate-limit enforcement (that's exhaustively covered by S6-2/S6-3's live verification
instead). This dropped failures from 78 → 51.

---

### ✅ DONE — [S6-13] Fixed a Real Latent Bug Found by Adding ruff to CI

**Problem (ACTIVE BUG):** `get_attempt_state()` in `backend/app/services/attempt_service.py`
raised `HTTPException(status_code=404, ...)` without `HTTPException` being imported in that
function's scope — it's imported locally in three *other* functions in the same file, but
not this one. If a candidate's test was deleted while they had an active attempt, this path
would raise an unhandled `NameError` (→ a generic 500) instead of the intended clean 404.

**Files changed:**
- `backend/app/services/attempt_service.py`

**What was done:** Added the missing `from fastapi import HTTPException` to
`get_attempt_state()`, matching the existing per-function local-import pattern in this file.
Found via `ruff check app/ --select F821` while building out S6-15 below — not from manual
review, which is exactly the kind of bug a CI lint step exists to catch automatically.

---

### ✅ DONE — [S6-14] Closed the Remaining Gap in S6-11/12 — Missing X-Inviter-Id in Invitation Tests

**Problem:** With S6-11 and S6-12 fixed, 5 tests in `test_invitations.py` still failed with
`400` — they never sent the `X-Inviter-Id` header that `create_invitation()` requires (this
requirement predates this session; the Next.js proxy always forwards it in production, so
the test client just never matched real traffic shape).

**Files changed:**
- `backend/tests/conftest.py`

**What was done:** Added `X-Inviter-Id`/`X-Uploader-Id` as default headers on the `client`
fixture (mirroring `X-Internal-Token`'s existing pattern), set to the same all-zero sentinel
UUID already used elsewhere in test fixtures. Tests that need a *missing* header can still
delete it explicitly. This was the last fix in the attempts/invitations area — both files'
test suites are now 100% green.

---

### ✅ DONE — [S6-15] CI: Add ruff, a Real-Postgres Migration Job, and Dependabot

**Problem:** `.github/workflows/ci.yml` already ran `pytest` (the audit's "what to add next"
CI suggestion was partially done), but had no lint step and no check that
`alembic upgrade head` actually succeeds against a brand-new database — exactly the kind of
check that would have caught S6-6 sooner. No Dependabot config existed for any ecosystem.

**Files changed:**
- `.github/workflows/ci.yml` — added a `ruff check app/` step to `backend-tests`; added a
  new `backend-migrations` job with a real `postgres:16-alpine` service container running
  `alembic upgrade head` against a brand-new database
- `.github/dependabot.yml` (new) — weekly updates for pip (`/backend`), npm (`/frontend`),
  Docker (`/backend`), and github-actions, grouped by minor/patch to keep PR volume sane

**What was done:** Ran `ruff check app/` locally first (42 pre-existing findings, mostly
auto-fixable unused imports) before wiring it into CI as a blocking step — confirmed it's a
manageable backlog, not a `next lint`-style wall (see S6-16).

---

### ✅ DONE — [S6-16] Backend Dependency Audit — Applied Safe Patches, Flagged the Rest

**Problem:** `pip-audit` against `requirements.txt` found 21 known vulnerabilities across 5
packages.

**Files changed:**
- `backend/requirements.txt` — `python-dotenv` 1.0.1→1.2.2, `python-jose` 3.3.0→3.4.0,
  `python-multipart` 0.0.20→0.0.32

**What was done:** Checked each fix's actual constraint before bumping — `fastapi==0.115.6`
pins `starlette<0.42.0,>=0.40.0`, so the starlette CVEs (8 advisories, fixes only available
at 1.0.1+) are unfixable without a FastAPI upgrade; `pytest-asyncio==0.24.0` pins
`pytest<9`, so the pytest CVE fix (9.0.3) would break the test runner. Applied the three
patches with no such constraint (verified no upper-bound pin blocks any of them), left the
other two as backlog requiring a dedicated, tested framework-upgrade pass.

**Backlog (not done — needs a dedicated upgrade-and-test pass):**
- FastAPI/Starlette major bump to clear 8 starlette CVEs (touches the core web framework)
- pytest 8→9 + a compatible pytest-asyncio (test-only; no production exposure)

---

## 📋 Implementation Status (Session 6)

```
✅ S6-1  — Mask magic link tokens in production logs
✅ S6-2  — Rate limits on public candidate endpoints (attempts.py, invitations.py)
✅ S6-3  — Fixed key_style bug that made ALL path-param rate limits bypassable
✅ S6-4  — DB-level unique constraints for test_attempts + active invitations (+ race handling)
✅ S6-5  — Real Postgres advisory lock for migrations (comment said it existed; it didn't)
✅ S6-7  — Tightened SaveAnswerRequest/BulkSaveRequest/SuspiciousEventRequest validation
✅ S6-8  — Backend Dockerfile: multi-stage build + non-root user
✅ S6-9  — Backend dev port bound to 127.0.0.1
✅ S6-10 — backend/.venv_test (270MB) untracked from git
✅ S6-11 — Test suite immune to ambient env (the actual DEBUG=release root cause)
✅ S6-12 — Rate limiter disabled in tests (was eating its own test suite)
✅ S6-13 — Fixed latent HTTPException NameError bug (found via ruff)
✅ S6-14 — Missing X-Inviter-Id in invitation tests — test_attempts.py + test_invitations.py 100% green
✅ S6-15 — CI: ruff lint + real-Postgres migration job + Dependabot
✅ S6-16 — Backend deps: 3 safe CVE patches applied, 2 flagged (need framework upgrades)

# FLAGGED — needs a decision, not a blind fix:
🚩 S6-6  — Alembic initial migration bakes in *current* schema, not a historical snapshot
           (root cause: dual Prisma/Alembic schema authority — needs an architecture decision)

# Pre-existing test debt found but NOT fixed (out of scope — unrelated to this audit):
❌ 32 failures in test_jd_upload.py (ARQ pool not wired into test app.state — `'State'
   object has no attribute 'arq_pool'`), test_evaluation.py (`_score_mcqs()` signature drift:
   test calls don't pass the now-required `attempt_id`), test_test_generation.py, and
   test_tests_api.py. None of these touch any file this session changed — confirmed by
   running test_attempts.py/test_invitations.py/test_security.py in isolation (100% green)
   while the broader suite still shows these failures.
❌ FastAPI/Starlette major version bump (8 CVEs, needs its own tested upgrade pass)
❌ pytest 8→9 + pytest-asyncio compatibility (test-only, no production exposure)
❌ Backend auth model — admin endpoints trust X-Internal-Token + forwarded X-Uploader-Id/
   X-Inviter-Id headers rather than a backend-verified JWT. Reasonable behind a trusted
   Next.js proxy; a real fix (signed user context or backend-side JWT verification) is an
   architecture change, not a config tweak — flagged, not attempted.
❌ Other docker-compose services (Postgres, Redis, MinIO, Grafana, Prometheus, Mailpit) have
   the same host-port exposure pattern S6-9 fixed for backend — not changed without
   confirming which are intentionally used for direct access.
```

---

*Last updated: 2026-06-19 | Session 6 additions by Claude Code*

---

---

## SESSION 7 — Frontend Audit Round 2 — 2026-06-19

> Context: A follow-up frontend audit (login security, the catch-all proxy, env validation,
> upload handling, lint tooling) found one open-redirect bug, one timing side-channel, and a
> handful of real hygiene gaps. Most fixes were verified directly (timing measurements,
> live curl, a Node-level test of the lockout logic), not just code review.

---

### ✅ DONE — [S7-1] Fix Open-Redirect in the Login `callbackUrl`

**Problem (ACTIVE BUG):** `frontend/src/app/(auth)/login/page.tsx` read `callbackUrl` from
the URL query string and passed it straight to `router.push()` with no validation. A
crafted login link (`/login?callbackUrl=https://evil.com`) could redirect a successfully
authenticated admin somewhere unintended.

**Files changed:**
- `frontend/src/app/(auth)/login/page.tsx`

**What was done:** Added `safeCallbackUrl()` — only a value starting with `/dashboard` (and
not `//`, which browsers/some routers treat as protocol-relative) is honored; anything else
falls back to `/dashboard`. Verified directly: `https://evil.com`, `//evil.com`,
`javascript:alert(1)`, and `null` all resolve to `/dashboard`; `/dashboard/jds` passes
through unchanged.

---

### ✅ DONE — [S7-2] Fix Login Timing Side-Channel — the "Constant-Time" Placeholder Wasn't

**Problem (ACTIVE BUG, measured):** `frontend/src/lib/auth.ts`'s "no such user" path ran
`bcrypt.compare(password, "$2b$10$invalidhashpaddingtoconstanttime")` specifically to keep
"user not found" and "wrong password" indistinguishable by timing. That placeholder string
is 20 characters short of a structurally valid bcrypt hash, so bcryptjs short-circuited
before doing the actual Blowfish key setup:

```
fake hash compare: 0 ms
real hash compare: 59 ms
```

**Files changed:**
- `frontend/src/lib/auth.ts`

**What was done:** Replaced the placeholder with a real bcrypt hash (cost 10, of an
arbitrary non-credential string), confirmed it now takes ~65ms — matching a real comparison.

---

### ✅ DONE — [S7-3] Add Login Lockout (No Rate Limiting Existed at All)

**Problem:** Nothing rate-limited or locked out repeated login attempts against the
credentials provider.

**Files changed:**
- `frontend/src/lib/auth/loginRateLimit.ts` (new)
- `frontend/src/lib/auth.ts`

**What was done:** In-memory lockout (5 failed attempts / 15 min window) keyed by
normalized email, not IP — IP isn't reliably available from NextAuth's
`authorize(credentials, req)` across deployments, and the realistic threat for a handful of
admin accounts is credential stuffing against a known email, not distributed scanning. Not
Redis-backed like the backend's limiter: this app runs as a single Next.js process (no
uvicorn-style multi-worker fan-out), so an in-process Map needs no shared store — it simply
resets on deploy/restart, which is an acceptable tradeoff for this threat model. Bounded the
map at 5,000 tracked emails so an attacker cycling fake addresses can't grow it unboundedly.
The locked-out path still spends the real bcrypt cost so it isn't timing-distinguishable
from a normal failed attempt. Verified directly (Node + tsx): not locked at 0 attempts,
locked at 5, unlocked again after `clearAttempts()` (called on every successful login).

---

### ✅ DONE — [S7-4] Harden the Catch-All Proxy (Partially — See Flagged Item Below)

**Problem:** `frontend/src/app/api/proxy/[...path]/route.ts` forwards any method/path to
FastAPI with the full internal secret, with no body size bound and no check that
`FASTAPI_INTERNAL_URL`/`INTERNAL_API_SECRET` are actually configured — a missing secret
silently became an empty string forwarded as `X-Internal-Token`, surfacing as whatever
generic 401 FastAPI happens to return.

**Files changed:**
- `frontend/src/app/api/proxy/[...path]/route.ts`

**What was done:** Added a fail-fast 500 (`PROXY_MISCONFIGURED`) when either env var is
missing, instead of silently forwarding garbage. Added a 2MB body-size cap before
forwarding — confirmed via `grep` that nothing legitimate sends multipart/large bodies
through this route (`apiClient.upload()` is dead code; the actual JD upload goes through the
dedicated `/api/jd/upload` route, never this one), so 2MB has zero risk of breaking real
traffic while bounding what an authenticated-but-misbehaving client can push through.

**Flagged, not done — needs its own pass:** A full path/method allowlist (the audit's other
suggestion) requires enumerating every legitimate proxy call site against the backend's full
route table first; doing that without the enumeration risks breaking real admin features.
Left as backlog below.

---

### ✅ DONE — [S7-5] Fix Upload Polling Leak + Move Upload Validation Before Buffering

**Problem (ACTIVE BUG):** `frontend/src/components/admin/JdUploadForm.tsx`'s status-polling
`setInterval` had no cleanup on component unmount — navigating away mid-"parsing" left it
running in the background indefinitely, still calling `setState`/`router.push` against an
unmounted component. Separately, `frontend/src/app/api/jd/upload/route.ts` validated nothing
about file size/type — it just called `req.formData()` (which fully buffers the multipart
body) and forwarded whatever it got. The 10MB client-side check in `JdUploadForm.tsx` is
trivially bypassed by calling the route directly.

**Files changed:**
- `frontend/src/components/admin/JdUploadForm.tsx`
- `frontend/src/app/api/jd/upload/route.ts`

**What was done:** Added a `useEffect` cleanup clearing the poll interval on unmount. Added
a `Content-Length` pre-check (rejects oversized requests with 413 before buffering — the
common/honest-client case) plus a post-`formData()` `file.size` check and a file-extension
check (covers a client that lies about `Content-Length`), mirroring the client-side limits
that previously only existed in the React component.

---

### 🚩 FLAGGED — [S7-6] No RBAC Enforcement for `SUPER_ADMIN`

**Finding:** `UserRole` includes `"ADMIN" | "SUPER_ADMIN"`, but nothing in the app —
middleware, layouts, or API routes — actually checks role; `middleware.ts` only checks
*authentication*, not *authorization*. Grepped the whole `src/` tree: no reference to
`SUPER_ADMIN` exists outside the type definition.

**Why not fixed:** There's no evidence any page or action is actually meant to be
super-admin-only today — every admin route treats both roles identically. Adding
enforcement now would mean inventing a restriction the product hasn't asked for. Flagged per
the audit's own framing ("fix only if the product needs privileged admin-only pages") —
this needs a product decision about which pages/actions (if any) should be gated, not a
unilateral code change.

---

### ✅ DONE — [S7-7] Migrate Off Deprecated `next lint`

**Problem:** `next lint` itself prints `` `next lint` is deprecated and will be removed in
Next.js 16. ``

**Files changed:**
- `frontend/package.json` — `"lint": "next lint"` → `"lint": "eslint ."`
- `frontend/eslint.config.mjs` — excluded the wasm-bindgen generated glue
  (`src/lib/wasm/talvyn_parser.js`/`.d.ts`, committed but not hand-authored — see S3-3)
  from lint, since fixing warnings there is pointless busywork wiped out by the next
  `build:wasm` regeneration

**What was done:** Confirmed `eslint .` reports identically to `next lint` (same flat config
either way), then made the switch. Findings count dropped from 70 to 67 just from excluding
the 3 generated-file warnings — the remaining 67 (34 errors, 33 warnings) are the same
pre-existing backlog flagged in Session 5, unchanged by this session.

---

### ✅ DONE — [S7-8] Fail Loudly on Missing Server Env Vars (Scoped)

**Problem:** `serverFetch.ts` read `FASTAPI_INTERNAL_URL`/`INTERNAL_API_SECRET` with
`?? "http://localhost:8000"` / `?? ""` fallbacks at module top level — a missing
`INTERNAL_API_SECRET` in production silently became an empty token, turning a config error
into a confusing "no data, empty dashboard" instead of a clear failure.

**Files changed:**
- `frontend/src/lib/env.ts` (new) — `requireServerEnv(name, devFallback?)`
- `frontend/src/lib/api/serverFetch.ts`

**What was done:** Moved the env reads from module top level into the function body (so the
check runs at request time, never during `next build`'s static analysis) and made
`INTERNAL_API_SECRET` throw if unset; `FASTAPI_INTERNAL_URL` keeps its
`http://localhost:8000` fallback in non-production only, matching the existing convention
used elsewhere (e.g. `next.config.ts`'s rewrites). The throw happens *before* the
`try`/`catch`, so it surfaces as a real error instead of being swallowed into the
`serverFetch` "return null on any failure" contract — that swallowing is exactly what made
this invisible before.

**Scoped, not exhaustive:** Did not add the same wrapper to every env access in the codebase
(`auth.ts`, client-side override envs, etc.). Candidate attempts now default to the
same-origin `/api/candidate` proxy, but a full, deliberate env-schema pass (deciding
build-time vs. runtime requirements for every var) is still backlogged below rather than
done piecemeal.

---

### ✅ DONE — [S7-9] Small Cleanup

**Files changed:**
- Removed `frontend/let`, `frontend/lrt` — two tracked, 0-byte files (confirmed empty,
  unreferenced anywhere in the codebase; almost certainly an accidental shell-redirect typo)
- `docker-compose.yml` / `frontend/scripts/start-dev.sh` — fixed two stale comments claiming
  the frontend container runs Prisma migrations on startup; it only runs `prisma db seed`
  (migrations were deliberately removed in Session 4/S4-4 — Alembic owns schema now)

---

### Re-checked, unchanged from Session 5/6 — no new action

- **Dependency audit** (26 vulnerabilities: 24 moderate, 2 high) — identical to where
  Session 5 left it. Still the same `postcss`/`rollup`/`uuid` chain, still only fixable via
  `@sentry/nextjs` 8→10 or a `next-auth` major bump, both flagged as needing a dedicated
  upgrade-and-test pass, not a blind `npm audit fix --force`.
- **Prisma/Alembic schema drift** — this is the same issue as Session 6's S6-6, viewed from
  the frontend side (Prisma's `schema.prisma` doesn't model `evaluation_level`, the pgvector
  `embedding` column, or the new concurrency unique indexes). No new finding — already
  flagged as needing an architecture decision about which system owns schema authority.

---

## 📋 Implementation Status (Session 7)

```
✅ S7-1 — Fixed open-redirect in login callbackUrl
✅ S7-2 — Fixed login timing side-channel (placeholder hash was structurally invalid)
✅ S7-3 — Added login lockout (5 attempts / 15 min, in-memory, keyed by email)
✅ S7-4 — Proxy: fail-fast on missing env vars + 2MB body cap (allowlist flagged, not done)
✅ S7-5 — Fixed upload poll-interval leak on unmount + moved upload validation before buffering
✅ S7-7 — Migrated off deprecated `next lint` to `eslint .`
✅ S7-8 — requireServerEnv() for serverFetch.ts (scoped — not applied codebase-wide)
✅ S7-9 — Removed 2 stray tracked empty files; fixed 2 stale Prisma-migration comments

# FLAGGED — needs a decision, not a blind fix:
🚩 S7-6  — No RBAC/role enforcement for SUPER_ADMIN (no product requirement found for it)

# Backlog (not done — explicitly scoped out, see individual entries above):
❌ Full path/method allowlist for the catch-all proxy (needs call-site enumeration first)
❌ Codebase-wide env-schema validation (client vs. server, build-time vs. runtime — see S7-8)
❌ Remaining ~67 pre-existing lint findings (34 errors, 33 warnings) — same backlog as Session 5
❌ FastAPI/Starlette + next-auth major bumps to close the last 2 frontend CVEs (Session 5/6)
❌ Prisma/Alembic schema-authority decision (Session 6, S6-6)
```

---

## 2026-06-21 Full Audit Follow-Up Backlog

> Context: A fresh repository audit was run on 2026-06-21 after the feature
> checklist and enterprise docs had already absorbed several older findings.
> This pass re-checked the current code rather than carrying forward stale audit
> claims. The audit did not edit production code; it produced the backlog below.

### Verification Snapshot

Commands run during the audit:

- `backend/.venv_test/bin/pytest backend/tests -q` -> 287 passed.
- `backend/.venv_test/bin/ruff check backend/app` -> passed.
- `npm run type-check` -> passed.
- `npm run build` -> passed.
- `npm run lint` -> passed with 63 warnings.
- `npm audit --audit-level=moderate` -> 26 vulnerabilities, including 2 high.
- `cargo test` in `frontend/wasm-parser` -> passed, but ran 0 tests.

### ❌ TODO — [A8-1] Invalidate approved-test Redis caches on test mutations

**Problem:** `attempt_service.py` caches approved tests by `approved_tests:{jd_id}`
and full test/question payloads by `test:{test_id}` for one hour. The admin test
mutation paths in `test_service.py` update metadata, approval status, questions,
and deletes without clearing those keys.

**Impact:** A candidate can start or resume an assessment using stale approved
test data for up to 60 minutes after an admin edits, archives, unapproves, or
deletes test content.

**Fix direction:**

- Add a small cache-invalidation helper for test and JD approved-test keys.
- Call it from test metadata/status/question/regeneration/delete paths.
- Cover the regression with tests that update an approved test, then start or
  resume an attempt and assert the fresh data/status is enforced.

### ✅ DONE (2026-08-05) — [A8-2] Resolve Prisma/Alembic schema authority

**Problem:** Alembic/SQLAlchemy clearly own the live backend schema, but the
frontend still had Prisma migrate/push scripts and a partial Prisma schema used
mostly for auth seeding. The Prisma schema is missing newer backend fields and
models such as candidate numbering, public links, audit logs, webhooks, question
feedback, and newer evaluation fields.

**Impact:** Running Prisma schema commands against a real database could create
drift or destructive migration pressure against Alembic-owned tables.

**Resolution:**

- Declared Alembic the single schema owner (`docs/schema-authority.md` + a
  policy header in `schema.prisma`).
- Removed the vestigial `prisma/migrations/` directory and the
  `db:push`/`db:migrate`/`db:migrate:prod` npm scripts so they can't be
  mistaken for production schema commands.
- Added a non-blocking `schema-drift` CI job (`prisma migrate diff` against an
  Alembic-built database) that reports the remaining datamodel drift; ratchet
  to blocking once it is paid down.
- Note: Prisma is still a full read model (not restricted to `User`) so the
  drift job can track the whole schema; the historical missing-fields drift
  it flags is the paydown backlog.

### ❌ TODO — [A8-3] Harden default admin seeding

**Problem:** The seed script and docs expose a deterministic default admin
email/password. This is convenient for local development but risky for any
shared or production-like deployment.

**Impact:** A production instance that accidentally keeps the default password
is immediately vulnerable to credential stuffing by anyone who has seen the
repo/docs.

**Fix direction:**

- Seed the known default only in explicit development mode.
- Require `SEED_ADMIN_PASSWORD` or a generated one-time credential elsewhere.
- Force first-login password rotation for seeded/bootstrap admins.

### ❌ TODO — [A8-4] Redeem magic-link tokens into tokenless exam sessions

**Problem:** The candidate token is no longer duplicated in the query string,
but the raw token remains in the `/tests/<token>` URL path during exam routing.

**Impact:** Path tokens can leak through browser history, access logs, referrer
headers, screenshots, or session replay tools.

**Fix direction:**

- Redeem the raw magic token once on the landing/start transition.
- Create a short-lived attempt-session token or server-side session binding.
- Redirect the candidate to a tokenless route such as `/tests/session/<id>/exam`.

### ❌ TODO — [A8-5] Add backend RBAC and resource ownership checks

**Problem:** The frontend protects dashboard routes and the proxy forwards actor
headers, but backend authorization is still mostly "authenticated internal
admin" rather than role/resource based.

**Impact:** This is acceptable for a single internal admin account, but it is a
blocker for multi-team, multi-company, reviewer-only, or SaaS usage.

**Fix direction:**

- Enforce owner/admin/recruiter/reviewer permissions in backend dependencies.
- Scope JD/candidate/evaluation access by tenant or owner when that product
  model exists.
- Require elevated roles for reset, restore, webhook configuration, user
  management, and future billing/integration settings.

### 🟡 PARTIAL (2026-08-05) — [A8-6] Plan dependency upgrades and add CVE gates

**Problem:** `npm audit --audit-level=moderate` reports 26 vulnerabilities,
including 2 high transitive findings. The suggested force fixes involve major
or risky upgrades, so this needs a tested dependency pass rather than blind
`npm audit fix --force`.

**Impact:** Dependency exposure will keep accumulating, and the current CI does
not appear to block on frontend or Python vulnerability scans.

**Done — the CVE gates:**

- Added a `security-audit` CI job running `pip-audit -r requirements.txt`
  (backend) and `npm audit --omit=dev --audit-level=high` (frontend), both
  **non-blocking** (`continue-on-error`) so findings surface in the PR checks
  and the job summary without breaking builds.

**Still open — the paydown + ratchet:**

- Triage the reported findings and do the planned, tested upgrade pass
  (`@sentry/nextjs`, Next, NextAuth/Auth.js, Prisma, React).
- Once the known findings are resolved, remove `continue-on-error` from the
  `security-audit` job so the gates become blocking.

### ❌ TODO — [A8-7] Pay down frontend lint warnings

**Problem:** `npm run lint` exits successfully, but currently reports 63
warnings, including React hook dependency warnings in candidate exam and admin
upload/generation flows.

**Impact:** Warning-only lint allows stale closures and subtle UI regressions to
survive CI.

**Fix direction:**

- Fix the current warnings in focused batches.
- Promote React hook dependency warnings to CI failures.
- Keep broad migration rules like `no-explicit-any` as temporary warnings only
  if there is an explicit cleanup plan.

### ❌ TODO — [A8-8] Clean up docs/runtime port drift

**Problem:** Compose/nginx configuration and startup docs disagree about local
ports in several places.

**Impact:** New operators can follow correct-looking docs and still hit the
wrong port or misdiagnose a healthy deployment as broken.

**Fix direction:**

- Make the local HTTP port explicit in `.env.example`, Compose comments,
  README, deployment docs, and `start.sh` output.
- Prefer one environment variable or documented convention as the source of
  truth.

### ❌ TODO — [A8-9] Decide whether generated `site/` docs are tracked

**Problem:** `site/` is gitignored but still tracked.

**Impact:** Generated docs can create noisy diffs and confuse whether docs are
published from source or committed output.

**Fix direction:**

- If docs are deployed from committed static output, remove `site/` from
  `.gitignore` and document that policy.
- Otherwise untrack `site/` and build/publish docs in CI.

### ❌ TODO — [A8-10] Add real Rust tests for the WASM parser

**Problem:** `cargo test` in `frontend/wasm-parser` passes but runs zero tests.

**Impact:** Browser-side document parsing can regress without the Rust test
command noticing.

**Fix direction:**

- Add fixture tests for PDF and DOCX text extraction.
- Add corrupt-file and unsupported-file tests.
- Add size/guard behavior tests if the parser enforces limits.

### ❌ TODO — [A8-11] Add browser E2E coverage for full workflows

**Problem:** Backend tests are strong, but the most important product paths
cross the Next.js frontend, proxy routes, FastAPI backend, database, worker, and
candidate UI.

**Impact:** A green backend suite and green frontend build can still miss broken
end-to-end hiring flows.

**Fix direction:**

- Add Playwright or Cypress smoke tests for login, JD upload/analyze/generate,
  test approval, public-link registration, candidate exam submit, evaluation
  report, backup/restore, and permission checks.
- Keep the smoke suite small enough to run in CI.

---

*Last updated: 2026-06-21 | Full audit follow-up added by Codex*
