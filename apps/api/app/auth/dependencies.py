"""FastAPI dependencies for authenticated endpoints.

Every endpoint except health checks and login takes `CurrentUserDep` (or
`CurrentSessionDep` when it needs the session itself).
"""

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.service import resolve_session
from app.database import SessionDep
from app.models import AuthSession, User

_bearer = HTTPBearer(auto_error=False, description="Session token from POST /auth/login")


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_session(
    session: SessionDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> AuthSession:
    if credentials is None or not credentials.credentials:
        raise _unauthorized()
    auth_session = resolve_session(session, credentials.credentials)
    if auth_session is None:
        raise _unauthorized()
    return auth_session


CurrentSessionDep = Annotated[AuthSession, Depends(get_current_session)]


def get_current_user(auth_session: CurrentSessionDep) -> User:
    return auth_session.user


CurrentUserDep = Annotated[User, Depends(get_current_user)]
