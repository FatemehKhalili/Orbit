import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.mixins import UuidPrimaryKeyMixin
from app.models.user import User


class AuthSession(UuidPrimaryKeyMixin, Base):
    """A signed-in session. Only the SHA-256 hash of the token is stored; the raw token
    exists only in the client's cookie. Deleting the row revokes the session."""

    __tablename__ = "sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(lazy="joined")

    def __repr__(self) -> str:
        return f"AuthSession(id={self.id!s}, user_id={self.user_id!s})"
