from fastapi.testclient import TestClient

from apps.api.app.agent_runs import agent_run_store
from apps.api.app.agents import agent_store
from apps.api.app.auth import local_account_store
from apps.api.app.conversations import conversation_store
from apps.api.app.app import app
from apps.api.app.model_configurations import ModelConfigurationMutationRequest
from apps.api.app.model_configurations import model_configuration_store
from apps.api.app.run_event_log import run_event_log_store
from apps.api.app.runtime import runtime_model_parameters_for_configuration, runtime_store
from apps.api.tests.support import use_fake_agent_runtime


def setup_function():
    local_account_store.reset()
    agent_store.reset()
    model_configuration_store.reset()
    conversation_store.reset()
    agent_run_store.reset()
    run_event_log_store.reset_for_tests()
    runtime_store.reset()
    use_fake_agent_runtime()


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


def test_default_agent_run_uses_enabled_model_configuration_and_records_trace():
    client = TestClient(app)
    admin_token = administrator_token(client)
    model = client.post(
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
    ).json()
    client.patch(
        "/admin/agents/1",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "default_model_configuration_id": model["id"],
            "allowed_model_configuration_ids": [model["id"]],
        },
    )
    token = approved_user_token(client)
    conversation = client.post(
        "/conversations",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "SDK runtime",
            "agent_id": 1,
            "selected_model_configuration_id": model["id"],
            "initial_message": "Start this conversation.",
        },
    ).json()

    run = client.post(
        f"/conversations/{conversation['id']}/runs",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": "Summarize the task."},
    ).json()

    runtime_result = runtime_store.execute(run["id"])
    run_response = client.get(
        f"/runs/{run['id']}",
        headers={"Authorization": f"Bearer {token}"},
    ).json()

    assert runtime_result["status"] == "completed"
    assert runtime_result["model_name"] == "gpt-5"
    assert runtime_result["agent_instruction_snapshot"]
    assert runtime_result["process_summaries"]
    assert runtime_result["full_trace"]["workflow_name"] == "Agent workflow"
    assert runtime_result["full_trace"]["model_name"] == "gpt-5"
    assert runtime_result["full_trace"]["model_configuration_id"] == model["id"]
    assert runtime_result["full_trace"]["model_configuration_snapshot"]["model_name"] == "gpt-5"
    assert runtime_result["full_trace"]["provider_id"] == "openai"
    assert runtime_result["full_trace"]["endpoint"] == "https://api.openai.com/v1"
    assert run_response["capability_snapshot"]["selected_model_configuration_snapshot"] == {
        "id": model["id"],
        "provider_id": "openai",
        "name": "Primary",
        "model_name": "gpt-5",
        "endpoint": "https://api.openai.com/v1",
        "credential_reference": "secret://models/openai-primary",
        "default_parameters": {},
        "enabled": True,
    }


def test_runtime_missing_model_secret_fails_run_without_mock_fallback(monkeypatch):
    monkeypatch.delenv("TEST_MODEL_API_KEY", raising=False)
    client = TestClient(app)
    runtime_store.reset()
    admin_token = administrator_token(client)
    model = client.post(
        "/admin/model-configurations",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "provider_id": "openai",
            "name": "Primary",
            "model_name": "gpt-5",
            "endpoint": "https://api.openai.com/v1",
            "credential_reference": "env:TEST_MODEL_API_KEY",
            "enabled": True,
        },
    ).json()
    client.patch(
        "/admin/agents/1",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "default_model_configuration_id": model["id"],
            "allowed_model_configuration_ids": [model["id"]],
        },
    )
    token = approved_user_token(client)
    conversation = client.post(
        "/conversations",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "Missing secret",
            "agent_id": 1,
            "initial_message": "Start this conversation.",
        },
    ).json()
    run = client.post(
        f"/conversations/{conversation['id']}/runs",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": "Use the configured model."},
    ).json()

    runtime_result = runtime_store.execute(run["id"])
    run_response = client.get(
        f"/runs/{run['id']}",
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    conversation_response = client.get(
        f"/conversations/{conversation['id']}",
        headers={"Authorization": f"Bearer {token}"},
    ).json()

    assert runtime_result["status"] == "failed"
    assert runtime_result["model_name"] == "gpt-5"
    assert run_response["error"] == (
        "Model credential is not configured. Set one of: TEST_MODEL_API_KEY"
    )
    assert conversation_response["status"] == "idle"


def test_runtime_model_parameters_filter_temperature_by_provider_model_allowlist():
    configuration = model_configuration_store.create(
        ModelConfigurationMutationRequest(
            provider_id="custom-openai-compatible",
            name="Packy GPT-5.5",
            model_name="gpt-5.5",
            endpoint="https://www.packyapi.com/v1",
            credential_reference="sk-direct",
            default_parameters={
                "max_tokens": 8192,
                "temperature": 0.1,
                "top_p": 0.9,
            },
            enabled=True,
        )
    )

    parameters = runtime_model_parameters_for_configuration(configuration)

    assert parameters == {
        "max_tokens": 8192,
        "top_p": 0.9,
    }
