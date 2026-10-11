# 0010. Sign-in throttling and known devices

- Status: Accepted
- Date: 2026-10-11

## Context

Phase 6 makes Orbit reachable from other devices, behind HTTPS. Until now nothing slowed
down password guessing: anyone who could reach the login page could try passwords as fast
as Argon2 allows. Two things have to hold at once:

- Guessing the owner's password must be slow, from one address or from many, and
  checking passwords for emails that do not exist must not become a way to burn the
  server's CPU.
- None of this may become a way to lock the owner out. A stranger who knows (or guesses)
  the owner's email must not be able to keep them from signing in, for minutes at a
  stretch or for good.

The first is the usual answer: count failures and block. The second rules out the usual
lockout: if failures from anyone can block the account, an attacker can keep it blocked
by failing once every block. A short, capped block only shortens each lockout; the
attacker just repeats it.

Orbit has one owner ([ADR 0006](0006-owner-account-and-sessions.md)), and the API is
reachable only from the web app's server in production
([ADR 0009](0009-production-deployment-backups-and-upgrades.md)).

## Decision

**Failures are counted in the database, in buckets.** The `login_throttles` table holds
one row per bucket: a key, a failure count, the time of the last attempt and, while
blocked, `blocked_until`. Each sign-in attempt counts against every bucket it belongs to:

| Bucket  | Key                                         | Free attempts | When                                         |
| ------- | ------------------------------------------- | ------------- | -------------------------------------------- |
| Account | SHA-256 of the normalized email             | 5             | Always, whether or not the email exists      |
| Address | SHA-256 of the client IP                    | 5             | Only with a trusted proxy (below)            |
| Global  | `global`                                    | 100           | Always (attempts without a known device)     |
| Device  | SHA-256 of the known-device token's hash    | 5             | Instead of all three, for a known device     |

- **Progressive, capped blocks.** The attempt that uses up a bucket's free attempts
  blocks it for `ORBIT_LOGIN_BLOCK_SECONDS` (30), and each further failure once the block ends
  doubles it, up to `ORBIT_LOGIN_MAX_BLOCK_SECONDS` (900, 15 minutes). With the
  defaults: five tries, then 30 s, 60 s, 120 s, 240 s, 480 s, and 900 s from then on. There is no permanent lockout.
  A bucket forgets its count a day after its last attempt.
- **A blocked attempt is refused before the password is checked**: `429` with
  `Retry-After`, the same answer for an existing and a non-existent email, and no Argon2
  work. A correct password is refused too while blocked; otherwise the block would not
  slow down guessing. Refused attempts are not counted, so hammering a block does not
  lengthen it.
- **Success clears** the attempt's own buckets, and takes one off the global count.
- **Counting is exact under concurrency**: each bucket row is locked (`SELECT … FOR
  UPDATE`) while it is updated, so parallel guesses cannot slip through between a read and
  a write.
- **Only hashes are stored.** A mistyped email, or a password pasted into the email field,
  never reaches the database in clear; neither does a client address.
- **Client address.** The browser's address is known only to the web app's server, and
  only a proxy in front of it can vouch for it. The web app forwards the rightmost
  `X-Forwarded-For` address (the one its own proxy added) as `client_ip` only when
  `ORBIT_TRUSTED_PROXY=true`; otherwise there is no address bucket. The API accepts
  `client_ip` only from its caller, which in production is the web app alone.

**Known devices keep the owner in.** A successful sign-in gives the browser a device
token: random, kept in an HttpOnly, SameSite=Lax cookie (`orbit_device`, Secure in
production) for 365 days, stored by the API only as a hash in `login_devices`, and tied
to the user. An attempt that brings a valid device token for the email being signed in
to counts against that device's own bucket only, not the account, address or global
buckets. So:

- Attackers who fill the account and global buckets block every browser that has never
  signed in, but not the owner's own browsers. A browser that has signed in once stays
  usable for a year after its last sign-in, whatever strangers do.
- A stolen device token gives nothing without the password, and its own bucket still
  slows guessing with it.
- A new browser, or one whose cookies were cleared, is in the same position as a
  stranger. Then `python -m app.cli clear-login-blocks` on the server lifts every block
  at once.

**Settings** (ADR 0003): `ORBIT_LOGIN_FREE_ATTEMPTS` (5), `ORBIT_LOGIN_GLOBAL_FREE_ATTEMPTS`
(100), `ORBIT_LOGIN_BLOCK_SECONDS` (30), `ORBIT_LOGIN_MAX_BLOCK_SECONDS` (900; the API
refuses to start if it is below the first block).

**Housekeeping.** Each successful sign-in, and `python -m app.cli purge-expired` (for
cron), delete expired sessions and devices and throttle rows whose count is forgotten.

## Consequences

- Guessing the owner's password costs at least 15 minutes per guess after the first few,
  however many addresses the guesser uses, because the account bucket ignores the address.
- An attacker can still make a new browser wait up to 15 minutes, and keep doing so. The
  owner's existing sessions (30 days) and known browsers (a year) are not affected, and
  the CLI clears the blocks. This is the trade-off: a lockout that cannot touch the
  owner's own devices, instead of no lockout at all.
- Responses never reveal whether an email exists: unknown emails are counted and blocked
  exactly like the owner's.
- The global bucket caps Argon2 work from strangers at about 100 hashes before blocks
  apply, whichever emails they try.
- The throttle state is security state, not owner data: it is in backups (like every
  table) but never in the export, and its migration can be undone without losing data.
- Adding users later keeps this design: buckets are per email, devices per user.
