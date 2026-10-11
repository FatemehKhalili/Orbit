import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.mixins import UuidPrimaryKeyMixin


class LoginThrottle(Base):
    """Failed sign-in attempts for one bucket (ADR 0010).

    A bucket is an account (a hash of the email that was tried, whether or not it exists),
    a known device, a client IP (only behind a trusted proxy) or the whole instance. The
    key is a SHA-256 hex digest, or "global", so no attempted email or address is stored.
    """

    __tablename__ = "login_throttles"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    failures: Mapped[int] = mapped_column(Integer)
    last_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    blocked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    def __repr__(self) -> str:
        return f"LoginThrottle(failures={self.failures})"


class LoginDevice(UuidPrimaryKeyMixin, Base):
    """A browser that has signed in successfully before (ADR 0010).

    Sign-ins that present its token are throttled on their own, so an attacker who keeps
    the owner's account blocked cannot lock the owner out of a browser they already use.
    The token proves nothing on its own: it never replaces the password. Only its SHA-256
    hash is stored.
    """

    __tablename__ = "login_devices"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    def __repr__(self) -> str:
        return f"LoginDevice(id={self.id!s})"
