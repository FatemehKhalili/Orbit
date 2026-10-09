import uuid
from datetime import datetime

import pytest
from sqlalchemy import event, inspect, text
from sqlalchemy.exc import OperationalError

from tests.conftest import OTHER_EMAIL, OTHER_PASSWORD, bearer, login

pytestmark = pytest.mark.integration

ITEMS = "/shopping/items"
NOT_FOUND = {"detail": "Shopping item not found"}


def item_url(item_id: str | uuid.UUID) -> str:
    return f"{ITEMS}/{item_id}"


def add(client, token: str, **fields) -> dict:
    response = client.post(ITEMS, json={"name": "Milk", **fields}, headers=bearer(token))
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
def token(client, owner) -> str:
    return login(client)


# --- Authentication ------------------------------------------------------------------

ALL_OPERATIONS = [
    ("GET", ITEMS),
    ("POST", ITEMS),
    ("GET", item_url(uuid.uuid4())),
    ("PATCH", item_url(uuid.uuid4())),
    ("DELETE", item_url(uuid.uuid4())),
]


@pytest.mark.parametrize(("method", "url"), ALL_OPERATIONS)
@pytest.mark.parametrize("headers", [{}, bearer("not-a-real-token")], ids=["none", "bogus"])
def test_unauthenticated_requests_are_refused(client, owner, method, url, headers):
    response = client.request(method, url, json={"name": "Milk"}, headers=headers)

    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}


def test_unauthenticated_requests_change_nothing(client, token):
    item = add(client, token)

    client.patch(item_url(item["id"]), json={"name": "Changed"})
    client.delete(item_url(item["id"]))
    client.post(ITEMS, json={"name": "Sneaky"})

    assert client.get(ITEMS, headers=bearer(token)).json() == [item]


# --- The owner's own items -----------------------------------------------------------


def test_list_is_empty_to_begin_with(client, token):
    response = client.get(ITEMS, headers=bearer(token))

    assert response.status_code == 200
    assert response.json() == []


def test_add_an_item_with_only_a_name(client, token):
    item = add(client, token, name="Milk")

    assert item["name"] == "Milk"
    assert item["quantity"] is None
    assert item["notes"] is None
    assert item["checked"] is False
    uuid.UUID(item["id"])
    created = datetime.fromisoformat(item["created_at"])
    assert created.tzinfo is not None
    assert item["updated_at"] == item["created_at"]


def test_add_an_item_with_quantity_and_notes(client, token):
    item = add(client, token, name="Flour", quantity="500 g", notes="Type 405")

    assert (item["name"], item["quantity"], item["notes"]) == ("Flour", "500 g", "Type 405")
    assert client.get(item_url(item["id"]), headers=bearer(token)).json() == item


def test_text_is_trimmed_and_blank_optional_text_is_stored_as_null(client, token):
    item = add(client, token, name="  Eggs  ", quantity="   ", notes=" free range ")

    assert (item["name"], item["quantity"], item["notes"]) == ("Eggs", None, "free range")


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"name": ""},
        {"name": "   "},
        {"name": None},
        {"name": "x" * 201},
        {"name": "Milk", "quantity": "x" * 51},
        {"name": "Milk", "notes": "x" * 1001},
        {"name": "Milk", "checked": True},
        {"name": "Milk", "id": str(uuid.uuid4())},
        # PostgreSQL text cannot hold NUL; it must be refused before reaching the database.
        {"name": "Mi\x00lk"},
        {"name": "Milk", "quantity": "1\x00"},
        {"name": "Milk", "notes": "\x00"},
    ],
    ids=[
        "missing-name",
        "empty-name",
        "blank-name",
        "null-name",
        "long-name",
        "long-quantity",
        "long-notes",
        "checked-on-create",
        "client-id",
        "nul-name",
        "nul-quantity",
        "nul-notes",
    ],
)
def test_invalid_items_are_refused(client, token, body):
    response = client.post(ITEMS, json=body, headers=bearer(token))

    assert response.status_code == 422
    assert client.get(ITEMS, headers=bearer(token)).json() == []


def test_longest_allowed_values_are_accepted(client, token):
    item = add(client, token, name="n" * 200, quantity="q" * 50, notes="x" * 1000)

    assert len(item["name"]) == 200


