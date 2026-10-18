#!/usr/bin/env bash
# create-admin.sh — create or reset a Talvyn admin account.
#
# Local usage:
#   ./create-admin.sh --email admin@example.com --name "Admin User"
#
# Docker usage:
#   ./create-admin.sh --docker --email admin@example.com
#   ./create-admin.sh --prod --email admin@example.com
#
# Non-interactive usage:
#   ADMIN_PASSWORD='change-me-now-123' ./create-admin.sh --email admin@example.com
#
# Custom DB override:
#   ADMIN_DATABASE_URL='postgresql://user:pass@host:5432/db' ./create-admin.sh --docker

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"

ADMIN_EMAIL="${ADMIN_EMAIL:-admin@talvyn.local}"
ADMIN_NAME="${ADMIN_NAME:-Talvyn Admin}"
ADMIN_ROLE="${ADMIN_ROLE:-SUPER_ADMIN}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
ADMIN_DATABASE_URL="${ADMIN_DATABASE_URL:-}"
RUN_MODE="auto"
COMPOSE_FILE="${COMPOSE_FILE:-}"

usage() {
  cat <<'USAGE'
Create or reset a Talvyn admin user.

Usage:
  ./create-admin.sh [options]

Options:
  --email EMAIL          Admin email. Default: admin@talvyn.local
  --name NAME            Admin display name. Default: Talvyn Admin
  --password PASSWORD    Admin password. Prefer the hidden prompt instead.
  --role ROLE            ADMIN or SUPER_ADMIN. Default: SUPER_ADMIN
  --database-url URL     Override the Prisma DATABASE_URL used by this script
  --local                Run with local frontend/node_modules
  --docker               Run inside the docker compose frontend service
  --prod                 Run inside docker-compose.prod.yml frontend service
  --compose-file FILE    Compose file to use with --docker
  -h, --help             Show this help

Environment variables:
  ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD, ADMIN_ROLE, ADMIN_DATABASE_URL, COMPOSE_FILE

Examples:
  ./create-admin.sh --email owner@example.com
  ADMIN_PASSWORD='strong-password-123' ./create-admin.sh --docker --email owner@example.com
  ./create-admin.sh --prod --email owner@example.com
  ADMIN_DATABASE_URL='postgresql://talvyn_user:secret@postgres:5432/talvyn_db' ./create-admin.sh --docker
USAGE
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --email)
      [[ $# -ge 2 ]] || die "--email requires a value"
      ADMIN_EMAIL="$2"
      shift 2
      ;;
    --name)
      [[ $# -ge 2 ]] || die "--name requires a value"
      ADMIN_NAME="$2"
      shift 2
      ;;
    --password)
      [[ $# -ge 2 ]] || die "--password requires a value"
      ADMIN_PASSWORD="$2"
      shift 2
      ;;
    --role)
      [[ $# -ge 2 ]] || die "--role requires a value"
      ADMIN_ROLE="$2"
      shift 2
      ;;
    --database-url)
      [[ $# -ge 2 ]] || die "--database-url requires a value"
      ADMIN_DATABASE_URL="$2"
      shift 2
      ;;
    --local)
      RUN_MODE="local"
      shift
      ;;
    --docker)
      RUN_MODE="docker"
      shift
      ;;
    --prod)
      RUN_MODE="docker"
      COMPOSE_FILE="docker-compose.prod.yml"
      shift
      ;;
    --compose-file)
      [[ $# -ge 2 ]] || die "--compose-file requires a value"
      RUN_MODE="docker"
      COMPOSE_FILE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown option: $1"
      ;;
  esac
done

ADMIN_EMAIL="$(printf '%s' "$ADMIN_EMAIL" | tr '[:upper:]' '[:lower:]' | xargs)"
ADMIN_NAME="$(printf '%s' "$ADMIN_NAME" | xargs)"
ADMIN_ROLE="$(printf '%s' "$ADMIN_ROLE" | tr '[:lower:]' '[:upper:]' | xargs)"

[[ -n "$ADMIN_EMAIL" ]] || die "Admin email cannot be empty"
[[ "$ADMIN_EMAIL" == *@* ]] || die "Admin email must look like an email address"
[[ -n "$ADMIN_NAME" ]] || die "Admin name cannot be empty"
[[ "$ADMIN_ROLE" == "ADMIN" || "$ADMIN_ROLE" == "SUPER_ADMIN" ]] || \
  die "Admin role must be ADMIN or SUPER_ADMIN"

if [[ -z "$ADMIN_PASSWORD" ]]; then
  if [[ -t 0 ]]; then
    read -rsp "Admin password: " ADMIN_PASSWORD
    echo
    read -rsp "Confirm password: " ADMIN_PASSWORD_CONFIRM
    echo
    [[ "$ADMIN_PASSWORD" == "$ADMIN_PASSWORD_CONFIRM" ]] || die "Passwords do not match"
  else
    die "Set ADMIN_PASSWORD or pass --password when running non-interactively"
  fi
fi

[[ ${#ADMIN_PASSWORD} -ge 8 ]] || die "Admin password must be at least 8 characters"

TMP_JS="$(mktemp "$FRONTEND_DIR/.create-admin.XXXXXX.cjs")"
cleanup() {
  rm -f "$TMP_JS"
}
trap cleanup EXIT

cat > "$TMP_JS" <<'NODE'
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

let prisma;

function buildDockerDatabaseUrl() {
  const user = process.env.POSTGRES_USER || "talvyn_user";
  const password = process.env.POSTGRES_PASSWORD || "talvyn_pass";
  const db = process.env.POSTGRES_DB || "talvyn_db";
  const host = process.env.POSTGRES_HOST || "postgres";
  const port = process.env.POSTGRES_PORT || "5432";

  if (!password) {
    throw new Error("POSTGRES_PASSWORD is required to build the Docker DATABASE_URL");
  }

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(db)}`;
}

function configureDatabaseUrl() {
  if (process.env.ADMIN_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.ADMIN_DATABASE_URL;
    return;
  }

  if (process.env.ADMIN_DOCKER_DATABASE_URL === "1") {
    process.env.DATABASE_URL = buildDockerDatabaseUrl();
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing");
  }
}

async function main() {
  configureDatabaseUrl();
  prisma = new PrismaClient();

  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const name = (process.env.ADMIN_NAME || "").trim();
  const password = process.env.ADMIN_PASSWORD || "";
  const role = (process.env.ADMIN_ROLE || "SUPER_ADMIN").trim().toUpperCase();

  if (!email || !email.includes("@")) {
    throw new Error("ADMIN_EMAIL must be a valid email address");
  }
  if (!name) {
    throw new Error("ADMIN_NAME cannot be empty");
  }
  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters");
  }
  if (!["ADMIN", "SUPER_ADMIN"].includes(role)) {
    throw new Error("ADMIN_ROLE must be ADMIN or SUPER_ADMIN");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await prisma.user.findUnique({ where: { email } });

  const user = existing
    ? await prisma.user.update({
        where: { email },
        data: { name, passwordHash, role },
        select: { id: true, email: true, name: true, role: true },
      })
    : await prisma.user.create({
        data: { email, name, passwordHash, role },
        select: { id: true, email: true, name: true, role: true },
      });

  console.log(`${existing ? "Updated" : "Created"} admin user`);
  console.log(`  id:    ${user.id}`);
  console.log(`  email: ${user.email}`);
  console.log(`  name:  ${user.name}`);
  console.log(`  role:  ${user.role}`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
NODE

load_env_file() {
  local env_file="$1"
  [[ -f "$env_file" ]] || return 0
  set -a
  # shellcheck disable=SC1090
  . "$env_file"
  set +a
}

local_deps_available() {
  [[ -d "$FRONTEND_DIR/node_modules/@prisma/client" && -d "$FRONTEND_DIR/node_modules/bcryptjs" ]]
}

run_local() {
  command -v node >/dev/null 2>&1 || die "node is not installed"
  local_deps_available || die "frontend node_modules are missing. Run npm ci in frontend or use --docker."

  local requested_email="$ADMIN_EMAIL"
  local requested_name="$ADMIN_NAME"
  local requested_password="$ADMIN_PASSWORD"
  local requested_role="$ADMIN_ROLE"
  local requested_database_url="$ADMIN_DATABASE_URL"

  load_env_file "$ROOT_DIR/.env"
  load_env_file "$FRONTEND_DIR/.env"
  load_env_file "$FRONTEND_DIR/.env.local"
  if [[ -n "$requested_database_url" ]]; then
    DATABASE_URL="$requested_database_url"
  fi
  [[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL is missing in environment/frontend env files"

  (
    cd "$FRONTEND_DIR"
    ADMIN_EMAIL="$requested_email" \
    ADMIN_NAME="$requested_name" \
    ADMIN_PASSWORD="$requested_password" \
    ADMIN_ROLE="$requested_role" \
    ADMIN_DATABASE_URL="$requested_database_url" \
    node "$TMP_JS"
  )
}

run_docker() {
  command -v docker >/dev/null 2>&1 || die "docker is not installed"

  local requested_email="$ADMIN_EMAIL"
  local requested_name="$ADMIN_NAME"
  local requested_password="$ADMIN_PASSWORD"
  local requested_role="$ADMIN_ROLE"
  local requested_database_url="$ADMIN_DATABASE_URL"

  # Docker containers must use the Compose service name, not localhost.
  # Load root .env for POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB, but do
  # not load frontend/.env because it often contains host-only localhost URLs.
  load_env_file "$ROOT_DIR/.env"
  local postgres_user="${POSTGRES_USER:-talvyn_user}"
  local postgres_password="${POSTGRES_PASSWORD:-talvyn_pass}"
  local postgres_db="${POSTGRES_DB:-talvyn_db}"

  [[ -n "$postgres_password" ]] || die "POSTGRES_PASSWORD is missing"

  local compose=(docker compose)
  if [[ -n "$COMPOSE_FILE" ]]; then
    [[ -f "$ROOT_DIR/$COMPOSE_FILE" || -f "$COMPOSE_FILE" ]] || die "Compose file not found: $COMPOSE_FILE"
    compose+=(-f "$COMPOSE_FILE")
  fi

  (
    cd "$ROOT_DIR"
    if "${compose[@]}" ps --status running --services 2>/dev/null | grep -qx frontend; then
      "${compose[@]}" cp "$TMP_JS" frontend:/app/.talvyn-create-admin.cjs
      set +e
      "${compose[@]}" exec -T \
        -e ADMIN_EMAIL="$requested_email" \
        -e ADMIN_NAME="$requested_name" \
        -e ADMIN_PASSWORD="$requested_password" \
        -e ADMIN_ROLE="$requested_role" \
        -e ADMIN_DATABASE_URL="$requested_database_url" \
        -e ADMIN_DOCKER_DATABASE_URL=1 \
        -e POSTGRES_USER="$postgres_user" \
        -e POSTGRES_PASSWORD="$postgres_password" \
        -e POSTGRES_DB="$postgres_db" \
        frontend sh -lc 'cd /app && node /app/.talvyn-create-admin.cjs'
      local status=$?
      "${compose[@]}" exec -T frontend rm -f /app/.talvyn-create-admin.cjs >/dev/null 2>&1 || true
      set -e
      return "$status"
    fi

    "${compose[@]}" run --rm -T \
      -v "$TMP_JS:/app/.talvyn-create-admin.cjs:ro" \
      -e ADMIN_EMAIL="$requested_email" \
      -e ADMIN_NAME="$requested_name" \
      -e ADMIN_PASSWORD="$requested_password" \
      -e ADMIN_ROLE="$requested_role" \
      -e ADMIN_DATABASE_URL="$requested_database_url" \
      -e ADMIN_DOCKER_DATABASE_URL=1 \
      -e POSTGRES_USER="$postgres_user" \
      -e POSTGRES_PASSWORD="$postgres_password" \
      -e POSTGRES_DB="$postgres_db" \
      frontend sh -lc 'cd /app && node /app/.talvyn-create-admin.cjs'
  )
}

if [[ "$RUN_MODE" == "auto" ]]; then
  if local_deps_available; then
    RUN_MODE="local"
  else
    RUN_MODE="docker"
  fi
fi

case "$RUN_MODE" in
  local)
    run_local
    ;;
  docker)
    run_docker
    ;;
  *)
    die "Unknown run mode: $RUN_MODE"
    ;;
esac
