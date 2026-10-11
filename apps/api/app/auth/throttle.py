"""Sign-in throttling (ADR 0010).

Every sign-in attempt is counted, before its password is checked, in a few buckets:

- the account: a hash of the email that was tried, whether or not it exists, so the
  answer never reveals which emails are real;
- the client IP, only when the web app vouches for it (behind a trusted proxy);
- the whole instance ("global"), which caps the Argon2 work an attacker can cause.

A browser that signed in successfully before carries a device token. Its attempts are
counted in that device's own bucket instead, so an attacker who keeps the account or the
instance blocked cannot lock the owner out of a browser they already use.

A bucket allows `free` attempts. The attempt that reaches that number blocks the bucket
for the base time, and each further one doubles it, up to the cap. Blocks always expire:
there is no permanent lockout. While a bucket is blocked, attempts are refused without
checking the password (a correct one too, so a block never confirms a guess) and are not
counted. A successful sign-in clears its own buckets; from the global one it takes back
only its own count. Counts are forgotten a day after the last attempt.

Each bucket's row is locked while it is counted, so concurrent attempts cannot slip
past the limit.
"""

import hashlib
import math
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import LoginThrottle

GLOBAL_KEY = "global"
FORGET_AFTER = timedelta(days=1)


@dataclass(frozen=True)
class Bucket:
    key: str
    free: int
    kind: str  # for logs only: account, device, ip, global


def _hashed(kind: str, value: str) -> str:
    return hashlib.sha256(f"{kind}:{value}".encode()).hexdigest()


def account_bucket(email_key: str, settings: Settings) -> Bucket:
    return Bucket(_hashed("account", email_key), settings.login_free_attempts, "account")


def device_bucket(token_hash: str, settings: Settings) -> Bucket:
    return Bucket(_hashed("device", token_hash), settings.login_free_attempts, "device")


def ip_bucket(client_ip: str, settings: Settings) -> Bucket:
    return Bucket(_hashed("ip", client_ip), settings.login_free_attempts, "ip")


def global_bucket(settings: Settings) -> Bucket:
    return Bucket(GLOBAL_KEY, settings.login_global_free_attempts, "global")


def block_seconds(failures: int, free: int, settings: Settings) -> int:
    """How long the attempt numbered `failures` blocks its bucket; 0 below the limit."""
    if failures < free:
        return 0
    doublings = min(failures - free, 30)  # 2**30 seconds is far beyond any cap
    return min(settings.login_block_seconds * 2**doublings, settings.login_max_block_seconds)


@dataclass(frozen=True)
class Refusal:
    bucket: Bucket
    retry_after: int  # whole seconds, at least 1


def count_attempt(
    session: Session, buckets: list[Bucket], *, now: datetime, settings: Settings
) -> Refusal | None:
    """Count one attempt in every bucket, or in none of them: if any bucket is blocked,
    the attempt is refused (at the first blocked bucket, in order) and nothing is counted,
    so a block in one bucket never adds failures to another."""
    rows = [_lock(session, bucket, now=now) for bucket in buckets]
    for bucket, row in zip(buckets, rows, strict=True):
        if row.blocked_until is not None and row.blocked_until > now:
            session.commit()
            return Refusal(bucket, max(1, math.ceil((row.blocked_until - now).total_seconds())))
    for bucket, row in zip(buckets, rows, strict=True):
        failures = 1 if row.last_attempt_at < now - FORGET_AFTER else row.failures + 1
        seconds = block_seconds(failures, bucket.free, settings)
        session.execute(
            update(LoginThrottle)
            .where(LoginThrottle.key == bucket.key)
            .values(
                failures=failures,
                last_attempt_at=now,
                blocked_until=now + timedelta(seconds=seconds) if seconds else None,
            )
        )
    session.commit()
    return None


def _lock(session: Session, bucket: Bucket, *, now: datetime) -> LoginThrottle:
    """The bucket's row, created if needed and locked until the caller commits. Concurrent
    attempts on the same bucket queue here, so each sees the count the previous one left.
    Buckets are always locked in the same order (account or device, address, global)."""
    session.execute(
        insert(LoginThrottle)
        .values(key=bucket.key, failures=0, last_attempt_at=now, blocked_until=None)
        .on_conflict_do_nothing(index_elements=[LoginThrottle.key])
    )
    return session.execute(
        select(LoginThrottle)
        .where(LoginThrottle.key == bucket.key)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).scalar_one()


def clear(session: Session, buckets: list[Bucket]) -> None:
    """After a successful sign-in: forget the failures in these buckets. The global bucket
    only takes back this attempt's count, so it keeps measuring the failures of others."""
    keys = [bucket.key for bucket in buckets if bucket.key != GLOBAL_KEY]
    if keys:
        session.execute(delete(LoginThrottle).where(LoginThrottle.key.in_(keys)))
    if any(bucket.key == GLOBAL_KEY for bucket in buckets):
        session.execute(
            update(LoginThrottle)
            .where(LoginThrottle.key == GLOBAL_KEY)
            .values(failures=func.greatest(LoginThrottle.failures - 1, 0))
        )


def clear_all(session: Session) -> int:
    """Remove every block and count (the admin CLI's clear-login-blocks)."""
    count = session.execute(delete(LoginThrottle)).rowcount
    session.commit()
    return count


def purge_stale(session: Session, *, now: datetime) -> int:
    """Remove buckets that are not blocked and whose count has been forgotten."""
    result = session.execute(
        delete(LoginThrottle).where(
            LoginThrottle.last_attempt_at < now - FORGET_AFTER,
            or_(LoginThrottle.blocked_until.is_(None), LoginThrottle.blocked_until <= now),
        )
    )
    return result.rowcount
