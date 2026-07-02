#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"

env_file=""
start_infra=0
skip_install=0
skip_migrate=0

usage() {
  cat <<'USAGE'
Usage: scripts/start-local.sh [options]

Options:
  --env-file PATH   Load a specific environment file.
  --infra           Start local Redis/MySQL/MinIO with Docker Compose first.
  --skip-install    Do not auto-install missing pnpm/uv dependencies.
  --skip-migrate    Start services without running database migrations.
  -h, --help        Show this help.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      env_file="${2:-}"
      if [[ -z "$env_file" ]]; then
        echo "--env-file requires a path." >&2
        exit 1
      fi
      shift 2
      ;;
    --infra)
      start_infra=1
      shift
      ;;
    --skip-install)
      skip_install=1
      shift
      ;;
    --skip-migrate)
      skip_migrate=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$env_file" ]]; then
  if [[ -f "$repo_root/.env.local" ]]; then
    env_file="$repo_root/.env.local"
  elif [[ -f "$repo_root/.env" ]]; then
    env_file="$repo_root/.env"
  elif [[ -f "$repo_root/.env.example" ]]; then
    env_file="$repo_root/.env.example"
  else
    echo "No environment file found. Create .env.local first." >&2
    exit 1
  fi
fi

if [[ ! -f "$env_file" ]]; then
  echo "Environment file not found: $env_file" >&2
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$env_file"
set +a

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

require_cmd uv
require_cmd pnpm

if (( start_infra == 1 )); then
  require_cmd docker
  echo "Starting local middleware with Docker Compose..."
  docker compose -f "$repo_root/infra/docker-compose.yml" up -d redis mysql minio
fi

bash "$repo_root/scripts/check-env.sh"

placeholder_vars=(
  REDIS_URL
  MYSQL_DSN
  MINIO_ENDPOINT
  MINIO_ACCESS_KEY
  MINIO_SECRET_KEY
  MINIO_BUCKET
)

placeholder_errors=()
for var_name in "${placeholder_vars[@]}"; do
  value="${!var_name:-}"
  if [[ "$value" == *"<"* || "$value" == *">"* || "$value" == *"CHANGE_ME"* ]]; then
    placeholder_errors+=("$var_name")
    continue
  fi
  if [[ "$value" == *"REDIS_HOST"* || "$value" == *"MYSQL_USER"* || "$value" == *"MYSQL_PASSWORD"* ]]; then
    placeholder_errors+=("$var_name")
    continue
  fi
  if [[ "$value" == *"MYSQL_HOST"* || "$value" == *"MYSQL_DATABASE"* || "$value" == *"MINIO_HOST"* ]]; then
    placeholder_errors+=("$var_name")
    continue
  fi
  if [[ "$value" == "MINIO_ACCESS_KEY" || "$value" == "MINIO_SECRET_KEY" ]]; then
    placeholder_errors+=("$var_name")
  fi
done

if (( ${#placeholder_errors[@]} > 0 )); then
  printf 'Environment variables still contain placeholders: %s\n' "${placeholder_errors[*]}" >&2
  echo "Fill $env_file before starting the app." >&2
  exit 1
fi

if (( skip_install == 0 )); then
  if [[ ! -d "$repo_root/node_modules" ]]; then
    echo "Installing frontend dependencies..."
    (cd "$repo_root" && pnpm install)
  fi
  if [[ ! -d "$repo_root/.venv" ]]; then
    echo "Installing Python dependencies..."
    (cd "$repo_root" && uv sync)
  fi
fi

if (( skip_migrate == 0 )); then
  echo "Checking and migrating database schema..."
  (cd "$repo_root" && uv run python scripts/db-migrate.py --env-file "$env_file")
fi

cleanup() {
  trap - EXIT INT TERM
  local pids
  pids="$(jobs -pr || true)"
  if [[ -n "$pids" ]]; then
    kill $pids 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

echo "Starting API, worker, and web..."
echo "API: http://${API_HOST:-127.0.0.1}:${API_PORT:-8000}"
echo "Web: http://localhost:${WEB_PORT:-5173}"

bash "$repo_root/scripts/dev-api.sh" &
bash "$repo_root/scripts/dev-worker.sh" &
bash "$repo_root/scripts/dev-web.sh" &

wait
