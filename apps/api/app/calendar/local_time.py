"""Local days and times in the instance timezone, and the instants they stand for
(ADR 0011). The only place Calendar converts between the two.

Timed events are stored as UTC instants. The owner types, and the pages show, a local date
and time in `ORBIT_TIMEZONE`. Everything here takes the zone as an argument, so tests can
use any zone and the API passes `app.state.timezone`.
"""

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

# The earliest and latest instants Python can hold, which bound every stored event.
FIRST_INSTANT = datetime.min.replace(tzinfo=UTC)
LAST_INSTANT = datetime.max.replace(tzinfo=UTC)


class NonexistentLocalTime(ValueError):
    """A local time skipped when the clocks go forward (02:30 on a spring-forward day)."""


class OutOfRange(ValueError):
    """A local time whose instant falls outside FIRST_INSTANT..LAST_INSTANT, which happens
    only within a day of 0001-01-01 or 9999-12-31 (00:30 on 0001-01-01 in Berlin comes
    before 0001-01-01 00:00 UTC)."""


def to_instant(day: date, at: time, zone: ZoneInfo) -> datetime:
    """The instant of `day` at `at` in `zone`.

    A local time that happens twice (when the clocks go back) means the first one
    (`fold=0`). One that does not happen at all raises NonexistentLocalTime.
    """
    local = datetime.combine(day, at.replace(tzinfo=None, fold=0), tzinfo=zone)
    try:
        instant = local.astimezone(UTC)
        back = instant.astimezone(zone)
    except OverflowError:
        raise OutOfRange(f"{day.isoformat()} {at:%H:%M} in {zone.key} is out of range") from None
    # A skipped time comes back from UTC as a different wall time.
    if back.replace(tzinfo=None) != local.replace(tzinfo=None):
        raise NonexistentLocalTime(f"{day.isoformat()} {at:%H:%M} does not exist in {zone.key}")
    return instant


def day_start(day: date, zone: ZoneInfo) -> datetime:
    """The first instant of the local day `day`.

    Even where midnight itself is skipped (some zones change their clocks at 00:00),
    this is the instant the day begins: `fold=0` reads 00:00 with the offset before the
    change, which lands exactly on the change. OutOfRange where that instant is before
    year 1 (0001-01-01 east of UTC).
    """
    try:
        return datetime.combine(day, time(0), tzinfo=zone).astimezone(UTC)
    except OverflowError:
        raise OutOfRange(f"the start of {day.isoformat()} in {zone.key} is out of range") from None


def day_bounds(first: date, last: date, zone: ZoneInfo) -> tuple[datetime, datetime]:
    """The instants `[start, end)` covering the local days `first` to `last`, inclusive.
    Correct on 23- and 25-hour days.

    Any date may be asked for. Where a bound lies beyond the instants Python can hold
    (the start of 0001-01-01 east of UTC, the end of 9999-12-31), it is the first or last
    instant instead: no event can lie beyond it.
    """
    try:
        start = day_start(first, zone)
    except OutOfRange:
        start = FIRST_INSTANT
    if last == date.max:
        return start, LAST_INSTANT
    return start, day_start(last + timedelta(days=1), zone)


def local_day(instant: datetime, zone: ZoneInfo) -> date:
    return instant.astimezone(zone).date()


def local_time(instant: datetime, zone: ZoneInfo) -> str:
    """The local time of day as the pages show it, "HH:MM"."""
    return instant.astimezone(zone).strftime("%H:%M")


def timed_days(starts_at: datetime, ends_at: datetime, zone: ZoneInfo) -> tuple[date, date]:
    """The first and last local days a timed event is on.

    It is on a day when it starts before the day ends and ends after the day starts, so an
    event ending exactly at midnight is not on the next day. A point in time
    (`ends_at == starts_at`) is on the day it happens.
    """
    first = local_day(starts_at, zone)
    if ends_at <= starts_at:
        return first, first
    last = local_day(ends_at, zone)
    if last > first and ends_at == day_start(last, zone):
        last -= timedelta(days=1)
    return first, last
