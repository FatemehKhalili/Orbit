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
                      layout, dashboard, shopping/ with its Server Actions, one placeholder
                      page per other module), api/health
    src/proxy.ts      Sends requests without a session cookie to /login
    src/components/ui shadcn/ui components (copied in, owned by us)
    src/lib/          config.ts (env parsing), api-client.ts (calls the API), api-health.ts,
                      auth-api.ts, auth.ts and session.ts (session cookie), shopping-api.ts
                      and shopping.ts (Shopping calls and form logic), routes.ts
    Dockerfile        targets: dev, runtime (default)
  api/                FastAPI app
    app/main.py       create_app() factory
    app/config.py     Settings from environment variables (pydantic-settings)
    app/database.py   SQLAlchemy engine, session factory, get_session dependency
    app/models/       ORM models: Base (naming convention), mixins, User, AuthSession,
                      ShoppingItem
    app/auth/         Passwords, session tokens, owner/session service, CurrentUserDep
    app/api/          Routers, one module per area (health.py, auth.py, shopping.py)
    app/cli.py        Admin commands: create-owner, set-password
    alembic.ini       Alembic config (no database URL; env.py reads Settings)
    migrations/       Alembic environment and revisions (baseline, users and sessions,
                      shopping items)
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
tests/                Cross-service tests; unit tests live inside each app
scripts/              setup-env.sh, smoke-test.sh, check-image.sh
docker/               Shared Docker assets (none yet); Dockerfiles live with their app
.github/              workflows/ci.yml, dependabot.yml
docker-compose.yml    Development environment
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
  bodies refuse unknown fields, `PATCH` for partial updates, no pagination yet.

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
| `POST /auth/login` | API | Email + password → token and expiry; same 401 for every failure |
| `POST /auth/logout` | API | Revokes the calling session (204) |
| `GET /auth/me` | API | The signed-in owner, or 401 |
| `python -m app.cli` | API image | `create-owner` (once), `set-password` (signs out everywhere) |
| `orbit_session` cookie | Web | Raw token, only readable by the Next.js server |

## Frontend

- Next.js App Router with TypeScript, Tailwind CSS v4 and shadcn/ui (`components.json`
  configured; `card` and `badge` added).
- `/login` is public. Everything under the `(app)` route group is signed in: the layout
  shows the module navigation and a sign-out button; the dashboard renders on each request
  and calls the API's readiness endpoint; Shopping has its list and an edit page; the other
  modules have placeholder pages.
- Server code calls the API through `src/lib/api-client.ts`, which adds the session token
  and returns a typed result (`unauthenticated`, `not_found`, `invalid`, `unavailable`).
- Forms post to Server Actions, so they work without JavaScript and get Next.js's
  same-origin check. Route handlers are GET-only. Forms use `useActionState` for errors and
  pending states; an action whose session has expired clears the cookie and redirects to
  `/login`. Module pages have no `loading.tsx`: a streamed loading state is replaced by
  the real page only with JavaScript, so without it the page would never appear.
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
| `ORBIT_API_URL`     | Web (server)   | yes      | API base URL as seen from the web server |
| `ORBIT_INSECURE_COOKIES` | Web (server) | no    | `true` drops `Secure` from the session cookie in production, for plain-HTTP home networks only |
| `POSTGRES_USER/PASSWORD/DB` | Compose | password yes | Compose builds `DATABASE_URL` from these |

## Development environment

`docker-compose.yml` runs `db`, `api` and `web`. The apps use their `dev` image targets
with source bind-mounted for hot reload. Startup is ordered by health checks:
db healthy, then api healthy, then web. The `api` service applies migrations before it
starts serving. Ports bind to 127.0.0.1 only.

## Testing

| Level        | Where                         | Tooling           |
| ------------ | ----------------------------- | ----------------- |
| API unit     | `apps/api/tests`              | pytest, TestClient |
| API + DB     | `apps/api/tests` (`integration` marker, needs `TEST_DATABASE_URL`): readiness, migrations up/down, `alembic check`, sign-in, sessions, the one-owner constraint (including concurrent inserts), admin CLI, Shopping CRUD and ownership with a second user (`two_users_client`, ADR 0007) | pytest |
| Web unit     | `apps/web/src/**/*.test.ts`   | Vitest            |
| Images       | `scripts/check-image.sh`      | Builds and starts each `runtime` image in CI |
| End to end   | `scripts/smoke-test.sh`: health, then sign in, add, check, edit and delete a shopping item, and sign out, all through the web forms | curl, against Compose |

## Open questions

- Login rate limiting, before any internet-facing deployment guide (ADR 0006).
