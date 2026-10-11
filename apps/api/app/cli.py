"""Administrative commands. There is no HTTP route that creates users; this is the way.

    python -m app.cli create-owner --email you@example.com --name "Your Name"
    python -m app.cli set-password
    python -m app.cli clear-login-blocks
    python -m app.cli purge-expired

Passwords are read from an interactive prompt, or from standard input with
--password-stdin. They are never accepted as arguments, which would leave them in shell
history and process listings.
"""

import argparse
import getpass
import sys
from collections.abc import Callable, Sequence
from typing import TextIO

from sqlalchemy.orm import Session

from app import clock
from app.auth import throttle
from app.auth.service import (
    OwnerAlreadyExistsError,
    OwnerNotFoundError,
    create_owner,
    purge_expired,
    set_owner_password,
)
from app.config import get_settings
from app.database import create_database_engine, create_session_factory


def _read_password(from_stdin: bool, stdin: TextIO) -> str:
    if from_stdin:
        return stdin.readline().rstrip("\r\n")
    password = getpass.getpass("Password: ")
    if getpass.getpass("Repeat password: ") != password:
        raise ValueError("Passwords do not match")
    return password


def _default_session_factory() -> Callable[[], Session]:
    return create_session_factory(create_database_engine(get_settings()))


def main(
    argv: Sequence[str] | None = None,
    *,
    session_factory: Callable[[], Session] | None = None,
    stdin: TextIO = sys.stdin,
) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="Orbit admin")
    commands = parser.add_subparsers(dest="command", required=True)

    create = commands.add_parser("create-owner", help="Create the instance owner (once)")
    create.add_argument("--email", required=True)
    create.add_argument("--name", required=True, help="Display name")
    create.add_argument("--password-stdin", action="store_true")

    reset = commands.add_parser(
        "set-password", help="Change the owner's password and sign out all sessions"
    )
    reset.add_argument("--password-stdin", action="store_true")

    commands.add_parser(
        "clear-login-blocks",
        help="Lift every sign-in block and forget failed attempts (ADR 0010)",
    )
    commands.add_parser(
        "purge-expired",
        help="Delete expired sessions and devices and old sign-in throttle state",
    )

    args = parser.parse_args(argv)
    factory = session_factory or _default_session_factory()

    if args.command == "clear-login-blocks":
        with factory() as session:
            cleared = throttle.clear_all(session)
        print(f"Cleared sign-in throttle state ({cleared} entries)")
        return 0
    if args.command == "purge-expired":
        with factory() as session:
            counts = purge_expired(session, now=clock.utc_now())
        print("Purged " + ", ".join(f"{count} {name}" for name, count in counts.items()))
        return 0

    try:
        password = _read_password(args.password_stdin, stdin)
        with factory() as session:
            if args.command == "create-owner":
                user = create_owner(
                    session, email=args.email, display_name=args.name, password=password
                )
                print(f"Created owner {user.email}")
            else:
                set_owner_password(session, password)
                print("Password changed; all sessions signed out")
    except (ValueError, OwnerAlreadyExistsError, OwnerNotFoundError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
