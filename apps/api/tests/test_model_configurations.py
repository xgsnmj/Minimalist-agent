from fastapi.testclient import TestClient

from apps.api.app.admin_audit import admin_audit_store
from apps.api.app.agents import agent_store
from apps.api.app.auth import local_account_store
from apps.api.app.app import app
from apps.api.app.model_configurations import (
    ModelConfigurationMutationRequest,
    ModelConfigurationStore,
    model_configuration_store,
)
from apps.api.app.runtime import resolve_model_api_key


def setup_function():
    admin_audit_store.reset()
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


def test_administrator_can_create_edit_enable_and_disable_model_configuration():
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
            "credential_reference": "sk-openai-admin",
            "default_parameters": {"temperature": 0.2},
            "enabled": True,
        },
    )

    assert create_response.status_code == 201
    created = create_response.json()
    assert created["id"] == 1
    assert created["provider_id"] == "openai"
    assert created["credential_reference"] == "sk-openai-admin"
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
    audit_events = admin_audit_store.list_events()
    assert [event.action for event in audit_events] == ["created", "updated"]
    assert audit_events[0].target_type == "model_configuration"
    assert audit_events[1].before["name"] == "OpenAI GPT-5"
    assert audit_events[1].after["name"] == "OpenAI GPT-5 Primary"


def test_model_configuration_api_key_field_is_saved_directly():
    client = TestClient(app)
    token = administrator_token(client)

    response = client.post(
        "/admin/model-configurations",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "provider_id": "openai",
            "name": "Vaulted GPT-5.5",
            "model_name": "gpt-5.5",
            "endpoint": "https://api.openai.com/v1",
            "api_key": "sk-direct-api-key-field",
            "enabled": True,
        },
    )

    assert response.status_code == 201
    assert response.json()["credential_reference"] == "sk-direct-api-key-field"
    assert "api_key" not in response.json()
    assert resolve_model_api_key(response.json()["credential_reference"]) == "sk-direct-api-key-field"


def test_model_configuration_can_be_created_with_api_key_without_manual_reference():
    client = TestClient(app)
    token = administrator_token(client)

    response = client.post(
        "/admin/model-configurations",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "provider_id": "custom-openai-compatible",
            "name": "Packy GPT-5.5",
            "model_name": "gpt-5.5",
            "endpoint": "https://www.packyapi.com/v1",
            "api_key": "sk-direct-create",
            "enabled": True,
        },
    )

    assert response.status_code == 201
    credential_reference = response.json()["credential_reference"]
    assert credential_reference == "sk-direct-create"
    assert "api_key" not in response.json()
    assert resolve_model_api_key(credential_reference) == "sk-direct-create"


def test_direct_api_key_in_credential_reference_is_kept_direct():
    client = TestClient(app)
    token = administrator_token(client)

    response = client.post(
        "/admin/model-configurations",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "provider_id": "openai",
            "name": "Mistyped Key",
            "model_name": "gpt-5.5",
            "endpoint": "https://api.openai.com/v1",
            "credential_reference": "sk-mistyped-reference",
            "enabled": True,
        },
    )

    assert response.status_code == 201
    credential_reference = response.json()["credential_reference"]
    assert credential_reference == "sk-mistyped-reference"
    assert resolve_model_api_key(credential_reference) == "sk-mistyped-reference"


