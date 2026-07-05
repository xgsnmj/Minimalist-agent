from fastapi.testclient import TestClient

from apps.api.app.admin_audit import admin_audit_store
from apps.api.app.auth import LocalAccountStore, RegisterRequest, local_account_store
from apps.api.app.app import app


def setup_function():
    admin_audit_store.reset()
    local_account_store.reset()


def assert_account_response(
    account: dict,
    *,
    id: int,
    username: str,
    email: str | None,
    role: str,
    status: str,
    note: str = "",
    status_reason: str = "",
) -> None:
    assert account["id"] == id
    assert account["username"] == username
    assert account["email"] == email
    assert account["role"] == role
    assert account["status"] == status
    assert account["note"] == note
    assert account["status_reason"] == status_reason
    assert account["created_at"]
    assert account["updated_at"]


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
    assert_account_response(
        register_response.json(),
        id=1,
        username="lin",
        email="lin@example.com",
        role="user",
        status="pending",
    )

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


def test_authenticated_user_can_update_own_profile():
    client = TestClient(app)
    user = client.post(
        "/auth/register",
        json={
            "username": "wen",
            "email": "wen@example.com",
            "password": "correct horse battery staple",
        },
    ).json()
    local_account_store.approve(user["id"])
    user_token = client.post(
        "/auth/login",
        json={
            "login": "wen",
            "password": "correct horse battery staple",
        },
    ).json()["access_token"]

    response = client.patch(
        "/auth/me",
        headers={"Authorization": f"Bearer {user_token}"},
        json={
            "username": "wen.updated",
            "email": "wen.updated@example.com",
        },
    )

    assert response.status_code == 200
    assert_account_response(
        response.json(),
        id=user["id"],
        username="wen.updated",
        email="wen.updated@example.com",
        role="user",
        status="enabled",
    )

    me_response = client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert me_response.json()["username"] == "wen.updated"


