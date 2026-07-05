from fastapi.testclient import TestClient
import pytest

from apps.api.app.agents import agent_store
from apps.api.app.app import app
from apps.api.app.auth import local_account_store
from apps.api.app.bootstrap import bootstrap_default_model_configuration
from apps.api.app.model_configurations import model_configuration_store


@pytest.fixture(autouse=True)
def reset_stores_and_environment(monkeypatch):
    local_account_store.reset()
    agent_store.reset()
    model_configuration_store.reset()
    for variable in [
        "ADMIN_BOOTSTRAP_USERNAME",
        "ADMIN_BOOTSTRAP_PASSWORD",
        "DEFAULT_MODEL_BOOTSTRAP_DISABLED",
        "DEFAULT_MODEL_PROVIDER_ID",
        "DEFAULT_MODEL_CONFIGURATION_NAME",
        "DEFAULT_MODEL_NAME",
        "DEFAULT_MODEL_ENDPOINT",
        "DEFAULT_MODEL_CREDENTIAL_REFERENCE",
    ]:
        monkeypatch.delenv(variable, raising=False)


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


def test_bootstrap_default_model_configuration_binds_gpt55_to_default_agent(monkeypatch):
    monkeypatch.delenv("DEFAULT_MODEL_BOOTSTRAP_DISABLED", raising=False)
    monkeypatch.delenv("DEFAULT_MODEL_NAME", raising=False)

    configuration = bootstrap_default_model_configuration()
    agent = agent_store.get(1)

    assert configuration is not None
    assert configuration.model_name == "gpt-5.5"
    assert configuration.credential_reference == "env:OPENAI_API_KEY"
    assert agent.default_model_configuration_id == configuration.id
    assert agent.allowed_model_configuration_ids == [configuration.id]


def test_bootstrap_default_model_configuration_is_idempotent(monkeypatch):
    monkeypatch.setenv("DEFAULT_MODEL_NAME", "gpt-5.5")

    first_configuration = bootstrap_default_model_configuration()
    second_configuration = bootstrap_default_model_configuration()

    assert first_configuration is not None
    assert second_configuration is not None
    assert first_configuration.id == second_configuration.id
    assert len(model_configuration_store.list_configurations()) == 1


def test_bootstrap_default_model_configuration_respects_environment(monkeypatch):
    monkeypatch.setenv("DEFAULT_MODEL_PROVIDER_ID", "custom-openai-compatible")
    monkeypatch.setenv("DEFAULT_MODEL_CONFIGURATION_NAME", "NewCLI GPT-5.5")
    monkeypatch.setenv("DEFAULT_MODEL_NAME", "gpt-5.5")
    monkeypatch.setenv("DEFAULT_MODEL_ENDPOINT", "https://code.newcli.com/codex/v1")
    monkeypatch.setenv("DEFAULT_MODEL_CREDENTIAL_REFERENCE", "env:NEWCLI_API_KEY")

    configuration = bootstrap_default_model_configuration()

    assert configuration is not None
    assert configuration.provider_id == "custom-openai-compatible"
    assert configuration.name == "NewCLI GPT-5.5"
    assert configuration.endpoint == "https://code.newcli.com/codex/v1"
    assert configuration.credential_reference == "env:NEWCLI_API_KEY"


def test_workspace_agents_exposes_bootstrapped_gpt55_model(monkeypatch):
    monkeypatch.setenv("ADMIN_BOOTSTRAP_USERNAME", "admin")
    monkeypatch.setenv("ADMIN_BOOTSTRAP_PASSWORD", "correct horse battery staple")
    monkeypatch.setenv("DEFAULT_MODEL_NAME", "gpt-5.5")
    monkeypatch.setenv("DEFAULT_MODEL_ENDPOINT", "https://code.newcli.com/codex/v1")
    monkeypatch.setenv("DEFAULT_MODEL_CREDENTIAL_REFERENCE", "env:NEWCLI_API_KEY")

    with TestClient(app) as client:
        token = approved_user_token(client)
        response = client.get(
            "/workspace/agents",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    default_agent = response.json()[0]
    assert default_agent["agent"]["name"] == "Default Agent"
    assert default_agent["agent"]["default_model_configuration_id"] == 1
    assert default_agent["allowed_model_configurations"][0]["model_name"] == "gpt-5.5"
