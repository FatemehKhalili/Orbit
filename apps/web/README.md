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
`create-owner` command, see [apps/api/README.md](../api/README.md)). The dashboard shows a
placeholder for the MVP modules and a **Backend** card that reports the API's
`/health/ready` result; each other module has a placeholder page.

## Configuration

| Variable        | Required | Notes                                                      |
| --------------- | -------- | ---------------------------------------------------------- |
| `ORBIT_API_URL` | yes      | Base URL of the API, as seen from the Next.js server.      |
| `ORBIT_INSECURE_COOKIES` | no | `true` drops `Secure` from the session cookie in production builds. Only for plain HTTP on a trusted home network. |

`ORBIT_API_URL` is read on the server at request time and never shipped to the browser.
See [ADR 0002](../../docs/decisions/0002-frontend-calls-backend-server-side.md).

## Sign-in

`/login` is the only page reachable without a session. The form posts to a Server Action
that calls the API's `POST /auth/login` and stores the token in the `orbit_session`
cookie (`HttpOnly`, `SameSite=Lax`, `Secure` in production). `src/proxy.ts` sends requests
without that cookie to `/login`; the signed-in layout and pages check the session with
the API's `GET /auth/me`. Sign out revokes the session on the API and deletes the cookie.
State-changing requests go through Server Actions only; route handlers are GET-only.

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
`card`, `badge`, `button`, `input` and `label` are in `src/components/ui`.

## Docker

```bash
docker build -t orbit-web .                 # production image (default target)
docker run -p 3000:3000 -e ORBIT_API_URL=http://host.docker.internal:8000 orbit-web
```
