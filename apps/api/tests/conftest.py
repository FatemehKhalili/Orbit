import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Engine, insert, text
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
OTHER_EMAIL = "other@example.com"
OTHER_PASSWORD = "another horse battery staple"


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
        connection.execute(text("TRUNCATE users, sessions, shopping_items CASCADE"))
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


@pytest.fixture
def two_users_client(db_settings, db_engine) -> Iterator[TestClient]:
    """A client for an API whose database has two users: the owner and OTHER_EMAIL.

    Orbit allows one user per instance (`uq_users_is_owner`), but ownership checks need
    a second user to prove anything. This fixture drops that constraint inside one
    transaction, adds both users, serves the API on that same connection and rolls the
    transaction back afterwards. PostgreSQL DDL is transactional, so no other
    connection ever sees the constraint missing, and nothing survives the test.
    Requests commit to savepoints inside the outer transaction.
    """
    from app.auth.passwords import hash_password
    from app.models import User

    connection = db_engine.connect()
    transaction = connection.begin()
    try:
        connection.execute(text("ALTER TABLE users DROP CONSTRAINT uq_users_is_owner"))
        connection.execute(
            insert(User),
            [
                {
                    "email": email,
                    "display_name": name,
                    "password_hash": hash_password(password),
                }
                for email, name, password in [
                    (OWNER_EMAIL, "Test Owner", OWNER_PASSWORD),
                    (OTHER_EMAIL, "Other User", OTHER_PASSWORD),
                ]
            ],
        )
        app = create_app(db_settings)
        app.state.session_factory = sessionmaker(
            bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
        )
        with TestClient(app) as test_client:
            yield test_client
    finally:
        transaction.rollback()
        connection.close()
