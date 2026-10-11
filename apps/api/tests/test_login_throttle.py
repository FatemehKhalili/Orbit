"""Sign-in throttling (ADR 0010): boundaries, progression, cap, devices and buckets."""

import threading
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import func, select, update

from app import clock
from app.auth import passwords, throttle
from app.config import Settings
from app.main import create_app
from app.models import AuthSession, LoginDevice, LoginThrottle
from tests.conftest import OWNER_EMAIL, OWNER_PASSWORD, UNREACHABLE_DATABASE_URL

START = datetime(2026, 10, 11, 12, 0, tzinfo=UTC)
WRONG = "not the password at all"
UNKNOWN_EMAIL = "nobody@example.com"


@pytest.fixture
def now(monkeypatch):
    """The API's clock, pinned; tests move it with `now.advance(seconds)`."""

    class Clock:
        value = START

        def advance(self, seconds: float) -> None:
            self.value += timedelta(seconds=seconds)

    pinned = Clock()
    monkeypatch.setattr(clock, "utc_now", lambda: pinned.value)
    return pinned


def attempt(client, email=OWNER_EMAIL, password=OWNER_PASSWORD, **extra):
    return client.post("/auth/login", json={"email": email, "password": password, **extra})


def retry_after(response) -> int:
    assert response.status_code == 429, response.text
    assert response.json() == {"detail": "Too many sign-in attempts. Try again later."}
    return int(response.headers["Retry-After"])


# Pure rules, no database.


def test_block_grows_from_the_limit_and_stops_at_the_cap():
    settings = Settings(DATABASE_URL=UNREACHABLE_DATABASE_URL, _env_file=None)
    blocks = [throttle.block_seconds(n, 5, settings) for n in range(1, 13)]
    assert blocks == [0, 0, 0, 0, 30, 60, 120, 240, 480, 900, 900, 900]
    assert throttle.block_seconds(10_000, 5, settings) == 900


def test_block_cap_must_cover_the_first_block():
    with pytest.raises(ValidationError, match="MAX_BLOCK_SECONDS"):
        Settings(
            DATABASE_URL=UNREACHABLE_DATABASE_URL,
            ORBIT_LOGIN_BLOCK_SECONDS=60,
            ORBIT_LOGIN_MAX_BLOCK_SECONDS=30,
            _env_file=None,
        )


# Through the API.


@pytest.mark.integration
def test_five_failures_block_the_sixth_attempt_even_with_the_right_password(client, owner, now):
    for _ in range(5):
        assert attempt(client, password=WRONG).status_code == 401
    assert retry_after(attempt(client)) == 30

    now.advance(29)
    assert retry_after(attempt(client)) == 1
    now.advance(1)
    assert attempt(client).status_code == 200


@pytest.mark.integration
def test_four_failures_do_not_block(client, owner, now):
    for _ in range(4):
        assert attempt(client, password=WRONG).status_code == 401
    assert attempt(client).status_code == 200


@pytest.mark.integration
def test_each_further_failure_doubles_the_block_up_to_fifteen_minutes(client, owner, now):
    for _ in range(4):
        attempt(client, password=WRONG)
    seen = []
    for _ in range(8):
        assert attempt(client, password=WRONG).status_code == 401
        wait = retry_after(attempt(client, password=WRONG))
        seen.append(wait)
        now.advance(wait)
    assert seen == [30, 60, 120, 240, 480, 900, 900, 900]
    # Never permanent: once the capped block ends, the owner gets in.
    assert attempt(client).status_code == 200


@pytest.mark.integration
def test_refused_attempts_do_not_extend_a_block(client, owner, now):
    for _ in range(5):
        attempt(client, password=WRONG)
    for second in range(30):
        assert retry_after(attempt(client, password=WRONG)) == 30 - second
        now.advance(1)
    assert attempt(client).status_code == 200


@pytest.mark.integration
def test_blocked_attempts_do_not_check_the_password(client, owner, now, monkeypatch):
    for _ in range(5):
        attempt(client, password=WRONG)
    checks = []
    real_verify = passwords.verify_password
    monkeypatch.setattr(
        "app.auth.service.verify_password", lambda *a: checks.append(1) or real_verify(*a)
    )
    for _ in range(10):
        retry_after(attempt(client))
    assert checks == []


@pytest.mark.integration
def test_an_unknown_email_is_throttled_exactly_like_the_owners(client, owner, now):
    def statuses(email):
        return [attempt(client, email=email, password=WRONG).status_code for _ in range(7)]

    known, unknown = statuses(OWNER_EMAIL), statuses(UNKNOWN_EMAIL)
    assert known == unknown == [401] * 5 + [429] * 2


@pytest.mark.integration
def test_a_successful_sign_in_clears_the_account_count(client, owner, now):
    for _ in range(4):
        attempt(client, password=WRONG)
    assert attempt(client).status_code == 200
    for _ in range(4):
        assert attempt(client, password=WRONG).status_code == 401
    assert attempt(client).status_code == 200


