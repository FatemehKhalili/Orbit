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
    src/app/          Routes. page.tsx is the dashboard placeholder; api/health is liveness
    src/components/ui shadcn/ui components (copied in, owned by us)
    src/lib/          config.ts (env parsing), api-health.ts (calls the API)
    Dockerfile        targets: dev, runtime (default)
  api/                FastAPI app
    app/main.py       create_app() factory
    app/config.py     Settings from environment variables (pydantic-settings)
    app/database.py   SQLAlchemy engine, session factory, get_session dependency
    app/models/       ORM models; Base with a constraint naming convention (no tables yet)
    app/api/          Routers, one module per area (health.py today)
    alembic.ini       Alembic config (no database URL; env.py reads Settings)
    migrations/       Alembic environment and revisions (empty baseline today)
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
scripts/              setup-env.sh, smoke-test.sh
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
  `app.models.Base`; none exist yet.
- **Migrations.** Alembic, in `apps/api/migrations`, run as an explicit
  `alembic upgrade head` step and never on API startup
  ([ADR 0004](../decisions/0004-database-migrations-with-alembic.md)).
- **Dependencies.** Locked in `uv.lock` and installed with `uv sync --frozen`
  ([ADR 0005](../decisions/0005-python-dependency-locking-and-updates.md)).
- **Routers.** One module per area under `app/api/`. Product modules will add their own.

## Frontend

- Next.js App Router with TypeScript, Tailwind CSS v4 and shadcn/ui (`components.json`
  configured; `card` and `badge` added).
- The dashboard page renders on each request and calls the API's readiness endpoint.
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
| `ORBIT_API_URL`     | Web (server)   | yes      | API base URL as seen from the web server |
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
| API + DB     | `apps/api/tests` (`integration` marker, needs `TEST_DATABASE_URL`): readiness, migrations up/down, `alembic check` | pytest |
| Web unit     | `apps/web/src/**/*.test.ts`   | Vitest            |
| End to end   | `scripts/smoke-test.sh`       | curl, against Compose |

## Open questions

- Authentication model for a self-hosted, single-user-first app.
