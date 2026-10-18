#!/bin/bash
# prestart.sh — runs once before uvicorn starts.
#
# Applies any pending Alembic migrations so the database schema is always
# up to date on container startup.  Running "alembic upgrade head" is
# idempotent: if no migrations are pending it exits immediately with no changes.
#
# Why this is better than create_all + ALTER TABLE in main.py:
#   - Versioned: every schema change has a reviewable migration file.
#   - Safe: existing data is preserved; new columns get defaults.
#   - Multi-worker safe: Alembic holds a DB-level advisory lock during
#     migration so multiple workers starting in parallel don't race.

set -e

echo "[prestart] Running database migrations…"
alembic upgrade head
echo "[prestart] Migrations complete."
