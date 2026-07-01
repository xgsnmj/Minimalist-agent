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


def setup_function():
    local_account_store.reset()
    agent_store.reset()
    model_configuration_store.reset()
    conversation_store.reset()
    agent_run_store.reset()
    artifact_store.reset_for_tests()
    run_attachment_store.reset_for_tests()
    run_event_log_store.reset_for_tests()


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


def test_card_schema_registry_accepts_registered_cards_and_persists_card_messages():
    client = TestClient(app)
    token = approved_user_token(client)
    conversation = client.post(
        "/conversations",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "Card workspace",
            "agent_id": 1,
            "initial_message": "Start this conversation.",
        },
    ).json()

    card_payloads = [
        {
            "schema": "artifact_card",
            "artifact_id": 1,
            "filename": "brief.md",
            "preview_type": "markdown",
        },
        {
            "schema": "tool_result_card",
            "tool_call_id": "tool-1",
            "tool_name": "doubao_search",
            "status": "completed",
            "summary": "Found 4 relevant results.",
        },
        {
            "schema": "choice_card",
            "prompt": "Choose the output format.",
            "options": [
                {"id": "brief", "label": "Brief"},
                {"id": "table", "label": "Table", "description": "Structured comparison."},
            ],
        },
        {
            "schema": "citation_card",
            "title": "AG-UI protocol",
            "url": "https://docs.ag-ui.com/",
            "source": "AG-UI docs",
            "snippet": "Event streams carry agent state.",
        },
        {
            "schema": "status_card",
            "status": "running",
            "title": "Reading sources",
            "detail": "The Agent is collecting evidence.",
        },
        {
            "schema": "form_request_card",
            "title": "Need launch inputs",
            "fields": [
                {"id": "audience", "label": "Audience", "type": "text", "required": True}
            ],
        },
    ]

    responses = [
        client.post(
            f"/conversations/{conversation['id']}/cards",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
        )
        for payload in card_payloads
    ]
    detail_response = client.get(
        f"/conversations/{conversation['id']}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert [response.status_code for response in responses] == [201, 201, 201, 201, 201, 201]
    assert [response.json()["schema"] for response in responses] == [
        "artifact_card",
        "tool_result_card",
        "choice_card",
        "citation_card",
        "status_card",
        "form_request_card",
    ]
    assert responses[0].json()["payload"]["artifact_id"] == 1
    assert responses[0].json()["payload"]["filename"] == "brief.md"
    persisted_cards = [
        message["card"]["schema"]
        for message in detail_response.json()["messages"]
        if message.get("card")
    ]
    assert persisted_cards == [
        "artifact_card",
        "tool_result_card",
        "choice_card",
        "citation_card",
        "status_card",
        "form_request_card",
    ]


def test_card_backed_messages_can_emit_resumable_card_events():
    client = TestClient(app)
    token = approved_user_token(client)
    conversation = client.post(
        "/conversations",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "Card events",
            "agent_id": 1,
            "initial_message": "Start this conversation.",
        },
    ).json()
    run = client.post(
        f"/conversations/{conversation['id']}/runs",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": "Render a card."},
    ).json()

    card_response = client.post(
        f"/conversations/{conversation['id']}/cards",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "run_id": run["id"],
            "card": {
                "schema": "status_card",
                "status": "running",
                "title": "Reading sources",
                "detail": "The Agent is collecting evidence.",
            },
        },
    )
    full_stream_response = client.get(
        f"/runs/{run['id']}/events",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "text/event-stream",
        },
    )
    resume_response = client.get(
        f"/runs/{run['id']}/events",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "text/event-stream",
            "Last-Event-ID": "2",
        },
    )

    assert card_response.status_code == 201
    assert "event: card.rendered" in full_stream_response.text
    assert '"schema":"status_card"' in full_stream_response.text
    assert "id: 1" not in resume_response.text
    assert "id: 2" not in resume_response.text
    assert "event: card.rendered" in resume_response.text


def test_card_schema_registry_rejects_unregistered_and_unsafe_payloads():
    client = TestClient(app)
    token = approved_user_token(client)
    conversation = client.post(
        "/conversations",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "Unsafe card workspace",
            "agent_id": 1,
            "initial_message": "Start this conversation.",
        },
    ).json()

    unregistered_response = client.post(
        f"/conversations/{conversation['id']}/cards",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "schema": "custom_component",
            "payload": {"dangerouslySetInnerHTML": "<script>alert(1)</script>"},
        },
    )
    unsafe_response = client.post(
        f"/conversations/{conversation['id']}/cards",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "schema": "status_card",
            "status": "running",
            "title": "Unsafe",
            "component": "ArbitraryWidget",
        },
    )
    html_response = client.post(
        f"/conversations/{conversation['id']}/cards",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "schema": "citation_card",
            "title": "Unsafe source",
            "url": "javascript:alert(1)",
        },
    )

    assert unregistered_response.status_code == 422
    assert unsafe_response.status_code == 422
    assert html_response.status_code == 422
