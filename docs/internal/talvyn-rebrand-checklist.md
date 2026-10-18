# Talvyn Rebrand — Post-Rename Checklist

The Rolepilot → Talvyn rename covered code, config, and docs (see git history
for the full diff). This page tracks what's left: verifying the rename didn't
break anything, the infra follow-ups that were deliberately deferred, and
pointing your newly bought domain directly at the server.

---

## 1. Verify the code rename didn't break anything — all done

| Check | How | Status |
| --- | --- | --- |
| No stray old brand references | `grep -ril "rolepilot" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next --exclude-dir=site .` — should only return `docs/changelog/*`, dated audit docs, `mkdocs.yml` (repo fields), `.github/workflows/deploy.yml` (deploy path), and the two `acmerolepilot.vercel.app` comments. | ✅ Done — confirmed clean |
| Compose files still valid | `docker compose -f docker-compose.yml config --quiet` and `docker compose -f docker-compose.prod.yml config --quiet` | ✅ Done — both exit 0 |
| Frontend type-checks | `cd frontend && npx tsc --noEmit` | ✅ Done — clean (after `npm install` fixed the missing `@playwright/test`/`@axe-core/playwright` devDependencies, a pre-existing gap unrelated to the rename) |
| Backend compiles | `cd backend && python -m py_compile app/main.py app/config.py app/services/*.py app/core/*.py app/schemas/*.py` | ✅ Done — all clean |
| Frontend builds for real | `cd frontend && npm run build` | ✅ Done — production build succeeds |
| Backend test suite | `docker exec talvyn_backend python -m pytest -q tests/test_ratelimit.py tests/test_webhooks.py` | ✅ Done — 22/22 pass, confirming the renamed `X-Talvyn-*` headers work end to end. **Full `pytest` suite not run**: `tests/test_ai_detection.py::TestEstimateAiLikenessUnit::test_disabled_by_default_returns_none_without_calling_ollama` hangs indefinitely, and `tests/test_audit_log.py` has 6 pre-existing test-isolation failures (entries leak across test methods) — both pre-existing, unrelated to the rename, worth fixing separately |
| E2E smoke test | `cd frontend && npx playwright install chromium && npx playwright test landing.spec.ts auth.spec.ts accessibility.spec.ts` | ✅ Done — 7/7 pass, including the login page's `Talvyn` heading assertion (needed `npx playwright install chromium` too — the browser binary was also missing, separate from the npm package gap) |

---

## 2. Recreate the Docker stack under the new names — done, with two gotchas

This step is complete on this box (`talvyn_postgres/redis/worker/backend/frontend`
all up and healthy, admin login confirmed at `acmeai@talvyn.com`). Two
real issues came up doing it — worth knowing if you ever repeat this on
another server:

**Gotcha 1 — pushing the rename to `main` auto-triggers a deploy that can
collide with the still-running old stack.** `.github/workflows/deploy.yml`
runs on every CI success on `main`. As soon as the rename commit was pushed,
the self-hosted runner tried `docker compose -f docker-compose.prod.yml up -d
--build` under the *new* pinned project name (`talvyn`) — while the *old*
`rolepilot_*` containers (created before the rename, under the old implicit
project name) were still running and holding ports 8000/3003. The deploy
failed with `Bind for 127.0.0.1:8000 failed: port is already allocated`,
leaving `talvyn_backend`/`talvyn_frontend` stuck in `Created` (never
started) for a day while `talvyn_postgres/redis/worker` ran fine on empty,
never-connected-to volumes.
**Lesson:** before pushing a rename that changes the Compose project name,
stop the old stack first (or expect a failed auto-deploy you'll need to
clean up manually, per below).

**Gotcha 2 — a container that was `Created` but never started can come up
with stale network/volume state.** Just starting the stuck containers
(`docker compose up -d`) got them running but crash-looping: the backend
couldn't resolve the `postgres` hostname (stale network attachment from the
original failed `Created` state), and the frontend's Prisma seed failed
auth against Postgres (the `talvyn_postgres_data` volume had been
initialized during that first failed attempt, possibly under different
effective env than a plain interactive shell has). Since nothing had ever
successfully connected to it, it held no real data — confirmed safe to wipe:
`docker compose -f docker-compose.prod.yml down && docker volume rm
talvyn_postgres_data && docker compose -f docker-compose.prod.yml up -d
--force-recreate`. That produced a clean, healthy stack.

