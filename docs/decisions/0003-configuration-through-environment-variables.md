# 0003. Configuration through environment variables

- Status: Accepted
- Date: 2026-10-02

## Context

Secrets must never be committed or hardcoded, and each app must be deployable on its own.

## Decision

- Both apps read configuration only from environment variables. The API validates them
  with pydantic-settings at startup and fails fast if `DATABASE_URL` is missing or is
  not a PostgreSQL URL. The web app validates `ORBIT_API_URL` when it is used.
- Credentials have no defaults anywhere in code or Compose. Compose refuses to start
  without `POSTGRES_PASSWORD` and builds the API's `DATABASE_URL` from the `POSTGRES_*`
  values.
- Three committed example files, none with real values:
  - `.env.example` at the root for Compose
  - `apps/api/.env.example` for running the API directly
  - `apps/web/.env.example` for running the web app directly
- `scripts/setup-env.sh` creates the root `.env` with a random password.
- The API keeps `DATABASE_URL` as a secret value, so it does not appear in logs or
  `repr`. Any `postgresql://` or `postgres://` URL is accepted and pinned to the
  psycopg 3 driver, so hosting providers' URLs work unchanged.

## Consequences

- No secret manager integration yet; production supplies variables through its platform.
- The database password must be URL-safe because Compose interpolates it into a URL.
  `setup-env.sh` generates a hex password for that reason.
