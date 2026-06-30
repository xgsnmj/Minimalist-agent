from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_readme_documents_administrator_bootstrap():
    readme = (ROOT / "README.md").read_text()

    assert "Administrator bootstrap" in readme
    assert "ADMIN_BOOTSTRAP_USERNAME" in readme
    assert "ADMIN_BOOTSTRAP_PASSWORD" in readme
