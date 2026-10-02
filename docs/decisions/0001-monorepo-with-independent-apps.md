# 0001. Monorepo with independently deployable apps

- Status: Accepted
- Date: 2026-10-02

## Context

Orbit has a Next.js frontend and a FastAPI backend that must deploy independently. The
target structure also lists shared `packages/` (ui, types, config).

## Decision

- One repository holds both apps, the database assets, docs and CI.
- Each app under `apps/` is self-contained: its own dependency manifest, lockfile (web),
  Dockerfile and README. Its Docker build context is its own directory, so it can be
  built and deployed without the rest of the repo.
- No JavaScript workspace or monorepo tool (npm workspaces, Turborepo, Nx) for now.
  `packages/*` exist as documented placeholders and stay empty until a second consumer
  needs shared code.
- Dockerfiles live next to their app. The top-level `docker/` is for assets shared across
  services, of which there are none yet.

## Consequences

- Simple builds and no tooling to learn in Phase 1.
- When a package gains real code, we need to choose how apps consume it (workspaces or a
  build step) and widen the web Docker build context. That gets its own ADR.
- Python and TypeScript types are not shared automatically. If the API's OpenAPI schema
  becomes the source of truth for `packages/types`, that is a later decision.
