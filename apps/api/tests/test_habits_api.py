import uuid
from datetime import date, timedelta

import pytest
from sqlalchemy import event, func, select, text

from app.clock import get_today
from app.models import HabitCheckIn
from tests.conftest import OTHER_EMAIL, OTHER_PASSWORD, bearer, login

pytestmark = pytest.mark.integration

HABITS = "/habits/habits"
NOT_FOUND = {"detail": "Habit not found"}
ARCHIVED = {"detail": "This habit is archived and read-only. Unarchive it to change it."}
ACTIVE = {"detail": "Only archived habits can be deleted. Archive the habit first."}
OUTSIDE_WINDOW = {"detail": "Only today and the 6 days before can be changed."}

# Every test runs on a fixed "today", whatever the real date is (ADR 0008).
TODAY = date(2026, 10, 11)
FIRST_DAY = TODAY - timedelta(days=6)


def habit_url(habit_id: str | uuid.UUID) -> str:
    return f"{HABITS}/{habit_id}"


def check_in_url(habit_id: str | uuid.UUID, day: date | str) -> str:
    return f"{HABITS}/{habit_id}/check-ins/{day}"


def pin_today(client, day: date = TODAY) -> None:
    client.app.dependency_overrides[get_today] = lambda: day


def add(client, token: str, **fields) -> dict:
    response = client.post(HABITS, json={"name": "Read", **fields}, headers=bearer(token))
    assert response.status_code == 201, response.text
    return response.json()


def archive(client, token: str, habit: dict) -> dict:
    response = client.patch(habit_url(habit["id"]), json={"archived": True}, headers=bearer(token))
    assert response.status_code == 200, response.text
    return response.json()


def check(client, token: str, habit: dict, day: date = TODAY):
    return client.put(check_in_url(habit["id"], day), headers=bearer(token))


def get(client, token: str, habit: dict) -> dict:
    return client.get(habit_url(habit["id"]), headers=bearer(token)).json()


@pytest.fixture
def token(client, owner) -> str:
    pin_today(client)
    return login(client)


# --- Authentication ------------------------------------------------------------------

ALL_OPERATIONS = [
    ("GET", HABITS),
    ("POST", HABITS),
    ("GET", habit_url(uuid.uuid4())),
    ("PATCH", habit_url(uuid.uuid4())),
    ("DELETE", habit_url(uuid.uuid4())),
    ("PUT", check_in_url(uuid.uuid4(), TODAY)),
    ("DELETE", check_in_url(uuid.uuid4(), TODAY)),
    ("GET", "/time"),
]


@pytest.mark.parametrize(("method", "url"), ALL_OPERATIONS)
@pytest.mark.parametrize("headers", [{}, bearer("not-a-real-token")], ids=["none", "bogus"])
def test_unauthenticated_requests_are_refused(client, owner, method, url, headers):
    response = client.request(method, url, json={"name": "Read"}, headers=headers)

    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}


# --- Habits ----------------------------------------------------------------------------


def test_list_is_empty_to_begin_with(client, token):
    response = client.get(HABITS, headers=bearer(token))

    assert response.status_code == 200
    assert response.json() == []


def test_add_a_habit(client, token):
    habit = add(client, token, name="  Read  ", notes="  20 pages  ")

    assert habit["name"] == "Read"
    assert habit["notes"] == "20 pages"
    assert habit["archived"] is False
    assert habit["archived_at"] is None
    assert habit["check_ins"] == []
    uuid.UUID(habit["id"])
    assert client.get(HABITS, headers=bearer(token)).json() == [habit]


