# Talvyn

An AI-powered hiring assessment platform. Upload a job description, get three complete candidate tests generated automatically, send magic-link invitations, and receive AI-graded evaluation reports — all from a single admin dashboard.

---

## Quick Start

```bash
# 1. Clone the repo, then:
./start.sh          # auto-detects your GPU/CPU and starts everything

# 2. Open the admin dashboard
#    http://localhost        (port 80 — via Nginx reverse proxy)
#    Email: admin@talvyn.com (or SEED_ADMIN_EMAIL if you set one)
#    Password: whatever you set as SEED_ADMIN_PASSWORD in frontend/.env.local —
#    if unset, a random one is printed once in the frontend container logs
#    (docker compose logs frontend | grep seed)
```

`./start.sh` handles everything: hardware detection, model selection, Ollama startup, and Docker services. The admin account is seeded automatically on first startup — no manual setup needed.

```bash
./stop.sh           # stop all services (data is preserved)
./stop.sh --wipe-db # stop and delete all data (full reset)
```

---

## Documentation

| Who are you? | Where to go |
| --- | --- |
| HR manager / hiring admin | [docs/user-guide.md](docs/user-guide.md) — how to use the platform step by step |
| Developer setting up or contributing | [docs/developer-guide.md](docs/developer-guide.md) — architecture, local setup, commands |
| Deploying to a server | [docs/deployment.md](docs/deployment.md) — production deployment guide |
| Understanding the codebase | [docs/architecture.md](docs/architecture.md) — system design and technical decisions |

---

## What It Does

```text
Upload JD  →  AI extracts skills  →  3 tests generated  →  Invite candidates
     →  Candidates take timed test  →  AI grades submissions  →  View reports
```

Three test types are generated per JD: **Technical**, **Reasoning**, and **Problem Solving** — each with multiple-choice, open-ended, and optional code questions.

---

## Project Layout

```text
talvyn/
├── backend/           Python FastAPI + Ollama AI
├── frontend/          Next.js 16 admin dashboard + candidate test UI
├── nginx/             OpenResty config + Lua JWT guard
├── prometheus/        Prometheus scrape config
├── grafana/           Grafana provisioning (datasources)
├── docs/              All documentation
├── docker-compose.yml
├── start.sh           Smart launcher (auto-detects hardware)
└── stop.sh            Stops all services
```

Full structure explained in [docs/developer-guide.md](docs/developer-guide.md).

---

## Docker Services

`./start.sh` brings up the following services:

### Core (always running)

| Service | Purpose | Host Port |
| --- | --- | --- |
| `talvyn_nginx` | OpenResty — single entry point, Lua JWT guard | **80** |
| `talvyn_postgres` | PostgreSQL database (pgvector extension preinstalled) | 5436 |
| `talvyn_redis` | Progress tracking, rate limiting, job queue | — (internal) |
| `talvyn_mailpit` | Dev email catcher | 8026 (UI) |
| `talvyn_backend` | FastAPI — REST API + AI orchestration | 9000 (debug) |
| `talvyn_worker` | ARQ worker — runs Ollama jobs in isolation | — (internal) |
| `talvyn_frontend` | Next.js — admin dashboard + candidate UI | 3003 (debug) |

### Storage

| Service | Purpose | Host Port |
| --- | --- | --- |
| `talvyn_minio` | S3-compatible file storage (optional — activate with `STORAGE_BACKEND=s3`) | 9001 (API), 9002 (UI) |

### Observability (optional — can be omitted for minimal setups)

| Service | Purpose | Host Port |
| --- | --- | --- |
| `talvyn_prometheus` | Metrics scraper (pulls from `/metrics` on backend) | 9090 |
| `talvyn_grafana` | Metrics dashboards | 3001 |
| `talvyn_glitchtip` | Self-hosted error tracking web UI/API (Sentry-compatible) | 8090 |
| `talvyn_glitchtip_worker` | GlitchTip's own Celery worker + beat scheduler — processes incoming error events | — (internal) |
| `talvyn_glitchtip_migrate` | One-shot init container — runs GlitchTip's DB migrations once, then exits (this is expected — it's not meant to keep running) | — (internal) |
| `talvyn_glitchtip_db` | Dedicated Postgres for GlitchTip — never shares data with the main `talvyn_postgres` | — (internal) |

Ollama runs **natively on the host** (not in Docker) for full GPU/CUDA access.

> **Normal access is via port 80 (Nginx).** Direct ports 3003 and 9000 are open for debugging only.

---

## Hardware Profiles

`./start.sh` auto-picks the right model based on your GPU VRAM:

| Your GPU VRAM | Model used | Est. generation time |
| --- | --- | --- |
| ≥ 16 GB | gemma3:27b | ~3 min |
| ≥ 8 GB | gemma3:12b | ~6 min |
| ≥ 4 GB | gemma3:4b | ~15 min |
| ≥ 2 GB | gemma3:1b | ~6 min (fewer questions) |
| CPU only (≥16 GB RAM) | gemma3:4b | ~20–30 min |
| CPU only (< 16 GB RAM) | gemma3:1b | ~25–35 min |

