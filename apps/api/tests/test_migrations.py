import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from pydantic import ValidationError
from sqlalchemy import create_engine, inspect, text

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
        assert {
            "alembic_version",
            "users",
            "sessions",
            "shopping_items",
            "habits",
            "habit_check_ins",
            "login_throttles",
            "login_devices",
            "calendar_events",
        } <= set(inspector.get_table_names())
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
        assert {c["name"] for c in inspector.get_unique_constraints("habits")} == {
            "uq_habits_id_owner_id"
        }
        check_in_fks = {fk["name"]: fk for fk in inspector.get_foreign_keys("habit_check_ins")}
        assert set(check_in_fks) == {
            "fk_habit_check_ins_habit_id_owner_id_habits",
            "fk_habit_check_ins_owner_id_users",
        }
        habit_fk = check_in_fks["fk_habit_check_ins_habit_id_owner_id_habits"]
        assert habit_fk["constrained_columns"] == ["habit_id", "owner_id"]
        assert habit_fk["referred_columns"] == ["id", "owner_id"]
        assert habit_fk["options"]["ondelete"] == "CASCADE"
        assert {c["name"] for c in inspector.get_unique_constraints("habit_check_ins")} == {
            "uq_habit_check_ins_habit_id_day"
        }

        assert [c["name"] for c in inspector.get_unique_constraints("login_devices")] == [
            "uq_login_devices_token_hash"
        ]
        [device_fk] = inspector.get_foreign_keys("login_devices")
        assert device_fk["name"] == "fk_login_devices_user_id_users"
        assert device_fk["options"]["ondelete"] == "CASCADE"

        assert {c["name"] for c in inspector.get_check_constraints("calendar_events")} == {
            "ck_calendar_events_shape",
            "ck_calendar_events_end_not_before_start",
        }
        [calendar_fk] = inspector.get_foreign_keys("calendar_events")
        assert calendar_fk["name"] == "fk_calendar_events_owner_id_users"
        assert calendar_fk["options"]["ondelete"] == "CASCADE"
        assert [ix["name"] for ix in inspector.get_indexes("calendar_events")] == [
            "ix_calendar_events_owner_id"
        ]

        # Models and migrations agree: autogenerate would produce no changes.
        command.check(config)

        command.downgrade(config, "base")
        assert inspect(engine).get_table_names() == ["alembic_version"]
        command.upgrade(config, "head")
    finally:
        command.downgrade(config, "base")
        engine.dispose()


@pytest.mark.integration
@pytest.mark.skipif("TEST_DATABASE_URL" not in os.environ, reason="TEST_DATABASE_URL not set")
def test_calendar_migration_is_additive(database_url_from_env):
    """Upgrading from Phase 7's schema keeps every existing row as it was, and going back
    removes only the new table (Phase 8, ADR 0011)."""
    database_url_from_env(os.environ["TEST_DATABASE_URL"])
    config = alembic_config()
    url = Settings(DATABASE_URL=os.environ["TEST_DATABASE_URL"], _env_file=None).database_url
    engine = create_engine(url.get_secret_value())
    tables = ("users", "shopping_items", "habits", "habit_check_ins")

    def snapshot() -> dict[str, list[str]]:
        with engine.connect() as connection:
            return {
                table: sorted(
                    connection.execute(text(f"SELECT t::text FROM {table} AS t")).scalars()
                )
                for table in tables
            }

    try:
        command.downgrade(config, "base")
        command.upgrade(config, "73cc32af0338")
        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO users (id, email, display_name, password_hash, is_owner)"
                    " VALUES (gen_random_uuid(), 'owner@example.com', 'Owner', 'x', true)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO shopping_items (id, owner_id, name)"
                    " SELECT gen_random_uuid(), id, 'Milk' FROM users"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO habits (id, owner_id, name)"
                    " SELECT gen_random_uuid(), id, 'Read' FROM users"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO habit_check_ins (id, owner_id, habit_id, day)"
                    " SELECT gen_random_uuid(), owner_id, id, DATE '2026-10-11' FROM habits"
                )
            )
        before = snapshot()

        command.upgrade(config, "head")
        assert snapshot() == before
        assert "calendar_events" in inspect(engine).get_table_names()

        command.downgrade(config, "73cc32af0338")
        assert snapshot() == before
        assert "calendar_events" not in inspect(engine).get_table_names()
    finally:
        command.downgrade(config, "base")
        engine.dispose()
