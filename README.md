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
> tagged `v0.4.0-phase4`. Phase 5 (Habits) is complete, tagged `v0.5.0-phase5`. Phase 6
> (running Orbit for real: production deployment, backups, sign-in throttling, export) is
> complete, tagged `v0.6.0-phase6`. The other modules are placeholders.

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

## Run Orbit for your own data

Use the production setup, not the quick start below: it keeps Orbit private by default,
and comes with backups, restore, upgrades and an optional HTTPS proxy.

- [Deployment guide](docs/deployment/README.md): install, create the owner, reach it over
  HTTPS, upgrade and roll back.
- [Backups and recovery](docs/deployment/backup-and-recovery.md): what a backup holds,
  encryption, scheduling, restoring, and the recovery runbook.
- [Data export](docs/export/README.md): "Download my data" and its format.

## Quick start (Docker Compose)

For developing Orbit. Requires Docker with Compose v2.

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
| Production stack    | Only the web app published (on 127.0.0.1); starts `compose.production.yml`, smoke test, API docs off, `alembic check`, then the smoke test again over HTTPS through the Caddy profile |
| Backup and restore  | Seeds data, backs up, deletes the volume, restores, and proves fingerprints, export and password identical; refusals for a running app, a damaged file and a non-empty database |
| Upgrade from v0.5.0-phase5 | Upgrades a seeded v0.5.0 install in place, rolls back by restoring its backup into v0.5.0, and moves the backup into a fresh production stack |

Coverage: API health, configuration, database sessions, migrations, sign-in, sessions, the
one-owner rule, the admin CLI, the instance timezone, Shopping and Habits including
ownership with a second user, sign-in throttling, the export and production defaults
(298 tests); web configuration, the API client, the session and device cookies, the shared
form helpers, login, Shopping and Habits form logic, the seven-day strip, route
protection, the export download, client addresses and security headers (199 tests);
and the end-to-end smoke test.

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
docs/               Product spec, architecture, decision records, deployment, export
tests/              Cross-service tests
scripts/            Setup, smoke test, backup, restore
deploy/             Caddyfile for the optional HTTPS proxy
docker/             Shared Docker assets (placeholder)
.github/workflows   CI
compose.production.yml  Production deployment
docker-compose.yml  Development environment
```

Details in [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md).

## Configuration and secrets

All configuration comes from environment variables. `.env` files are git-ignored; only
`*.env.example` files are committed, and they contain no real credentials.

`ORBIT_TIMEZONE` (an IANA name such as `Europe/Berlin`, default `UTC`) decides which
calendar day is "today" for the whole instance, for example which days a habit can be
checked off. The API refuses to start with an unknown zone
([ADR 0008](docs/decisions/0008-dates-and-the-instance-timezone.md)).

Sign-in is throttled: after five wrong passwords, blocks start at 30 seconds and grow to
at most 15 minutes, and browsers that signed in before keep working
([ADR 0010](docs/decisions/0010-sign-in-throttling-and-known-devices.md)). The `ORBIT_LOGIN_*`
variables change the limits.

Session cookies are `Secure` in production builds, so serve Orbit over HTTPS. Only for a
plain-HTTP install on a trusted home network, set `ORBIT_INSECURE_COOKIES=true` on the web
app; anyone on that network could then read the session cookie in transit.

## License

[MIT](LICENSE)