Run `./start.sh --status` to see which profile your machine gets without starting anything.

The model is written to `backend/.env.hardware` and automatically loaded by Docker — **do not hardcode `OLLAMA_MODEL` in docker-compose.yml** or it will override the auto-detected value.

---

## What Was Improved (vs Original)

### Infrastructure

- **Redis** added for shared state across uvicorn workers (progress tracking, rate limiting, approved test cache)
- **ARQ worker** service isolates all Ollama jobs from the API process — jobs survive restarts, have proper timeouts, and are visible in logs
- **Nginx/OpenResty** reverse proxy on port 80 with embedded LuaJIT for structural JWT validation at the proxy layer (blocks unauthenticated requests before they reach Python)
- **MinIO** optional S3-compatible file storage — switch from local filesystem with `STORAGE_BACKEND=s3`
- **GlitchTip** self-hosted error tracking (Sentry-compatible) — zero overhead when `GLITCHTIP_DSN` is not set
- **Prometheus + Grafana** metrics stack — FastAPI exposes `/metrics`, Prometheus scrapes it every 15s, Grafana is pre-configured with Prometheus as the default datasource
- **Persistent admin seeding** — `admin@talvyn.com` is created automatically on every fresh stack, no manual `create-admin.sh` needed

### Bug Fixes

- Fixed inter-worker progress tracking: `/tmp` files don't work across 4 uvicorn workers — replaced with Redis
- Fixed rate limiter: in-memory counters per-worker allowed 4× the intended limit — replaced with Redis-backed storage
- Fixed `OLLAMA_MODEL` override: hardcoded value in docker-compose.yml was silently overriding `.env.hardware` (hardware auto-detection was being ignored)
- Fixed ARQ job timeout: was 700s (matching per-request limit), which killed 3-test generation jobs that legitimately take 15–30 min — now computed dynamically as `ollama_timeout × (1 + max_retries) × 3 tests`

### Features

- **Bulk candidate invite** — upload a CSV (`email,name` columns) to invite up to 50 candidates in one action; duplicates are skipped, failures reported per-row
- **Public assessment links** — create one `/apply/<slug>` link for a JD's approved tests; each candidate who registers receives a unique private `/tests/<token>` link
- **Candidate magic links** — invitations resolve to `/tests/<token>` on the configured `MAGIC_LINK_BASE_URL`; if email delivery fails, admins can copy the one-time link manually
- **Production auto-deploy** — a GitHub Actions self-hosted runner lives on the production box itself; when CI succeeds on `main` it updates the live checkout in place and rebuilds the Docker stack (no SSH hop)
- **Admin test preview** — "Preview as Candidate" button on every test opens a read-only candidate-like view with optional answer key reveal per question
- **SSE generation progress** — real-time Server-Sent Events stream for test generation progress (replaces polling)
- **PL/pgSQL score verification** — `GET /evaluation/{attempt_id}/verify-scores` re-aggregates scores directly from the database using a Postgres function
- **Client-side document parsing (WebAssembly)** — a Rust crate compiled to WASM extracts PDF/DOCX text in the browser before upload; the server-side parser remains as an automatic fallback if extraction fails
- **Semantic candidate similarity (pgvector, opt-in)** — `GET /evaluation/{attempt_id}/similar` ranks other candidates by AI-summary embedding similarity; disabled by default (`EMBEDDING_ENABLED=true` + `ollama pull nomic-embed-text` to enable)

### Performance (Session 1)

- Parallel open-ended evaluation (was sequential)
- Bulk autosave (was 1 request per answer)
- PostgreSQL `ON CONFLICT` upsert (was SELECT + INSERT/UPDATE)
- Persistent httpx client for Ollama (connection pooling)
- Native `fetch()` in server components (enables Next.js ISR caching)
- Adaptive polling backoff (fewer wasted requests)
- Slim status polling (was loading 50KB+ raw text on every 15s poll)
- SQL `DELETE` for test cleanup (was loading all ORM objects just to delete them)
- 4 uvicorn workers with thread pool for CPU-bound PDF parsing

### UX & Reliability

- Skeleton loading states on all admin pages (no more blank screen)
- Error boundaries at dashboard segment level
- Custom 404 pages (dashboard-scoped + global)
- Alembic migrations (replaced fragile `create_all` + hardcoded `ALTER TABLE`)
- Per-user rate limiting (per-IP was useless since all admin calls come from the same Next.js container)
- `SHOW_DOCS` flag to enable OpenAPI without enabling full debug mode
- Candidate-friendly error messages on the exam page (distinguishes 403 stale-token, 404, and 500 cases)
