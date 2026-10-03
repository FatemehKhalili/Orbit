"""Password hashing with Argon2id (argon2-cffi defaults, RFC 9106 low-memory profile)."""

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

MIN_PASSWORD_LENGTH = 12
MAX_PASSWORD_LENGTH = 1024

_hasher = PasswordHasher()

# Verified against when the email is unknown, so a login attempt takes about as long
# whether or not the account exists.
_DUMMY_HASH = _hasher.hash("orbit-dummy-password-for-timing")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    """Check a password. With no hash (unknown account) it still does the work, then fails."""
    try:
        matches = _hasher.verify(password_hash or _DUMMY_HASH, password)
    except (VerificationError, InvalidHashError):
        return False
    return matches and password_hash is not None


def needs_rehash(password_hash: str) -> bool:
    """True when the hash was made with weaker parameters than the current defaults."""
    return _hasher.check_needs_rehash(password_hash)


def validate_new_password(password: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
    if len(password) > MAX_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at most {MAX_PASSWORD_LENGTH} characters")
