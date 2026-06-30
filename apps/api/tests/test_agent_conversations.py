from fastapi.testclient import TestClient

from apps.api.app.agents import agent_store
from apps.api.app.auth import local_account_store
from apps.api.app.main import app
from apps.api.app.model_configurations import model_configuration_store
from apps.api.app.conversations import conversation_store


def setup_function():
    local_account_store.reset()
    agent_store.reset()
    model_configuration_store.reset()
    conversation_store.reset()


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


def test_user_can_create_list_and_continue_agent_conversation_bound_to_agent_and_model():
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
    user_token = approved_user_token(client)

    create_response = client.post(
        "/conversations",
        headers={"Authorization": f"Bearer {user_token}"},
        json={
            "title": "Market research",
            "agent_id": 1,
            "selected_model_configuration_id": model["id"],
            "initial_message": "Find recent market signals.",
        },
    )
    assert create_response.status_code == 201
    list_response = client.get(
        "/conversations",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    detail_response = client.get(
        f"/conversations/{create_response.json()['id']}",
        headers={"Authorization": f"Bearer {user_token}"},
    )

    assert create_response.json()["agent"]["name"] == "Default Agent"
    assert create_response.json()["selected_model_configuration_id"] == model["id"]
    assert create_response.json()["messages"] == [
        {"role": "user", "content": "Find recent market signals."}
    ]
    assert list_response.status_code == 200
    assert list_response.json()[0]["title"] == "Market research"
    assert list_response.json()[0]["agent"]["id"] == 1
    assert detail_response.status_code == 200
    assert detail_response.json()["agent"]["id"] == 1


def test_user_can_rename_and_soft_delete_agent_conversation():
    client = TestClient(app)
    user_token = approved_user_token(client)
    conversation = client.post(
        "/conversations",
        headers={"Authorization": f"Bearer {user_token}"},
        json={
            "title": "Draft title",
            "agent_id": 1,
            "initial_message": "Start this conversation.",
        },
    ).json()

    rename_response = client.patch(
        f"/conversations/{conversation['id']}",
        headers={"Authorization": f"Bearer {user_token}"},
        json={"title": "Renamed conversation"},
    )
    delete_response = client.delete(
        f"/conversations/{conversation['id']}",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    list_response = client.get(
        "/conversations",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    detail_response = client.get(
        f"/conversations/{conversation['id']}",
        headers={"Authorization": f"Bearer {user_token}"},
    )

    assert rename_response.status_code == 200
    assert rename_response.json()["title"] == "Renamed conversation"
    assert delete_response.status_code == 200
    assert delete_response.json()["deleted"] is True
    assert list_response.json() == []
    assert detail_response.status_code == 404