@pytest.mark.integration
def test_failures_are_forgotten_a_day_after_the_last_attempt(client, owner, now):
    for _ in range(4):
        attempt(client, password=WRONG)
    now.advance(timedelta(days=1, seconds=1).total_seconds())
    for _ in range(4):
        assert attempt(client, password=WRONG).status_code == 401
    assert attempt(client).status_code == 200


@pytest.mark.integration
def test_email_case_and_spacing_share_one_bucket(client, owner, now):
    for email in ["OWNER@example.com", " owner@example.com", "Owner@Example.com", OWNER_EMAIL]:
        attempt(client, email=email, password=WRONG)
    attempt(client, email="owner@EXAMPLE.com", password=WRONG)
    retry_after(attempt(client))


# Known devices: the defence against an attacker keeping the owner locked out.


@pytest.mark.integration
def test_a_known_browser_keeps_its_device_token_and_it_is_renewed(
    client, owner, now, session_factory
):
    first = attempt(client).json()
    assert len(first["device_token"]) >= 43
    now.advance(timedelta(days=300).total_seconds())

    again = attempt(client, device_token=first["device_token"]).json()

    # The same token comes back, so the web app renews the cookie's lifetime, and the
    # device now lasts a year from this sign-in, not the first.
    assert again["device_token"] == first["device_token"]
    with session_factory() as session:
        devices = session.scalars(select(LoginDevice)).all()
    assert len(devices) == 1
    assert devices[0].expires_at == clock.utc_now() + timedelta(days=365)


@pytest.mark.integration
def test_a_known_browser_signs_in_while_attackers_keep_the_account_blocked(client, owner, now):
    device = attempt(client).json()["device_token"]
    for _ in range(5):
        attempt(client, password=WRONG)
    retry_after(attempt(client))  # a new browser is blocked

    assert attempt(client, device_token=device).status_code == 200


@pytest.mark.integration
def test_a_sustained_attack_never_locks_out_a_known_browser_and_every_block_ends(
    client, owner, now
):
    """The accepted limitation (ADR 0010), at its worst: someone who knows the owner's
    email re-blocks the account as soon as each block ends, for hours. A browser the
    owner signed in with before gets in during every block, no block exceeds the cap,
    and once the attacker stops, any browser signs in."""
    device = attempt(client).json()["device_token"]
    waits = []
    for _ in range(10):
        for _ in range(10):  # wrong passwords until the account is blocked again
            response = attempt(client, password=WRONG)
            if response.status_code == 429:
                break
            assert response.status_code == 401
        wait = retry_after(response)
        waits.append(wait)
        assert attempt(client).status_code == 429  # a new browser waits, even with the password
        assert attempt(client, device_token=device).status_code == 200
        now.advance(wait)

    assert waits == [30, 60, 120, 240, 480, 900, 900, 900, 900, 900]
    assert attempt(client).status_code == 200


@pytest.mark.integration
def test_a_device_has_its_own_limit(client, owner, now):
    device = attempt(client).json()["device_token"]
    for _ in range(5):
        assert attempt(client, password=WRONG, device_token=device).status_code == 401
    assert retry_after(attempt(client, device_token=device)) == 30
    # The account itself was not touched by the device's failures.
    assert attempt(client).status_code == 200


@pytest.mark.integration
def test_a_device_token_only_counts_for_its_own_account(client, owner, now):
    device = attempt(client).json()["device_token"]
    for _ in range(5):
        attempt(client, email=UNKNOWN_EMAIL, password=WRONG)
    retry_after(attempt(client, email=UNKNOWN_EMAIL, password=WRONG, device_token=device))


@pytest.mark.integration
def test_an_unknown_or_expired_device_token_is_ignored(client, owner, now, session_factory):
    device = attempt(client).json()["device_token"]
    for _ in range(5):
        attempt(client, password=WRONG)
    retry_after(attempt(client, device_token="made-up-token"))

    with session_factory() as session:
        session.execute(
            LoginDevice.__table__.update().values(expires_at=START - timedelta(seconds=1))
        )
        session.commit()
    retry_after(attempt(client, device_token=device))


@pytest.mark.integration
def test_device_tokens_are_stored_only_as_hashes(client, owner, now, session_factory):
    device = attempt(client).json()["device_token"]
    with session_factory() as session:
        stored = session.scalars(select(LoginDevice.token_hash)).all()
    assert len(stored) == 1 and device not in stored and len(stored[0]) == 64


# The other buckets.


@pytest.fixture
def small_global_client(db_settings):
    settings = db_settings.model_copy(update={"login_global_free_attempts": 3})
    with TestClient(create_app(settings)) as test_client:
        yield test_client


@pytest.mark.integration
def test_the_global_budget_caps_spraying_across_many_emails(small_global_client, owner, now):
    client = small_global_client
    device = attempt(client).json()["device_token"]
    for n in range(3):
        assert attempt(client, email=f"spray{n}@example.com", password=WRONG).status_code == 401
    # Every new browser waits now, the owner's email included...
    assert retry_after(attempt(client, email="spray9@example.com", password=WRONG)) == 30
    retry_after(attempt(client))
    # ...but not a browser the owner already uses.
    assert attempt(client, device_token=device).status_code == 200


