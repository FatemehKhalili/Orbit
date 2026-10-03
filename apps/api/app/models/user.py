from sqlalchemy import Boolean, CheckConstraint, String, UniqueConstraint, true
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.mixins import TimestampMixin, UuidPrimaryKeyMixin


class User(UuidPrimaryKeyMixin, TimestampMixin, Base):
    """The instance owner. The database allows exactly one row (see `is_owner`)."""

    __tablename__ = "users"
    __table_args__ = (
        # One owner per instance, enforced by the database rather than by callers:
        # is_owner can only be true, and only one row may hold that value. A second
        # insert fails with a unique violation however it is attempted, concurrently
        # or not.
        CheckConstraint("is_owner", name="single_owner"),
        UniqueConstraint("is_owner"),
    )

    email: Mapped[str] = mapped_column(String(320), unique=True)
    display_name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(255))
    is_owner: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())

    def __repr__(self) -> str:
        return f"User(id={self.id!s})"
