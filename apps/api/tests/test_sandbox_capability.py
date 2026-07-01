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
from apps.api.app.sandbox_runtime import sandbox_runtime_store
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
    sandbox_runtime_store.reset()


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


def create_sandbox_run(
    client: TestClient,
    admin_token: str,
    user_token: str,
    *,
    sandbox_enabled: bool,
) -> tuple[int, int]:
    agent = client.post(
        "/admin/agents",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "Sandbox Agent",
            "description": "Uses Sandbox Capability.",
            "icon": "terminal",
            "instruction": "Use sandbox execution only through the Agent Tool Gateway.",
            "capability_policy": {
                "mcp_server_ids": [],
                "sandbox_enabled": sandbox_enabled,
                "search_enabled": False,
                "page_read_enabled": False,
            },
        },
    ).json()
    conversation = client.post(
        "/conversations",
        headers={"Authorization": f"Bearer {user_token}"},
        json={
            "title": "Sandbox run",
            "agent_id": agent["id"],
            "initial_message": "Start this conversation.",
        },
    ).json()
    run = client.post(
        f"/conversations/{conversation['id']}/runs",
        headers={"Authorization": f"Bearer {user_token}"},
        json={"message": "Run the sandbox task."},
    ).json()
    return conversation["id"], run["id"]


def test_authorized_sandbox_execution_records_tool_call_and_creates_artifact_preview():
    client = TestClient(app)
    admin_token = administrator_token(client)
    user_token = approved_user_token(client)
    conversation_id, run_id = create_sandbox_run(
        client,
        admin_token,
        user_token,
        sandbox_enabled=True,
    )

    sandbox_response = client.post(
        f"/runs/{run_id}/tool-calls",
        headers={"Authorization": f"Bearer {user_token}"},
        json={
            "tool_name": "sandbox.exec",
            "input": {
                "command": "python analyze.py",
                "artifact_filename": "sandbox-report.md",
                "artifact_body": "# Sandbox Report\n\nGenerated inside SDK sandbox.",
                "api_key": "do-not-leak",
            },
        },
    )
    conversation_response = client.get(
        f"/conversations/{conversation_id}",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    stream_response = client.get(
        f"/runs/{run_id}/events",
        headers={
            "Authorization": f"Bearer {user_token}",
            "Accept": "text/event-stream",
        },
    )

    assert sandbox_response.status_code == 201
    assert sandbox_response.json()["tool_name"] == "sandbox.exec"
    assert sandbox_response.json()["capability"] == "sandbox"
    assert sandbox_response.json()["status"] == "completed"
    assert sandbox_response.json()["safe_input"] == {
        "command": "python analyze.py",
        "artifact_filename": "sandbox-report.md",
        "artifact_body": "# Sandbox Report\n\nGenerated inside SDK sandbox.",
    }
    assert sandbox_response.json()["safe_output"]["summary"] == (
        "OpenAI Agents SDK sandbox completed python analyze.py."
    )
    assert sandbox_response.json()["safe_output"]["artifact"]["filename"] == "sandbox-report.md"
    assert sandbox_response.json()["safe_output"]["artifact"]["preview_type"] == "markdown"
    assert sandbox_response.json()["provenance"] == {
        "gateway": "agent_tool_gateway",
        "provider": "openai_agents_sdk_sandbox",
    }
    artifact_id = sandbox_response.json()["safe_output"]["artifact"]["artifact_id"]
    preview_response = client.get(
        f"/artifacts/{artifact_id}/preview",
        headers={"Authorization": f"Bearer {user_token}"},
    )

    assert preview_response.status_code == 200
    assert preview_response.json()["preview_type"] == "markdown"
    assert preview_response.json()["text"].startswith("# Sandbox Report")
    assert conversation_response.json()["messages"][-1]["artifact_reference"] == {
        "artifact_id": artifact_id,
        "filename": "sandbox-report.md",
        "preview_type": "markdown",
    }
    assert '"api_key"' not in stream_response.text
    assert '"provider":"openai_agents_sdk_sandbox"' in stream_response.text
    assert '"tool_name":"sandbox.exec"' in stream_response.text


def test_unauthorized_sandbox_execution_is_blocked_and_audited_safely():
    client = TestClient(app)
    admin_token = administrator_token(client)
    user_token = approved_user_token(client)
    _conversation_id, run_id = create_sandbox_run(
        client,
        admin_token,
        user_token,
        sandbox_enabled=False,
    )

    response = client.post(
        f"/runs/{run_id}/tool-calls",
        headers={"Authorization": f"Bearer {user_token}"},
        json={
            "tool_name": "sandbox.exec",
            "input": {
                "command": "python blocked.py",
                "authorization": "secret",
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

    assert response.status_code == 403
    assert list_response.json()[0]["status"] == "rejected"
    assert list_response.json()[0]["safe_input"] == {"command": "python blocked.py"}
    assert list_response.json()[0]["error_summary"] == (
        "Tool is not authorized for this Agent Run."
    )
    assert '"authorization"' not in stream_response.text
    assert '"status":"rejected"' in stream_response.text


def test_sandbox_capability_does_not_expose_host_docker_boundary():
    client = TestClient(app)
    admin_token = administrator_token(client)
    user_token = approved_user_token(client)
    _conversation_id, run_id = create_sandbox_run(
        client,
        admin_token,
        user_token,
        sandbox_enabled=True,
    )

    response = client.post(
        f"/runs/{run_id}/tool-calls",
        headers={"Authorization": f"Bearer {user_token}"},
        json={
            "tool_name": "sandbox.exec",
            "input": {"command": "docker run unsafe-image"},
        },
    )
    list_response = client.get(
        f"/runs/{run_id}/tool-calls",
        headers={"Authorization": f"Bearer {user_token}"},
    )

    assert response.status_code == 503
    assert list_response.json()[0]["status"] == "failed"
    assert list_response.json()[0]["error_summary"] == (
        "Sandbox Capability uses OpenAI Agents SDK sandbox, not host Docker."
    )
