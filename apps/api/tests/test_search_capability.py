from fastapi.testclient import TestClient

from apps.api.app.agent_runs import agent_run_store
from apps.api.app.agents import agent_store
from apps.api.app.artifacts import artifact_store
from apps.api.app.auth import local_account_store
from apps.api.app.conversations import conversation_store
from apps.api.app.app import app
from apps.api.app.mcp_servers import mcp_server_store
from apps.api.app.model_configurations import model_configuration_store
from apps.api.app.run_attachments import run_attachment_store
from apps.api.app.run_event_log import run_event_log_store
from apps.api.app.runtime_tools import public_tool_name_for_sdk_name, sdk_tools_for_run
from apps.api.app.search_providers import search_provider_store
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
    search_provider_store.reset()
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


def create_search_enabled_run(client: TestClient, admin_token: str, user_token: str) -> int:
    model_id = create_model_configuration_for_tests()
    agent = client.post(
        "/admin/agents",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "Search Agent",
            "description": "Uses Search Capability.",
            "icon": "search",
            "instruction": "Search only through the Agents SDK search tool.",
            "default_model_configuration_id": model_id,
            "allowed_model_configuration_ids": [model_id],
            "capability_policy": {
                "mcp_server_ids": [],
                "sandbox_enabled": False,
                "search_enabled": True,
                "page_read_enabled": False,
            },
        },
    ).json()
    conversation = client.post(
        "/conversations",
        headers={"Authorization": f"Bearer {user_token}"},
        json={
            "title": "Search run",
            "agent_id": agent["id"],
            "initial_message": "Start this conversation.",
        },
    ).json()
    return client.post(
        f"/conversations/{conversation['id']}/runs",
        headers={"Authorization": f"Bearer {user_token}"},
        json={"message": "Search the web."},
    ).json()["id"]


def test_administrator_configures_doubao_search_provider():
    client = TestClient(app)
    admin_token = administrator_token(client)

    list_response = client.get(
        "/admin/search-provider-configurations",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    update_response = client.patch(
        "/admin/search-provider-configurations/1",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "endpoint": "https://ark.cn-beijing.volces.com/api/v3/search",
            "credential_reference": "secret:doubao-search-key",
            "timeout_seconds": 15,
            "max_results": 2,
            "enabled": True,
        },
    )

    assert list_response.status_code == 200
    assert list_response.json()[0]["provider_id"] == "doubao"
    assert list_response.json()[0]["name"] == "Doubao Search Provider"
    assert update_response.status_code == 200
    assert update_response.json()["endpoint"] == "https://ark.cn-beijing.volces.com/api/v3/search"
    assert update_response.json()["credential_reference"] == "secret:doubao-search-key"
    assert update_response.json()["max_results"] == 2


def test_search_capability_invokes_doubao_provider_through_agents_sdk_tool():
    client = TestClient(app)
    admin_token = administrator_token(client)
    user_token = approved_user_token(client)
    client.patch(
        "/admin/search-provider-configurations/1",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"max_results": 2},
    )
    run_id = create_search_enabled_run(client, admin_token, user_token)

    run = agent_run_store.get(run_id)
    assert [public_tool_name_for_sdk_name(tool.name) for tool in sdk_tools_for_run(run)] == [
        "search.web"
    ]

    search_tool_call = invoke_sdk_tool_for_tests(
        run_id=run_id,
        tool_name="search.web",
        payload={
            "query": "Minimalist Agent background runs",
            "api_key": "do-not-leak",
        },
    )
    stream_response = client.get(
        f"/runs/{run_id}/events",
        headers={
            "Authorization": f"Bearer {user_token}",
            "Accept": "text/event-stream",
        },
    )
    resume_response = client.get(
        f"/runs/{run_id}/events",
        headers={
            "Authorization": f"Bearer {user_token}",
            "Accept": "text/event-stream",
            "Last-Event-ID": "2",
        },
    )

    assert search_tool_call["capability"] == "search"
    assert search_tool_call["provenance"] == {
        "gateway": "openai_agents_sdk",
        "provider": "doubao",
        "provider_configuration_id": "1",
    }
    assert search_tool_call["safe_input"] == {
        "query": "Minimalist Agent background runs"
    }
    assert search_tool_call["safe_output"]["summary"].startswith(
        "Doubao Search Provider returned 2 results"
    )
    assert len(search_tool_call["safe_output"]["results"]) == 2
    assert '"api_key"' not in stream_response.text
    assert '"provider":"doubao"' in stream_response.text
    assert "id: 3" in resume_response.text
    assert '"tool_name":"search.web"' in resume_response.text


def test_disabled_search_provider_returns_safe_tool_failure_and_unauthorized_tool_is_not_registered():
    client = TestClient(app)
    admin_token = administrator_token(client)
    user_token = approved_user_token(client)
    client.patch(
        "/admin/search-provider-configurations/1",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"enabled": False},
    )
    search_enabled_run = create_search_enabled_run(client, admin_token, user_token)
    disabled_provider_call = invoke_sdk_tool_for_tests(
        run_id=search_enabled_run,
        tool_name="search.web",
        payload={
            "query": "disabled provider",
            "authorization": "secret",
        },
    )
    disabled_provider_stream = client.get(
        f"/runs/{search_enabled_run}/events",
        headers={
            "Authorization": f"Bearer {user_token}",
            "Accept": "text/event-stream",
        },
    )
    conversation = client.post(
        "/conversations",
        headers={"Authorization": f"Bearer {user_token}"},
        json={
            "title": "Blocked search",
            "agent_id": 1,
            "initial_message": "Start this conversation.",
        },
    ).json()
    run = client.post(
        f"/conversations/{conversation['id']}/runs",
        headers={"Authorization": f"Bearer {user_token}"},
        json={"message": "Try search."},
    ).json()

    removed_gateway_response = client.post(
        f"/runs/{run['id']}/tool-calls",
        headers={"Authorization": f"Bearer {user_token}"},
        json={
            "tool_name": "search.web",
            "input": {"query": "blocked", "authorization": "secret"},
        },
    )

    assert removed_gateway_response.status_code == 404
    assert sdk_tools_for_run(agent_run_store.get(run["id"])) == []
    assert disabled_provider_call["status"] == "failed"
    assert disabled_provider_call["safe_input"] == {"query": "disabled provider"}
    assert disabled_provider_call["error_summary"] == "Search provider is disabled."
    assert '"status":"failed"' in disabled_provider_stream.text
