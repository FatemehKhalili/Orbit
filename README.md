# Orbit

**Keep life in orbit.**

Orbit is an open-source Personal Life Operating System. You sit at the centre, and the
parts of everyday life (money, time, routines, shopping, wishes) orbit around you in
one place.

[![CI](https://github.com/FatemehKhalili/Orbit/actions/workflows/ci.yml/badge.svg)](https://github.com/FatemehKhalili/Orbit/actions/workflows/ci.yml)

> **Status:** Phase 1 (project scaffolding) is complete, tagged `v0.1.0-phase1`. No product
> features are implemented yet.

## MVP modules

Dashboard, Finance, Calendar, Habits, Shopping, Wishlist. See [docs/product/SPEC.md](docs/product/SPEC.md).

## Stack

| Layer          | Technology                                         |
| -------------- | -------------------------------------------------- |
| Frontend       | Next.js, TypeScript, Tailwind CSS, shadcn/ui       |
| Backend        | Python, FastAPI, SQLAlchemy, Pydantic              |
| Database       | PostgreSQL                                         |
| Infrastructure | Docker, Docker Compose                             |

## Architecture

```
Browser ──▶ apps/web (Next.js) ──server-side──▶ apps/api (FastAPI) ──▶ PostgreSQL
```

The web app calls the API from its server using `ORBIT_API_URL`, so the browser never talks
to the API directly. Each app builds and deploys on its own. All configuration comes from
environment variables, with no credential defaults. Health endpoints: `GET /health` and
`GET /health/ready` on the API, `GET /api/health` on the web app. Decisions are recorded in
[docs/decisions/](docs/decisions/).

## Quick start (Docker Compose)

Requires Docker with Compose v2.

```bash
./scripts/setup-env.sh          # creates .env with a random database password
docker compose up --build       # db, api and web, with hot reload
./scripts/smoke-test.sh         # in another terminal: checks the whole stack
```

| Service | URL                                  |
| ------- | ------------------------------------ |
| Web     | http://localhost:3000                |
| API     | http://localhost:8000 (docs: `/docs`) |
| DB      | `localhost:5432` (bound to 127.0.0.1) |

Stop with `docker compose down`. Add `-v` to also delete the database volume.

## Running apps without Docker

Each app runs and deploys on its own. See [apps/api/README.md](apps/api/README.md) and
[apps/web/README.md](apps/web/README.md). You still need a PostgreSQL; the easiest is
`docker compose up db`.

## Tests

```bash
(cd apps/api && .venv/bin/pytest)      # backend
(cd apps/web && npm test)              # frontend
./scripts/smoke-test.sh                # end to end, against a running stack
```

CI runs on pushes to `main` and on pull requests (`.github/workflows/ci.yml`):

| Job                 | What it checks                                                   |
| ------------------- | ---------------------------------------------------------------- |
| API                 | ruff lint and format, pytest (including readiness against Postgres) |
| Web                 | ESLint, TypeScript, Vitest, production build                     |
| Compose smoke test  | Starts db, api and web, then runs `scripts/smoke-test.sh`        |

Phase 1 coverage: API health and configuration (13 tests), web configuration and API health
states (12 tests), and the end-to-end smoke test.

## Repository layout

```
apps/web            Next.js frontend
apps/api            FastAPI backend
packages/ui         Shared UI components (placeholder)
packages/types      Shared types (placeholder)
packages/config     Shared tooling config (placeholder)
database/migrations Schema migrations (placeholder)
database/seed       Fake development data (placeholder)
docs/               Product spec, architecture, decision records
tests/              Cross-service tests
scripts/            Developer scripts
docker/             Shared Docker assets (placeholder)
.github/workflows   CI
```

Details in [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md).

## Configuration and secrets

All configuration comes from environment variables. `.env` files are git-ignored; only
`*.env.example` files are committed, and they contain no real credentials.

## License

[MIT](LICENSE)
