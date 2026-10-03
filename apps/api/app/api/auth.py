import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from app.auth.dependencies import CurrentSessionDep, CurrentUserDep
from app.auth.passwords import MAX_PASSWORD_LENGTH
from app.auth.service import authenticate, end_session, start_session
from app.database import SessionDep
from app.models import User

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    # Plain strings: a malformed email gets the same 401 as a wrong one.
    email: str = Field(max_length=320)
    password: str = Field(max_length=MAX_PASSWORD_LENGTH)


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    display_name: str

    @classmethod
    def from_user(cls, user: User) -> "UserOut":
        return cls(id=user.id, email=user.email, display_name=user.display_name)


class LoginResponse(BaseModel):
    token: str
    expires_at: datetime
    user: UserOut


@router.post("/login", responses={401: {"description": "Wrong email or password"}})
def login(body: LoginRequest, request: Request, session: SessionDep) -> LoginResponse:
    user = authenticate(session, email=body.email, password=body.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )
    ttl = timedelta(days=request.app.state.settings.session_ttl_days)
    issued = start_session(session, user, ttl=ttl)
    return LoginResponse(
        token=issued.token, expires_at=issued.expires_at, user=UserOut.from_user(user)
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(auth_session: CurrentSessionDep, session: SessionDep) -> Response:
    """Revoke the session that made this request."""
    end_session(session, auth_session)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me")
def me(user: CurrentUserDep) -> UserOut:
    return UserOut.from_user(user)
