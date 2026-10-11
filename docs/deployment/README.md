# Running Orbit for real

This guide installs Orbit on a home server or any machine with Docker, using the
production setup (`compose.production.yml`). The development setup (`docker-compose.yml`)
is for working on Orbit and is not meant to hold your data. Background and reasons:
[ADR 0009](../decisions/0009-production-deployment-backups-and-upgrades.md).

Before you rely on Orbit, also read [Backups and recovery](backup-and-recovery.md).

## What you need

- Linux, macOS or Windows with Docker Engine and Docker Compose v2 (`docker compose`).
- Git, and about 2 GB of disk for the images plus your data.
- A shell on the machine. Every command below runs in the Orbit checkout.

## Install

```bash
git clone https://github.com/FatemehKhalili/Orbit.git orbit
cd orbit
git checkout v0.6.0-phase6               # a release tag, never a moving branch
./scripts/setup-env.sh                   # .env with a random database password
docker compose -f compose.production.yml up -d --build
```

The first start builds the two images, waits for the database, applies the migrations
once and then starts the API and the web app. `docker compose -f compose.production.yml
ps` shows `db`, `api` and `web` as healthy, and `migrate` as exited (0).

Optional settings go in `.env` (see `.env.example`), for example `ORBIT_TIMEZONE=Europe/Berlin`,
which decides which calendar day is "today". After changing `.env`, run the `up -d`
command again.

**Keep `.env` safe.** It holds the database password. It is created readable by you
alone, and git ignores it. Without it you can still restore a backup into a new install.

### Create the owner

Each instance has one owner, created once from the server:

```bash
docker compose -f compose.production.yml exec api \
  python -m app.cli create-owner --email you@example.com --name "Your Name"
```

It asks for the password twice. Then open http://localhost:3000 on the server itself and
sign in.

Tip: add `COMPOSE_FILE=compose.production.yml` to `.env`, and plain `docker compose ...`
uses the production setup from then on in this checkout. The commands here spell it out.

## What is reachable

| Service  | Reachable from                                   |
| -------- | ------------------------------------------------ |
| Web app  | This machine only: `127.0.0.1:3000` (`WEB_PORT`) |
| API      | Nothing outside Docker: only the web app calls it |
| Database | Nothing outside Docker                           |

Nothing is reachable from your network or the internet until you choose to put HTTPS in
front of the web app. API documentation (`/docs`) is off in production.

## Reach Orbit from your other devices (HTTPS)

