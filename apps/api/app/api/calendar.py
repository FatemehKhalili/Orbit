"""The Calendar module: events all day or at a time, in the instance timezone (ADR 0011).

This router validates requests and shapes responses; every read and write goes through
app/calendar/service.py, which filters on the signed-in owner in SQL (ADR 0007). Another
owner's event is "not found", exactly like one that does not exist.

Requests and responses carry local days and "HH:MM" times in `ORBIT_TIMEZONE`; timed
events are stored as instants and returned with both.
"""

import uuid
from datetime import date, datetime, time
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
)

from app.api.text import blank_to_none, optional_text, required_text
from app.auth.dependencies import CurrentUserDep
from app.calendar import service
from app.calendar.local_time import local_day, local_time, timed_days
from app.clock import TimezoneDep
from app.database import SessionDep
from app.models import CalendarEvent
from app.models.calendar import NOTES_MAX_LENGTH, TITLE_MAX_LENGTH

router = APIRouter(prefix="/calendar", tags=["calendar"])

Title = required_text(TITLE_MAX_LENGTH)
Notes = optional_text(NOTES_MAX_LENGTH)


def _iso_date_text(value: object) -> object:
    # Only "YYYY-MM-DD" text, never a number of seconds or a datetime.
    if not isinstance(value, str) or len(value) != 10:
        raise ValueError("must be a date written YYYY-MM-DD")
    return value


# A calendar date, "2026-10-14".
Day = Annotated[date, BeforeValidator(_iso_date_text)]
# A local time of day, "09:00".
TimeOfDay = Annotated[
    str, StringConstraints(pattern=r"^([01]\d|2[0-3]):[0-5]\d$"), Field(examples=["09:00"])
]

NOT_FOUND = "Event not found"
RANGE_BACKWARDS = "`to` must not be before `from`."
RANGE_TOO_LONG = f"Ask for at most {service.MAX_RANGE_DAYS} days at a time."


class _Input(BaseModel):
    # Unknown fields (owner_id, id, starts_at, timestamps) are refused.
    model_config = ConfigDict(extra="forbid")


class AllDayIn(_Input):
    """All day, from `start_day` to `end_day` (inclusive; defaults to `start_day`)."""

    all_day: Literal[True]
    start_day: Day
    end_day: Day | None = None


class TimedIn(_Input):
    """At a time. Without `end_time` the event is a point in time; without `end_day` it
    ends on the day it starts."""

    all_day: Literal[False]
    start_day: Day
    start_time: TimeOfDay
    end_day: Day | None = None
    end_time: TimeOfDay | None = None


WhenIn = Annotated[AllDayIn | TimedIn, Field(discriminator="all_day")]


class _EventInput(_Input):
    notes: Notes | None = None

    @field_validator("notes")
    @classmethod
    def _blank_to_none(cls, value: str | None) -> str | None:
        return blank_to_none(value)


class EventCreate(_EventInput):
    title: Title
    when: WhenIn


class EventUpdate(_EventInput):
    """Partial update: a field left out stays as it is; `null` clears notes. `when`
    replaces the whole time shape, which is how an event switches between all day and
    timed."""

    title: Title | None = None
    when: WhenIn | None = None

    @field_validator("title", "when")
    @classmethod
    def _not_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("may be left out, but not null")
        return value


class EventOut(BaseModel):
    id: uuid.UUID
    title: str
    notes: str | None
    all_day: bool
    start_day: date = Field(description="Local day the event starts")
    start_time: str | None = Field(description='Local "HH:MM"; null when all day')
    end_day: date = Field(description="Local day the event ends (inclusive when all day)")
    end_time: str | None = Field(description='Local "HH:MM"; null when all day')
    starts_at: datetime | None = Field(description="Null when all day")
    ends_at: datetime | None = Field(description="Null when all day")
    first_day: date = Field(description="First local day the event is on")
    last_day: date = Field(description="Last local day the event is on")
    created_at: datetime
    updated_at: datetime


