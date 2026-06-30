#!/usr/bin/env bash
set -euo pipefail

required_vars=(
  APP_PROFILE
  REDIS_URL
  MYSQL_DSN
  MINIO_ENDPOINT
  MINIO_ACCESS_KEY
  MINIO_SECRET_KEY
  MINIO_BUCKET
)

missing=()
for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    missing+=("$var_name")
  fi
done

if (( ${#missing[@]} > 0 )); then
  printf 'Missing required environment variables: %s\n' "${missing[*]}" >&2
  exit 1
fi

printf 'Minimalist Agent environment looks ready.\n'
