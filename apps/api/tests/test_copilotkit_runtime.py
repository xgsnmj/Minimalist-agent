import json

from fastapi.testclient import TestClient

from apps.api.app.agent_runs import AgentRunStatus, agent_run_store
from apps.api.app.agents import AgentMutationRequest, AgentUpdateRequest, agent_store
from apps.api.app.auth import local_account_store
from apps.api.app.conversations import conversation_store
from apps.api.app.copilotkit_runtime import copilot_thread_mapping_store
from apps.api.app.app import app
from apps.api.app.model_configurations import model_configuration_store
from apps.api.app.run_event_log import run_event_log_store
from apps.api.app.runtime import runtime_store
from apps.api.tests.support import (
    configure_default_agent_model,
    create_model_configuration_for_tests,
    use_fake_agent_runtime,
)


def setup_function():
    local_account_store.reset()
    agent_store.reset()
    model_configuration_store.reset()
    conversation_store.reset()
    agent_run_store.reset()
    run_event_log_store.reset_for_tests()
    runtime_store.reset()
    copilot_thread_mapping_store.reset()
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


def text_message_content_events(response_text: str) -> list[dict]:
    events = []
    for line in response_text.splitlines():
        if not line.startswith("data: "):
            continue
        event = json.loads(line.removeprefix("data: "))
        if event.get("type") == "TEXT_MESSAGE_CONTENT":
            events.append(event)
    return events


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
    content_events = text_message_content_events(response.text)
    assert len(content_events) > 1
    assert "".join(event["delta"] for event in content_events) == (
        "openai:gpt-5 handled Find recent market signals."
    )
    delta_events = [
        event
        for event in run_event_log_store.list_after(run_id=completed_run.id, after_sequence=0)
        if event.event_type == "message.delta"
    ]
    assert delta_events
    assert "".join(event.data["delta"] for event in delta_events) == (
        "openai:gpt-5 handled Find recent market signals."
    )
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


def test_copilotkit_run_uses_forwarded_model_selection_for_new_conversation():
    client = TestClient(app)
    token = approved_user_token(client)
    default_model_id = agent_store.get(1).default_model_configuration_id
    selected_model_id = create_model_configuration_for_tests(model_name="gpt-5-mini")
    assert default_model_id is not None
    agent_store.update(
        1,
        AgentUpdateRequest(
            default_model_configuration_id=default_model_id,
            allowed_model_configuration_ids=[default_model_id, selected_model_id],
        ),
    )
    payload = copilot_run_payload(
        thread_id="copilot-thread-selected-model",
        content="使用前端选择的模型。",
    )
    payload["forwardedProps"] = {
        "selected_model_configuration_id": selected_model_id,
        "thread_id": "draft-agent-1-model-selected",
    }

    response = client.post(
        "/copilotkit/agent/default/run",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "text/event-stream",
        },
        json=payload,
    )
    conversations = client.get(
        "/conversations",
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    completed_run = agent_run_store.list_all()[0]

    assert response.status_code == 200
    assert completed_run.full_trace["model_name"] == "gpt-5-mini"
    assert conversations[0]["selected_model_configuration_id"] == selected_model_id
    assert conversations[0]["messages"][-1] == {
        "role": "assistant",
        "content": "openai:gpt-5-mini handled 使用前端选择的模型。",
    }


def test_copilotkit_run_rejects_forwarded_model_outside_agent_policy():
    client = TestClient(app)
    token = approved_user_token(client)
    rejected_model_id = create_model_configuration_for_tests(model_name="gpt-5-mini")
    payload = copilot_run_payload(
        thread_id="copilot-thread-rejected-model",
        content="尝试使用未授权模型。",
    )
    payload["forwardedProps"] = {
        "selected_model_configuration_id": rejected_model_id,
    }

    response = client.post(
        "/copilotkit/agent/default/run",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "text/event-stream",
        },
        json=payload,
    )
    conversations = client.get(
        "/conversations",
        headers={"Authorization": f"Bearer {token}"},
    ).json()

    assert response.status_code == 409
    assert response.json()["detail"] == "Model Configuration is not allowed for this Agent."
    assert conversations == []


