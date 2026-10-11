from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from app import clock
from app.config import Settings
from app.main import create_app
from tests.conftest import bearer, login

# 23:30 UTC on 9 October is already 10 October in Berlin (UTC+2 in October).
LATE_EVENING_UTC = datetime(2026, 10, 9, 23, 30, tzinfo=UTC)


def test_today_is_the_date_in_the_given_zone():
    assert clock.today_in(ZoneInfo("UTC"), LATE_EVENING_UTC) == date(2026, 10, 9)
    assert clock.today_in(ZoneInfo("Europe/Berlin"), LATE_EVENING_UTC) == date(2026, 10, 10)
    assert clock.today_in(ZoneInfo("America/Los_Angeles"), LATE_EVENING_UTC) == date(2026, 10, 9)


def test_the_app_keeps_the_configured_zone(settings):
    berlin = settings.model_copy(update={"timezone": "Europe/Berlin"})

    assert create_app(berlin).state.timezone == ZoneInfo("Europe/Berlin")
    assert create_app(settings).state.timezone == ZoneInfo("UTC")


@pytest.mark.integration
@pytest.mark.parametrize(
    ("zone", "today"),
    [("UTC", "2026-10-09"), ("Europe/Berlin", "2026-10-10"), ("Pacific/Kiritimati", "2026-10-10")],
)
def test_time_reports_the_instance_zone_and_its_date(db_settings, owner, monkeypatch, zone, today):
    monkeypatch.setattr(clock, "utc_now", lambda: LATE_EVENING_UTC)
    zoned: Settings = db_settings.model_copy(update={"timezone": zone})
    with TestClient(create_app(zoned)) as client:
        response = client.get("/time", headers=bearer(login(client)))

    assert response.status_code == 200
    assert response.json() == {"timezone": zone, "today": today}


@pytest.mark.integration
def test_time_needs_a_signed_in_user(client):
    assert client.get("/time").status_code == 401


@pytest.mark.integration
@pytest.mark.parametrize(
    ("zone", "newest", "too_new"),
    [("UTC", "2026-10-09", "2026-10-10"), ("Europe/Berlin", "2026-10-10", "2026-10-11")],
)
def test_the_check_in_window_follows_the_instance_zone(
    db_settings, owner, monkeypatch, zone, newest, too_new
):
    monkeypatch.setattr(clock, "utc_now", lambda: LATE_EVENING_UTC)
    zoned: Settings = db_settings.model_copy(update={"timezone": zone})
    with TestClient(create_app(zoned)) as client:
        headers = bearer(login(client))
        habit = client.post("/habits/habits", json={"name": "Read"}, headers=headers).json()
        url = f"/habits/habits/{habit['id']}/check-ins"

        assert client.put(f"{url}/{newest}", headers=headers).status_code == 204
        assert client.put(f"{url}/{too_new}", headers=headers).status_code == 422