@pytest.mark.integration
def test_attempts_refused_by_one_bucket_are_not_counted_in_the_others(
    small_global_client, owner, now, session_factory
):
    client = small_global_client
    for n in range(3):
        attempt(client, email=f"spray{n}@example.com", password=WRONG)
    # While strangers keep the instance blocked, the owner tries again and again...
    for _ in range(10):
        retry_after(attempt(client))
    # ...and none of it counted against the owner's own account.
    owner_key = throttle.account_bucket(OWNER_EMAIL, client.app.state.settings).key
    with session_factory() as session:
        row = session.get(LoginThrottle, owner_key)
    assert row is None or (row.failures == 0 and row.blocked_until is None)
    # Once the global block ends, the owner signs in at once.
    now.advance(31)
    assert attempt(client).status_code == 200


@pytest.mark.integration
def test_a_client_ip_has_its_own_limit_when_the_web_app_sends_it(client, owner, now):
    for n in range(5):
        response = attempt(
            client, email=f"user{n}@example.com", password=WRONG, client_ip="203.0.113.7"
        )
        assert response.status_code == 401
    retry_after(attempt(client, email="user9@example.com", password=WRONG, client_ip="203.0.113.7"))
    # Another address, and the owner's own account, are unaffected.
    assert attempt(client, client_ip="198.51.100.2").status_code == 200


@pytest.mark.integration
def test_client_ip_must_be_an_ip_address(client, owner, now):
    assert attempt(client, client_ip="not-an-ip").status_code == 422


@pytest.mark.integration
def test_concurrent_failures_are_all_counted(session_factory, db_settings):
    bucket = throttle.account_bucket("race@example.com", db_settings)
    results = []
    barrier = threading.Barrier(50)

    def one_attempt():
        with session_factory() as session:
            barrier.wait()
            refusal = throttle.count_attempt(session, [bucket], now=START, settings=db_settings)
            results.append(refusal)

    threads = [threading.Thread(target=one_attempt) for _ in range(50)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert sum(result is None for result in results) == 5
    assert all(result.retry_after == 30 for result in results if result is not None)
    with session_factory() as session:
        assert session.scalar(select(LoginThrottle.failures)) == 5


@pytest.mark.integration
def test_throttle_rows_hold_no_email_or_address(client, owner, now, session_factory):
    attempt(client, email=UNKNOWN_EMAIL, password=WRONG, client_ip="203.0.113.7")
    with session_factory() as session:
        keys = session.scalars(select(LoginThrottle.key)).all()
        assert session.scalar(select(func.count()).select_from(LoginThrottle)) == 3
    assert "global" in keys
    for key in keys:
        assert "@" not in key and "203.0.113.7" not in key


# The admin CLI: the owner's way out from the server, and housekeeping.


@pytest.mark.integration
def test_cli_clear_login_blocks_lets_the_owner_in_at_once(client, owner, now, session_factory):
    from tests.test_owner import run_cli

    for _ in range(5):
        attempt(client, password=WRONG)
    retry_after(attempt(client))

    assert run_cli(session_factory, "clear-login-blocks") == 0
    assert attempt(client).status_code == 200


@pytest.mark.integration
def test_cli_purge_expired_keeps_live_state(client, owner, now, session_factory, capsys):
    from tests.test_owner import run_cli

    live_device = attempt(client).json()["device_token"]
    for _ in range(5):
        attempt(client, email=UNKNOWN_EMAIL, password=WRONG)
    with session_factory() as session:
        before = session.scalar(select(func.count()).select_from(LoginThrottle))

    # Nothing has expired yet.
    assert run_cli(session_factory, "purge-expired") == 0
    with session_factory() as session:
        assert session.scalar(select(func.count()).select_from(LoginThrottle)) == before
        assert session.scalar(select(func.count()).select_from(LoginDevice)) == 1

    # Two days on: the blocks have ended and the counts are forgotten.
    now.advance(timedelta(days=2).total_seconds())
    assert run_cli(session_factory, "purge-expired") == 0
    assert "login throttles" in capsys.readouterr().out
    with session_factory() as session:
        assert session.scalar(select(func.count()).select_from(LoginThrottle)) == 0
        assert session.scalar(select(func.count()).select_from(LoginDevice)) == 1
    assert attempt(client, device_token=live_device).json()["device_token"] == live_device


@pytest.mark.integration
def test_sign_in_purges_expired_sessions_and_stale_throttle_state(
    client, owner, now, session_factory
):
    attempt(client)
    attempt(client, email=UNKNOWN_EMAIL, password=WRONG)
    long_ago = START - timedelta(days=60)
    with session_factory() as session:
        session.execute(update(AuthSession).values(expires_at=long_ago))
        session.execute(update(LoginThrottle).values(last_attempt_at=long_ago))
        session.commit()

    assert attempt(client).status_code == 200

    with session_factory() as session:
        assert session.scalar(select(func.count()).select_from(AuthSession)) == 1
        keys = set(session.scalars(select(LoginThrottle.key)))
    assert keys == {"global"}  # only the bucket this sign-in itself used
