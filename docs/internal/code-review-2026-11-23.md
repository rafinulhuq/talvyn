# Codebase review — 2026-11-23

Scope inspected: file layout, CI/CD workflows, compose files, `.gitignore`,
backend auth dependencies, Next.js proxy, Go workspace.

Verified: Go workspace builds / vets / tests clean (`make build`, `go vet`,
`go test`). Frontend `npm run type-check` passes.
Not run: backend pytest suite (no venv), frontend lint/build. Not every
service file was read.

## What's good

- **Auth model** (`backend/app/dependencies.py`): internal shared secret +
  `X-Actor-Id`, actor re-resolved from DB and role re-checked server-side;
  unranked roles fail closed. `DEV` kept outside `ROLE_RANK`.
- **Proxy** (`frontend/src/app/api/proxy/[...path]/route.ts`): `getToken()`
  only, body-size caps, unbuffered SSE passthrough, axios-vs-undici timeout
  rationale documented.
- **CI**: fresh-Postgres migration job, pinned ruff, audit + schema-drift
  jobs, documented `--remove-orphans` ban in deploy.
- **Secrets**: `.env` and `dump.rdb` ignored and untracked.

## Issues, by priority

### 1. Possible `/api/v1/internal/*` denylist bypass (security — needs test)

The proxy regex runs on the raw joined path. Axios normalizes dot segments
afterwards — confirmed:

```
new URL("http://backend:8000/x/../api/v1/internal/emails/send").pathname
// → /api/v1/internal/emails/send
```

If Next.js decodes `%2e%2e` into a `..` param segment (**unverified**), any
signed-in USER could reach the internal email routes, which are guarded only
by `VerifiedInternal` — and the proxy attaches the internal token.

Fix both sides:

```ts
if (path.some(s => s === ".." || s === "." || s.includes("/"))) return 404;
const apiPath = new URL("/" + path.join("/"), "http://x").pathname;
```

and give `backend/app/api/v1/internal_emails.py` its own secret/header the
generic proxy never sends — enforce the boundary in the backend, not in a
proxy denylist.

### 2. Go "rewrite" is scaffolding that looks production-shaped

- `services/iam`: `/login` returns hardcoded `"iam_jwt_sample_token"`, role ADMIN.
- `services/gateway`: no auth.
- `services/assessment`: heartbeat trusts client `elapsed_seconds`
  (duration hardcoded to 60 min); autosave buffer is in-memory (lost on crash).
- `docker-compose.microservices.yml`: references a `postgres` host it never
  defines; hardcoded credentials.
- CI never builds or tests any Go code; prod compose doesn't use it.

Options: delete / move to a branch (recommended — FastAPI is the product), or
keep as an explicit experiment with a "not production" README and a CI job
running `make test`.

### 3. Hardcoded fallback secrets in Go config

`backend-go/internal/config/config.go` falls back to
`JWT_SECRET="talvyn_super_secret_jwt_key_2026"` and a placeholder internal
secret. Python refuses to boot without real secrets; Go should fail fast
outside development too.

### 4. Data scoping fails open

`owner_scope_for(None)` → unscoped (org-wide). Safe only because the proxy
always sends `X-Actor-Id`. A future server-side caller that forgets the header
gets full workspace data. Consider an explicit opt-in (e.g. a `SYSTEM`
sentinel) for system calls.

### 5. Repo bloat

`.git` is ~65 MB; mostly `jd_rag/JD_Collection` (~930 PDFs, 55 MB), plus mp4s,
`wordpress-landing/talvyn-wordpress.zip`, and internal PDF/docx files. Move the
JD corpus to LFS or object storage. `wordpress-landing/` may be stale (live WP
site is deployed outside the repo at `/opt/openvett-wp`).

### 6. Docs drift

- README describes Nginx/OpenResty + Lua JWT guard on :80; prod runs behind a
  Cloudflare Tunnel.
- README links `docs/user-guide.md`, which doesn't exist.
- 5 tracked files still reference Rolepilot/OpenVett (mostly `docs/internal`).

## Smaller items

- `docker-compose.prod.yml`: frontend published on `0.0.0.0:3003` — bind
  `127.0.0.1:` like the backend, or the tunnel isn't the only ingress.
- Deploy does `git reset --hard` on the prod box — any on-server hotfix is
  silently wiped (intentional, but worth knowing).
- `.claude/settings.json` is tracked and contains machine-specific allows
  (`kill -9 <pid>`, `/home/a-m-rafinul-huq` paths).
- 26 bare `except Exception:` blocks in `backend/app` — audit for silent
  swallowing.
