# Talvyn Senior Architect Audit

Audit date: 2026-06-27  
Prepared for: follow-up review by Codex, Claude, Gemini, or another engineering agent  
Scope: repository tour, architecture/security/deployment review, and local verification. No source code was changed during this audit.

## Executive Summary

Talvyn is a modular monolith made of a Next.js 15 frontend, FastAPI backend, PostgreSQL with pgvector, Redis, ARQ worker, Ollama-based AI flows, and optional observability/storage services. The current codebase is much healthier than the older ignored audit in `codex-audit/Talvyn-full-project-audit.md`: backend tests pass, AI jobs are now Redis/ARQ-backed, migrations run in the production backend command, and candidate-attempt authorization has tests around it.

The main issues I found are production hardening and ownership-boundary issues:

1. Production still seeds a known Super Admin credential.
2. Admin backup/restore/reset/audit endpoints are not Super Admin-gated.
3. The backend Docker build can bake local `.env` secrets and heavyweight local artifacts into images because `backend/.dockerignore` is missing.
4. The production frontend image does not copy `public/`, which breaks runtime public assets such as the WASM parser.
5. Production frontend publishes host port `3003` on all interfaces instead of loopback.
6. Prisma schema has drifted far behind the SQLAlchemy/Alembic schema.

Production-readiness verdict: usable for controlled internal use, but not yet cleanly production-safe until the P0/P1 findings below are handled.

## Application Tour

### Runtime Topology

- Frontend: `frontend/`, Next.js 15 App Router, React 19, NextAuth credentials auth, Prisma for admin users.
- Backend: `backend/`, FastAPI, async SQLAlchemy, Alembic migrations, Pydantic schemas, service-layer orchestration.
- Data: PostgreSQL/pgvector, Redis for rate limits/progress/cache/job queue.
- AI: Ollama local model by default, optional GLM/OpenAI-compatible tier, Desklib/PyTorch AI text detector optional.
- Background work: ARQ worker in `backend/app/worker.py`.
- Reverse proxy: OpenResty/Nginx in dev compose; production compose expects a host-level proxy in front.
- Observability/dev tools: Prometheus, Grafana, GlitchTip, Mailpit, MinIO.

### Key Request Paths

- Admin browser -> Next.js session -> `/api/proxy/[...path]` -> FastAPI with `X-Internal-Token`.
- Candidate magic link -> public Next.js pages -> `/api/candidate/[...path]` or public FastAPI endpoints.
- JD upload -> Next API upload route -> FastAPI upload -> ARQ parse/extract/generate tasks.
- Question-bank exam -> candidate exam routes -> locked question subset -> batched evaluation after final section.

## Verification Run

Commands run locally:

| Check | Result |
| --- | --- |
| `backend/.venv_test/bin/pytest backend/tests/ -q` | Passed: 351 tests, 25 warnings |
| `npm run type-check` in `frontend/` | Passed |
| `npm run build` in `frontend/` | Passed |
| `npm run lint` in `frontend/` | Exit 0, but 71 warnings |
| `npm audit --omit=dev --audit-level=moderate` in `frontend/` | Failed audit: 2 moderate vulns via `next-auth -> uuid` |
| `backend/.venv_test/bin/pip-audit -r backend/requirements.txt` | Inconclusive: hung while creating audit env; manually interrupted |

Important note: running bare `backend/.venv_test/bin/pytest` from repo root collected backend service modules named `test_*` and failed before fixtures set env. The CI-style `backend/tests/` target passed.

## Severity Legend

- P0: high-risk production/security issue or data-destructive authorization gap.
- P1: likely production breakage, serious operational risk, or high-maintenance architecture drift.
- P2: important hardening/maintainability issue.
- P3: cleanup or developer-experience issue.

## Findings

### P0-1: Production Startup Seeds a Known Super Admin Credential

Evidence:

- `frontend/prisma/seed.ts:6-12` hardcodes `admin@talvyn.com` / `talvyn@r2026p#` as `SUPER_ADMIN`.
- `docker-compose.prod.yml:228` runs `npx prisma db seed && npm run start` in production.
- `README.md:13-16` advertises the same default login.

Impact:

On a fresh production database, the app can create a publicly documented Super Admin account. If the password is not immediately changed or disabled, this is a full administrative compromise. The seed also updates role drift back to `SUPER_ADMIN` for that email.

Recommended fix:

- Make production seeding opt-in.
- Drive initial admin credentials from required deployment secrets, not source code.
- Refuse to run production startup if default seed credentials are still configured.
- Add a startup/CI check that blocks `APP_ENV=production` with known default admin credentials.

