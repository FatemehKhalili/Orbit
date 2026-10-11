import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKeyConstraint, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.mixins import OwnedMixin, TimestampMixin, UuidPrimaryKeyMixin

NAME_MAX_LENGTH = 100
NOTES_MAX_LENGTH = 1000


class Habit(UuidPrimaryKeyMixin, TimestampMixin, OwnedMixin, Base):
    """A daily habit. Active while `archived_at` is null; archiving keeps its check-ins."""

    __tablename__ = "habits"
    # Lets check-ins reference (id, owner_id), so their owner always matches the habit's.
    __table_args__ = (UniqueConstraint("id", "owner_id", name="uq_habits_id_owner_id"),)

    name: Mapped[str] = mapped_column(String(NAME_MAX_LENGTH))
    notes: Mapped[str | None] = mapped_column(String(NOTES_MAX_LENGTH))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    def __repr__(self) -> str:
        return f"Habit(id={self.id!s})"


class HabitCheckIn(UuidPrimaryKeyMixin, TimestampMixin, OwnedMixin, Base):
    """A habit done on one calendar day (ADR 0008). No row means not done that day."""

    __tablename__ = "habit_check_ins"
    __table_args__ = (
        # The database keeps a check-in's owner equal to its habit's owner, and deleting
        # the habit deletes its check-ins.
        ForeignKeyConstraint(
            ["habit_id", "owner_id"],
            ["habits.id", "habits.owner_id"],
            ondelete="CASCADE",
            name="fk_habit_check_ins_habit_id_owner_id_habits",
        ),
        UniqueConstraint("habit_id", "day", name="uq_habit_check_ins_habit_id_day"),
    )

    habit_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    day: Mapped[date] = mapped_column(Date)

    def __repr__(self) -> str:
        return f"HabitCheckIn(habit_id={self.habit_id!s}, day={self.day.isoformat()})"
