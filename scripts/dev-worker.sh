#!/usr/bin/env bash
set -euo pipefail

uv run celery -A apps.worker.app.celery_app.celery_app worker --loglevel=INFO
