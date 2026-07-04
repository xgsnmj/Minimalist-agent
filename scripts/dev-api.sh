#!/usr/bin/env bash
set -euo pipefail

uv run fastapi dev apps/api/app/app.py --host "${API_HOST:-127.0.0.1}" --port "${API_PORT:-8000}"
