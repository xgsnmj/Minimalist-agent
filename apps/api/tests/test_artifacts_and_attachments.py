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


def test_users_can_upload_run_attachments_and_create_artifacts_with_preview_refs():
    client = TestClient(app)
    token = approved_user_token(client)
    conversation = client.post(
        "/conversations",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "Artifact workspace",
            "agent_id": 1,
            "initial_message": "Start this conversation.",
        },
    ).json()

    attachment_response = client.post(
        f"/conversations/{conversation['id']}/run-attachments",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("brief.md", b"# Brief\n\nalpha", "text/markdown")},
    )
    artifact_response = client.post(
        f"/conversations/{conversation['id']}/artifacts",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "filename": "summary.md",
            "content_type": "text/markdown",
            "body": "# Summary\n\nThis body stays in object storage.",
        },
    )
    detail_response = client.get(
        f"/conversations/{conversation['id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    attachment_list_response = client.get(
        f"/conversations/{conversation['id']}/run-attachments",
        headers={"Authorization": f"Bearer {token}"},
    )
    preview_response = client.get(
        f"/artifacts/{artifact_response.json()['id']}/preview",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert attachment_response.status_code == 201
    assert attachment_response.json()["filename"] == "brief.md"
    assert attachment_response.json()["preview_type"] == "markdown"
    assert attachment_response.json()["size"] == len(b"# Brief\n\nalpha")
    assert attachment_list_response.json()[0]["filename"] == "brief.md"
    assert artifact_response.status_code == 201
    assert artifact_response.json()["filename"] == "summary.md"
    assert artifact_response.json()["preview_type"] == "markdown"
    assert detail_response.json()["messages"][-1]["artifact_reference"] == {
        "artifact_id": artifact_response.json()["id"],
        "filename": "summary.md",
        "preview_type": "markdown",
    }
    assert preview_response.status_code == 200
    assert preview_response.json()["artifact_id"] == artifact_response.json()["id"]
    assert preview_response.json()["preview_type"] == "markdown"
    assert preview_response.json()["text"].startswith("# Summary")


def test_artifacts_and_attachments_are_persisted_and_can_be_downloaded():
    client = TestClient(app)
    token = approved_user_token(client)
    conversation = client.post(
        "/conversations",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "Downloadable workspace",
            "agent_id": 1,
            "initial_message": "Start this conversation.",
        },
    ).json()

    attachment_response = client.post(
        f"/conversations/{conversation['id']}/run-attachments",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("notes.txt", b"plain text body", "text/plain")},
    )
    artifact_response = client.post(
        f"/conversations/{conversation['id']}/artifacts",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "filename": "table.csv",
            "content_type": "text/csv",
            "body": "name,value\nalpha,1",
        },
    )
    attachment_preview = client.get(
        f"/conversations/{conversation['id']}/run-attachments/{attachment_response.json()['id']}/preview",
        headers={"Authorization": f"Bearer {token}"},
    )
    artifact_download = client.get(
        f"/artifacts/{artifact_response.json()['id']}/download",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert attachment_response.json()["preview_type"] == "plaintext"
    assert attachment_preview.json()["text"] == "plain text body"
    assert artifact_response.json()["preview_type"] == "table"
    assert artifact_download.status_code == 200
    assert artifact_download.headers["content-disposition"] == 'attachment; filename="table.csv"'
    assert artifact_download.content == b"name,value\nalpha,1"


def test_artifact_preview_type_covers_html_images_and_code():
    client = TestClient(app)
    token = approved_user_token(client)
    conversation = client.post(
        "/conversations",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "Preview matrix",
            "agent_id": 1,
            "initial_message": "Start this conversation.",
        },
    ).json()

    html_artifact = client.post(
        f"/conversations/{conversation['id']}/artifacts",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "filename": "preview.html",
            "content_type": "text/html",
            "body": "<div>hello</div>",
        },
    ).json()
    image_artifact = client.post(
        f"/conversations/{conversation['id']}/artifacts",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "filename": "snapshot.png",
            "content_type": "image/png",
            "body": "binary-but-text-for-test",
        },
    ).json()
    code_artifact = client.post(
        f"/conversations/{conversation['id']}/artifacts",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "filename": "snippet.py",
            "content_type": "text/x-python",
            "body": "print('hello')",
        },
    ).json()

    assert html_artifact["preview_type"] == "html"
    assert image_artifact["preview_type"] == "image"
    assert code_artifact["preview_type"] == "code"
