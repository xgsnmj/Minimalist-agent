from fastapi.testclient import TestClient

from apps.api.app.agent_runs import agent_run_store
from apps.api.app.agents import agent_store
from apps.api.app.artifacts import artifact_store
from apps.api.app.auth import local_account_store
from apps.api.app.conversations import conversation_store
from apps.api.app.app import app
from apps.api.app.mcp_servers import mcp_server_store
from apps.api.app.model_configurations import model_configuration_store
from apps.api.app.page_read_providers import page_read_provider_store
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
    page_read_provider_store.reset()
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


def create_page_read_enabled_run(
    client: TestClient,
    admin_token: str,
    user_token: str,
    *,
    search_enabled: bool = False,
    page_read_enabled: bool = True,
) -> int:
    model_id = create_model_configuration_for_tests()
    agent = client.post(
        "/admin/agents",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "Reader Agent",
            "description": "Uses Page Read Capability.",
            "icon": "book-open",
            "instruction": "Read known URLs only through the Agents SDK page tool.",
            "default_model_configuration_id": model_id,
            "allowed_model_configuration_ids": [model_id],
            "capability_policy": {
                "mcp_server_ids": [],
                "sandbox_enabled": False,
                "search_enabled": search_enabled,
                "page_read_enabled": page_read_enabled,
            },
        },
    ).json()
    conversation = client.post(
        "/conversations",
        headers={"Authorization": f"Bearer {user_token}"},
        json={
            "title": "Page read run",
            "agent_id": agent["id"],
            "initial_message": "Start this conversation.",
        },
    ).json()
    return client.post(
        f"/conversations/{conversation['id']}/runs",
        headers={"Authorization": f"Bearer {user_token}"},
        json={"message": "Read this URL."},
    ).json()["id"]


def test_administrator_configures_jina_reader_provider():
    client = TestClient(app)
    admin_token = administrator_token(client)

    list_response = client.get(
        "/admin/page-read-provider-configurations",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    update_response = client.patch(
        "/admin/page-read-provider-configurations/1",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "endpoint": "https://r.jina.ai/http://example.com",
            "credential_reference": "secret:jina-reader-key",
            "timeout_seconds": 12,
            "max_content_length": 1200,
            "allowed_domains": ["example.com", "docs.example.com"],
            "enabled": True,
        },
    )

    assert list_response.status_code == 200
    assert list_response.json()[0]["provider_id"] == "jina_reader"
    assert list_response.json()[0]["name"] == "Jina Reader Provider"
    assert update_response.status_code == 200
    assert update_response.json()["endpoint"] == "https://r.jina.ai/http://example.com"
    assert update_response.json()["credential_reference"] == "secret:jina-reader-key"
    assert update_response.json()["max_content_length"] == 1200
    assert update_response.json()["allowed_domains"] == [
        "example.com",
        "docs.example.com",
    ]


def test_page_read_capability_invokes_jina_reader_through_agents_sdk_tool():
    client = TestClient(app)
    admin_token = administrator_token(client)
    user_token = approved_user_token(client)
    client.patch(
        "/admin/page-read-provider-configurations/1",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "max_content_length": 180,
            "allowed_domains": ["example.com"],
        },
    )
    run_id = create_page_read_enabled_run(client, admin_token, user_token)

    run = agent_run_store.get(run_id)
    assert [public_tool_name_for_sdk_name(tool.name) for tool in sdk_tools_for_run(run)] == [
        "page.read"
    ]

    page_read_call = invoke_sdk_tool_for_tests(
        run_id=run_id,
        tool_name="page.read",
        payload={
            "url": "https://example.com/research/mvp",
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

    assert page_read_call["capability"] == "page_read"
    assert page_read_call["status"] == "completed"
    assert page_read_call["started_at"]
    assert page_read_call["ended_at"]
    assert page_read_call["provenance"] == {
        "gateway": "openai_agents_sdk",
        "provider": "jina_reader",
        "provider_configuration_id": "1",
    }
    assert page_read_call["safe_input"] == {
        "url": "https://example.com/research/mvp"
    }
    assert page_read_call["safe_output"]["summary"].startswith(
        "Jina Reader Provider read https://example.com/research/mvp"
    )
    assert page_read_call["safe_output"]["url"] == "https://example.com/research/mvp"
    assert len(page_read_call["safe_output"]["content"]) <= 180
    assert '"api_key"' not in stream_response.text
    assert '"tool_name":"page.read"' in stream_response.text
    assert '"tool_name":"search.web"' not in stream_response.text
    assert '"provider":"jina_reader"' in stream_response.text
    assert "id: 3" in resume_response.text
    assert '"tool_name":"page.read"' in resume_response.text


def test_page_read_capability_is_separate_from_search_and_records_safe_failures():
    client = TestClient(app)
    admin_token = administrator_token(client)
    user_token = approved_user_token(client)
    search_only_run = create_page_read_enabled_run(
        client,
        admin_token,
        user_token,
        search_enabled=True,
        page_read_enabled=False,
    )
    assert [
        public_tool_name_for_sdk_name(tool.name)
        for tool in sdk_tools_for_run(agent_run_store.get(search_only_run))
    ] == ["search.web"]

    client.patch(
        "/admin/page-read-provider-configurations/1",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"allowed_domains": ["docs.example.com"]},
    )
    page_read_run = create_page_read_enabled_run(client, admin_token, user_token)
    domain_policy_call = invoke_sdk_tool_for_tests(
        run_id=page_read_run,
        tool_name="page.read",
        payload={
            "url": "https://example.com/not-allowed",
            "authorization": "secret",
        },
    )
    domain_policy_stream = client.get(
        f"/runs/{page_read_run}/events",
        headers={
            "Authorization": f"Bearer {user_token}",
            "Accept": "text/event-stream",
        },
    )

    assert domain_policy_call["status"] == "failed"
    assert domain_policy_call["safe_input"] == {
        "url": "https://example.com/not-allowed"
    }
    assert domain_policy_call["error_summary"] == (
        "URL is outside the Page Read Provider domain policy."
    )
    assert '"status":"failed"' in domain_policy_stream.text
