"""The Habits module: daily habits and the days they were done (ADR 0007, ADR 0008).

Every query below filters on the signed-in user's `owner_id` in SQL. A habit that belongs
to someone else is "not found", exactly like one that does not exist. Check-ins are
reached only through their own habit, and the database keeps their owner equal to it.

State rules (409): an active habit must be archived before it can be deleted, and an
archived habit and its check-ins are read-only until it is unarchived.
"""

import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Query, Response, status
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy import delete, func, literal, select, update
from sqlalchemy.dialects.postgresql import insert

from app.api.text import blank_to_none, optional_text, required_text
from app.auth.dependencies import CurrentUserDep
from app.clock import TodayDep
from app.database import SessionDep
from app.models import Habit, HabitCheckIn, User
from app.models.habits import NAME_MAX_LENGTH, NOTES_MAX_LENGTH

router = APIRouter(prefix="/habits", tags=["habits"])

# Check-ins can be changed for today and the six days before (ADR 0008).
WINDOW_DAYS = 7

Name = required_text(NAME_MAX_LENGTH)
Notes = optional_text(NOTES_MAX_LENGTH)

NOT_FOUND = "Habit not found"
ARCHIVED = "This habit is archived and read-only. Unarchive it to change it."
ACTIVE = "Only archived habits can be deleted. Archive the habit first."
OUTSIDE_WINDOW = f"Only today and the {WINDOW_DAYS - 1} days before can be changed."

# A calendar date in the path, strictly YYYY-MM-DD.
Day = Annotated[str, Path(pattern=r"^\d{4}-\d{2}-\d{2}$", examples=["2026-10-11"])]


class _HabitInput(BaseModel):
    # Unknown fields (owner_id, id, archived_at, check_ins, timestamps) are refused.
    model_config = ConfigDict(extra="forbid")

    notes: Notes | None = None

    @field_validator("notes")
    @classmethod
    def _blank_to_none(cls, value: str | None) -> str | None:
        return blank_to_none(value)


class HabitCreate(_HabitInput):
    name: Name


class HabitUpdate(_HabitInput):
    """Partial update: a field left out stays as it is; `null` clears notes."""

    name: Name | None = None
    archived: bool | None = None

    @field_validator("name", "archived")
    @classmethod
    def _not_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("may be left out, but not null")
        return value


class HabitOut(BaseModel):
    id: uuid.UUID
    name: str
    notes: str | None
    archived: bool
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime
    # The days inside the current window when the habit was done, oldest first.
    check_ins: list[date]


def window(today: date) -> tuple[date, date]:
    return today - timedelta(days=WINDOW_DAYS - 1), today


def _habit_out(habit: Habit, check_ins: list[date]) -> HabitOut:
    return HabitOut(
        id=habit.id,
        name=habit.name,
        notes=habit.notes,
        archived=habit.archived_at is not None,
        archived_at=habit.archived_at,
        created_at=habit.created_at,
        updated_at=habit.updated_at,
        check_ins=check_ins,
    )


def _with_check_ins(
    session: SessionDep, user: User, habits: list[Habit], today: date
) -> list[HabitOut]:
    """Each habit with its check-ins inside the window, in one query for all of them."""
    days: dict[uuid.UUID, list[date]] = defaultdict(list)
    if habits:
        start, end = window(today)
        rows = session.execute(
            select(HabitCheckIn.habit_id, HabitCheckIn.day)
            .where(
                HabitCheckIn.owner_id == user.id,
                HabitCheckIn.habit_id.in_([habit.id for habit in habits]),
                HabitCheckIn.day.between(start, end),
            )
            .order_by(HabitCheckIn.day)
        )
        for habit_id, day in rows:
            days[habit_id].append(day)
    return [_habit_out(habit, days[habit.id]) for habit in habits]


def _owned_habits(user: User):
    return select(Habit).where(Habit.owner_id == user.id)


def _get_owned_habit(session: SessionDep, user: User, habit_id: uuid.UUID) -> Habit:
    habit = session.scalar(_owned_habits(user).where(Habit.id == habit_id))
    if habit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    return habit


def _changeable_day(value: str, today: date) -> date:
    """The path's date, if it is a real date inside the window; 422 otherwise."""
    try:
        day = date.fromisoformat(value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Not a valid date"
        ) from None
    start, end = window(today)
    if not start <= day <= end:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=OUTSIDE_WINDOW
        )
    return day


def _explain_no_change(session: SessionDep, user: User, habit_id: uuid.UUID) -> Habit:
    """After a write that matched nothing: 404 for a missing or foreign habit, 409 for an
    archived one. Returns the (active) habit otherwise."""
    habit = _get_owned_habit(session, user, habit_id)
    if habit.archived_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=ARCHIVED)
    return habit


HABIT_RESPONSES = {404: {"description": NOT_FOUND}}
STATE_RESPONSES = {**HABIT_RESPONSES, 409: {"description": f"{ARCHIVED} / {ACTIVE}"}}


