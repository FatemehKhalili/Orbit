"""One owner per instance, enforced by the database, plus the admin CLI."""

import io
import threading

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError

from app import cli
from app.auth.passwords import verify_password
from app.auth.service import OwnerAlreadyExistsError, create_owner
from app.models import AuthSession, User
from tests.conftest import OWNER_EMAIL, OWNER_PASSWORD, bearer, login

pytestmark = pytest.mark.integration

OTHER_PASSWORD = "another long password"


def count_users(session_factory) -> int:
    with session_factory() as session:
        return session.scalar(select(func.count()).select_from(User))


def test_create_owner_stores_a_normalized_email(session_factory):
    with session_factory() as session:
        user = create_owner(
            session, email=" Owner@Example.com", display_name=" Me ", password=OWNER_PASSWORD
        )

    assert user.email == OWNER_EMAIL
    assert user.display_name == "Me"


@pytest.mark.parametrize(
    ("email", "name", "password"),
    [
        ("bad", "Me", OWNER_PASSWORD),
        (OWNER_EMAIL, "  ", OWNER_PASSWORD),
        (OWNER_EMAIL, "Me", "short"),
    ],
    ids=["bad-email", "blank-name", "short-password"],
)
def test_create_owner_validates_input(session_factory, email, name, password):
    with session_factory() as session, pytest.raises(ValueError):
        create_owner(session, email=email, display_name=name, password=password)
    assert count_users(session_factory) == 0


def test_a_second_owner_is_refused(session_factory, owner):
    with session_factory() as session, pytest.raises(OwnerAlreadyExistsError):
        create_owner(
            session, email="second@example.com", display_name="Two", password=OTHER_PASSWORD
        )
    assert count_users(session_factory) == 1


def test_database_refuses_a_second_user_row_directly(db_engine, owner):
    insert = text(
        "INSERT INTO users (id, email, display_name, password_hash) "
        "VALUES (gen_random_uuid(), 'second@example.com', 'Two', 'x')"
    )
    with pytest.raises(IntegrityError, match="uq_users_is_owner"), db_engine.begin() as connection:
        connection.execute(insert)


def test_database_refuses_is_owner_false(db_engine, owner):
    insert = text(
        "INSERT INTO users (id, email, display_name, password_hash, is_owner) "
        "VALUES (gen_random_uuid(), 'second@example.com', 'Two', 'x', false)"
    )
    with pytest.raises(IntegrityError, match="ck_users_single_owner"), db_engine.begin() as c:
        c.execute(insert)


def test_concurrent_inserts_cannot_both_commit(session_factory):
    """Two transactions that both got past any application check: only one wins."""
    first = session_factory()
    first.add(User(email="a@example.com", display_name="A", password_hash="x"))
    first.flush()  # row inserted, transaction still open

    errors: list[Exception] = []

    def second_insert() -> None:
        with session_factory() as second:
            second.add(User(email="b@example.com", display_name="B", password_hash="x"))
            try:
                second.commit()  # blocks on the unique index until `first` finishes
            except IntegrityError as error:
                errors.append(error)

    thread = threading.Thread(target=second_insert)
    thread.start()
    thread.join(timeout=0.5)
    assert thread.is_alive(), "second insert should wait for the first transaction"

    first.commit()
    first.close()
    thread.join(timeout=10)

    assert len(errors) == 1
    assert count_users(session_factory) == 1


def test_concurrent_create_owner_calls_create_exactly_one(session_factory):
    attempts = 8
    barrier = threading.Barrier(attempts)
    outcomes: list[str] = []
    lock = threading.Lock()

    def attempt(index: int) -> None:
        with session_factory() as session:
            barrier.wait()
            try:
                create_owner(
                    session,
                    email=f"owner{index}@example.com",
                    display_name=f"Owner {index}",
                    password=OWNER_PASSWORD,
                )
                result = "created"
            except OwnerAlreadyExistsError:
                result = "refused"
        with lock:
            outcomes.append(result)

    threads = [threading.Thread(target=attempt, args=(i,)) for i in range(attempts)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)

    assert sorted(outcomes) == ["created"] + ["refused"] * (attempts - 1)
    assert count_users(session_factory) == 1


def run_cli(session_factory, *argv: str, stdin: str = "") -> int:
    return cli.main(list(argv), session_factory=session_factory, stdin=io.StringIO(stdin))


def test_cli_creates_the_owner_once(session_factory, capsys):
    args = ("create-owner", "--email", OWNER_EMAIL, "--name", "Me", "--password-stdin")

    assert run_cli(session_factory, *args, stdin=OWNER_PASSWORD + "\n") == 0
    assert run_cli(session_factory, *args, stdin=OWNER_PASSWORD + "\n") == 1

    assert "already has an owner" in capsys.readouterr().err
    assert count_users(session_factory) == 1


def test_cli_rejects_a_short_password(session_factory, capsys):
    code = run_cli(
        session_factory,
        "create-owner",
        "--email",
        OWNER_EMAIL,
        "--name",
        "Me",
        "--password-stdin",
        stdin="short\n",
    )

    assert code == 1
    assert "at least" in capsys.readouterr().err
    assert count_users(session_factory) == 0


def test_cli_prompt_requires_matching_passwords(session_factory, monkeypatch, capsys):
    answers = iter([OWNER_PASSWORD, "something else entirely"])
    monkeypatch.setattr(cli.getpass, "getpass", lambda prompt: next(answers))

    assert run_cli(session_factory, "create-owner", "--email", OWNER_EMAIL, "--name", "Me") == 1
    assert "do not match" in capsys.readouterr().err


def test_cli_set_password_changes_it_and_signs_out_everywhere(client, owner, session_factory):
    token = login(client)

    assert run_cli(session_factory, "set-password", "--password-stdin", stdin=OTHER_PASSWORD) == 0

    assert client.get("/auth/me", headers=bearer(token)).status_code == 401
    with session_factory() as session:
        assert session.scalar(select(func.count()).select_from(AuthSession)) == 0
        stored = session.scalar(select(User.password_hash))
    assert verify_password(stored, OTHER_PASSWORD)
    login(client, password=OTHER_PASSWORD)


def test_cli_set_password_without_an_owner_fails(session_factory, capsys):
    assert run_cli(session_factory, "set-password", "--password-stdin", stdin=OTHER_PASSWORD) == 1
    assert "no owner" in capsys.readouterr().err