def test_blank_notes_are_stored_as_null(client, token):
    assert add(client, token, notes="   ")["notes"] is None


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"name": ""},
        {"name": "   "},
        {"name": None},
        {"name": "x" * 101},
        {"name": "Read", "notes": "x" * 1001},
        {"name": "Re\x00ad"},
        {"name": "Read", "notes": "\x00"},
        {"name": "Read", "archived": True},
        {"name": "Read", "owner_id": str(uuid.uuid4())},
        {"name": "Read", "check_ins": [str(TODAY)]},
        {"name": "Read", "archived_at": "2026-10-01T00:00:00Z"},
    ],
    ids=[
        "missing-name",
        "empty-name",
        "blank-name",
        "null-name",
        "long-name",
        "long-notes",
        "nul-name",
        "nul-notes",
        "archived-on-create",
        "owner",
        "check-ins",
        "archived-at",
    ],
)
def test_invalid_habits_are_refused(client, token, body):
    response = client.post(HABITS, json=body, headers=bearer(token))

    assert response.status_code == 422
    assert client.get(HABITS, headers=bearer(token)).json() == []


def test_longest_allowed_values_and_emoji_are_accepted(client, token):
    habit = add(client, token, name="🏃" * 100, notes="x" * 1000)

    assert habit["name"] == "🏃" * 100


def test_list_shows_active_habits_oldest_first(client, token):
    names = ["Read", "Run", "Stretch"]
    for name in names:
        add(client, token, name=name)

    assert [h["name"] for h in client.get(HABITS, headers=bearer(token)).json()] == names


def test_edit_changes_only_the_fields_sent(client, token):
    habit = add(client, token, name="Read", notes="20 pages")

    response = client.patch(
        habit_url(habit["id"]), json={"name": "Read more"}, headers=bearer(token)
    )

    assert response.status_code == 200
    edited = response.json()
    assert (edited["name"], edited["notes"]) == ("Read more", "20 pages")
    assert edited["updated_at"] > habit["updated_at"]
    assert get(client, token, habit) == edited


def test_edit_clears_notes_with_null_or_blank(client, token):
    habit = add(client, token, notes="20 pages")

    assert (
        client.patch(habit_url(habit["id"]), json={"notes": None}, headers=bearer(token)).json()[
            "notes"
        ]
        is None
    )
    client.patch(habit_url(habit["id"]), json={"notes": "x"}, headers=bearer(token))
    assert (
        client.patch(habit_url(habit["id"]), json={"notes": "  "}, headers=bearer(token)).json()[
            "notes"
        ]
        is None
    )


def test_empty_edit_changes_nothing(client, token):
    habit = add(client, token)

    response = client.patch(habit_url(habit["id"]), json={}, headers=bearer(token))

    assert response.status_code == 200
    assert response.json() == habit


@pytest.mark.parametrize(
    "body",
    [
        {"name": None},
        {"name": " "},
        {"name": "x" * 101},
        {"name": "Re\x00ad"},
        {"archived": None},
        {"archived": "maybe"},
        {"owner_id": str(uuid.uuid4())},
        {"archived_at": None},
    ],
    ids=[
        "null-name",
        "blank-name",
        "long-name",
        "nul",
        "null-archived",
        "bad-archived",
        "owner",
        "ts",
    ],
)
def test_invalid_edits_are_refused_and_change_nothing(client, token, body):
    habit = add(client, token)

    response = client.patch(habit_url(habit["id"]), json=body, headers=bearer(token))

    assert response.status_code == 422
    assert get(client, token, habit) == habit


@pytest.mark.parametrize("method", ["GET", "PATCH", "DELETE"])
def test_unknown_habits_are_not_found(client, token, method):
    response = client.request(
        method, habit_url(uuid.uuid4()), json={"name": "x"}, headers=bearer(token)
    )

    assert response.status_code == 404
    assert response.json() == NOT_FOUND


@pytest.mark.parametrize("method", ["GET", "PATCH", "DELETE"])
def test_malformed_ids_are_refused(client, token, method):
    response = client.request(method, habit_url("not-a-uuid"), json={}, headers=bearer(token))

    assert response.status_code == 422


# --- Archive and delete ----------------------------------------------------------------


