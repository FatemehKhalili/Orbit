# 0011. Calendar events and time

- Status: Accepted
- Date: 2026-10-12
- Amends: [ADR 0008](0008-dates-and-the-instance-timezone.md) for values with a time of
  day, and [ADR 0007](0007-product-module-api-conventions.md) for lists that grow without
  bound.

## Context

Calendar (Phase 8) is the first module whose values have a time of day, and the first
whose list grows for ever. ADR 0008 decided that a day is a `DATE` and that the API alone
decides "today" in one instance timezone, but said nothing about times of day. ADR 0007
deferred pagination "until a module needs it" and asked growing modules to say how.

Two-way Google Calendar sync is a long-term goal (Phase 9, [ADR 0012](0012-google-calendar-sync.md)).
Google models an event as either all-day (`date`, end exclusive) or timed (`dateTime`
instants with a zone), and timed events may cross midnight. A Phase 8 model that differs
would need a data migration once sync arrives.

## Decision

- **Two shapes, kept apart by a check constraint.** All-day events have `start_day` and
  `end_day` (`DATE`, end inclusive) and no instants. Timed events have `starts_at` and
  `ends_at` (`timestamptz`, `ends_at >= starts_at`) and no days. Timed events may cross
  midnight or span days; an event with `ends_at = starts_at` is a point in time (the
  form's end time is optional).
- **Limits that guard typing are request rules, not database rules.** A span of at most
  366 days and a non-blank title are checked when the owner saves; the database checks
  shape, order and length only, so data from elsewhere (Phase 9) is never refused for a
  rule that only guards the form.
- **Which days an event is on.** All-day: `start_day <= D <= end_day`. Timed:
  `starts_at < D+1 00:00` and `ends_at > D 00:00` in the instance zone, so an event ending
  exactly at midnight is not on the next day; a point in time is on the day of
  `starts_at`. Range queries use the same overlap test.
- **Times are entered and shown in the instance timezone, and stored as instants.** The
  API converts a local date and time to an instant with `ORBIT_TIMEZONE`, refuses a local
  time that does not exist (the hour skipped when clocks go forward, `422`), and takes
  the first of a local time that happens twice. Every event comes back with its instants,
  its local start and end (`start_day`, `start_time`, `end_day`, `end_time`) and the
  first and last local days it covers (`first_day`, `last_day`). The web app shows those
  values and never converts a time (ADR 0008 unchanged in that respect).
- **Changing `ORBIT_TIMEZONE`** shows timed events at the same instant in the new zone;
  all-day events stay on their days.
- **Bounded ranges instead of pagination.** A module whose list grows by date answers
  range queries (`?from=YYYY-MM-DD&to=YYYY-MM-DD`, local days, both inclusive) of a
  module-defined maximum (Calendar: 62 days, `422` above), returning every row that
  overlaps, in a fixed order. Finance will follow the same rule.
- **IDs are Orbit UUIDs.** A UUID with dashes is not a valid Google event ID; its 32
  lowercase hex digits are (Google allows base32hex, `a–v` and `0–9`, 5–1024 characters,
  and recommends RFC 4122 UUIDs). Phase 9 derives `google_id = uuid.hex` only when Orbit
  creates the Google copy, and always stores the Google ID it uses; the two are never
  assumed interchangeable.
- **One write path.** Every Calendar create, update and delete goes through
  `app/calendar/service.py`, so later behaviour (sync) attaches in one place. The router
  holds no write statements.

## Consequences

- Google events fit the table as they are; Phase 9 adds link tables, not a migration of
  existing rows.
- Displaying a timed event needs the API's conversion, which it already does for "today".
- A traveller still sees times in the instance zone (ADR 0008's accepted limitation).
- Range limits keep every Calendar response bounded without page tokens.
