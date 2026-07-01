from fastapi.testclient import TestClient

from apps.api.app.agent_runs import agent_run_store
from apps.api.app.agents import agent_store
from apps.api.app.artifacts import artifact_store
from apps.api.app.auth import local_account_store
from apps.api.app.conversations import conversation_store
from apps.api.app.main import app
from apps.api.app.model_configurations import model_configuration_store
from apps.api.app.run_attachments import run_attachment_store
from apps.api.app.run_event_log import run_event_log_store
from apps.api.app.search_providers import search_provider_store
from apps.api.app.tool_gateway import agent_tool_gateway_store


def setup_function():
    local_account_store.reset()
    agent_store.reset()
    model_configuration_store.reset()
    conversation_store.reset()
    agent_run_store.reset()
    artifact_store.reset_for_tests()
    run_attachment_store.reset_for_tests()
    run_event_log_store.reset_for_tests()
    agent_tool_gateway_store.reset()
    search_provider_store.reset()


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


def administrator_token(client: TestClient) -> str:
    local_account_store.bootstrap_administrator(
        username="admin",
        password="correct horse battery staple",
    )
    return client.post(
        "/auth/login",
        json={
            "login": "admin",
            "password": "correct horse battery staple",
        },
    ).json()["access_token"]


def create_agent_with_search(client: TestClient, admin_token: str) -> int:
    response = client.post(
        "/admin/agents",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "Research Agent",
            "description": "Runs governed tool calls.",
            "icon": "search",
            "instruction": "Research carefully.",
            "capability_policy": {
                "mcp_server_ids": [],
                "sandbox_enabled": False,
                "search_enabled": True,
                "page_read_enabled": False,
            },
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


def create_run(client: TestClient, token: str, agent_id: int = 1) -> tuple[int, int]:
    conversation = client.post(
        "/conversations",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "Tool gateway",
            "agent_id": agent_id,
            "initial_message": "Start this conversation.",
        },
    ).json()
    run = client.post(
        f"/conversations/{conversation['id']}/runs",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": "Use a governed tool."},
    ).json()
    return conversation["id"], run["id"]


def test_allowed_tool_invocation_records_tool_call_and_streams_safe_event():
    client = TestClient(app)
    user_token = approved_user_token(client)
    admin_token = administrator_token(client)
    agent_id = create_agent_with_search(client, admin_token)
    _conversation_id, run_id = create_run(client, user_token, agent_id)

    invoke_response = client.post(
        f"/runs/{run_id}/tool-calls",
        headers={"Authorization": f"Bearer {user_token}"},
        json={
            "tool_name": "search.web",
            "input": {
                "query": "Minimalist Agent WorkBuddy patterns",
                "api_key": "should-not-leak",
            },
        },
    )
    list_response = client.get(
        f"/runs/{run_id}/tool-calls",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    stream_response = client.get(
        f"/runs/{run_id}/events",
        headers={
            "Authorization": f"Bearer {user_token}",
            "Accept": "text/event-stream",
        },
    )

    assert invoke_response.status_code == 201
    assert invoke_response.json()["tool_name"] == "search.web"
    assert invoke_response.json()["capability"] == "search"
    assert invoke_response.json()["status"] == "completed"
    assert invoke_response.json()["safe_input"] == {
        "query": "Minimalist Agent WorkBuddy patterns"
    }
    assert invoke_response.json()["safe_output"]["summary"].startswith(
        "Doubao Search Provider returned 3 results"
    )
    assert len(invoke_response.json()["safe_output"]["results"]) == 3
    assert invoke_response.json()["provenance"] == {
        "gateway": "agent_tool_gateway",
        "provider": "doubao",
        "provider_configuration_id": "1",
    }
    assert list_response.json() == [invoke_response.json()]
    assert "event: tool.call" in stream_response.text
    assert '"api_key"' not in stream_response.text
    assert '"tool_name":"search.web"' in stream_response.text


def test_disallowed_tool_invocation_is_rejected_and_audited_safely():
    client = TestClient(app)
    user_token = approved_user_token(client)
    _conversation_id, run_id = create_run(client, user_token)

    invoke_response = client.post(
        f"/runs/{run_id}/tool-calls",
        headers={"Authorization": f"Bearer {user_token}"},
        json={
            "tool_name": "search.web",
            "input": {
                "query": "Blocked query",
                "authorization": "Bearer secret",
            },
        },
    )
    list_response = client.get(
        f"/runs/{run_id}/tool-calls",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    stream_response = client.get(
        f"/runs/{run_id}/events",
        headers={
            "Authorization": f"Bearer {user_token}",
            "Accept": "text/event-stream",
        },
    )

    assert invoke_response.status_code == 403
    assert invoke_response.json()["detail"] == "Tool is not authorized for this Agent Run."
    assert list_response.json()[0]["status"] == "rejected"
    assert list_response.json()[0]["safe_input"] == {"query": "Blocked query"}
    assert list_response.json()[0]["error_summary"] == "Tool is not authorized for this Agent Run."
    assert "event: tool.call" in stream_response.text
    assert '"authorization"' not in stream_response.text
    assert '"status":"rejected"' in stream_response.text
