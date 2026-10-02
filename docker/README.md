# docker

Docker assets shared across services (for example database init scripts). Empty in
Phase 1. Each app keeps its own `Dockerfile` so it can be built and deployed on its own;
the development stack is `docker-compose.yml` at the repo root.
