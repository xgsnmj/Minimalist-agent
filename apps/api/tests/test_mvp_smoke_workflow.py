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
from apps.worker.app.celery_app import process_agent_run


PASSWORD = "correct horse battery staple"


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


def login(client: TestClient, login_name: str) -> str:
    response = client.post(
        "/auth/login",
        json={
            "login": login_name,
            "password": PASSWORD,
        },
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def authorization(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def bootstrap_administrator(client: TestClient) -> str:
    local_account_store.bootstrap_administrator(username="admin", password=PASSWORD)
    return login(client, "admin")


def test_full_local_mvp_conversation_smoke_workflow():
    client = TestClient(app)
    admin_token = bootstrap_administrator(client)

    pending_account_response = client.post(
        "/auth/register",
        json={
            "username": "mvp-user",
            "email": "mvp-user@example.com",
            "password": PASSWORD,
        },
    )
    assert pending_account_response.status_code == 201
    assert pending_account_response.json()["status"] == "pending"

    pending_login_response = client.post(
        "/auth/login",
        json={
            "login": "mvp-user",
            "password": PASSWORD,
        },
    )
    assert pending_login_response.status_code == 403
    assert pending_login_response.json()["detail"] == "Account is pending approval."

    approval_response = client.post(
        f"/admin/accounts/{pending_account_response.json()['id']}/approve",
        headers=authorization(admin_token),
    )
    assert approval_response.status_code == 200
    assert approval_response.json()["status"] == "enabled"
    user_token = login(client, "mvp-user")

    model_response = client.post(
        "/admin/model-configurations",
        headers=authorization(admin_token),
        json={
            "provider_id": "openai",
            "name": "Primary GPT-5",
            "model_name": "gpt-5",
            "endpoint": "https://api.openai.com/v1",
            "credential_reference": "secret://models/openai-primary",
            "enabled": True,
        },
    )
    assert model_response.status_code == 201
    model_id = model_response.json()["id"]

    agent_response = client.patch(
        "/admin/agents/1",
        headers=authorization(admin_token),
        json={
            "instruction": "Help users complete local MVP smoke tests.",
            "default_model_configuration_id": model_id,
            "allowed_model_configuration_ids": [model_id],
            "capability_policy": {
                "mcp_server_ids": [],
                "sandbox_enabled": True,
                "search_enabled": True,
                "page_read_enabled": True,
            },
        },
    )
    assert agent_response.status_code == 200
    assert agent_response.json()["capability_policy"]["sandbox_enabled"] is True

    conversation_response = client.post(
        "/conversations",
        headers=authorization(user_token),
        json={
            "title": "MVP smoke conversation",
            "agent_id": 1,
            "selected_model_configuration_id": model_id,
            "initial_message": "Create the initial brief.",
        },
    )
    assert conversation_response.status_code == 201
    conversation_id = conversation_response.json()["id"]
    assert conversation_response.json()["agent"]["name"] == "Default Agent"
    assert conversation_response.json()["selected_model_configuration_id"] == model_id

    run_response = client.post(
        f"/conversations/{conversation_id}/runs",
        headers=authorization(user_token),
        json={"message": "Summarize the MVP workflow."},
    )
    assert run_response.status_code == 201
    assert run_response.json()["status"] == "queued"
    assert run_response.json()["worker_enqueued"] is True
    run_id = run_response.json()["id"]

    active_run_response = client.post(
        f"/conversations/{conversation_id}/runs",
        headers=authorization(user_token),
        json={"message": "This should wait."},
    )
    assert active_run_response.status_code == 409
    assert active_run_response.json()["detail"] == (
        "Agent Conversation already has an active run."
    )

    queued_events_response = client.get(
        f"/runs/{run_id}/events",
        headers={
            **authorization(user_token),
            "Accept": "text/event-stream",
        },
    )
    assert queued_events_response.status_code == 200
    assert "event: run.status" in queued_events_response.text
    assert "worker_enqueued" in queued_events_response.text

    worker_response = process_agent_run.run(run_id)
    assert worker_response == {"id": run_id, "status": "completed"}

    resumed_run_response = client.get(
        f"/runs/{run_id}",
        headers=authorization(user_token),
    )
    assert resumed_run_response.status_code == 200
    assert resumed_run_response.json()["status"] == "completed"
    assert resumed_run_response.json()["assistant_message"] == (
        "openai:gpt-5 handled Summarize the MVP workflow."
    )
    assert resumed_run_response.json()["process_summaries"] == [
        "Reviewed the Agent Instruction snapshot for conversation 1.",
        "Used model gpt-5 from openai.",
    ]

    resumed_events_response = client.get(
        f"/runs/{run_id}/events",
        headers={
            **authorization(user_token),
            "Accept": "text/event-stream",
            "Last-Event-ID": "3",
        },
    )
    assert resumed_events_response.status_code == 200
    assert "id: 3" not in resumed_events_response.text
    assert "event: message.completed" in resumed_events_response.text
    assert "openai:gpt-5 handled Summarize the MVP workflow." in resumed_events_response.text

    tool_call_response = client.post(
        f"/runs/{run_id}/tool-calls",
        headers=authorization(user_token),
        json={
            "tool_name": "sandbox.exec",
            "input": {
                "command": "python generate_report.py",
                "artifact_filename": "mvp-report.md",
                "artifact_body": "# MVP Report\n\nSmoke workflow complete.",
                "api_key": "do-not-leak",
            },
        },
    )
    assert tool_call_response.status_code == 201
    assert tool_call_response.json()["tool_name"] == "sandbox.exec"
    assert tool_call_response.json()["status"] == "completed"
    assert "api_key" not in tool_call_response.json()["safe_input"]
    artifact = tool_call_response.json()["safe_output"]["artifact"]
    assert artifact["filename"] == "mvp-report.md"
    assert artifact["preview_type"] == "markdown"

    tool_list_response = client.get(
        f"/runs/{run_id}/tool-calls",
        headers=authorization(user_token),
    )
    assert tool_list_response.status_code == 200
    assert [tool["tool_name"] for tool in tool_list_response.json()] == ["sandbox.exec"]

    artifact_preview_response = client.get(
        f"/artifacts/{artifact['artifact_id']}/preview",
        headers=authorization(user_token),
    )
    assert artifact_preview_response.status_code == 200
    assert artifact_preview_response.json()["preview_type"] == "markdown"
    assert artifact_preview_response.json()["text"] == "# MVP Report\n\nSmoke workflow complete."

    refreshed_conversation_response = client.get(
        f"/conversations/{conversation_id}",
        headers=authorization(user_token),
    )
    assert refreshed_conversation_response.status_code == 200
    assert refreshed_conversation_response.json()["status"] == "idle"
    assert refreshed_conversation_response.json()["messages"][-1]["artifact_reference"] == {
        "artifact_id": artifact["artifact_id"],
        "filename": "mvp-report.md",
        "preview_type": "markdown",
    }

    cancellation_conversation_response = client.post(
        "/conversations",
        headers=authorization(user_token),
        json={
            "title": "MVP smoke cancellation",
            "agent_id": 1,
            "selected_model_configuration_id": model_id,
            "initial_message": "Start a cancellable run.",
        },
    )
    assert cancellation_conversation_response.status_code == 201
    cancellation_run_response = client.post(
        f"/conversations/{cancellation_conversation_response.json()['id']}/runs",
        headers=authorization(user_token),
        json={"message": "Keep working until cancellation."},
    )
    assert cancellation_run_response.status_code == 201
    cancel_response = client.post(
        f"/runs/{cancellation_run_response.json()['id']}/cancel",
        headers=authorization(user_token),
    )
    assert cancel_response.status_code == 200
    assert cancel_response.json()["status"] == "cancelled"
    assert process_agent_run.run(cancellation_run_response.json()["id"]) == {
        "id": cancellation_run_response.json()["id"],
        "status": "cancelled",
    }

    run_audit_response = client.get(
        "/admin/run-audit",
        headers=authorization(admin_token),
        params={
            "status": "completed",
            "user_id": pending_account_response.json()["id"],
            "agent_id": 1,
            "model_configuration_id": model_id,
        },
    )
    assert run_audit_response.status_code == 200
    assert run_audit_response.json()["retention"]["full_trace_retention_days"] == 90
    assert run_audit_response.json()["storage"]["artifact_count"] == 1
    assert run_audit_response.json()["runs"][0]["id"] == run_id

    run_audit_detail_response = client.get(
        f"/admin/run-audit/{run_id}",
        headers=authorization(admin_token),
    )
    assert run_audit_detail_response.status_code == 200
    assert run_audit_detail_response.json()["tool_calls"][0]["tool_name"] == "sandbox.exec"
    assert run_audit_detail_response.json()["artifacts"][0]["filename"] == "mvp-report.md"
    assert run_audit_detail_response.json()["capability_snapshot"]["capability_policy"][
        "sandbox_enabled"
    ] is True

    full_trace_response = client.get(
        f"/admin/run-audit/{run_id}/full-trace",
        headers=authorization(admin_token),
    )
    assert full_trace_response.status_code == 200
    assert full_trace_response.json()["retention_days"] == 90
    assert full_trace_response.json()["trace"]["workflow_name"] == "Agent workflow"

    user_trace_response = client.get(
        f"/admin/run-audit/{run_id}/full-trace",
        headers=authorization(user_token),
    )
    assert user_trace_response.status_code == 403
