#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"

"$repo_root/scripts/check-env.sh"

trap 'kill 0' EXIT
"$repo_root/scripts/dev-api.sh" &
"$repo_root/scripts/dev-worker.sh" &
"$repo_root/scripts/dev-web.sh" &
wait
