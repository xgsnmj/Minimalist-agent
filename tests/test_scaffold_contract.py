from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_repository_exposes_expected_development_surfaces():
    expected_paths = [
        "package.json",
        "pnpm-workspace.yaml",
        "pyproject.toml",
        "apps/web/package.json",
        "apps/web/src/App.tsx",
        "apps/api/app/main.py",
        "apps/api/tests/test_health.py",
        "apps/worker/app/celery_app.py",
        "apps/worker/tests/test_worker_health.py",
        "infra/docker-compose.yml",
        "scripts/check-env.sh",
        "scripts/dev-api.sh",
        "scripts/dev-web.sh",
        "scripts/dev-worker.sh",
        "scripts/dev-all.sh",
        ".github/workflows/ci.yml",
    ]

    missing = [path for path in expected_paths if not (ROOT / path).exists()]

    assert missing == []
