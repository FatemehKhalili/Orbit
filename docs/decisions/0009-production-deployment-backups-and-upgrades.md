# 0009. Production deployment, backups, export and upgrades

- Status: Accepted
- Date: 2026-10-11

## Context

Until Phase 6, Orbit ran only as a development stack (`docker-compose.yml`): source
mounts, hot reload, every port published on 127.0.0.1, API docs on, migrations run by the
API's start command. That is fine for building Orbit, not for keeping a life in it. To
hold real data, a person needs to install it on a home server or any Docker host, reach
it from their devices without exposing it by accident, get their data back after a lost
disk or a bad upgrade, take their data with them, and upgrade or go back safely.

The production images (`runtime` targets) have existed since Phase 3 and are checked in
CI. There are no published images: an install builds them from a release tag.

## Decision

**Production deployment.** `compose.production.yml` is the supported way to run Orbit for
real, separate from the development stack (its own project name, `orbit-production`, and
its own data volume).

- Runtime images only, no source mounts, `restart: unless-stopped`, health checks on
  every long-running service.
- Start order: database healthy → `migrate` (`alembic upgrade head`, once) finishes
  successfully → API healthy → web. The API never migrates on its own
  ([ADR 0004](0004-database-migrations-with-alembic.md)); a failed migration keeps the
  old data untouched and the API down.
- **Private by default.** Only the web app is published, and only on `127.0.0.1`. The API
  and the database have no published ports and are reachable only inside the Compose
  network, so `client_ip` and every other API input come from the web app alone.
- **HTTPS is opt-in.** The `https` profile adds Caddy in front of the web app
  (`deploy/Caddyfile`), with its own local certificate authority by default or a public
  certificate for a domain reachable from the internet. It also listens on 127.0.0.1
  unless the owner sets `ORBIT_HTTPS_BIND`. Any other reverse proxy works the same way.
- **Production defaults.** `ORBIT_ENV=production` turns off the API's `/docs`, `/redoc`
  and `/openapi.json`. The web app sends `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`,
  `Referrer-Policy: same-origin` and a restrictive `Permissions-Policy`, and no
  `X-Powered-By`. Cookies are Secure, as before.
- **Logs never hold secrets.** The API logs one line per request: method, path without
  the query string, status and duration. Never headers, cookies, tokens or bodies.
  Uvicorn's own access log (which includes query strings) is off in the image. Sign-in
  logs name only the throttle bucket's kind, never the email, address or password.

**Backups are PostgreSQL dumps of the whole database.** `scripts/backup.sh` runs
`pg_dump --format=custom` inside the database container (so the tool always matches the
server), while Orbit runs, as one consistent snapshot. The file is written with mode 600
next to a SHA-256 checksum, read back before it counts as a backup, and refused inside the
repository. `--keep N` prunes older backups made by the script, and nothing else; without
it nothing is ever deleted. A backup holds everything, secrets included, so the scripts do
not encrypt or upload: the guide shows how to encrypt with `age` or `gpg` and copy
off-site, because key handling is the owner's to choose. Scheduling is host cron or a
systemd timer; Orbit has no background workers.

**Restores are explicit and never destroy the current data.** `scripts/restore.sh` checks
the checksum and reads the archive before changing anything, refuses while the API or web
app runs, restores into a new database in one transaction and only then swaps it in by
renaming. Replacing a database that holds data needs `--force` and the database name
typed back; the replaced database is kept, renamed, until the owner drops it. The next
`up` runs the migrate step, so an older backup is brought up to date.
`scripts/db-fingerprint.sh` prints row counts and a checksum of every table, to prove a
restore brought back exactly what was backed up.

**Export is not backup.** `GET /account/export` (and "Download my data" in the web app)
gives the signed-in owner their own data as one JSON document with a published schema
(`docs/export/`). It leaves out authentication secrets and security state, cannot restore
Orbit, and is for the owner to keep or take elsewhere. Every table must be listed as
exported or excluded, with a reason; a test enforces it.

**Upgrades go forward; rollbacks restore a backup.** The upgrade procedure is: back up,
check out the new release tag, `up -d --build` (the migrate step runs), check health.
The rollback is: stop, check out the previous tag, restore the pre-upgrade backup with
`--force`, start. `alembic downgrade` is never part of the procedure for real data:
downgrades can drop columns and tables, and a backup is the only rollback that is
guaranteed to bring back exactly what was there. Each release's notes name the backup
it needs.

**CI proves all of this on every pull request**, on throwaway volumes only: the
production stack (published ports, smoke test, docs off, HTTPS profile with the local
CA), a backup and restore round trip (fingerprint, export and password identical after
losing the volume; refusals), and an upgrade from the previous release tag in place and
into the production stack, with a rollback by restoring the backup into the previous
release.

## Consequences

- One documented way to run Orbit for real, which CI starts on every change. The
  development stack is unchanged.
- Reaching Orbit from other devices takes a deliberate step (the `https` profile or the
  owner's own proxy), so nothing is exposed by accident.
- Backups are as sensitive as the database. Their safety depends on the owner encrypting
  copies that leave the machine; the guide says so plainly.
- A restore can only go into the same or a newer Orbit version, and loses whatever was
  written after the backup. Rolling back after an upgrade loses changes made since.
- Restoring keeps the previous database until the owner removes it, which costs disk
  space but makes a mistaken restore recoverable.
- No published images: an install builds from source at a tag. Publishing images would
  need its own decision.
