# tests

Cross-service tests that need more than one app running. Unit tests live inside each
app (`apps/api/tests`, `apps/web/src/**/*.test.ts`).

Today the end-to-end check is `scripts/smoke-test.sh`, run against `docker compose up`.
It signs in and out through the web login form with curl, the way a browser without
JavaScript would.
Browser-level end-to-end tests will go here when there are features to test.