def test_edit_changes_only_the_fields_sent(client, token):
    item = add(client, token, name="Milk", quantity="1 l", notes="Oat")

    response = client.patch(
        item_url(item["id"]), json={"name": "Whole milk"}, headers=bearer(token)
    )

    assert response.status_code == 200
    edited = response.json()
    assert (edited["name"], edited["quantity"], edited["notes"]) == ("Whole milk", "1 l", "Oat")
    assert edited["created_at"] == item["created_at"]
    assert edited["updated_at"] > item["updated_at"]
    assert client.get(item_url(item["id"]), headers=bearer(token)).json() == edited


def test_empty_edit_changes_nothing(client, token):
    item = add(client, token)

    response = client.patch(item_url(item["id"]), json={}, headers=bearer(token))

    assert response.status_code == 200
    assert response.json() == item


def test_edit_clears_quantity_and_notes_with_null_or_blank(client, token):
    item = add(client, token, quantity="2", notes="Oat")

    edited = client.patch(
        item_url(item["id"]), json={"quantity": None, "notes": "  "}, headers=bearer(token)
    ).json()

    assert (edited["quantity"], edited["notes"]) == (None, None)


def test_check_and_uncheck(client, token):
    item = add(client, token)

    checked = client.patch(item_url(item["id"]), json={"checked": True}, headers=bearer(token))
    assert checked.status_code == 200
    assert checked.json()["checked"] is True

    unchecked = client.patch(item_url(item["id"]), json={"checked": False}, headers=bearer(token))
    assert unchecked.json()["checked"] is False


@pytest.mark.parametrize(
    "body",
    [
        {"name": None},
        {"name": " "},
        {"checked": None},
        {"checked": "maybe"},
        {"quantity": "x" * 51},
        {"owner_id": str(uuid.uuid4())},
        {"created_at": "2020-01-01T00:00:00Z"},
        {"name": "Mi\x00lk"},
        {"notes": "Oat\x00"},
    ],
    ids=[
        "null-name",
        "blank-name",
        "null-checked",
        "bad-checked",
        "long-quantity",
        "owner",
        "ts",
        "nul-name",
        "nul-notes",
    ],
)
def test_invalid_edits_are_refused_and_change_nothing(client, token, body):
    item = add(client, token)

    response = client.patch(item_url(item["id"]), json=body, headers=bearer(token))

    assert response.status_code == 422
    assert client.get(item_url(item["id"]), headers=bearer(token)).json() == item


def test_delete_removes_the_item(client, token):
    kept = add(client, token, name="Bread")
    item = add(client, token, name="Milk")

    response = client.delete(item_url(item["id"]), headers=bearer(token))

    assert response.status_code == 204
    assert response.content == b""
    assert client.get(item_url(item["id"]), headers=bearer(token)).status_code == 404
    assert client.get(ITEMS, headers=bearer(token)).json() == [kept]
    assert client.delete(item_url(item["id"]), headers=bearer(token)).json() == NOT_FOUND


def test_edit_of_an_item_deleted_at_the_same_moment_is_not_found(client, token, db_engine):
    item = add(client, token)

    # Another request deletes the item just before the edit's UPDATE reaches the
    # database, for example a second tab deleting it while this one saves.
    def delete_first(conn, cursor, statement, parameters, context, executemany):
        if statement.startswith("UPDATE shopping_items"):
            with db_engine.begin() as other:
                other.execute(text("DELETE FROM shopping_items WHERE id = :id"), {"id": item["id"]})

    app_engine = client.app.state.engine
    event.listen(app_engine, "before_cursor_execute", delete_first)
    try:
        response = client.patch(item_url(item["id"]), json={"checked": True}, headers=bearer(token))
    finally:
        event.remove(app_engine, "before_cursor_execute", delete_first)

    assert response.status_code == 404
    assert response.json() == NOT_FOUND
    assert client.get(ITEMS, headers=bearer(token)).json() == []


def test_list_shows_unchecked_items_first_then_oldest_first(client, token):
    names = ["Apples", "Bread", "Cheese", "Dates"]
    items = {name: add(client, token, name=name) for name in names}
    for name in ("Apples", "Cheese"):
        client.patch(item_url(items[name]["id"]), json={"checked": True}, headers=bearer(token))

    listed = [item["name"] for item in client.get(ITEMS, headers=bearer(token)).json()]

    assert listed == ["Bread", "Dates", "Apples", "Cheese"]


