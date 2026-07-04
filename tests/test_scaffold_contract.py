from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_repository_exposes_expected_development_surfaces():
    expected_paths = [
        "package.json",
        "pnpm-workspace.yaml",
        "pyproject.toml",
        "apps/web/package.json",
        "apps/web/src/app/app.tsx",
        "apps/api/app/app.py",
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
    forbidden_paths = [
        "apps/web/src/App.tsx",
        "apps/web/src/planned-pages.tsx",
        "apps/web/src/conversation-shell.tsx",
        "apps/web/src/copilotkit-adapter.tsx",
        "apps/web/src/ag-ui-stream.ts",
        "apps/web/src/card-schema-contract.ts",
        "apps/web/src/conversation-message-rendering.tsx",
        "apps/web/src/attachment-preview.tsx",
        "apps/api/app/main.py",
    ]
    legacy_present = [path for path in forbidden_paths if (ROOT / path).exists()]

    assert missing == []
    assert legacy_present == []
