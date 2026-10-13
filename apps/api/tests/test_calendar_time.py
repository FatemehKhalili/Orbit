"""Local days and times against instants (ADR 0011): clock changes, midnight and spans."""

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.calendar.local_time import (
    FIRST_INSTANT,
    LAST_INSTANT,
    NonexistentLocalTime,
    OutOfRange,
    day_bounds,
    day_start,
    local_day,
    local_time,
    timed_days,
    to_instant,
)

UTC_ZONE = ZoneInfo("UTC")
BERLIN = ZoneInfo("Europe/Berlin")
NEW_YORK = ZoneInfo("America/New_York")


def utc(*args: int) -> datetime:
    return datetime(*args, tzinfo=UTC)


@pytest.mark.parametrize(
    ("zone", "expected"),
    [
        (UTC_ZONE, utc(2026, 10, 14, 9, 0)),
        (BERLIN, utc(2026, 10, 14, 7, 0)),  # summer time, UTC+2
        (NEW_YORK, utc(2026, 10, 14, 13, 0)),  # daylight time, UTC-4
    ],
)
def test_a_local_time_is_the_matching_instant(zone, expected):
    assert to_instant(date(2026, 10, 14), time(9, 0), zone) == expected


def test_winter_and_summer_offsets_differ():
    assert to_instant(date(2026, 1, 14), time(9, 0), BERLIN) == utc(2026, 1, 14, 8, 0)
    assert to_instant(date(2026, 7, 14), time(9, 0), BERLIN) == utc(2026, 7, 14, 7, 0)


@pytest.mark.parametrize(
    ("zone", "day", "skipped"),
    [
        (BERLIN, date(2026, 3, 29), time(2, 30)),  # 02:00 jumps to 03:00
        (BERLIN, date(2026, 3, 29), time(2, 0)),
        (NEW_YORK, date(2026, 3, 8), time(2, 15)),
    ],
)
def test_a_time_skipped_when_clocks_go_forward_is_refused(zone, day, skipped):
    with pytest.raises(NonexistentLocalTime):
        to_instant(day, skipped, zone)


def test_the_minutes_around_a_skipped_hour_exist():
    assert to_instant(date(2026, 3, 29), time(1, 59), BERLIN) == utc(2026, 3, 29, 0, 59)
    assert to_instant(date(2026, 3, 29), time(3, 0), BERLIN) == utc(2026, 3, 29, 1, 0)


@pytest.mark.parametrize(
    ("zone", "day", "repeated", "first"),
    [
        # 03:00 goes back to 02:00, so 02:30 happens at 00:30 UTC and again at 01:30 UTC.
        (BERLIN, date(2026, 10, 25), time(2, 30), utc(2026, 10, 25, 0, 30)),
        (NEW_YORK, date(2026, 11, 1), time(1, 30), utc(2026, 11, 1, 5, 30)),
    ],
)
def test_a_time_that_happens_twice_means_the_first(zone, day, repeated, first):
    assert to_instant(day, repeated, zone) == first


def test_a_fold_on_the_input_is_ignored():
    assert to_instant(date(2026, 10, 25), time(2, 30, fold=1), BERLIN) == utc(2026, 10, 25, 0, 30)


def test_day_bounds_follow_23_and_25_hour_days():
    start, end = day_bounds(date(2026, 3, 29), date(2026, 3, 29), BERLIN)
    assert (start, end) == (utc(2026, 3, 28, 23, 0), utc(2026, 3, 29, 22, 0))
    assert end - start == timedelta(hours=23)

    start, end = day_bounds(date(2026, 10, 25), date(2026, 10, 25), BERLIN)
    assert end - start == timedelta(hours=25)

    start, end = day_bounds(date(2026, 10, 12), date(2026, 10, 18), UTC_ZONE)
    assert (start, end) == (utc(2026, 10, 12), utc(2026, 10, 19))


def test_a_day_whose_midnight_is_skipped_starts_at_the_change():
    zone = ZoneInfo("America/Santiago")  # Chile moves its clocks at midnight
    day = next(
        (
            date(2026, 1, 1) + timedelta(days=offset)
            for offset in range(365)
            if _midnight_is_skipped(date(2026, 1, 1) + timedelta(days=offset), zone)
        ),
        None,
    )
    if day is None:
        pytest.skip("this tzdata has no midnight change for America/Santiago in 2026")
    start = day_start(day, zone)
    assert local_day(start, zone) == day
    assert local_time(start, zone) == "01:00"
    assert local_day(start - timedelta(seconds=1), zone) == day - timedelta(days=1)


def _midnight_is_skipped(day: date, zone: ZoneInfo) -> bool:
    try:
        to_instant(day, time(0), zone)
    except NonexistentLocalTime:
        return True
    return False


def test_local_day_and_time_of_an_instant():
    instant = utc(2026, 10, 14, 22, 30)
    assert (local_day(instant, UTC_ZONE), local_time(instant, UTC_ZONE)) == (
        date(2026, 10, 14),
        "22:30",
    )
    assert (local_day(instant, BERLIN), local_time(instant, BERLIN)) == (
        date(2026, 10, 15),
        "00:30",
    )