def test_copilotkit_run_prefers_forwarded_conversation_id_over_thread_id():
    client = TestClient(app)
    token = approved_user_token(client)
    conversation_id = create_conversation(client, token)
    payload = copilot_run_payload(
        thread_id="copilot-generated-thread",
        content="继续已有对话。",
    )
    payload["forwardedProps"] = {
        "conversation_id": conversation_id,
        "thread_id": "conversation-from-forwarded-props",
    }

    response = client.post(
        "/copilotkit/agent/default/run",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "text/event-stream",
        },
        json=payload,
    )
    conversations = client.get(
        "/conversations",
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    conversation = client.get(
        f"/conversations/{conversation_id}",
        headers={"Authorization": f"Bearer {token}"},
    ).json()

    assert response.status_code == 200
    assert len(conversations) == 1
    assert f'"conversationId":{conversation_id}' in response.text
    persisted_messages = [
        message for message in conversation["messages"] if message.get("event_type") is None
    ]
    assert persisted_messages[-2:] == [
        {"role": "user", "content": "继续已有对话。"},
        {"role": "assistant", "content": "openai:gpt-5 handled 继续已有对话。"},
    ]


def test_copilotkit_run_preserves_existing_conversation_model_selection():
    client = TestClient(app)
    token = approved_user_token(client)
    default_model_id = agent_store.get(1).default_model_configuration_id
    forwarded_model_id = create_model_configuration_for_tests(model_name="gpt-5-mini")
    assert default_model_id is not None
    agent_store.update(
        1,
        AgentUpdateRequest(
            default_model_configuration_id=default_model_id,
            allowed_model_configuration_ids=[default_model_id, forwarded_model_id],
        ),
    )
    conversation_id = create_conversation(client, token)
    payload = copilot_run_payload(
        thread_id=f"conversation-{conversation_id}",
        content="沿用已有对话模型。",
    )
    payload["forwardedProps"] = {
        "conversation_id": conversation_id,
        "selected_model_configuration_id": forwarded_model_id,
    }

    response = client.post(
        "/copilotkit/agent/default/run",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "text/event-stream",
        },
        json=payload,
    )
    completed_run = agent_run_store.list_all()[0]
    conversation = client.get(
        f"/conversations/{conversation_id}",
        headers={"Authorization": f"Bearer {token}"},
    ).json()

    assert response.status_code == 200
    assert completed_run.capability_snapshot.selected_model_configuration_id == default_model_id
    assert completed_run.full_trace["model_name"] == "gpt-5"
    assert conversation["selected_model_configuration_id"] == default_model_id
    assert conversation["messages"][-1] == {
        "role": "assistant",
        "content": "openai:gpt-5 handled 沿用已有对话模型。",
    }


def test_copilotkit_run_rejects_agent_mismatch_for_existing_conversation():
    client = TestClient(app)
    token = approved_user_token(client)
    model_id = agent_store.get(1).default_model_configuration_id
    assert model_id is not None
    second_agent = agent_store.create(
        AgentMutationRequest(
            name="Second Agent",
            description="Separate CopilotKit agent.",
            icon="agent",
            instruction="Help from a separate agent.",
            default_model_configuration_id=model_id,
            allowed_model_configuration_ids=[model_id],
        )
    )
    conversation_response = client.post(
        "/conversations",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "Second agent conversation",
            "agent_id": second_agent.id,
            "initial_message": "Start with the second agent.",
        },
    )
    conversation_id = conversation_response.json()["id"]
    payload = copilot_run_payload(
        thread_id=f"conversation-{conversation_id}",
        content="尝试用默认智能体继续。",
    )
    payload["forwardedProps"] = {"conversation_id": conversation_id}

    response = client.post(
        "/copilotkit/agent/default/run",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "text/event-stream",
        },
        json=payload,
    )

    assert conversation_response.status_code == 201
    assert response.status_code == 409
    assert response.json()["detail"] == "CopilotKit Agent does not match the Agent Conversation."
    assert agent_run_store.list_all() == []


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
