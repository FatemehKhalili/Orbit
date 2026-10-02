# tests

Cross-service tests that need more than one app running. Unit tests live inside each
app (`apps/api/tests`, `apps/web/src/**/*.test.ts`).

Today the end-to-end check is `scripts/smoke-test.sh`, run against `docker compose up`.
Browser-level end-to-end tests will go here when there are features to test.