### P0-2: Maintenance and Audit Endpoints Are Not Super Admin-Gated

Evidence:

- `backend/app/api/v1/admin.py:27-81` protects backup, reset, restore, and audit log with only `VerifiedInternal`.
- `frontend/src/app/(admin)/dashboard/settings/page.tsx:7-8` renders `SettingsClient` without role checks.
- `frontend/src/components/admin/Sidebar.tsx:70-75` makes Settings visible to every admin; only Users is marked `superAdminOnly`.
- `frontend/src/components/admin/SettingsClient.tsx:921-928` exposes maintenance and audit tabs without role checks.
- `frontend/src/components/admin/SettingsClient.tsx:454-506` calls backup/restore APIs.
- `frontend/src/components/admin/SettingsClient.tsx:637-644` calls reset data.

Impact:

Any authenticated admin appears able to download full hiring backups, restore arbitrary backup JSON, delete all product data, and read sensitive audit history. The backend cannot currently distinguish ordinary Admin from Super Admin because the proxy forwards actor id, not actor role.

Recommended fix:

- Add a backend `VerifiedSuperAdmin` dependency. Prefer querying the `users` table by `X-Actor-Id` over trusting a forwarded role header.
- Gate `/api/v1/admin/backup`, `/reset-data`, `/restore-data`, and `/audit-log`.
- Hide or disable Settings maintenance/audit tabs for non-Super Admin sessions.
- Add negative tests proving `ADMIN` receives 403 for these routes.

### P0-3: Backend Docker Builds Can Include Secrets and Local Artifacts

Evidence:

- Only `frontend/.dockerignore` exists; `backend/.dockerignore` is absent.
- `backend/Dockerfile:33-35` does `COPY . .`.
- Local ignored files exist in the backend build context: `backend/.env`, `backend/.env.hardware`, `backend/.venv`, `backend/.venv_test`, `backend/uploads`, `.pytest_cache`, `.ruff_cache`.
- Measured local artifact size: `backend/.venv` is about 114 MB and `backend/.venv_test` is about 342 MB.

Impact:

Docker build context can include local secrets, hardware config, test environments, cached files, and uploads. Even if runtime env vars override `.env`, copied secrets remain in image layers and can leak via image export/registry access. The build also becomes slower and larger.

Recommended fix:

- Add `backend/.dockerignore` immediately.
- Exclude `.env`, `.env.*`, `.venv`, `.venv_test`, `uploads`, caches, test artifacts, logs, and git metadata.
- Rebuild images after rotating any secrets that may have been baked into previous images.
- Optionally add CI that fails if Docker context contains `.env` files.

### P1-1: Production Frontend Image Does Not Copy `public/`

Evidence:

- `frontend/Dockerfile.prod:45-52` copies `.next`, `node_modules`, `package.json`, and `prisma`, but the `public` copy is commented out.
- `frontend/src/lib/wasm/jdParser.ts:17-18` loads `/wasm/talvyn_parser_bg.wasm`.
- `frontend/public/wasm/talvyn_parser_bg.wasm` exists in the repo and is the runtime asset for client-side PDF/DOCX extraction.

Impact:

In the production Docker image, public assets are missing. The WASM parser will fail to load and silently fall back to server-side parsing. Other public files can also 404. This may not fail `npm run build`, because the asset exists during build but is not copied to the runner stage.

Recommended fix:

- Uncomment/add `COPY --from=builder /app/public ./public`.
- Add a Docker image smoke test that runs the built container and verifies `/wasm/talvyn_parser_bg.wasm` returns 200.

### P1-2: Production Frontend Publishes Host Port on All Interfaces

Evidence:

- `docker-compose.prod.yml:210-213` publishes `"${FRONTEND_PORT:-3003}:3000"` without `127.0.0.1`.
- Backend is correctly loopback-bound at `docker-compose.prod.yml:73-79`.

Impact:

If the server firewall allows `3003`, users can reach the frontend directly over plain HTTP and bypass the intended host-level HTTPS/proxy entrypoint. This is especially risky for login/session traffic.

Recommended fix:

- Change to `127.0.0.1:${FRONTEND_PORT:-3003}:3000`.
- Document that only host Nginx/Caddy/Apache should expose public 80/443.
- Add deployment smoke check for externally open ports.

### P1-3: Production Compose Falls Back to Known Database Credentials

Evidence:

- `docker-compose.prod.yml:27-30` defaults to `talvyn_user` / `talvyn_pass` / `talvyn_db`.
- The same defaults are used in backend and frontend `DATABASE_URL` values at `docker-compose.prod.yml:85`, `169`, and `220`.

Impact:

