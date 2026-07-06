from fastapi.testclient import TestClient

from apps.api.app.agent_runs import agent_run_store
from apps.api.app.agents import AgentCapabilityPolicyResponse, AgentUpdateRequest, agent_store
from apps.api.app.auth import local_account_store
from apps.api.app.conversations import conversation_store
from apps.api.app.app import app
from apps.api.app.model_configurations import model_configuration_store
from apps.api.app.run_event_log import run_event_log_store
from apps.api.app.runtime_tools import (
    project_safe_payload,
    public_tool_name_for_sdk_name,
    sdk_tools_for_run,
)
from apps.api.tests.support import configure_default_agent_model


def setup_function():
    local_account_store.reset()
    agent_store.reset()
    model_configuration_store.reset()
    conversation_store.reset()
    agent_run_store.reset()
    run_event_log_store.reset_for_tests()
    configure_default_agent_model()


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


def create_run(client: TestClient, token: str) -> int:
    conversation = client.post(
        "/conversations",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "Runtime tools",
            "agent_id": 1,
            "initial_message": "Start this conversation.",
        },
    ).json()
    return client.post(
        f"/conversations/{conversation['id']}/runs",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": "Use tools."},
    ).json()["id"]


def test_agent_run_tool_call_gateway_route_is_removed():
    client = TestClient(app)
    token = approved_user_token(client)
    run_id = create_run(client, token)

    response = client.post(
        f"/runs/{run_id}/tool-calls",
        headers={"Authorization": f"Bearer {token}"},
        json={"tool_name": "search.web", "input": {"query": "agent"}},
    )

    assert response.status_code == 404


def test_sdk_tools_are_registered_from_run_capability_snapshot():
    client = TestClient(app)
    token = approved_user_token(client)
    agent_store.update(
        1,
        AgentUpdateRequest(
            capability_policy=AgentCapabilityPolicyResponse(
                mcp_server_ids=[],
                sandbox_enabled=True,
                search_enabled=True,
                page_read_enabled=False,
            )
        ),
    )
    run_id = create_run(client, token)

    tool_names = [
        public_tool_name_for_sdk_name(tool.name)
        for tool in sdk_tools_for_run(agent_run_store.get(run_id))
    ]

    assert tool_names == ["search.web", "sandbox.exec"]


def test_runtime_tool_safe_payload_removes_sensitive_keys_recursively():
    assert project_safe_payload(
        {
            "query": "agent",
            "api_key": "secret",
            "nested": {"token": "secret", "keep": "visible"},
            "items": [{"password": "secret", "title": "kept"}],
        }
    ) == {
        "query": "agent",
        "nested": {"keep": "visible"},
        "items": [{"title": "kept"}],
    }
