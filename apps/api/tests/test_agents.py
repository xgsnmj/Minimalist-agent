from fastapi.testclient import TestClient

from apps.api.app.auth import local_account_store
from apps.api.app.agents import agent_store
from apps.api.app.main import app


def setup_function():
    local_account_store.reset()
    agent_store.reset()


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
            "default_model_configuration_id": None,
            "allowed_model_configuration_ids": [],
            "capability_policy": {
                "mcp_server_ids": [],
                "sandbox_enabled": False,
                "search_enabled": False,
                "page_read_enabled": False,
            },
        }
    ]


def test_administrator_can_create_update_disable_enable_and_retire_agent():
    client = TestClient(app)
    token = administrator_token(client)

    create_response = client.post(
        "/admin/agents",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Research Agent",
            "description": "Runs research-heavy Agent Conversations.",
            "icon": "search",
            "instruction": "Research carefully and cite visible sources.",
            "process_visibility": "verbose",
            "allowed_model_configuration_ids": [101, 102],
            "capability_policy": {
                "mcp_server_ids": [7],
                "sandbox_enabled": False,
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
    assert created["capability_policy"]["search_enabled"] is True

    update_response = client.patch(
        "/admin/agents/2",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Research Lead",
            "instruction": "Research carefully, cite visible sources, and summarize uncertainty.",
            "process_visibility": "standard",
            "capability_policy": {
                "mcp_server_ids": [],
                "sandbox_enabled": True,
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
    assert update_response.json()["capability_policy"]["sandbox_enabled"] is True
    assert disable_response.status_code == 200
    assert disable_response.json()["status"] == "disabled"
    assert enable_response.status_code == 200
    assert enable_response.json()["status"] == "enabled"
    assert retire_response.status_code == 200
    assert retire_response.json()["status"] == "retired"


def test_agent_run_preparation_records_current_agent_instruction_snapshot():
    client = TestClient(app)
    token = administrator_token(client)
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
        "default_model_configuration_id": None,
        "allowed_model_configuration_ids": [],
        "capability_policy": {
            "mcp_server_ids": [],
            "sandbox_enabled": False,
            "search_enabled": False,
            "page_read_enabled": False,
        },
    }
