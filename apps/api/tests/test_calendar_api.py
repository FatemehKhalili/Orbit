import ast
import uuid
from datetime import date, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import event, text
from sqlalchemy.exc import IntegrityError

from app.models import CalendarEvent
from tests.conftest import OTHER_EMAIL, OTHER_PASSWORD, bearer, login

pytestmark = pytest.mark.integration

EVENTS = "/calendar/events"
NOT_FOUND = {"detail": "Event not found"}
BERLIN = "Europe/Berlin"

D = date(2026, 10, 14)


def event_url(event_id: str | uuid.UUID) -> str:
    return f"{EVENTS}/{event_id}"


def use_zone(client, name: str) -> None:
    client.app.state.timezone = ZoneInfo(name)


def all_day(start: date | str = D, end: date | str | None = None) -> dict:
    return {"all_day": True, "start_day": str(start), "end_day": None if end is None else str(end)}


def timed(
    start: date | str = D,
    at: str = "09:00",
    end: date | str | None = None,
    until: str | None = None,
) -> dict:
    return {
        "all_day": False,
        "start_day": str(start),
        "start_time": at,
        "end_day": None if end is None else str(end),
        "end_time": until,
    }


def add(client, token: str, title: str = "Dentist", when: dict | None = None, **fields) -> dict:
    response = client.post(
        EVENTS, json={"title": title, "when": when or timed(), **fields}, headers=bearer(token)
    )
    assert response.status_code == 201, response.text
    return response.json()


def listed(client, token: str, first: date, last: date) -> list[dict]:
    response = client.get(
        EVENTS, params={"from": str(first), "to": str(last)}, headers=bearer(token)
    )
    assert response.status_code == 200, response.text
    return response.json()


def titles(client, token: str, first: date, last: date | None = None) -> list[str]:
    return [event["title"] for event in listed(client, token, first, last or first)]


@pytest.fixture
def token(client, owner) -> str:
    use_zone(client, BERLIN)
    return login(client)


# --- Authentication ---------------------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", f"{EVENTS}?from=2026-10-14&to=2026-10-14"),
        ("POST", EVENTS),
        ("GET", event_url(uuid.uuid4())),
        ("PATCH", event_url(uuid.uuid4())),
        ("DELETE", event_url(uuid.uuid4())),
    ],
)
def test_every_route_needs_a_session(client, owner, method, path):
    assert client.request(method, path, json={}).status_code == 401


# --- Create and read --------------------------------------------------------------------


def test_add_a_timed_event(client, token):
    created = add(client, token, "Dentist", timed(D, "09:00", D, "10:15"), notes=" Bring card ")

    assert created == {
        "id": created["id"],
        "title": "Dentist",
        "notes": "Bring card",
        "all_day": False,
        "start_day": "2026-10-14",
        "start_time": "09:00",
        "end_day": "2026-10-14",
        "end_time": "10:15",
        # Berlin is UTC+2 in October: stored and returned as instants (ADR 0011).
        "starts_at": "2026-10-14T07:00:00Z",
        "ends_at": "2026-10-14T08:15:00Z",
        "first_day": "2026-10-14",
        "last_day": "2026-10-14",
        "created_at": created["created_at"],
        "updated_at": created["updated_at"],
    }
    assert client.get(event_url(created["id"]), headers=bearer(token)).json() == created


def test_a_timed_event_without_an_end_time_is_a_point_in_time(client, token):
    created = add(client, token, when=timed(D, "09:00"))
    assert created["starts_at"] == created["ends_at"] == "2026-10-14T07:00:00Z"
    assert (created["end_day"], created["end_time"]) == ("2026-10-14", "09:00")


def test_a_timed_event_may_cross_midnight(client, token):
    created = add(client, token, "Night flight", timed(D, "22:30", D + timedelta(days=1), "06:10"))
    assert (created["first_day"], created["last_day"]) == ("2026-10-14", "2026-10-15")
    assert (created["end_day"], created["end_time"]) == ("2026-10-15", "06:10")


