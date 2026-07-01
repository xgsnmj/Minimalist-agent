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
from apps.api.app.runtime import runtime_store
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
    runtime_store.reset()


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


def approved_user(client: TestClient, username: str) -> tuple[int, str]:
    account = client.post(
        "/auth/register",
        json={
            "username": username,
            "email": f"{username}@example.com",
            "password": "correct horse battery staple",
        },
    ).json()
    local_account_store.approve(account["id"])
    token = client.post(
        "/auth/login",
        json={
            "login": username,
            "password": "correct horse battery staple",
        },
    ).json()["access_token"]
    return account["id"], token


def create_model(client: TestClient, admin_token: str) -> int:
    return client.post(
        "/admin/model-configurations",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "provider_id": "openai",
            "name": "Primary",
            "model_name": "gpt-5",
            "endpoint": "https://api.openai.com/v1",
            "credential_reference": "secret://models/openai-primary",
            "enabled": True,
        },
    ).json()["id"]


def create_audited_run(client: TestClient, admin_token: str, user_token: str, model_id: int) -> tuple[int, int]:
    client.patch(
        "/admin/agents/1",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "default_model_configuration_id": model_id,
            "allowed_model_configuration_ids": [model_id],
            "capability_policy": {
                "mcp_server_ids": [],
                "sandbox_enabled": True,
                "search_enabled": False,
                "page_read_enabled": False,
            },
        },
    )
    conversation = client.post(
        "/conversations",
        headers={"Authorization": f"Bearer {user_token}"},
        json={
            "title": "Audited run",
            "agent_id": 1,
            "selected_model_configuration_id": model_id,
            "initial_message": "Start this conversation.",
        },
    ).json()
    run = client.post(
        f"/conversations/{conversation['id']}/runs",
        headers={"Authorization": f"Bearer {user_token}"},
        json={"message": "Summarize the task."},
    ).json()
    runtime_store.execute(run["id"])
    client.post(
        f"/runs/{run['id']}/tool-calls",
        headers={"Authorization": f"Bearer {user_token}"},
        json={
            "tool_name": "sandbox.exec",
            "input": {
                "command": "python audit.py",
                "artifact_filename": "audit-report.md",
                "artifact_body": "# Audit Report\n\nGenerated for Run Audit.",
            },
        },
    )
    return conversation["id"], run["id"]


def test_administrator_can_filter_and_inspect_run_audit_with_full_trace():
    client = TestClient(app)
    admin_token = administrator_token(client)
    user_id, user_token = approved_user(client, "user")
    model_id = create_model(client, admin_token)
    conversation_id, run_id = create_audited_run(client, admin_token, user_token, model_id)

    list_response = client.get(
        "/admin/run-audit",
        headers={"Authorization": f"Bearer {admin_token}"},
        params={
            "status": "completed",
            "user_id": user_id,
            "agent_id": 1,
            "model_configuration_id": model_id,
        },
    )
    detail_response = client.get(
        f"/admin/run-audit/{run_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    trace_response = client.get(
        f"/admin/run-audit/{run_id}/full-trace",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert list_response.status_code == 200
    assert list_response.json()["retention"]["full_trace_retention_days"] == 90
    assert list_response.json()["storage"]["artifact_count"] == 1
    assert list_response.json()["runs"][0]["id"] == run_id
    assert list_response.json()["runs"][0]["status"] == "completed"
    assert list_response.json()["runs"][0]["owner_user_id"] == user_id
    assert list_response.json()["runs"][0]["agent_id"] == 1
    assert list_response.json()["runs"][0]["selected_model_configuration_id"] == model_id

    assert detail_response.status_code == 200
    assert detail_response.json()["conversation_id"] == conversation_id
    assert detail_response.json()["capability_snapshot"]["capability_policy"]["sandbox_enabled"] is True
    assert detail_response.json()["tool_calls"][0]["tool_name"] == "sandbox.exec"
    assert detail_response.json()["artifacts"][0]["filename"] == "audit-report.md"
    assert detail_response.json()["events"][0]["event_type"] == "run.status"
    assert detail_response.json()["full_trace_available"] is True
    assert detail_response.json()["full_trace_retention_days"] == 90

    assert trace_response.status_code == 200
    assert trace_response.json()["retention_days"] == 90
    assert trace_response.json()["trace"]["workflow_name"] == "Agent workflow"
    assert trace_response.json()["trace"]["model_name"] == "gpt-5"


def test_regular_users_cannot_access_run_audit_or_full_trace():
    client = TestClient(app)
    admin_token = administrator_token(client)
    _user_id, user_token = approved_user(client, "user")
    model_id = create_model(client, admin_token)
    _conversation_id, run_id = create_audited_run(client, admin_token, user_token, model_id)

    list_response = client.get(
        "/admin/run-audit",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    trace_response = client.get(
        f"/admin/run-audit/{run_id}/full-trace",
        headers={"Authorization": f"Bearer {user_token}"},
    )

    assert list_response.status_code == 403
    assert trace_response.status_code == 403
    assert list_response.json()["detail"] == "Administrator access required."
