from fastapi.testclient import TestClient

from apps.api.app.agent_runs import agent_run_store
from apps.api.app.agents import agent_store
from apps.api.app.artifacts import artifact_store
from apps.api.app.auth import local_account_store
from apps.api.app.conversations import conversation_store
from apps.api.app.app import app
from apps.api.app.model_configurations import model_configuration_store
from apps.api.app.run_attachments import run_attachment_store
from apps.api.app.run_event_log import run_event_log_store
from apps.api.app.runtime_tools import public_tool_name_for_sdk_name, sdk_tools_for_run
from apps.api.app.sandbox_runtime import sandbox_runtime_store
from apps.api.tests.support import (
    configure_default_agent_model,
    create_model_configuration_for_tests,
    invoke_sdk_tool_for_tests,
)


class FailingObjectStorage:
    def put_bytes(self, **_kwargs):
        raise RuntimeError("minio write failed")

    def get_bytes(self, **_kwargs):
        raise RuntimeError("minio read failed")

    def reset(self) -> None:
        return None


def setup_function():
    local_account_store.reset()
    agent_store.reset()
    model_configuration_store.reset()
    conversation_store.reset()
    agent_run_store.reset()
    artifact_store.reset_for_tests()
    run_attachment_store.reset_for_tests()
    run_event_log_store.reset_for_tests()
    sandbox_runtime_store.reset()
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


def create_sandbox_run(
    client: TestClient,
    admin_token: str,
    user_token: str,
    *,
    sandbox_enabled: bool,
) -> tuple[int, int]:
    model_id = create_model_configuration_for_tests()
    agent = client.post(
        "/admin/agents",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "Sandbox Agent",
            "description": "Uses Sandbox Capability.",
            "icon": "terminal",
            "instruction": "Use sandbox execution only through the Agents SDK sandbox tool.",
            "default_model_configuration_id": model_id,
            "allowed_model_configuration_ids": [model_id],
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

    run = agent_run_store.get(run_id)
    assert [public_tool_name_for_sdk_name(tool.name) for tool in sdk_tools_for_run(run)] == [
        "sandbox.exec"
    ]

    sandbox_call = invoke_sdk_tool_for_tests(
        run_id=run_id,
        tool_name="sandbox.exec",
        payload={
            "command": "python analyze.py",
            "artifact_filename": "sandbox-report.md",
            "artifact_body": "# Sandbox Report\n\nGenerated inside SDK sandbox.",
            "api_key": "do-not-leak",
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

    assert sandbox_call["tool_name"] == "sandbox.exec"
    assert sandbox_call["capability"] == "sandbox"
    assert sandbox_call["status"] == "completed"
    assert sandbox_call["safe_input"] == {
        "command": "python analyze.py",
        "artifact_filename": "sandbox-report.md",
        "artifact_body": "# Sandbox Report\n\nGenerated inside SDK sandbox.",
    }
    assert sandbox_call["safe_output"]["summary"] == (
        "OpenAI Agents SDK sandbox completed python analyze.py."
    )
    assert sandbox_call["safe_output"]["artifact"]["filename"] == "sandbox-report.md"
    assert sandbox_call["safe_output"]["artifact"]["preview_type"] == "markdown"
    assert sandbox_call["provenance"] == {
        "gateway": "openai_agents_sdk",
        "provider": "openai_agents_sdk_sandbox",
    }
    artifact_id = sandbox_call["safe_output"]["artifact"]["artifact_id"]
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

    removed_gateway_response = client.post(
        f"/runs/{run_id}/tool-calls",
        headers={"Authorization": f"Bearer {user_token}"},
        json={"tool_name": "sandbox.exec", "input": {"command": "python blocked.py"}},
    )
    stream_response = client.get(
        f"/runs/{run_id}/events",
        headers={
            "Authorization": f"Bearer {user_token}",
            "Accept": "text/event-stream",
        },
    )

    assert removed_gateway_response.status_code == 404
    assert sdk_tools_for_run(agent_run_store.get(run_id)) == []
    assert '"authorization"' not in stream_response.text
    assert '"tool_name":"sandbox.exec"' not in stream_response.text


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

    sandbox_call = invoke_sdk_tool_for_tests(
        run_id=run_id,
        tool_name="sandbox.exec",
        payload={
            "command": "docker run unsafe-image",
            "artifact_filename": None,
            "artifact_body": None,
        },
    )

    assert sandbox_call["status"] == "failed"
    assert sandbox_call["error_summary"] == (
        "Sandbox Capability uses OpenAI Agents SDK sandbox, not host Docker."
    )


def test_sandbox_storage_failure_is_recorded_as_safe_tool_failure(monkeypatch):
    from apps.api.app import artifacts

    monkeypatch.setattr(artifacts, "object_storage", FailingObjectStorage())
    client = TestClient(app, raise_server_exceptions=False)
    admin_token = administrator_token(client)
    user_token = approved_user_token(client)
    _conversation_id, run_id = create_sandbox_run(
        client,
        admin_token,
        user_token,
        sandbox_enabled=True,
    )

    sandbox_call = invoke_sdk_tool_for_tests(
        run_id=run_id,
        tool_name="sandbox.exec",
        payload={
            "command": "python write_artifact.py",
            "artifact_filename": "storage-failure.md",
            "artifact_body": "# Storage failure",
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

    assert sandbox_call["status"] == "failed"
    assert sandbox_call["error_summary"] == "minio write failed"
    assert sandbox_call["provenance"] == {
        "gateway": "openai_agents_sdk",
        "provider": "openai_agents_sdk_sandbox",
    }
    assert '"api_key"' not in stream_response.text
    assert '"status":"failed"' in stream_response.text