If production env vars are missing, the database can start with known credentials. The database is not host-published, which lowers exposure, but this is still bad production posture and makes lateral movement easier after any container compromise.

Recommended fix:

- Require `POSTGRES_PASSWORD` in production using Compose variable checks, for example `${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}`.
- Do the same for `POSTGRES_USER`/`POSTGRES_DB` if they are meant to be unique per install.
- Keep developer defaults only in `docker-compose.yml`.

### P1-4: Prisma Schema Has Drifted from SQLAlchemy/Alembic Schema

Evidence:

- Backend `Candidate` includes `candidate_number`, `linkedin_url`, `resume_url`, and a `candidate_number_counters` table at `backend/app/db/models/candidate.py:33-81`.
- Backend `Invitation` includes public-link, termination, device, IP, and duplicate-device fields at `backend/app/db/models/candidate.py:122-173`.
- Prisma `Candidate` and `Invitation` in `frontend/prisma/schema.prisma:186-216` omit those fields.
- The frontend currently uses Prisma mostly for `User`, but the schema still models product tables.

Impact:

Two schema descriptions are now inconsistent. Any future Prisma use against candidates/invitations/tests can produce incorrect queries or accidental migrations. It also confuses other AI agents because the Prisma schema looks authoritative but is not.

Recommended fix:

- Make the ownership explicit: either trim Prisma to auth-only `User`, or regenerate/sync it from the real database schema.
- Add a doc note near `frontend/prisma/schema.prisma` that Alembic/SQLAlchemy own product schema.
- Add a CI check or script that detects drift for tables Prisma still declares.

### P1-5: Initial Alembic Migration Is Not Reproducible

Evidence:

- `backend/alembic/versions/2b330cc211ed_initial_schema.py:21-33` imports current models and calls `Base.metadata.create_all()`.

Impact:

The meaning of the initial migration changes as models change. A fresh database at an old commit and a fresh database at a new commit do not necessarily apply the same historical DDL for the same revision. Later migrations use many `IF NOT EXISTS` guards to compensate, but this weakens migration history as a source of truth.

Recommended fix:

- For future major stabilization, replace the initial migration with explicit table DDL or squash migrations into a deterministic baseline.
- Keep `backend-migrations` CI against fresh Postgres.
- Avoid adding more `create_all`-style migration logic.

### P2-1: Nginx JWT Guard Is Only Structural and May Not Match NextAuth Token Shape

Evidence:

- `nginx/lua/jwt_check.lua:7-17` says it only checks cookie shape, not signature.
- `nginx/lua/jwt_check.lua:53-57` lets any non-empty `X-Internal-Token` through the Lua guard. FastAPI still verifies the real token on protected backend routes.
- `nginx/lua/jwt_check.lua:64-70` requires exactly three dot-separated segments.

Impact:

This is not the primary auth boundary, but it is easy to over-trust in docs. NextAuth JWT cookies are commonly encrypted JWE-shaped tokens with five segments, not three, depending on configuration/version. Direct `/api/v1/*` browser calls can be rejected incorrectly even with a valid session. Conversely, the Lua guard bypasses itself for any non-empty internal-token header, relying on backend verification later.

Recommended fix:

- Document this as a coarse load-shedding filter only.
- Either remove the cookie segment-count check or make it compatible with actual NextAuth cookie format.
- If Nginx should be a real auth boundary, verify the token signature/decryption using the same secret or route all admin API traffic through Next.js only.

### P2-2: Port and Deployment Documentation Drift Remains

Evidence:

- `docker-compose.yml:195-216` comments say normal access is port 80, but the active Nginx mapping is `81:81`.
- `README.md:13-16`, `README.md:104`, and `README.md:131-133` still describe port 80.

Impact:

New operators and AI agents will start the wrong URL, debug the wrong topology, or mix dev/prod instructions.

Recommended fix:

- Pick a single local default or clearly document `80` vs `81` as environment-specific.
- Update README, docs, and start script output from one source of truth.

### P2-3: Frontend Lint Debt Is Allowed Through Builds

Evidence:

- `frontend/next.config.ts:5-11` sets `eslint.ignoreDuringBuilds = true`.
- `npm run lint` exited 0 but reported 71 warnings, including unused imports, `any`, unescaped entities, and hook dependency warnings.

Impact:

The build can stay green while hook dependency bugs or type safety erosion accumulate. This is not a release blocker today, but it weakens regression detection.

Recommended fix:

- Keep build lint disabled if needed for speed, but make CI run `npm run lint -- --max-warnings=0` after cleanup.
- Prioritize hook dependency warnings on candidate exam/autosave flows.

### P2-4: Production npm Audit Has Moderate Vulnerabilities

