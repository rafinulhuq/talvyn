# Dev/Prod Deployment Drift Fixes

Date: 2026-06-21

User-reported: changes made for local development (env config, docker
compose edits) kept causing production to break. Investigated the actual
gap between `docker-compose.yml` (dev) and `docker-compose.prod.yml` (prod)
and the documented deployment flow in `docs/deployment.md`, rather than
guessing — found two confirmed, concrete bugs and a doc that conflated the
two compose files throughout.

## Bug 1: Production never applied Prisma migrations

`docker-compose.prod.yml`'s frontend service had no `command:` override,
so it ran `Dockerfile.prod`'s default `CMD ["npm", "run", "start"]`. The
only Prisma step anywhere in the production build is `npx prisma generate`
in `Dockerfile.prod` — which regenerates the typed client from
`schema.prisma`, but never touches the actual database. Compare to the
backend, which already runs `alembic upgrade head` via `prestart.sh` before
every start.

Net effect: any Prisma schema change (e.g. this session's own
`User.isActive` column, added for the super-admin deactivate feature)
ships as code that references a column production's database doesn't have
— the exact `P2022: column "users.is_active" does not exist` crash hit
locally earlier in this session while testing that feature, just deferred
to whenever it would have reached the real server.

**Fixed:** `docker-compose.prod.yml`'s frontend service now runs
`npx prisma migrate deploy && npm run start` — same idempotent
"apply on every boot" pattern as the backend's Alembic step.
`frontend/scripts/start-dev.sh` (dev) got the same fix for the same
reason — `migrate deploy` (not `migrate dev`, which is interactive) before
`db seed`, so a `git pull` that includes someone else's new migration
doesn't crash-loop a teammate's dev container either. (This is exactly
what crash-looped on this machine a few hours before this fix — see the
session leading up to this one.)

## Bug 2: `docs/deployment.md` told production to run the dev stack

"Step 6 — Start All Services" — the section literally titled for setting
up a fresh production server — said to run `./start.sh`. That script
hardware-auto-detects a GPU and starts `docker-compose.yml`, the dev
compose file: live-reload frontend, source-code volume mounts, Postgres
and Ollama ports exposed to the host, and a much bigger service list
(nginx/minio/prometheus/grafana/glitchtip/mailpit) than production's
actual 5 services (postgres/redis/backend/worker/frontend).

This conflict was already implicitly acknowledged elsewhere in the same
document — the GitHub Actions auto-deploy section and most of
"Maintenance"/"Troubleshooting" correctly used
`docker compose -f docker-compose.prod.yml`. Step 6, several "Optional"
feature sections (MinIO, GlitchTip, Prometheus/Grafana — all described as
"included and start automatically," true only for `docker-compose.yml`),
and a few `docker logs talvyn_nginx` references (no nginx container
exists in `docker-compose.prod.yml` — production's reverse proxy is a
host-level nginx, not a container) were not.

**Fixed:** rewrote Step 6 to use `docker compose -f docker-compose.prod.yml
up -d --build` and match the doc's own correct sections elsewhere; fixed
the log/restart/troubleshooting commands to always pass `-f`; fixed a
stale `pg_dump`/`psql` credential example that used dev's `jdadmin`/
`jd_assessment` instead of `docker-compose.prod.yml`'s actual
`talvyn_user`/`talvyn_db` defaults; flagged each "Optional" section
(MinIO, GlitchTip, Prometheus/Grafana) as dev-only unless its service
block is manually copied into `docker-compose.prod.yml`.

Added a new **"Keeping Dev Changes From Breaking Production"** section
covering all three mechanisms together: the compose-file separation (and
the one rule — always `-f docker-compose.prod.yml`, never bare `docker
compose`, never `./start.sh`, on the server), why env files are
git-ignored on purpose and the parity gap that creates when a new env var
ships without a matching server-side update (with a one-liner to diff
`.env.example` against the server's real `.env`), and the now-fixed
automatic-migration behavior on both sides.

## What this doesn't fix

A manual, undocumented edit made directly on the server (SSH in, hand-edit
a file, restart) still isn't tracked by git — the next deploy's
`git reset --hard origin/main` silently overwrites it. This was flagged
explicitly in the new doc section rather than "fixed," since the fix is
behavioral (don't do that), not something code can enforce. Also not
addressed: the broader Prisma-vs-Alembic dual schema-authority question
already flagged in an earlier audit (`docs/changelog/future-engineering-hardening.md`)
— this fix makes Prisma's *existing* migrations apply reliably in
production, it doesn't resolve which ORM should own schema changes
long-term.

## Follow-up incident: this fix tripped its own safety net in production

Once this change actually reached the production server (116.204.228.250),
the frontend container crash-looped (32 restarts) instead of deploying
cleanly. Diagnosed live via SSH:

```text
Error: P3005
The database schema is not empty. Read more about how to baseline an
existing production database: https://pris.ly/d/migrate-baseline
```

Production's database had the exact same latent condition as the local
dev one (see `docs/changelog/super-admin-user-lifecycle.md`'s incident
note): real tables, real data, but no `_prisma_migrations` history table
at all — this database was originally established via `prisma db push`,
never tracked migrations. The new `migrate deploy` startup step did
exactly its job: it refused to guess whether the untracked schema matched
the migration files, rather than silently corrupting state.

Resolved live, with explicit confirmation before touching the production
database:

```bash
docker compose -f docker-compose.prod.yml run --rm --no-deps frontend \
  sh -c 'npx prisma migrate resolve --applied 20260522053630_init'
docker compose -f docker-compose.prod.yml run --rm --no-deps frontend \
  sh -c 'npx prisma migrate deploy'
docker compose -f docker-compose.prod.yml restart frontend
```

The first command baselines the original schema as already-applied
(bookkeeping only, no SQL). The second then runs for real and applies the
one genuinely-pending migration — `ALTER TABLE users ADD COLUMN is_active
BOOLEAN NOT NULL DEFAULT true`, additive, no existing data touched.
Confirmed after: `RestartCount: 0`, `Status: running`, frontend
`HTTP 200`, backend `/api/v1/health/ready` all green.

**This is a one-time bookkeeping fix, not a recurring step.** Every other
database (any fresh production setup going forward, this one going
forward) either has no pre-existing untracked schema, or now has a
baselined one — `migrate deploy` will apply newly-added migrations
normally from here on without needing another manual resolve.
