# 0007. Product module API conventions and ownership

- Status: Accepted
- Date: 2026-10-03
- Amended by: [ADR 0011](0011-calendar-events-and-time.md) (bounded date ranges instead of
  pagination for lists that grow by date)

## Context

Shopping (Phase 4) is the first product module that stores the owner's data. The other
modules will follow the same shape, so the rules it sets should be written down once.
Orbit has one owner per instance today ([ADR 0006](0006-owner-account-and-sessions.md)),
but module tables carry an `owner_id` so that a multi-user Orbit stays possible. That is
only worth anything if every query already respects it.

## Decision

- **Backend authorization, in SQL.** Every module query and mutation filters on
  `owner_id = <signed-in user>` in the database query itself: list, read, update and
  delete alike. A row is never loaded by ID alone and checked afterwards, and the web app
  never filters rows for security. Routes take `CurrentUserDep`; the existing OpenAPI test
  fails if a route does not.
- **Someone else's row is "not found".** A row that exists but belongs to another user
  gives the same `404` as a row that does not exist, so IDs reveal nothing.
- **Clients cannot set ownership or bookkeeping fields.** Request models forbid unknown
  fields (`extra="forbid"`), so a body carrying `owner_id`, `id`, `created_at` or
  `updated_at` is refused with `422`. `owner_id` always comes from the session.
- **Routes.** Each module has one router under `app/api/`, prefixed with the module name
  and a plural resource (`/shopping/items`). Collection: `GET` (list) and `POST` (create,
  `201`). Item: `GET`, `PATCH` (partial update, `200`), `DELETE` (`204`). In a `PATCH`
  body, a field that is left out stays as it is and `null` clears an optional field.
  A `PATCH` that changes anything is one owner-filtered `UPDATE ... RETURNING`, not a
  load followed by a flush, so a row deleted by another request at the same moment gives
  `404` rather than `500`. An empty `PATCH` only reads the row.
- **Text input.** Strings are trimmed. Required text must not be empty after trimming;
  optional text that is blank after trimming is stored as `NULL`. Every text column has
  a maximum length, enforced by both the request model and the column type. Text
  containing a NUL character is refused with `422`, because PostgreSQL cannot store it.
- **Errors** keep FastAPI's shape, `{"detail": ...}`: `401` without a valid session, `404`
  for a missing or foreign row (and the ID is checked to be a UUID, `422` otherwise),
  `422` for invalid input, `409` for a request the row's state does not allow (see the
  addendum).
- **No pagination until a module needs it.** Lists return every row of the owner, in a
  fixed order defined by the module.
- **Tests prove ownership** with a second user. The database allows only one user, so a
  test-only fixture drops `uq_users_is_owner` inside one transaction, adds a second user,
  serves the API on that connection and rolls back. PostgreSQL DDL is transactional, so
  the constraint is never missing for any other connection.

## Addendum: child resources and state rules (Phase 5, 2026-10-11)

Habits added a resource that belongs to another resource, and rules that depend on a
row's state. Later modules follow the same shape.

- **Child resources** sit under their parent: `/habits/habits/{id}/check-ins/{day}`.
  The child table carries its own `owner_id` (ADR 0006), and a composite foreign key
  `(parent_id, owner_id)` → `parent (id, owner_id)` makes the database keep the two
  owners equal. Every child query filters on the signed-in owner through the parent.
  A missing or foreign parent is `404`, exactly as for the parent itself.
- **Setting a state is a `PUT`, clearing it a `DELETE`**, both idempotent: "mark this day
  done" twice leaves one check-off, and clearing a state that is already clear is
  success (`204`). A repeated form submit can never flip the state back.
- **`409 Conflict`** answers a request that is valid but not allowed in the row's current
  state, with a `detail` that says what to do instead. Habits: deleting an active habit
  (archive it first), and changing an archived habit or its check-offs (unarchive it
  first).
- **Dates** follow [ADR 0008](0008-dates-and-the-instance-timezone.md).

## Consequences

- Ownership mistakes become test failures rather than review findings: each module tests
  that one user cannot read, update or delete another user's rows.
- Moving to several users would not need changes in module code.
- Lists are unbounded. That is fine for a personal shopping list; a module with growing
  history (Finance, Calendar) will need to add pagination and should say how.