def test_authenticated_user_profile_update_rejects_duplicate_login():
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
    local_account_store.approve(second_user["id"])
    first_token = client.post(
        "/auth/login",
        json={
            "login": "first",
            "password": "correct horse battery staple",
        },
    ).json()["access_token"]

    response = client.patch(
        "/auth/me",
        headers={"Authorization": f"Bearer {first_token}"},
        json={
            "username": "second",
            "email": "second@example.com",
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Local Account already exists."


def test_administrator_can_list_local_accounts():
    local_account_store.bootstrap_administrator(
        username="admin",
        password="correct horse battery staple",
    )
    client = TestClient(app)
    client.post(
        "/auth/register",
        json={
            "username": "pending",
            "email": "pending@example.com",
            "password": "correct horse battery staple",
        },
    )
    admin_token = client.post(
        "/auth/login",
        json={
            "login": "admin",
            "password": "correct horse battery staple",
        },
    ).json()["access_token"]

    response = client.get(
        "/admin/accounts",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    assert len(response.json()) == 2
    assert_account_response(
        response.json()[0],
        id=1,
        username="admin",
        email=None,
        role="admin",
        status="enabled",
    )
    assert_account_response(
        response.json()[1],
        id=2,
        username="pending",
        email="pending@example.com",
        role="user",
        status="pending",
    )


def test_only_administrators_can_list_local_accounts():
    client = TestClient(app)
    user = client.post(
        "/auth/register",
        json={
            "username": "enabled",
            "email": "enabled@example.com",
            "password": "correct horse battery staple",
        },
    ).json()
    local_account_store.approve(user["id"])
    user_token = client.post(
        "/auth/login",
        json={
            "login": "enabled",
            "password": "correct horse battery staple",
        },
    ).json()["access_token"]

    response = client.get(
        "/admin/accounts",
        headers={"Authorization": f"Bearer {user_token}"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Administrator access required."


def test_api_startup_bootstraps_administrator_from_environment(monkeypatch):
    monkeypatch.setenv("ADMIN_BOOTSTRAP_USERNAME", "admin")
    monkeypatch.setenv("ADMIN_BOOTSTRAP_PASSWORD", "correct horse battery staple")

    with TestClient(app) as client:
        login_response = client.post(
            "/auth/login",
            json={
                "login": "admin",
                "password": "correct horse battery staple",
            },
        )

    assert login_response.status_code == 200
    assert login_response.json()["user"]["role"] == "admin"
    assert login_response.json()["user"]["status"] == "enabled"


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
        json={"reason": "Unable to verify requester."},
    )
    approve_response = client.post(
        f"/admin/accounts/{disabled['id']}/approve",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    disable_response = client.post(
        f"/admin/accounts/{disabled['id']}/disable",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"reason": "Access no longer required."},
    )

    assert reject_response.status_code == 200
    assert reject_response.json()["status"] == "rejected"
    assert reject_response.json()["status_reason"] == "Unable to verify requester."
    assert approve_response.status_code == 200
    assert disable_response.status_code == 200
    assert disable_response.json()["status"] == "disabled"
    assert disable_response.json()["status_reason"] == "Access no longer required."

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


def test_administrator_can_update_note_reenable_account_and_view_audit_events():
    local_account_store.bootstrap_administrator(
        username="admin",
        password="correct horse battery staple",
    )
    client = TestClient(app)
    account = client.post(
        "/auth/register",
        json={
            "username": "reviewed",
            "email": "reviewed@example.com",
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
    client.post(
        f"/admin/accounts/{account['id']}/reject",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"reason": "Needs manager confirmation."},
    )

    note_response = client.patch(
        f"/admin/accounts/{account['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"note": "Manager confirmed identity."},
    )
    enable_response = client.post(
        f"/admin/accounts/{account['id']}/enable",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"reason": "Manager confirmation received."},
    )
    audit_response = client.get(
        f"/admin/accounts/{account['id']}/audit-events",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert note_response.status_code == 200
    assert note_response.json()["note"] == "Manager confirmed identity."
    assert enable_response.status_code == 200
    assert enable_response.json()["status"] == "enabled"
    assert enable_response.json()["status_reason"] == "Manager confirmation received."
    assert audit_response.status_code == 200
    assert [event["action"] for event in audit_response.json()] == [
        "registered",
        "rejected",
        "updated",
        "enabled",
    ]
    assert audit_response.json()[-1]["reason"] == "Manager confirmation received."
    admin_audit_events = admin_audit_store.list_events()
    assert [event.action for event in admin_audit_events] == [
        "rejected",
        "updated",
        "enabled",
    ]
    assert admin_audit_events[-1].reason == "Manager confirmation received."
    assert admin_audit_events[-1].after["status"] == "enabled"


def test_local_account_store_persists_accounts_and_audit_events_across_store_instances():
    administrator = local_account_store.bootstrap_administrator(
        username="admin",
        password="correct horse battery staple",
    )
    account = local_account_store.register(
        RegisterRequest(
            username="persisted",
            email="persisted@example.com",
            password="correct horse battery staple",
        )
    )
    local_account_store.approve(
        account.id,
        actor_id=administrator.id,
        reason="Verified.",
    )

    fresh_store = LocalAccountStore()

    assert fresh_store.get(account.id).status == "enabled"
    assert fresh_store.get(account.id).status_reason == "Verified."
    assert [event.action for event in fresh_store.list_audit_events(account.id)] == [
        "registered",
        "approved",
    ]


def test_disabled_account_invalidates_existing_token():
    local_account_store.bootstrap_administrator(
        username="admin",
        password="correct horse battery staple",
    )
    client = TestClient(app)
    account = client.post(
        "/auth/register",
        json={
            "username": "revoked",
            "email": "revoked@example.com",
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
    client.post(
        f"/admin/accounts/{account['id']}/approve",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    user_token = client.post(
        "/auth/login",
        json={
            "login": "revoked",
            "password": "correct horse battery staple",
        },
    ).json()["access_token"]

    client.post(
        f"/admin/accounts/{account['id']}/disable",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"reason": "Session must be revoked."},
    )
    response = client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {user_token}"},
    )

    assert response.status_code == 401


def test_account_reject_and_disable_require_reason():
    local_account_store.bootstrap_administrator(
        username="admin",
        password="correct horse battery staple",
    )
    client = TestClient(app)
    account = client.post(
        "/auth/register",
        json={
            "username": "needs-reason",
            "email": "needs-reason@example.com",
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
        f"/admin/accounts/{account['id']}/reject",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"reason": ""},
    )
    disable_response = client.post(
        f"/admin/accounts/{account['id']}/disable",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"reason": ""},
    )

    assert reject_response.status_code == 422
    assert reject_response.json()["detail"] == "Reason is required."
    assert disable_response.status_code == 422
    assert disable_response.json()["detail"] == "Reason is required."


def test_administrator_cannot_disable_self():
    local_account_store.bootstrap_administrator(
        username="admin",
        password="correct horse battery staple",
    )
    client = TestClient(app)
    admin_token = client.post(
        "/auth/login",
        json={
            "login": "admin",
            "password": "correct horse battery staple",
        },
    ).json()["access_token"]

    response = client.post(
        "/admin/accounts/1/disable",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"reason": "Testing self disable."},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Administrators cannot disable their own account."


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
