# DevOps Documentation

> Audience: DevOps engineers and new developers setting up Talvyn locally
> or operating it in production. This file is the operational reference —
> for narrative architecture rationale see `docs/architecture.md`, for the
> full first-time production walkthrough see `docs/deployment.md`, and for
> day-to-day development workflows see `docs/developer-guide.md`.
>
> All counts and file paths below are sourced from `docs/enterprise/_facts.md`
> (verified directly against the repository on 2026-06-18) and from direct
> reads of the cited files. Where this document and `_facts.md` disagree,
> `_facts.md` is correct.

---

## Local Development Setup

Condensed path — see `docs/developer-guide.md` ("Local Setup") for full
prose and `docs/deployment.md` for the production-server equivalent.

1. **Clone the repo and enter it.**
   ```bash
   git clone <repo-url>
   cd Talvyn
   ```
2. **Copy environment templates.**
   ```bash
   cp .env.example .env
   cp backend/.env.example backend/.env
   cp frontend/.env.local.example frontend/.env.local
   ```
3. **Set the shared secret.** `INTERNAL_API_SECRET` must be identical in
   `backend/.env` and `frontend/.env.local` (generate with
   `openssl rand -hex 32`).
4. **Install Ollama natively** (not in Docker —
   `curl -fsSL https://ollama.com/install.sh | sh`). Ollama needs direct
   GPU/CUDA access that Docker-on-Ubuntu GPU passthrough complicates; see
   `docker-compose.yml`'s comment block above the (absent) `ollama` service
   for the specific reasoning.
5. **Run `./start.sh`.** This is a hardware-aware launcher, not a plain
   `docker compose up` wrapper. It:
   - Detects GPU VRAM / CPU / RAM and picks one of **6 hardware profiles**:
     `ultra` (≥16GB VRAM, `gemma3:27b`), `high` (≥8GB, `gemma3:12b`),
     `medium` (≥4GB, `gemma3:4b`), `low` (≥2GB, `gemma3:1b`), `cpu_fast`
     (no GPU, ≥16GB RAM, `gemma3:4b`), `cpu_slow` (no GPU, <16GB RAM,
     `gemma3:1b`). Each profile also tunes MCQ/open-ended question counts,
     Ollama parallelism, and generation timeout.
   - Writes the chosen profile to `backend/.env.hardware` (gitignored,
     auto-generated — never hand-edit it, and never duplicate its keys into
     `docker-compose.yml`'s `environment:` block, which would silently
     override it and defeat hardware detection).
   - Starts Ollama natively, pulls the selected model if missing, then runs
     `docker compose up -d --no-recreate`.
   - Supports `./start.sh --status` (show the detected profile without
     starting anything) and `./start.sh --cpu-only` (force CPU inference).
