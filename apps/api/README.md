# Orbit API

FastAPI backend for Orbit. Deployable on its own: it needs only Python 3.11+ (or the
Docker image) and a PostgreSQL `DATABASE_URL`.

## Run locally

Dependencies are locked in `uv.lock`. With [uv](https://docs.astral.sh/uv/):

```bash
cd apps/api
uv sync --extra dev                         # creates .venv from uv.lock
cp .env.example .env                        # then set DATABASE_URL
.venv/bin/alembic upgrade head              # apply migrations
.venv/bin/uvicorn --factory app.main:create_app --reload
```

Without uv, `python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'` works too, but
does not use the lockfile. After changing dependencies in `pyproject.toml`, run `uv lock`.

The API listens on http://localhost:8000. Interactive docs are at `/docs` (not served when
`ORBIT_ENV=production`).

## Configuration

| Variable       | Required | Default       | Notes                                           |
| -------------- | -------- | ------------- | ----------------------------------------------- |
| `DATABASE_URL` | yes      | none          | `postgresql://user:pass@host:5432/db`           |
| `ORBIT_ENV`    | no       | `development` | One of `development`, `test`, `production`      |
| `ORBIT_SESSION_TTL_DAYS` | no | `30`       | How long a sign-in lasts, 1–365 days            |
| `ORBIT_TIMEZONE` | no     | `UTC`         | IANA zone that decides "today"; unknown or empty stops startup |
| `ORBIT_LOGIN_FREE_ATTEMPTS` | no | `5`     | Sign-in attempts per email, address or device before a block |
| `ORBIT_LOGIN_GLOBAL_FREE_ATTEMPTS` | no | `100` | Attempts across the instance (without a known device) before a block |
| `ORBIT_LOGIN_BLOCK_SECONDS` | no | `30`    | First block; each further failure doubles it        |
| `ORBIT_LOGIN_MAX_BLOCK_SECONDS` | no | `900` | Longest block; must be at least the first block   |

## Health endpoints

| Endpoint            | Meaning                                        | Codes      |
| ------------------- | ---------------------------------------------- | ---------- |
| `GET /health`       | Liveness: the process is up. No database call. | 200        |
| `GET /health/ready` | Readiness: the database answers `SELECT 1`.    | 200 / 503  |

## Owner account and sessions

Each instance has exactly one owner; the database refuses a second row in `users`. Create
the owner once from the command line (there is no sign-up endpoint):

```bash
.venv/bin/python -m app.cli create-owner --email you@example.com --name "Your Name"
.venv/bin/python -m app.cli set-password      # new password; signs out every session
.venv/bin/python -m app.cli clear-login-blocks  # lift every sign-in block at once
.venv/bin/python -m app.cli purge-expired       # delete expired sessions and old throttle rows
```

Both prompt for the password, or read one line from stdin with `--password-stdin`.
Passwords need at least 12 characters.

| Endpoint            | Auth   | Meaning                                                    |
| ------------------- | ------ | ---------------------------------------------------------- |
| `POST /auth/login`  | none   | `{"email", "password", "device_token"?, "client_ip"?}` → `{"token", "expires_at", "user", "device_token"}`; 401 for any wrong email or password, 429 with `Retry-After` while throttled |
| `POST /auth/logout` | Bearer | Revokes this session. 204                                  |
| `GET /auth/me`      | Bearer | The owner: `{"id", "email", "display_name"}`               |

Send the token as `Authorization: Bearer <token>`. Only its SHA-256 hash is stored.
New endpoints protect themselves with `user: CurrentUserDep` (from `app.auth.dependencies`).
See [ADR 0006](../../docs/decisions/0006-owner-account-and-sessions.md).

