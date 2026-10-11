"""Text input types shared by every product module (ADR 0007).

Strings are trimmed, bounded and refused when they contain NUL, which PostgreSQL cannot
store. Optional text that is blank after trimming becomes `None` through `blank_to_none`.
"""

from typing import Annotated, Any

from pydantic import AfterValidator, StringConstraints


def _no_nul(value: str) -> str:
    # Refuse it here (422) instead of failing in the database (500).
    if "\x00" in value:
        raise ValueError("must not contain NUL characters")
    return value


NoNul = AfterValidator(_no_nul)


def required_text(max_length: int) -> Any:
    """Trimmed text of 1 to `max_length` characters."""
    return Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=max_length), NoNul
    ]


def optional_text(max_length: int) -> Any:
    """Trimmed text of at most `max_length` characters; pair with `blank_to_none`."""
    return Annotated[str, StringConstraints(strip_whitespace=True, max_length=max_length), NoNul]


def blank_to_none(value: str | None) -> str | None:
    """For a field validator on optional text: blank after trimming is stored as NULL."""
    return value or None
