"""Owner account and session operations. HTTP and CLI layers call these."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import throttle
from app.auth.passwords import hash_password, needs_rehash, validate_new_password, verify_password
from app.auth.tokens import generate_token, hash_token
from app.config import Settings
from app.models import AuthSession, LoginDevice, User

_email_adapter = TypeAdapter(EmailStr)


class OwnerAlreadyExistsError(Exception):
    pass


class OwnerNotFoundError(Exception):
    pass


@dataclass(frozen=True)
class IssuedSession:
    token: str  # raw token: returned to the client once, never stored
    expires_at: datetime
    user: User


def normalize_email(email: str) -> str:
    try:
        return _email_adapter.validate_python(email.strip()).lower()
    except ValidationError as error:
        raise ValueError("Not a valid email address") from error


def create_owner(session: Session, *, email: str, display_name: str, password: str) -> User:
    """Create the instance owner. Fails if one already exists.

    The database is the authority: `users` accepts a single row (unique `is_owner`,
    which can only be true), so even concurrent callers cannot create two owners.
    The pre-check only produces a friendlier error in the common case.
    """
    display_name = display_name.strip()
    if not display_name:
        raise ValueError("Display name must not be empty")
    validate_new_password(password)
    user = User(
        email=normalize_email(email),
        display_name=display_name,
        password_hash=hash_password(password),
    )

    if session.scalar(select(func.count()).select_from(User)):
        raise OwnerAlreadyExistsError("This Orbit instance already has an owner")
    session.add(user)
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        raise OwnerAlreadyExistsError("This Orbit instance already has an owner") from error
    return user


def set_owner_password(session: Session, password: str) -> None:
    """Change the owner's password and sign out every existing session."""
    validate_new_password(password)
    user = session.scalar(select(User))
    if user is None:
        raise OwnerNotFoundError("This Orbit instance has no owner yet")
    user.password_hash = hash_password(password)
    session.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
    session.commit()


def authenticate(session: Session, *, email: str, password: str) -> User | None:
    try:
        normalized = normalize_email(email)
    except ValueError:
        normalized = None
    user = session.scalar(select(User).where(User.email == normalized)) if normalized else None

    if not verify_password(user.password_hash if user else None, password):
        return None
    assert user is not None
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    return user


def start_session(session: Session, user: User, *, ttl: timedelta) -> IssuedSession:
    now = datetime.now(UTC)
    # Housekeeping: drop this user's expired sessions while we are here.
    session.execute(
        delete(AuthSession).where(AuthSession.user_id == user.id, AuthSession.expires_at <= now)
    )
    token = generate_token()
    expires_at = now + ttl
    session.add(AuthSession(user_id=user.id, token_hash=hash_token(token), expires_at=expires_at))
    session.commit()
    return IssuedSession(token=token, expires_at=expires_at, user=user)


def resolve_session(session: Session, token: str) -> AuthSession | None:
    """The live session for a raw token, or None if unknown, revoked or expired."""
    return session.scalar(
        select(AuthSession).where(
            AuthSession.token_hash == hash_token(token),
            AuthSession.expires_at > datetime.now(UTC),
        )
    )


# How long a browser stays "known" after its last successful sign-in (ADR 0010).
DEVICE_TTL = timedelta(days=365)


@dataclass(frozen=True)
class SignInResult:
    """Exactly one of: a session, a refusal (throttled), or neither (wrong credentials)."""

    issued: IssuedSession | None = None
    refusal: throttle.Refusal | None = None
    # A new device token for the browser to keep; None when it already has a valid one.
    device_token: str | None = None


def sign_in(
    session: Session,
    *,
    email: str,
    password: str,
    device_token: str | None,
    client_ip: str | None,
    settings: Settings,
    now: datetime,
) -> SignInResult:
    """Throttle, check the password, and start a session (ADR 0006, ADR 0010)."""
    try:
        email_key = normalize_email(email)
    except ValueError:
        email_key = email.strip().lower()

    device = _known_device(session, email_key, device_token, now=now)
    if device is not None:
        buckets = [throttle.device_bucket(device.token_hash, settings)]
    else:
        buckets = [throttle.account_bucket(email_key, settings)]
        if client_ip:
            buckets.append(throttle.ip_bucket(client_ip, settings))
        buckets.append(throttle.global_bucket(settings))

    refusal = throttle.count_attempt(session, buckets, now=now, settings=settings)
    if refusal is not None:
        return SignInResult(refusal=refusal)

    user = authenticate(session, email=email, password=password)
    if user is None:
        session.commit()
        return SignInResult()

    throttle.clear(session, buckets)
    new_device_token = None
    if device is not None:
        device.last_used_at = now
        device.expires_at = now + DEVICE_TTL
    else:
        new_device_token = generate_token()
        session.add(
            LoginDevice(
                user_id=user.id,
                token_hash=hash_token(new_device_token),
                last_used_at=now,
                expires_at=now + DEVICE_TTL,
            )
        )
    _delete_expired(session, now=now)  # housekeeping rides along with each sign-in
    ttl = timedelta(days=settings.session_ttl_days)
    issued = start_session(session, user, ttl=ttl)  # commits
    return SignInResult(issued=issued, device_token=new_device_token)


def _known_device(
    session: Session, email_key: str, device_token: str | None, *, now: datetime
) -> LoginDevice | None:
    """The device behind `device_token`, if it is live and belongs to this email's user."""
    if not device_token:
        return None
    return session.scalar(
        select(LoginDevice)
        .join(User, User.id == LoginDevice.user_id)
        .where(
            LoginDevice.token_hash == hash_token(device_token),
            LoginDevice.expires_at > now,
            User.email == email_key,
        )
    )


def purge_expired(session: Session, *, now: datetime) -> dict[str, int]:
    """Housekeeping for the admin CLI: expired sessions and devices, stale throttle rows."""
    counts = _delete_expired(session, now=now)
    session.commit()
    return counts


def _delete_expired(session: Session, *, now: datetime) -> dict[str, int]:
    return {
        "sessions": session.execute(
            delete(AuthSession).where(AuthSession.expires_at <= now)
        ).rowcount,
        "devices": session.execute(
            delete(LoginDevice).where(LoginDevice.expires_at <= now)
        ).rowcount,
        "login throttles": throttle.purge_stale(session, now=now),
    }


def end_session(session: Session, auth_session: AuthSession) -> None:
    """Revoke one session by deleting its row."""
    session.execute(delete(AuthSession).where(AuthSession.id == auth_session.id))
    session.commit()
