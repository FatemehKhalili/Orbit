# Orbit architecture

## Overview

```
 Browser ──HTTP──▶ apps/web (Next.js) ──HTTP, server-side──▶ apps/api (FastAPI) ──SQL──▶ PostgreSQL
```

Three runtime components, each deployable on its own:

| Component | Path       | Runtime            | Port | Image target |
| --------- | ---------- | ------------------ | ---- | ------------ |
| Web       | `apps/web` | Node 22, Next.js   | 3000 | `runtime`    |
| API       | `apps/api` | Python 3.12, uvicorn | 8000 | `runtime`  |
| Database  | (image)    | PostgreSQL 16      | 5432 | `postgres:16-alpine` |

The web app reaches the API from its server, not from the browser
([ADR 0002](../decisions/0002-frontend-calls-backend-server-side.md)).

## Repository structure

```
apps/
  web/                Next.js app (App Router, src/ layout)
    src/app/          Routes: login/ (sign-in form and Server Action), (app)/ (signed-in
                      layout, dashboard, shopping/ and habits/ with their Server Actions,
                      one placeholder page per other module), account/export (the data
                      download), api/health
    src/proxy.ts      Sends requests without a session cookie to /login
    src/components/   form-message.tsx (shared); ui/: shadcn/ui components (copied in, owned by us)
    src/lib/          config.ts (env parsing), api-client.ts (calls the API), api-health.ts,
                      auth-api.ts, auth.ts and session.ts (session cookie), forms.ts and
                      form-actions.ts (shared form helpers), shopping-api.ts and shopping.ts,
                      habits-api.ts and habits.ts (each module's calls and form logic), routes.ts,
                      client-ip.ts (trusted-proxy address), export-download.ts,
                      security-headers.ts (sent on every page by next.config.ts)
    Dockerfile        targets: dev, runtime (default)
  api/                FastAPI app
    app/main.py       create_app() factory
    app/config.py     Settings from environment variables (pydantic-settings)
    app/clock.py      Today's date in the instance timezone (TodayDep)
    app/database.py   SQLAlchemy engine, session factory, get_session dependency
    app/models/       ORM models: Base (naming convention), mixins, User, AuthSession,
                      LoginThrottle, LoginDevice, ShoppingItem, Habit, HabitCheckIn
    app/auth/         Passwords, session tokens, owner/session service, sign-in throttle
                      (throttle.py), CurrentUserDep
    app/api/          Routers, one module per area (health.py, auth.py, time.py, shopping.py,
                      habits.py, account.py for the export); text.py holds the shared text field types
    app/cli.py        Admin commands: create-owner, set-password, clear-login-blocks,
                      purge-expired
    alembic.ini       Alembic config (no database URL; env.py reads Settings)
    migrations/       Alembic environment and revisions (baseline, users and sessions,
                      shopping items, habits, login throttles and devices)
    tests/            pytest
    uv.lock           Locked Python dependencies
    Dockerfile        targets: dev, runtime (default)
packages/
  ui/ types/ config/  Shared code, empty until two apps need the same thing
database/
  migrations/         Pointer only: migrations live in apps/api/migrations (ADR 0004)
  seed/               Fake development data only
docs/
  product/            SPEC.md
  architecture/       This file
  decisions/          Architecture decision records (ADRs)
  deployment/         Running Orbit for real; backups and recovery
  export/             The data export's format and JSON Schema
  releasing.md        How a phase becomes a release
tests/                Cross-service tests; unit tests live inside each app
scripts/              setup-env.sh, smoke-test.sh, check-image.sh, backup.sh, restore.sh,
                      db-fingerprint.sh
deploy/               Caddyfile for the opt-in HTTPS proxy
docker/               Shared Docker assets (none yet); Dockerfiles live with their app
.github/              workflows/ci.yml, dependabot.yml; compose.production.ci.yml and
                      scripts/ (CI-only helpers)
docker-compose.yml    Development environment
compose.production.yml  Production deployment (ADR 0009)
```

Why this layout and why there is no JS workspace tooling yet:
[ADR 0001](../decisions/0001-monorepo-with-independent-apps.md).

## Backend

- **App factory.** `create_app(settings)` builds the app and its engine, so tests pass
  their own settings and nothing connects at import time. uvicorn runs it with `--factory`.
- **Database access.** SQLAlchemy 2 with the psycopg 3 driver. The engine and a session
  factory are created per app; the engine is disposed on shutdown. Endpoints take a
  per-request session with `session: SessionDep` and commit explicitly. Models subclass
  `app.models.Base`.
- **Model conventions.** Tables use `UuidPrimaryKeyMixin` and `TimestampMixin`
  (`app/models/mixins.py`). Product-module tables also use `OwnedMixin`, which adds an
  indexed `owner_id` referencing `users.id`.
- **Migrations.** Alembic, in `apps/api/migrations`, run as an explicit
  `alembic upgrade head` step and never on API startup
  ([ADR 0004](../decisions/0004-database-migrations-with-alembic.md)).
