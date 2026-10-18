#!/bin/sh
set -e

# Self-heal ownership of the anonymous /app/.next volume before anything
# else touches it. Docker copies a volume's first-mount content (and that
# content's ownership) from whatever was already at this path — if that
# ever happened under a different UID than this container runs as now
# (Docker/host changes, an old manual run, etc.), every subsequent boot
# inherits stale ownership forever, since this volume is deliberately
# preserved across restarts to cache Next.js's compiled output. Mirrors
# backend/docker-entrypoint.sh's chown step for the same reason.
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/.next
  chown -R "$(id -u)":"$(id -g)" /app/.next /app/node_modules 2>/dev/null || true
fi

# Do NOT run `prisma migrate deploy` or `prisma db push` here. Alembic
# (backend) owns schema changes; the DB has no `_prisma_migrations` tracking
# table, so `migrate deploy` fails with P3005 ("schema is not empty") and
# crash-loops the container. See docs/future-improvements.md S4-4.
echo "[startup] Seeding default admin..."
npx prisma db seed

echo "[startup] Starting Next.js..."
exec npm run dev
