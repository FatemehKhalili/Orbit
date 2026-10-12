from datetime import date, datetime

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.mixins import OwnedMixin, TimestampMixin, UuidPrimaryKeyMixin

TITLE_MAX_LENGTH = 200
NOTES_MAX_LENGTH = 8000

# All-day rows have days and no instants; timed rows have instants and no days.
SHAPE = (
    "(all_day AND start_day IS NOT NULL AND end_day IS NOT NULL"
    " AND starts_at IS NULL AND ends_at IS NULL)"
    " OR (NOT all_day AND starts_at IS NOT NULL AND ends_at IS NOT NULL"
    " AND start_day IS NULL AND end_day IS NULL)"
)
# The end is never before the start. The span limit and a non-blank title are request
# rules, not database rules, so events from elsewhere are never refused for them (ADR 0011).
END_NOT_BEFORE_START = (
    "(all_day AND end_day >= start_day) OR (NOT all_day AND ends_at >= starts_at)"
)


class CalendarEvent(UuidPrimaryKeyMixin, TimestampMixin, OwnedMixin, Base):
    """An event in the owner's calendar: all day on a span of days (`start_day` to
    `end_day`, inclusive), or timed between two instants (ADR 0011)."""

    __tablename__ = "calendar_events"
    __table_args__ = (
        CheckConstraint(SHAPE, name="shape"),
        CheckConstraint(END_NOT_BEFORE_START, name="end_not_before_start"),
    )

    title: Mapped[str] = mapped_column(String(TITLE_MAX_LENGTH))
    notes: Mapped[str | None] = mapped_column(String(NOTES_MAX_LENGTH))
    all_day: Mapped[bool] = mapped_column(Boolean)
    start_day: Mapped[date | None] = mapped_column(Date)
    end_day: Mapped[date | None] = mapped_column(Date)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    def __repr__(self) -> str:
        return f"CalendarEvent(id={self.id!s})"
