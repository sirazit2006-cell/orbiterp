import pytest
from rest_framework.test import APIClient

from apps.core.models import User


@pytest.fixture
def make_user(db):
    def _make(username, roles):
        return User.objects.create_user(username=username, password="Str0ng-pass-123", roles=roles)

    return _make


@pytest.fixture
def client_for(make_user):
    def _client(*roles):
        user = make_user("_".join(roles) or "noroles", list(roles))
        client = APIClient()
        client.force_authenticate(user)
        client.user = user
        return client

    return _client
