# Talvyn — Architecture

> Technical design overview for developers joining the project.

---

## System Overview

```text
                         ┌────────────────────────────────────────────────────────┐
                         │                Docker Compose Network                   │
                         │                                                         │
  Browser (any)          │  ┌──────────────────────────────────────────────────┐  │
       │                 │  │        Nginx / OpenResty  :80                    │  │
       │  HTTP :80        │  │   Lua JWT guard · rate limit · SSE pass-through  │  │
       └────────────────►│  └───┬───────────────────────────┬──────────────────┘  │
                         │      │ /                         │ /api/v1/             │
                         │  ┌───▼─────────────────────┐ ┌──▼──────────────────┐  │
                         │  │   Next.js Frontend       │ │  FastAPI Backend    │  │
                         │  │  Admin + Candidate UI    │ │  4 uvicorn workers  │  │
                         │  │       port 3000          │ │     port 8000       │  │
                         │  └───────────┬──────────────┘ └──┬──────────────────┘  │
                         │              │ /api/proxy/        │ enqueue jobs        │
                         │              │ (server-side)      │                     │
                         │              └────────────────────┘                     │
                         │                                                         │
                         │  ┌───────────────────┐  ┌────────────────────────────┐ │
                         │  │   Redis :6379      │  │   ARQ Worker               │ │
                         │  │  DB 0 — Talvyn  │◄─┤  (Ollama job runner)       │ │
                         │  │  DB 1 — GlitchTip  │  │  max_jobs=1                │ │
                         │  └───────────────────┘  └───────────┬────────────────┘ │
                         │                                      │                  │
                         │  ┌────────────────────┐  ┌──────────▼────────────────┐ │
                         │  │   PostgreSQL :5432  │◄─┘  MinIO :9000 (optional)   │ │
                         │  │   talvyn_db      │  │  S3-compatible storage    │ │
                         │  └────────────────────┘  └───────────────────────────┘ │
                         │                                                         │
                         │  ┌────────────────────┐  ┌───────────────────────────┐ │
                         │  │  Prometheus :9090   │  │   GlitchTip :8080         │ │
                         │  │  scrapes /metrics   │  │   error tracking          │ │
                         │  └────────┬────────────┘  └───────────────────────────┘ │
                         │           │                                              │
                         │  ┌────────▼────────────┐                               │
                         │  │  Grafana :3000       │                               │
                         │  │  metrics dashboards  │                               │
                         │  └─────────────────────┘                               │
                         └────────────────────────────────────────────────────────┘
                                             │
                                   host.docker.internal
                                             │
                         ┌───────────────────▼────────────────────────────────────┐
                         │           Ollama (native on host)                       │
                         │     gemma3:4b/12b/27b — GPU accelerated                 │
                         │                port 11434                               │
                         └────────────────────────────────────────────────────────┘
```

> The diagram shows Nginx on the conventional port 80. `docker-compose.yml` ships
> with it commented out in favour of `"81:81"` (avoids clashing with another
> service already on 80 on some hosts) — `nginx/nginx.conf`'s `listen` directive
> must always match whatever host port you map it to. Swap both back to 80 if
> nothing else on your machine needs that port.

---

## Service Inventory — Why Each Container Exists and What It Does

14 containers run under `docker compose up`. For each one: the problem it solves
for Talvyn specifically (not just "what the technology generically does"),
then the mechanics.

### Entry point

**`talvyn_nginx`** (`openresty/openresty:alpine`)

- **Why Talvyn needs it:** Without it, admins and candidates would have to hit
  the frontend and backend on two different raw ports directly (`:3003`,
  `:9000`), which means CORS headaches, no single shareable URL, and — most
  importantly — every request including obviously-forged ones would travel all
  the way to FastAPI before being rejected. Nginx gives the platform one URL to
  give out, and rejects unauthenticated API calls before they ever reach Python.
- **What it does:** Single entry point on host port 81 (`listen 81` in
  `nginx/nginx.conf` — see the port note above). Routes `/` → frontend,
  `/api/v1/` → backend, `/mailpit/` → Mailpit. Runs `nginx/lua/jwt_check.lua` on
  every `/api/v1/` request — rejects requests with no/malformed NextAuth session
  cookie in <1ms, before FastAPI is touched. Also applies a coarse per-IP rate
  limit (`limit_req`) as a first line of defence ahead of FastAPI's own
  per-user Redis-backed limiter.
