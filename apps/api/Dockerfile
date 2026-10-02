# Orbit API image. Build context: apps/api
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
RUN useradd --create-home --uid 1000 orbit

# Development: dev dependencies installed, source bind-mounted, auto-reload.
FROM base AS dev
COPY pyproject.toml README.md ./
COPY app ./app
RUN pip install -e '.[dev]'
USER orbit
EXPOSE 8000
CMD ["uvicorn", "--factory", "app.main:create_app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# Production: runtime dependencies only. This is the default target.
FROM base AS runtime
COPY pyproject.toml README.md ./
COPY app ./app
RUN pip install .
USER orbit
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2)"
CMD ["uvicorn", "--factory", "app.main:create_app", "--host", "0.0.0.0", "--port", "8000"]
