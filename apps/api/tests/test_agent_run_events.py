from fastapi.testclient import TestClient

from apps.api.app.agent_run_lifecycle import agent_run_lifecycle
from apps.api.app.agent_runs import agent_run_store
from apps.api.app.agents import AgentCapabilityPolicyResponse, AgentUpdateRequest, agent_store
from apps.api.app.auth import local_account_store
from apps.api.app.conversations import conversation_store
from apps.api.app.run_event_log import run_event_log_store
from apps.api.app.app import app
from apps.api.app.model_configurations import model_configuration_store
from apps.api.app.runtime import runtime_store
from apps.api.tests.support import (
    configure_default_agent_model,
    invoke_sdk_tool_for_tests,
    use_fake_agent_runtime,
)
from apps.worker.app.celery_app import process_agent_run


def setup_function():
    local_account_store.reset()
    agent_store.reset()
    model_configuration_store.reset()
    conversation_store.reset()
    agent_run_store.reset()
    run_event_log_store.reset_for_tests()
    runtime_store.reset()
    configure_default_agent_model()
    use_fake_agent_runtime()


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

    assert ["id: 1", "id: 2", "id: 3", "id: 4", "id: 5", "id: 6", "id: 7"] == [
        line for line in full_response.text.splitlines() if line.startswith("id:")
    ]
    assert "event: process.summary" in full_response.text
    assert "event: message.completed" in full_response.text
    assert "id: 3" not in resume_response.text
    assert ["id: 4", "id: 5", "id: 6", "id: 7"] == [
        line for line in resume_response.text.splitlines() if line.startswith("id:")
    ]


def test_conversation_response_includes_tool_events_without_process_summaries():
    client = TestClient(app)
    token = approved_user_token(client)
    agent_store.update(
        1,
        AgentUpdateRequest(
            capability_policy=AgentCapabilityPolicyResponse(
                mcp_server_ids=[],
                sandbox_enabled=False,
                search_enabled=True,
                page_read_enabled=False,
            ),
        ),
    )
    conversation = client.post(
        "/conversations",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "Visible process",
            "agent_id": 1,
            "initial_message": "Start this conversation.",
        },
    ).json()
    run = client.post(
        f"/conversations/{conversation['id']}/runs",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": "Find source material."},
    ).json()

    process_agent_run.run(run["id"])
    invoke_sdk_tool_for_tests(
        run_id=run["id"],
        tool_name="search.web",
        payload={"query": "agent workspace traceability"},
    )

    response = client.get(
        "/conversations",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    messages = response.json()[0]["messages"]
    process_messages = [
        message for message in messages if message.get("event_type") == "process.summary"
    ]
    tool_messages = [
        message for message in messages if message.get("event_type") == "tool.call"
    ]
    assert process_messages == []
    assert tool_messages[0]["tool_call"]["tool_name"] == "search.web"
    assert tool_messages[0]["tool_call"]["safe_input"] == {
        "query": "agent workspace traceability",
    }


def test_conversation_list_batches_visible_run_events_without_replaying_message_deltas(
    monkeypatch,
):
    client = TestClient(app)
    token = approved_user_token(client)
    conversation = client.post(
        "/conversations",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "Visible process without deltas",
            "agent_id": 1,
            "initial_message": "Start this conversation.",
        },
    ).json()
    run = client.post(
        f"/conversations/{conversation['id']}/runs",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": "Summarize without replaying deltas."},
    ).json()
    process_agent_run.run(run["id"])
    agent_run_lifecycle.record_message_delta(
        agent_run_store.get(run["id"]),
        delta="streaming delta should not be replayed",
    )

    def fail_list_after(*, run_id: int, after_sequence: int):
        raise AssertionError("conversation list should batch visible run events")

    monkeypatch.setattr(run_event_log_store, "list_after", fail_list_after)

    response = client.get(
        "/conversations",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    response_text = response.text
    assert "运行过程：" not in response_text
    assert "streaming delta should not be replayed" not in response_text
