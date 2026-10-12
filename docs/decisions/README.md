# Architecture decision records

One file per non-obvious decision, numbered in order: `NNNN-short-title.md`.
Each records the context, the decision, and its consequences. Superseded records stay,
marked as superseded with a link to the replacement.

| ADR | Title | Status |
| --- | ----- | ------ |
| [0001](0001-monorepo-with-independent-apps.md) | Monorepo with independently deployable apps | Accepted |
| [0002](0002-frontend-calls-backend-server-side.md) | Frontend calls the backend from the server | Accepted |
| [0003](0003-configuration-through-environment-variables.md) | Configuration through environment variables | Accepted |
| [0004](0004-database-migrations-with-alembic.md) | Database migrations with Alembic, owned by the API | Accepted |
| [0005](0005-python-dependency-locking-and-updates.md) | Python dependency locking with uv, updates with Dependabot | Accepted |
| [0006](0006-owner-account-and-sessions.md) | One owner account with server-side sessions | Accepted |
| [0007](0007-product-module-api-conventions.md) | Product module API conventions and ownership | Accepted |
| [0008](0008-dates-and-the-instance-timezone.md) | Dates and the instance timezone | Accepted |
| [0009](0009-production-deployment-backups-and-upgrades.md) | Production deployment, backups, export and upgrades | Accepted |
| [0010](0010-sign-in-throttling-and-known-devices.md) | Sign-in throttling and known devices | Accepted |
| [0011](0011-calendar-events-and-time.md) | Calendar events and time | Accepted |
| [0012](0012-google-calendar-sync.md) | Two-way Google Calendar sync | Proposed (Phase 9) |
