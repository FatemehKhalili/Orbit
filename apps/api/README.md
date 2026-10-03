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

The API listens on http://localhost:8000. Interactive docs are at `/docs`.

## Configuration

| Variable       | Required | Default       | Notes                                           |
| -------------- | -------- | ------------- | ----------------------------------------------- |
| `DATABASE_URL` | yes      | none          | `postgresql://user:pass@host:5432/db`           |
| `ORBIT_ENV`    | no       | `development` | One of `development`, `test`, `production`      |
| `ORBIT_SESSION_TTL_DAYS` | no | `30`       | How long a sign-in lasts, 1–365 days            |

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
```

Both prompt for the password, or read one line from stdin with `--password-stdin`.
Passwords need at least 12 characters.

| Endpoint            | Auth   | Meaning                                                    |
| ------------------- | ------ | ---------------------------------------------------------- |
| `POST /auth/login`  | none   | `{"email", "password"}` → `{"token", "expires_at", "user"}`; 401 for any failure |
| `POST /auth/logout` | Bearer | Revokes this session. 204                                  |
| `GET /auth/me`      | Bearer | The owner: `{"id", "email", "display_name"}`               |

Send the token as `Authorization: Bearer <token>`. Only its SHA-256 hash is stored.
New endpoints protect themselves with `user: CurrentUserDep` (from `app.auth.dependencies`).
See [ADR 0006](../../docs/decisions/0006-owner-account-and-sessions.md).

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
starting the API; in production run it as a one-off step (see Docker below).

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
