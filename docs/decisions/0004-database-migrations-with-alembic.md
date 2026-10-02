# 0004. Database migrations with Alembic, owned by the API

- Status: Accepted
- Date: 2026-10-02

## Context

Phase 2 prepares the API to own a database schema before the first product module adds
tables. We need a migration tool, a place for the migration scripts, a shared base for
ORM models, and a rule for when migrations run. The repository has a top-level
`database/migrations` placeholder, but the API image is built from `apps/api` only
([ADR 0001](0001-monorepo-with-independent-apps.md)).

## Decision

- **Alembic** manages the schema. It is the migration tool built for SQLAlchemy, which the
  API already uses.
- **Migrations live in `apps/api`**: `apps/api/alembic.ini` and `apps/api/migrations/`.
  Files outside `apps/api` would not be in the API image, so the API could not migrate its
  own database when deployed on its own. `database/migrations/` stays as a pointer.
- **One source for the connection.** `migrations/env.py` reads `DATABASE_URL` through
  `app.config.Settings`, so migrations get the same validation and psycopg normalization
  as the API. `alembic.ini` contains no URL or credentials.
- **One model base.** `app.models.Base` holds the metadata Alembic compares against. Its
  naming convention gives every constraint and index a predictable name, so later
  migrations can alter or drop them by name.
- **Empty baseline.** The first revision creates no tables. The first product module adds
  its tables on top of it.
- **Migrations run as an explicit step, not inside the application.** Nothing in the API
  code or image `CMD` migrates on startup:
  - Production: run a one-off container from the same image before starting the new
    version: `alembic upgrade head`.
  - Docker Compose (development): the `api` service runs `alembic upgrade head` and then
    starts uvicorn. A separate one-shot `migrate` service was considered, but
    `docker compose up --wait` (used by CI) treats a container that exits, even with
    code 0, as a failure (docker/compose#10596).
- **Sessions.** `app.database.get_session` (`SessionDep`) gives each request its own
  session from a factory created with the app's engine, and closes it afterwards.
  Endpoints commit explicitly.

## Consequences

- The API image is self-sufficient: it can create and upgrade its own schema.
- Generated revisions are formatted and linted by ruff through Alembic's post-write hooks.
- CI applies, rolls back and re-applies all migrations against PostgreSQL and runs
  `alembic check`, so models and migrations cannot drift apart unnoticed.
- Running several API replicas never races on migrations, because the API never runs them.
  Deployments must remember the one-off step.
- `/health/ready` does not report migration state; a schema behind the code shows up as
  errors in the endpoints that need the new tables.
