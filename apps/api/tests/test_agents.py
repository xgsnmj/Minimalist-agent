from fastapi.testclient import TestClient

from apps.api.app.admin_audit import admin_audit_store
from apps.api.app.auth import local_account_store
from apps.api.app.agents import AgentStore, AgentUpdateRequest, agent_store
from apps.api.app.app import app
from apps.api.app.mcp_servers import McpConnectionType, McpServerMutationRequest, mcp_server_store
from apps.api.app.model_configurations import model_configuration_store
from apps.api.tests.support import configure_default_agent_model, create_model_configuration_for_tests


def setup_function():
    admin_audit_store.reset()
    local_account_store.reset()
    agent_store.reset()
    model_configuration_store.reset()
    mcp_server_store.reset()


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


def test_administrator_can_view_initialized_default_agent():
    client = TestClient(app)
    token = administrator_token(client)

    response = client.get(
        "/admin/agents",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": 1,
            "name": "Default Agent",
            "description": "Primary Agent Conversation entry point.",
            "icon": "agent",
            "status": "enabled",
            "is_default": True,
            "instruction": "Help the user complete work inside Minimalist Agent.",
            "process_visibility": "standard",
            "sdk_settings": {
                "max_turns": 10,
                "tool_use_behavior": "run_llm_again",
                "reset_tool_choice": True,
            },
            "default_model_configuration_id": None,
            "allowed_model_configuration_ids": [],
            "capability_policy": {
                "mcp_server_ids": [],
                "search_enabled": False,
                "page_read_enabled": False,
            },
        }
    ]


