from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_readme_documents_administrator_bootstrap():
    readme = (ROOT / "README.md").read_text()

    assert "Administrator bootstrap" in readme
    assert "ADMIN_BOOTSTRAP_USERNAME" in readme
    assert "ADMIN_BOOTSTRAP_PASSWORD" in readme


def test_readme_documents_full_local_mvp_smoke_workflow():
    readme = (ROOT / "README.md").read_text()

    assert "Full local MVP smoke workflow" in readme
    assert "uv run pytest apps/api/tests/test_mvp_smoke_workflow.py -q" in readme
    assert "scripts/dev-api.sh" in readme
    assert "scripts/dev-worker.sh" in readme
    assert "scripts/dev-web.sh" in readme