- **Depends on:** frontend, backend (their hostnames must resolve via Docker
  DNS at nginx startup — if either is down/restarting, nginx itself fails
  to start, since it resolves upstream hostnames at config-load time).

### Application

**`talvyn_frontend`** (built from `frontend/Dockerfile.dev`)

- **Why Talvyn needs it:** This is the only thing an admin or candidate
  ever actually looks at — the dashboard for uploading JDs and reviewing
  results, and the exam-taking UI candidates use. It also owns the admin
  account database (Prisma/NextAuth) and is the only place `INTERNAL_API_SECRET`
  is allowed to exist, so the browser never sees the token that authorizes
  calls to FastAPI.
- **What it does:** Next.js 15 admin dashboard + candidate test-taking UI. On
  container start, `scripts/start-dev.sh` runs `npx prisma db seed` (idempotent
  — creates `admin@talvyn.com` if missing) then `npm run dev` (Turbopack).
  Hosts the Next.js API routes that proxy authenticated calls to FastAPI
  (`/api/proxy/[...path]`) and the JD upload endpoint.
- **Depends on:** postgres (healthy — for its own NextAuth/admin tables),
  backend (started).

**`talvyn_backend`** (built from `backend/Dockerfile`)

- **Why Talvyn needs it:** This is where all the actual product logic
  lives — parsing JDs, talking to Ollama, scoring candidates, enforcing that
  every evaluation is "preliminary" until an admin signs off. It's a separate
  service from the frontend specifically so the AI/business logic isn't
  entangled with UI rendering, and so it can be scaled, rate-limited, and
  monitored independently.
- **What it does:** FastAPI REST API — 4 uvicorn workers. Handles JD
  upload/parsing, skill extraction requests, test CRUD, invitations, candidate
  attempts, evaluation, admin overrides. `prestart.sh` runs `alembic upgrade
  head` before uvicorn starts, so the schema is always current before any
  worker accepts traffic. Exposes `/metrics` for Prometheus and
  `/api/v1/health` for its own healthcheck. Talks to Ollama on the host via
  `host.docker.internal:11434`.
- **Depends on:** postgres (healthy), redis (healthy), mailpit (started).

**`talvyn_worker`** (same image as backend, different `command`)

- **Why Talvyn needs it:** Test generation and evaluation each call Ollama
  and can take 2–30 minutes. If that ran inside a normal API request handler,
  one slow generation job would occupy one of the backend's 4 uvicorn workers
  for the entire duration — with only 4 workers, 2 concurrent generations
  would leave just 2 workers free to handle every other admin/candidate
  request on the platform. The worker exists purely to take that AI work
  completely off the request/response path.
- **What it does:** ARQ worker — runs the actual Ollama-calling background
  jobs (`task_parse_jd`, `task_extract_skills`, `task_generate_tests`) in a
  separate process. `max_jobs=1` (configured in `worker.py`) serialises Ollama
  access to match `OLLAMA_NUM_PARALLEL=1` (most self-hosted GPUs can't truly
  run more than one generation at once anyway). Healthcheck is disabled — it
  inherits the backend image's HTTP healthcheck by default, but this
  container has no HTTP server to curl, so checking it would only ever report
  false "unhealthy".
- **Depends on:** redis (healthy), postgres (healthy).

### Data layer

**`talvyn_postgres`** (`pgvector/pgvector:pg16`)

