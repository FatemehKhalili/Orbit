"""Columns every table shares. Module tables also add an `owner_id` (see OwnedMixin)."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Uuid, func
from sqlalchemy.orm import Mapped, declared_attr, mapped_column


class UuidPrimaryKeyMixin:
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


class TimestampMixin:
    """Creation and update times, set by the database, always timezone-aware."""

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class OwnedMixin:
    """For product-module tables: every row belongs to a user.

    Orbit has a single owner today, but recording the owner on module data keeps a
    multi-user future possible without rewriting every table.
    """

    @declared_attr
    def owner_id(cls) -> Mapped[uuid.UUID]:
        return mapped_column(
            Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
        )