@pytest.mark.parametrize("method", ["GET", "PATCH", "DELETE"])
def test_unknown_items_are_not_found(client, token, method):
    response = client.request(method, item_url(uuid.uuid4()), json={}, headers=bearer(token))

    assert response.status_code == 404
    assert response.json() == NOT_FOUND


@pytest.mark.parametrize("method", ["GET", "PATCH", "DELETE"])
def test_malformed_ids_are_refused(client, token, method):
    response = client.request(method, item_url("not-a-uuid"), json={}, headers=bearer(token))

    assert response.status_code == 422


def test_owner_id_cannot_be_set_on_create(client, token, owner):
    response = client.post(
        ITEMS, json={"name": "Milk", "owner_id": str(owner.id)}, headers=bearer(token)
    )

    assert response.status_code == 422


# --- Ownership: one user can never reach another user's items ------------------------


@pytest.fixture
def tokens(two_users_client) -> tuple[str, str]:
    """Session tokens for user A (the owner) and user B, in the two-user database."""
    return login(two_users_client), login(two_users_client, OTHER_EMAIL, OTHER_PASSWORD)


def test_users_only_see_their_own_items(two_users_client, tokens):
    client = two_users_client
    a, b = tokens
    a_item = add(client, a, name="A's milk")
    b_item = add(client, b, name="B's bread")

    assert client.get(ITEMS, headers=bearer(a)).json() == [a_item]
    assert client.get(ITEMS, headers=bearer(b)).json() == [b_item]
    assert client.get(item_url(a_item["id"]), headers=bearer(a)).json() == a_item


def test_user_a_cannot_read_user_bs_item(two_users_client, tokens):
    client = two_users_client
    a, b = tokens
    b_item = add(client, b, name="B's bread")

    response = client.get(item_url(b_item["id"]), headers=bearer(a))

    # Indistinguishable from an item that does not exist.
    assert response.status_code == 404
    assert response.json() == NOT_FOUND
    assert b_item not in client.get(ITEMS, headers=bearer(a)).json()


@pytest.mark.parametrize(
    "body",
    [{"name": "Hijacked"}, {"checked": True}, {"quantity": None, "notes": None}],
    ids=["name", "checked", "clear"],
)
def test_user_a_cannot_update_user_bs_item(two_users_client, tokens, body):
    client = two_users_client
    a, b = tokens
    b_item = add(client, b, name="B's bread", quantity="1", notes="Rye")

    response = client.patch(item_url(b_item["id"]), json=body, headers=bearer(a))

    assert response.status_code == 404
    assert response.json() == NOT_FOUND
    assert client.get(item_url(b_item["id"]), headers=bearer(b)).json() == b_item


def test_user_a_cannot_take_over_user_bs_item_by_setting_the_owner(two_users_client, tokens):
    client = two_users_client
    a, b = tokens
    a_item = add(client, a)
    b_owner_id = client.get("/auth/me", headers=bearer(b)).json()["id"]

    response = client.patch(
        item_url(a_item["id"]), json={"owner_id": b_owner_id}, headers=bearer(a)
    )

    assert response.status_code == 422
    assert client.get(ITEMS, headers=bearer(b)).json() == []


def test_user_a_cannot_delete_user_bs_item(two_users_client, tokens):
    client = two_users_client
    a, b = tokens
    b_item = add(client, b, name="B's bread")

    response = client.delete(item_url(b_item["id"]), headers=bearer(a))

    assert response.status_code == 404
    assert response.json() == NOT_FOUND
    assert client.get(ITEMS, headers=bearer(b)).json() == [b_item]


def test_two_user_fixture_never_drops_the_one_owner_rule_for_other_connections(
    two_users_client, tokens, db_engine
):
    # The constraint is dropped only inside the fixture's open transaction: other
    # connections still see it in the catalog, and cannot even read `users` until the
    # fixture rolls back (ALTER TABLE holds an exclusive lock).
    with db_engine.connect() as other:
        other.execute(text("SET lock_timeout = '500ms'"))
        names = {c["name"] for c in inspect(other).get_unique_constraints("users")}
        assert "uq_users_is_owner" in names
        with pytest.raises(OperationalError, match="lock timeout"):
            other.execute(text("SELECT count(*) FROM users"))
