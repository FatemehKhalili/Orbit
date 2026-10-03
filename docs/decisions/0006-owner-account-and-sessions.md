# 0006. One owner account with server-side sessions

- Status: Accepted
- Date: 2026-10-03

## Context

Orbit is about to store personal data (money, calendar, wishes). A self-hosted instance
may be reachable from a home network or the internet, so it needs sign-in before the
first module ships. The SPEC rules out external authentication providers for the MVP,
and Orbit is single-user first. The browser only talks to the web app, which calls the
API from its server ([ADR 0002](0002-frontend-calls-backend-server-side.md)).

## Decision

- **One owner per instance.** The `users` table holds at most one row, and the database
  enforces it: `is_owner` is a non-null boolean that a check constraint
  (`ck_users_single_owner`) forces to `true`, and a unique constraint
  (`uq_users_is_owner`) allows only one row with that value. A second insert fails with
  a unique violation however it arrives, including concurrently. The application also
  checks first, only to give a friendlier error.
- **Owner created from the command line only.** `python -m app.cli create-owner` creates
  the owner; `set-password` changes the password and signs out every session. There is no
  HTTP route that creates users and no sign-up page, so nobody can claim a freshly
  deployed instance over the network. Passwords come from a prompt or stdin, never from
  arguments.
- **Email and password.** Emails are validated and stored lower-cased. Passwords are at
  least 12 characters and hashed with Argon2id (`argon2-cffi` defaults); hashes made with
  older parameters are upgraded at the next sign-in. Unknown emails still pay for a hash
  check, and every failed sign-in gets the same 401 response.
- **Opaque, server-side sessions.** `POST /auth/login` creates a 256-bit random token
  (`secrets.token_urlsafe(32)`) and returns it once. The `sessions` table stores only its
  SHA-256 hash and an expiry (`ORBIT_SESSION_TTL_DAYS`, default 30). Requests send the
  token as `Authorization: Bearer`. `POST /auth/logout` deletes that session's row, which
  revokes it immediately. No JWT, so there is no signing key to configure or leak.
- **`CurrentUserDep` on every endpoint** except `/health`, `/health/ready` and
  `/auth/login`. A test checks this against the OpenAPI schema.
- **Web session cookie.** The login form is a Server Action. On success the Next.js
  server stores the raw token in the `orbit_session` cookie: `HttpOnly`,
  `SameSite=Lax`, `Path=/`, expiring with the session, and `Secure` when
  `NODE_ENV=production`. `ORBIT_INSECURE_COOKIES=true` drops `Secure` for plain-HTTP
  installs on a trusted home network. Sign-out calls the API's logout and then deletes
  the cookie.
- **Route protection.** `src/proxy.ts` redirects requests without a session cookie to
  `/login` (public: `/login`, `/api/health`). The signed-in layout and each page then ask
  the API (`GET /auth/me`) whether the session is valid, and redirect to `/login` if not.
  If the API cannot be reached, the web app says so instead of redirecting.
- **CSRF.** State-changing requests that use the cookie only go through Server Actions,
  which Next.js rejects when `Origin` does not match the host. Route handlers stay
  GET-only, and a test checks this.
- **Module tables carry `owner_id`.** `app.models.mixins.OwnedMixin` adds `owner_id`
  (foreign key to `users.id`, cascade on delete). Every product-module table uses it, so a
  multi-user Orbit would not mean rewriting each table.

## Consequences

- The API stays the only component that touches the database or decides who is
  signed in. The web app holds only an opaque token.
- A leaked database does not leak working sessions or plain passwords.
- Any API endpoint can be called directly with a bearer token, which is how the smoke
  test and future scripts work. The API still needs no CORS.
- Password recovery means shell access to the server (`set-password`). There is no email.
- **Known gap: no rate limiting or lockout** on `/auth/login`. Guessing is slowed only by
  Argon2's cost. Compose binds ports to 127.0.0.1. Revisit this before writing an
  internet-facing deployment guide.
- Moving to several users would mean dropping `ck_users_single_owner` and
  `uq_users_is_owner` and adding sign-up or invitations. That needs its own ADR.