def test_add_an_all_day_event(client, token):
    one = add(client, token, "Holiday", all_day(D))
    assert (one["start_day"], one["end_day"], one["first_day"], one["last_day"]) == (
        "2026-10-14",
        "2026-10-14",
        "2026-10-14",
        "2026-10-14",
    )
    assert one["start_time"] is None and one["end_time"] is None
    assert one["starts_at"] is None and one["ends_at"] is None

    trip = add(client, token, "Trip", all_day(D, D + timedelta(days=3)))
    assert (trip["first_day"], trip["last_day"]) == ("2026-10-14", "2026-10-17")


def test_ids_are_orbit_uuids(client, token):
    created = add(client, token)
    assert uuid.UUID(created["id"]).version == 4


@pytest.mark.parametrize(
    ("body", "fragment"),
    [
        ({"title": "", "when": timed()}, "at least 1 character"),
        ({"title": "   ", "when": timed()}, "at least 1 character"),
        ({"title": "x" * 201, "when": timed()}, "at most 200 characters"),
        ({"title": "a\x00b", "when": timed()}, "NUL"),
        ({"title": "Ok", "notes": "x" * 8001, "when": timed()}, "at most 8000 characters"),
        ({"title": "Ok"}, "Field required"),
        ({"title": "Ok", "when": timed(), "owner_id": str(uuid.uuid4())}, "Extra inputs"),
        ({"title": "Ok", "when": {**timed(), "starts_at": "2026-10-14T07:00:00Z"}}, "Extra"),
        # Mixed shapes.
        ({"title": "Ok", "when": {**all_day(), "start_time": "09:00"}}, "Extra inputs"),
        ({"title": "Ok", "when": {"all_day": False, "start_day": "2026-10-14"}}, "required"),
        ({"title": "Ok", "when": {"start_day": "2026-10-14"}}, "all_day"),
        # Days and times in their only accepted form.
        ({"title": "Ok", "when": timed(at="9:00")}, "pattern"),
        ({"title": "Ok", "when": timed(at="24:00")}, "pattern"),
        ({"title": "Ok", "when": timed(at="09:00:00")}, "pattern"),
        ({"title": "Ok", "when": {**timed(), "start_day": 20261014}}, "YYYY-MM-DD"),
        ({"title": "Ok", "when": timed(start="2026-10-14T09:00")}, "YYYY-MM-DD"),
        ({"title": "Ok", "when": timed(start="2026-02-30")}, "date"),
    ],
)
def test_invalid_input_is_refused(client, token, body, fragment):
    response = client.post(EVENTS, json=body, headers=bearer(token))
    assert response.status_code == 422
    assert fragment in response.text


@pytest.mark.parametrize(
    ("when", "message"),
    [
        (all_day(D, D - timedelta(days=1)), "The end must not be before the start."),
        (timed(D, "09:00", D, "08:59"), "The end must not be before the start."),
        (
            timed(D, "09:00", D - timedelta(days=1), "10:00"),
            "The end must not be before the start.",
        ),
        (all_day(D, D + timedelta(days=366)), "An event can last at most 366 days."),
        (
            timed(D, "09:00", D + timedelta(days=366), "09:01"),
            "An event can last at most 366 days.",
        ),
        (
            timed(D, "09:00", D + timedelta(days=1)),
            "Give an end time with the end day, or leave both empty.",
        ),
        # Berlin moves its clocks from 02:00 to 03:00 on 29 March 2026.
        (
            timed("2026-03-29", "02:30"),
            "This time does not exist on that day because the clocks change. Choose another time.",
        ),
        (
            timed("2026-03-28", "22:00", "2026-03-29", "02:15"),
            "This time does not exist on that day because the clocks change. Choose another time.",
        ),
    ],
)
def test_impossible_times_are_refused_with_a_message(client, token, when, message):
    response = client.post(EVENTS, json={"title": "Ok", "when": when}, headers=bearer(token))
    assert response.status_code == 422
    assert response.json() == {"detail": message}


def test_the_longest_spans_are_allowed(client, token):
    add(client, token, when=all_day(D, D + timedelta(days=365)))
    add(client, token, when=timed(D, "09:00", D + timedelta(days=366), "09:00"))


def test_a_repeated_local_time_means_the_first(client, token):
    # Berlin's clocks go back from 03:00 to 02:00 on 25 October 2026.
    created = add(client, token, when=timed("2026-10-25", "02:30"))
    assert created["starts_at"] == "2026-10-25T00:30:00Z"


