import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings, get_settings
from app.database import create_database_engine, create_session_factory
from app.main import create_app

# Points at a port nothing listens on, so any accidental connection fails fast.
UNREACHABLE_DATABASE_URL = "postgresql://orbit:not-a-secret@127.0.0.1:1/orbit"

API_ROOT = Path(__file__).resolve().parents[1]

# Fake credentials for tests only.
OWNER_EMAIL = "owner@example.com"
OWNER_PASSWORD = "correct horse battery staple"


@pytest.fixture
def settings() -> Settings:
    return Settings(ORBIT_ENV="test", DATABASE_URL=UNREACHABLE_DATABASE_URL, _env_file=None)


@pytest.fixture
def db_settings(monkeypatch) -> Iterator[Settings]:
    """Settings for the test database, migrated to head and emptied before each test.

    Needs TEST_DATABASE_URL (a dedicated database: tables are truncated). Tests using it
    should carry the `integration` marker.
    """
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL not set")
    monkeypatch.chdir(API_ROOT / "tests")  # no .env file here
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()

    command.upgrade(Config(str(API_ROOT / "alembic.ini")), "head")
    test_settings = Settings(ORBIT_ENV="test", DATABASE_URL=url, _env_file=None)
    engine = create_database_engine(test_settings)
    with engine.begin() as connection:
        connection.execute(text("TRUNCATE users, sessions CASCADE"))
    engine.dispose()

    yield test_settings
    get_settings.cache_clear()


@pytest.fixture
def db_engine(db_settings) -> Iterator[Engine]:
    engine = create_database_engine(db_settings)
    yield engine
    engine.dispose()


@pytest.fixture
def session_factory(db_engine) -> sessionmaker[Session]:
    return create_session_factory(db_engine)


@pytest.fixture
def client(db_settings) -> Iterator[TestClient]:
    with TestClient(create_app(db_settings)) as test_client:
        yield test_client


@pytest.fixture
def owner(session_factory):
    from app.auth.service import create_owner

    with session_factory() as session:
        return create_owner(
            session, email=OWNER_EMAIL, display_name="Test Owner", password=OWNER_PASSWORD
        )


def login(client: TestClient, email: str = OWNER_EMAIL, password: str = OWNER_PASSWORD) -> str:
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["token"]


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
