# 0002. Frontend calls the backend from the server

- Status: Accepted
- Date: 2026-10-02

## Context

The web app must talk to the API. Options:

1. The browser calls the API directly, with the URL in a `NEXT_PUBLIC_*` variable.
2. The Next.js server calls the API (server components, route handlers, server actions).

`NEXT_PUBLIC_*` values are inlined at build time, so one image could not be promoted
across environments, and the browser route needs CORS on the API.

## Decision

The Next.js server calls the API, using `ORBIT_API_URL` read at request time. The
browser only ever talks to the web app. The API has no CORS configuration.

In Compose, `ORBIT_API_URL=http://api:8000` uses the internal network; locally it is
`http://localhost:8000`.

## Consequences

- One web image works against any API; the URL is runtime configuration.
- The API can stay on a private network in production.
- No CORS policy to maintain for now.
- If a feature later needs the browser to call the API directly (for example streaming),
  we add CORS with an explicit origin allow-list and revisit this record.