- **Why Talvyn needs it:** Every piece of state that matters — uploaded
  JDs, generated tests and questions, candidates, invitations, in-progress and
  submitted attempts, evaluation scores and admin overrides — has to survive
  container restarts and be queryable relationally (e.g. "all attempts for
  this JD," "all evaluations above 80%"). A relational database with real
  transactions is what makes the "approve a test, then invite candidates"
  workflow safe — a half-written invitation or half-scored evaluation should
  never be visible.
- **What it does:** Primary database for the whole platform. pgvector
  extension is preinstalled (so the image is a drop-in upgrade from plain
  `postgres:16`) but only actually used if `EMBEDDING_ENABLED=true` for the
  candidate-similarity feature — otherwise it's dormant.
- **Depends on:** — (first thing to start).

**`talvyn_redis`** (`redis:7-alpine`)

- **Why Talvyn needs it:** The backend runs 4 separate uvicorn worker
  processes, each with its own memory — a Python dict or a `/tmp` file
  written by worker #2 is invisible to worker #3. Without a shared store,
  generation progress would appear to randomly freeze depending on which
  worker handled the next poll, and rate limits could be bypassed by simply
  retrying until a different worker picks up the request. Redis is the single
  source of truth all 4 backend workers and the separate ARQ worker process
  can agree on.
- **What it does:** Shared state across the 4 backend workers + the ARQ
  worker: test-generation progress (DB 0), the Redis-backed rate limiter, the
  approved-test cache (`attempt_service.py` — avoids a DB round trip on every
  candidate start/resume for tests that never change), and the ARQ job queue
  itself. GlitchTip uses a separate logical DB (DB 1, see below) on this same
  instance so its keys never collide with Talvyn's.
- **Depends on:** — (needed before backend/worker start).

**`talvyn_minio`** (`minio/minio:latest`)

- **Why Talvyn needs it:** The default setup stores uploaded JD files on a
  Docker volume on one machine, which is fine for a single self-hosted
  instance but doesn't survive that machine disappearing and can't be shared
  if Talvyn is ever scaled to multiple backend instances. MinIO exists as
  a ready-to-flip alternative for anyone who outgrows the single-volume setup
  — without rewriting any application code (`file_service.py` has one
  interface for both backends).
- **What it does:** Optional S3-compatible object store for uploaded JD
  files. Inert unless `STORAGE_BACKEND=s3` is set in `backend/.env` — the
  default (`local`) writes to the `uploads_data` volume instead and this
  container just idles, consuming a small amount of RAM for nothing.
- **Depends on:** — (only matters if `STORAGE_BACKEND=s3`).

### Observability

**`talvyn_prometheus`** (`prom/prometheus:latest`) and **`talvyn_grafana`** (`grafana/grafana:latest`)

- **Why Talvyn needs them:** Once real candidates are taking tests, "is it
  slow" and "is it failing" stop being questions you can answer by staring at
  logs. The two things that matter most for this specific app are Ollama
  latency (generation/evaluation are the slowest, most failure-prone part of
  the pipeline) and request throughput/error rates under real admin/candidate
  load — both invisible without a metrics pipeline.
- **What they do:** Prometheus scrapes `backend:8000/metrics` every 15s
  (config in `prometheus/prometheus.yml`) — request counts/latencies per
  endpoint, instrumented via `prometheus-fastapi-instrumentator`. Grafana
  reads that data; Prometheus is auto-provisioned as its default datasource
  (`grafana/provisioning/datasources/prometheus.yml`) so there's no manual
  setup step.
- **Depends on:** Grafana depends on Prometheus; Prometheus depends on backend
  (the thing it scrapes).

### Error tracking (GlitchTip — self-hosted Sentry)

- **Why Talvyn needs it:** The Ollama pipeline fails in ways that are
  silent by default — a retry loop that exhausts all attempts, a Pydantic
  validation error on a malformed AI response, an unexpected exception deep
  in evaluation scoring. Without error tracking, the only way an admin finds
  out is a candidate or another admin reporting "it's stuck" — by which point
  the actual stack trace and request context are gone. GlitchTip captures
  every one of those the moment they happen, with full context, at zero
  overhead until you actually turn it on (DSN unset = `sentry_sdk.init` never
  runs).

GlitchTip is itself a small multi-container app, fully isolated from the rest
of the stack (own Postgres, own logical Redis DB) so it can never corrupt or
slow down Talvyn's own data:

- **`talvyn_glitchtip_db`** (`postgres:15-alpine`) — dedicated Postgres
  database for GlitchTip only. Kept fully separate from `talvyn_postgres`
  so a GlitchTip outage or migration issue can never touch Talvyn's actual
  product data.
- **`talvyn_glitchtip_migrate`** (`glitchtip/glitchtip:latest`) —
  **one-shot init container.** Runs `./manage.py migrate --noinput` once,
  then exits (exit code 0 = success). `restart: "no"` — it is not supposed to
  keep running; Docker Desktop shows it as stopped/hollow-dot for exactly
  this reason. `glitchtip` and `glitchtip-worker` both wait for
  `service_completed_successfully` on this container before starting, so the
  schema is guaranteed ready before either tries to use it.
- **`talvyn_glitchtip`** (`glitchtip/glitchtip:latest`) — the GlitchTip web
  UI + API (port 8090). This is where unhandled exceptions from the backend
  (`sentry-sdk`, gated on `GLITCHTIP_DSN`) and frontend (`@sentry/nextjs`,
  gated on `NEXT_PUBLIC_GLITCHTIP_DSN`) actually get reported and reviewed.
- **`talvyn_glitchtip_worker`** (`glitchtip/glitchtip:latest`) — runs
  `./bin/run-celery-with-beat.sh`, GlitchTip's own Celery worker + beat
  scheduler. This is what actually processes incoming error events
  asynchronously (so reporting an error never slows down the request that
  triggered it) and runs GlitchTip's own periodic jobs (e.g. the recurring
  `uptime.dispatch_checks` task visible in its logs). Uses Redis **DB 1**
  (`redis://redis:6379/1`) specifically so its keys never collide with
  Talvyn's own Redis usage on DB 0.
