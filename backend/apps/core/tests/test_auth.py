import pytest
from rest_framework.test import APIClient

from apps.core.models import AuditLog, User


@pytest.mark.django_db
def test_login_returns_tokens_and_me_shows_roles(make_user):
    make_user("riya", ["reception"])
    client = APIClient()
    res = client.post("/api/auth/token/", {"username": "riya", "password": "Str0ng-pass-123"}, format="json")
    assert res.status_code == 200
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
    me = client.get("/api/auth/me/")
    assert me.status_code == 200
    assert me.data["roles"] == ["reception"]


@pytest.mark.django_db
def test_wrong_password_is_rejected(make_user):
    make_user("riya", ["reception"])
    res = APIClient().post("/api/auth/token/", {"username": "riya", "password": "nope"}, format="json")
    assert res.status_code == 401


@pytest.mark.django_db
def test_anonymous_requests_are_rejected():
    assert APIClient().get("/api/patients/").status_code == 401


@pytest.mark.django_db
def test_only_admin_manages_users(client_for):
    payload = {"username": "nurse2", "roles": ["nurse"], "password": "Another-Str0ng-1"}
    assert client_for("reception").post("/api/users/", payload, format="json").status_code == 403
    res = client_for("admin").post("/api/users/", payload, format="json")
    assert res.status_code == 201, res.data
    assert "password" not in res.data
    user = User.objects.get(username="nurse2")
    assert user.check_password("Another-Str0ng-1")
    assert AuditLog.objects.filter(table="core_user", action="create").exists()


@pytest.mark.django_db
def test_user_with_unknown_role_is_rejected(client_for):
    res = client_for("admin").post(
        "/api/users/", {"username": "x", "roles": ["janitor"], "password": "Another-Str0ng-1"}, format="json"
    )
    assert res.status_code == 400