def test_administrator_can_create_update_disable_enable_and_retire_agent():
    client = TestClient(app)
    token = administrator_token(client)
    primary_model_id = create_model_configuration_for_tests()
    backup_model_id = create_model_configuration_for_tests(
        provider_id="deepseek",
        model_name="deepseek-chat",
    )
    mcp_server = mcp_server_store.create(
        McpServerMutationRequest(
            name="Research MCP",
            connection_type=McpConnectionType.SSE,
            url="https://mcp.example.com/sse",
        )
    )

    create_response = client.post(
        "/admin/agents",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Research Agent",
            "description": "Runs research-heavy Agent Conversations.",
                "icon": "search",
            "instruction": "Research carefully and cite visible sources.",
            "process_visibility": "verbose",
            "sdk_settings": {
                "max_turns": 12,
                "tool_use_behavior": "stop_on_first_tool",
                "reset_tool_choice": False,
            },
            "default_model_configuration_id": primary_model_id,
            "allowed_model_configuration_ids": [primary_model_id, backup_model_id],
            "capability_policy": {
                "mcp_server_ids": [mcp_server.id],
                "search_enabled": True,
                "page_read_enabled": True,
            },
        },
    )

    assert create_response.status_code == 201
    created = create_response.json()
    assert created["id"] == 2
    assert created["status"] == "enabled"
    assert created["is_default"] is False
    assert created["instruction"] == "Research carefully and cite visible sources."
    assert created["process_visibility"] == "verbose"
    assert created["sdk_settings"] == {
        "max_turns": 12,
        "tool_use_behavior": "stop_on_first_tool",
        "reset_tool_choice": False,
    }
    assert created["capability_policy"]["search_enabled"] is True

    update_response = client.patch(
        "/admin/agents/2",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Research Lead",
            "instruction": "Research carefully, cite visible sources, and summarize uncertainty.",
            "process_visibility": "standard",
            "sdk_settings": {
                "max_turns": 8,
                "tool_use_behavior": "run_llm_again",
                "reset_tool_choice": True,
            },
            "capability_policy": {
                "mcp_server_ids": [],
                "search_enabled": True,
                "page_read_enabled": False,
            },
        },
    )
    disable_response = client.post(
        "/admin/agents/2/disable",
        headers={"Authorization": f"Bearer {token}"},
    )
    enable_response = client.post(
        "/admin/agents/2/enable",
        headers={"Authorization": f"Bearer {token}"},
    )
    retire_response = client.post(
        "/admin/agents/2/retire",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert update_response.status_code == 200
    assert update_response.json()["name"] == "Research Lead"
    assert update_response.json()["process_visibility"] == "standard"
    assert update_response.json()["sdk_settings"]["max_turns"] == 8
    assert "sandbox_enabled" not in update_response.json()["capability_policy"]
    assert disable_response.status_code == 200
    assert disable_response.json()["status"] == "disabled"
    assert enable_response.status_code == 200
    assert enable_response.json()["status"] == "enabled"
    assert retire_response.status_code == 200
    assert retire_response.json()["status"] == "retired"
    assert [event.action for event in admin_audit_store.list_events()] == [
        "created",
        "updated",
        "disabled",
        "enabled",
        "retired",
    ]


def test_agent_run_preparation_records_current_agent_instruction_snapshot():
    client = TestClient(app)
    token = administrator_token(client)
    configuration_id = configure_default_agent_model()
    client.patch(
        "/admin/agents/1",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "instruction": "Answer with concise operational steps.",
        },
    )

    prepare_response = client.post(
        "/admin/agents/1/prepare-run",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert prepare_response.status_code == 200
    assert prepare_response.json() == {
            "agent_id": 1,
            "agent_instruction_snapshot": "Answer with concise operational steps.",
            "process_visibility": "standard",
            "sdk_settings": {
                "max_turns": 10,
                "tool_use_behavior": "run_llm_again",
                "reset_tool_choice": True,
            },
            "default_model_configuration_id": configuration_id,
            "allowed_model_configuration_ids": [configuration_id],
            "capability_policy": {
                "mcp_server_ids": [],
            "search_enabled": False,
            "page_read_enabled": False,
        },
    }


def test_agent_store_persists_agent_configuration_across_store_instances():
    configuration_id = configure_default_agent_model()
    agent_store.update(
        1,
        AgentUpdateRequest(
            instruction="Persist this runtime instruction.",
            process_visibility="verbose",
            allowed_model_configuration_ids=[configuration_id],
            capability_policy={
                "mcp_server_ids": [],
                "search_enabled": True,
                "page_read_enabled": False,
            },
        ),
    )

    fresh_store = AgentStore()
    agent = fresh_store.get(1)

    assert agent.default_model_configuration_id == configuration_id
    assert agent.allowed_model_configuration_ids == [configuration_id]
    assert agent.instruction == "Persist this runtime instruction."
    assert agent.process_visibility == "verbose"
    assert agent.capability_policy.search_enabled is True


def test_agent_creation_requires_ready_model_configuration():
    client = TestClient(app)
    token = administrator_token(client)

    response = client.post(
        "/admin/agents",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Broken Agent",
            "instruction": "Try to run without a model.",
            "default_model_configuration_id": 99,
            "allowed_model_configuration_ids": [99],
        },
    )

    assert response.status_code == 409
    assert "Default Model Configuration does not exist." in response.json()["detail"]["issues"]


def test_agent_rejects_default_model_outside_allowed_models():
    client = TestClient(app)
    token = administrator_token(client)
    primary_model_id = create_model_configuration_for_tests()
    backup_model_id = create_model_configuration_for_tests(
        provider_id="deepseek",
        model_name="deepseek-chat",
    )

    response = client.post(
        "/admin/agents",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Misconfigured Agent",
            "instruction": "Try to run with mismatched model settings.",
            "default_model_configuration_id": primary_model_id,
            "allowed_model_configuration_ids": [backup_model_id],
        },
    )

    assert response.status_code == 409
    assert (
        "Default Model Configuration must be in allowed Model Configuration ids."
        in response.json()["detail"]["issues"]
    )


def test_agent_readiness_check_reports_disabled_model():
    client = TestClient(app)
    token = administrator_token(client)
    configuration_id = configure_default_agent_model(enabled=False)

    response = client.post(
        "/admin/agents/1/readiness-check",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "agent_id": 1,
        "ready": False,
        "issues": [
            "Default Model Configuration is disabled.",
            f"Allowed Model Configuration #{configuration_id} is disabled.",
        ],
    }


def test_disabled_agent_cannot_be_enabled_until_ready():
    client = TestClient(app)
    token = administrator_token(client)
    client.post(
        "/admin/agents/1/disable",
        headers={"Authorization": f"Bearer {token}"},
    )

    response = client.post(
        "/admin/agents/1/enable",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 409
    assert "Default Model Configuration is required." in response.json()["detail"]["issues"]
