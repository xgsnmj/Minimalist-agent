from agents import HostedMCPTool, ToolSearchTool
from fastapi.testclient import TestClient

from apps.api.app.agent_runs import agent_run_store
from apps.api.app.agents import agent_store
from apps.api.app.artifacts import artifact_store
from apps.api.app.auth import local_account_store
from apps.api.app.conversations import conversation_store
from apps.api.app.app import app
from apps.api.app.mcp_servers import (
    McpConnectionType,
    McpServerMutationRequest,
    McpServerStore,
    McpToolAuthorizationRequest,
    mcp_server_store,
)
from apps.api.app.model_configurations import (
    ModelConfigurationMutationRequest,
    model_configuration_store,
)
from apps.api.app.run_attachments import run_attachment_store
from apps.api.app.run_event_log import run_event_log_store
from apps.api.app.runtime_tools import public_tool_name_for_sdk_name, sdk_tools_for_run
from apps.api.tests.support import (
    configure_default_agent_model,
    create_model_configuration_for_tests,
    invoke_sdk_tool_for_tests,
)


def setup_function():
    local_account_store.reset()
    agent_store.reset()
    model_configuration_store.reset()
    conversation_store.reset()
    agent_run_store.reset()
    artifact_store.reset_for_tests()
    run_attachment_store.reset_for_tests()
    run_event_log_store.reset_for_tests()
    mcp_server_store.reset()
    configure_default_agent_model()


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


def test_mcp_server_store_persists_servers_tools_and_authorizations():
    server = mcp_server_store.create(
        McpServerMutationRequest(
            name="Research MCP",
            connection_type=McpConnectionType.SSE,
            url="https://mcp.example.com/sse",
            header_secret_refs={"Authorization": "secret:mcp-token"},
            timeout_seconds=30,
            enabled=True,
        )
    )
    mcp_server_store.discover_tools(server.id)
    authorization = mcp_server_store.authorize_tool(
        agent_id=7,
        request=McpToolAuthorizationRequest(
            server_id=server.id,
            tool_name="mcp.research.search",
            enabled=True,
        ),
    )

    fresh_store = McpServerStore()

    assert fresh_store.get(server.id).name == "Research MCP"
    assert [
        tool.tool_name
        for tool in fresh_store.list_tools(server.id)
    ] == ["mcp.research.search", "mcp.research.fetch"]
    assert fresh_store.list_authorizations(
        agent_id=7,
        server_id=server.id,
    )[0].id == authorization.id
    assert fresh_store.is_tool_authorized(
        agent_id=7,
        server_ids=[server.id],
        tool_name="mcp.research.search",
    )

    updated = fresh_store.authorize_tool(
        agent_id=7,
        request=McpToolAuthorizationRequest(
            server_id=server.id,
            tool_name="mcp.research.search",
            enabled=False,
        ),
    )

    assert updated.id == authorization.id
    assert not fresh_store.is_tool_authorized(
        agent_id=7,
        server_ids=[server.id],
        tool_name="mcp.research.search",
    )