Evidence:

- `npm audit --omit=dev --audit-level=moderate` reports `next-auth <= 4.24.14` depends on vulnerable `uuid`.
- Current dependency is `next-auth` `^4.24.11` in `frontend/package.json:33-35`.
- Audit's suggested force fix is unsafe because it wants to install `next-auth@3.29.10`.

Impact:

Moderate vulnerability in production dependency tree. The reported `uuid` issue concerns buffer bounds checks in specific UUID versions; exploitability depends on whether affected APIs are used with attacker-controlled buffers.

Recommended fix:

- Do not run `npm audit fix --force`.
- Check whether a patched NextAuth v4 release or override is available.
- If no safe v4 path exists, document accepted risk or plan migration to Auth.js/NextAuth v5.

### P3-1: Some Server Routes Still Silently Fall Back on Missing Secrets

Evidence:

- Main proxy fails loudly for missing env at `frontend/src/app/api/proxy/[...path]/route.ts:82-95`.
- JD analyze route still uses `process.env.INTERNAL_API_SECRET ?? ""` at `frontend/src/app/api/jd/[id]/analyze/route.ts:20-27`.

Impact:

Misconfiguration can surface as generic backend 401/connection errors instead of an explicit proxy misconfiguration. This has already been fixed in the main proxy pattern but not consistently applied.

Recommended fix:

- Use `requireServerEnv()` in all server-only API proxies.
- Search for `?? "http://localhost:8000"` and `?? ""` in server routes and standardize behavior.

### P3-2: Public Proxy Documentation Contradicts Code

Evidence:

- `frontend/src/app/api/public/[...path]/route.ts:4-8` says no `INTERNAL_API_SECRET` is attached.
- `frontend/src/app/api/public/[...path]/route.ts:47-53` requires and forwards `X-Internal-Token`.

Impact:

The code is reasonable because the backend uses a verified internal token to trust forwarded client IP for rate limiting, but the comment can mislead future reviewers.

Recommended fix:

- Update the comment to explain that the public FastAPI route does not require auth, but the Next proxy still attaches internal proof for trusted client-IP forwarding.

### P3-3: Import-Time Settings and Engine Creation Make Tooling Fragile

Evidence:

- `backend/app/db/base.py:48-49` creates the SQLAlchemy engine at import time.
- `backend/tests/conftest.py:15-33` must set env before importing app modules.
- Bare `backend/.venv_test/bin/pytest` from repo root failed because service modules named `test_generation_service.py` and `test_service.py` were collected before fixture env was applied.

Impact:

Tests pass when run as CI expects, but generic tooling and ad-hoc pytest invocation are fragile. Other agents may misread the root-level collection failure as an app failure.

Recommended fix:

- Set pytest `testpaths = backend/tests` and/or `python_files = test_*.py` scoped to tests in root/backend config.
- Consider lazy engine creation or app-factory style dependency injection in future.

## Notable Strengths

- Backend test coverage is substantial: 351 tests passed.
- ARQ/Redis background processing is in place and worker service exists in both dev and prod compose.
- Production backend command runs `prestart.sh` and Alembic before Uvicorn.
- Alembic now has a PostgreSQL advisory lock in `backend/alembic/env.py`.
- Candidate attempt routes have token-ownership tests and bank-mode guard tests.
- Upload path validates file type/size and uses dedicated upload route instead of the generic JSON proxy.
- Main authenticated proxy has good body-size limits and explicit env misconfiguration handling.
- Rate limiting uses Redis and endpoint-style keys, avoiding per-path-id bypass.

## Stale Older Audit Warning

`codex-audit/Talvyn-full-project-audit.md` is ignored by git and contains several findings that are now stale or explicitly marked as false. Do not copy its P0 list forward without re-verifying. In this pass:

- Backend tests pass.
- Production backend command does run migrations.
- ARQ worker exists and is documented in prod compose.
- Candidate attempt token paths appear covered by tests.
- `.env` files are not tracked by git, but they can still be included in backend Docker images because the backend build context lacks `.dockerignore`.

## Suggested Next Work Order

1. Remove production default admin seed or make it secret-driven.
2. Add backend Super Admin authorization for backup/restore/reset/audit.
3. Add `backend/.dockerignore` and rebuild images after rotating any image-baked secrets.
4. Fix frontend production Dockerfile to copy `public/`.
5. Bind production frontend port to `127.0.0.1`.
6. Resolve Prisma schema ownership/drift.
7. Fix docs port drift and update README default-credential wording.
8. Address npm audit finding without unsafe force-downgrade.
9. Clean lint warnings, especially hook dependency warnings in candidate flows.
