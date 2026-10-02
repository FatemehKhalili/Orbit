# Orbit API

FastAPI backend for Orbit. Deployable on its own: it needs only Python 3.11+ (or the
Docker image) and a PostgreSQL `DATABASE_URL`.

## Run locally

```bash
cd apps/api
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'
cp .env.example .env          # then set DATABASE_URL
.venv/bin/uvicorn --factory app.main:create_app --reload
```

The API listens on http://localhost:8000. Interactive docs are at `/docs`.

## Configuration

| Variable       | Required | Default       | Notes                                           |
| -------------- | -------- | ------------- | ----------------------------------------------- |
| `DATABASE_URL` | yes      | none          | `postgresql://user:pass@host:5432/db`           |
| `ORBIT_ENV`    | no       | `development` | One of `development`, `test`, `production`      |

## Health endpoints

| Endpoint            | Meaning                                        | Codes      |
| ------------------- | ---------------------------------------------- | ---------- |
| `GET /health`       | Liveness: the process is up. No database call. | 200        |
| `GET /health/ready` | Readiness: the database answers `SELECT 1`.    | 200 / 503  |

## Tests and lint

```bash
.venv/bin/pytest
.venv/bin/ruff check . && .venv/bin/ruff format --check .
```

One test needs a real database and is skipped unless `TEST_DATABASE_URL` is set.

## Docker

```bash
docker build -t orbit-api .                 # production image (default target)
docker run -p 8000:8000 -e DATABASE_URL=... orbit-api
```
