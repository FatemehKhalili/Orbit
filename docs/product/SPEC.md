# Orbit product specification

**Tagline:** Keep life in orbit.

## Concept

Orbit is a personal life management system: a Personal Life Operating System. The user
is at the centre, and each area of life is a module orbiting them. Orbit is open source
and self-hostable, so a person's life data stays under their control.

## MVP modules

| Module    | Purpose (one line, to be detailed in its own phase)          |
| --------- | ------------------------------------------------------------ |
| Dashboard | The centre: a summary of what matters across all modules.    |
| Finance   | Track money in and out.                                      |
| Calendar  | See and plan time.                                           |
| Habits    | Build and track routines (Phase 5, see below).               |
| Shopping  | Keep a shopping list (Phase 4, see below).                   |
| Wishlist  | Collect things you want, for yourself or as gift ideas.      |

## Principles

- **User at the centre.** Every module relates back to the person, not the other way round.
- **Private by default.** No real personal data in the repository, seeds or tests.
- **Minimal.** Add a dependency or abstraction only when a feature needs it.

## Out of scope for the MVP

- AI features
- External authentication providers
- Background workers and queues (no Redis)

## Phases

| Phase | Scope                                                                 | Status      |
| ----- | --------------------------------------------------------------------- | ----------- |
| 1     | Scaffolding: repo structure, apps, database, Compose, health, docs    | Complete    |
| 2     | Data foundations: Alembic migrations, model base, sessions, `uv.lock`, Dependabot | Complete    |
| 3     | Owner account and app shell: sign-in, sessions, signed-in layout and navigation, module placeholders, production image checks in CI | Complete    |
| 4     | Shopping: the first module, one personal shopping list per owner     | Complete    |
| 5     | Habits: daily habits checked off over the last seven days, archive and delete, one instance timezone | Complete    |
| 6     | Run Orbit for real: production deployment, backup and restore, sign-in throttling, data export, upgrade and rollback | Complete    |
| 7     | Today Dashboard: check off today's habits and the first shopping items from the Dashboard | Complete    |
| 8     | Calendar: all-day and timed events in a seven-day agenda, "Today's plans" on the Dashboard | Complete    |
| 9+    | To be defined (proposed for 9: two-way Google Calendar sync, ADR 0012) | Not started |

Phase 1 delivers no product features. The web app shows a placeholder with the six
modules and the backend's health.

Phase 1 checkpoint: tag `v0.1.0-phase1`, commit `9a555fd`, CI passing.

Phase 2 is infrastructure only and adds no product features or tables: the API gains
an empty baseline migration, a shared model base and per-request database sessions, and
its dependencies are locked. See ADRs 0004 and 0005.

Phase 3 makes Orbit safe to hold personal data and gives modules a place to live. It adds
no module features:

- One owner per instance, enforced by the database, created with the API's admin CLI
  (no sign-up page). Email and password, hashed with Argon2id.
- Server-side sessions: the API stores only a hash of each session token, and signing
  out revokes the session. The web app keeps the token in an HttpOnly cookie that is
  Secure in production (with a documented opt-out for plain-HTTP home networks).
- A login page, a signed-in layout with navigation to the six modules, the Dashboard
  placeholder and a "coming in a later phase" page for each other module.
- Conventions for module tables: UUID keys, timestamps and an `owner_id`.
- CI builds and starts both production images; the smoke test signs in and out.

Out of scope for Phase 3: module features, several users, external or social login,
password reset by email, login rate limiting, and the open Dependabot updates. See
ADR 0006.

## Phase 4: Shopping

Phase 4 builds the first real module. Every other module stays a placeholder, and the
Dashboard does not change.

**What the owner can do:** keep one shopping list. Add an item, edit it, check it off or
uncheck it, and delete it. Unchecked items come first, then items in the order they were
added.

**Shopping item:**

| Field      | Required | Rules                                                      |
| ---------- | -------- | ---------------------------------------------------------- |
| `name`     | yes      | 1 to 200 characters, trimmed                               |
| `quantity` | no       | Free text up to 50 characters, such as "2" or "500 g"     |
| `notes`    | no       | Up to 1,000 characters                                     |
| `checked`  | yes      | `false` when the item is added                             |

Each item also has an ID, its owner and its creation and update times.

