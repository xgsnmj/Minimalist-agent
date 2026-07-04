from fastapi.testclient import TestClient

from apps.api.app.agent_runs import AgentRunStatus, agent_run_store
from apps.api.app.agents import agent_store
from apps.api.app.auth import local_account_store
from apps.api.app.conversations import conversation_store
from apps.api.app.copilotkit_runtime import copilot_thread_mapping_store
from apps.api.app.main import app
from apps.api.app.model_configurations import model_configuration_store
from apps.api.app.run_event_log import run_event_log_store
from apps.api.app.runtime import runtime_store


def setup_function():
    local_account_store.reset()
    agent_store.reset()
    model_configuration_store.reset()
    conversation_store.reset()
    agent_run_store.reset()
    run_event_log_store.reset_for_tests()
    runtime_store.reset()
    copilot_thread_mapping_store.reset()


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


def create_conversation(client: TestClient, token: str) -> int:
    response = client.post(
        "/conversations",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "CopilotKit thread",
            "agent_id": 1,
            "initial_message": "Start this conversation.",
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


def copilot_run_payload(*, thread_id: str, content: str = "Find recent market signals."):
    return {
        "threadId": thread_id,
        "runId": "copilot-run-1",
        "state": {},
        "messages": [
            {
                "id": "user-message-1",
                "role": "user",
                "content": content,
            }
        ],
        "tools": [],
        "context": [],
        "forwardedProps": {},
    }


def test_copilotkit_runtime_info_exposes_enabled_backend_agents():
    client = TestClient(app)
    token = approved_user_token(client)

    response = client.get(
        "/copilotkit/info",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["mode"] == "sse"
    assert response.json()["audioFileTranscriptionEnabled"] is False
    assert response.json()["agents"]["default"]["name"] == "Default Agent"
    assert (
        response.json()["agents"]["default"]["capabilities"]["custom"]["agentRuntime"]
        == "openai-agents-sdk"
    )


def test_copilotkit_connect_returns_ag_ui_snapshot_for_existing_conversation():
    client = TestClient(app)
    token = approved_user_token(client)
    conversation_id = create_conversation(client, token)

    response = client.post(
        "/copilotkit/agent/default/connect",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "text/event-stream",
        },
        json=copilot_run_payload(thread_id=str(conversation_id)),
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert '"type":"RUN_STARTED"' in response.text
    assert '"type":"MESSAGES_SNAPSHOT"' in response.text
    assert "Start this conversation." in response.text
    assert '"type":"RUN_FINISHED"' in response.text


def test_copilotkit_run_executes_openai_agents_sdk_runtime_and_streams_ag_ui_events():
    client = TestClient(app)
    token = approved_user_token(client)
    conversation_id = create_conversation(client, token)

    response = client.post(
        "/copilotkit/agent/default/run",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "text/event-stream",
        },
        json=copilot_run_payload(thread_id=str(conversation_id)),
    )

    completed_run = agent_run_store.list_all()[0]
    conversation = client.get(
        f"/conversations/{conversation_id}",
        headers={"Authorization": f"Bearer {token}"},
    ).json()

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert '"type":"RUN_STARTED"' in response.text
    assert '"type":"TEXT_MESSAGE_START"' in response.text
    assert '"type":"TEXT_MESSAGE_CONTENT"' in response.text
    assert "openai:gpt-5 handled Find recent market signals." in response.text
    assert '"type":"RUN_FINISHED"' in response.text
    assert completed_run.status == AgentRunStatus.COMPLETED
    assert completed_run.full_trace["workflow_name"] == "Agent workflow"
    assert conversation["messages"][-1] == {
        "role": "assistant",
        "content": "openai:gpt-5 handled Find recent market signals.",
    }


def test_copilotkit_run_can_create_backend_conversation_for_new_copilot_thread():
    client = TestClient(app)
    token = approved_user_token(client)

    response = client.post(
        "/copilotkit/agent/default/run",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "text/event-stream",
        },
        json=copilot_run_payload(
            thread_id="copilot-thread-new",
            content="启动一个新的执行任务。",
        ),
    )
    conversations = client.get(
        "/conversations",
        headers={"Authorization": f"Bearer {token}"},
    ).json()

    assert response.status_code == 200
    assert len(conversations) == 1
    assert conversations[0]["title"] == "启动一个新的执行任务。"
    assert conversations[0]["messages"][0] == {
        "role": "user",
        "content": "启动一个新的执行任务。",
    }


def test_copilotkit_stop_cancels_active_backend_agent_run():
    client = TestClient(app)
    token = approved_user_token(client)
    conversation_id = create_conversation(client, token)
    run = client.post(
        f"/conversations/{conversation_id}/runs",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": "Keep working until stopped."},
    ).json()

    response = client.post(
        f"/copilotkit/agent/default/stop/{conversation_id}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 204
    assert agent_run_store.get(run["id"]).status == AgentRunStatus.CANCELLED
