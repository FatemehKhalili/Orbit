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
