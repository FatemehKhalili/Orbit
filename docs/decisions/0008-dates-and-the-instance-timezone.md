# 0008. Dates and the instance timezone

- Status: Accepted
- Date: 2026-10-11

## Context

Habits (Phase 5) is the first module that needs to know what "today" is: a habit is done
on a calendar day, not at an instant. Calendar and Finance will need the same answer.
Until now Orbit only stored timestamps (`timestamptz`), and nothing knew which timezone
the owner lives in. If each module worked out "today" on its own (in the API, in the web
server, in the browser) they could disagree around midnight, and a web server running in
UTC would put a late-evening check-off on the wrong day.

Orbit has one owner per instance ([ADR 0006](0006-owner-account-and-sessions.md)), so
one timezone per instance is enough.

## Decision

- **One instance timezone.** `ORBIT_TIMEZONE` is an IANA zone name such as
  `Europe/Berlin`, read by the API like every other setting
  ([ADR 0003](0003-configuration-through-environment-variables.md)). When it is not set
  the instance uses `UTC`, so existing installs keep starting after an upgrade. A value
  that is set but is not a known zone (including an empty value) stops the API at
  startup with an error naming the variable, instead of silently using the wrong day.
- **The zone database ships with the API.** The `tzdata` package is a dependency, so
  zone names resolve the same in the slim production image, in CI and locally, whatever
  the operating system provides.
- **The API alone decides "today".** `app/clock.py` provides `TodayDep`, the current
  date in the instance timezone. Code that needs "today" takes `TodayDep`; nothing calls
  `date.today()` or `datetime.now()` for a calendar date. Tests override the dependency,
  or the clock it reads, to pin the date.
- **Calendar dates are dates.** A value that means a day (a check-off, later an event
  day or a transaction date) is a PostgreSQL `DATE` and a JSON `"YYYY-MM-DD"` string,
  never a timestamp. Timestamps (`created_at` and so on) stay `timestamptz` in UTC.
- **`GET /time`** returns `{"timezone": ..., "today": "YYYY-MM-DD"}` for the signed-in
  owner. The web app never computes "today" or converts dates between zones: it shows
  the dates the API gives it and formats them as plain calendar dates.
- **Windows of days are computed by the API** from `TodayDep`. A module that limits which
  days may be changed (Habits: today and the six days before) checks it in the API and
  answers `422` for a day outside the window.

## Consequences

- Every module agrees on "today", and the boundary is local midnight in the instance
  timezone, whatever timezone the servers run in.
- Changing `ORBIT_TIMEZONE` later moves the boundary of "today" from then on; dates
  already stored stay the same calendar days. That is the expected behaviour for a
  calendar date.
- An owner who travels sees "today" in the instance timezone, not where they are. A
  per-user or per-browser timezone would need its own ADR.
- Tests that depend on the date must pin it; a test that passes only on some days is a
  bug in the test.