- **All four depend on** `glitchtip-db` (healthy) and, except the DB itself,
  `glitchtip-migrate` (completed) + `redis` (healthy).

### Not in Docker

**Ollama** — runs natively on the host, not in a container.

- **Why Talvyn needs it this way:** Ollama is the actual brain of the
  platform — every test question, every score, every AI summary comes from
  it. Running it in Docker on a machine with an NVIDIA GPU requires
  `nvidia-container-toolkit` CDI configuration that conflicts with the
  simpler `daemon.json` runtime approach on Ubuntu. Running it natively
  sidesteps all GPU-in-Docker complexity entirely and gives Ollama direct,
  unmediated CUDA access — which matters because generation/evaluation
  latency is already the slowest part of the whole pipeline; adding a
  virtualization layer on top of the GPU would make it worse.
- **What it does:** Runs the actual LLM (Gemma 3, 1b/4b/12b/27b depending on
  detected hardware profile) that powers skill extraction, test generation,
  and evaluation. Backend and worker reach it via `host.docker.internal:11434`.

---

## Request Routing

All traffic enters through Nginx on port 80. Nginx routes by path prefix and enforces a structural JWT check (via embedded Lua) before forwarding to the backend.

### Admin requests

```text
Admin browser
    └─► http://localhost/ (Nginx :80)
            └─► Lua jwt_check.lua: validates NextAuth session cookie structure
                    └─► / → Next.js frontend :3000
                    └─► /api/v1/ → FastAPI backend :8000
                            └─► /api/proxy/api/v1/... (Next.js proxy injects X-Internal-Token)
```

### Candidate requests

```text
Candidate browser
    └─► /tests/[token] → Next.js frontend (renders invitation/exam UI)
    └─► /api/candidate/api/v1/attempts/... → Next.js public candidate proxy
            └─► FastAPI /api/v1/attempts/... (X-Attempt-Token where required)
```

Candidate attempt routes use the raw magic-link token, not the admin
`X-Internal-Token`. Admin API calls still go through `/api/proxy`, where Next.js
adds `X-Internal-Token` server-side.

### SSE streaming

```text
Frontend EventSource → /api/proxy/api/v1/tests/progress/{jd_id}/stream
    → Next.js proxy detects /stream suffix → uses native fetch() (not axios)
    → Pipes ReadableStream body directly to client (no buffering)
    → Nginx: proxy_buffering off; X-Accel-Buffering: no
```

---

## Data Flow — Full Pipeline

### 1. JD Upload and Skill Extraction

