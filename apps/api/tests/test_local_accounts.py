from fastapi.testclient import TestClient

from apps.api.app.auth import local_account_store
from apps.api.app.main import app


def setup_function():
    local_account_store.reset()


def test_registered_local_account_is_pending_and_cannot_access_protected_surface():
    client = TestClient(app)

    register_response = client.post(
        "/auth/register",
        json={
            "username": "lin",
            "email": "lin@example.com",
            "password": "correct horse battery staple",
        },
    )

    assert register_response.status_code == 201
    assert register_response.json() == {
        "id": 1,
        "username": "lin",
        "email": "lin@example.com",
        "role": "user",
        "status": "pending",
    }

    login_response = client.post(
        "/auth/login",
        json={
            "login": "lin",
            "password": "correct horse battery staple",
        },
    )

    assert login_response.status_code == 403
    assert login_response.json()["detail"] == "Account is pending approval."

    me_response = client.get("/auth/me")

    assert me_response.status_code == 401


def test_administrator_can_approve_local_account_and_user_can_access_protected_surface():
    local_account_store.bootstrap_administrator(
        username="admin",
        password="correct horse battery staple",
    )
    client = TestClient(app)
    register_response = client.post(
        "/auth/register",
        json={
            "username": "wen",
            "email": "wen@example.com",
            "password": "correct horse battery staple",
        },
    )
    admin_login = client.post(
        "/auth/login",
        json={
            "login": "admin",
            "password": "correct horse battery staple",
        },
    )
    admin_token = admin_login.json()["access_token"]

    approval_response = client.post(
        f"/admin/accounts/{register_response.json()['id']}/approve",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert approval_response.status_code == 200
    assert approval_response.json()["status"] == "enabled"

    user_login = client.post(
        "/auth/login",
        json={
            "login": "wen@example.com",
            "password": "correct horse battery staple",
        },
    )

    assert user_login.status_code == 200
    user_token = user_login.json()["access_token"]
    me_response = client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert me_response.status_code == 200
    assert me_response.json()["username"] == "wen"


def test_administrator_can_reject_and_disable_local_accounts():
    local_account_store.bootstrap_administrator(
        username="admin",
        password="correct horse battery staple",
    )
    client = TestClient(app)
    rejected = client.post(
        "/auth/register",
        json={
            "username": "rejected",
            "email": "rejected@example.com",
            "password": "correct horse battery staple",
        },
    ).json()
    disabled = client.post(
        "/auth/register",
        json={
            "username": "disabled",
            "email": "disabled@example.com",
            "password": "correct horse battery staple",
        },
    ).json()
    admin_token = client.post(
        "/auth/login",
        json={
            "login": "admin",
            "password": "correct horse battery staple",
        },
    ).json()["access_token"]

    reject_response = client.post(
        f"/admin/accounts/{rejected['id']}/reject",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    approve_response = client.post(
        f"/admin/accounts/{disabled['id']}/approve",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    disable_response = client.post(
        f"/admin/accounts/{disabled['id']}/disable",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert reject_response.status_code == 200
    assert reject_response.json()["status"] == "rejected"
    assert approve_response.status_code == 200
    assert disable_response.status_code == 200
    assert disable_response.json()["status"] == "disabled"

    rejected_login = client.post(
        "/auth/login",
        json={
            "login": "rejected",
            "password": "correct horse battery staple",
        },
    )
    disabled_login = client.post(
        "/auth/login",
        json={
            "login": "disabled",
            "password": "correct horse battery staple",
        },
    )

    assert rejected_login.status_code == 403
    assert rejected_login.json()["detail"] == "Account has been rejected."
    assert disabled_login.status_code == 403
    assert disabled_login.json()["detail"] == "Account is disabled."


def test_only_administrators_can_change_account_approval():
    client = TestClient(app)
    first_user = client.post(
        "/auth/register",
        json={
            "username": "first",
            "email": "first@example.com",
            "password": "correct horse battery staple",
        },
    ).json()
    second_user = client.post(
        "/auth/register",
        json={
            "username": "second",
            "email": "second@example.com",
            "password": "correct horse battery staple",
        },
    ).json()
    local_account_store.approve(first_user["id"])
    user_token = client.post(
        "/auth/login",
        json={
            "login": "first",
            "password": "correct horse battery staple",
        },
    ).json()["access_token"]

    response = client.post(
        f"/admin/accounts/{second_user['id']}/approve",
        headers={"Authorization": f"Bearer {user_token}"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Administrator access required."
