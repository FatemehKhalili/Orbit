"""The Calendar's one write path, and its reads (ADR 0011).

Every create, update and delete of a calendar event goes through this module; the router
only validates requests and shapes responses. Later behaviour that must follow every
change (Google sync, ADR 0012) attaches here, once.

Every query filters on the owner in SQL (ADR 0007): another owner's event is the same as
one that does not exist.
"""

import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import and_, delete, or_, select, update
from sqlalchemy.orm import Session

from app.calendar.local_time import NonexistentLocalTime, day_bounds, to_instant
from app.models import CalendarEvent, User

# A typing guard for the forms, not a database rule (ADR 0011).
MAX_SPAN_DAYS = 366
# The longest range one list request may ask for, instead of pagination (ADR 0011).
MAX_RANGE_DAYS = 62

END_BEFORE_START = "The end must not be before the start."
SPAN_TOO_LONG = f"An event can last at most {MAX_SPAN_DAYS} days."
END_DAY_WITHOUT_TIME = "Give an end time with the end day, or leave both empty."
NONEXISTENT_TIME = (
    "This time does not exist on that day because the clocks change. Choose another time."
)


class InvalidEvent(ValueError):
    """The event cannot be saved as asked; the message is for the owner."""


@dataclass(frozen=True)
class AllDay:
    """All day, from `start_day` to `end_day`, both included."""

    start_day: date
    end_day: date


@dataclass(frozen=True)
class Timed:
    """From `starts_at` to `ends_at`; equal for a point in time."""

    starts_at: datetime
    ends_at: datetime


When = AllDay | Timed


def all_day(start_day: date, end_day: date | None) -> AllDay:
    end_day = end_day or start_day
    if end_day < start_day:
        raise InvalidEvent(END_BEFORE_START)
    if (end_day - start_day).days + 1 > MAX_SPAN_DAYS:
        raise InvalidEvent(SPAN_TOO_LONG)
    return AllDay(start_day, end_day)


def timed(
    start_day: date,
    start_time: time,
    end_day: date | None,
    end_time: time | None,
    zone: ZoneInfo,
) -> Timed:
    """A timed event from local values in `zone`. Without an end time it is a point in
    time; without an end day it ends on the day it starts."""
    if end_time is None and end_day is not None:
        raise InvalidEvent(END_DAY_WITHOUT_TIME)
    try:
        starts_at = to_instant(start_day, start_time, zone)
        ends_at = (
            starts_at if end_time is None else to_instant(end_day or start_day, end_time, zone)
        )
    except NonexistentLocalTime:
        raise InvalidEvent(NONEXISTENT_TIME) from None
    if ends_at < starts_at:
        raise InvalidEvent(END_BEFORE_START)
    if ends_at - starts_at > timedelta(days=MAX_SPAN_DAYS):
        raise InvalidEvent(SPAN_TOO_LONG)
    return Timed(starts_at, ends_at)


def _columns(when: When) -> dict[str, object]:
    """The four time columns for a shape; the other shape's columns are cleared."""
    if isinstance(when, AllDay):
        return {
            "all_day": True,
            "start_day": when.start_day,
            "end_day": when.end_day,
            "starts_at": None,
            "ends_at": None,
        }
    return {
        "all_day": False,
        "start_day": None,
        "end_day": None,
        "starts_at": when.starts_at,
        "ends_at": when.ends_at,
    }


def _owned(owner: User):
    return select(CalendarEvent).where(CalendarEvent.owner_id == owner.id)


def get_event(session: Session, owner: User, event_id: uuid.UUID) -> CalendarEvent | None:
    return session.scalar(_owned(owner).where(CalendarEvent.id == event_id))


def events_in_range(
    session: Session, owner: User, first: date, last: date, zone: ZoneInfo
) -> list[CalendarEvent]:
    """Every event on any local day from `first` to `last` (inclusive), in agenda order:
    all-day events first, then timed events by start; then title, then id."""
    lo, hi = day_bounds(first, last, zone)
    on_those_days = or_(
        and_(
            CalendarEvent.all_day,
            CalendarEvent.start_day <= last,
            CalendarEvent.end_day >= first,
        ),
        and_(
            ~CalendarEvent.all_day,
            or_(
                and_(
                    CalendarEvent.ends_at > CalendarEvent.starts_at,
                    CalendarEvent.starts_at < hi,
                    CalendarEvent.ends_at > lo,
                ),
                # A point in time is on the day it happens.
                and_(
                    CalendarEvent.ends_at == CalendarEvent.starts_at,
                    CalendarEvent.starts_at >= lo,
                    CalendarEvent.starts_at < hi,
                ),
            ),
        ),
    )
    query = (
        _owned(owner)
        .where(on_those_days)
        .order_by(
            CalendarEvent.all_day.desc(),
            CalendarEvent.start_day.asc().nulls_last(),
            CalendarEvent.starts_at.asc().nulls_last(),
            CalendarEvent.title,
            CalendarEvent.id,
        )
    )
    return list(session.scalars(query))


def create_event(
    session: Session, owner: User, *, title: str, notes: str | None, when: When
) -> CalendarEvent:
    event = CalendarEvent(owner_id=owner.id, title=title, notes=notes, **_columns(when))
    session.add(event)
    session.commit()
    session.refresh(event)
    return event


def update_event(
    session: Session, owner: User, event_id: uuid.UUID, changes: dict[str, object]
) -> CalendarEvent | None:
    """Changes only the fields given (`title`, `notes`, `when`); `when` replaces the
    whole time shape. None when the event is missing or someone else's."""
    if not changes:
        return get_event(session, owner, event_id)
    values = {key: value for key, value in changes.items() if key != "when"}
    if "when" in changes:
        values |= _columns(changes["when"])  # type: ignore[arg-type]
    # One owner-filtered UPDATE ... RETURNING (ADR 0007); `updated_at` moves with it.
    event = session.scalar(
        update(CalendarEvent)
        .where(CalendarEvent.owner_id == owner.id, CalendarEvent.id == event_id)
        .values(**values)
        .returning(CalendarEvent)
    )
    if event is None:
        return None
    session.commit()
    return event


def delete_event(session: Session, owner: User, event_id: uuid.UUID) -> bool:
    """Deletes the event for good. False when it is missing or someone else's."""
    result = session.execute(
        delete(CalendarEvent).where(
            CalendarEvent.owner_id == owner.id, CalendarEvent.id == event_id
        )
    )
    session.commit()
    return result.rowcount > 0