def berlin(day: date, at: time) -> datetime:
    return to_instant(day, at, BERLIN)


D = date(2026, 10, 14)
NEXT = D + timedelta(days=1)


@pytest.mark.parametrize(
    ("starts_at", "ends_at", "days"),
    [
        # Same day.
        (berlin(D, time(9)), berlin(D, time(10)), (D, D)),
        # A point in time.
        (berlin(D, time(9)), berlin(D, time(9)), (D, D)),
        # Crossing midnight: on both days.
        (berlin(D, time(22, 30)), berlin(NEXT, time(6, 10)), (D, NEXT)),
        # Ending exactly at midnight: not on the next day.
        (berlin(D, time(22)), berlin(NEXT, time(0)), (D, D)),
        # A point in time at midnight: on that day.
        (berlin(NEXT, time(0)), berlin(NEXT, time(0)), (NEXT, NEXT)),
        # Starting at midnight and lasting a minute.
        (berlin(NEXT, time(0)), berlin(NEXT, time(0, 1)), (NEXT, NEXT)),
        # Several days.
        (berlin(D, time(18)), berlin(D + timedelta(days=3), time(12)), (D, D + timedelta(days=3))),
        # Several days, ending at midnight.
        (berlin(D, time(18)), berlin(D + timedelta(days=3), time(0)), (D, D + timedelta(days=2))),
    ],
)
def test_the_days_a_timed_event_is_on(starts_at, ends_at, days):
    assert timed_days(starts_at, ends_at, BERLIN) == days


def test_the_days_follow_the_instance_zone():
    # 22:30 to 23:30 UTC on the 14th is 00:30 to 01:30 on the 15th in Berlin.
    starts_at, ends_at = utc(2026, 10, 14, 22, 30), utc(2026, 10, 14, 23, 30)
    assert timed_days(starts_at, ends_at, UTC_ZONE) == (D, D)
    assert timed_days(starts_at, ends_at, BERLIN) == (NEXT, NEXT)


def test_an_event_ending_at_midnight_across_a_clock_change():
    # The night the clocks go back: 22:00 on the 24th to midnight on the 26th.
    starts_at = berlin(date(2026, 10, 24), time(22))
    ends_at = berlin(date(2026, 10, 26), time(0))
    assert timed_days(starts_at, ends_at, BERLIN) == (date(2026, 10, 24), date(2026, 10, 25))


# --- The first and last dates (0001-01-01, 9999-12-31) -----------------------------------

TOKYO = ZoneInfo("Asia/Tokyo")


@pytest.mark.parametrize("zone", [UTC_ZONE, BERLIN, NEW_YORK, TOKYO])
def test_day_bounds_cover_the_first_and_last_dates(zone):
    first, last = date(1, 1, 1), date(9999, 12, 31)

    assert day_bounds(last, last, zone)[1] == LAST_INSTANT
    assert day_bounds(first, first, zone)[0] <= day_start(date(1, 1, 2), zone)
    assert day_bounds(first, last, zone)[1] == LAST_INSTANT


def test_day_bounds_are_exact_where_the_instants_exist():
    # West of UTC the first day starts after 0001-01-01 00:00 UTC; east of it, before.
    assert day_bounds(date(1, 1, 1), date(1, 1, 1), NEW_YORK) == (
        day_start(date(1, 1, 1), NEW_YORK),
        day_start(date(1, 1, 2), NEW_YORK),
    )
    assert day_bounds(date(1, 1, 1), date(1, 1, 1), BERLIN)[0] == FIRST_INSTANT
    assert day_bounds(date(9999, 12, 30), date(9999, 12, 30), UTC_ZONE) == (
        utc(9999, 12, 30),
        utc(9999, 12, 31),
    )


def test_the_start_of_the_first_day_east_of_utc_is_out_of_range():
    with pytest.raises(OutOfRange):
        day_start(date(1, 1, 1), BERLIN)


@pytest.mark.parametrize(
    ("day", "at", "zone"),
    [
        (date(1, 1, 1), time(0, 30), BERLIN),  # 0000-12-31 23:36:32 UTC
        (date(1, 1, 1), time(0, 0), TOKYO),
        (date(9999, 12, 31), time(19, 0), NEW_YORK),  # 10000-01-01 00:00 UTC
    ],
)
def test_a_local_time_outside_the_instants_is_out_of_range(day, at, zone):
    with pytest.raises(OutOfRange):
        to_instant(day, at, zone)


@pytest.mark.parametrize(
    ("day", "at", "zone", "expected"),
    [
        (date(1, 1, 1), time(0, 0), UTC_ZONE, FIRST_INSTANT),
        (date(1, 1, 1), time(1, 0), BERLIN, utc(1, 1, 1, 0, 6, 32)),  # local mean time, +00:53:28
        (date(9999, 12, 31), time(23, 59), UTC_ZONE, utc(9999, 12, 31, 23, 59)),
        (date(9999, 12, 31), time(18, 59), NEW_YORK, utc(9999, 12, 31, 23, 59)),
    ],
)
def test_local_times_at_the_edges_that_exist_convert(day, at, zone, expected):
    assert to_instant(day, at, zone) == expected