**Gotcha 3 — `docker compose restart` does not reload `env_file`/`environment`
changes.** After editing `backend/.env` (see below), `docker compose restart
backend` kept serving the old values — the health check still said
`"service": "JD Assessment API"`. `env_file`/`environment` are only
processed at container *creation*. Use `docker compose up -d
--force-recreate backend` (or `up -d backend`, which recreates if config
changed) instead of `restart` whenever you touch env vars.

**Also found:** the real (gitignored) `backend/.env` and `frontend/.env.local`
files — never touched by the code-rename pass since that only updated
`.env.example` templates — still had `APP_NAME=JD Assessment API`,
`EMAIL_FROM_NAME=JD Assessment Platform`, and `DATABASE_URL=...rolepilot:***@.../jd_assessment`.
Fixed to `Talvyn API`/`Talvyn Platform`/`talvyn_user:***@.../talvyn_db`.
These don't affect the Docker containers for `DATABASE_URL` specifically
(Compose's `environment:` block overrides it), but `APP_NAME`/`EMAIL_FROM_NAME`
aren't overridden there, so they *do* flow straight into the running app —
that's what caused the stale health-check response above.

Checklist:

- [x] `docker ps` shows `talvyn_postgres`, `talvyn_backend`, `talvyn_frontend`, etc. (not `rolepilot_*`)
- [x] Admin login works with the reseeded account: `acmeai@talvyn.com` / `acmeai@r2026p#` (from `frontend/prisma/seed.ts`)
- [x] Backup taken before cutover: `pg_dump` of the old `rolepilot`/`jd_assessment` database and a tarball of its uploads volume, saved at `/home/acme-server/backups/`. Restore with `docker exec -i talvyn_postgres pg_restore -U talvyn_user -d talvyn_db < rolepilot_db_backup_*.dump` if ever needed.
- [x] Old `rolepilot_backend/frontend/worker/postgres/redis` stopped (not removed) — freed the ports so `talvyn_*` could start; their volumes are untouched as an extra safety net on top of the backup above.
- [ ] If you rely on `create-admin.sh` instead of the seed, re-run it: `./create-admin.sh --docker --email you@example.com` — not needed right now, the seed already created the admin
- [ ] MinIO (if `STORAGE_BACKEND=s3`) has recreated the `talvyn-uploads` bucket on first write — not checked; `STORAGE_BACKEND=local` by default so likely not in use
- [ ] GlitchTip DSN, Grafana dashboards, Prometheus scrape targets still resolve (labels changed: job name is now `talvyn-backend`) — these still run under the *old* `rolepilot_*` names (dev-only extras weren't touched, only the 5 core app services were cut over) — decide whether/when to migrate them too
- [ ] Decide when to `docker rm` the stopped old containers and eventually the old volumes, once you've confirmed `talvyn_*` is solid for a while

---

## 3. Rename the folder on disk

Compose files now pin `name: talvyn` explicitly, so the directory name no
longer controls the Compose project name — the rename below is safe and
won't trigger the `--remove-orphans` incident from 2026-06-24 again.

- [ ] `mv /home/acme-server/Desktop/rolepilot /home/acme-server/Desktop/talvyn` (adjust destination as desired)
- [ ] Reopen the folder in VS Code
- [ ] Check whether a `PROD_DEPLOY_PATH` secret is set: `gh secret list`
  - If set, update it: `gh secret set PROD_DEPLOY_PATH --body "/new/path"`
  - If unset, it was using the fallback in `.github/workflows/deploy.yml` (`DEPLOY_PATH: ${{ secrets.PROD_DEPLOY_PATH || '/home/acme-server/Desktop/rolepilot' }}`) — update that fallback string in the workflow file itself once the path is settled
- [ ] Trigger a manual deploy (`workflow_dispatch` on the `Deploy production` workflow) to confirm the self-hosted runner still finds the checkout

---

## 4. Rename the GitHub repo

- [ ] `gh repo rename talvyn` (from `syedrafinulhuq/rolepilot`)
- [ ] Update local remote: `git remote set-url origin https://github.com/syedrafinulhuq/talvyn.git` (GitHub redirects the old URL for a while, but don't rely on that long-term)
- [ ] Update `mkdocs.yml`: `site_url`, `repo_url`, `repo_name` (currently still point at `.../rolepilot`)
- [ ] Update any README badges or external links that hardcode the old repo URL

---

## 5. Point your new domain directly at this server

You chose **domain → server directly**, retiring the ngrok tunnel and Vercel
proxy rather than layering the domain on top of them. This is the same path
already documented in [deployment.md](deployment.md) Step 7 — this section
is just the checklist version, plus the ngrok/Vercel teardown.

### 5a. DNS

- [ ] Point an **A record** for `your-domain.com` (and `www`) at this server's public IP
- [ ] If this machine is behind a router/NAT (likely, since you were using ngrok to get around exactly this), forward ports **80** and **443** to it, or run this on a box that already has a public IP (cloud VPS)
- [ ] Confirm propagation: `dig your-domain.com +short` should return the server's public IP

### 5b. Switch from the dev/ngrok stack to the production stack

The ngrok setup (`deploy-ngrok.sh`) runs `docker-compose.yml` (the dev stack, Nginx on 8080 to dodge the local Apache on 80) — that's not the stack meant to serve a real domain. For a real domain you want `docker-compose.prod.yml`, which expects the containerized OpenResty on port 80 with a host-level Nginx/Certbot in front for TLS (already covered in `docs/deployment.md` Steps 6–7).

- [ ] Stop the ngrok tunnel: `./deploy-ngrok.sh --stop`
- [ ] Free up port 80 (stop whatever else is bound there — Apache, in this box's case — or keep the containerized Nginx on `127.0.0.1:8080` and adjust the host Nginx `proxy_pass` per the note in `deployment.md` Step 7)
- [ ] Bring up the prod stack: `docker compose -f docker-compose.prod.yml up -d --build`
- [ ] Follow **deployment.md Step 7 — Enable HTTPS** verbatim: install `certbot`, write `/etc/nginx/sites-available/talvyn` with `server_name your-domain.com www.your-domain.com;`, `certbot --nginx -d your-domain.com -d www.your-domain.com`
- [ ] `sudo certbot renew --dry-run` to confirm auto-renewal works

### 5c. Update env vars to the real domain

In `backend/.env` and `frontend/.env.local` (or your server's actual env files):

- [ ] `MAGIC_LINK_BASE_URL=https://your-domain.com`
- [ ] `ALLOWED_ORIGINS=https://your-domain.com` (add `www.` variant if used)
- [ ] `NEXTAUTH_URL=https://your-domain.com`
- [ ] `NEXT_PUBLIC_APP_URL=https://your-domain.com`
- [ ] `NEXT_PUBLIC_API_URL=https://your-domain.com` (or your API sub-path, matching how Nginx routes `/api/v1/`)
- [ ] Apply: `docker compose -f docker-compose.prod.yml up -d backend frontend` — **not** `restart`, which doesn't reload `env_file` changes (see §2 Gotcha 3)

### 5d. Retire ngrok / Vercel proxy

> **Note (2026-08-05):** the in-repo ngrok pieces (`deploy-ngrok.sh` and the
> proxy branching) have already been **removed** from the codebase. The steps
> below now only cover any *external* ngrok state you may still have running
> (a static-domain reservation, a cron/systemd job on the VPS).

- [ ] `vercel-proxy/` can be deleted or left as a documented fallback — it's no longer in the request path once DNS points straight at the server
- [ ] Cancel/stop the ngrok static domain reservation if you don't need it as a backup
- [ ] Remove or comment out any leftover ngrok cron/systemd job, if one was set up to keep `deploy-ngrok.sh` running persistently

### 5e. Verify end-to-end

- [ ] `https://your-domain.com` loads the admin login over HTTPS with a valid cert (check the padlock, not just that it loads)
- [ ] Upload a JD, generate a test, invite a candidate — confirm the magic link email contains `https://your-domain.com/...`, not the old ngrok URL
- [ ] Submit a test as the candidate all the way through to see the evaluation report
- [ ] If webhooks are configured, confirm a delivery fires with the new `X-Talvyn-*` headers to an external URL

---

## Still open

- [x] Code rename verified: grep sweep, compose config, frontend type-check/build, backend compile, scoped backend tests, e2e tests (§1)
- [x] Docker stack cut over to `talvyn_*`, verified healthy, pre-cutover backup taken (§2)
- [ ] Decide when to remove the stopped `rolepilot_*` containers/volumes (§2)
- [ ] Folder rename (§3)
- [ ] GitHub repo rename (§4)
- [ ] Domain cutover (§5)

Once all three are done, delete this checklist (or move it to `docs/changelog/` as a record of the rebrand) — it's a working document, not permanent reference documentation.
