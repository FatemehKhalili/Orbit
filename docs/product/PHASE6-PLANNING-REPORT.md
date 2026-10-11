# Orbit Phase 6 planning report

- Status: **Direction approved provisionally (Option B, "Run Orbit for real"). The final
  scope in section 6 is a proposal awaiting approval.** Nothing has been implemented.
  Phase 6 is not committed until the owner approves this scope.
- Revision 2, 2026-10-11. Revision 1 (same day) proposed three directions; this revision
  records the owner's decisions, reviews the open Dependabot PRs, maps CI coverage and
  sets out the final scope.
- Inspected: `origin/main` = `46b2134` = tag `v0.5.0-phase5`, in a clean detached
  checkout. No application code, schema, migration, tag, release or SPEC status was
  changed. No database was migrated or reset. Dependabot PRs were tested only in
  throwaway local worktrees, and none was merged or pushed.

Labels: **[Approved]** = decided by the owner (provisionally, pending approval of this
scope). **[Verified]** = checked against the repository, GitHub or a local run.
**[Inferred]** = a conclusion drawn from verified facts but not tested directly.
**[Proposal]** = a recommendation for the owner to accept, change or reject.
**[Open]** = needs the owner's input.

## Contents

1. Decisions so far
2. Current-state findings
3. Production-readiness assessment
4. CI and test coverage
5. Dependabot review (maintenance, separate from Phase 6)
6. Final Phase 6 scope proposal
7. Implementation order
8. Security risks
9. Migration implications and rollback strategy
10. Release criteria
11. Remaining decisions
12. Appendix: the three candidate directions (revision 1)

## 1. Decisions so far [Approved]

| # | Topic | Decision |
| - | ----- | -------- |
| 1 | Direction | Option B, "Run Orbit for real": make Orbit safe and reliable for real use before more modules |
| 2 | Deployment target | A home server behind HTTPS. The deployment must stay portable and testable without home-server hardware (any Docker host, including CI) |
| 3 | Login protection | Persist account-level failure state in the database. Also protect against distributed attempts and other brute-force patterns. No permanent lockout that would let an attacker deny the owner access |
| 4 | Data export | All supported owner data as JSON, with a documented schema and explicit handling of sensitive fields. Only data the signed-in owner is authorized to access |
| 5 | Import | Out of scope for Phase 6 |
| 6 | GitHub Releases | One for each official version tag from now on. No container images are published |
| 7 | Workflow | One cohesive implementation PR if it can be reviewed and tested safely. No unrelated maintenance in it |
| 8 | Browser tests | No new browser-test framework. Strengthen API, integration, backup/restore and deployment tests instead |
| 9 | Dependabot | Reviewed first as separate maintenance; not merged blindly; not part of the Phase 6 PR |

Additional requirements from the owner, all built into section 6:

- A documented recovery procedure for backups.
- Restores are tested into a clean environment, with data integrity verified.
- Retention, encryption considerations and recovery limitations are documented.
- Export and backup are treated as separate features.
- Secure production defaults, persistent storage, health checks, and an upgrade and
  rollback procedure.
- Nothing is exposed publicly by default.
- A production-readiness review of authentication, authorization, secrets, network
  exposure and migration safety.
- No destructive operation ever runs against real user data.

## 2. Current-state findings [Verified unless marked]

### 2.1 Repository and release state

