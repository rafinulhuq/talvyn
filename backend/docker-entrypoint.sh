#!/bin/sh
set -e

mkdir -p /app/uploads/jds /app/uploads/tmp /app/.cache/huggingface

if [ "$(id -u)" = "0" ]; then
  # /app/.cache/huggingface is a named volume (hf_cache) — caches the
  # Desklib model weights across container rebuilds so they aren't
  # re-downloaded on every deploy. Fresh volumes mount as root; appuser
  # (uid 1000) needs write access to populate it on first load.
  chown -R appuser:appuser /app/uploads /app/.cache
  export HOME=/home/appuser
  exec setpriv --reuid=1000 --regid=1000 --init-groups "$@"
fi

exec "$@"
