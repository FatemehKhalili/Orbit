"""What changes when ORBIT_ENV=production (ADR 0009), and what the logs may contain."""

import logging

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from tests.conftest import OWNER_EMAIL, OWNER_PASSWORD, UNREACHABLE_DATABASE_URL, bearer


def app_for(environment: str) -> TestClient:
    settings = Settings(
        ORBIT_ENV=environment, DATABASE_URL=UNREACHABLE_DATABASE_URL, _env_file=None
    )
    return TestClient(create_app(settings))


@pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json"])
def test_production_serves_no_api_docs_or_schema(path):
    with app_for("production") as client:
        assert client.get(path).status_code == 404
        assert client.get("/health").status_code == 200


@pytest.mark.parametrize("environment", ["development", "test"])
def test_development_keeps_the_api_docs(environment):
    with app_for(environment) as client:
        assert client.get("/docs").status_code == 200
        assert client.get("/openapi.json").status_code == 200


def test_requests_are_logged_without_query_strings_or_headers(caplog):
    caplog.set_level(logging.INFO, logger="orbit")
    with app_for("production") as client:
        client.get("/health?token=query-secret", headers={"Authorization": "Bearer header-secret"})

    assert "GET /health 200" in caplog.text
    assert "query-secret" not in caplog.text
    assert "header-secret" not in caplog.text


@pytest.mark.integration
def test_signing_in_logs_no_secrets(client, owner, caplog):
    caplog.set_level(logging.DEBUG)
    wrong = "wrong-password-that-must-not-be-logged"
    for _ in range(6):
        client.post("/auth/login", json={"email": OWNER_EMAIL, "password": wrong})
    client.post("/admin", json={"password": OWNER_PASSWORD})  # 404, body never logged

    text = caplog.text
    assert "POST /auth/login 401" in text
    assert "POST /auth/login 429" in text
    assert "sign-in refused: account blocked" in text
    for secret in [wrong, OWNER_PASSWORD, OWNER_EMAIL, "owner@"]:
        assert secret not in text


@pytest.mark.integration
def test_a_successful_sign_in_and_export_log_no_tokens(client, owner, caplog):
    caplog.set_level(logging.DEBUG)
    body = client.post(
        "/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}
    ).json()
    client.get("/account/export", headers=bearer(body["token"]))
    client.post("/auth/logout", headers=bearer(body["token"]))

    text = caplog.text
    assert "POST /auth/login 200" in text and "GET /account/export 200" in text
    for secret in [body["token"], body["device_token"], OWNER_PASSWORD, OWNER_EMAIL]:
        assert secret not in text
