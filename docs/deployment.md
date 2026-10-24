# Talvyn — Production Deployment Guide

> Deploy Talvyn to a Ubuntu server so anyone on the internet can access it.
> Every command is explained — suitable for first-time server admins.

---

## Table of Contents

1. [Server Requirements](#1-server-requirements)
2. [Step 1 — Prepare the Server](#step-1-prepare-the-server)
3. [Step 2 — Install Docker](#step-2-install-docker)
4. [Step 3 — Install Ollama](#step-3-install-ollama)
5. [Step 4 — Upload the Project](#step-4-upload-the-project)
6. [Step 5 — Configure Environment Variables](#step-5-configure-environment-variables)
7. [Step 6 — Start All Services](#step-6-start-all-services)
8. [Step 7 — Public Access & HTTPS (Cloudflare Tunnel)](#step-7-public-access-https-cloudflare-tunnel)
9. [GitHub Actions Auto Deploy](#github-actions-auto-deploy)
10. [Maintenance](#maintenance)
11. [Troubleshooting](#troubleshooting)

---

## 1. Server Requirements

| Tier | CPU | RAM | Storage | GPU | Notes |
| --- | --- | --- | --- | --- | --- |
| **Minimum** | 4 cores | 8 GB | 50 GB SSD | None | CPU-only Ollama (slow) |
| **Recommended** | 8 cores | 16 GB | 100 GB SSD | 8 GB VRAM | GPU accelerated |
| **Ideal** | 8+ cores | 32 GB | 200 GB SSD | 16 GB+ VRAM | Full performance |

**OS:** Ubuntu 22.04 LTS or 24.04 LTS

> The AI model (Ollama) loads entirely into memory. Without a GPU, generation takes 10–30 min per run. A GPU with ≥8 GB VRAM brings that to 2–6 min.

---

## Step 1 — Prepare the Server

```bash
# Connect to your server
ssh your_username@YOUR_SERVER_IP

# Update packages
sudo apt update && sudo apt upgrade -y

# Install essentials
sudo apt install -y curl git ufw

# Configure firewall
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable

# Create a deployment user (optional but recommended)
sudo adduser Talvyn
sudo usermod -aG sudo Talvyn
sudo usermod -aG docker Talvyn
su - Talvyn
```

---

## Step 2 — Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker --version
docker compose version
```

---

## Step 3 — Install Ollama

Ollama runs **natively** (not in Docker) for direct GPU access.

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# If you have an NVIDIA GPU, also install the container toolkit
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt update && sudo apt install -y nvidia-container-toolkit

# Start Ollama as a system service
sudo systemctl enable ollama
sudo systemctl start ollama

# Pull the model (choose based on your VRAM)
ollama pull gemma3:4b     # 4 GB VRAM  (~3.3 GB download)
ollama pull gemma3:12b    # 8 GB VRAM  (~8 GB download)
```

Trying a different model family (e.g. `qwen2.5-coder:7b`)? Prompts
auto-select a matching tuned set per `OLLAMA_MODEL`.
`./start.sh --model <tag>` overrides the hardware-auto-picked model
without it being overwritten on the next run.

---

## Step 4 — Upload the Project

```bash
# Option A — clone from git
git clone <your-repo-url> /home/Talvyn/Talvyn
cd /home/Talvyn/Talvyn

# Option B — copy from your local machine (run this on your local machine)
rsync -avz --exclude '.git' --exclude 'node_modules' --exclude '.venv' \
  /path/to/Talvyn/ Talvyn@YOUR_SERVER_IP:/home/Talvyn/Talvyn/
```

---

## Step 5 — Configure Environment Variables

```bash
cd /home/Talvyn/Talvyn

# Root env
cp .env.example .env
nano .env
```

Edit `.env`:

```bash
POSTGRES_USER=jdadmin
POSTGRES_PASSWORD=<strong-random-password>   # openssl rand -hex 16
POSTGRES_DB=jd_assessment
```

```bash
# Frontend env
cp frontend/.env.local.example frontend/.env.local
nano frontend/.env.local
```

Edit `frontend/.env.local`:

```bash
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=<openssl rand -base64 32>
INTERNAL_API_SECRET=<openssl rand -hex 32>   # must match backend
FASTAPI_INTERNAL_URL=http://backend:8000
DATABASE_URL=postgresql://jdadmin:<your-postgres-password>@postgres:5432/jd_assessment
```

Candidate exam requests use the same-origin Next.js public candidate proxy at
`/api/candidate/*`, so candidates do not need direct browser access to FastAPI.

```bash
# Backend env
cp backend/.env.example backend/.env
nano backend/.env
```

Key values to set in `backend/.env`:

```bash
DATABASE_URL=postgresql+asyncpg://jdadmin:<your-postgres-password>@postgres:5432/jd_assessment
INTERNAL_API_SECRET=<same value as frontend>
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=gemma3:4b
MAGIC_LINK_BASE_URL=https://your-domain.com
MAGIC_LINK_SECRET=<openssl rand -hex 32>
ALLOWED_ORIGINS=https://your-domain.com
RESEND_API_KEY=<your-resend-api-key>
EMAIL_FROM=no-reply@your-domain.com
```

`MAGIC_LINK_BASE_URL` controls the public URL candidates receive. For example,
to make new invitations look like
`https://talvyn.vercel.app/tests/<token>` and public assessment links
look like `https://talvyn.vercel.app/apply/<slug>`, set:

```bash
MAGIC_LINK_BASE_URL=https://talvyn.vercel.app
```

The backend appends `/tests/<token>` for private candidate invitations and
`/apply/<slug>` for public assessment links automatically. Private invitation
URLs that were already emailed or copied keep the old URL; create or resend
after changing this value. Public link records store only the slug, so the admin
UI will show the new base URL after the backend reloads the updated environment.

For email delivery, `RESEND_API_KEY` must be a real Resend API key and
`EMAIL_FROM` must use a sender/domain verified in your Resend account. If email
delivery fails, Talvyn still creates the invitation and shows a copyable
manual magic link in the admin UI.

### Optional: File Storage (MinIO / S3)

By default, uploaded JD files are stored on the local filesystem inside the backend container. For production you can switch to S3-compatible object storage:

```bash
# In backend/.env
STORAGE_BACKEND=s3
MINIO_ENDPOINT=your-minio-or-s3-host:9000
MINIO_ACCESS_KEY=<key>
MINIO_SECRET_KEY=<secret>
MINIO_BUCKET=Talvyn-uploads
MINIO_USE_SSL=true
```

MinIO is included in `docker-compose.yml` (dev). **`docker-compose.prod.yml`
does not include a MinIO service** — production either points
`MINIO_ENDPOINT` at a MinIO/S3 instance you run separately, or stays on
`STORAGE_BACKEND=local` (the default) and skips this section entirely.

### Optional: Error Tracking (GlitchTip)

GlitchTip is a self-hosted Sentry-compatible error tracker included in
`docker-compose.yml` (dev) — **not in `docker-compose.prod.yml`**. To run
it in production, add a `glitchtip`/`glitchtip-db`/`glitchtip-worker`
service block to `docker-compose.prod.yml` yourself (copy from
`docker-compose.yml`), or point `GLITCHTIP_DSN` at a GlitchTip/Sentry
instance hosted elsewhere. To enable it locally first:

1. Start the stack (GlitchTip starts automatically).
2. Visit `http://your-domain.com:8090` and create an admin account.
3. Create a new project, copy the DSN.
4. Add to `backend/.env` and `frontend/.env.local`:

```bash
GLITCHTIP_DSN=http://...@localhost:8090/1
```

### Optional: Observability (Prometheus + Grafana)

Prometheus and Grafana are included in `docker-compose.yml` (dev) and
start automatically there — **not in `docker-compose.prod.yml`**. To run
them in production, add their service blocks to `docker-compose.prod.yml`
(copy from `docker-compose.yml`) first. Their UIs listen on ports 9090 and
3001 respectively. **Do not expose these ports publicly** — restrict
access at the firewall level:

```bash
sudo ufw deny 9090
sudo ufw deny 3001
```

Access them via SSH tunnel when needed:

```bash
ssh -L 9090:localhost:9090 -L 3001:localhost:3001 Talvyn@YOUR_SERVER_IP
```

---

## Keeping Dev Changes From Breaking Production

Three mechanisms work together so changes made on a development machine
don't reach production unless intended:

1. **Two separate compose files, on purpose.** `docker-compose.yml` is the
   dev stack (live-reload, exposed DB/Ollama ports, full observability
   stack: nginx/minio/prometheus/grafana/glitchtip/mailpit).
   `docker-compose.prod.yml` is a deliberately smaller, separate file
   (postgres/redis/backend/worker/frontend/cloudflared only — see each
   "Optional" section above for what production omits by default). Editing one never
   changes the other. **The only command that should ever run on the
   production server is `docker compose -f docker-compose.prod.yml ...`** —
   never bare `docker compose ...` (defaults to the dev file) and never
   `./start.sh` (a dev-machine hardware-detection tool that always targets
   the dev file). This is exactly what `.github/workflows/deploy.yml`
   already runs automatically on every push to `main`.

2. **Env files are git-ignored, deliberately.** `.env`, `backend/.env`,
   `frontend/.env.local`, and `backend/.env.hardware` are all in
   `.gitignore` — `git push`/`git pull`/the auto-deploy's
   `git reset --hard origin/main` never touch them. Each environment (your
   PC, the server) keeps its own copy, edited once during Step 5 and only
   touched again when a new variable is introduced. **The gap this
   creates:** if a code change adds a new required env var, pushing that
   code does NOT add the var to the server — you must SSH in and add it to
   the server's `backend/.env`/`frontend/.env.local` yourself, ideally
   before or in the same step as the deploy that needs it. A container
   crash-looping right after a deploy, with logs showing a missing/`None`
   config value, is almost always this. Diff your local `.env.example`
   against the server's real `.env` periodically to catch drift:

   ```bash
   ssh Talvyn@YOUR_SERVER_IP "grep -o '^[A-Z_]*=' /home/Talvyn/Talvyn/backend/.env" | sort > /tmp/server-keys.txt
   grep -o '^[A-Z_]*=' backend/.env.example | sort > /tmp/example-keys.txt
   diff /tmp/example-keys.txt /tmp/server-keys.txt
   ```

3. **Schema migrations apply automatically, on both sides, on every
   start.** The backend's `prestart.sh` runs `alembic upgrade head`, and
   the frontend's startup now runs `prisma migrate deploy` (added
   alongside this section — previously only `prisma generate` ran in
   production, which regenerates the typed client but never touches the
   actual database, so a schema change could ship as code that crashes at
   runtime against a database missing the new column/table). Both are
   idempotent — safe to run on every restart, no-op when nothing's
   pending. You still need to *write* the migration yourself
   (`npx prisma migrate dev` / `alembic revision --autogenerate`) and
   commit the generated migration file — only *applying* already-committed
   migrations is automatic.

What this doesn't solve: a manual, undocumented edit made directly on the
server (SSH in, hand-edit a file, restart) is not tracked by git at all —
the next `git reset --hard origin/main` deploy silently overwrites it.
Treat the server's checkout as disposable and make real changes through
git, the same as any other environment.

---

## Step 6 — Start All Services

**`./start.sh` is a development-machine tool only — never run it on the
production server.** It hardware-auto-detects a GPU and starts
`docker-compose.yml` (the dev stack: live-reload frontend, source-code
volume mounts, Postgres/Ollama ports exposed to the host). Production uses
a separate, leaner compose file with none of that:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

(This is also exactly what the GitHub Actions auto-deploy runs automatically
on every push to `main` — see "GitHub Actions Auto Deploy" below. Manual runs
of this same command are for first-time setup or troubleshooting.)

```bash
# Check all containers are healthy
docker compose -f docker-compose.prod.yml ps

# Follow logs to watch startup
docker compose -f docker-compose.prod.yml logs -f
```

Expected healthy output (production's compose file defines exactly these
6 services — no nginx/minio/prometheus/grafana/glitchtip containers; those
are dev-only observability extras in `docker-compose.yml`):

```text
talvyn_postgres     Up (healthy)
talvyn_redis        Up (healthy)
talvyn_backend      Up (healthy)
talvyn_worker       Up
talvyn_frontend     Up
talvyn_cloudflared  Up
```

`cloudflared` starts automatically with the rest of the stack — it's not
optional, and it will crash-loop if `CLOUDFLARE_TUNNEL_TOKEN` isn't set in
your root `.env`. See Step 7 below before your first `up -d`.

> Note: In development, outbound email goes to Mailpit at `http://localhost:8026`
> (part of `docker-compose.yml`'s dev-only service list). Production's compose
> file never included Mailpit — just set `RESEND_API_KEY` in `backend/.env`
> on the server.

**Admin account** — an admin account is seeded automatically on first startup
(`frontend/prisma/seed.ts`). Set `SEED_ADMIN_PASSWORD` (and optionally
`SEED_ADMIN_EMAIL`) in `frontend/.env.local` before first deploy so you know
the login; if you don't, a random password is generated and printed once in
the `frontend` container logs (`docker compose logs frontend | grep seed`) —
it is never stored in git or on disk anywhere else. Change it via Settings
after first login either way.

The platform is now running, reachable locally at `http://127.0.0.1:${FRONTEND_PORT:-3003}`.
`docker-compose.prod.yml` does not include an nginx/OpenResty container (that's
a dev-only convenience in `docker-compose.yml`) — the frontend container
handles its own `/api/*` proxying internally to the backend over the Docker
network, so it's the only service that needs a public-facing reverse proxy.
Step 7 below sets that up.

---

## Step 7 — Public Access & HTTPS (Cloudflare Tunnel)

`docker-compose.prod.yml` ships a `cloudflared` service — this is the actual,
currently-used way this app reaches the internet, and it starts
automatically with the rest of the stack (it's not optional). It makes an
outbound-only connection to Cloudflare's edge, which terminates TLS there
and proxies plain HTTP to the frontend container over the host network. No
port-forwarding, no DDNS, no certbot.

1. In the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com)
   — Networks -> Tunnels — create a tunnel (or use an existing one).
2. Add a **Public Hostname**: your domain (e.g. `www.your-domain.com`) ->
   Service `HTTP` -> `localhost:${FRONTEND_PORT:-3003}` (the frontend
   container's published port). If you also want the bare/apex domain to
   work, add it as a second public hostname on the same tunnel — a DNS
   `CNAME`/`A` record to the tunnel is not enough by itself; the tunnel
   only routes hostnames it has an explicit Public Hostname entry for.
3. Copy the tunnel token (Networks -> Tunnels -> your tunnel -> Install
   connector) into the repo root's `.env` (gitignored, never commit it):

   ```bash
   CLOUDFLARE_TUNNEL_TOKEN=<your-tunnel-token>
   ```

4. Start (or restart) the stack — `cloudflared` picks up the token and
   connects:

   ```bash
   docker compose -f docker-compose.prod.yml up -d
   docker logs talvyn_cloudflared -f   # should show "Registered tunnel connection"
   ```

After this, update `NEXTAUTH_URL`, `MAGIC_LINK_BASE_URL`, and
`ALLOWED_ORIGINS` in your `.env` files to use `https://your-domain.com` and
restart:

```bash
docker compose -f docker-compose.prod.yml restart backend frontend
```

### Alternative: your own reverse proxy instead of Cloudflare Tunnel

If you don't want to route through Cloudflare, delete (or comment out) the
`cloudflared` service block in your own copy of `docker-compose.prod.yml`
first — otherwise it will sit there crash-looping on a missing token. Then
put a reverse proxy of your choice in front of the frontend container's
published port (`127.0.0.1:${FRONTEND_PORT:-3003}` if you also bind it to
loopback-only, or whatever you choose to expose). A minimal host-level
nginx + Certbot config, as an example:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

```nginx
# /etc/nginx/sites-available/Talvyn
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 600s;
    }

    client_max_body_size 20M;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/Talvyn /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
sudo certbot renew --dry-run
```

This is a maintained-by-you fallback, not the documented default path — the
`cloudflared` service in the shipped compose file is what this app actually
runs on today.

---

## GitHub Actions Auto Deploy

The repo includes `.github/workflows/deploy.yml`. There is **no SSH hop** —
the GitHub Actions runner for this workflow lives on the production box
itself (a self-hosted runner), so "deploying" just means the runner updates
its own live checkout in place and rebuilds the Docker stack:

```text
git push origin main
    -> CI workflow (must finish with conclusion "success")
    -> Deploy production workflow (workflow_run trigger, runs ON the prod box)
    -> cd $DEPLOY_PATH
    -> git fetch origin main && git reset --hard origin/main
    -> docker compose -f docker-compose.prod.yml build
    -> docker compose -f docker-compose.prod.yml up -d
    -> docker compose -f docker-compose.prod.yml ps
```

**If CI doesn't finish with `success`** (fails, or gets cancelled), the
deploy workflow's own run shows as **skipped**, not failed — this is by
design (`if: ... workflow_run.conclusion == 'success'`), but it means a
cancelled CI run silently leaves production on the old code with no error
anywhere. Check `Actions` -> `Deploy production` on GitHub if you push and
nothing seems to change.

**Deliberately no `--remove-orphans`** on the `up -d` step. `docker-compose.yml`
(dev stack) and `docker-compose.prod.yml` share the same default Compose
project name (the directory name), so `--remove-orphans` would treat the
dev-only services as orphans of the prod file and delete them — this is
exactly what happened on 2026-06-24, wiping the whole dev stack mid-deploy.
Don't add it back.

### Setting up the self-hosted runner (one-time, on the production box)

1. On GitHub: `Settings` -> `Actions` -> `Runners` -> `New self-hosted runner`,
   choose Linux. GitHub shows a short-lived registration token and the exact
   `./config.sh --url ... --token ...` command for your repo — copy and run
   those commands on the production server (not shown here since the token
   is single-use and generated per-setup).
2. Install it as a service so it survives reboots and stays online:
   ```bash
   sudo ./svc.sh install
   sudo ./svc.sh start
   ```
3. This runner account needs Docker access (`docker` group) and read/write
   on `$DEPLOY_PATH` — same permissions as whichever user cloned the repo in
   Step 4.

### Required repository secrets

Set these in GitHub: `Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`. All are optional — each falls back to a sane default or an existing secret if unset:

| Secret | Example | Meaning |
| --- | --- | --- |
| `PROD_DEPLOY_PATH` | `/home/acme-server/Desktop/talvyn/talvyn` | Repo path on the server the runner deploys from. Falls back to a hardcoded default in `deploy.yml` if unset — set this explicitly rather than relying on the fallback matching your actual path. |
| `PROD_POSTGRES_USER` | `talvyn_user` | Overrides `POSTGRES_USER` for this deploy. Falls back to the plain `POSTGRES_USER` secret, then to the compose file's own default, if unset. |
| `PROD_POSTGRES_PASSWORD` | `<strong-random-password>` | Same fallback chain as above, for the DB password. |
| `PROD_POSTGRES_DB` | `talvyn_db` | Same fallback chain as above, for the DB name. |

There is no `PROD_HOST`/`PROD_USER`/`PROD_PORT`/`PROD_SSH_KEY` — those were
from an earlier SSH-based version of this workflow and no longer exist.

The server will only deploy code that has been pushed to GitHub *and* passed
CI. A local commit does nothing until `git push origin main` succeeds and CI
comes back green.

---

## Maintenance

### View logs

Production's compose file has 6 services — postgres, redis, backend,
worker, frontend, cloudflared. There is no `talvyn_nginx` container in
production (that's a dev-only OpenResty container in `docker-compose.yml`);
the production reverse proxy is Cloudflare Tunnel (Step 7), unless you
removed it in favor of your own host-level nginx.

```bash
docker logs talvyn_backend -f          # backend
docker logs talvyn_frontend -f         # frontend
docker logs talvyn_worker -f           # background jobs (ARQ)
docker logs talvyn_cloudflared -f      # tunnel connection (Step 7)
journalctl -u ollama -f                   # Ollama
# Only if you set up the host-nginx alternative instead of cloudflared:
sudo nginx -t && journalctl -u nginx -f
```

### Restart services

**Always pass `-f docker-compose.prod.yml`.** A bare `docker compose
restart` (no `-f`) silently falls back to `docker-compose.yml` — the dev
compose file — which either does nothing useful on a server that never ran
it, or, worse, starts a second, wrong stack alongside the real one.

```bash
docker compose -f docker-compose.prod.yml restart           # restart all containers
docker compose -f docker-compose.prod.yml restart backend   # restart one service
sudo systemctl restart ollama                                # restart Ollama
```

### Update the application

Manual equivalent of what the GitHub Actions auto-deploy already does on
every push to `main` (see above) — use this for troubleshooting or before
the Actions integration is set up:

```bash
cd /home/Talvyn/Talvyn

# Pull latest code
git pull

# Rebuild and restart
docker compose -f docker-compose.prod.yml up -d --build
```

No manual migration step needed — both the backend (`prestart.sh` ->
`alembic upgrade head`) and frontend (`prisma migrate deploy`) apply any
pending migrations automatically every time their container starts, before
the actual server process boots. If a migration genuinely fails, the
container logs show it and the container won't come up healthy — see
**Database migrations failed on startup** below.

### Backup and restore

For quick admin-controlled maintenance, the dashboard includes a one-click JSON
backup and restore flow:

1. Open **Settings**.
2. Click **Create backup** to download a Talvyn backup JSON.
3. To restore, choose that backup file, type `RESTORE BACKUP`, and click
   **Restore backup**.

This in-app backup includes hiring/product data and uploaded JD files, but it
intentionally excludes admin users. It is useful before demos, test-data cleanup,
or small maintenance windows.

For production operations, still keep scheduled off-server database backups:

```bash
# Create a backup (use the actual POSTGRES_USER/POSTGRES_DB from your server's .env —
# talvyn_user/talvyn_db are docker-compose.prod.yml's defaults, not necessarily yours)
docker exec talvyn_postgres pg_dump -U talvyn_user talvyn_db > backup_$(date +%Y%m%d).sql

# Restore from backup
docker exec -i talvyn_postgres psql -U talvyn_user talvyn_db < backup_20260601.sql
```

Pair database backups with the uploaded-file storage backend you use:

- local storage: back up the Docker uploads volume or host upload directory
- MinIO/S3 storage: enable bucket lifecycle/replication/backups outside the app

### Monitor disk space

Uploaded JD files and the Ollama model are the main consumers:

```bash
df -h                                       # overall disk usage
du -sh /var/lib/docker/                     # Docker images and volumes
du -sh ~/.ollama/models/                    # Ollama models
```

---

## Troubleshooting

Start with **Settings -> Overview -> System Health** in the admin dashboard.
It checks database, Redis, worker queue, storage, Ollama, email configuration,
magic-link base URL, and allowed origins with direct fix guidance.

**`docker compose -f docker-compose.prod.yml ps` shows a container as unhealthy**

```bash
docker logs talvyn_backend --tail 50
# Look for connection errors, missing env vars, or migration failures
```

**Ollama not reachable from the backend container**

```bash
# Check Ollama is running
curl http://localhost:11434/api/tags

# Check host.docker.internal resolves inside the container
docker exec talvyn_backend curl http://host.docker.internal:11434/api/tags
```

**Frontend shows a blank page or 500 error**

```bash
docker logs talvyn_frontend --tail 50
# Common cause: NEXTAUTH_URL doesn't match the actual URL
```

**Database migrations failed on startup**

Both run automatically on container start (backend via `prestart.sh`,
frontend via `prisma migrate deploy` — see "Update the application"
above), so a failure here means the container exited rather than the
server being reachable but un-migrated.

```bash
docker logs talvyn_backend --tail 50   # Alembic output is at the very top of the log
docker logs talvyn_frontend --tail 50  # Prisma migrate output is at the very top of the log

# Manual re-run if you need to investigate interactively:
docker exec talvyn_backend alembic current
docker exec talvyn_backend alembic upgrade head
docker exec talvyn_frontend npx prisma migrate status
```

**Site unreachable / Cloudflare shows an error page**

Check the tunnel is actually connected, then confirm the frontend container
is healthy — `cloudflared` will happily stay "Up" while failing to reach a
dead upstream:

```bash
docker logs talvyn_cloudflared --tail 30
# Look for "Registered tunnel connection" vs repeated reconnect/error lines
docker compose -f docker-compose.prod.yml ps
# Usually means the frontend (or backend) container isn't healthy yet — wait a few seconds and retry
```

If you're on the host-nginx alternative instead of `cloudflared`, check its
own logs and the upstream containers the same way:

```bash
sudo journalctl -u nginx --no-pager -n 30
docker compose -f docker-compose.prod.yml ps
```

During auto deploys, the workflow builds images first and only recreates
containers after the images are ready. A very short 502 can still happen on a
single-container VPS while the frontend or backend process is being replaced;
retry after the deploy finishes.

**File uploads failing**

Check the `uploads_data` volume is mounted and the backend has write permission:

```bash
docker exec talvyn_backend ls -la /app/uploads
```

The backend startup entrypoint repairs this automatically by chowning
`/app/uploads` to the non-root `appuser`. If an old container is already running
with a root-owned volume, repair it once and restart:

```bash
docker compose -f docker-compose.prod.yml exec -T -u root backend chown -R 1000:1000 /app/uploads
docker compose -f docker-compose.prod.yml restart backend worker
```

**Emails not sending**

In development, emails go to Mailpit at `http://localhost:8026`. In production
you need either SMTP or Resend configured in `backend/.env` — Settings ->
Overview -> System Health shows "Email: WARNING" until one is set.

SMTP (recommended — free tier available, no domain-verification wait):

1. Sign up at [brevo.com](https://www.brevo.com), verify a sender email or
   domain.
2. Go to Settings -> SMTP & API -> SMTP and copy the credentials.
3. Set in `backend/.env`:

   ```bash
   SMTP_HOST=smtp-relay.brevo.com
   SMTP_PORT=587
   SMTP_USERNAME=your-brevo-login@example.com
   SMTP_PASSWORD=your-brevo-smtp-key
   EMAIL_FROM=your-verified-sender@yourdomain.com
   EMAIL_FROM_NAME=Talvyn
   ```

4. Recreate the backend and worker containers:

   ```bash
   docker compose -f docker-compose.prod.yml up -d --build backend worker
   ```

Resend (alternative):

- `RESEND_API_KEY` must be a real key, not a placeholder.
- `EMAIL_FROM` must be a sender/domain verified in your Resend dashboard.
- Leave `SMTP_HOST` blank — when both are set, SMTP takes priority.
- The backend container must be restarted after changing `backend/.env`.

Even when email delivery fails, the invitation is still created and the admin UI
shows a manual magic link that can be copied and sent to the candidate.

**System Health: "Allowed origins — Production CORS still includes localhost origins"**

`ALLOWED_ORIGINS` defaults to the local dev URLs. Set it in `backend/.env` to
your real frontend/candidate domain(s) — comma-separated, no trailing slash:

```bash
ALLOWED_ORIGINS=https://your-frontend-domain.com
```

The backend automatically drops any leftover `localhost` entries in
production as long as at least one real domain is present, but it will not
invent a domain for you — if `ALLOWED_ORIGINS` is left entirely at its
default, the warning is correct and stays until you set a real value.
Recreate the backend container after editing.

**AI Checker shows "AI checker job with id '...' not found"**

This means the job was queued but the background worker never picked it up
(or the API process answering the status-poll request never connected to
Redis). Check:

```bash
docker compose -f docker-compose.prod.yml ps
# Confirm a "worker" container exists and is "Up" — it's easy to omit when
# hand-editing compose files, since nothing else fails loudly without it.

docker logs talvyn_worker --tail 50
# Should show "Starting worker" and job pickups, not connection errors.
```

If there's no `worker` container at all, your `docker-compose.prod.yml` is
missing that service — add the `worker` block shown in this repo's
`docker-compose.prod.yml` (it shares the backend's image but runs
`python -m arq app.worker.WorkerSettings` instead of uvicorn). After
adding it, redeploy with
`docker compose -f docker-compose.prod.yml up -d --build`.

**Magic links still show the old domain**

`MAGIC_LINK_BASE_URL` is read by the backend when it creates or resends an
invitation. Update `backend/.env`, restart the backend, then create a new
invitation or use **Resend**:

```bash
docker compose -f docker-compose.prod.yml up -d backend
docker compose -f docker-compose.prod.yml exec -T backend python -c \
  'from app.core.security import build_magic_link; print(build_magic_link("sample_token"))'
```

Expected format:

```text
https://your-domain.com/tests/sample_token
```

Public assessment links use the same base URL with `/apply/<slug>`.