Orbit's cookies are HTTPS-only in production, so other devices need HTTPS. The
optional `https` profile adds [Caddy](https://caddyserver.com) in front of the web app.

**On a home network** (Caddy's own certificate authority):

1. Pick a name for Orbit and make it point at the server on your network, for example
   `orbit.home.arpa` in your router's DNS or in each device's hosts file.
2. Add to `.env`:

   ```bash
   ORBIT_DOMAIN=orbit.home.arpa
   ORBIT_TLS=internal
   ORBIT_HTTPS_BIND=0.0.0.0      # listen on the network, not only on this machine
   ORBIT_TRUSTED_PROXY=true      # Caddy tells the web app each browser's address
   ```

3. Start it: `docker compose -f compose.production.yml --profile https up -d`.
4. Copy Caddy's root certificate and install it as trusted on each device, once:

   ```bash
   docker compose -f compose.production.yml cp \
     https:/data/caddy/pki/authorities/local/root.crt ./orbit-root.crt
   ```

   The certificate authority lives in the `caddy-data` volume and stays the same across
   restarts and upgrades. Keep that volume, or devices will need the new root again.

Then open `https://orbit.home.arpa`. Run every later `up` with `--profile https` too.

**On the internet** (a public certificate from Let's Encrypt): set `ORBIT_TLS=acme`,
`ORBIT_DOMAIN` to a domain whose DNS points at this machine, and `ORBIT_HTTPS_BIND=0.0.0.0`,
and forward ports 80 and 443 to it. Think twice: anyone can then reach the login page.
Sign-in is throttled ([ADR 0010](../decisions/0010-sign-in-throttling-and-known-devices.md)),
but a VPN such as WireGuard or Tailscale to your home network keeps Orbit private.

**Your own reverse proxy** works too: forward to `127.0.0.1:3000`, and make it replace
(not append to) `X-Forwarded-For` before setting `ORBIT_TRUSTED_PROXY=true`. Leave
`ORBIT_TRUSTED_PROXY` off for any setup where browsers reach port 3000 directly.

## Signing in, and when it is blocked

Too many wrong passwords block sign-in for a while, growing to at most 15 minutes. A
browser that has signed in before keeps working even while strangers keep the account
blocked, and sessions last 30 days. If you are blocked on a new browser and cannot wait:

```bash
docker compose -f compose.production.yml exec api python -m app.cli clear-login-blocks
```

Forgot the password: `... exec api python -m app.cli set-password` (signs out every
session). Limits are set with `ORBIT_LOGIN_*` in `.env`.

## Housekeeping

Each sign-in removes expired sessions and old sign-in records. To do it on a schedule as
well, add a cron entry such as:

```cron
30 4 * * *  cd /srv/orbit && docker compose -f compose.production.yml exec -T api python -m app.cli purge-expired
```

Logs: `docker compose -f compose.production.yml logs api web`. They never contain
passwords, tokens, cookies or query strings.

Your data lives in the `orbit-production_orbit-data` Docker volume. It survives restarts,
reboots and upgrades. Only `down -v` (or `docker volume rm`) deletes it.

## Upgrade

Every release's notes say whether anything special applies. The procedure:

1. **Back up**, and keep this backup until you are sure about the new version:
   `./scripts/backup.sh`.
2. Fetch and check out the new release: `git fetch --tags && git checkout v0.X.0-phaseX`.
3. Rebuild and start: `docker compose -f compose.production.yml up -d --build`
   (add `--profile https` if you use it). The migrate step updates the database before
   the new API starts. If it fails, the new API never starts, and the database is left
   as the migration found it (each migration runs in a transaction); roll back below.
4. Check: `docker compose -f compose.production.yml ps` shows everything healthy, and you
   can sign in and see your data.

## Roll back

If the new version misbehaves, go back to the previous release **with the backup from
step 1**. Changes made since that backup are lost.

```bash
docker compose -f compose.production.yml stop web api        # the database keeps running
./scripts/restore.sh --force ~/orbit-backups/orbit-<time>.dump
git checkout v0.Y.0-phaseY                                   # the previous release
docker compose -f compose.production.yml up -d --build
```

Restore first, with the scripts of the version you are leaving, then check out the
previous release and start it. (`v0.5.0-phase5` had only the development setup: to go
back to it, restore into its `docker-compose.yml` stack instead, with
`ORBIT_COMPOSE_FILE` pointing at that file. CI tests exactly this.)

Never roll back with `alembic downgrade`. Downgrade migrations can delete columns and
tables; the backup is what brings back exactly the data you had. The restore keeps the
upgraded database too, renamed, until you drop it ([recovery
guide](backup-and-recovery.md#after-a-restore)).

## Move from the development setup

If you have been using the development stack (`docker-compose.yml`) and want to keep its
data, back it up there and restore it into the production setup. The two use different
volumes, so the original stays as it is until you remove it.

```bash
ORBIT_COMPOSE_FILE=docker-compose.yml ./scripts/backup.sh     # with the dev stack running
docker compose down                                           # stop the dev stack (keeps its data)
docker compose -f compose.production.yml up -d --build db
./scripts/restore.sh ~/orbit-backups/orbit-<time>.dump
docker compose -f compose.production.yml up -d --build
```

The restore works from any earlier Orbit version: the migrate step brings it up to date.
CI does exactly this with a backup from `v0.5.0-phase5` on every change.

## Remove Orbit

`docker compose -f compose.production.yml down` stops it and keeps the data. Add
`--volumes` only when you really want to delete all data, after a backup.
