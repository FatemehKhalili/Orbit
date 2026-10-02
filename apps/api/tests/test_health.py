import os

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_liveness_reports_ok_without_a_database(settings):
    with TestClient(create_app(settings)) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "orbit-api"}


def test_readiness_returns_503_when_database_is_unreachable(settings):
    with TestClient(create_app(settings)) as client:
        response = client.get("/health/ready")

    assert response.status_code == 503
    assert response.json() == {"status": "unavailable", "database": "unreachable"}


def test_readiness_does_not_leak_connection_details(settings):
    with TestClient(create_app(settings)) as client:
        body = client.get("/health/ready").text

    assert "not-a-secret" not in body
    assert "127.0.0.1" not in body


@pytest.mark.integration
@pytest.mark.skipif("TEST_DATABASE_URL" not in os.environ, reason="TEST_DATABASE_URL not set")
def test_readiness_returns_ok_against_a_real_database():
    settings = Settings(
        ORBIT_ENV="test", DATABASE_URL=os.environ["TEST_DATABASE_URL"], _env_file=None
    )
    with TestClient(create_app(settings)) as client:
        response = client.get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}
