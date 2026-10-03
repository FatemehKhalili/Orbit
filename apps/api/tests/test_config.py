import pytest
from pydantic import ValidationError

from app.config import Settings


def make_settings(**env) -> Settings:
    return Settings(_env_file=None, **env)


def test_database_url_is_required(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(ValidationError, match="DATABASE_URL"):
        make_settings()


def test_settings_are_read_from_environment_variables(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@db:5432/orbit")
    monkeypatch.setenv("ORBIT_ENV", "production")

    settings = make_settings()

    assert settings.environment == "production"
    assert settings.database_url.get_secret_value() == "postgresql+psycopg://u:p@db:5432/orbit"


@pytest.mark.parametrize(
    "url",
    [
        "postgresql://u:p@db:5432/orbit",
        "postgres://u:p@db:5432/orbit",
        "postgresql+psycopg://u:p@db:5432/orbit",
    ],
)
def test_postgres_urls_are_normalized_to_the_psycopg_driver(url):
    settings = make_settings(DATABASE_URL=url)

    assert settings.database_url.get_secret_value() == "postgresql+psycopg://u:p@db:5432/orbit"


def test_non_postgres_database_url_is_rejected():
    with pytest.raises(ValidationError, match="PostgreSQL"):
        make_settings(DATABASE_URL="sqlite:///orbit.db")


def test_environment_must_be_a_known_value():
    with pytest.raises(ValidationError):
        make_settings(DATABASE_URL="postgresql://u:p@db/orbit", ORBIT_ENV="staging")


def test_environment_defaults_to_development(monkeypatch):
    monkeypatch.delenv("ORBIT_ENV", raising=False)

    assert make_settings(DATABASE_URL="postgresql://u:p@db/orbit").environment == "development"


def test_database_password_is_hidden_in_repr_and_logs():
    settings = make_settings(DATABASE_URL="postgresql://orbit:hunter2@db/orbit")

    assert "hunter2" not in repr(settings)
    assert "hunter2" not in str(settings.model_dump())


def test_session_lifetime_defaults_to_30_days():
    assert make_settings(DATABASE_URL="postgresql://u:p@db/orbit").session_ttl_days == 30


@pytest.mark.parametrize("days", ["0", "366", "soon"])
def test_session_lifetime_must_be_between_1_and_365_days(days):
    with pytest.raises(ValidationError):
        make_settings(DATABASE_URL="postgresql://u:p@db/orbit", ORBIT_SESSION_TTL_DAYS=days)
