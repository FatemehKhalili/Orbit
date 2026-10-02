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

Open http://localhost:3000. The page shows a placeholder for the MVP modules and a
**Backend** card that reports the API's `/health/ready` result.

## Configuration

| Variable        | Required | Notes                                                      |
| --------------- | -------- | ---------------------------------------------------------- |
| `ORBIT_API_URL` | yes      | Base URL of the API, as seen from the Next.js server.      |

`ORBIT_API_URL` is read on the server at request time and never shipped to the browser.
See [ADR 0002](../../docs/decisions/0002-frontend-calls-backend-server-side.md).

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
`card` and `badge` are already in `src/components/ui`.

## Docker

```bash
docker build -t orbit-web .                 # production image (default target)
docker run -p 3000:3000 -e ORBIT_API_URL=http://host.docker.internal:8000 orbit-web
```
