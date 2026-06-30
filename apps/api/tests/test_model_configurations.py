from fastapi.testclient import TestClient

from apps.api.app.agents import agent_store
from apps.api.app.auth import local_account_store
from apps.api.app.main import app
from apps.api.app.model_configurations import model_configuration_store


def setup_function():
    local_account_store.reset()
    agent_store.reset()
    model_configuration_store.reset()


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


def test_administrator_can_view_initial_model_provider_catalog():
    client = TestClient(app)
    token = administrator_token(client)

    response = client.get(
        "/admin/model-providers",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    providers = response.json()
    provider_ids = {provider["id"] for provider in providers}
    assert provider_ids == {
        "openai",
        "anthropic",
        "google-gemini",
        "deepseek",
        "qwen-dashscope",
        "moonshot-kimi",
        "bytedance-doubao",
        "zhipu-glm",
        "minimax",
        "openrouter",
        "custom-openai-compatible",
    }
    openai = next(provider for provider in providers if provider["id"] == "openai")
    assert openai["name"] == "OpenAI"
    assert openai["logo"] == "openai"
    assert openai["endpoint_template"] == "https://api.openai.com/v1"
    assert openai["documentation_url"].startswith("https://")
    assert openai["recommended_models"]


def test_administrator_can_create_edit_enable_and_disable_model_configuration_without_secret_leakage():
    client = TestClient(app)
    token = administrator_token(client)

    create_response = client.post(
        "/admin/model-configurations",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "provider_id": "openai",
            "name": "OpenAI GPT-5",
            "model_name": "gpt-5",
            "endpoint": "https://api.openai.com/v1",
            "credential_reference": "secret://models/openai",
            "api_key": "sk-should-not-leak",
            "default_parameters": {"temperature": 0.2},
            "enabled": True,
        },
    )

    assert create_response.status_code == 201
    created = create_response.json()
    assert created["id"] == 1
    assert created["provider_id"] == "openai"
    assert created["credential_reference"] == "secret://models/openai"
    assert created["enabled"] is True
    assert "api_key" not in created

    update_response = client.patch(
        "/admin/model-configurations/1",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "OpenAI GPT-5 Primary",
            "model_name": "gpt-5",
            "default_parameters": {"temperature": 0.1, "max_output_tokens": 4096},
            "enabled": False,
        },
    )
    list_response = client.get(
        "/admin/model-configurations",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert update_response.status_code == 200
    assert update_response.json()["name"] == "OpenAI GPT-5 Primary"
    assert update_response.json()["enabled"] is False
    assert list_response.status_code == 200
    assert list_response.json()[0]["default_parameters"] == {
        "temperature": 0.1,
        "max_output_tokens": 4096,
    }
    assert "api_key" not in list_response.json()[0]


def test_administrator_can_assign_allowed_model_selection_to_agent():
    client = TestClient(app)
    token = administrator_token(client)
    first_model = client.post(
        "/admin/model-configurations",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "provider_id": "openai",
            "name": "Primary",
            "model_name": "gpt-5",
            "endpoint": "https://api.openai.com/v1",
            "credential_reference": "secret://models/openai-primary",
            "enabled": True,
        },
    ).json()
    second_model = client.post(
        "/admin/model-configurations",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "provider_id": "deepseek",
            "name": "Backup",
            "model_name": "deepseek-chat",
            "endpoint": "https://api.deepseek.com",
            "credential_reference": "secret://models/deepseek-backup",
            "enabled": True,
        },
    ).json()

    response = client.patch(
        "/admin/agents/1",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "default_model_configuration_id": first_model["id"],
            "allowed_model_configuration_ids": [first_model["id"], second_model["id"]],
        },
    )

    assert response.status_code == 200
    assert response.json()["default_model_configuration_id"] == first_model["id"]
    assert response.json()["allowed_model_configuration_ids"] == [
        first_model["id"],
        second_model["id"],
    ]
