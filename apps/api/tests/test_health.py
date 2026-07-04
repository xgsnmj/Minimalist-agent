from fastapi.testclient import TestClient

from apps.api.app.app import app


def test_api_health_reports_ok():
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"service": "minimalist-agent-api", "status": "ok"}
