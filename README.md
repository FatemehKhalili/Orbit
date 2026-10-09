# Orbit

**Keep life in orbit.**

Orbit is an open-source Personal Life Operating System. You sit at the centre, and the
parts of everyday life (money, time, routines, shopping, wishes) orbit around you in
one place.

[![CI](https://github.com/FatemehKhalili/Orbit/actions/workflows/ci.yml/badge.svg)](https://github.com/FatemehKhalili/Orbit/actions/workflows/ci.yml)

> **Status:** Phase 1 (project scaffolding) is complete, tagged `v0.1.0-phase1`. Phase 2
> (data foundations: migrations, model base, locked dependencies) is complete, tagged
> `v0.2.0-phase2`. Phase 3 (owner account and app shell: sign-in, sessions, navigation) is
> complete, tagged `v0.3.0-phase3`. Phase 4 (Shopping, the first module) is complete,
> tagged `v0.4.0-phase4`. The other modules are placeholders.

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
to the API directly. Each instance has one owner, who signs in with email and password; the
API keeps server-side sessions and stores only a hash of each session token
([ADR 0006](docs/decisions/0006-owner-account-and-sessions.md)). Module data belongs to its
owner, and the API limits every query to the signed-in owner's rows
([ADR 0007](docs/decisions/0007-product-module-api-conventions.md)). Each app builds and deploys on its own. All configuration comes from
environment variables, with no credential defaults. Health endpoints: `GET /health` and
`GET /health/ready` on the API, `GET /api/health` on the web app. Decisions are recorded in
[docs/decisions/](docs/decisions/).

## Quick start (Docker Compose)

Requires Docker with Compose v2.

```bash
./scripts/setup-env.sh          # creates .env with a random database password
docker compose up --build       # db, api (applies migrations) and web, with hot reload

# In another terminal, once: create the owner account (prompts for a password)
docker compose exec api python -m app.cli create-owner --email you@example.com --name "Your Name"
```

Then sign in at http://localhost:3000. Forgot the password? Run
`docker compose exec api python -m app.cli set-password`, which also signs out every session.

`./scripts/smoke-test.sh` checks the whole stack, including signing in and out. On a fresh
database it creates a throwaway owner; on one that already has an owner, set
`ORBIT_SMOKE_EMAIL` and `ORBIT_SMOKE_PASSWORD` to that account.

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
| API                 | uv.lock is current, ruff lint and format, pytest (including migrations and readiness against Postgres) |
| Web                 | ESLint, TypeScript, Vitest, production build                     |
| Production images   | Builds the `runtime` image of each app and checks it starts (`scripts/check-image.sh`) |
| Compose smoke test  | Starts db, api and web, runs `scripts/smoke-test.sh`, then `alembic check` |

Coverage: API health, configuration, database sessions, migrations, sign-in, sessions, the
one-owner rule, the admin CLI, and Shopping including ownership with a second user (131
tests); web configuration, the API client, the session cookie, login and Shopping form
logic and route protection (104 tests); and the end-to-end smoke test.

Dependabot (`.github/dependabot.yml`) opens weekly update PRs for the API, the web app,
GitHub Actions and Docker images.

## Repository layout

```
apps/web            Next.js frontend
apps/api            FastAPI backend
packages/ui         Shared UI components (placeholder)
packages/types      Shared types (placeholder)
packages/config     Shared tooling config (placeholder)
database/migrations Pointer to apps/api/migrations
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

Session cookies are `Secure` in production builds, so serve Orbit over HTTPS. Only for a
plain-HTTP install on a trusted home network, set `ORBIT_INSECURE_COOKIES=true` on the web
app; anyone on that network could then read the session cookie in transit.

## License

[MIT](LICENSE)