@router.get("/habits")
def list_habits(
    user: CurrentUserDep,
    session: SessionDep,
    today: TodayDep,
    archived: Annotated[bool, Query(description="Archived habits instead of active")] = False,
) -> list[HabitOut]:
    """Active habits, oldest first; or archived habits, most recently archived first."""
    query = _owned_habits(user)
    if archived:
        query = query.where(Habit.archived_at.is_not(None)).order_by(
            Habit.archived_at.desc(), Habit.id
        )
    else:
        query = query.where(Habit.archived_at.is_(None)).order_by(Habit.created_at, Habit.id)
    return _with_check_ins(session, user, list(session.scalars(query)), today)


@router.post("/habits", status_code=status.HTTP_201_CREATED)
def create_habit(body: HabitCreate, user: CurrentUserDep, session: SessionDep) -> HabitOut:
    habit = Habit(owner_id=user.id, **body.model_dump())
    session.add(habit)
    session.commit()
    session.refresh(habit)
    return _habit_out(habit, [])


@router.get("/habits/{habit_id}", responses=HABIT_RESPONSES)
def get_habit(
    habit_id: uuid.UUID, user: CurrentUserDep, session: SessionDep, today: TodayDep
) -> HabitOut:
    return _with_check_ins(session, user, [_get_owned_habit(session, user, habit_id)], today)[0]


@router.patch("/habits/{habit_id}", responses=STATE_RESPONSES)
def update_habit(
    habit_id: uuid.UUID,
    body: HabitUpdate,
    user: CurrentUserDep,
    session: SessionDep,
    today: TodayDep,
) -> HabitOut:
    """Rename, edit notes, archive (`archived: true`) or unarchive (`archived: false`).

    An archived habit is read-only: only unarchiving it is allowed.
    """
    changes = body.model_dump(exclude_unset=True)
    if not changes:
        return get_habit(habit_id, user, session, today)
    values: dict[str, object] = {k: v for k, v in changes.items() if k != "archived"}
    if "archived" in changes:
        # Archiving twice keeps the first time.
        values["archived_at"] = (
            func.coalesce(Habit.archived_at, func.now()) if changes["archived"] else None
        )
    statement = update(Habit).where(Habit.owner_id == user.id, Habit.id == habit_id)
    if "name" in changes or "notes" in changes:
        statement = statement.where(Habit.archived_at.is_(None))
    # One owner-filtered UPDATE ... RETURNING (ADR 0007).
    habit = session.scalar(statement.values(**values).returning(Habit))
    if habit is None:
        _explain_no_change(session, user, habit_id)
        raise AssertionError("unreachable: an active habit matches the update")
    session.commit()
    return _with_check_ins(session, user, [habit], today)[0]


@router.delete(
    "/habits/{habit_id}", status_code=status.HTTP_204_NO_CONTENT, responses=STATE_RESPONSES
)
def delete_habit(habit_id: uuid.UUID, user: CurrentUserDep, session: SessionDep) -> Response:
    """Delete an archived habit and all its check-ins, for good."""
    result = session.execute(
        delete(Habit).where(
            Habit.owner_id == user.id, Habit.id == habit_id, Habit.archived_at.is_not(None)
        )
    )
    if result.rowcount == 0:
        _get_owned_habit(session, user, habit_id)  # 404 if missing or foreign
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=ACTIVE)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put(
    "/habits/{habit_id}/check-ins/{day}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=STATE_RESPONSES,
)
def check_in(
    habit_id: uuid.UUID, day: Day, user: CurrentUserDep, session: SessionDep, today: TodayDep
) -> Response:
    """Mark the habit done on `day`. Doing it again changes nothing."""
    on = _changeable_day(day, today)
    # One statement: insert only for the caller's own active habit; a repeat is a no-op.
    active_habit = select(literal(uuid.uuid4()), Habit.owner_id, Habit.id, literal(on)).where(
        Habit.owner_id == user.id, Habit.id == habit_id, Habit.archived_at.is_(None)
    )
    result = session.execute(
        insert(HabitCheckIn)
        .from_select(["id", "owner_id", "habit_id", "day"], active_habit)
        .on_conflict_do_nothing(index_elements=["habit_id", "day"])
        .returning(HabitCheckIn.id)
    )
    if result.first() is None:
        _explain_no_change(session, user, habit_id)  # else: already done that day
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/habits/{habit_id}/check-ins/{day}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=STATE_RESPONSES,
)
def clear_check_in(
    habit_id: uuid.UUID, day: Day, user: CurrentUserDep, session: SessionDep, today: TodayDep
) -> Response:
    """Mark the habit not done on `day`. Already not done is fine."""
    on = _changeable_day(day, today)
    own_active_habit = select(Habit.id).where(
        Habit.owner_id == user.id, Habit.id == habit_id, Habit.archived_at.is_(None)
    )
    result = session.execute(
        delete(HabitCheckIn).where(
            HabitCheckIn.owner_id == user.id,
            HabitCheckIn.habit_id.in_(own_active_habit),
            HabitCheckIn.day == on,
        )
    )
    if result.rowcount == 0:
        _explain_no_change(session, user, habit_id)  # else: was not done that day
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