**Security:** every API query and change is limited to the signed-in owner's own items in
the API itself; another user's item looks the same as one that does not exist (404). See
[ADR 0007](../decisions/0007-product-module-api-conventions.md), which sets the API
conventions later modules follow.

**Without JavaScript:** adding, editing, checking and deleting all work as plain form
posts. With JavaScript the same forms submit without reloading the page and show pending
states. Deliberate limits: editing opens its own page rather than editing in place, and
there is no loading placeholder while the list loads (it would need JavaScript to be
replaced by the list).

**Testing:** API tests cover every route, validation, and ownership with a second user
(reading, changing and deleting another user's items fails); web unit tests cover the API
client and form logic; the smoke test adds, checks, edits and deletes an item through the
real forms.

Out of scope for Phase 4: several lists, categories, prices, stores, priorities,
recurring items, sharing, reordering, a Dashboard summary, pagination, bulk actions such
as "clear checked items", undo, and a delete confirmation step. The open Dependabot
updates and login rate limiting stay separate.

## Phase 5: Habits

Phase 5 adds the second module. Every other module stays a placeholder, and the
Dashboard and navigation do not change.

**What the owner can do:** keep a list of daily habits. Add a habit, rename it or change
its notes, and check it off (or un-check it) for today or any of the six days before. A
habit they no longer track can be archived: it leaves the list, keeps its history and can
be restored. Only an archived habit can be deleted, and deleting it removes its history
for good.

**Habit:**

| Field         | Required | Rules                                                     |
| ------------- | -------- | --------------------------------------------------------- |
| `name`        | yes      | 1 to 100 characters, trimmed                              |
| `notes`       | no       | Up to 1,000 characters                                    |
| `archived_at` | no       | Empty while the habit is active                           |

A check-in is one calendar day on which a habit was done; a habit has at most one per
day. Each habit and check-in also has an ID, its owner and its creation and update times.

**Rules:**

- Every habit is daily. There are no schedules, targets or streaks.
- "Today" is the calendar date in one instance-wide timezone, `ORBIT_TIMEZONE` (an IANA
  name, default UTC). The API refuses to start with an unknown zone. Calendar and Finance
  will use the same convention. See
  [ADR 0008](../decisions/0008-dates-and-the-instance-timezone.md).
- Check-ins can be added or removed for today and the six days before, and for no other
  day. Older history is kept but not shown or changed.
- An archived habit is read-only: its name, notes and check-ins cannot change until it is
  restored (409). Deleting an active habit is refused (409); it must be archived first.
  The API enforces both rules, not only the pages.

**Security:** as in Phase 4, every query and change is limited to the signed-in owner's
own habits, another user's habit is a 404, and a check-in's owner always matches its
habit's owner (a database constraint).

**Without JavaScript:** every form (add, edit, check-in, archive, restore, delete) works
as a plain form post, as in Phase 4.

**Testing:** API tests cover every route, validation, archive and delete rules, the
seven-day window across a timezone day boundary, races with a concurrent delete, and
ownership with a second user; web unit tests cover the API client, form logic and the
seven-day strip (including a web server in another timezone); the smoke test adds a
habit, checks and un-checks today, archives, restores and deletes it through the real
forms.

Out of scope for Phase 5: streaks, statistics and charts, schedules other than daily,
targets or measurable habits, notes per check-in, history beyond seven days in the
pages, reminders, a timezone per user or habit, categories, reordering, a Dashboard
summary, Calendar integration, pagination, bulk actions, undo and a delete confirmation
step.

## Phase 6: Run Orbit for real

Phase 6 adds no module features. It makes Orbit something a person can install on a home
server or any Docker host and trust with their data: kept private by default, backed up,
recoverable, exportable, and safe to upgrade and roll back. See
[ADR 0009](../decisions/0009-production-deployment-backups-and-upgrades.md) and
[ADR 0010](../decisions/0010-sign-in-throttling-and-known-devices.md). The approved
planning report is on PR #17.

**Production deployment.** `compose.production.yml` runs the production images with a
one-off migration step before the API, health-ordered startup, restart on failure and its
own data volume. Only the web app is published, on 127.0.0.1; the API and database are
not reachable from outside Docker. An opt-in `https` profile adds Caddy with a local
certificate authority (or a public certificate). In production the API docs are off, the
web app sends security headers, and logs never contain passwords, tokens, cookies, query
strings or bodies. Guide: [docs/deployment/](../deployment/README.md).

**Backup and restore.** `scripts/backup.sh` writes a consistent database dump (mode 600,
never inside the repository) with a checksum, while Orbit runs; `--keep N` prunes.
`scripts/restore.sh` checks the file, restores into a new database and swaps it in,
refuses to replace data without `--force` and the typed database name, and keeps the
replaced database. Encryption, off-site copies, retention, scheduling, a recovery
runbook and the limits are documented in
[Backups and recovery](../deployment/backup-and-recovery.md).

**Sign-in throttling.** Failed sign-ins are counted in the database per email (known or
not), per client address behind a trusted proxy, and across the instance. Blocks start
at 30 seconds after five failures and double up to 15 minutes; they always end. A
blocked attempt gets 429 with `Retry-After` and the login page says how long to wait.
Browsers that have signed in before are counted on their own, so strangers cannot lock
the owner out of them, and `clear-login-blocks` lifts every block from the server.
Expired sessions and old sign-in records are purged on sign-in and by `purge-expired`.
Accepted limitation: someone who knows the owner's email can keep a browser that has
never signed in waiting, up to 15 minutes at a time; known browsers are unaffected.

**Data export.** "Download my data" gives the owner a JSON file with their account
details, every shopping item, and every habit with its full check-in history, following
a published, versioned schema ([docs/export/](../export/README.md)). It never contains the
password hash, sessions or other secrets, and it is not a backup.

**Upgrade and rollback.** Upgrading is: back up, check out the new tag, `up -d --build`.
Rolling back restores the pre-upgrade backup into the previous release; downgrade
migrations are never used on real data. The release process is in
[docs/releasing.md](../releasing.md).

**Testing:** API tests cover the throttle at its boundaries (the fifth failure, the cap,
expiry, a correct password while blocked, 50 concurrent attempts, unknown emails, known
devices, the global and address limits), the export (contents, schema, isolation, no
secrets) and the production defaults (docs off, log contents). CI adds three jobs: the
production stack (published ports, smoke test, HTTPS profile), a backup and restore round
trip that proves the data, export and password are identical after losing the volume,
and an upgrade from `v0.5.0-phase5` in place and into the production stack, with a
rollback by restoring the backup.

Out of scope for Phase 6: import, built-in backup encryption or scheduling, cloud backup
targets, published images, several users, password reset by email, two-factor sign-in,
metrics, a browser-test framework, the Node runtime upgrade and the open Dependabot
updates.

## Visual design

After Phase 6, the web app was redesigned (PR #20) without changing the API, routes or
forms. It ships with the next release.

- **Look:** warm cream surfaces, lavender and plum for the brand, and blush, mint and peach
  accents that each keep one meaning (mint for Habits, peach for Shopping, blush for
  Wishlist). Until Finance is built, its placeholder tile borrows mint; Finance's own tone
  is decided in its phase. Dark mode follows the system setting with a deep plum palette.
- **Layout:** a sidebar on wide screens and a scrolling row of modules on phones; a small
  planet-and-moon logo; friendly empty and "could not load" states.
- **Dashboard:** a greeting with today's date, read-only cards for today's habits and the
  shopping list, the backend status, a seven-day habit chart and the module orbit.
- **Rules for later work:** colours, radii, shadows, fonts and motion are tokens in
  `apps/web/src/app/globals.css`, and components use only their semantic names. Layouts use
  logical properties so right-to-left text mirrors, text meets WCAG AA contrast, keyboard
  focus is always visible, and animation respects reduced motion. No web fonts are fetched.

## Phase 7: Today Dashboard

Phase 7 makes the Dashboard something to act on, not only to read. It adds no module, no
API route, no table and no dependency, and it keeps the redesigned Dashboard's look and
card placement. Calendar, Finance and Wishlist stay placeholders.

**What the owner can do:**

- In a **Today's habits** card, see every active habit with a check button for today, and
  check it off or un-check it.
- In a **To buy** card, see the first five unchecked shopping items, in the order the
  Shopping page shows them, and check one off. When more are left, a link says how many
  and goes to the Shopping page.

**Rules:**

- Only today can be changed from the Dashboard; earlier days stay on the Habits page.
  "Today" comes from the API (`GET /time`, ADR 0008), never from the browser's clock.
- The Dashboard uses the same Server Actions, API calls and form helpers as the Habits and
  Shopping pages. Every module action also refreshes the Dashboard, so its counts, the
  week chart and the new cards always come from the same fresh data.
- Each form carries the state it switches to, so a repeated or doubled submit cannot flip
  it back. A button is disabled while its change is on the way and shows where it is
  going. A failure (for example the habit was archived, or the item deleted, in another
  tab) shows the module page's message under that row and leaves the button ready to try
  again.
- Archived habits and checked items never appear in the new cards. If a module cannot be
  loaded, its card says so and the rest of the Dashboard still works.

**Look:** the greeting, the three summary cards, the week chart and the module orbit keep
their place; the two new cards sit in one row between the summary cards and the week
chart (side by side on wide screens, stacked on phones). Habits use mint and Shopping uses
peach, from the existing design tokens. Everything works without JavaScript, in dark mode
and right to left, with visible keyboard focus.

**Testing:** web unit tests cover the Dashboard's view of today's habits and the shopping
preview (counts matching the summary cards, ordering, the five-item limit, archived and
checked rows left out), the target-state form fields, failure and retry, and the Dashboard
refresh after every module action. The smoke test checks a habit off for today and an item
off from the Dashboard's own forms, reloads the Dashboard to see the counts, and un-checks
the habit. The upgrade job now starts from `v0.6.0-phase6`.

Out of scope for Phase 7: adding, editing or deleting from the Dashboard, earlier days,
undo, reordering or hiding cards, streaks and statistics, notifications, and any Calendar,
Finance or Wishlist content.

## Phase 8: Calendar

Phase 8 turns the Calendar placeholder into a working module: events the owner adds,
edits and deletes, a seven-day agenda, and today's events on the Dashboard. Its model is
chosen so that two-way Google Calendar sync can be added later without changing stored
events (ADR 0011), but Phase 8 has no Google code, setting, table or dependency.

**What the owner can do:**

- **Add an event** on `/calendar`: a title, optional notes, and either **all day** (one
  day, or a span of days such as a trip) or **at a time** (a start date and time, and an
  optional end date and time). With no end time the event is a moment ("Dentist, 09:00").
  A timed event may cross midnight or span days.
- **See a seven-day agenda** starting today: every day listed, all-day events first, then
  timed events by start time. An event spanning days shows on every day it covers.
  Previous and Next move the seven days by seven; Today goes back.
- **Edit an event**, and **delete** it after confirming on a second step, from its edit
  page.
- On the Dashboard, a full-width **Today's plans** card under "At a glance": up to five of
  today's events in agenda order, "and N more today" when there are more, and a link with
  the number of events in the next seven days.

**Rules:**

- Times are typed and shown in the instance timezone (`ORBIT_TIMEZONE`) and stored as
  instants. A time that does not exist on a clock-change day is refused with a clear
  message; a time that happens twice means the first one. Changing the instance timezone
  later keeps timed events at the same moment, shown at the new local time.
- An all-day event's end day is inclusive. A timed event ending exactly at midnight is not
  shown on the next day.
- A title is 1 to 200 characters, notes at most 8,000, and an event spans at most 366 days.
- Past and future events can be changed alike. Only the owner's own events are visible.
- The API answers date ranges of at most 62 days instead of paginating (ADR 0011).
- The data export gains `calendar.events` (format 1.1).

**Look:** Calendar's existing lavender tone and components; the "soon" badge goes. Works
without JavaScript, in dark mode, at phone width and right to left.

**Testing:** API tests for every route, both event shapes, the day rules across midnight
and clock changes in several timezones, ownership and the range limit; web unit tests for
the forms, the agenda window and grouping, and the Dashboard card; the smoke test adds,
sees, edits, and deletes an event through the forms. The upgrade job starts from
`v0.7.0-phase7`, the first upgrade with a migration since Phase 6.

Out of scope for Phase 8: Google Calendar or any other sync, recurring events, reminders
and notifications, `.ics` import or export, a month grid, several calendars, colours or
categories, locations and attendees, a timezone per event, search, bulk actions and undo.