def test_archive_moves_a_habit_to_the_archived_list_and_keeps_its_history(client, token):
    kept = add(client, token, name="Run")
    habit = add(client, token, name="Read")
    check(client, token, habit)

    archived = archive(client, token, habit)

    assert archived["archived"] is True
    assert archived["archived_at"] is not None
    assert archived["check_ins"] == [str(TODAY)]
    assert [h["id"] for h in client.get(HABITS, headers=bearer(token)).json()] == [kept["id"]]
    assert client.get(HABITS, params={"archived": True}, headers=bearer(token)).json() == [archived]


def test_archiving_twice_keeps_the_first_time(client, token):
    habit = add(client, token)
    first = archive(client, token, habit)

    again = archive(client, token, habit)

    assert again["archived_at"] == first["archived_at"]


def test_unarchive_returns_a_habit_with_its_history(client, token):
    habit = add(client, token)
    check(client, token, habit)
    archive(client, token, habit)

    response = client.patch(habit_url(habit["id"]), json={"archived": False}, headers=bearer(token))

    assert response.status_code == 200
    assert response.json()["archived"] is False
    assert response.json()["archived_at"] is None
    assert response.json()["check_ins"] == [str(TODAY)]
    assert [h["id"] for h in client.get(HABITS, headers=bearer(token)).json()] == [habit["id"]]


def test_archived_list_shows_most_recently_archived_first(client, token):
    first, second = add(client, token, name="Read"), add(client, token, name="Run")
    archive(client, token, first)
    archive(client, token, second)

    listed = client.get(HABITS, params={"archived": "true"}, headers=bearer(token)).json()

    assert [h["name"] for h in listed] == ["Run", "Read"]


@pytest.mark.parametrize(
    "body",
    [{"name": "Renamed"}, {"notes": "New"}, {"notes": None}, {"archived": False, "name": "x"}],
)
def test_an_archived_habit_is_read_only(client, token, body):
    habit = archive(client, token, add(client, token, notes="Old"))

    response = client.patch(habit_url(habit["id"]), json=body, headers=bearer(token))

    assert response.status_code == 409
    assert response.json() == ARCHIVED
    assert get(client, token, habit) == habit


def test_an_active_habit_can_be_renamed_and_archived_at_once(client, token):
    habit = add(client, token)

    edited = client.patch(
        habit_url(habit["id"]), json={"name": "Read daily", "archived": True}, headers=bearer(token)
    ).json()

    assert (edited["name"], edited["archived"]) == ("Read daily", True)


def test_an_active_habit_cannot_be_deleted(client, token):
    habit = add(client, token)

    response = client.delete(habit_url(habit["id"]), headers=bearer(token))

    assert response.status_code == 409
    assert response.json() == ACTIVE
    assert get(client, token, habit) == habit


def test_deleting_an_archived_habit_removes_it_and_its_check_ins(client, token, session_factory):
    kept = add(client, token, name="Run")
    check(client, token, kept)
    habit = add(client, token)
    check(client, token, habit)
    check(client, token, habit, FIRST_DAY)
    archive(client, token, habit)

    response = client.delete(habit_url(habit["id"]), headers=bearer(token))

    assert response.status_code == 204
    assert response.content == b""
    assert client.get(habit_url(habit["id"]), headers=bearer(token)).json() == NOT_FOUND
    assert client.delete(habit_url(habit["id"]), headers=bearer(token)).json() == NOT_FOUND
    with session_factory() as session:
        remaining = session.scalars(select(HabitCheckIn.habit_id)).all()
    assert [str(habit_id) for habit_id in remaining] == [kept["id"]]


# --- Check-ins and the seven-day window ------------------------------------------------


def test_check_in_and_clear_it(client, token):
    habit = add(client, token)

    response = check(client, token, habit)
    assert response.status_code == 204
    assert response.content == b""
    assert get(client, token, habit)["check_ins"] == [str(TODAY)]

    response = client.delete(check_in_url(habit["id"], TODAY), headers=bearer(token))
    assert response.status_code == 204
    assert get(client, token, habit)["check_ins"] == []


