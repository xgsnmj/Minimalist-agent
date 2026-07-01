from fastapi.testclient import TestClient

from apps.api.app.agent_runs import agent_run_store
from apps.api.app.agents import agent_store
from apps.api.app.artifacts import artifact_store
from apps.api.app.auth import local_account_store
from apps.api.app.conversations import conversation_store
from apps.api.app.main import app
from apps.api.app.mcp_servers import mcp_server_store
from apps.api.app.model_configurations import model_configuration_store
from apps.api.app.run_attachments import run_attachment_store
from apps.api.app.run_event_log import run_event_log_store
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
    mcp_server_store.reset()


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


def test_administrator_registers_remote_mcp_server_and_discovers_tools():
    client = TestClient(app)
    token = administrator_token(client)

    create_response = client.post(
        "/admin/mcp-servers",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Research MCP",
            "connection_type": "sse",
            "url": "https://mcp.example.com/sse",
            "header_secret_refs": {"Authorization": "secret:mcp-token"},
            "timeout_seconds": 30,
            "enabled": True,
        },
    )
    stdio_response = client.post(
        "/admin/mcp-servers",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Local MCP",
            "connection_type": "stdio",
            "url": "stdio://local",
        },
    )
    discovery_response = client.post(
        f"/admin/mcp-servers/{create_response.json()['id']}/discover",
        headers={"Authorization": f"Bearer {token}"},
    )
    list_response = client.get(
        f"/admin/mcp-servers/{create_response.json()['id']}/tools",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert create_response.status_code == 201
    assert create_response.json()["connection_type"] == "sse"
    assert create_response.json()["header_secret_refs"] == {
        "Authorization": "secret:mcp-token"
    }
    assert create_response.json()["last_discovery_status"] == "not_run"
    assert stdio_response.status_code == 422
    assert discovery_response.status_code == 200
    assert discovery_response.json()["last_discovery_status"] == "succeeded"
    assert list_response.json()[0]["tool_name"] == "mcp.research.search"
    assert list_response.json()[0]["server_id"] == create_response.json()["id"]


def test_administrator_authorizes_mcp_tool_for_agent_and_gateway_enforces_it():
    client = TestClient(app)
    admin_token = administrator_token(client)
    user_token = approved_user_token(client)
    server = client.post(
        "/admin/mcp-servers",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "Research MCP",
            "connection_type": "streamable_http",
            "url": "https://mcp.example.com/mcp",
            "header_secret_refs": {"Authorization": "secret:mcp-token"},
            "timeout_seconds": 20,
            "enabled": True,
        },
    ).json()
    client.post(
        f"/admin/mcp-servers/{server['id']}/discover",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    agent = client.post(
        "/admin/agents",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "MCP Agent",
            "description": "Uses authorized MCP tools.",
            "icon": "plug",
            "instruction": "Use MCP tools only when authorized.",
            "capability_policy": {
                "mcp_server_ids": [server["id"]],
                "sandbox_enabled": False,
                "search_enabled": False,
                "page_read_enabled": False,
            },
        },
    ).json()
    conversation = client.post(
        "/conversations",
        headers={"Authorization": f"Bearer {user_token}"},
        json={
            "title": "MCP run",
            "agent_id": agent["id"],
            "initial_message": "Start this conversation.",
        },
    ).json()
    run = client.post(
        f"/conversations/{conversation['id']}/runs",
        headers={"Authorization": f"Bearer {user_token}"},
        json={"message": "Use the MCP tool."},
    ).json()

    blocked_response = client.post(
        f"/runs/{run['id']}/tool-calls",
        headers={"Authorization": f"Bearer {user_token}"},
        json={
            "tool_name": "mcp.research.search",
            "input": {"query": "before authorization", "token": "secret"},
        },
    )
    authorization_response = client.post(
        f"/admin/agents/{agent['id']}/mcp-tool-authorizations",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "server_id": server["id"],
            "tool_name": "mcp.research.search",
            "enabled": True,
        },
    )
    allowed_response = client.post(
        f"/runs/{run['id']}/tool-calls",
        headers={"Authorization": f"Bearer {user_token}"},
        json={
            "tool_name": "mcp.research.search",
            "input": {"query": "after authorization", "token": "secret"},
        },
    )
    stream_response = client.get(
        f"/runs/{run['id']}/events",
        headers={
            "Authorization": f"Bearer {user_token}",
            "Accept": "text/event-stream",
        },
    )

    assert blocked_response.status_code == 403
    assert authorization_response.status_code == 201
    assert authorization_response.json()["agent_id"] == agent["id"]
    assert authorization_response.json()["tool_name"] == "mcp.research.search"
    assert allowed_response.status_code == 201
    assert allowed_response.json()["capability"] == "mcp"
    assert allowed_response.json()["safe_input"] == {"query": "after authorization"}
    assert allowed_response.json()["provenance"] == {
        "gateway": "agent_tool_gateway",
        "provider": "mcp",
        "server_id": str(server["id"]),
    }
    assert '"tool_name":"mcp.research.search"' in stream_response.text
    assert '"token"' not in stream_response.text