```text
Browser selects PDF/DOCX
    → frontend/wasm-parser (Rust → WebAssembly) tries client-side extraction first
        → success: extracted_text sent alongside the file in the same upload request
        → failure/unsupported: extracted_text omitted, server falls back to step below
Admin uploads PDF/DOCX
    → file_service: validate, save to filesystem or MinIO (per STORAGE_BACKEND)
    → if extracted_text was supplied: jd_service.finalize_client_extracted_jd()
        marks the JD DONE immediately — parser_service / PyMuPDF / python-docx skipped
    → otherwise: parser_service extracts raw text (PyMuPDF / python-docx) via thread pool
        → API: enqueue "task_parse_jd" to ARQ via Redis
        → ARQ worker picks up job → saves raw text to DB
    → API: enqueue "task_extract_skills" to ARQ
    → ARQ worker → JD text → Ollama → structured JSON
        → stored in jd_extracted_data (skills, topics, difficulty distribution)
    → Frontend polls /jd/{id}/status every 10–30s until complete (skipped entirely
      when the WASM fast path already returned parse_status=DONE in the upload response)
```

The file is always uploaded and stored either way — the WASM path only skips the
CPU-bound *parsing* step, not file storage. See [Key Design Decisions](#why-client-side-wasm-parsing-keeps-the-server-side-fallback).

### 2. Test Generation

```text
Admin clicks "Generate Tests"
    → API: enqueue "task_generate_tests" to ARQ via Redis
    → ARQ worker (max_jobs=1 enforces serial Ollama access)
    → test_generation_service.generate_tests_for_jd()
        → progress updates written to Redis every step
    → 3 sequential Ollama calls (TECHNICAL, REASONING, PROBLEM_SOLVING)
        → each: Pydantic validation → up to 3 correction prompts on failure
    → Validated GeneratedTestAI → persisted as Test + Questions rows
    → Frontend receives real-time progress via SSE (GET /tests/progress/{jd_id}/stream)
        → EventSource connects → backend yields Redis progress every 2s
```

### 3. Candidate Invitation

```text
Admin sends invitation (single, bulk CSV, or public assessment link):
    Single: POST /api/v1/invitations/ with {name, email, jd_id}
    Bulk:   POST /api/v1/invitations/bulk with {jd_id, candidates:[{email,name},...]}
        → CSV parsed client-side (JS) → sent as JSON → processed per-row
        → duplicates skipped, failures recorded per-row (batch never aborts)

    Public link:
        Admin creates link → POST /api/v1/public-links/jd/{jd_id}
        Candidate opens /apply/{slug}
        Candidate registers → POST /api/v1/public-links/{slug}/register
        → backend creates/reuses candidate and mints a private invitation token

invitation_service:
    → upsert candidate record (by email)
    → generate random UUID token
    → HMAC-SHA256(token, MAGIC_LINK_SECRET) → store hash in DB, email raw token
    → Candidate clicks link → /tests/[token]
    → Backend validates token against stored hash
```

### 4. Candidate Test Taking

```text
→ TestAttempt created (status: NOT_STARTED → IN_PROGRESS)
→ Test data served from Redis cache (approved tests cached 1h) or DB fallback
→ useAutoSave hook: bulk-saves all dirty answers every ~5s
→ useTestTimer hook: countdown, auto-submits at 0
→ useSuspiciousEvents: logs tab switches, copy events
→ Candidate submits → status: SUBMITTED
```

Candidate attempt requests are sent from the browser to the same-origin Next.js
public proxy at `/api/candidate/*`. That route only forwards allowlisted
candidate attempt endpoints to FastAPI and forwards `X-Attempt-Token` when
needed. This avoids exposing `INTERNAL_API_SECRET` or requiring direct public
browser access to the backend service.

Public assessment registration uses the same pattern via `/api/public/*`, but it
only forwards the public-link resolve/register endpoints. The shared
`/apply/<slug>` URL is not a candidate credential; it only identifies the
assessment. The private `/tests/<token>` URL created after registration is the
candidate credential.

### 5. AI Evaluation

```text
Admin triggers evaluation (or auto-triggered after submission)
    → evaluation_service.evaluate_attempt()
    → Load questions + candidate answers
    → MCQ: auto-scored (exact match, shuffle-aware)
    → Open-ended: asyncio.gather() → parallel Ollama calls per OE question
    → Aggregate Ollama call: strengths, weaknesses, recommendation, summary
    → Scores → Evaluation + QuestionFeedback rows saved atomically
    → embedding_service.generate_embedding() (opt-in, EMBEDDING_ENABLED=true):
        Ollama /api/embeddings with a dedicated model (default nomic-embed-text)
        embeds the AI summary/strengths/weaknesses text → stored on Evaluation.embedding
        → always best-effort: disabled flag, missing model, or any Ollama error
          all just leave embedding=NULL, never fails the evaluation pipeline
    → Admin can call GET /evaluation/{attempt_id}/verify-scores
        → PL/pgSQL function re-aggregates from question_feedback table directly
    → Admin can call GET /evaluation/{attempt_id}/similar
        → pgvector cosine-distance query ranks other evaluations by embedding similarity
        → returns [] (not an error) whenever embeddings are disabled or unavailable
```

---

## Database Schema

```text
users ──────────────────────────────────── Admin accounts (seeded on startup)

job_descriptions ──────────────────────── Uploaded JDs
    └── jd_extracted_data ────────────── AI-extracted skills (JSON)
    └── tests ─────────────────────────── Generated tests (3 per JD)
            └── questions ──────────────── MCQ/OE/Code questions
    └── invitations ──────────────────── Candidate invitations (token_hash stored)
            └── candidates ─────────────── Candidate identity (email)
            └── test_attempts ──────────── Per-candidate attempt
                    └── candidate_answers ─ Per-question answer (ON CONFLICT upsert)
                    └── suspicious_events ─ Tab-switch / copy log
                    └── evaluations ────── AI evaluation result (1:1 with attempt)
                            └── question_feedback ── Per-question AI score + feedback
```

### PL/pgSQL function

`calculate_evaluation_scores(p_attempt_id UUID)` — a stored Postgres function that
re-aggregates scores from the `question_feedback` table and returns a full breakdown
(MCQ / open-ended / code awarded vs max marks, percentage, pass/fail). Callable via
`GET /api/v1/evaluation/{attempt_id}/verify-scores`.

### Vector similarity (pgvector, opt-in)

`evaluations.embedding` is a nullable `vector(768)` column (postgres image is
`pgvector/pgvector:pg16`) with an HNSW cosine-similarity index. Disabled by default —
set `EMBEDDING_ENABLED=true` and `ollama pull nomic-embed-text` to enable. When enabled,
each evaluation's AI summary text is embedded and stored; `GET
/api/v1/evaluation/{attempt_id}/similar` ranks other evaluations by `embedding <=>
embedding` cosine distance. The `VectorType` SQLAlchemy type
(`backend/app/db/models/_types.py`) resolves to the native `vector` type on PostgreSQL
and falls back to JSON on SQLite so the test suite never needs the extension.

---

## Redis Key Space

| Key pattern | DB | TTL | Contents |
| --- | --- | --- | --- |
| `progress:{jd_id}` | 0 | 1 hour | `{step, pct, detail}` — generation progress |
| `test:{test_id}` | 0 | 1 hour | Serialised approved test + questions (candidate cache) |
| `test:jd:{jd_id}` | 0 | 1 hour | List of approved test IDs for a JD |
| `slowapi:user:{user_id}` | 0 | varies | Rate limit counters (managed by slowapi) |
| *(GlitchTip Celery keys)* | 1 | varies | GlitchTip uses DB 1 to avoid key collisions |

---

## File Storage

Controlled by `STORAGE_BACKEND` in `backend/.env`:

| Value | Backend | Notes |
| --- | --- | --- |
| `local` (default) | `uploads/` Docker volume | Single-server, no extra config |
| `s3` | MinIO container | Set `MINIO_*` env vars; bucket auto-created on first write |

`FileService` has identical public interface for both backends (`save_jd_file`, `read_file`, `delete_file`). Callers never branch on the backend type.

---

## Observability Stack

### Prometheus

Prometheus scrapes `http://backend:8000/metrics` (FastAPI instrumented via `prometheus-fastapi-instrumentator`) every 15 seconds. The `/metrics` endpoint is accessible on the Docker internal network — not proxied through Nginx. Web UI at `http://localhost:9090`.

### Grafana

Grafana is pre-provisioned with Prometheus as the default datasource (`grafana/provisioning/datasources/prometheus.yml`). No manual setup needed after `docker compose up`. Web UI at `http://localhost:3001`.

### GlitchTip

Self-hosted Sentry-compatible error tracking. Backend initialises the Sentry SDK (`sentry-sdk[fastapi]`) when `GLITCHTIP_DSN` is set. Frontend initialises `@sentry/nextjs` when `NEXT_PUBLIC_GLITCHTIP_DSN` is set. Both default to no-op when DSN is absent. GlitchTip uses its own Postgres database (`glitchtip-db`) and Redis DB 1. A one-shot init container (`glitchtip-migrate`) runs Django migrations before the web and worker containers start.

---

## Key Design Decisions

### Why client-side WASM parsing keeps the server-side fallback

`frontend/wasm-parser` (Rust → WebAssembly, compiled with `pdf-extract` and
`zip`+`quick-xml`) extracts PDF/DOCX text in the browser so the server can skip its own
PyMuPDF/python-docx parse for the common case. The server-side path
(`parser_service.py`) was deliberately kept as a fallback rather than removed: WASM
extraction can fail (corrupt files, scanned PDFs with no text layer, browsers that
block the WASM fetch), and the upload endpoint treats a missing/empty `extracted_text`
field as "parse it the normal way" rather than an error. The original file is always
uploaded and stored either way — only the CPU-bound text extraction step is skipped.

### Why pgvector embeddings are opt-in and best-effort

`EMBEDDING_ENABLED` defaults to `false` because it requires an extra Ollama model pull
(`nomic-embed-text`) that low-VRAM/CPU-only hardware profiles may not want to carry.
Even when enabled, `embedding_service.generate_embedding()` never raises — every
failure mode (model not pulled, Ollama unreachable, malformed response) logs a warning
and returns `None`, leaving `Evaluation.embedding` as `NULL`. The evaluation pipeline's
correctness never depends on embeddings succeeding.

### Why Nginx/OpenResty at the front door

OpenResty is Nginx with embedded LuaJIT. The `jwt_check.lua` script performs a structural JWT check (3 dot-separated base64 segments = looks like a NextAuth JWT) in <1ms at the proxy layer before any Python process is involved. This is a first-line filter only — full HMAC verification still happens in FastAPI via `getToken()`.

### Why SSE uses native fetch (not axios) in the Next.js proxy

Axios buffers the entire response before returning. For SSE streams, events would never be delivered until the stream closes (i.e., generation completes). The proxy detects `/stream` suffix and switches to native `fetch()` + `ReadableStream` pipe-through, which delivers events as they arrive. Axios's hidden `undici` headersTimeout is not an issue here because SSE headers are received immediately.

### Why Redis for progress tracking (not /tmp files)

The backend runs 4 uvicorn workers. Each worker is an independent OS process with its own memory and `/tmp` namespace view. A progress file written by worker #2 is not visible to worker #3 — the worker that handles the next poll request may be any of the 4.

Redis is a single shared store visible to all 4 workers and to the separate ARQ worker process. Progress writes and reads are atomic. Keys expire automatically (1h TTL) so stale progress never accumulates.

### Why ARQ for background jobs (not FastAPI BackgroundTasks)

FastAPI `BackgroundTasks` run inside the same event loop as request handlers. A 15-minute Ollama job blocks one of the 4 uvicorn workers for its entire duration. ARQ moves all Ollama work to a dedicated worker process. The API process enqueues a job ID in Redis and returns 202 immediately. Key properties:

- `max_jobs = 1` — only 1 Ollama job at a time, matching `OLLAMA_NUM_PARALLEL=1`
- `job_timeout` — computed dynamically as `ollama_timeout_seconds × (1 + max_retries) × 3 + 120s`
- Jobs survive container restarts (persisted in Redis until picked up)

### Why Ollama runs natively (not in Docker)

Consumer GPUs require direct CUDA device access. Docker GPU passthrough on Ubuntu introduces kernel module conflicts with certain driver versions. Running Ollama natively avoids all GPU-in-Docker complexity and gives the model full direct VRAM access.

### Why OLLAMA_MODEL must not be set in docker-compose environment

`docker-compose.yml` `environment:` keys override `env_file:` keys. `start.sh` writes the correct model to `backend/.env.hardware`, loaded via `env_file:`. If `OLLAMA_MODEL` is also set under `environment:`, the hardcoded value silently wins — hardware auto-detection is defeated.

### Why both Prisma and SQLAlchemy

Prisma lives in the frontend for type-safe database access in Next.js server components and API routes. SQLAlchemy lives in the backend for full async/await support, Alembic migrations, and complex queries. Both connect to the same PostgreSQL instance. **Alembic owns all schema changes.**

### Why the Next.js proxy for admin API calls

`INTERNAL_API_SECRET` must never reach the browser. The Next.js API route at `/api/proxy/[...path]/route.ts` runs server-side, injects the secret, and forwards the call to FastAPI. The browser never sees the token.

### Why sequential test generation (not parallel)

With `OLLAMA_NUM_PARALLEL=1` (required for ≤4 GB VRAM), parallel Python coroutines queue behind Ollama's single slot. The 2nd and 3rd requests wait 150s+ each in the queue, consuming timeout budget before they even start. Sequential calls ensure each completes within its own timeout.

---

## Auth Architecture

```text
┌─────────────────────────────────────────────────────────┐
│                    Admin Auth (NextAuth)                  │
│                                                           │
│  1. POST /api/auth/signin → credentials provider         │
│  2. authorize(): Prisma.user.findUnique → bcryptjs.compare│
│  3. On success: JWT signed with NEXTAUTH_SECRET          │
│  4. JWT stored in httpOnly cookie (8h expiry)            │
│  5. Nginx Lua: checks cookie structure on /api/v1/* paths│
│  6. middleware.ts: checks cookie on every /dashboard/*   │
│  7. /api/proxy: getToken() verifies JWT HMAC (no DB hit) │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│              Candidate Auth (Magic Links)                 │
│                                                           │
│  1. Admin creates invitation, or candidate registers      │
│     through /apply/<slug>                                 │
│  2. HMAC-SHA256(token, MAGIC_LINK_SECRET) → stored hash  │
│  3. Raw token emailed to candidate (never stored)        │
│  4. Candidate GETs /tests/[token]                        │
│  5. Backend: HMAC(token) == stored hash? → valid         │
│  6. Attempt created/resumed via /api/candidate proxy     │
│  7. Raw token forwarded as X-Attempt-Token where needed  │
│  8. Expires: 72 hours from invitation, or on submission  │
└─────────────────────────────────────────────────────────┘
```

---

## AI Prompt Strategy

All Ollama calls use:

- `"format": "json"` — Ollama's JSON mode constrains the token sampler to valid JSON
- `temperature: 0.1` — near-deterministic; reduces hallucination in structured output
- Fixed seeds per test type (101, 202, 303) — reproducible generation during retry loops
- Pydantic validation gate — every response is validated before DB writes
- Up to 3 correction prompts — if validation fails, the error is fed back to the model

```text
Initial prompt → Ollama response → Pydantic validation
    ✅ Pass → persist and return
    ❌ Fail → build correction prompt with errors + previous response (first 1200 chars)
         → Ollama → Pydantic validation (repeat up to 3 times)
         → 3rd failure → raise AIResponseParseError
```

---

## Performance Characteristics

Measured on reference hardware (i5-12500H + RTX 3050 4 GB, `gemma3:4b`):

| Operation | Time | Notes |
| --- | --- | --- |
| JD text extraction | < 1s | CPU-bound via thread pool (PyMuPDF / python-docx) |
| JD skill extraction | 30–90s | Single Ollama call |
| Test generation (3 tests) | 15–30 min | 3 sequential calls, each may need correction retries |
| MCQ auto-scoring | < 100ms | Pure Python, no Ollama, shuffle-aware |
| OE evaluation (2 questions) | 60–120s | 2 parallel Ollama calls |
| Aggregate evaluation | 30–60s | 1 Ollama call |
| Candidate test load | < 5ms after first | Served from Redis cache (approved tests cached 1h) |
| Page load (server components) | 200–800ms | ISR cached, 30s revalidate |
| Autosave round-trip | 50–200ms | Bulk upsert (`ON CONFLICT`), 1 DB call |
| Status poll | < 10ms | Reads 3 columns from DB |
| SSE event delivery | ~2s latency | Redis poll interval in the stream generator |
| Prometheus scrape | ~5ms | In-process counter reads, no I/O |
