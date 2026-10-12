"""The owner's data export (ADR 0009, docs/export/README.md).

One JSON document with everything the signed-in owner can reach in the product modules,
active and archived, including the full check-in history. It is for the owner to keep
or take elsewhere; it cannot restore Orbit (that is what backups are for).

Every query filters on the signed-in owner in SQL (ADR 0007). The account section is
built field by field: the password hash, sessions, known devices and sign-in throttle
state are never part of an export.
"""

import uuid
from datetime import date, datetime
from importlib.metadata import version
from typing import Literal

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app import clock
from app.auth.dependencies import CurrentUserDep
from app.clock import TodayDep
from app.database import SessionDep
from app.models import CalendarEvent, Habit, HabitCheckIn, ShoppingItem

router = APIRouter(prefix="/account", tags=["account"])

FORMAT = "orbit-export"
# Major: a change that breaks readers. Minor: something added, such as a new module.
FORMAT_VERSION = "1.1"

# Every table and whether an export includes it. A test fails when a table is missing
# here, so a new module has to decide (docs/export/README.md lists the same reasons).
EXPORTED_TABLES = {
    "users": "account: email, display name and creation time only",
    "shopping_items": "shopping.items",
    "habits": "habits.habits",
    "habit_check_ins": "habits.habits[].check_ins",
    "calendar_events": "calendar.events",
}
EXCLUDED_TABLES = {
    "sessions": "authentication secrets (token hashes)",
    "login_devices": "authentication secrets (device token hashes)",
    "login_throttles": "security state, not the owner's data",
}


class _Out(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AccountOut(_Out):
    email: str
    display_name: str
    created_at: datetime


class ShoppingItemOut(_Out):
    id: uuid.UUID
    name: str
    quantity: str | None
    notes: str | None
    checked: bool
    created_at: datetime
    updated_at: datetime


class ShoppingOut(_Out):
    items: list[ShoppingItemOut] = Field(description="Every item, in the order added")


class CheckInOut(_Out):
    day: date = Field(description="A calendar day in the instance timezone (ADR 0008)")
    created_at: datetime


class HabitOut(_Out):
    id: uuid.UUID
    name: str
    notes: str | None
    archived_at: datetime | None = Field(description="Null while the habit is active")
    created_at: datetime
    updated_at: datetime
    check_ins: list[CheckInOut] = Field(description="Every day the habit was done, oldest first")


class HabitsOut(_Out):
    habits: list[HabitOut] = Field(
        description="Every habit, active and archived, in the order added"
    )


class CalendarEventOut(_Out):
    id: uuid.UUID
    title: str
    notes: str | None
    all_day: bool
    start_day: date | None = Field(description="All-day events: the first day; else null")
    end_day: date | None = Field(description="All-day events: the last day, inclusive; else null")
    starts_at: datetime | None = Field(description="Timed events: the start; else null")
    ends_at: datetime | None = Field(
        description="Timed events: the end, equal to the start for a point in time; else null"
    )
    created_at: datetime
    updated_at: datetime


class CalendarOut(_Out):
    events: list[CalendarEventOut] = Field(description="Every event, in the order added")


class ExportOut(_Out):
    """An Orbit data export. Times are UTC timestamps; days are calendar dates."""

    format: Literal["orbit-export"]
    format_version: Literal["1.1"]
    exported_at: datetime
    orbit_version: str
    timezone: str = Field(description="The instance timezone that defines calendar days")
    account: AccountOut
    shopping: ShoppingOut
    habits: HabitsOut
    calendar: CalendarOut


@router.get(
    "/export",
    responses={200: {"description": "The export, as a JSON file download"}},
)
def export(
    request: Request, response: Response, user: CurrentUserDep, session: SessionDep, today: TodayDep
) -> ExportOut:
    """Everything the signed-in owner has in Orbit, as one JSON document."""
    items = session.scalars(
        select(ShoppingItem)
        .where(ShoppingItem.owner_id == user.id)
        .order_by(ShoppingItem.created_at, ShoppingItem.id)
    ).all()
    habits = session.scalars(
        select(Habit).where(Habit.owner_id == user.id).order_by(Habit.created_at, Habit.id)
    ).all()
    events = session.scalars(
        select(CalendarEvent)
        .where(CalendarEvent.owner_id == user.id)
        .order_by(CalendarEvent.created_at, CalendarEvent.id)
    ).all()
    check_ins: dict[uuid.UUID, list[CheckInOut]] = {habit.id: [] for habit in habits}
    for check_in in session.scalars(
        select(HabitCheckIn)
        .where(HabitCheckIn.owner_id == user.id)
        .order_by(HabitCheckIn.day, HabitCheckIn.id)
    ):
        check_ins[check_in.habit_id].append(
            CheckInOut(day=check_in.day, created_at=check_in.created_at)
        )

    response.headers["Content-Disposition"] = (
        f'attachment; filename="orbit-export-{today.isoformat()}.json"'
    )
    response.headers["Cache-Control"] = "no-store"
    return ExportOut(
        format=FORMAT,
        format_version=FORMAT_VERSION,
        exported_at=clock.utc_now(),
        orbit_version=version("orbit-api"),
        timezone=request.app.state.settings.timezone,
        account=AccountOut(
            email=user.email, display_name=user.display_name, created_at=user.created_at
        ),
        shopping=ShoppingOut(
            items=[
                ShoppingItemOut(
                    id=item.id,
                    name=item.name,
                    quantity=item.quantity,
                    notes=item.notes,
                    checked=item.checked,
                    created_at=item.created_at,
                    updated_at=item.updated_at,
                )
                for item in items
            ]
        ),
        habits=HabitsOut(
            habits=[
                HabitOut(
                    id=habit.id,
                    name=habit.name,
                    notes=habit.notes,
                    archived_at=habit.archived_at,
                    created_at=habit.created_at,
                    updated_at=habit.updated_at,
                    check_ins=check_ins[habit.id],
                )
                for habit in habits
            ]
        ),
        calendar=CalendarOut(
            events=[
                CalendarEventOut(
                    id=event.id,
                    title=event.title,
                    notes=event.notes,
                    all_day=event.all_day,
                    start_day=event.start_day,
                    end_day=event.end_day,
                    starts_at=event.starts_at,
                    ends_at=event.ends_at,
                    created_at=event.created_at,
                    updated_at=event.updated_at,
                )
                for event in events
            ]
        ),
    )


def export_json_schema() -> dict:
    """The published schema (docs/export/orbit-export-1.schema.json) comes from here."""
    schema = ExportOut.model_json_schema(mode="serialization")
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        **schema,
        "title": "Orbit data export, format 1",
    }


if __name__ == "__main__":
    import json

    print(json.dumps(export_json_schema(), indent=2))