def test_times_follow_the_instance_timezone(client, token):
    use_zone(client, "UTC")
    created = add(client, token, when=timed(D, "09:00"))
    assert created["starts_at"] == "2026-10-14T09:00:00Z"

    # Changing ORBIT_TIMEZONE keeps the instant and shows it at the new local time.
    use_zone(client, "America/New_York")
    shown = client.get(event_url(created["id"]), headers=bearer(token)).json()
    assert (shown["start_day"], shown["start_time"]) == ("2026-10-14", "05:00")
    assert shown["starts_at"] == created["starts_at"]


def test_all_day_events_keep_their_days_in_any_zone(client, token):
    created = add(client, token, when=all_day(D))
    use_zone(client, "Pacific/Kiritimati")
    shown = client.get(event_url(created["id"]), headers=bearer(token)).json()
    assert (shown["first_day"], shown["last_day"]) == ("2026-10-14", "2026-10-14")


# --- Update -------------------------------------------------------------------------------


def test_update_changes_only_the_fields_sent(client, token):
    created = add(client, token, "Dentist", timed(D, "09:00"), notes="Bring card")

    response = client.patch(
        event_url(created["id"]), json={"title": "Doctor"}, headers=bearer(token)
    )

    assert response.status_code == 200
    updated = response.json()
    assert updated["title"] == "Doctor"
    assert updated["notes"] == "Bring card"
    assert updated["starts_at"] == created["starts_at"]
    assert updated["updated_at"] > created["updated_at"]
    assert updated["created_at"] == created["created_at"]


def test_update_clears_notes_with_null_or_blank(client, token):
    created = add(client, token, notes="Something")
    for notes in (None, "   "):
        response = client.patch(
            event_url(created["id"]), json={"notes": notes}, headers=bearer(token)
        )
        assert response.json()["notes"] is None


def test_an_empty_update_changes_nothing(client, token):
    created = add(client, token)
    response = client.patch(event_url(created["id"]), json={}, headers=bearer(token))
    assert response.json() == created


@pytest.mark.parametrize("field", ["title", "when"])
def test_title_and_when_cannot_be_null(client, token, field):
    created = add(client, token)
    response = client.patch(event_url(created["id"]), json={field: None}, headers=bearer(token))
    assert response.status_code == 422


def test_switch_between_all_day_and_timed(client, token):
    created = add(client, token, when=timed(D, "09:00", D, "10:00"))

    to_all_day = client.patch(
        event_url(created["id"]),
        json={"when": all_day(D, D + timedelta(days=1))},
        headers=bearer(token),
    ).json()
    assert to_all_day["all_day"] is True
    assert (to_all_day["start_day"], to_all_day["end_day"]) == ("2026-10-14", "2026-10-15")
    assert to_all_day["starts_at"] is None and to_all_day["start_time"] is None

    back = client.patch(
        event_url(created["id"]), json={"when": timed(D, "18:00")}, headers=bearer(token)
    ).json()
    assert back["all_day"] is False
    assert back["starts_at"] == back["ends_at"] == "2026-10-14T16:00:00Z"
    assert (back["first_day"], back["last_day"]) == ("2026-10-14", "2026-10-14")


def test_update_refuses_impossible_times(client, token):
    created = add(client, token)
    response = client.patch(
        event_url(created["id"]),
        json={"when": timed(D, "10:00", D, "09:00")},
        headers=bearer(token),
    )
    assert response.status_code == 422
    assert client.get(event_url(created["id"]), headers=bearer(token)).json() == created


def test_edit_of_an_event_deleted_at_the_same_moment_is_not_found(client, token, db_engine):
    created = add(client, token)

    # Another request deletes the event just before the edit's UPDATE reaches the database.
    def delete_first(conn, cursor, statement, parameters, context, executemany):
        if statement.startswith("UPDATE calendar_events"):
            with db_engine.begin() as other:
                other.execute(
                    text("DELETE FROM calendar_events WHERE id = :id"), {"id": created["id"]}
                )

    app_engine = client.app.state.engine
    event.listen(app_engine, "before_cursor_execute", delete_first)
    try:
        response = client.patch(
            event_url(created["id"]), json={"title": "Late"}, headers=bearer(token)
        )
    finally:
        event.remove(app_engine, "before_cursor_execute", delete_first)

    assert response.status_code == 404
    assert response.json() == NOT_FOUND


