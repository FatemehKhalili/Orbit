# 0005. Python dependency locking with uv, updates with Dependabot

- Status: Accepted
- Date: 2026-10-02

## Context

In Phase 1 the web app had a lockfile (`package-lock.json`) but the API only had version
ranges in `pyproject.toml`, so two builds of the same commit could install different
packages. Nothing told us when dependencies had updates or security fixes.

## Decision

- **uv** locks the API's dependencies in `apps/api/uv.lock`, including the `dev` extra.
  `pyproject.toml` keeps the allowed ranges; the lockfile pins exact versions and hashes.
- The Docker image and CI install with `uv sync --frozen`, so they fail instead of
  silently resolving new versions. CI also runs `uv lock --check` to catch a
  `pyproject.toml` change without a matching lock update.
- The uv version is pinned (Docker `COPY --from=ghcr.io/astral-sh/uv:<version>`, and
  `setup-uv` in CI).
- `pip install -e '.[dev]'` still works for anyone without uv; it just does not use the lock.
- **Dependabot** (`.github/dependabot.yml`) opens weekly update PRs for the API (uv), the
  web app (npm), GitHub Actions and Docker base images. Minor and patch updates are grouped
  per ecosystem; major updates arrive one by one. PostgreSQL major versions are ignored
  because they need a data upgrade, not just a new image tag.

## Consequences

- Both apps now have a lockfile, which completes the reproducible-build part of
  [ADR 0001](0001-monorepo-with-independent-apps.md).
- Adding or changing a Python dependency means editing `pyproject.toml` and running
  `uv lock` in `apps/api`.
- Dependabot PRs go through the normal CI, including the Compose smoke test.
