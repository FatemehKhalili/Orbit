"""What day it is, in the instance timezone (ADR 0008).

Code that needs "today" takes `TodayDep` instead of calling `date.today()`, so every
module agrees on the date and tests can pin it.
"""

from datetime import UTC, date, datetime
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import Depends, Request


def utc_now() -> datetime:
    """The current instant. Tests replace this to cross a day boundary on purpose."""
    return datetime.now(UTC)


def today_in(zone: ZoneInfo, now: datetime) -> date:
    return now.astimezone(zone).date()


def get_today(request: Request) -> date:
    return today_in(request.app.state.timezone, utc_now())


def get_timezone(request: Request) -> ZoneInfo:
    return request.app.state.timezone


# Endpoint parameter types: `def handler(today: TodayDep, zone: TimezoneDep): ...`
TodayDep = Annotated[date, Depends(get_today)]
TimezoneDep = Annotated[ZoneInfo, Depends(get_timezone)]