# --- Delete -------------------------------------------------------------------------------


def test_delete_an_event(client, token):
    kept = add(client, token, "Kept")
    gone = add(client, token, "Gone")

    response = client.delete(event_url(gone["id"]), headers=bearer(token))

    assert response.status_code == 204
    assert response.content == b""
    assert client.get(event_url(gone["id"]), headers=bearer(token)).status_code == 404
    assert titles(client, token, D) == ["Kept"]
    assert client.delete(event_url(gone["id"]), headers=bearer(token)).json() == NOT_FOUND
    assert kept["id"]


@pytest.mark.parametrize("method", ["GET", "PATCH", "DELETE"])
def test_unknown_events_are_not_found(client, token, method):
    response = client.request(method, event_url(uuid.uuid4()), json={}, headers=bearer(token))
    assert response.status_code == 404
    assert response.json() == NOT_FOUND


def test_a_malformed_id_is_refused(client, token):
    assert client.get(event_url("not-a-uuid"), headers=bearer(token)).status_code == 422


# --- Range ----------------------------------------------------------------------------------


def test_the_range_lists_events_on_any_of_its_days(client, token):
    before = D - timedelta(days=1)
    after = D + timedelta(days=1)
    add(client, token, "Yesterday", timed(before, "12:00"))
    add(client, token, "Today", timed(D, "12:00"))
    add(client, token, "Tomorrow", timed(after, "12:00"))
    add(client, token, "Trip", all_day(before, after))

    assert titles(client, token, D) == ["Trip", "Today"]
    assert titles(client, token, before, after) == ["Trip", "Yesterday", "Today", "Tomorrow"]
    assert titles(client, token, D + timedelta(days=2)) == []


def test_the_range_edges_follow_the_day_rule(client, token):
    after = D + timedelta(days=1)
    # Ends exactly at midnight: on D only.
    add(client, token, "Until midnight", timed(D, "22:00", after, "00:00"))
    # Crosses midnight: on both days.
    add(client, token, "Night flight", timed(D, "22:30", after, "06:10"))
    # A point in time at midnight: on the next day only.
    add(client, token, "Midnight", timed(after, "00:00"))
    # Ends exactly when D begins: not on D.
    add(client, token, "Before", timed(D - timedelta(days=1), "23:00", D, "00:00"))

    assert titles(client, token, D) == ["Until midnight", "Night flight"]
    # By start: the flight began the evening before.
    assert titles(client, token, after) == ["Night flight", "Midnight"]
    assert titles(client, token, D - timedelta(days=1)) == ["Before"]


def test_the_range_uses_local_days_on_clock_change_days(client, token):
    spring = date(2026, 3, 29)  # 23 hours in Berlin
    add(client, token, "Late", timed(spring, "23:30"))
    add(client, token, "Early next day", timed(spring + timedelta(days=1), "00:30"))
    assert titles(client, token, spring) == ["Late"]

    autumn = date(2026, 10, 25)  # 25 hours in Berlin
    add(client, token, "Twice", timed(autumn, "02:30"))
    add(client, token, "Last minute", timed(autumn, "23:59"))
    assert titles(client, token, autumn) == ["Twice", "Last minute"]


def test_the_range_is_in_agenda_order(client, token):
    add(client, token, "B lunch", timed(D, "12:00"))
    add(client, token, "Early", timed(D, "07:00"))
    add(client, token, "A lunch", timed(D, "12:00"))
    add(client, token, "Trip", all_day(D - timedelta(days=2), D))
    add(client, token, "Holiday", all_day(D))
    add(client, token, "Running late", timed(D - timedelta(days=1), "23:00", D, "08:00"))

    assert titles(client, token, D) == [
        "Trip",
        "Holiday",
        "Running late",
        "Early",
        "A lunch",
        "B lunch",
    ]


@pytest.mark.parametrize(
    ("params", "detail"),
    [
        ({"from": "2026-10-14", "to": "2026-10-13"}, "`to` must not be before `from`."),
        ({"from": "2026-10-01", "to": "2026-12-02"}, "Ask for at most 62 days at a time."),
    ],
)
def test_the_range_is_bounded(client, token, params, detail):
    response = client.get(EVENTS, params=params, headers=bearer(token))
    assert response.status_code == 422
    assert response.json() == {"detail": detail}


