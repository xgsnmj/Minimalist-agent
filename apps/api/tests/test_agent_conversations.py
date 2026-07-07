from fastapi.testclient import TestClient

from apps.api.app.agent_runs import agent_run_store
from apps.api.app.agents import agent_store
from apps.api.app.auth import local_account_store
from apps.api.app.app import app
from apps.api.app.model_configurations import model_configuration_store
from apps.api.app.conversations import conversation_store
from apps.api.app.run_event_log import run_event_log_store
from apps.api.tests.support import (
    configure_default_agent_model,
    create_model_configuration_for_tests,
)


def setup_function():
    run_event_log_store.reset_for_tests()
    local_account_store.reset()
    agent_store.reset()
    model_configuration_store.reset()
    conversation_store.reset()
    agent_run_store.reset()


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
    configure_default_agent_model()
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


def test_conversation_list_supports_bounded_history_loading():
    client = TestClient(app)
    configure_default_agent_model()
    user_token = approved_user_token(client)
    created_ids = []
    for index in range(3):
        response = client.post(
            "/conversations",
            headers={"Authorization": f"Bearer {user_token}"},
            json={
                "title": f"Conversation {index}",
                "agent_id": 1,
                "initial_message": f"Message {index}",
            },
        )
        created_ids.append(response.json()["id"])

    response = client.get(
        "/conversations",
        headers={"Authorization": f"Bearer {user_token}"},
        params={"limit": 2, "message_limit": 0},
    )

    assert response.status_code == 200
    assert [conversation["id"] for conversation in response.json()] == list(reversed(created_ids[-2:]))
    assert [conversation["messages"] for conversation in response.json()] == [[], []]


def test_user_conversation_uses_agent_default_model_when_selection_is_omitted():
    client = TestClient(app)
    model_id = configure_default_agent_model()
    user_token = approved_user_token(client)

    response = client.post(
        "/conversations",
        headers={"Authorization": f"Bearer {user_token}"},
        json={
            "title": "Default model",
            "agent_id": 1,
            "initial_message": "Use the default model.",
        },
    )

    assert response.status_code == 201
    assert response.json()["selected_model_configuration_id"] == model_id


def test_user_conversation_rejects_unconfigured_agent_model_selection():
    client = TestClient(app)
    user_token = approved_user_token(client)

    response = client.post(
        "/conversations",
        headers={"Authorization": f"Bearer {user_token}"},
        json={
            "title": "Missing model",
            "agent_id": 1,
            "initial_message": "Start this conversation.",
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Agent does not have a default Model Configuration."


def test_user_conversation_rejects_model_outside_agent_allowed_selection():
    client = TestClient(app)
    allowed_model_id = configure_default_agent_model()
    rejected_model_id = create_model_configuration_for_tests(model_name="gpt-5-mini")
    client.patch(
        "/admin/agents/1",
        headers={"Authorization": f"Bearer {administrator_token(client)}"},
        json={
            "default_model_configuration_id": allowed_model_id,
            "allowed_model_configuration_ids": [allowed_model_id],
        },
    )
    user_token = approved_user_token(client)

    response = client.post(
        "/conversations",
        headers={"Authorization": f"Bearer {user_token}"},
        json={
            "title": "Rejected model",
            "agent_id": 1,
            "selected_model_configuration_id": rejected_model_id,
            "initial_message": "Start this conversation.",
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Model Configuration is not allowed for this Agent."