def test_administrator_authorizes_mcp_tool_for_agent_and_agents_sdk_exposes_it():
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
    model_id = create_model_configuration_for_tests()
    agent = client.post(
        "/admin/agents",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "MCP Agent",
            "description": "Uses authorized MCP tools.",
            "icon": "plug",
            "instruction": "Use MCP tools only when authorized.",
            "default_model_configuration_id": model_id,
            "allowed_model_configuration_ids": [model_id],
            "capability_policy": {
                "mcp_server_ids": [server["id"]],
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

    assert sdk_tools_for_run(agent_run_store.get(run["id"])) == []
    authorization_response = client.post(
        f"/admin/agents/{agent['id']}/mcp-tool-authorizations",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "server_id": server["id"],
            "tool_name": "mcp.research.search",
            "enabled": True,
        },
    )
    allowed_call = invoke_sdk_tool_for_tests(
        run_id=run["id"],
        tool_name="mcp.research.search",
        payload={
            "query": "after authorization",
            "token": "secret",
        },
    )
    stream_response = client.get(
        f"/runs/{run['id']}/events",
        headers={
            "Authorization": f"Bearer {user_token}",
            "Accept": "text/event-stream",
        },
    )

    assert [
        public_tool_name_for_sdk_name(tool.name)
        for tool in sdk_tools_for_run(agent_run_store.get(run["id"]))
    ] == ["mcp"]
    native_mcp_tool = sdk_tools_for_run(agent_run_store.get(run["id"]))[0]
    assert isinstance(native_mcp_tool, HostedMCPTool)
    assert native_mcp_tool.tool_config["allowed_tools"] == ["mcp.research.search"]
    assert [
        public_tool_name_for_sdk_name(tool.name)
        for tool in sdk_tools_for_run(agent_run_store.get(run["id"]), prefer_native=False)
    ] == ["mcp.research.search"]
    assert authorization_response.status_code == 201
    assert authorization_response.json()["agent_id"] == agent["id"]
    assert authorization_response.json()["tool_name"] == "mcp.research.search"
    assert allowed_call["capability"] == "mcp"
    assert allowed_call["safe_input"] == {"query": "after authorization"}
    assert allowed_call["provenance"] == {
        "gateway": "openai_agents_sdk",
        "provider": "mcp",
        "server_id": str(server["id"]),
    }
    assert '"tool_name":"mcp.research.search"' in stream_response.text
    assert '"token"' not in stream_response.text


def test_deferred_native_mcp_registers_tool_search_tool():
    client = TestClient(app)
    admin_token = administrator_token(client)
    user_token = approved_user_token(client)
    server = client.post(
        "/admin/mcp-servers",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "Deferred Research MCP",
            "connection_type": "streamable_http",
            "url": "https://mcp.example.com/deferred",
            "header_secret_refs": {},
            "timeout_seconds": 20,
            "enabled": True,
        },
    ).json()
    client.post(
        f"/admin/mcp-servers/{server['id']}/discover",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    model_configuration = model_configuration_store.create(
        ModelConfigurationMutationRequest(
            provider_id="openai",
            name="OpenAI Deferred MCP",
            model_name="gpt-5",
            endpoint="https://api.openai.com/v1",
            credential_reference="env:TEST_MODEL_API_KEY",
            native_tool_settings={
                    "mcp": {"defer_loading": True},
                    "tool_search": {
                        "description": "Find deferred MCP tools.",
                        "execution": "server",
                    },
            },
            enabled=True,
        )
    )
    agent = client.post(
        "/admin/agents",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "Deferred MCP Agent",
            "description": "Uses deferred MCP tools.",
            "icon": "plug",
            "instruction": "Use MCP tools only when authorized.",
            "default_model_configuration_id": model_configuration.id,
            "allowed_model_configuration_ids": [model_configuration.id],
            "capability_policy": {
                "mcp_server_ids": [server["id"]],
                "search_enabled": False,
                "page_read_enabled": False,
            },
        },
    ).json()
    client.post(
        f"/admin/agents/{agent['id']}/mcp-tool-authorizations",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "server_id": server["id"],
            "tool_name": "mcp.research.search",
            "enabled": True,
        },
    )
    conversation = client.post(
        "/conversations",
        headers={"Authorization": f"Bearer {user_token}"},
        json={
            "title": "Deferred MCP run",
            "agent_id": agent["id"],
            "initial_message": "Start this conversation.",
        },
    ).json()
    run = client.post(
        f"/conversations/{conversation['id']}/runs",
        headers={"Authorization": f"Bearer {user_token}"},
        json={"message": "Use deferred MCP tools."},
    ).json()

    tools = sdk_tools_for_run(agent_run_store.get(run["id"]))

    assert [public_tool_name_for_sdk_name(tool.name) for tool in tools] == [
        "mcp",
        "tool.search",
    ]
    assert isinstance(tools[0], HostedMCPTool)
    assert tools[0].tool_config["defer_loading"] is True
    assert isinstance(tools[1], ToolSearchTool)
    assert tools[1].description == "Find deferred MCP tools."
    assert tools[1].execution == "server"
