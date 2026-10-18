# Talvyn — Documentation Index

All documentation lives in this folder. Pick the guide that matches what you need.

---

## Guides

| File | For who | Contents |
| --- | --- | --- |
| [user-guide.md](user-guide.md) | HR managers, hiring admins | How to use the platform — uploading JDs, generating tests, inviting candidates, reading reports |
| [ui-ux-audit.md](ui-ux-audit.md) | Product owners, designers, frontend developers | UI/UX audit with prioritized improvements for admin, candidate, reporting, and settings workflows |
| [system-audit-2026-06-21.md](system-audit-2026-06-21.md) | Engineers, product owners, operators | Complete system audit covering security, reliability, dependencies, deployment, tests, and UI/UX gaps |
| [developer-guide.md](developer-guide.md) | Developers | Project structure, local setup, environment variables, common commands, backend/frontend internals |
| [deployment.md](deployment.md) | Server admins, DevOps | Step-by-step production deployment on Ubuntu — Docker, Nginx, HTTPS, backups |
| [architecture.md](architecture.md) | Developers | System design, data flow, database schema, auth model, AI pipeline, key technical decisions |
| [multi-user-capacity-plan.md](multi-user-capacity-plan.md) | Engineers, operators, future agents | Multi-user scaling plan, queue architecture, GPU limits, optimization strategy, implementation estimate |
| [scaling-current-state-and-agent-split.md](scaling-current-state-and-agent-split.md) | Engineers, AI agents | Current scaling implementation audit and corrected Claude/Codex milestone split |

---

## Reference

| File | Contents |
| --- | --- |
| [future-improvements.md](future-improvements.md) | Backlog of planned improvements and their implementation status |

---

## Quick Links

- **Start the platform:** `./start.sh` from the project root
- **Stop the platform:** `./stop.sh`
- **Admin dashboard:** `http://localhost` (port 80 — Nginx) — `acmeai@talvyn.com` (or `SEED_ADMIN_EMAIL`) / password from `SEED_ADMIN_PASSWORD`, or check `docker compose logs frontend | grep seed` if you didn't set one
- **API explorer:** `http://localhost:9000/docs` (requires `DEBUG=true` or `SHOW_DOCS=true` in `backend/.env`)
- **Email catcher (dev):** `http://localhost:8026`
- **MinIO console (dev):** `http://localhost:9002`
- **Prometheus (dev):** `http://localhost:9090`
- **Grafana (dev):** `http://localhost:3001` — `admin` / `talvyn_grafana`
- **GlitchTip (dev):** `http://localhost:8090` — create account on first visit
