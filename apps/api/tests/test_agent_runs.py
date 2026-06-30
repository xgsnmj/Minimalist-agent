from fastapi.testclient import TestClient

from apps.api.app.agent_runs import agent_run_store
from apps.api.app.agents import agent_store
from apps.api.app.auth import local_account_store
from apps.api.app.conversations import conversation_store
from apps.api.app.main import app
from apps.api.app.model_configurations import model_configuration_store
from apps.api.app.run_event_log import run_event_log_store
from apps.worker.app.celery_app import process_agent_run


def setup_function():
    local_account_store.reset()
    agent_store.reset()
    model_configuration_store.reset()
    conversation_store.reset()
    agent_run_store.reset()
    run_event_log_store.reset_for_tests()


def approved_user_token(client: TestClient, username: str = "user") -> str:
    account = client.post(
        "/auth/register",
        json={
            "username": username,
            "email": f"{username}@example.com",
            "password": "correct horse battery staple",
        },
    ).json()
    local_account_store.approve(account["id"])
    return client.post(
        "/auth/login",
        json={
            "login": username,
            "password": "correct horse battery staple",
        },
    ).json()["access_token"]


def create_conversation(client: TestClient, token: str, title: str = "Market research") -> int:
    response = client.post(
        "/conversations",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": title,
            "agent_id": 1,
            "initial_message": "Start this conversation.",
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


def test_starting_background_agent_run_records_snapshot_and_mock_runtime_response():
    client = TestClient(app)
    token = approved_user_token(client)
    conversation_id = create_conversation(client, token)

    create_response = client.post(
        f"/conversations/{conversation_id}/runs",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": "Find recent market signals."},
    )
    run_id = create_response.json()["id"]
    worker_response = process_agent_run.run(run_id)
    detail_response = client.get(
        f"/conversations/{conversation_id}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert create_response.status_code == 201
    assert create_response.json()["status"] == "queued"
    assert create_response.json()["worker_enqueued"] is True
    assert create_response.json()["status_events"] == ["queued", "worker_enqueued"]
    assert create_response.json()["capability_snapshot"]["agent_id"] == 1
    assert create_response.json()["capability_snapshot"]["agent_instruction_snapshot"]
    assert worker_response["status"] == "completed"
    assert client.get(
        f"/runs/{run_id}",
        headers={"Authorization": f"Bearer {token}"},
    ).json()["status_events"] == [
        "queued",
        "worker_enqueued",
        "running",
        "completed",
    ]
    assert detail_response.json()["messages"][-1] == {
        "role": "assistant",
        "content": "openai:gpt-5 handled Find recent market signals.",
    }
    assert client.get(
        f"/runs/{run_id}",
        headers={"Authorization": f"Bearer {token}"},
    ).json()["process_summaries"] == [
        "Reviewed the Agent Instruction snapshot for conversation 1.",
        "Used model gpt-5 from openai.",
    ]


def test_user_can_cancel_active_background_agent_run():
    client = TestClient(app)
    token = approved_user_token(client)
    conversation_id = create_conversation(client, token)
    run = client.post(
        f"/conversations/{conversation_id}/runs",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": "Keep working until I cancel."},
    ).json()

    cancel_response = client.post(
        f"/runs/{run['id']}/cancel",
        headers={"Authorization": f"Bearer {token}"},
    )
    worker_response = process_agent_run.run(run["id"])

    assert cancel_response.status_code == 200
    assert cancel_response.json()["status"] == "cancelled"
    assert cancel_response.json()["status_events"] == [
        "queued",
        "worker_enqueued",
        "cancelled",
    ]
    assert worker_response["status"] == "cancelled"


def test_one_agent_conversation_cannot_start_two_active_runs():
    client = TestClient(app)
    token = approved_user_token(client)
    conversation_id = create_conversation(client, token)
    first_response = client.post(
        f"/conversations/{conversation_id}/runs",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": "First run."},
    )
    second_response = client.post(
        f"/conversations/{conversation_id}/runs",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": "Second run."},
    )

    assert first_response.status_code == 201
    assert second_response.status_code == 409
    assert second_response.json()["detail"] == "Agent Conversation already has an active run."


def test_multiple_agent_conversations_can_have_active_runs_in_parallel():
    client = TestClient(app)
    token = approved_user_token(client)
    first_conversation_id = create_conversation(client, token, "Market research")
    second_conversation_id = create_conversation(client, token, "Launch plan")

    first_response = client.post(
        f"/conversations/{first_conversation_id}/runs",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": "First run."},
    )
    second_response = client.post(
        f"/conversations/{second_conversation_id}/runs",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": "Second run."},
    )

    assert first_response.status_code == 201
    assert second_response.status_code == 201
    assert first_response.json()["conversation_id"] != second_response.json()["conversation_id"]


def test_mock_runtime_failure_marks_background_agent_run_failed():
    client = TestClient(app)
    token = approved_user_token(client)
    conversation_id = create_conversation(client, token)
    run = client.post(
        f"/conversations/{conversation_id}/runs",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": "Simulate runtime failure."},
    ).json()

    worker_response = process_agent_run.run(run["id"])
    detail_response = client.get(
        f"/runs/{run['id']}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert worker_response["status"] == "failed"
    assert detail_response.json()["status"] == "failed"
    assert detail_response.json()["error"] == "Mock Agent Runtime failed."
    assert detail_response.json()["status_events"] == [
        "queued",
        "worker_enqueued",
        "failed",
    ]
