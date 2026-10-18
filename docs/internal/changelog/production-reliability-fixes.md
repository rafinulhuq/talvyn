# Production Reliability Fixes — Missing Worker, CORS, AI Checker Errors

Date: 2026-06-21

Diagnosed and fixed three production-only issues surfaced via the live admin
dashboard: AI Checker background jobs failing with a misleading "not found"
error, the System Health "Allowed origins" warning, and SMTP email delivery
guidance.

## What Was Wrong

| Issue | Root cause |
| --- | --- |
| AI Checker jobs intermittently report "AI checker job with id '...' not found" | `docker-compose.prod.yml` never defined a `worker` service — the ARQ background worker (`python -m arq app.worker.WorkerSettings`) that actually processes queued jobs (AI Checker checks, JD parsing/skill extraction/test generation, webhook delivery) was never running in production. The dev compose file (`docker-compose.yml`) has always had this service; it was missed when the production compose file was written. Separately, `ai_checker_service.get_check_job()` returned a bare `None` whenever its Redis client wasn't wired up for the current process — indistinguishable from "this job id doesn't exist," which is why the error read as a 404 instead of a clear infra failure. |
| System Health: "Allowed origins — Production CORS still includes localhost origins" | `ALLOWED_ORIGINS` defaults to `http://localhost:3000,http://localhost:3001` and nothing in production automatically excluded those defaults if a real domain was never added (or was added alongside the dev defaults instead of replacing them). |
| System Health: "Email — No production email provider is configured" | Neither `RESEND_API_KEY` nor `SMTP_HOST` is set in the production environment. This is a configuration gap, not a code bug — `email_service.py`'s SMTP path (STARTTLS, auth, executor-wrapped to avoid blocking the event loop) was reviewed and is correct. |

## What Changed

| Area | Change |
| --- | --- |
| `docker-compose.prod.yml` | Added the missing `worker` service, mirroring the dev compose file: same backend image, `python -m arq app.worker.WorkerSettings`, same `uploads_data` volume (needed for JD parsing to read uploaded files), same Postgres/Redis/Ollama wiring, health check disabled (no HTTP server to probe). |
| `app/services/ai_checker_service.py` | `get_check_job()` now raises `RuntimeError` when the job store isn't wired up, instead of silently returning `None`. |
| `app/api/v1/ai_checker.py` | The `/jobs/{job_id}` route maps that `RuntimeError` to a 503 (`AIServiceError`) instead of a 404 (`NotFoundError`) — admins now see "AI checker job store is unavailable" instead of a misleading "not found" when the real problem is infra, not a bad job id. |
| `app/config.py` | `allowed_origins_list` now strips `localhost` entries automatically when `app_env == "production"`, but only if at least one non-localhost origin remains — a fully-unconfigured `ALLOWED_ORIGINS` (100% localhost) is left untouched so the System Health warning keeps firing until it's genuinely fixed, rather than silently producing an empty CORS allowlist. |

## Still Required (Configuration, Not Code)

These need real values only the operator has — no code change can supply them:

- **CORS**: Set `ALLOWED_ORIGINS` in the production `backend/.env` to the real
  frontend/candidate domain(s), e.g. `ALLOWED_ORIGINS=https://acmeTalvyn.vercel.app`
  (comma-separate multiple domains, no trailing slash). Recreate the
  `backend` and `worker` containers after editing.
- **Email**: Set either `SMTP_HOST`/`SMTP_PORT`/`SMTP_USERNAME`/`SMTP_PASSWORD`
  or `RESEND_API_KEY`/`EMAIL_FROM` in the same file. See
  `backend/.env.example` for the recommended free-tier SMTP path (Brevo,
  300 emails/day, no card required): sign up, verify a sender email/domain,
  then copy the SMTP credentials from Settings -> SMTP & API -> SMTP.
- **Redeploy**: after editing `backend/.env` or `docker-compose.prod.yml`,
  run `docker compose -f docker-compose.prod.yml up -d --build` on the
  server so the new `worker` service starts and the backend/worker
  containers pick up the env changes.

## Notes

- The "Worker queue" System Health check only verifies Redis connectivity
  from the API process, not that a worker is actually consuming jobs — it
  was green the whole time the worker service was missing. A real fix would
  have the worker write a periodic heartbeat key the health check reads;
  tracked as a follow-up, not done here.
- This is unrelated to the earlier-diagnosed `/api/v1/search/` 404 issue
  from the same admin session — that one pointed at the backend deploy
  pipeline being out of sync with the frontend's auto-deploy; this batch is
  about what's actually wrong in the code/compose file once the backend
  *is* deployed. Both fixes will only take effect after a fresh
  `docker compose -f docker-compose.prod.yml up -d --build` on the server.