| Item | Value |
| ---- | ----- |
| `origin/main` | `46b2134` docs: mark Phase 5 complete and bump versions to 0.5.0 (#16) |
| Tags (annotated) | `v0.1.0-phase1` → `9a555fd`, `v0.2.0-phase2` → `0948848`, `v0.3.0-phase3` → `6bbfbbc`, `v0.4.0-phase4` → `bfedf15`, `v0.5.0-phase5` → `46b2134` |
| GitHub Releases | none |
| CI on `main` | run #34 on `46b2134`: success (all jobs) |
| Open issues | 0 |
| Open PRs | Dependabot #2, #3, #4, #5, #6, #7, #15, and this report's draft PR #17 |
| Versions | API and web 0.5.0; Next 16.3.8, React 19.2.8, Python 3.12 image, Node 22 image, PostgreSQL 16 |
| Local checks | Web: 170 tests passed, plus lint, typecheck and build. API: ruff clean, 49 non-database tests passed and 207 database tests skipped locally on purpose (CI runs them against Postgres) |

**Release convention.** Each phase has been released the same way:

1. One feature PR, squash-merged as `feat: …`.
2. A `docs: mark Phase N complete` PR that flips the SPEC status table and bumps the
   versions.
3. An annotated `v0.N.0-phaseN` tag on that commit.

Planning and review documents for Phases 3–5 lived only in the project's shared files;
this report is the first one proposed for the repository (`docs/product/`).

### 2.2 What Orbit does

- One owner per instance, created from the CLI and enforced by database constraints.
- Email and password sign-in with Argon2id. Server-side sessions store only the SHA-256
  hash of each token. The cookie is HttpOnly, SameSite=Lax, and Secure in production.
- **Shopping:** one list per owner (add, edit, check, delete).
- **Habits:** daily habits with a seven-day check-off window. A habit can be archived
  (read-only), restored, and deleted only once archived.
- An instance timezone (`ORBIT_TIMEZONE`, ADR 0008) with `GET /time`.
- Every form works without JavaScript.
- Health endpoints on both apps.
- Finance, Calendar and Wishlist are placeholders. The Dashboard shows only a diagram and
  the API's health.

The API routes and schema are as listed in revision 1, unchanged. The Alembic chain is
`a79fa8454c44` → `523733546fba` → `fa85c3680a05` → `557fe5523984`. The tables are
`users`, `sessions`, `shopping_items`, `habits` and `habit_check_ins`.

### 2.3 Gaps that Phase 6 addresses

- **Deployment:** the only Compose file is for development. It uses the `dev` targets,
  bind-mounts the source, runs `--reload`, runs migrations at start, and publishes the
  API and the database on 127.0.0.1.
- **Backups:** there is no backup, restore or recovery documentation.
- **Export:** there is no way to export data.
- **Sign-in:** no rate limiting (ADR 0006 "Known gap").
- **Proxying:** the API cannot tell the browser's IP: the web server calls it, and no
  client address is forwarded (`apps/web/src/lib/auth-api.ts`, no `x-forwarded-*`
  handling anywhere in `apps/web/src`).
- **Logging:** no logging configuration in `apps/api/app`.
- **Sessions:** expired sessions are deleted only for the user who is signing in
  (`auth/service.py: start_session`).
- **Security headers:** the web app sets none (`next.config.ts` has only
  `output: "standalone"`).
- **API docs:** FastAPI's interactive docs and `/openapi.json` are served in every
  environment (`main.py` does not disable them).

## 3. Production-readiness assessment

| Area | Today [Verified] | Risk for a real install | Phase 6 response [Proposal] |
| ---- | ---------------- | ----------------------- | --------------------------- |
| **Authentication** | Argon2id; same 401 for every failure; opaque tokens, hash stored; revocation by deleting the row; Secure cookie in production | Unlimited guessing. Every failed attempt, including against unknown emails, costs a full Argon2 hash, so a flood of attempts is also a CPU denial of service | Login throttling (deliverable D4) that limits both guessing and hashing work |
| **Authorization** | Owner filter in SQL on every module query (ADR 0007); a test walks OpenAPI and fails if a route lacks `CurrentUserDep`; second-user tests | Low. The export is a new path that could leak if it bypasses the convention | Export reuses the owner filter, with a `two_users_client` test and a test that every owned table is either exported or explicitly excluded |
| **Secret management** | `.env` created by `setup-env.sh` with a random DB password and mode 600; nothing secret in images; `DATABASE_URL` carries the password in the environment | Acceptable for a single host. Backups contain the password hash and all personal data | Backups written with mode 600 outside the repository; a documented warning; the guide covers file permissions. Docker secrets / `_FILE` variables stay out of scope |
| **Network exposure** | Dev Compose binds db, API and web to 127.0.0.1 | Dev Compose publishes the database and the API, which a production install does not need | Production Compose publishes only the web app, on 127.0.0.1. The API and the database stay on the internal Compose network. Public exposure happens only through a reverse proxy the owner adds deliberately |
| **Transport** | Secure cookie requires HTTPS; `ORBIT_INSECURE_COOKIES` opt-out | No documented HTTPS setup | The guide shows one HTTPS reverse proxy example (decision R5), testable in CI with a local certificate authority |
| **Migration safety** | Migrations run as a separate step (ADR 0004); `alembic check` in CI; downgrades exist | **Downgrades drop tables**: for example, `557fe5523984` downgrade drops `habits` and `habit_check_ins`. Running `alembic downgrade` on real data destroys it | The documented rollback is "restore the backup taken before the upgrade, then run the previous version", never `alembic downgrade` on real data (section 9). Upgrades take a backup first |
| **Persistence** | Named volume `postgres-data` | `docker compose down -v` (in the README) deletes all data | Production Compose uses its own named volume and project name. The guide warns about `-v`. Backups exist for this case |
| **Health checks** | Liveness and readiness endpoints; image `HEALTHCHECK`s | Startup order in production is not defined | The production stack waits for a healthy database, then the migration step to finish, then a healthy API, then a healthy web app |
| **Hardening defaults** | Non-root users in both runtime images | API docs public inside the stack; no security headers; no restart policy | In production: disable `/docs`, `/redoc` and `/openapi.json`, add basic security headers, and set `restart: unless-stopped` |
| **Logging** | uvicorn's default access log | Hard to diagnose problems; no guarantee that secrets stay out of logs | Request logs with method, path, status and duration, never tokens, cookies, passwords or bodies, with a test |

## 4. CI and test coverage

### 4.1 What CI covers today [Verified, `.github/workflows/ci.yml`]

| Job | Checks |
| --- | ------ |
| API | `uv lock --check`, ruff lint and format, pytest against PostgreSQL 16 (unit tests and 207 `integration` tests: migrations up/down/`alembic check`, auth, sessions, one-owner constraint, Shopping and Habits including second-user ownership, day boundaries and races) |
| Web | ESLint, `tsc`, Vitest (170 tests), `next build` |
| Production images | Builds each `runtime` image and checks it starts and passes its health check (`scripts/check-image.sh`) |
| Compose smoke test | **Dev** Compose up, `scripts/smoke-test.sh` (sign in and out through the forms, Shopping and Habits flows with curl), `alembic check` |

### 4.2 What CI does not cover

- The production images running *together*. Today they are only started one at a time.
- The deployment as a user would run it: migrations as a one-off step, nothing published
  except the web app.
- Upgrading an existing install from the previous release, with data in it.
- Backup, restore and data integrity.
- Login throttling, export, log redaction and security headers. None of these exist yet.
- The JavaScript-enhanced form path. This stays uncovered by decision 8.

### 4.3 Test additions proposed for Phase 6

Each item names the deliverable it covers (section 6).

- **API unit and integration (pytest):**
  - Throttling (D4): thresholds, the progressive delay and its cap, window expiry with a
    pinned clock, concurrent failures counted atomically, unknown and known emails
    treated alike, and the CLI reset.
  - Export (D5): schema shape, `format_version`, ownership with `two_users_client`,
    sensitive fields excluded, and the owned-table coverage test.
  - Ops basics (D6): log redaction, docs disabled in production, and expired-session
    cleanup.
  - Migration tests for the new table, using the existing pattern.
- **Web (Vitest):** the 429 "try again later" message, the export download action, and
  the security headers config.
- **New CI job, "Production stack"** (D1), using a CI-only override file that changes
  nothing else:
  1. Starts the production Compose stack from freshly built runtime images.
  2. Runs the smoke test against it.
  3. Asserts that only the web port is published.
  4. Asserts that `/docs` returns 404.
- **New CI job, "Backup and restore"** (D2, D3):
  1. Seeds data through the API and records an export and a per-table fingerprint.
  2. Runs the backup script.
  3. Destroys the stack and its volume (CI throwaway only).
  4. Starts a clean stack and restores.
  5. Verifies that the fingerprints match, the export is identical (apart from
     `exported_at`), the owner can sign in with the same password, and `alembic check`
     passes.

  It also checks that restore refuses a non-empty database without the force flag.
- **New CI job, "Upgrade from previous release"** (D7):
  1. Starts the stack at `v0.5.0-phase5` and seeds data.
  2. Backs it up.
  3. Upgrades to the PR head following the documented procedure, then verifies the data.
  4. Performs the documented rollback: restores the pre-upgrade backup with the
     `v0.5.0-phase5` images and verifies the data again.
- **Optional, if decision R5 includes it:** an HTTPS check through the example reverse
  proxy with a local certificate authority, proving the Secure cookie round trip.

## 5. Dependabot review (separate maintenance) [Verified]

All seven PRs predate one or both module phases. Their last CI runs merged them with an
older `main`, so those results say little about today's code. For each one I merged the
branch into the current `main` in a throwaway worktree and ran the checks that apply.
Every PR merges without conflicts. Nothing was merged on GitHub.

| PR | Change | Last CI (old base) | On current `main` (local) | Verdict |
| -- | ------ | ------------------ | ------------------------- | ------- |
| #15 | API group: FastAPI 0.142.2→0.143.0, SQLAlchemy 2.1.2→2.1.4, tzdata 2026.4→2026.5 (lockfile only) | green, on `0e6df62`, which differs from `main` only in two version lines | `uv lock --check`, ruff and 49 unit tests pass; DB tests not run locally | **Safe to merge** after a CI re-run on current `main` (`@dependabot rebase`). Covers the SQLAlchemy bump from #10, which is no longer open |
| #4 | React and React DOM 19.2.8→19.3.0 | green, pre-Phase 4 base | lint, typecheck, 170 tests, build all pass | **Safe to merge** after a CI re-run on current `main`, which also runs the Compose smoke test with real forms |
| #3 | actions/checkout v5→v7, setup-python v6→v7, setup-node v5→v6 | green, pre-Phase 4 base | not runnable locally (CI only) | **Safe to merge after a CI re-run**: CI itself is the test. Note that the PR's metadata says setup-node 7, but the diff pins v6, which is fine |
| #6 | @types/node 22→26 | green, Phase 2 base | lint, typecheck, tests, build pass | **Defer and close.** The runtime is Node 22 (Dockerfile, CI `node-version: 22`, `engines >=22`). Types for Node 26 would let code use APIs that do not exist at runtime. Keep @types/node on the runtime's major and move both together |
| #2 | web image `node:22-alpine` → `node:25-alpine` | green, pre-Phase 4 base | not rebuilt locally | **Close.** Node 25 is an odd, non-LTS line [Inferred from the Node.js release schedule: EOL in mid-2026]. CI would still test on Node 22, so the image and CI would disagree. A runtime move should be deliberate (to an LTS line, image, CI and @types/node together) and is a separate maintenance task (decision R8). The PR's metadata also says `26-alpine` while its diff says 25 |
| #5 | TypeScript 5.9→7.0 | **failed** | typecheck, tests and build pass, but **lint fails**: "typescript-eslint does not support TS 7.0" | **Defer.** Blocked until typescript-eslint (through eslint-config-next) supports TS 7 |
| #7 | ESLint 9→10 | **failed** | **lint fails**: eslint-plugin-react (pulled in by eslint-config-next 16.3.8) crashes with `contextOrFilename.getFilename is not a function` | **Defer.** Blocked until eslint-config-next supports ESLint 10 |

**Proposed maintenance (separate from Phase 6, after your approval) [Proposal].**

1. Re-run CI on #15, #4 and #3 against current `main`, and merge each one if it is green.
2. Close #2 and #6, with a comment explaining why.
3. Leave #5 and #7 open, or close them with a note. To stop them being reopened, either
   add Dependabot `ignore` rules for the major versions of `typescript`, `eslint` and
   `@types/node`, or keep them open as reminders (decision R9).

## 6. Final Phase 6 scope proposal [Proposal]

**Theme:** a person can install Orbit on a home server or any Docker host, keep it behind
HTTPS without exposing it by accident, back it up, recover it, export their data, and
upgrade or roll back safely. The sign-in is hard to brute-force without the owner being
lockable out.

**Release:** `v0.6.0-phase6`, with its first GitHub Release.

### D1. Production deployment

- A production Compose file (for example `compose.production.yml`) with its own project
  name and named volume.
- The `runtime` image targets, no source mounts, and `restart: unless-stopped`.
- A one-off `migrate` service (`alembic upgrade head`) that must finish successfully
  before the API starts (ADR 0004). The API never migrates on startup.
- Health-ordered startup: db → migrate → api → web.
- Only the web app is published, and only on `127.0.0.1` (port configurable). The API and
  the database are reachable only inside the Compose network.
- Production defaults: `ORBIT_ENV=production` and `NODE_ENV=production`, so the cookie
  is Secure. API docs are disabled in production. The web app sets basic security headers
  (`X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `frame-ancestors 'none'` or
  its equivalent).
- A deployment guide (`docs/deployment/`) covering:
  - Requirements and first install.
  - Creating the owner.
  - The HTTPS reverse proxy example (R5).
  - What is and is not exposed.
  - Moving an existing development install to the production setup through backup and
    restore.

**Acceptance criteria.**
1. On a clean Docker host, following only the guide, `up` brings the stack to healthy.
   The CI "Production stack" job does this on every PR.
2. `docker compose ps` shows exactly one published port, bound to 127.0.0.1. The API and
   the database are not reachable from the host.
3. The migration step runs once and exits 0. If it fails, the API does not start.
4. The smoke test passes against the production stack.
5. `/docs` and `/openapi.json` return 404 in production. The security headers are present
   on web responses.
6. Restarting the host or `docker compose restart` keeps all data, using the named
   volume.

### D2. Backup

- `scripts/backup.sh`, run against the production stack. It writes a timestamped
  `pg_dump` custom-format file to a directory outside the repository (configurable).
  - The file has mode 600 and comes with a checksum file.
  - It runs while Orbit is up, as one consistent snapshot.
  - It refuses to write into the repository tree.
- Optional pruning with `--keep N` (R3).
- Documentation:
  - What a backup contains: everything, including the password hash, sessions and
    throttle state.
  - Scheduling with host cron or a systemd timer, since there are no workers in Orbit.
  - Retention guidance.
  - Encryption (R2), and copying backups off the machine.
  - Limitations: a backup is a point in time, so data written after it is lost on
    restore. It restores only into the same or a newer Orbit version.

**Acceptance criteria.**
1. Backup succeeds against a running stack and produces a file and checksum with mode 600.
2. The backup refuses a target inside the repository.
3. Pruning keeps exactly N files and never deletes non-backup files.
4. The docs cover contents, sensitivity, retention, encryption and limitations.

### D3. Restore and recovery procedure

- `scripts/restore.sh` restores a backup into a stack whose database is empty.
  - It verifies the checksum first.
  - It refuses a non-empty database unless `--force` is given, and then it prints what
    will be replaced and asks for typed confirmation.
  - It never runs automatically.
  - After restoring, it runs `alembic upgrade head`, so an older backup restored into a
    newer version is brought forward.
- A written recovery runbook covering three cases: a lost volume, moving to a new host,
  and a failed upgrade.

**Acceptance criteria.**
1. The CI "Backup and restore" round trip passes. Integrity means all of the following
   match before and after:
   - per-table row counts and an ordered content fingerprint for every table;
   - the API export, apart from `exported_at`;
   - the same owner password signs in.
2. Restore into a non-empty database without `--force` exits non-zero and changes
   nothing.
3. A corrupted or truncated file fails the checksum and changes nothing.
4. Restoring a backup from `v0.5.0-phase5` into the Phase 6 version works and passes
   `alembic check`.

### D4. Login protection

- Failure state persists in a new table, keyed by a hash of the normalized email. Keying
  by hash means a stranger's mistyped email (or a password pasted into the email field)
  is never stored in clear. Each row holds a failure count, a window start and a
  `blocked_until` time.
- **Per account:** a progressive delay. After a small number of failures, each further
  failure doubles the block, up to a cap (R1). There is never a permanent lockout. A
  successful sign-in resets the count.
- **Distributed and spraying attempts:**
  - The per-account limit applies whatever the source IP, so spreading attempts across
    many IPs gains nothing.
  - A separate global budget for failures against emails that do not exist caps total
    Argon2 work. This stops CPU exhaustion and password spraying without affecting the
    owner's own account bucket.
- **Client IP:** the web server forwards the browser's address, and the API trusts it
  only when configured to (`ORBIT_TRUSTED_PROXY`, off by default). When it is on, a
  per-IP limit is added, so an attacker's IP is slowed before the owner's account is.
- **Denial-of-service safeguards:**
  - Blocks are short and capped.
  - Existing sessions keep working, and with a 30-day session the owner is rarely signing
    in.
  - A CLI command (`python -m app.cli clear-login-blocks`) lets the owner clear blocks
    from the server.
  - Responses never say whether an email exists.
- Blocked requests get `429` with `Retry-After`, and the login page shows "Too many
  attempts. Try again in N minutes." The limits are environment variables with safe
  defaults (ADR 0003). Recorded in ADR 0010.

**Acceptance criteria.**
1. After the threshold, attempts get 429 with `Retry-After`, whether the email is known or
   unknown.
2. The block grows and stops at the cap. After the cap expires, sign-in works.
3. Fifty concurrent failures are all counted, with no lost updates.
4. Failures against unknown emails beyond the global budget get 429 without running
   Argon2. The owner's bucket is unaffected.
5. With the trusted proxy off, forwarded IP headers are ignored.
6. The CLI clears blocks.
7. Successful sign-in behaviour and every existing auth test are unchanged.

### D5. Data export (separate from backup)

- `GET /account/export` (owner-only) returns one JSON document containing:
  - `format_version`, `exported_at` and the instance timezone;
  - the owner profile, subject to R4;
  - all Shopping items;
  - all habits, both active and archived;
  - every check-in across the full history, not just the seven-day window.
- Explicitly excluded, with the reason written in the schema doc: the password hash,
  sessions, throttle records, and any other user's rows.
- Served as an attachment (`orbit-export-YYYY-MM-DD.json`) with `Cache-Control: no-store`.
  A "Download my data" form in the web app works without JavaScript.
- A documented schema in `docs/` (a JSON Schema plus prose), versioned. Adding a module
  bumps the minor version.

**Export versus backup.**

| | Export | Backup |
| - | - | - |
| For whom | The owner, through the web app | The operator, from the server shell |
| Contents | The owner's module data, sensitive fields excluded | Everything, including secrets |
| Format | Documented JSON, readable by other tools | PostgreSQL dump, restorable only into Orbit |
| Purpose | Portability and personal records | Disaster recovery |
| Can restore Orbit? | No (no import in Phase 6) | Yes |

**Acceptance criteria.**
1. The export validates against the published JSON Schema.
2. It contains every row the owner owns, active and archived, including check-ins older
   than seven days.
3. A second user's rows never appear (`two_users_client`).
4. No sensitive field appears (an explicit test).
5. It returns 401 without a session.
6. A test fails if an `OwnedMixin` table is neither exported nor listed as excluded.
7. The download works without JavaScript and is not cached.

### D6. Operational basics

- Request logging that never includes tokens, cookies, passwords, query strings with
  secrets, or bodies.
- Expired sessions purged on any sign-in and with a `purge-sessions` CLI command for cron.
- Old throttle rows purged the same way.

**Acceptance criteria.**
1. A test captures the log of a sign-in and asserts that neither the password nor the
   token appears.
2. The purge removes only expired sessions and stale throttle rows.

### D7. Upgrade and rollback procedure

- A documented upgrade:
  1. Back up.
  2. Pull or build the new version.
  3. Run the migrate step.
  4. Start the stack.
  5. Check health and the smoke checks.
- A documented rollback: stop, restore the pre-upgrade backup, and start the previous
  version's images.

**Acceptance criteria.** The CI "Upgrade from previous release" job passes in both
directions (section 4.3).

### D8. Release process

- `docs/` describes the release steps, including the GitHub Release with upgrade notes.
- **Acceptance:** the Phase 6 release follows them. Creating the release itself happens
  only after your approval, at the end.

### Out of scope for Phase 6

- Import.
- Multi-user support, email password reset and 2FA.
- Docker secrets or `_FILE` variables.
- Publishing images.
- Kubernetes or Helm.
- Built-in scheduled backups (Orbit has no workers).
- Cloud backup targets.
- Built-in backup encryption, unless R2 says otherwise.
- Metrics or tracing stacks.
- A browser-test framework.
- The Node runtime upgrade (R8).
- Dependabot changes (section 5).
- The emoji `maxLength` leftover and the theoretical Habits races from Phase 5.
- Any new product module or Dashboard work.

## 7. Implementation order [Proposal]

One feature branch and one PR, with commits in this order so they can be reviewed one at
a time:

1. **ADRs and contracts (docs only).**
   - ADR 0009: production deployment, backup/restore and the upgrade/rollback rule.
   - ADR 0010: login protection.
   - The export JSON Schema.
2. **D1: production Compose, hardening defaults and the "Production stack" CI job.**
3. **D2 + D3: backup and restore scripts, the runbook, and the "Backup and restore" CI
   job.**
4. **D4: throttle migration and table, the login flow, the CLI command, and the web 429
   message.**
5. **D5: export endpoint, web download, and the schema and coverage tests.**
6. **D6: logging and purges.**
7. **D7: the upgrade and rollback docs and CI job.**
8. **Docs:** SPEC Phase 6 section ("In progress"), ARCHITECTURE, READMEs, env examples,
   and the release steps.

This order puts the safety net first: steps 2 and 3 work with no schema change. D4 is
the only step with a migration, and it lands after backup exists.

If the diff turns out too large to review safely as one PR, I will stop and ask before
splitting it, since that would change decision 7.

## 8. Security risks [Proposal]

| Risk | Where | Mitigation |
| ---- | ----- | ---------- |
| Backups leak all data, including the password hash | D2 | Mode 600; never written inside the repository; documented encryption and off-site guidance (R2); checksum is not a secret |
| Restore overwrites real data | D3 | Refuses a non-empty database without `--force` and typed confirmation; never automatic; CI runs it only on throwaway volumes |
| Export leaks another user's data or secrets | D5 | SQL owner filter; explicit exclusion list; schema validation; coverage test; `no-store` |
| Throttle lets an attacker lock the owner out | D4 | Short, capped blocks; existing sessions unaffected; CLI clear; per-IP limit when a trusted proxy is configured |
| Spoofed client IP evades or poisons the per-IP limit | D4 | Forwarded IPs ignored unless `ORBIT_TRUSTED_PROXY` is set; the API is not published in production, so only the web server can reach it |
| CPU exhaustion through Argon2 on unknown emails | D4 | Global budget for unknown-email failures, refused before hashing |
| Throttle table stores attacker-supplied text | D4 | Only a hash of the normalized email is stored |
| Accidental public exposure | D1 | Only the web app is published, on 127.0.0.1; exposure only through a reverse proxy the owner adds |
| Secrets in logs | D6 | Redaction by design plus a test |
| Downgrade migrations destroy data | D7 | The rollback is restoring a backup, documented and tested; `alembic downgrade` is never part of the user-facing procedure |

## 9. Migration implications and rollback strategy

- **One new migration [Proposal]:** a login-throttle table. It is additive and touches no
  existing table. Its downgrade drops only throttle state, which loses no user data. It
  follows the existing up/down/`alembic check` tests.
- **No change** to `users`, `sessions`, `shopping_items`, `habits` or `habit_check_ins`.
- **Upgrading from v0.5.0:** back up, then run the migrate step, then start. The CI job
  proves it on seeded data.
- **Rolling back to v0.5.0:** restore the pre-upgrade backup and run the v0.5.0 images.
  For this release only, `alembic downgrade 557fe5523984` would also be safe, because
  it drops only the throttle table. The documented procedure still uses the backup, so
  the habit carries over to releases whose downgrades are destructive.
- **Moving from the development stack:** back up the dev database, start the production
  stack, then restore. The two stacks use different volumes, so the original stays
  untouched until the owner removes it.

## 10. Release criteria for v0.6.0-phase6 [Proposal]

1. All existing CI jobs are green, plus the three new ones (production stack, backup and
   restore, upgrade from the previous release).
2. Every acceptance criterion in section 6 is met, and each is linked to the test that
   proves it in the PR description.
3. An independent, read-only review of the PR (as for Phases 4–5) finds no confirmed
   defects, or they are fixed.
4. A manual run of the deployment guide on a clean Docker host that is not CI. This is
   done by Claude in a fresh container, and optionally by you on your own machine. No
   real data is involved.
5. The PR is merged only with your approval. Then a separate "mark Phase 6 complete" PR
   (SPEC status and versions to 0.6.0) is merged.
6. Annotated tag `v0.6.0-phase6`, then a GitHub Release with notes, upgrade and rollback
   steps and known limitations. No images are attached. Each step happens only after your
   approval.

## 11. Remaining decisions [Open]

My recommendation is marked ★.

| # | Question | Options |
| - | -------- | ------- |
| R1 | Longest block after repeated failed sign-ins, and is a correct password refused while blocked? | ★ 15-minute cap, correct password refused while blocked (otherwise the block would reveal when a guess is right) · 1-hour cap · allow a correct password through |
| R2 | Backup encryption | ★ Document it (an `age` or `gpg` example and encrypted storage), no encryption built into the scripts · built-in optional encryption with `age` |
| R3 | Default backup retention when pruning | ★ No pruning unless `--keep N` is given; the docs suggest 14 daily · prune to 14 by default |
| R4 | Include the account profile (email, display name) in the export? | ★ Yes, both; never the password hash or sessions · No, module data only |
| R5 | HTTPS reverse proxy | ★ A documented Caddy example as an opt-in Compose profile (off by default), tested in CI with a local certificate authority · docs only, no proxy files |
| R6 | A GitHub Release for the existing `v0.5.0-phase5` tag too? | ★ No, start with v0.6.0 · Yes, retroactively |
| R7 | One PR for all of Phase 6, as proposed? | ★ Yes, with ordered commits; I ask before splitting · split ADRs into a first PR |
| R8 | Node runtime upgrade (22 → the current LTS line), as later separate maintenance? | ★ Yes, after Phase 6 · before Phase 6 · not now |
| R9 | Handling of Dependabot #5 and #7 (blocked majors) | ★ Close them and add `ignore` rules for those majors until the toolchain supports them · keep them open |

Once you approve the scope (with any changes) and answer R1–R9, I will start with the
Dependabot maintenance (section 5). After that comes the Phase 6 branch, starting with the
ADRs.

## 12. Appendix: the three candidate directions (revision 1)

Kept for the record; Option B was chosen.

| Criterion | A: "Today" Dashboard | **B: Run Orbit for real** | C: Calendar |
| --------- | -------------------- | ------------------------- | ----------- |
| User problem | Product feels like separate pages | Data could be lost; no safe deployment; brute-forceable login | No planned time |
| Visible user value | High, daily | Medium (trust) | High |
| Strategic value | Medium | High: prerequisite for Finance and real use | High, but adds risk before B |
| Size and risk | Small, low | Medium, medium | Large, high (timed events, DST, recurrence pressure) |
| Schema change | None | One additive table | New tables and an ADR 0008 amendment |

- **Option A** ("Today" Dashboard: today's habits with check-off, unchecked shopping
  items, composed from existing endpoints) is a natural Phase 7.
- **Option C** (Calendar) should follow once B exists. It needs an ADR 0008 amendment
  for timed events and a rule for range queries.