def test_checking_in_twice_keeps_one_check_in(client, token, session_factory):
    habit = add(client, token)

    assert check(client, token, habit).status_code == 204
    assert check(client, token, habit).status_code == 204

    assert get(client, token, habit)["check_ins"] == [str(TODAY)]
    with session_factory() as session:
        assert session.scalar(select(func.count()).select_from(HabitCheckIn)) == 1


def test_clearing_a_day_that_was_not_done_is_fine(client, token):
    habit = add(client, token)

    response = client.delete(check_in_url(habit["id"], TODAY), headers=bearer(token))

    assert response.status_code == 204


def test_both_ends_of_the_window_can_be_changed(client, token):
    habit = add(client, token)

    assert check(client, token, habit, FIRST_DAY).status_code == 204
    assert check(client, token, habit, TODAY).status_code == 204

    assert get(client, token, habit)["check_ins"] == [str(FIRST_DAY), str(TODAY)]
    response = client.delete(check_in_url(habit["id"], FIRST_DAY), headers=bearer(token))
    assert response.status_code == 204


@pytest.mark.parametrize("method", ["PUT", "DELETE"])
@pytest.mark.parametrize(
    "day", [TODAY + timedelta(days=1), FIRST_DAY - timedelta(days=1), date(2025, 1, 1)]
)
def test_days_outside_the_window_are_refused(client, token, method, day):
    habit = add(client, token)

    response = client.request(method, check_in_url(habit["id"], day), headers=bearer(token))

    assert response.status_code == 422
    assert response.json() == OUTSIDE_WINDOW
    assert get(client, token, habit)["check_ins"] == []


@pytest.mark.parametrize("method", ["PUT", "DELETE"])
@pytest.mark.parametrize("day", ["2026-02-30", "2026-10-1", "11-10-2026", "today", "1760140800"])
def test_malformed_days_are_refused(client, token, method, day):
    habit = add(client, token)

    response = client.request(method, check_in_url(habit["id"], day), headers=bearer(token))

    assert response.status_code == 422


def test_check_ins_shown_are_only_those_inside_the_window(client, token, session_factory):
    habit = add(client, token)
    check(client, token, habit, TODAY - timedelta(days=3))
    check(client, token, habit, FIRST_DAY)
    # An older check-in (made when it was still inside the window) stays stored.
    with session_factory() as session:
        session.add(
            HabitCheckIn(
                owner_id=uuid.UUID(get_owner_id(client, token)),
                habit_id=habit["id"],
                day=FIRST_DAY - timedelta(days=1),
            )
        )
        session.commit()

    shown = get(client, token, habit)["check_ins"]

    assert shown == [str(FIRST_DAY), str(TODAY - timedelta(days=3))]
    # A day later the oldest one leaves the window too.
    pin_today(client, TODAY + timedelta(days=1))
    assert get(client, token, habit)["check_ins"] == [str(TODAY - timedelta(days=3))]


def get_owner_id(client, token: str) -> str:
    return client.get("/auth/me", headers=bearer(token)).json()["id"]


@pytest.mark.parametrize("method", ["PUT", "DELETE"])
def test_check_ins_of_an_archived_habit_are_read_only(client, token, method):
    habit = add(client, token)
    check(client, token, habit, FIRST_DAY)
    archive(client, token, habit)

    for day in (TODAY, FIRST_DAY):
        response = client.request(method, check_in_url(habit["id"], day), headers=bearer(token))
        assert response.status_code == 409
        assert response.json() == ARCHIVED
    assert get(client, token, habit)["check_ins"] == [str(FIRST_DAY)]


@pytest.mark.parametrize("method", ["PUT", "DELETE"])
def test_check_ins_of_unknown_habits_are_not_found(client, token, method):
    response = client.request(method, check_in_url(uuid.uuid4(), TODAY), headers=bearer(token))

    assert response.status_code == 404
    assert response.json() == NOT_FOUND


# --- Races -----------------------------------------------------------------------------


def delete_before(client, db_engine, habit_id: str, prefix: str):
    """Make another request's delete commit just before the next statement starting with
    `prefix` reaches the database (as in the Shopping race test)."""

    def delete_first(conn, cursor, statement, parameters, context, executemany):
        if statement.startswith(prefix):
            with db_engine.begin() as other:
                other.execute(text("DELETE FROM habits WHERE id = :id"), {"id": habit_id})

    return delete_first