def test_the_longest_range_is_allowed(client, token):
    first = date(2026, 10, 1)
    assert listed(client, token, first, first + timedelta(days=61)) == []


@pytest.mark.parametrize(
    "params",
    [{}, {"from": "2026-10-14"}, {"to": "2026-10-14"}, {"from": "soon", "to": "2026-10-14"}],
)
def test_the_range_needs_two_dates(client, token, params):
    assert client.get(EVENTS, params=params, headers=bearer(token)).status_code == 422


# --- Database rules -----------------------------------------------------------------------


def _insert(session_factory, owner_id, **columns):
    with session_factory() as session:
        session.add(CalendarEvent(owner_id=owner_id, title="Direct", **columns))
        session.commit()


@pytest.mark.parametrize(
    "columns",
    [
        # Mixed or missing shapes.
        {
            "all_day": True,
            "start_day": D,
            "end_day": D,
            "starts_at": "2026-10-14T07:00Z",
            "ends_at": "2026-10-14T07:00Z",
        },
        {"all_day": True, "start_day": D},
        {
            "all_day": False,
            "starts_at": "2026-10-14T07:00Z",
            "ends_at": "2026-10-14T08:00Z",
            "start_day": D,
            "end_day": D,
        },
        {"all_day": False, "starts_at": "2026-10-14T07:00Z"},
        # The end before the start.
        {"all_day": True, "start_day": D, "end_day": D - timedelta(days=1)},
        {"all_day": False, "starts_at": "2026-10-14T08:00Z", "ends_at": "2026-10-14T07:59Z"},
    ],
)
def test_the_database_refuses_broken_rows(session_factory, owner, columns):
    with pytest.raises(IntegrityError):
        _insert(session_factory, owner.id, **columns)


def test_the_database_keeps_only_shape_and_order_rules(session_factory, owner):
    """The span limit and a non-blank title guard the forms only (ADR 0011), so events
    from elsewhere (Phase 9) are never refused for them."""
    _insert(
        session_factory,
        owner.id,
        all_day=False,
        starts_at="2026-10-14T07:00Z",
        ends_at="2026-10-14T07:00Z",
    )
    _insert(session_factory, owner.id, all_day=True, start_day=D, end_day=D + timedelta(days=400))
    with session_factory() as session:
        session.add(
            CalendarEvent(owner_id=owner.id, title="", all_day=True, start_day=D, end_day=D)
        )
        session.commit()


# --- Ownership ------------------------------------------------------------------------------


def test_another_users_events_are_not_found(two_users_client):
    client = two_users_client
    use_zone(client, BERLIN)
    owner_token = login(client)
    other_token = login(client, OTHER_EMAIL, OTHER_PASSWORD)
    mine = add(client, owner_token, "Mine", timed(D, "09:00"))
    theirs = add(client, other_token, "Theirs", timed(D, "09:00"))

    for method, body in [("GET", None), ("PATCH", {"title": "Taken"}), ("DELETE", None)]:
        response = client.request(
            method, event_url(theirs["id"]), json=body, headers=bearer(owner_token)
        )
        assert response.status_code == 404
        assert response.json() == NOT_FOUND

    assert titles(client, owner_token, D) == ["Mine"]
    assert titles(client, other_token, D) == ["Theirs"]
    assert client.get(event_url(theirs["id"]), headers=bearer(other_token)).json() == theirs
    assert mine["id"] != theirs["id"]


# --- One write path (ADR 0011) ----------------------------------------------------------------


def test_the_router_never_writes_to_the_database_itself():
    """Every write goes through app/calendar/service.py, so later behaviour (Google sync,
    ADR 0012) attaches in one place."""
    source = Path(__file__).resolve().parents[1] / "app" / "api" / "calendar.py"
    imported = {
        alias.name
        for node in ast.walk(ast.parse(source.read_text()))
        if isinstance(node, ast.ImportFrom) and (node.module or "").startswith("sqlalchemy")
        for alias in node.names
    }
    assert imported == set()
    assert "session.add" not in source.read_text()
    assert "session.commit" not in source.read_text()