6. **Access the stack.**
   - **Actual current state (per `_facts.md` §8/§13): nginx is published on
     host port `81`, not 80.** `docker-compose.yml` has the `"80:80"` line
     commented out in favor of `"81:81"`, because port 80 was already bound
     by another service on the verification host. This means the stack is
     reachable at `http://localhost:81`, **not** `http://localhost` as both
     `docs/developer-guide.md` and `docs/deployment.md` state. See
     [Known Drift](#known-drift-three-deployment-topologies) below — this is
     not a typo in this document, it is a live discrepancy between the repo
     and its own docs.
   - Direct container ports remain open for debugging regardless of the
     nginx port: frontend `:3003`, backend `:9000`, Mailpit UI `:8026`,
     Ollama `:11434`.
   - Default seeded admin account (created automatically by
     `frontend/prisma/seed.ts` on first container start — see
     [Build / Release / Rollback](#build--release--rollback)):
     `acmeai@Talvyn.com` / `acmeai@r2026p#`. Change it immediately via
     Settings.
7. **Stop the stack** with `./stop.sh` (preserves DB volumes) or
   `./stop.sh --wipe-db` (drops volumes — irreversible).

---

## Docker / All Containers

14 services run under `docker compose up` (`docker-compose.yml`, confirmed
count per `_facts.md` §8). The *why* for each service — the specific problem
it solves for Talvyn, not generic tool description — lives in
`docs/architecture.md`'s "Service Inventory" section; this is a short index,
not a duplicate of that rationale.

| Service | One-liner |
|---|---|
| `postgres` | Primary application database, image `pgvector/pgvector:pg16` (drop-in Postgres 16 with the `vector` extension preinstalled for opt-in embedding similarity search). |
| `redis` | Shared state across the backend's 4 uvicorn worker processes — generation progress tracking and rate-limit counters. |
| `mailpit` | Local SMTP catcher for development; outgoing email never leaves the host. Web UI on `:8026`. |
| `backend` | FastAPI app server (4 uvicorn workers), runs Alembic migrations via `prestart.sh` before serving traffic. |
| `worker` | ARQ background job runner; shares the backend's Docker image but overrides the command to run `arq` instead of `uvicorn`. Isolates long-running Ollama calls off the request path. |
| `frontend` | Next.js 15 app (admin dashboard + candidate test UI), built from `frontend/Dockerfile.dev` in this compose file (dev-mode live reload). |
| `nginx` | OpenResty (nginx + LuaJIT), single entry point in front of frontend/backend, runs `nginx/lua/jwt_check.lua` as a fast structural JWT guard before requests reach Python. |
| `minio` | S3-compatible object storage, optional alternative to local-filesystem JD file storage (`STORAGE_BACKEND=s3`). |
| `glitchtip-db` | Dedicated Postgres instance for GlitchTip — kept fully separate from the application's own `postgres` service. |
| `glitchtip-migrate` | **One-shot job.** Runs Django migrations for GlitchTip once, then exits 0. `restart: "no"`. **An `Exited (0)` status for this container is correct, expected behavior — not a crash.** `glitchtip` and `glitchtip-worker` both wait on `service_completed_successfully` for this container before starting, so don't "fix" it by restarting it or adding a restart policy. |
| `glitchtip` | Self-hosted Sentry-compatible error tracking web UI and API, port `8090`. |
| `glitchtip-worker` | GlitchTip's Celery worker + beat scheduler, processes error events asynchronously. |
| `prometheus` | Scrapes `backend:8000/metrics` every 15s (internal Docker network, not proxied through nginx). UI on `:9090`. |
| `grafana` | Dashboard UI on `:3001` for the Prometheus data; Prometheus is auto-provisioned as the default datasource via `grafana/provisioning/datasources/prometheus.yml`. |

Full per-service architectural rationale (why ARQ instead of
`BackgroundTasks`, why Ollama is excluded from this list and runs natively,
why Redis instead of a `/tmp` file, etc.): see `docs/architecture.md` →
"Service Inventory — Why Each Container Exists and What It Does".

**Healthchecks** exist for `postgres`, `redis`, `minio`, `glitchtip-db`.
Explicitly disabled for `worker` (no HTTP server to probe — the backend
image's healthcheck would otherwise sit permanently unhealthy). Absent
(simply not configured, not necessarily a defect) for `backend`, `frontend`,
`nginx`, `glitchtip`, `glitchtip-worker`, `prometheus`, `grafana`.

---

## Environment Variables

Every variable across all 4 env-related files plus the vars that exist only
inline in `docker-compose.yml` (never templated in any `.env.example`).
Counts and file inventory per `_facts.md` §10; purposes and defaults read
directly from each file.

### Root `.env` (from `.env.example` — 4 vars)

| Variable | Purpose | Required? | Default |
|---|---|---|---|
| `POSTGRES_USER` | Postgres superuser for the main app database. | Yes | `change_me_in_production` not set — example shows `jdadmin`; `docker-compose.yml` falls back to `talvyn_user` if unset |
| `POSTGRES_PASSWORD` | Postgres superuser password. | Yes | none in example (placeholder `change_me_in_production`); compose fallback `talvyn_pass` |
| `POSTGRES_DB` | Main application database name. | Yes | example shows `jd_assessment`; compose fallback `talvyn_db` |
| `INTERNAL_API_SECRET` | Shared HMAC/JWT secret between Next.js and FastAPI — must be identical to the same-named var in `backend/.env` and `frontend/.env.local`. Min 32 chars. | Yes | placeholder `change_me_in_production_32_char_min`; generate via `openssl rand -hex 32` |

### `backend/.env` (from `backend/.env.example` — 24 vars)

| Variable | Purpose | Required? | Default |
|---|---|---|---|
| `APP_ENV` | Environment name, affects logging mode (`debug` flag downstream). | No | `development` |
| `APP_NAME` | Display name used in logs/docs metadata. | No | `JD Assessment API` |
| `APP_VERSION` | Version string surfaced in app metadata. | No | `0.1.0` |
| `DEBUG` | Enables verbose console logging and `/docs` (unless `SHOW_DOCS` is used instead). | No | `true` |
| `HOST` | Bind address for uvicorn. | No | `0.0.0.0` |
| `PORT` | Bind port for uvicorn. | No | `8000` |
| `DATABASE_URL` | Async Postgres connection string (`postgresql+asyncpg://...`). | Yes | `postgresql+asyncpg://jdadmin:jdpassword@localhost:5432/jd_assessment` (placeholder) |
| `INTERNAL_API_SECRET` | Must match the frontend and root values. | Yes | placeholder `change_me_in_production_32_char_min` |
| `ALLOWED_ORIGINS` | Comma-separated CORS allowlist. | No | `http://localhost:3000` |
| `OLLAMA_BASE_URL` | URL the backend uses to reach Ollama. | Yes | `http://localhost:11434` (Docker uses `http://host.docker.internal:11434`, set directly in `docker-compose.yml`) |
| `OLLAMA_MODEL` | Model tag for generation/evaluation calls. | Yes | `gemma3:12b` in the example — **but intentionally absent from `docker-compose.yml`'s `environment:` block**; in Docker it comes from `backend/.env.hardware` instead, written by `start.sh` |
| `OLLAMA_TIMEOUT_SECONDS` | Per-request Ollama timeout. | No | `600` (10 min) |
| `OLLAMA_MAX_RETRIES` | Retry count for failed Ollama calls. | No | `3` |
| `EMBEDDING_ENABLED` | Opt-in flag for pgvector similarity search ("candidates like this one"). | No | `false` |
| `OLLAMA_EMBEDDING_MODEL` | Embedding model tag; must be pulled separately (`ollama pull nomic-embed-text`) before enabling. | No | `nomic-embed-text` |
| `STORAGE_BACKEND` | `local` filesystem or `s3` (MinIO/S3-compatible). | No | `local` |
| `UPLOAD_DIR` | Local filesystem path for uploaded JD files (only used when `STORAGE_BACKEND=local`). | No | `./uploads` |
| `MAX_UPLOAD_SIZE_MB` | Upload size cap enforced by the backend. | No | `10` |
| `RESEND_API_KEY` | Production email provider API key. | No (Yes in production if `SMTP_HOST` unset) | `re_your_key_here` (placeholder) |
| `EMAIL_FROM` | From-address for outgoing email. | No | `noreply@yourdomain.com` |
| `EMAIL_FROM_NAME` | Display name for outgoing email. | No | `JD Assessment Platform` |
| `MAGIC_LINK_BASE_URL` | Base URL embedded in candidate invitation links. | Yes | `http://localhost:3000` |
| `MAGIC_LINK_EXPIRY_HOURS` | Candidate invitation link lifetime. | No | `72` |
| `MAGIC_LINK_SECRET` | HMAC secret signing candidate attempt tokens; only the hash is stored in the DB. | Yes | placeholder `change_me_in_production_32_char_min` |

Two vars referenced in `docs/developer-guide.md`'s env table but **not** in
`backend/.env.example` (set instead directly in `docker-compose.yml` per
service, or undocumented elsewhere): `REDIS_URL` (set inline as
`redis://redis:6379` in the `backend`/`worker` service blocks) and
`SMTP_HOST`/`SMTP_PORT` (set inline to `mailpit`/`1025` for the dev compose
file only — leave unset in production to fall back to Resend). `SHOW_DOCS`
and `GLITCHTIP_DSN` are also real backend settings (see
`docs/developer-guide.md`) but likewise absent from the `.env.example`
template — treat the template as a baseline, not an exhaustive settings
list; `backend/app/config.py` is the actual source of truth for every
setting the app reads.

### `frontend/.env.local` (from `frontend/.env.local.example` — 6 vars)

| Variable | Purpose | Required? | Default |
|---|---|---|---|
| `NEXTAUTH_SECRET` | NextAuth JWT signing secret. | Yes | placeholder `change_me_in_production_base64_string`; generate via `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Public URL of the frontend, used by NextAuth for callback construction. | Yes | `http://localhost:3000` |
| `FASTAPI_INTERNAL_URL` | Server-side-only URL Next.js uses to reach FastAPI directly (never sent to the browser). | Yes | `http://localhost:8000` (Docker overrides to `http://backend:8000`) |
| `NEXT_PUBLIC_API_URL` | Public-facing API base URL used by browser code for direct candidate-attempt calls. | Yes | `http://localhost:3000/backend` (Docker overrides to `http://localhost:9000`) |
| `INTERNAL_API_SECRET` | Must match `backend/.env` and root `.env`. | Yes | placeholder `change_me_in_production_32_char_min` |
| `DATABASE_URL` | Postgres URL for Prisma client generation/migrations. | Yes | `postgresql://jdadmin:jdpassword@localhost:5432/jd_assessment` (Docker overrides inline) |

Two more vars are real and documented in `docs/developer-guide.md` but not
present in `frontend/.env.local.example`: `NEXT_PUBLIC_GLITCHTIP_DSN`
(client-side GlitchTip DSN, optional) and `GLITCHTIP_DSN` (SSR GlitchTip
DSN, optional) — both gate Sentry/GlitchTip SDK initialization in
`sentry.client.config.ts` / `sentry.server.config.ts` and are no-ops when
unset.

### `docker-compose.yml`-only vars (no `.env.example` anywhere)

These are referenced directly in `docker-compose.yml`'s `environment:`
blocks with inline fallback defaults — there is no template file to copy;
set them in the root `.env` (Compose reads root `.env` automatically) if you
need non-default values.

| Variable | Service | Purpose | Required? | Default |
|---|---|---|---|---|
| `GLITCHTIP_SECRET_KEY` | `glitchtip`, `glitchtip-migrate`, `glitchtip-worker` | Django `SECRET_KEY` for GlitchTip. | No (change before any real deployment) | `changeme-generate-with-openssl-rand-hex-32` |
| `GLITCHTIP_DOMAIN` | `glitchtip`, `glitchtip-migrate`, `glitchtip-worker` | Public URL GlitchTip uses to construct links (e.g. in emails). | No | `http://localhost:8090` |
| `GRAFANA_USER` | `grafana` | Grafana admin username. | No | `admin` |
| `GRAFANA_PASSWORD` | `grafana` | Grafana admin password. | No (change before any real deployment) | `talvyn_grafana` |
| `MINIO_ROOT_USER` | `minio` | MinIO root/admin user. | No | `talvyn_minio` |
| `MINIO_ROOT_PASSWORD` | `minio` | MinIO root/admin password. | No (change before any real deployment) | `talvyn_minio_pass` |

### `backend/.env.hardware` (auto-generated, not a template)

Written by `start.sh`, gitignored, **not** hand-edited and **not** copied
into `docker-compose.yml`'s `environment:` block (that would override
`env_file:` values and break hardware auto-tuning):

| Variable | Purpose | Example |
|---|---|---|
| `OLLAMA_MODEL` | Model tag chosen from the detected hardware profile. | `gemma3:4b` |
| `OLLAMA_TIMEOUT_SECONDS` | Per-request timeout for the detected profile. | `600` |
| `TEST_MCQ_COUNT` | MCQ questions generated per test for this profile. | `5` |
| `TEST_OE_COUNT` | Open-ended questions generated per test for this profile. | `2` |
| `TEST_SEQUENTIAL_GENERATION` | Whether Ollama calls run sequentially (required at ≤4GB VRAM) or in parallel. | `true` |

---

## Build / Release / Rollback

### Build

- **Backend** (`backend/Dockerfile`): single-stage `python:3.12-slim`,
  installs system deps (`gcc`, `libffi-dev`, `libssl-dev`, `curl`) needed by
  PyMuPDF and friends, installs `requirements.txt`, copies app code, makes
  `prestart.sh` executable, exposes `8000` with a `curl`-based
  `HEALTHCHECK` against `/api/v1/health`. The container's `CMD` always runs
  `prestart.sh` (Alembic migrations under a Postgres advisory lock) before
  starting `uvicorn --workers 4`. The `worker` service reuses this exact
  image but overrides the command to `python -m arq app.worker.WorkerSettings`
  and does **not** re-run `prestart.sh` (the `backend` container already
  applied migrations).
- **Frontend, development** (`frontend/Dockerfile.dev`, used by
  `docker-compose.yml`): installs `node_modules` and runs `prisma generate`
  at **image build time** (not container start), so `docker compose up`
  starts in ~2 seconds instead of 30–120. Source is bind-mounted at runtime
  for Turbopack hot reload; an anonymous volume at `/app/node_modules`
  intentionally shadows the bind mount so the pre-installed dependencies
  inside the image win over whatever (or nothing) exists on the host path.
  Rebuild only when `package.json`, `package-lock.json`, or
  `prisma/schema.prisma` change (`docker compose build frontend`).
- **Frontend, production**: `docker-compose.prod.yml` references
  `frontend/Dockerfile.prod` (multi-stage production build, no live-reload,
  no source volume — code is baked into the image). This is a separate
  Dockerfile from the dev one described above.

### Release

The only CI pipeline in the repo is `.github/workflows/ci.yml`, triggered on
push/PR to `main`. It has exactly two jobs:

1. `backend-tests` — Python 3.12, `pytest tests/ -x -q` against an
   in-memory SQLite database.
2. `frontend-checks` — Node 20, `npm ci`, `prisma generate`, lint,
   type-check, `next build`.

**Be plain about what this is not:** there is no deployment job, no E2E
job, no migration-against-Postgres check, no image publish/push step, and
no step that touches any server. Merging to `main` runs tests only — it
does not build or ship a release artifact, and it does not deploy anything.
Getting code onto a server today is a manual process: SSH in (or `rsync`),
`git pull`, then `docker compose up -d --build` per `docs/deployment.md`'s
"Update the application" section.

### Rollback

**No rollback procedure is documented or scripted anywhere in this
codebase.** This is a real gap, not an oversight in this document:

- `docs/deployment.md` documents *forward* updates only
  (`git pull` → `docker compose up -d --build` →
  `alembic upgrade head`) with no corresponding "go back to the previous
  version" steps, no tagged-release pinning, and no documented Alembic
  downgrade workflow (Alembic supports `alembic downgrade <revision>`
  mechanically, but no script or doc instructs an operator to use it).
- The only rollback-adjacent reference in the repo is a single backlog line
  in the stale `docs/Talvyn-codebase-analysis-report.md`
  ("Add database migration rollback notes" — listed as a *medium-priority
  open suggestion*, not something implemented).
- There is no container image tagging/versioning scheme (images are built
  fresh from `latest` source on each `--build`), so "redeploy the previous
  image" is not currently possible without manually checking out an older
  git commit first.

If you need a rollback today: `git checkout <previous-commit>` on the
server, then `docker compose up -d --build`, then manually verify whether
an `alembic downgrade` is needed (and run it by hand if so) — none of this
is automated or scripted. Flag this as a gap for the team to close
deliberately rather than treating the steps above as a sanctioned
procedure.

---

## Monitoring

- **Logging.** `backend/app/core/logging.py` configures `structlog` once at
  startup via `configure_logging(debug=...)`. In debug mode it renders
  human-readable colored console output (`structlog.dev.ConsoleRenderer`);
  otherwise it emits JSON (`structlog.processors.JSONRenderer`, with
  `dict_tracebacks` for structured exception info) suitable for log
  aggregators. Standard library `logging` is rebound to flow through the
  same processor chain, so third-party library logs land in the same
  format. Get a logger anywhere via `get_logger(name)`.
- **Metrics.** Prometheus (`prometheus` service) scrapes
  `backend:8000/metrics` every 15 seconds, per `prometheus/prometheus.yml`,
  over the internal Docker network — this endpoint is not proxied through
  nginx. Instrumentation is wired in `backend/app/main.py` (app factory).
  Grafana (`grafana` service, UI on `:3001`) auto-provisions Prometheus as
  its default datasource via
  `grafana/provisioning/datasources/prometheus.yml` — no manual datasource
  setup is needed after first boot. No dashboard JSON files were found
  under `grafana/provisioning/` at the time of writing, so dashboards (if
  any exist) are not currently version-controlled with the repo.
- **Alerting.** **No alerting is configured.** There is no Prometheus
  Alertmanager service in `docker-compose.yml`, no `alerting` rules file
  referenced by `prometheus/prometheus.yml`, and no Grafana alert-rule
  provisioning directory under `grafana/provisioning/`. Metrics are
  collected and visualizable, but nothing currently pages or notifies
  anyone on a threshold breach. Treat this as an explicit gap, not an
  implied "alerts exist somewhere else."
- **Error tracking.** GlitchTip (self-hosted, Sentry-protocol-compatible)
  runs as three services — `glitchtip-db`, `glitchtip-migrate`,
  `glitchtip-worker` — plus the `glitchtip` web/API service on host port
  `8090`. It is **opt-in**: the backend and frontend SDKs
  (`@sentry/nextjs` client/server config, backend GlitchTip init in
  `app/main.py`) only activate when a DSN is supplied
  (`GLITCHTIP_DSN` backend/env, `NEXT_PUBLIC_GLITCHTIP_DSN` /
  `GLITCHTIP_DSN` frontend). With no DSN set, error tracking is silently a
  no-op — nothing fails, errors just aren't forwarded anywhere. First-run
  setup requires visiting `http://localhost:8090` (or `:81/...` /
  whatever the actual nginx port is — see drift note below), creating an
  account and project by hand, and pasting the resulting DSN into the env
  files.

---

## Known Drift: Three Deployment Topologies

This section exists specifically to surface a real, currently-unresolved
inconsistency in how this repository describes "running Talvyn in
production." **Three different sources disagree with each other on
topology, port, and reverse-proxy model.** Per `_facts.md` §13, this is
flagged here deliberately and is **not resolved** as part of this
documentation work — no recommendation is made about which model is
"correct," and nothing is proposed for deletion. This needs an explicit
decision from the team.

| Source | Topology | Port | Reverse proxy |
|---|---|---|---|
| `docker-compose.yml` (current, primary dev/local stack) | 14 services, fully containerized | nginx on host **81** (the `"80:80"` line is commented out in the file in favor of `"81:81"`) | OpenResty + Lua JWT guard (`nginx/lua/jwt_check.lua`), running inside Docker |
| `docker-compose.prod.yml` | Only 3 services: `postgres`, `backend`, `frontend` | Expects a **host-level** nginx on 80/443 in front of it | Host-level nginx (installed via `apt`, not in Docker) — this is the model `docs/deployment.md` walks through step-by-step |
| `deploy-ngrok.sh` _(removed 2026-08-05)_ | Reuses the full dev stack (from `docker-compose.yml`) plus a separate, additional nginx process | **8080** (chosen specifically to avoid clashing with Apache, which the script assumes owns port 80) | A standalone nginx config on 8080 + an ngrok tunnel for public HTTPS |

> **Update (2026-08-05):** `deploy-ngrok.sh` and the ngrok proxy branching
> have been **removed** from the repository. The tunnel-based topology
> described in the row above is retained here only as historical context;
> production now runs a stable domain behind a reverse proxy
> (`docker-compose.prod.yml` + host Nginx/Certbot, per `docs/deployment.md`).

Concretely, this means:

- `docs/deployment.md` currently documents **only the second model**
  (`docker-compose.prod.yml` + host nginx on 80/443) — start to finish, as
  if it were the only way to deploy. Someone following it literally will
  end up with a 3-container stack with no nginx-in-Docker, no MinIO, no
  GlitchTip, no Prometheus/Grafana, and no Lua JWT guard — a materially
  different system from what `docker-compose.yml` produces locally or what
  `docs/architecture.md`'s diagrams describe.
- `docs/developer-guide.md` and `docs/deployment.md` both still say "access
  via port 80" / `http://localhost`, while the actual `docker-compose.yml`
  in this repo publishes nginx on **81**. Anyone following either doc's
  literal port number locally will get a connection refused.
- `deploy-ngrok.sh` is a **third**, independently-maintained path to "make
  this reachable from outside localhost," with its own port (8080) and its
  own nginx process, undocumented anywhere in `docs/`.
- Separately (found while reading these files for this section, not part
  of the topology table itself): `docker-compose.prod.yml` currently
  contains **unresolved git merge-conflict markers**
  (`<<<<<<< HEAD` / `=======` / `>>>>>>> 26362fc`) inside the `backend`
  service's `environment:` block, around the `DATABASE_URL`/
  `OLLAMA_BASE_URL` lines. The file is committed in this state, so as
  written it would fail to parse as valid YAML if someone actually ran
  `docker compose -f docker-compose.prod.yml up`. This is additional,
  concrete evidence that the third-topology file is not currently a tested,
  living deployment path — it is flagged here for the team's awareness, not
  fixed by this documentation pass.

No action is taken here beyond stating these facts plainly. Deciding which
topology is the supported one (and updating `docs/deployment.md`,
`docker-compose.prod.yml`, and the port references across
`docs/developer-guide.md` accordingly) is a team decision outside the scope
of this documentation effort.