Sign-in is throttled per email (known or not), per client address (`client_ip`, which
the web app sends only behind a trusted proxy) and across the instance; a blocked attempt
is refused before the password is checked. `device_token` comes back with every successful
sign-in (new on a browser's first, its own again after that, so it is renewed); sending it
back counts that browser's attempts on their own, so a
blocked account never locks out a browser that signed in before. Only hashes of emails,
addresses and device tokens are stored.
See [ADR 0010](../../docs/decisions/0010-sign-in-throttling-and-known-devices.md).

## Export

| Endpoint              | Meaning                                                            |
| --------------------- | ------------------------------------------------------------------ |
| `GET /account/export` | The signed-in owner's data as one JSON file (attachment, `no-store`) |

Format and exclusions: [docs/export/](../../docs/export/README.md). A test fails when a
table is neither exported nor excluded with a reason, and when the published schema
differs from the code.

## Logs

In production each request is logged as method, path (no query string), status and time.
Headers, cookies, tokens and bodies are never logged, and sign-in logs never name the
email or address. Uvicorn's own access log is off in the image.

## Shopping

| Endpoint                         | Meaning                                                   |
| -------------------------------- | --------------------------------------------------------- |
| `GET /shopping/items`            | The owner's items: unchecked first, then oldest first     |
| `POST /shopping/items`           | `{"name", "quantity"?, "notes"?}` → the item, 201         |
| `GET /shopping/items/{id}`       | One item, or 404                                          |
| `PATCH /shopping/items/{id}`     | Any of `name`, `quantity`, `notes`, `checked`; `null` clears quantity or notes |
| `DELETE /shopping/items/{id}`    | 204, or 404                                               |

All need a session. Every query filters on the signed-in owner; another user's item is a
404, and request bodies refuse unknown fields such as `owner_id`. Later modules follow the
same rules: [ADR 0007](../../docs/decisions/0007-product-module-api-conventions.md).

## Dates and the instance timezone

One timezone per instance, `ORBIT_TIMEZONE`, decides which calendar day is "today" for
every module ([ADR 0008](../../docs/decisions/0008-dates-and-the-instance-timezone.md)).
Endpoints that need it take `today: TodayDep` (from `app.clock`) instead of calling
`date.today()`, so tests can pin it. Calendar dates are sent as `YYYY-MM-DD`.

| Endpoint    | Meaning                                                         |
| ----------- | --------------------------------------------------------------- |
| `GET /time` | `{"timezone", "today"}`, so clients never work out "today" themselves |

## Habits

| Endpoint                                     | Meaning                                                   |
| -------------------------------------------- | --------------------------------------------------------- |
| `GET /habits/habits`                         | Active habits, oldest first; `?archived=true` for archived ones, most recently archived first |
| `POST /habits/habits`                        | `{"name", "notes"?}` → the habit, 201                     |
| `GET /habits/habits/{id}`                    | One habit, or 404                                         |
| `PATCH /habits/habits/{id}`                  | Any of `name`, `notes`, `archived`; `null` clears notes   |
| `DELETE /habits/habits/{id}`                 | Deletes an archived habit and its check-ins, 204; 409 if it is still active |
| `PUT /habits/habits/{id}/check-ins/{day}`    | Marks the habit done on that day, 204 (repeating is fine) |
| `DELETE /habits/habits/{id}/check-ins/{day}` | Marks it not done, 204 (already not done is fine)         |

Each habit comes with `check_ins`: the days in the current window when it was done. Only
today and the six days before can be changed (422 otherwise). An archived habit is
read-only: changing its name, notes or check-ins is a 409 until it is unarchived. Its
history is kept. Ownership works as in Shopping.

## Calendar

| Endpoint                          | Meaning                                                   |
| --------------------------------- | --------------------------------------------------------- |
| `GET /calendar/events?from=&to=`  | Events on any local day from `from` to `to` (inclusive, at most 62 days): all-day first, then by start |
| `POST /calendar/events`           | `{"title", "notes"?, "when"}` → the event, 201            |
| `GET /calendar/events/{id}`       | One event, or 404                                         |
| `PATCH /calendar/events/{id}`     | Any of `title`, `notes`, `when`; `null` clears notes; `when` replaces the time whole |
| `DELETE /calendar/events/{id}`    | 204, or 404                                               |

`when` is `{"all_day": true, "start_day", "end_day"?}` (inclusive days) or
`{"all_day": false, "start_day", "start_time", "end_day"?, "end_time"?}` with local
`"HH:MM"` times in `ORBIT_TIMEZONE`; without an end time a timed event is a point in time.
Responses carry the local days and times, the stored instants (`starts_at`, `ends_at`), and
`first_day` and `last_day`: the days the event is on. An event ending exactly at midnight
is not on the next day. A time skipped when the clocks go forward is a 422; a repeated
time takes its first occurrence. An event lasts at most 366 days, measured in real time.
Any date from 0001-01-01 to 9999-12-31 can be listed; a time whose instant would fall
before year 1 or after year 9999 in UTC (only possible on those first and last days) is a
422. Every write goes through
`app/calendar/service.py`
([ADR 0011](../../docs/decisions/0011-calendar-events-and-time.md)). Ownership works as in
Shopping.

## Database migrations

Alembic, configured in `alembic.ini` and `migrations/`. It reads `DATABASE_URL` the same
way the API does. Models subclass `app.models.Base` and must be imported in
`app/models/__init__.py` so autogenerate sees them. Use the mixins in
`app/models/mixins.py`: UUID primary key, timestamps, and `OwnedMixin` (`owner_id`) for
every product-module table.

```bash
.venv/bin/alembic upgrade head                          # apply all migrations
.venv/bin/alembic revision --autogenerate -m "add x"    # new revision from model changes
.venv/bin/alembic check                                 # fail if models and migrations differ
.venv/bin/alembic downgrade -1                          # undo the last revision
```

The API never migrates on startup. Docker Compose runs `alembic upgrade head` before
starting the API; `compose.production.yml` runs it as its one-off `migrate` service.
Downgrades exist for development; real data is rolled back by restoring a backup
([ADR 0009](../../docs/decisions/0009-production-deployment-backups-and-upgrades.md)).

Endpoints get a database session with `session: SessionDep` (from `app.database`); one
session per request, closed afterwards, committed only when the endpoint calls `commit()`.

## Tests and lint

```bash
.venv/bin/pytest
.venv/bin/ruff check . && .venv/bin/ruff format --check .
```

Tests marked `integration` need a real database and are skipped unless `TEST_DATABASE_URL`
is set. They run the migrations up and down against it, so use a dedicated test database.

## Docker

```bash
docker build -t orbit-api .                 # production image (default target)
docker run --rm -e DATABASE_URL=... orbit-api alembic upgrade head   # migrate first
docker run -p 8000:8000 -e DATABASE_URL=... orbit-api
docker run --rm -it -e DATABASE_URL=... orbit-api python -m app.cli create-owner --email ... --name ...
```