- **Dependencies.** Locked in `uv.lock` and installed with `uv sync --frozen`
  ([ADR 0005](../decisions/0005-python-dependency-locking-and-updates.md)).
- **Routers.** One module per area under `app/api/`; each product module adds its own.
  Every endpoint except health checks and `POST /auth/login` takes `CurrentUserDep`.
  Errors use FastAPI's default shape, `{"detail": ...}`.
- **Product modules** follow [ADR 0007](../decisions/0007-product-module-api-conventions.md):
  every query filters on the signed-in owner in SQL, another user's row is a 404, request
  bodies refuse unknown fields, `PATCH` for partial updates, 409 for state rules (such as
  an archived habit), no pagination yet.
- **Dates.** One instance-wide timezone, `ORBIT_TIMEZONE` (default UTC, checked at
  startup), decides which calendar day is "today". Endpoints take it from `TodayDep`;
  calendar dates are `DATE` columns sent as `YYYY-MM-DD`; `GET /time` gives clients the
  zone and today's date ([ADR 0008](../decisions/0008-dates-and-the-instance-timezone.md)).

## Authentication

One owner per instance, server-side sessions
([ADR 0006](../decisions/0006-owner-account-and-sessions.md)).

```
Browser ──form post──▶ web: login Server Action ──POST /auth/login──▶ API
                                                ◀── token (once) ─────
        ◀── Set-Cookie: orbit_session=<token>; HttpOnly; SameSite=Lax; Secure in production
Browser ──cookie──▶ web: proxy (cookie present?) ─▶ layout/page ──GET /auth/me, Bearer──▶ API
```

| Piece | Where | What it does |
| ----- | ----- | ------------ |
| `users` | API database | At most one row, enforced by `ck_users_single_owner` + `uq_users_is_owner` |
| `sessions` | API database | SHA-256 hash of each token, expiry; deleting the row revokes it |
| `shopping_items` | API database | Shopping items, each with an `owner_id` (cascade on delete) |
| `habits`, `habit_check_ins` | API database | Habits (`archived_at` null while active) and one row per habit per day done; a composite key keeps a check-in's owner equal to its habit's, and deleting a habit deletes its check-ins |
| `login_throttles` | API database | Failure counts and blocks per bucket, keyed by hashes only ([ADR 0010](../decisions/0010-sign-in-throttling-and-known-devices.md)) |
| `login_devices` | API database | SHA-256 hash of each known-browser token, its user and expiry |
| `POST /auth/login` | API | Email + password (+ device token, client address) → token, expiry and a new device token; same 401 for every wrong password, 429 with `Retry-After` while throttled |
| `POST /auth/logout` | API | Revokes the calling session (204) |
| `GET /auth/me` | API | The signed-in owner, or 401 |
| `GET /account/export` | API | The owner's data as JSON (docs/export/), `no-store` |
| `python -m app.cli` | API image | `create-owner` (once), `set-password` (signs out everywhere), `clear-login-blocks`, `purge-expired` |
| `orbit_session` cookie | Web | Raw token, only readable by the Next.js server |
| `orbit_device` cookie | Web | Known-browser token (365 days), so throttling cannot lock the owner out of it |

## Frontend

- Next.js App Router with TypeScript, Tailwind CSS v4 and shadcn/ui (`components.json`
  configured; `card` and `badge` added).
- `/login` is public. Everything under the `(app)` route group is signed in: the layout
  shows the module navigation and a sign-out button; the dashboard renders on each request
  and calls the API's readiness endpoint; Shopping has its list and an edit page; Habits has
  its list with a seven-day check-off strip, an edit page and an archived list; the other
  modules have placeholder pages. Dates come from the API (`GET /time`) and are formatted
  in UTC, so the web server's own timezone never shifts them.
- Server code calls the API through `src/lib/api-client.ts`, which adds the session token
  and returns a typed result (`unauthenticated`, `not_found`, `conflict`, `invalid`,
  `unavailable`).
- Forms post to Server Actions, so they work without JavaScript and get Next.js's
  same-origin check. Route handlers are GET-only. Forms use `useActionState` for errors and
  pending states; an action whose session has expired clears the cookie and redirects to
  `/login`. Module pages have no `loading.tsx`: a streamed loading state is replaced by
  the real page only with JavaScript, so without it the page would never appear.
- Every response carries security headers (`nosniff`, `X-Frame-Options: DENY`,
  `frame-ancestors 'none'`, `Referrer-Policy: same-origin`, `Permissions-Policy`) and no
  `X-Powered-By`.
- "Download my data" is a plain link to `/account/export`, a GET route handler that
  streams the API's export as a file.
- Built with `output: "standalone"` for a small production image.

## Health endpoints

