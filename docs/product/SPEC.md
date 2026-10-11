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
| 6+    | To be defined                                                         | Not started |

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