def test_existing_direct_api_key_reference_is_not_rewritten_when_listed():
    created = model_configuration_store.create(
        ModelConfigurationMutationRequest(
            provider_id="openai",
            name="Legacy Direct Key",
            model_name="gpt-5.5",
            endpoint="https://api.openai.com/v1",
            credential_reference="sk-legacy-direct",
            enabled=True,
        )
    )
    client = TestClient(app)
    token = administrator_token(client)

    response = client.get(
        "/admin/model-configurations",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    listed = next(item for item in response.json() if item["id"] == created.id)
    assert listed["credential_reference"] == "sk-legacy-direct"
    assert resolve_model_api_key(listed["credential_reference"]) == "sk-legacy-direct"


def test_model_configuration_api_key_update_replaces_direct_key():
    client = TestClient(app)
    token = administrator_token(client)
    created = client.post(
        "/admin/model-configurations",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "provider_id": "openai",
            "name": "Rotated",
            "model_name": "gpt-5.5",
            "endpoint": "https://api.openai.com/v1",
            "api_key": "sk-before",
            "enabled": True,
        },
    ).json()

    response = client.patch(
        f"/admin/model-configurations/{created['id']}",
        headers={"Authorization": f"Bearer {token}"},
        json={"api_key": "sk-after"},
    )

    assert response.status_code == 200
    assert response.json()["credential_reference"] == "sk-after"
    assert "api_key" not in response.json()
    assert resolve_model_api_key(response.json()["credential_reference"]) == "sk-after"


def test_model_configuration_store_persists_configurations_across_store_instances():
    created = model_configuration_store.create(
        ModelConfigurationMutationRequest(
            provider_id="openai",
            name="Persistent GPT-5.5",
            model_name="gpt-5.5",
            endpoint="https://api.openai.com/v1",
            credential_reference="env:OPENAI_API_KEY",
            default_parameters={"temperature": 0.2},
            enabled=True,
        )
    )

    fresh_store = ModelConfigurationStore()

    assert fresh_store.get(created.id).model_name == "gpt-5.5"
    assert fresh_store.list_configurations()[0].default_parameters == {"temperature": 0.2}


def test_administrator_can_check_model_configuration_health(monkeypatch):
    monkeypatch.setenv("TEST_MODEL_API_KEY", "sk-test")
    client = TestClient(app)
    token = administrator_token(client)
    configuration = client.post(
        "/admin/model-configurations",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "provider_id": "openai",
            "name": "Primary",
            "model_name": "gpt-5",
            "endpoint": "https://api.openai.com/v1",
            "credential_reference": "env:TEST_MODEL_API_KEY",
            "enabled": True,
        },
    ).json()

    response = client.post(
        f"/admin/model-configurations/{configuration['id']}/health-check",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    result = response.json()
    assert result["status"] == "healthy"
    assert result["message"] == "Model Configuration health check passed."
    assert result["configuration"]["health_status"] == "healthy"
    assert result["configuration"]["last_checked_at"] == result["checked_at"]
    assert result["configuration"]["last_error"] is None


def test_model_configuration_health_check_records_missing_credential():
    client = TestClient(app)
    token = administrator_token(client)
    configuration = client.post(
        "/admin/model-configurations",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "provider_id": "openai",
            "name": "Primary",
            "model_name": "gpt-5",
            "endpoint": "https://api.openai.com/v1",
            "credential_reference": "env:MISSING_MODEL_API_KEY_FOR_TEST",
            "enabled": True,
        },
    ).json()

    response = client.post(
        f"/admin/model-configurations/{configuration['id']}/health-check",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    result = response.json()
    assert result["status"] == "unhealthy"
    assert result["configuration"]["health_status"] == "unhealthy"
    assert "MISSING_MODEL_API_KEY_FOR_TEST" in result["message"]
    assert result["configuration"]["last_error"] == result["message"]


def test_enabled_agent_reference_blocks_model_configuration_disable():
    client = TestClient(app)
    token = administrator_token(client)
    model = client.post(
        "/admin/model-configurations",
        headers={"Authorization": f"Bearer {token}"},
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
        headers={"Authorization": f"Bearer {token}"},
        json={
            "default_model_configuration_id": model["id"],
            "allowed_model_configuration_ids": [model["id"]],
        },
    )

    response = client.patch(
        f"/admin/model-configurations/{model['id']}",
        headers={"Authorization": f"Bearer {token}"},
        json={"enabled": False},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == {
        "message": "Model Configuration is used by enabled Agents.",
        "agents": ["Default Agent"],
    }


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