| Service | Endpoint            | Kind      | Checks            | Codes     |
| ------- | ------------------- | --------- | ----------------- | --------- |
| API     | `GET /health`       | Liveness  | Process is up     | 200       |
| API     | `GET /health/ready` | Readiness | `SELECT 1` on DB  | 200 / 503 |
| Web     | `GET /api/health`   | Liveness  | Process is up     | 200       |

Liveness never depends on another service, so a database outage does not get the API
restarted in a loop. Readiness responses never include connection details.

## Configuration

Environment variables only; see [ADR 0003](../decisions/0003-configuration-through-environment-variables.md).

| Variable            | Used by        | Required | Notes                                    |
| ------------------- | -------------- | -------- | ---------------------------------------- |
| `DATABASE_URL`      | API            | yes      | `postgresql://…`; normalized to psycopg  |
| `ORBIT_ENV`         | API            | no       | `development` (default), `test`, `production` |
| `ORBIT_SESSION_TTL_DAYS` | API       | no       | Sign-in lifetime in days, 1–365 (default 30) |
| `ORBIT_TIMEZONE`    | API            | no       | IANA zone that decides "today" (default `UTC`); an unknown or empty value stops startup |
| `ORBIT_API_URL`     | Web (server)   | yes      | API base URL as seen from the web server |
| `ORBIT_INSECURE_COOKIES` | Web (server) | no    | `true` drops `Secure` from the session cookie in production, for plain-HTTP home networks only |
| `ORBIT_TRUSTED_PROXY` | Web (server) | no    | `true` forwards the rightmost `X-Forwarded-For` address to the API's sign-in throttle; only behind a proxy that sets it |
| `ORBIT_LOGIN_FREE_ATTEMPTS`, `ORBIT_LOGIN_GLOBAL_FREE_ATTEMPTS`, `ORBIT_LOGIN_BLOCK_SECONDS`, `ORBIT_LOGIN_MAX_BLOCK_SECONDS` | API | no | Sign-in throttle (5, 100, 30, 900; ADR 0010) |
| `ORBIT_DOMAIN`, `ORBIT_TLS`, `ORBIT_HTTPS_BIND`, `ORBIT_HTTPS_PORT`, `ORBIT_HTTP_PORT` | Compose (`https` profile) | no | Name, certificate source (`internal` or `acme`) and listen address of the HTTPS proxy |
| `POSTGRES_USER/PASSWORD/DB` | Compose | password yes | Compose builds `DATABASE_URL` from these |

## Development environment

`docker-compose.yml` runs `db`, `api` and `web`. The apps use their `dev` image targets
with source bind-mounted for hot reload. Startup is ordered by health checks:
db healthy, then api healthy, then web. The `api` service applies migrations before it
starts serving. Ports bind to 127.0.0.1 only.

## Production deployment

`compose.production.yml` ([ADR 0009](../decisions/0009-production-deployment-backups-and-upgrades.md),
[guide](../deployment/README.md)) runs the `runtime` images:

```
db (healthy) ─▶ migrate: alembic upgrade head (exits 0) ─▶ api (healthy) ─▶ web ─▶ 127.0.0.1:3000
                                                                         ▲
                                         optional `https` profile: Caddy ┘ (127.0.0.1:443 by default)
```

Only the web app (and, if enabled, Caddy) publish ports, on 127.0.0.1 by default. In
production the API serves no docs and logs one line per request (method, path without
query, status, time). `scripts/backup.sh` and `scripts/restore.sh` dump and restore the
database through the `db` container; restore goes into a new database and swaps it in,
keeping the old one. Upgrades go forward with the migrate step; rollbacks restore the
pre-upgrade backup into the previous release, never `alembic downgrade`.

## Testing

| Level        | Where                         | Tooling           |
| ------------ | ----------------------------- | ----------------- |
| API unit     | `apps/api/tests`              | pytest, TestClient |
| API + DB     | `apps/api/tests` (`integration` marker, needs `TEST_DATABASE_URL`): readiness, migrations up/down, `alembic check`, sign-in, sessions, the one-owner constraint (including concurrent inserts), admin CLI, Shopping and Habits CRUD and ownership with a second user (`two_users_client`, ADR 0007), the check-in window across a day boundary, races with a concurrent delete | pytest |
| Web unit     | `apps/web/src/**/*.test.ts`   | Vitest            |
| Images       | `scripts/check-image.sh`      | Builds and starts each `runtime` image in CI |
| End to end   | `scripts/smoke-test.sh`: health, security headers, then sign in (session and device cookies), add, check, edit and delete a shopping item, download the export, add a habit, check and un-check today, archive, restore and delete it, and sign out, all through the web forms | curl, against Compose (development, production and HTTPS) |
| Operations   | CI jobs "Backup and restore" and "Upgrade from v0.5.0-phase5": data fingerprints (`scripts/db-fingerprint.sh`), export and sign-in identical across backup, volume loss and restore; in-place upgrade, rollback by restore, and a move into the production stack | Compose, on throwaway volumes |

## Open questions

- None open. Login rate limiting (ADR 0006's open point) is settled by ADR 0010.
