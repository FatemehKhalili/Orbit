# Orbit Web

Next.js frontend for Orbit (App Router, TypeScript, Tailwind CSS v4, shadcn/ui).
Deployable on its own: it needs Node 22+ (or the Docker image) and `ORBIT_API_URL`.

## Run locally

```bash
cd apps/web
npm install
cp .env.example .env.local    # points at http://localhost:8000 by default
npm run dev
```

Open http://localhost:3000 and sign in with the owner account (create it with the API's
`create-owner` command, see [apps/api/README.md](../api/README.md)). The dashboard greets the
owner with today's date and shows how many habits are done today, how many shopping items
are left to buy, a **Backend** card that reports the API's `/health/ready` result, a
seven-day habit chart and the module orbit. Its **Today's habits** and **To buy** cards
check off today's habits and the first five unchecked items with the Habits and Shopping
Server Actions. **Shopping** (`/shopping`) is the owner's shopping list.
**Habits** (`/habits`) lists active habits, each with a strip of the last seven days to
check off; `/habits/[id]/edit` edits, archives or restores one, and `/habits/archived` lists
archived habits, which can be restored or deleted for good. The other modules have
placeholder pages.

Server code calls the API through `src/lib/api-client.ts` (`apiRequest()`), which adds the
session token and maps failures to `unauthenticated`, `not_found`, `conflict`, `invalid` or
`unavailable`. Forms are Server Actions, so they work without JavaScript; the helpers they
share are in `src/lib/forms.ts`, `src/lib/form-actions.ts` and
`src/components/form-message.tsx`.

"Today" always comes from the API (`GET /time`, in the instance's `ORBIT_TIMEZONE`), and
calendar dates are formatted in UTC, so the web server's own timezone never moves a day.

## Configuration

| Variable        | Required | Notes                                                      |
| --------------- | -------- | ---------------------------------------------------------- |
| `ORBIT_API_URL` | yes      | Base URL of the API, as seen from the Next.js server.      |
| `ORBIT_INSECURE_COOKIES` | no | `true` drops `Secure` from the session cookie in production builds. Only for plain HTTP on a trusted home network. |
| `ORBIT_TRUSTED_PROXY` | no | `true` sends the browser's address (the rightmost `X-Forwarded-For` entry) to the API's sign-in throttle. Only behind a proxy that sets that header, such as the `https` profile's Caddy. |

`ORBIT_API_URL` is read on the server at request time and never shipped to the browser.
See [ADR 0002](../../docs/decisions/0002-frontend-calls-backend-server-side.md).

## Sign-in

`/login` is the only page reachable without a session. The form posts to a Server Action
that calls the API's `POST /auth/login` and stores the token in the `orbit_session`
cookie (`HttpOnly`, `SameSite=Lax`, `Secure` in production). `src/proxy.ts` sends requests
without that cookie to `/login`; the signed-in layout and pages check the session with
the API's `GET /auth/me`. Sign out revokes the session on the API and deletes the cookie.
State-changing requests go through Server Actions only; route handlers are GET-only.

A successful sign-in also sets `orbit_device` (`HttpOnly`, `SameSite=Lax`, `Secure` in
production, 365 days): the browser's known-device token, sent with later sign-ins so
throttling cannot lock the owner out of a browser they already use. A throttled sign-in
shows "Too many sign-in attempts. Try again in N minutes."
([ADR 0010](../../docs/decisions/0010-sign-in-throttling-and-known-devices.md)).

"Download my data" in the signed-in layout links to `/account/export`, a GET route
handler that passes the API's export through as a file download (`no-store`). It works
without JavaScript. Every response carries security headers (`src/lib/security-headers.ts`).

## Health endpoint

`GET /api/health` returns `{"status":"ok","service":"orbit-web"}`. It does not call the API.

## Scripts

| Command             | What it does                    |
| ------------------- | ------------------------------- |
| `npm run dev`       | Dev server with hot reload      |
| `npm run build`     | Production build (standalone)   |
| `npm run lint`      | ESLint                          |
| `npm run typecheck` | Generate route types, run `tsc` |
| `npm test`          | Vitest unit tests               |

## shadcn/ui

`components.json` is configured. Add components with `npx shadcn@latest add <name>`.
`button`, `badge`, `card`, `input`, `textarea` and `label` are in `src/components/ui`,
restyled with the design tokens in `src/app/globals.css`. Use the semantic token names
(`bg-card`, `text-muted-foreground`, `bg-mint-soft`, …) rather than raw colours, so new
components follow light and dark mode.

## Docker

```bash
docker build -t orbit-web .                 # production image (default target)
docker run -p 3000:3000 -e ORBIT_API_URL=http://host.docker.internal:8000 orbit-web
```
