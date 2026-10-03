"""Session tokens: random, opaque, and stored only as a hash.

The raw token goes to the client once, at login. The database keeps its SHA-256 hash,
so a database leak does not hand out working sessions. A fast hash is enough here
because the token has 256 bits of entropy; there is nothing to brute-force.
"""

import hashlib
import secrets

TOKEN_BYTES = 32


def generate_token() -> str:
    return secrets.token_urlsafe(TOKEN_BYTES)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