def _event_out(event: CalendarEvent, zone: ZoneInfo) -> EventOut:
    if event.all_day:
        assert event.start_day is not None and event.end_day is not None
        start_day, end_day = event.start_day, event.end_day
        start_time = end_time = None
        first_day, last_day = start_day, end_day
    else:
        assert event.starts_at is not None and event.ends_at is not None
        start_day, start_time = local_day(event.starts_at, zone), local_time(event.starts_at, zone)
        end_day, end_time = local_day(event.ends_at, zone), local_time(event.ends_at, zone)
        first_day, last_day = timed_days(event.starts_at, event.ends_at, zone)
    return EventOut(
        id=event.id,
        title=event.title,
        notes=event.notes,
        all_day=event.all_day,
        start_day=start_day,
        start_time=start_time,
        end_day=end_day,
        end_time=end_time,
        starts_at=event.starts_at,
        ends_at=event.ends_at,
        first_day=first_day,
        last_day=last_day,
        created_at=event.created_at,
        updated_at=event.updated_at,
    )


def _when(value: AllDayIn | TimedIn, zone: ZoneInfo) -> service.When:
    try:
        if isinstance(value, AllDayIn):
            return service.all_day(value.start_day, value.end_day)
        return service.timed(
            value.start_day,
            time.fromisoformat(value.start_time),
            value.end_day,
            time.fromisoformat(value.end_time) if value.end_time else None,
            zone,
        )
    except service.InvalidEvent as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)
        ) from None


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)


EVENT_RESPONSES = {404: {"description": NOT_FOUND}}


@router.get("/events")
def list_events(
    user: CurrentUserDep,
    session: SessionDep,
    zone: TimezoneDep,
    first: Annotated[date, Query(alias="from", description="First local day, YYYY-MM-DD")],
    last: Annotated[date, Query(alias="to", description="Last local day, inclusive")],
) -> list[EventOut]:
    """Every event on any day from `from` to `to`, in agenda order: all-day events first,
    then by start time. At most 62 days at a time."""
    if last < first:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=RANGE_BACKWARDS
        )
    if (last - first).days + 1 > service.MAX_RANGE_DAYS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=RANGE_TOO_LONG
        )
    events = service.events_in_range(session, user, first, last, zone)
    return [_event_out(event, zone) for event in events]


@router.post("/events", status_code=status.HTTP_201_CREATED)
def create_event(
    body: EventCreate, user: CurrentUserDep, session: SessionDep, zone: TimezoneDep
) -> EventOut:
    event = service.create_event(
        session, user, title=body.title, notes=body.notes, when=_when(body.when, zone)
    )
    return _event_out(event, zone)


@router.get("/events/{event_id}", responses=EVENT_RESPONSES)
def get_event(
    event_id: uuid.UUID, user: CurrentUserDep, session: SessionDep, zone: TimezoneDep
) -> EventOut:
    event = service.get_event(session, user, event_id)
    if event is None:
        raise _not_found()
    return _event_out(event, zone)


@router.patch("/events/{event_id}", responses=EVENT_RESPONSES)
def update_event(
    event_id: uuid.UUID,
    body: EventUpdate,
    user: CurrentUserDep,
    session: SessionDep,
    zone: TimezoneDep,
) -> EventOut:
    """Change the title, notes or time of an event; fields left out stay as they are."""
    changes: dict[str, object] = {
        key: value for key, value in body.model_dump(exclude_unset=True).items() if key != "when"
    }
    if body.when is not None:
        changes["when"] = _when(body.when, zone)
    event = service.update_event(session, user, event_id, changes)
    if event is None:
        raise _not_found()
    return _event_out(event, zone)


@router.delete(
    "/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT, responses=EVENT_RESPONSES
)
def delete_event(event_id: uuid.UUID, user: CurrentUserDep, session: SessionDep) -> Response:
    """Delete the event for good."""
    if not service.delete_event(session, user, event_id):
        raise _not_found()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
