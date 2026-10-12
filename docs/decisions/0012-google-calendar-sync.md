# 0012. Two-way Google Calendar sync

- Status: Proposed, for Phase 9. Nothing here is built in Phase 8. Before Phase 9 code
  starts, Google's current documentation is re-checked (see "To verify first").
- Date: 2026-10-12
- Depends on: [ADR 0011](0011-calendar-events-and-time.md)

## Context

The owner wants an event created in Orbit to appear in Google Calendar, and an event
created or changed in Google Calendar to appear in Orbit. Orbit is self-hosted, private by
default, has one owner, stores only hashes of secrets, makes no outbound calls today, and
SPEC rules out background workers and external authentication providers.

Phase 8 builds the internal Calendar so this can be added without migrating its data
(ADR 0011). This record keeps the design and the safeguards agreed for it, so Phase 9
starts from them.

## Decision

- **Opt-in, one account, one calendar.** Sync exists only when the owner configures their
  own Google OAuth client (`ORBIT_GOOGLE_CLIENT_ID`, `ORBIT_GOOGLE_CLIENT_SECRET`) and
  connects. No shared Orbit OAuth client.
- **OAuth is for data access, not sign-in.** Authorization code flow with `state` bound
  to the session (and PKCE, to verify), `access_type=offline`, `prompt=consent`. Scopes:
  `calendar.events.owned` and `calendar.calendarlist.readonly`; both must be granted.
  One refresh token per owner, replaced on reconnect (Google keeps at most 100 per client
  and account and drops the oldest silently).
- **Secrets are never stored in plaintext and never logged.** Refresh tokens are
  encrypted (AES-GCM, key `ORBIT_SECRET_KEY` from the environment, never in the database
  or backups) and excluded from the export. `invalid_grant` puts the connection in
  `needs_reconnect`.
- **Orbit's table is the source every page reads.** Writes are saved locally first and
  marked pending; Google is updated after. Google being unavailable never blocks Orbit.
- **No worker.** Sync runs after an Orbit change, on Calendar or Dashboard load when older
  than 60 seconds, on "Sync now", and from `python -m app.cli calendar-sync`, which a host
  timer may run. One sync at a time per owner (advisory lock). No push notifications.
- **Event identity is stored, never inferred.** `calendar_event_links` holds the Orbit ID
  and the Google ID with a unique `(owner_id, google_event_id)` and a unique Orbit ID.
  Orbit creates Google events with the ID `orbit_uuid.hex` (always 32 characters from
  `0–9a–f`, inside Google's `a–v0–9`, length 5–1024; a test checks the format) and marks
  them with the private extended property `orbit_event_id`. Because Google does not
  guarantee to detect a repeated ID at creation, Orbit reads the ID back before retrying
  an insert. If an event already holds that ID without Orbit's marker, it is not
  Orbit's: Orbit leaves it untouched, picks a fresh random ID, stores it on the link and
  inserts again. Google's own duplicate error is only a second line of defence.
- **Deletes and failures never block Orbit.** An Orbit delete is immediate; a tombstone
  link carries it to Google. A failed push stays pending (or `push_failed` with Google's
  reason for a refused event) and is retried by the next sync.
- **Incremental sync with sync tokens** (no time bounds, since `timeMin`/`timeMax` are not
  allowed with them). On `410 Gone`, pending Orbit changes are pushed first, then
  everything Orbit holds about Google is cleared and the calendar is listed again in
  full. A full resync command runs after restoring a backup.
- **Conflicts are detected from sync state and etags, never from clocks.** A conflict
  exists only when Orbit has a change Google has not accepted yet (a pending link or a
  tombstone) and Google's etag differs from the one stored at the last successful sync
  (a `412` on Orbit's `If-Match` patch, or a pull that returns a new etag). An event
  changed on one side only is never a conflict.
- **Choosing the version to keep, without losing the other.** Only once a conflict
  exists are the two change times compared (Google's `updated`, and the time Orbit saved
  its change). More than 2 minutes apart, the later one wins; within 2 minutes the order
  is treated as unknown and Google's version is kept. In every case the losing version is
  saved in `calendar_event_conflicts` (a full snapshot, both change times, when it was
  detected), shown to the owner, and restorable with "Use the other version", which saves
  it as a normal Orbit edit (or recreates a deleted event). This covers edit against
  edit, edit against delete and delete against edit. Orbit patches only the fields it
  owns.
- **Recurring events** from Google are stored as series plus exceptions and shown
  read-only; Orbit does not create or edit them.
- **Disconnect** revokes the token, deletes tokens and links, keeps single events locally,
  removes read-only recurring copies, and deletes nothing in Google.

## To verify first

Checked against Google's documentation on 2026-10-12: client-supplied event ID rules,
`events.insert` scopes, sync-token rules and `410` recovery, `If-Match` and `412`,
refresh-token expiry causes, redirect-URI rules. Still to verify when Phase 9 starts,
together with a fresh check of all of the above:

- whether `events.insert` returns a specific error for an ID that already exists;
- that Google accepts a timed event whose end equals its start (otherwise send end =
  start + 1 minute and record that on the link);
- that an all-day `end.date` is exclusive;
- PKCE support for web clients, and whether DPoP affects a confidential web client;
- what `calendar.events.owned` covers on the owner's primary calendar, and each scope's
  current classification;
- retention of deleted events, current quotas and rate-limit error reasons.

## Consequences

- New runtime dependencies in Phase 9: `httpx`, `cryptography`, `python-dateutil`.
- New settings, a setup guide (Google Cloud project, "In production" publishing status,
  redirect URI on `localhost` or a public HTTPS domain) and runbook steps (keep `.env`
  with backups; `calendar-sync --full` after a restore).
- SPEC's MVP exclusions are amended: OAuth for data access is allowed; background
  workers stay excluded.
- Calendar data leaves the instance, to Google, when and only when the owner connects.
- Tests use a fake Google server; a manual check against a real account gates each
  release that changes sync.
