# database/migrations

Migrations do not live here. They are Alembic revisions in
[`apps/api/migrations`](../../apps/api/migrations), so the API image contains them and can
migrate its own database. See
[ADR 0004](../../docs/decisions/0004-database-migrations-with-alembic.md) and
[apps/api/README.md](../../apps/api/README.md).
