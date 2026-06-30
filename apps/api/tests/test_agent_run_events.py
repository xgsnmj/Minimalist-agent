from fastapi.testclient import TestClient

from apps.api.app.agent_runs import agent_run_store
from apps.api.app.agents import agent_store
from apps.api.app.auth import local_account_store
from apps.api.app.conversations import conversation_store
from apps.api.app.run_event_log import run_event_log_store
from apps.api.app.main import app
from apps.api.app.model_configurations import model_configuration_store
from apps.worker.app.celery_app import process_agent_run


def setup_function():
    local_account_store.reset()
    agent_store.reset()
    model_configuration_store.reset()
    conversation_store.reset()
    agent_run_store.reset()
    run_event_log_store.reset_for_tests()


def approved_user_token(client: TestClient) -> str:
    account = client.post(
        "/auth/register",
        json={
            "username": "user",
            "email": "user@example.com",
            "password": "correct horse battery staple",
        },
    ).json()
    local_account_store.approve(account["id"])
    return client.post(
        "/auth/login",
        json={
            "login": "user",
            "password": "correct horse battery staple",
        },
    ).json()["access_token"]


def create_running_run(client: TestClient, token: str) -> int:
    conversation = client.post(
        "/conversations",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "Event log",
            "agent_id": 1,
            "initial_message": "Start this conversation.",
        },
    ).json()
    run = client.post(
        f"/conversations/{conversation['id']}/runs",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": "Stream the first event."},
    ).json()
    return run["id"]


def test_run_event_stream_uses_monotonic_sequence_ids_and_resumes_from_last_event_id():
    client = TestClient(app)
    token = approved_user_token(client)
    run_id = create_running_run(client, token)

    response = client.get(
        f"/runs/{run_id}/events",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "text/event-stream",
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "id: 1" in response.text
    assert "event: run.status" in response.text
    assert "data:" in response.text

    resume_response = client.get(
        f"/runs/{run_id}/events",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "text/event-stream",
            "Last-Event-ID": "1",
        },
    )

    assert resume_response.status_code == 200
    assert "id: 1" not in resume_response.text
    assert "event: run.status" in resume_response.text


def test_run_event_stream_resume_does_not_duplicate_completed_visible_events():
    client = TestClient(app)
    token = approved_user_token(client)
    run_id = create_running_run(client, token)

    process_agent_run.run(run_id)

    full_response = client.get(
        f"/runs/{run_id}/events",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "text/event-stream",
        },
    )
    resume_response = client.get(
        f"/runs/{run_id}/events",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "text/event-stream",
            "Last-Event-ID": "3",
        },
    )

    assert ["id: 1", "id: 2", "id: 3", "id: 4", "id: 5"] == [
        line for line in full_response.text.splitlines() if line.startswith("id:")
    ]
    assert "event: message.completed" in full_response.text
    assert "id: 3" not in resume_response.text
    assert ["id: 4", "id: 5"] == [
        line for line in resume_response.text.splitlines() if line.startswith("id:")
    ]
