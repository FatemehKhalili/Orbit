import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from pydantic import ValidationError
from sqlalchemy import create_engine, inspect

from app.config import Settings, get_settings

API_ROOT = Path(__file__).resolve().parents[1]


def alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


@pytest.fixture
def database_url_from_env(monkeypatch):
    """Point get_settings() at a DATABASE_URL for one test, ignoring any local .env."""

    def use(url: str | None) -> None:
        monkeypatch.chdir(API_ROOT / "tests")  # no .env file here
        if url is None:
            monkeypatch.delenv("DATABASE_URL", raising=False)
        else:
            monkeypatch.setenv("DATABASE_URL", url)
        get_settings.cache_clear()

    yield use
    get_settings.cache_clear()


def test_migrations_form_a_single_chain_starting_at_an_empty_baseline():
    scripts = ScriptDirectory.from_config(alembic_config())
    heads = scripts.get_heads()
    assert len(heads) == 1

    base = scripts.get_base()
    baseline = scripts.get_revision(base)
    assert baseline.down_revision is None
    assert "baseline" in baseline.doc


def test_migrations_refuse_to_run_without_database_url(database_url_from_env):
    database_url_from_env(None)
    with pytest.raises(ValidationError, match="DATABASE_URL"):
        command.upgrade(alembic_config(), "head")


@pytest.mark.integration
@pytest.mark.skipif("TEST_DATABASE_URL" not in os.environ, reason="TEST_DATABASE_URL not set")
def test_migrations_upgrade_downgrade_and_match_the_models(database_url_from_env):
    database_url_from_env(os.environ["TEST_DATABASE_URL"])
    config = alembic_config()
    url = Settings(DATABASE_URL=os.environ["TEST_DATABASE_URL"], _env_file=None).database_url
    engine = create_engine(url.get_secret_value())
    try:
        command.upgrade(config, "head")
        inspector = inspect(engine)
        assert {"alembic_version", "users", "sessions", "shopping_items"} <= set(
            inspector.get_table_names()
        )
        assert {c["name"] for c in inspector.get_unique_constraints("users")} == {
            "uq_users_email",
            "uq_users_is_owner",
        }
        assert [c["name"] for c in inspector.get_check_constraints("users")] == [
            "ck_users_single_owner"
        ]
        assert [fk["name"] for fk in inspector.get_foreign_keys("sessions")] == [
            "fk_sessions_user_id_users"
        ]
        [shopping_fk] = inspector.get_foreign_keys("shopping_items")
        assert shopping_fk["name"] == "fk_shopping_items_owner_id_users"
        assert shopping_fk["options"]["ondelete"] == "CASCADE"
        assert [ix["name"] for ix in inspector.get_indexes("shopping_items")] == [
            "ix_shopping_items_owner_id"
        ]

        # Models and migrations agree: autogenerate would produce no changes.
        command.check(config)

        command.downgrade(config, "base")
        assert inspect(engine).get_table_names() == ["alembic_version"]
        command.upgrade(config, "head")
    finally:
        command.downgrade(config, "base")
        engine.dispose()
