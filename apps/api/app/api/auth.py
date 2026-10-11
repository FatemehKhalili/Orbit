import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, Field, IPvAnyAddress

from app import clock
from app.auth.dependencies import CurrentSessionDep, CurrentUserDep
from app.auth.passwords import MAX_PASSWORD_LENGTH
from app.auth.service import end_session, sign_in
from app.database import SessionDep
from app.models import User

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger("orbit.auth")


class LoginRequest(BaseModel):
    # Plain strings: a malformed email gets the same 401 as a wrong one.
    email: str = Field(max_length=320)
    password: str = Field(max_length=MAX_PASSWORD_LENGTH)
    # The browser's device token from an earlier sign-in, if it has one (ADR 0010).
    device_token: str | None = Field(default=None, max_length=128)
    # The browser's address, sent by the web app only behind a trusted proxy (ADR 0010).
    client_ip: IPvAnyAddress | None = None


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
    # Set only when this browser should start keeping a new device token.
    device_token: str | None


TOO_MANY_ATTEMPTS = "Too many sign-in attempts. Try again later."


@router.post(
    "/login",
    responses={
        401: {"description": "Wrong email or password"},
        429: {"description": "Too many failed attempts; see the Retry-After header"},
    },
)
def login(body: LoginRequest, request: Request, session: SessionDep) -> LoginResponse:
    result = sign_in(
        session,
        email=body.email,
        password=body.password,
        device_token=body.device_token,
        client_ip=str(body.client_ip) if body.client_ip else None,
        settings=request.app.state.settings,
        now=clock.utc_now(),
    )
    if result.refusal is not None:
        # Never log the email or address: the bucket kind is enough to see what happens.
        logger.warning(
            "sign-in refused: %s blocked for %ss",
            result.refusal.bucket.kind,
            result.refusal.retry_after,
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=TOO_MANY_ATTEMPTS,
            headers={"Retry-After": str(result.refusal.retry_after)},
        )
    if result.issued is None:
        logger.info("sign-in failed")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )
    issued = result.issued
    return LoginResponse(
        token=issued.token,
        expires_at=issued.expires_at,
        user=UserOut.from_user(issued.user),
        device_token=result.device_token,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(auth_session: CurrentSessionDep, session: SessionDep) -> Response:
    """Revoke the session that made this request."""
    end_session(session, auth_session)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me")
def me(user: CurrentUserDep) -> UserOut:
    return UserOut.from_user(user)
