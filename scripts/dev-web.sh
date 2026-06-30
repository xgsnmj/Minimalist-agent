#!/usr/bin/env bash
set -euo pipefail

pnpm --filter @minimalist-agent/web dev --host 0.0.0.0 --port "${WEB_PORT:-5173}"