@pytest.mark.parametrize(
    ("method", "url_for", "body", "prefix"),
    [
        ("PATCH", habit_url, {"name": "Renamed"}, "UPDATE habits"),
        (
            "PUT",
            lambda habit_id: check_in_url(habit_id, TODAY),
            None,
            "INSERT INTO habit_check_ins",
        ),
        (
            "DELETE",
            lambda habit_id: check_in_url(habit_id, TODAY),
            None,
            "DELETE FROM habit_check_ins",
        ),
    ],
    ids=["edit", "check-in", "clear"],
)
def test_a_change_to_a_habit_deleted_at_the_same_moment_is_not_found(
    client, token, db_engine, method, url_for, body, prefix
):
    habit = add(client, token)
    listener = delete_before(client, db_engine, habit["id"], prefix)
    engine = client.app.state.engine
    event.listen(engine, "before_cursor_execute", listener)
    try:
        response = client.request(method, url_for(habit["id"]), json=body, headers=bearer(token))
    finally:
        event.remove(engine, "before_cursor_execute", listener)

    assert response.status_code == 404
    assert response.json() == NOT_FOUND


# --- Ownership: one user can never reach another user's habits -------------------------


@pytest.fixture
def tokens(two_users_client) -> tuple[str, str]:
    """Session tokens for user A (the owner) and user B, in the two-user database."""
    pin_today(two_users_client)
    return login(two_users_client), login(two_users_client, OTHER_EMAIL, OTHER_PASSWORD)


def test_users_only_see_their_own_habits(two_users_client, tokens):
    client = two_users_client
    a, b = tokens
    a_habit = add(client, a, name="A reads")
    b_habit = add(client, b, name="B runs")
    b_archived = archive(client, b, add(client, b, name="B old"))

    assert client.get(HABITS, headers=bearer(a)).json() == [a_habit]
    assert client.get(HABITS, headers=bearer(b)).json() == [b_habit]
    assert client.get(HABITS, params={"archived": True}, headers=bearer(a)).json() == []
    assert client.get(HABITS, params={"archived": True}, headers=bearer(b)).json() == [b_archived]


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("GET", "", None),
        ("PATCH", "", {"name": "Hijacked"}),
        ("PATCH", "", {"archived": True}),
        ("DELETE", "", None),
        ("PUT", f"/check-ins/{TODAY}", None),
        ("DELETE", f"/check-ins/{TODAY}", None),
    ],
    ids=["read", "rename", "archive", "delete", "check-in", "clear"],
)
def test_user_a_cannot_reach_user_bs_habit(two_users_client, tokens, method, path, body):
    client = two_users_client
    a, b = tokens
    b_habit = add(client, b, name="B runs")
    check(client, b, b_habit)
    b_habit = get(client, b, b_habit)

    response = client.request(method, habit_url(b_habit["id"]) + path, json=body, headers=bearer(a))

    # Indistinguishable from a habit that does not exist.
    assert response.status_code == 404
    assert response.json() == NOT_FOUND
    assert get(client, b, b_habit) == b_habit


def test_user_a_cannot_delete_user_bs_archived_habit(two_users_client, tokens):
    client = two_users_client
    a, b = tokens
    b_habit = archive(client, b, add(client, b))

    response = client.delete(habit_url(b_habit["id"]), headers=bearer(a))

    assert response.status_code == 404
    assert get(client, b, b_habit) == b_habit


def test_owner_cannot_be_set_on_create(two_users_client, tokens):
    client = two_users_client
    a, b = tokens
    b_id = client.get("/auth/me", headers=bearer(b)).json()["id"]

    response = client.post(HABITS, json={"name": "Read", "owner_id": b_id}, headers=bearer(a))

    assert response.status_code == 422
    assert client.get(HABITS, headers=bearer(b)).json() == []
