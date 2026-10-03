from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text, update

from app.auth.dependencies import CurrentUserDep
from app.auth.tokens import hash_token
from app.main import create_app
from app.models import AuthSession
from tests.conftest import OWNER_EMAIL, OWNER_PASSWORD, bearer, login

pytestmark = pytest.mark.integration

INVALID_LOGIN = {"detail": "Invalid email or password"}


def test_login_returns_a_token_and_the_owner(client, owner):
    response = client.post("/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD})

    assert response.status_code == 200
    body = response.json()
    assert len(body["token"]) >= 43
    assert body["user"] == {
        "id": str(owner.id),
        "email": OWNER_EMAIL,
        "display_name": "Test Owner",
    }
    expires_at = datetime.fromisoformat(body["expires_at"])
    assert timedelta(days=29) < expires_at - datetime.now(UTC) <= timedelta(days=30)


def test_login_email_is_case_insensitive(client, owner):
    login(client, email="OWNER@example.com")


@pytest.mark.parametrize(
    "credentials",
    [
        {"email": OWNER_EMAIL, "password": "wrong password"},
        {"email": "someone-else@example.com", "password": OWNER_PASSWORD},
        {"email": "not-an-email", "password": OWNER_PASSWORD},
    ],
    ids=["wrong-password", "unknown-email", "malformed-email"],
)
def test_failed_logins_all_look_the_same(client, owner, credentials):
    response = client.post("/auth/login", json=credentials)

    assert response.status_code == 401
    assert response.json() == INVALID_LOGIN


def test_login_without_an_owner_fails_like_a_wrong_password(client):
    response = client.post("/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD})

    assert response.status_code == 401
    assert response.json() == INVALID_LOGIN


def test_database_stores_only_the_token_hash(client, owner, db_engine):
    token = login(client)

    with db_engine.connect() as connection:
        rows = connection.execute(text("SELECT * FROM sessions")).mappings().all()

    assert len(rows) == 1
    assert rows[0]["token_hash"] == hash_token(token)
    assert token not in str(dict(rows[0]))


def test_password_is_stored_only_as_an_argon2id_hash(owner, db_engine):
    with db_engine.connect() as connection:
        stored = connection.execute(text("SELECT password_hash FROM users")).scalar_one()

    assert stored.startswith("$argon2id$")
    assert OWNER_PASSWORD not in stored


def test_me_returns_the_owner_for_a_valid_token(client, owner):
    response = client.get("/auth/me", headers=bearer(login(client)))

    assert response.status_code == 200
    assert response.json()["email"] == OWNER_EMAIL


@pytest.mark.parametrize(
    "headers",
    [{}, {"Authorization": "Basic b3duZXI6cGFzcw=="}, {"Authorization": "Bearer "}, bearer("nope")],
    ids=["no-header", "wrong-scheme", "empty-token", "unknown-token"],
)
def test_me_rejects_missing_or_invalid_tokens(client, owner, headers):
    response = client.get("/auth/me", headers=headers)

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_me_rejects_an_expired_session(client, owner, session_factory):
    token = login(client)
    with session_factory() as session:
        session.execute(
            update(AuthSession).values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
        )
        session.commit()

    assert client.get("/auth/me", headers=bearer(token)).status_code == 401


def test_logout_revokes_that_session_only(client, owner, session_factory):
    first, second = login(client), login(client)

    assert client.post("/auth/logout", headers=bearer(first)).status_code == 204

    assert client.get("/auth/me", headers=bearer(first)).status_code == 401
    assert client.get("/auth/me", headers=bearer(second)).status_code == 200
    with session_factory() as session:
        remaining = session.scalars(select(AuthSession.token_hash)).all()
    assert remaining == [hash_token(second)]


def test_logout_twice_is_rejected(client, owner):
    token = login(client)
    client.post("/auth/logout", headers=bearer(token))

    assert client.post("/auth/logout", headers=bearer(token)).status_code == 401


def test_logout_requires_a_session(client):
    assert client.post("/auth/logout").status_code == 401


def test_login_clears_expired_sessions(client, owner, session_factory):
    login(client)
    with session_factory() as session:
        session.execute(
            update(AuthSession).values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
        )
        session.commit()

    login(client)

    with session_factory() as session:
        assert len(session.scalars(select(AuthSession)).all()) == 1


def test_session_ttl_comes_from_settings(db_settings, owner):
    settings = db_settings.model_copy(update={"session_ttl_days": 2})
    with TestClient(create_app(settings)) as client:
        body = client.post(
            "/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}
        ).json()

    expires_at = datetime.fromisoformat(body["expires_at"])
    assert expires_at - datetime.now(UTC) <= timedelta(days=2)


def test_current_user_dependency_protects_any_endpoint(db_settings, owner):
    app = create_app(db_settings)

    @app.get("/_private")
    def private(user: CurrentUserDep) -> dict[str, str]:
        return {"email": user.email}

    with TestClient(app) as client:
        assert client.get("/_private").status_code == 401
        response = client.get("/_private", headers=bearer(login(client)))
        assert response.json() == {"email": OWNER_EMAIL}


def test_every_endpoint_except_health_and_login_requires_a_session(settings):
    # The bearer scheme marks each endpoint that depends on CurrentSessionDep in the
    # OpenAPI schema, which covers every route the app serves.
    public = {"GET /health", "GET /health/ready", "POST /auth/login"}
    operations = {
        f"{method.upper()} {path}": operation
        for path, methods in create_app(settings).openapi()["paths"].items()
        for method, operation in methods.items()
    }

    unprotected = {name for name, operation in operations.items() if not operation.get("security")}

    assert unprotected == public
    assert len(operations) > len(public)
