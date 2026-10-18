#!/usr/bin/env bash
# stop.sh — Stop everything started by ./start.sh
#
# Stops:
#   1. Docker services  (postgres, backend, frontend, mailpit)
#   2. Ollama           (native process — started outside Docker)
#
# Usage:
#   ./stop.sh              stop everything, keep database volumes
#   ./stop.sh --wipe-db    stop everything AND delete database volumes (irreversible)

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OLLAMA_BIN="${OLLAMA_BIN:-$HOME/.local/bin/ollama}"
command -v ollama &>/dev/null && OLLAMA_BIN="ollama"

WIPE_DB=false
for arg in "$@"; do
  case "$arg" in
    --wipe-db) WIPE_DB=true ;;
    -h|--help)
      echo "Usage: ./stop.sh [--wipe-db]"
      echo "  --wipe-db   Also delete database volumes (all data will be lost)"
      exit 0 ;;
  esac
done

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║              Talvyn — Stopping Services              ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── 1. Stop Docker services ────────────────────────────────────
cd "$SCRIPT_DIR"
if docker compose ps --quiet 2>/dev/null | grep -q .; then
  if [ "$WIPE_DB" = true ]; then
    echo "[docker] Stopping containers and removing volumes..."
    docker compose down -v
    echo "[docker] Volumes deleted."
  else
    echo "[docker] Stopping containers (data volumes preserved)..."
    docker compose down
  fi
  echo "[docker] Done."
else
  echo "[docker] No running containers found."
fi

# ── 2. Stop Ollama (native process) ───────────────────────────
if pgrep -x "ollama" >/dev/null 2>&1; then
  echo "[ollama] Stopping native process..."
  pkill -x "ollama" 2>/dev/null || true
  # Wait up to 5s for clean shutdown
  for i in $(seq 1 5); do
    pgrep -x "ollama" >/dev/null 2>&1 || break
    sleep 1
  done
  if pgrep -x "ollama" >/dev/null 2>&1; then
    echo "[ollama] Force-killing..."
    pkill -9 -x "ollama" 2>/dev/null || true
  fi
  echo "[ollama] Done."
else
  echo "[ollama] Not running."
fi

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  All services stopped.                               ║"
if [ "$WIPE_DB" = true ]; then
echo "║  Database volumes were deleted.                      ║"
else
echo "║  Database volumes preserved — run ./start.sh again  ║"
echo "║  to resume with your existing data.                  ║"
fi
echo "╚══════════════════════════════════════════════════════╝"
echo ""
