"""The owner's data export (ADR 0009, docs/export/README.md)."""

import json
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import insert, select

from app.api.account import EXCLUDED_TABLES, EXPORTED_TABLES, ExportOut, export_json_schema
from app.clock import get_today
from app.models import Base, HabitCheckIn, User
from tests.conftest import OTHER_EMAIL, OTHER_PASSWORD, OWNER_PASSWORD, bearer, login

EXPORT = "/account/export"
SCHEMA_FILE = Path(__file__).resolve().parents[3] / "docs" / "export" / "orbit-export-1.schema.json"
TODAY = date(2026, 10, 11)


def test_the_published_schema_matches_the_code():
    """Regenerate with: (cd apps/api && uv run python -m app.api.account) > docs/export/..."""
    assert json.loads(SCHEMA_FILE.read_text()) == export_json_schema()


def test_every_table_is_either_exported_or_excluded_with_a_reason():
    tables = set(Base.metadata.tables)
    assert not set(EXPORTED_TABLES) & set(EXCLUDED_TABLES)
    assert tables == set(EXPORTED_TABLES) | set(EXCLUDED_TABLES)


@pytest.mark.integration
def test_export_needs_a_session(client):
    assert client.get(EXPORT).status_code == 401


@pytest.fixture
def token(client, owner) -> str:
    client.app.dependency_overrides[get_today] = lambda: TODAY
    return login(client)


def add_item(client, token, **fields):
    response = client.post("/shopping/items", json=fields, headers=bearer(token))
    assert response.status_code == 201, response.text
    return response.json()


def add_habit(client, token, name):
    response = client.post("/habits/habits", json={"name": name}, headers=bearer(token))
    assert response.status_code == 201, response.text
    return response.json()


def add_event(client, token, **fields):
    response = client.post("/calendar/events", json=fields, headers=bearer(token))
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.integration
def test_export_holds_everything_the_owner_has(client, token, owner, session_factory):
    milk = add_item(client, token, name="Milk", quantity="2 l")
    bread = add_item(client, token, name="Bread", notes="Rye")
    client.patch(f"/shopping/items/{bread['id']}", json={"checked": True}, headers=bearer(token))
    reading = add_habit(client, token, "Read")
    running = add_habit(client, token, "Run")
    client.put(f"/habits/habits/{reading['id']}/check-ins/{TODAY}", headers=bearer(token))
    client.patch(f"/habits/habits/{running['id']}", json={"archived": True}, headers=bearer(token))
    # History beyond the seven-day window, which the pages never show.
    with session_factory() as session:
        session.execute(
            insert(HabitCheckIn),
            [
                {"owner_id": owner.id, "habit_id": running["id"], "day": date(2025, 1, 2)},
                {"owner_id": owner.id, "habit_id": reading["id"], "day": date(2026, 9, 1)},
            ],
        )
        session.commit()

    # Events far in the past and the future are all there.
    trip = add_event(
        client,
        token,
        title="Trip",
        notes="Pack light",
        when={"all_day": True, "start_day": "2026-10-20", "end_day": "2026-10-23"},
    )
    dentist = add_event(
        client,
        token,
        title="Dentist",
        when={"all_day": False, "start_day": "2025-03-01", "start_time": "09:00"},
    )

    response = client.get(EXPORT, headers=bearer(token))

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["content-disposition"] == (
        'attachment; filename="orbit-export-2026-10-11.json"'
    )
    body = response.json()
    ExportOut.model_validate(body)  # the shape the schema publishes, nothing extra
    assert body["format"] == "orbit-export"
    assert body["format_version"] == "1.1"
    assert body["timezone"] == "UTC"
    assert abs(datetime.fromisoformat(body["exported_at"]) - datetime.now(UTC)) < timedelta(
        minutes=1
    )
    assert set(body["account"]) == {"email", "display_name", "created_at"}
    assert body["account"]["email"] == owner.email

    assert [(i["id"], i["name"], i["checked"]) for i in body["shopping"]["items"]] == [
        (milk["id"], "Milk", False),
        (bread["id"], "Bread", True),
    ]
    assert body["shopping"]["items"][0]["quantity"] == "2 l"

    habits = {h["name"]: h for h in body["habits"]["habits"]}
    assert [h["name"] for h in body["habits"]["habits"]] == ["Read", "Run"]
    assert habits["Read"]["archived_at"] is None
    assert habits["Run"]["archived_at"] is not None
    assert [c["day"] for c in habits["Read"]["check_ins"]] == ["2026-09-01", "2026-10-11"]
    assert [c["day"] for c in habits["Run"]["check_ins"]] == ["2025-01-02"]

    assert body["calendar"]["events"] == [
        {
            "id": trip["id"],
            "title": "Trip",
            "notes": "Pack light",
            "all_day": True,
            "start_day": "2026-10-20",
            "end_day": "2026-10-23",
            "starts_at": None,
            "ends_at": None,
            "created_at": trip["created_at"],
            "updated_at": trip["updated_at"],
        },
        {
            "id": dentist["id"],
            "title": "Dentist",
            "notes": None,
            "all_day": False,
            "start_day": None,
            "end_day": None,
            "starts_at": "2025-03-01T09:00:00Z",
            "ends_at": "2025-03-01T09:00:00Z",
            "created_at": dentist["created_at"],
            "updated_at": dentist["updated_at"],
        },
    ]


@pytest.mark.integration
def test_export_of_a_new_owner_is_empty_but_complete(client, token):
    body = client.get(EXPORT, headers=bearer(token)).json()
    assert body["shopping"] == {"items": []}
    assert body["habits"] == {"habits": []}
    assert body["calendar"] == {"events": []}


@pytest.mark.integration
def test_export_holds_no_authentication_secrets(client, token, owner, session_factory):
    device_token = client.post(
        "/auth/login", json={"email": owner.email, "password": OWNER_PASSWORD}
    ).json()["device_token"]
    add_item(client, token, name="Milk")

    text = client.get(EXPORT, headers=bearer(token)).text

    with session_factory() as session:
        password_hash = session.scalar(select(User.password_hash))
    for secret in [OWNER_PASSWORD, password_hash, token, device_token]:
        assert secret not in text
    for field in ["password", "hash", "token", "session", "device", "owner_id"]:
        assert field not in text.lower()


@pytest.mark.integration
def test_export_never_includes_another_users_data(two_users_client):
    client = two_users_client
    owner_token = login(client)
    other_token = login(client, email=OTHER_EMAIL, password=OTHER_PASSWORD)
    add_item(client, owner_token, name="Owner milk")
    add_item(client, other_token, name="Other bread")
    add_habit(client, owner_token, "Owner reading")
    other_habit = add_habit(client, other_token, "Other running")
    when = {"all_day": True, "start_day": "2026-10-14"}
    add_event(client, owner_token, title="Owner trip", when=when)
    add_event(client, other_token, title="Other trip", when=when)
    client.put(
        f"/habits/habits/{other_habit['id']}/check-ins/{date.today()}",
        headers=bearer(other_token),
    )

    owner_text = client.get(EXPORT, headers=bearer(owner_token)).text
    other_text = client.get(EXPORT, headers=bearer(other_token)).text

    assert "Owner milk" in owner_text and "Owner reading" in owner_text
    assert "Owner trip" in owner_text
    assert "Other" not in owner_text and OTHER_EMAIL not in owner_text
    assert "Owner" not in other_text
    other_body = client.get(EXPORT, headers=bearer(other_token)).json()
    assert len(other_body["habits"]["habits"][0]["check_ins"]) <= 1
