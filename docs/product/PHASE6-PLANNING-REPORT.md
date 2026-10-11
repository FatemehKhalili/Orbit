# Orbit Phase 6 planning report

- Status: **Proposal for discussion.** Nothing here is decided. Phase 6 scope is chosen by
  the project owner; this report only recommends.
- Date: 2026-10-11
- Inspected: `origin/main` = `46b2134` ("docs: mark Phase 5 complete and bump versions to
  0.5.0 (#16)"), in a detached checkout with a clean working tree.

Labels: **[Verified]** = checked against the repository, GitHub or a local run.
**[Inferred]** = a conclusion drawn from verified facts, not tested directly.
**[Recommendation]** = a proposal for you to accept, change or reject.
**[Decision needed]** = a product question only you can answer.

No application code, schema, migration, tag or release was changed while preparing this
report. I did not run migrations or touch any database: the API's PostgreSQL-backed tests
(which run migrations against a test database) were not run locally; I relied on CI for
them instead.

## 0. Bottom line

- **[Verified]** Orbit is a working, single-owner, self-hosted web app with two real
  modules (Shopping, Habits), sign-in, and an instance timezone. `main` is green and
  matches the tag `v0.5.0-phase5`.
- **[Verified]** Three of six MVP modules (Finance, Calendar, Wishlist) are placeholders,
  and the Dashboard shows only an orbit diagram and the API's health.
- **[Inferred]** The largest gap is not a missing module. It is that Orbit cannot yet be
  run *for real* safely: there is no production deployment path (the only Compose file is
  the hot-reload development setup), no backup or restore, no way to export your data,
  and no login rate limiting. Those matter more with every module that stores personal
  data, and most of all before Finance.
- **[Recommendation]** Phase 6 = **Option B, "Run Orbit for real"**: a production Compose
  setup and deployment guide, tested backup and restore, a full data export, and login
  rate limiting. It is one coherent, releasable increment with a clear acceptance test:
  "a person can install Orbit on a home server, use it daily, and not lose their data".
- **[Recommendation]** Runner-up: **Option A, a "Today" Dashboard**, which is small and
  visible and could be Phase 7. Option C (Calendar) is the right *later* step but is the
  riskiest to start before B.

## 1. Current-state findings

### 1.1 Repository and release state [Verified]

| Item | Value |
| ---- | ----- |
| `origin/main` | `46b2134` docs: mark Phase 5 complete and bump versions to 0.5.0 (#16) |
| Tags (all annotated) | `v0.1.0-phase1` → `9a555fd`, `v0.2.0-phase2` → `0948848`, `v0.3.0-phase3` → `6bbfbbc`, `v0.4.0-phase4` → `bfedf15`, `v0.5.0-phase5` → `46b2134` |
| `main` vs `v0.5.0-phase5` | identical |
| GitHub Releases | none; phases are published as tags only |
| CI on `main` | run #34 on `46b2134`: success |
| Open issues | 0 |
| Open PRs | 7, all Dependabot: #2 node 22→25-alpine, #3 actions group, #4 web minor/patch, #5 TypeScript 5.9→7.0, #6 @types/node 22→26, #7 ESLint 9→10 (all open since 2026-10-02), #15 API minor/patch group (2026-10-11) |
| Versions | API `pyproject.toml` 0.5.0, web `package.json` 0.5.0; Next 16.3.8, React 19.2.8, Python 3.12 image, PostgreSQL 16 |
| Local checks | Web: 170 tests passed (13 files). API: 49 non-database tests passed, 207 database tests skipped locally by design (CI runs them) |
| Local branch note | the checkout's local `main` branch is stale (`1087aa9`); `origin/main` is authoritative |

**Release convention [Verified]:** one feature PR per phase (squash-merged, `feat: …`),
then a `docs: mark Phase N complete` PR that flips the SPEC status table and bumps
versions, then an annotated `v0.N.0-phaseN` tag. Planning, design and review documents for
Phases 3–5 were kept in the project's shared folder, not in the repository; the
repository's own docs are `docs/product/SPEC.md`, `docs/architecture/ARCHITECTURE.md` and
the ADRs in `docs/decisions/`.

### 1.2 What Orbit does today [Verified]

```
Browser ──▶ apps/web (Next.js, Server Actions) ──server-side──▶ apps/api (FastAPI) ──▶ PostgreSQL
```

| Capability | Where | Evidence |
| ---------- | ----- | -------- |
| One owner per instance, created by CLI | `app/cli.py`, `models/user.py` | DB constraints `ck_users_single_owner` + `uq_users_is_owner` |
| Email/password sign-in, Argon2id, server-side sessions (hash only) | `app/auth/` | ADR 0006; `test_auth_api.py` walks OpenAPI to require `CurrentUserDep` on every route |
| Session cookie HttpOnly, SameSite=Lax, Secure in production | `apps/web/src/lib/session.ts` | ADR 0006 |
| Shopping: one list, add/edit/check/delete | `api/shopping.py`, `(app)/shopping/` | `test_shopping_api.py`, smoke test |
| Habits: daily habits, 7-day check-off window, archive (read-only), restore, delete-archived-only | `api/habits.py`, `(app)/habits/` | `test_habits_api.py` (593 lines), smoke test |
| Instance timezone, `GET /time`, `TodayDep` | `app/clock.py`, `api/time.py`, `config.py` | ADR 0008; startup refuses an unknown zone |
| All forms work without JavaScript | Server Actions | smoke test drives them with curl |
| Health: `/health`, `/health/ready`, web `/api/health` | `api/health.py` | CI image checks |
| CI: lockfile, ruff, pytest with Postgres, ESLint, tsc, Vitest, build, both runtime images, Compose smoke test, `alembic check` | `.github/workflows/ci.yml` | run #34 green |

**API surface [Verified]:** `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`,
`GET /health`, `GET /health/ready`, `GET /time`, `/shopping/items` (GET, POST) and
`/shopping/items/{id}` (GET, PATCH, DELETE), `/habits/habits` (GET, POST),
`/habits/habits/{id}` (GET, PATCH, DELETE), `/habits/habits/{id}/check-ins/{day}` (PUT,
DELETE).

**Schema [Verified]:** one Alembic chain, `a79fa8454c44` (empty baseline) →
`523733546fba` (users, sessions) → `fa85c3680a05` (shopping_items) → `557fe5523984`
(habits, habit_check_ins). Module tables use `UuidPrimaryKeyMixin`, `TimestampMixin`,
`OwnedMixin`; check-ins use a composite FK `(habit_id, owner_id)` → `habits(id, owner_id)`
with cascade. Migrations are applied explicitly, never at API startup (ADR 0004).

**Web [Verified]:** `/login`; signed-in `(app)` group with Dashboard, Shopping (list, edit),
Habits (list with seven-day strip, edit, archived), and `ModulePlaceholder` pages for
Finance, Calendar and Wishlist. One typed API client (`src/lib/api-client.ts`) with
`unauthenticated | not_found | conflict | invalid | unavailable` results. `packages/ui`,
`packages/types`, `packages/config` are README-only placeholders.

### 1.3 What is missing [Verified unless marked]

| Area | Gap | Evidence |
| ---- | --- | -------- |
| Modules | Finance, Calendar, Wishlist are placeholders | `(app)/finance/page.tsx` etc. render `ModulePlaceholder` |
| Dashboard | No content from any module; only a diagram and API health | `(app)/page.tsx` |
| Deployment | Only a development Compose file (dev image targets, source bind-mounts, `--reload`, migrations on start). No production Compose, no reverse-proxy/HTTPS guide | `docker-compose.yml`; the runtime images exist and are CI-checked but nothing composes them |
| Backup / restore | Nothing: no script, no doc, no test | grep for `pg_dump`/`backup` finds nothing in the repo's own files |
| Data export | No way to get your data out except raw SQL | no export route or script |
| Login protection | No rate limiting or lockout on `/auth/login` | ADR 0006 "Known gap"; ARCHITECTURE.md open question |
| Password recovery | Shell only (`set-password`) | ADR 0006, by design |
| Observability | No application logging configuration; uvicorn's default access log only | no `logging` use in `apps/api/app` |
| Session housekeeping | Expired sessions are deleted only for the user who signs in | `auth/service.py: start_session` [Inferred: harmless at one user, grows slowly] |
| Browser tests | The JavaScript-enhanced form path (`useActionState`, pending states) has no automated test | `tests/README.md`; smoke test uses curl |
| Habits history | Older than seven days is stored but not visible | SPEC Phase 5 |
| Dependencies | Seven Dependabot PRs, six of them nine days old; #5 (TypeScript 7) and #7 (ESLint 10) are majors, #2 moves to Node 25 (not an LTS line) | GitHub |
| Releases | Tags only, no GitHub Releases or published images | GitHub |
| Seed data | `database/seed` is empty | README there |

**Phase 5 review follow-ups [Verified]:** the one confirmed defect from the independent
review (D1, Compose turning an empty `ORBIT_TIMEZONE` into UTC) is fixed on `main`
(`docker-compose.yml:30` now uses `${ORBIT_TIMEZONE-UTC}`). The remaining notes were
theoretical races (a check-in or PATCH colliding with a simultaneous archive+delete or
unarchive giving 500 instead of 404/409) and the browser counting an emoji as two
characters against `maxLength`. None stores bad data.

**Minor doc drift [Verified, low]:** locally pytest collects 256 API tests; README says 255.

### 1.4 Architectural limitations and technical risks

1. **Data durability [Inferred, high impact].** All data lives in one Docker volume
   (`postgres-data`) with no backup procedure. `docker compose down -v` (documented in
   the README as how to "also delete the database volume") or a disk failure loses
   everything. For a product whose principle is "your life data stays under your
   control", this is the most serious gap.
2. **No production path [Verified].** A user who follows the README runs the dev targets
   with hot reload and source mounts. The production images exist and pass CI, but how
   to run them together, apply migrations as a one-off step (ADR 0004) and put HTTPS in
   front (required for the Secure cookie) is left to the reader.
3. **Login brute force [Verified gap].** Argon2 cost is the only brake. Acceptable on
   127.0.0.1; not acceptable once a deployment guide invites exposure beyond localhost.
4. **Unbounded growth [Verified, ADR 0007].** Lists are unpaginated by design. Fine for
   Shopping and Habits; Finance and Calendar will need pagination or range queries, and
   ADR 0007 says those modules must define it.
5. **ADR 0008 is date-only [Verified].** It forbids the web from converting between
   zones. A Calendar with *timed* events needs a rule for instants shown in the instance
   zone, which means amending ADR 0008 first.
6. **Single-process assumptions [Inferred].** No Redis or workers (SPEC). Anything
   stateful in memory (for example a naive rate limiter) is only correct while the API
   runs as one process, which is true today but not enforced.
7. **Dependency drift [Verified].** Majors pile up; the longer they wait, the bigger the
   eventual jump.
8. **JS path untested [Verified].** A regression that only affects the enhanced form path
   would pass CI.

No rewrite is warranted **[Recommendation]**: module boundaries, ownership enforcement,
ADR-driven conventions and CI coverage held up well through two modules.

### 1.5 What would make Orbit substantially more useful and coherent [Recommendation]

- **Trust:** being able to install it properly, back it up, restore it and take your data
  elsewhere. This is the precondition for putting anything sensitive (money, calendar)
  into it.
- **A centre:** the Dashboard is the "You" in the orbit diagram but shows nothing about
  you. A daily "Today" view (habits to tick, what's on the list) would make the existing
  modules feel like one product.
- **Breadth:** Calendar and Finance are the modules people judge a "life OS" by, but each
  is large and both reuse conventions (dates, pagination, timezones) that should be
  settled first.

## 2. Three candidate directions

### Option A — Product feature: the "Today" Dashboard

**User problem.** Opening Orbit shows a diagram and a health badge. To see what to do
today, the owner has to visit each module.

**Scope.**
- The Dashboard shows today's date (from `GET /time`), active habits with today's
  check-off toggle, and the shopping list's unchecked items (count plus the first few,
  linking to Shopping).
- Empty and error states per section: one module failing (for example 503) does not
  break the page.
- The API health badge moves to a small footer status.
- Works without JavaScript, as every other page does.

**User value.** High day to day; the first time Orbit acts as one product. Low effort.

**Dependencies.** Habits API and Server Actions (check-off), Shopping API, `GET /time`,
`api-client.ts`.

**Complexity and risks.** Low. Risks: (1) the Dashboard becomes a place every module
must update, creating coupling; (2) designing a summary contract with only two modules
may not fit Calendar and Finance later.

**Database / API / UI.** No schema change. **API:** none if the web composes existing
endpoints in parallel **[Recommendation]**; the alternative, an aggregate
`GET /dashboard/today`, would couple the API to every module. **UI:** new Dashboard
sections, reusing the habit check-off form.

**Testing and acceptance.** Web unit tests for section mapping and partial failure; smoke
test checks today's habit off from the Dashboard and sees it ticked on `/habits`.
Accepted when the Dashboard shows correct today data in the instance timezone, the
check-off works without JavaScript, and a failing module shows a section-level error
only.

**Out of scope.** Widgets or customisable layout, charts, streaks, Calendar or Finance
summaries, notifications.

### Option B — Architecture and reliability: "Run Orbit for real"

**User problem.** Orbit holds personal data but cannot be safely deployed, backed up,
restored or exported, and its sign-in can be brute-forced once exposed.

**Scope.**
1. **Production Compose and deployment guide.** A separate production Compose file using
   the `runtime` images, a one-off `migrate` service running `alembic upgrade head`
   before the API starts (ADR 0004), restart policies, no source mounts, ports bound to
   127.0.0.1, and a guide covering first install, creating the owner, putting a reverse
   proxy with HTTPS in front, and upgrading to a new version.
2. **Backup and restore.** Scripts that take a consistent `pg_dump` of the Orbit database
   to a timestamped file and restore it into an empty database, with documentation on
   scheduling (host cron) and keeping copies off the machine. Restore refuses to run
   against a non-empty database unless explicitly forced.
3. **Data export.** One authenticated API endpoint that returns all of the owner's module
   data (Shopping items, habits including archived ones, and the full check-in history)
   as a versioned JSON document, plus a "Download my data" link in the web app. Import
   is not included.
4. **Login rate limiting.** Close the ADR 0006 gap: after N failed sign-ins in a time
   window, further attempts are refused with 429 for a cool-down, without revealing
   whether the email exists. Recorded in a new ADR.
5. **Operational basics.** Expired-session cleanup and plain request logging that never
   logs tokens, passwords or request bodies.

**User value.** Indirect but foundational: Orbit becomes something a person can actually
rely on. It is also the precondition for Finance.

**Dependencies.** Runtime images and `check-image.sh`, ADR 0004 (migrations), ADR 0006
(auth), ADR 0007 (ownership: export must filter on owner), all module models.

**Complexity and risks.** Medium.
- Restore is destructive by nature: guardrails and a CI round-trip test are essential.
- The rate limiter's storage is a real design choice: in memory (simple, but wrong with
  more than one API process and reset on restart) versus a table (a migration, but
  correct and durable).
- Export format becomes a contract that future modules must extend; it needs a
  `format_version`.
- Deployment advice for reverse proxies varies; the guide should show one example and
  state the requirements rather than support every proxy.

**Database / API / UI.**
- **Database:** no change to existing tables. A table of recent failed sign-in attempts
  only if the persistent limiter is chosen (additive migration).
- **API:** `GET /export` (or `/account/export`) for the signed-in owner; 429 from
  `POST /auth/login`.
- **UI:** a "Download my data" action (likely under the user menu); the login form shows a
  "too many attempts, try again later" message.

**Testing and acceptance.** See section 5.

**Out of scope.** Multi-user, password reset by email, 2FA, import from the export,
automatic scheduled backups inside Orbit (no workers), cloud backup targets, Kubernetes
or Helm, metrics/tracing stacks, publishing images to a registry (unless you decide
otherwise, D6), and new product modules.

### Option C — Strategically ambitious: Calendar

**User problem.** Orbit has no notion of planned time, which is central to a "life OS"
and to a useful Dashboard.

**Scope.**
- Events with a title and notes, either all-day (a date or date range) or timed (start
  and end instants).
- Agenda and month views for a requested date range.
- Create, edit and delete events.
- The ADR 0008 amendment for timed events in the instance timezone.
- Range queries in place of unbounded lists.
- Possibly a Dashboard "today's agenda" section.

**User value.** High, and visible.

**Dependencies.** ADR 0008 (needs amending), ADR 0007 (range queries / pagination rule),
Habits' date handling and the web date utilities.

**Complexity and risks.** High.
- Timed events cross DST changes.
- "The web never converts zones" (ADR 0008) must change for instants.
- Month views without JavaScript need careful server rendering.
- Strong scope gravity: recurrence, reminders, invites, ICS import and sync with real
  calendars.
- Recurrence alone is a phase. Excluding it makes the module much less useful for many
  people.

**Database / API / UI.**
- **Database:** an `events` table (owner, title, notes, `all_day`, `start_date`/`end_date`
  or `starts_at`/`ends_at`, with check constraints), plus range indexes.
- **API:** `/calendar/events` with required `from`/`to` range parameters.
- **UI:** month grid, agenda list, event form.

**Testing and acceptance.** DST-boundary tests, range-query ownership tests, all-day vs
timed rendering in a non-UTC instance zone, and a smoke test that adds an event and sees
it in the agenda.

**Out of scope.** Recurrence, reminders and notifications, invitations or sharing, ICS
import/export, external calendar sync, a per-event timezone, Habits integration.

## 3. Comparison matrix

| Criterion | A: Today Dashboard | B: Run Orbit for real | C: Calendar |
| --------- | ------------------ | --------------------- | ----------- |
| User problem | Product feels like separate pages | Data could be lost; no safe way to deploy; login can be brute-forced | No planned time |
| Visible user value | High, daily | Medium (trust, not features) | High |
| Strategic value | Medium | **High**: unblocks Finance, real use, an open-source audience | High, but deepens risk before B |
| Size | Small | Medium | Large |
| Technical risk | Low | Medium (restore guardrails, limiter design) | High (timed events, DST, scope creep) |
| Schema change | None | None, or one additive table | New table(s), ADR amendment |
| New API | None (recommended) | Export, 429 on login | A full module |
| Coherent and independently releasable | Yes | Yes | Yes, if recurrence stays out |
| Rework risk later | Medium (summary contract may change with more modules) | Low | Medium |
| Product decisions needed first | 2–3 | 6–7 (section 7) | Many (recurrence, timed vs all-day, views) |

## 4. Recommendation [Recommendation]

**Option B, "Run Orbit for real".**

- **It closes the biggest real risk.** After five phases Orbit stores personal data with
  no backup and no export. One `down -v` or one failed disk erases it. Every new module
  makes that worse, and Finance would make it unacceptable.
- **It turns existing work into a usable product.** The production images are already
  built and checked in CI; nothing ties them together for a real install. This phase is
  the missing last mile, not new infrastructure for its own sake.
- **It is concrete, not speculative.** The Phase 5 plan argued against infrastructure-only
  phases because abstractions get designed without a user. That concern does not apply
  here: backup, export and rate limiting each act on real tables and real endpoints that
  exist today, and each has a crisp pass/fail test.
- **It is releasable as one story:** "you can now install Orbit on a home server, back it
  up, restore it, and take your data with you."
- **It sets up what follows.** A rate-limited, deployable, backed-up Orbit is the right
  base for Option A (cheap, Phase 7) and then Calendar or Finance.

**When to pick something else.**
- If Orbit will only ever run on your own laptop at 127.0.0.1 and you value visible
  features now, pick **A**. It is the cheapest big improvement in daily use. B's backup
  piece is still worth doing as a small standalone task.
- Pick **C** only if Calendar is the reason you want Orbit at all, and accept that B's
  risks remain open while it is built.

## 5. Proposed feature breakdown, sequence and acceptance criteria (Option B)

The order below puts the cheapest, most-protective work first. The intent is one feature
branch and one PR, as in Phases 4 and 5, with the commits in this order. It could also be
split into separate PRs if you prefer (D7).

**Step 0 (before the phase, separate maintenance) [Recommendation].** Triage the
Dependabot backlog:
- Merge the minor/patch groups (#3, #4, #15) after CI.
- Close or defer #2, because Node 25 is not an LTS line. Stay on Node 22 LTS or move to the
  next LTS.
- Evaluate #5 (TypeScript 7), #6 (@types/node 26) and #7 (ESLint 10) individually.

This keeps Phase 6 diffs free of dependency noise.

**Step 1: ADRs first.**
- ADR 0009: deployment, backups and data export. It covers the production Compose shape,
  the backup format and restore rules, and the export contract with `format_version`.
- ADR 0010 (or an amendment to ADR 0006): login rate limiting. It covers the storage
  choice, limits and response.

Docs-only. Reviewed before any code.

**Step 2: production Compose + deployment guide.**
- Acceptance:
  - From a clean machine, following the guide (only `.env` values change), `docker
    compose -f <prod file> up -d` starts db, a one-off migrate step, api and web from the
    `runtime` targets with no source mounts.
  - The owner is created with the CLI; sign-in works behind the documented HTTPS reverse
    proxy example.
  - An upgrade from the previous tag runs migrations once, before the new API serves.
  - The API never runs migrations on its own startup, as ADR 0004 requires.
  - CI runs the existing smoke test against the production stack as well as (or instead
    of) the dev stack.

**Step 3: backup and restore.**
- Acceptance:
  - `backup` produces a timestamped, self-contained dump without stopping the app.
  - `restore` into an empty database brings back every user, session-independent row,
    shopping item, habit and check-in.
  - `restore` refuses a non-empty target unless an explicit force flag is given, and says
    what it would overwrite.
  - A CI job does a full round trip: seed through the API, back up, destroy the volume,
    restore, run `alembic check`, then verify through the API that the data is identical.
  - Backup files are never written inside the repository tree by default, and the docs
    warn that they contain the password hash and all personal data.

**Step 4: data export.**
- Acceptance:
  - An authenticated request returns a JSON document with `format_version`, `exported_at`,
    the instance timezone, and every Shopping item, habit (active and archived) and
    check-in of the signed-in owner. It includes no password hash, session data or other
    users' rows.
  - Without a session it returns 401. A second user's data never appears; this is tested
    with `two_users_client`.
  - The web app offers it as a download that works without JavaScript.
  - A test fails if a new module table with `owner_id` is not included in the export, or
    is not explicitly excluded.

**Step 5: login rate limiting.**
- Acceptance:
  - After the agreed number of failed attempts in the window (D3), further attempts get
    429 with a `Retry-After` header, whether or not the email exists. A correct password
    during the cool-down is also refused.
  - Successful sign-in behaviour is unchanged.
  - Limits are configurable through environment variables with safe defaults, following
    ADR 0003.
  - The login form shows a clear message.
  - Tests cover the threshold, the window expiry (with a pinned clock), and that the
    response does not reveal whether the email exists.

**Step 6: operational basics.**
- Acceptance:
  - Expired sessions are removed on a schedule that needs no worker, for example on any
    sign-in or through a CLI command the guide tells you to run from cron.
  - Request logs carry method, path, status and duration, and never tokens, cookies,
    passwords or bodies. A test asserts that a sign-in request does not log its secret.

**Step 7: docs, smoke test, versions.**
- Update SPEC (Phase 6 section, status "In progress" until you mark it), ARCHITECTURE,
  READMEs and the env examples.
- Bump versions only in the "mark complete" PR, as before.

**Phase-level acceptance:**
- All five CI jobs are green, plus the new backup round-trip job.
- No existing test changes behaviour.
- `alembic check` is clean.
- A person who has never seen Orbit can install it, use it, back it up, restore it on a
  second machine and download their data, following only the docs.

## 6. Security, migration, testing and deployment considerations

**Security.**
- Backups and exports are the most sensitive artefacts Orbit will produce. The docs must
  say this, the scripts must create files with owner-only permissions, and no example
  path may point inside the repository.
- The export goes only through the authenticated API, filtered on `owner_id` in SQL
  (ADR 0007). It never includes `password_hash` or the `sessions` table.
- The rate limiter must not become an enumeration oracle: the response is the same for a
  known and an unknown email. Limiting per IP needs a trusted-proxy rule, because the API
  sees the web server's address, not the browser's (ADR 0002). This is why D3 matters.
- Restore must never run implicitly (for example at container start).
- Logging must exclude secrets; this needs a test, not just a review.

**Migrations.**
- Possibly one additive migration, for a failed-attempts table if a persistent limiter is
  chosen. No change to existing tables.
- Upgrade, downgrade, re-upgrade and `alembic check` follow the existing
  `test_migrations.py` pattern.
- The production upgrade path (a one-off migrate before the API) is part of the
  deliverable and must be exercised in CI.

**Testing.**
- API: export ownership with `two_users_client`; limiter threshold and window with a
  pinned clock; logging redaction.
- Scripts: a backup/restore round trip in CI against throwaway Compose volumes only.
- Web: unit tests for the 429 message and the download link.
- Smoke: runs against the production Compose stack.
- **Optional [Decision needed, D8]:** one Playwright browser test to cover the
  JavaScript-enhanced path. Chromium is available in CI images, but this adds a
  dependency and a CI job.

**Deployment.**
- The development Compose stays as it is for contributors.
- The production file is new and separate, so nothing changes for existing dev users.
- Existing installs that ran the dev Compose with real data need a documented migration
  path to the production file that keeps the same database volume. Without it, users may
  lose data while switching.

## 7. Open product decisions that need your input

Nothing below has been decided. My suggestion is marked ★, but these are your calls.

| # | Question | Options |
| - | -------- | ------- |
| D1 | Which direction is Phase 6? | ★ B "Run Orbit for real" · A "Today" Dashboard · C Calendar |
| D2 | Who is the deployment target? | ★ A home server or VPS behind your own HTTPS reverse proxy · localhost only (then B shrinks to backup + export) · public internet with a guide for hardening |
| D3 | How should login rate limiting count failures? | ★ Per account, stored in the database (survives restarts, no proxy trust needed) · per client IP (needs trusted-proxy configuration) · in-memory only |
| D4 | What should the export include? | ★ All module data incl. archived habits and full check-in history, JSON only · also CSV per module · also account profile (email, display name) |
| D5 | Should import (restoring from an export file) be in Phase 6? | ★ No, backups cover restore; import later · Yes |
| D6 | Should Phase 6 publish releases? | ★ GitHub Release notes on the tag, no image registry · also publish images to GHCR · keep tags only |
| D7 | Delivery shape | ★ One feature PR, as in Phases 4–5 · separate PRs per step |
| D8 | Add one browser (Playwright) test for the JavaScript path? | Yes, one happy path · ★ No, keep it for a later phase |
| D9 | Handle the Dependabot backlog before Phase 6 as maintenance? | ★ Yes, separately, before the phase · fold into Phase 6 · leave it |

If you choose A or C instead, they bring their own decisions:
- **A:** what appears on the Dashboard and in what order, whether checking off from the
  Dashboard is allowed, and how many shopping items to show.
- **C:** all-day only or timed events too, whether recurrence is in or out, which views,
  and a per-event timezone (no).

I will ask about those only if you pick one of them.
