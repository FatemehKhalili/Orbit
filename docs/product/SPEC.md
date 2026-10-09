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
| Habits    | Build and track routines.                                    |
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
| 5+    | To be defined                                                         | Not started |

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
