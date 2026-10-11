"""The instance timezone and today's date, for clients that show dates (ADR 0008)."""

from datetime import date

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.auth.dependencies import CurrentUserDep
from app.clock import TodayDep

router = APIRouter(tags=["time"])


class TimeOut(BaseModel):
    timezone: str
    today: date


@router.get("/time")
def get_time(request: Request, user: CurrentUserDep, today: TodayDep) -> TimeOut:
    """The calendar date that counts as today for the signed-in owner, and its timezone."""
    return TimeOut(timezone=request.app.state.settings.timezone, today=today)
