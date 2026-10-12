import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from importlib.metadata import version
from time import perf_counter
from zoneinfo import ZoneInfo

from fastapi import FastAPI, Request, Response

from app.api import account, auth, calendar, habits, health, shopping, time
from app.config import Settings, get_settings
from app.database import create_database_engine, create_session_factory

access_logger = logging.getLogger("orbit.access")


def configure_logging() -> None:
    """Orbit's own log lines (`orbit.*`) go to stderr, once per process."""
    logger = logging.getLogger("orbit")
    if logger.handlers:
        return
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(levelname)s [%(name)s] %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    engine = create_database_engine(settings)
    configure_logging()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        yield
        engine.dispose()

    # In production the interactive docs and the schema are not served (ADR 0009).
    docs = settings.environment != "production"
    app = FastAPI(
        title="Orbit API",
        version=version("orbit-api"),
        lifespan=lifespan,
        docs_url="/docs" if docs else None,
        redoc_url="/redoc" if docs else None,
        openapi_url="/openapi.json" if docs else None,
    )
    app.state.settings = settings
    app.state.timezone = ZoneInfo(settings.timezone)
    app.state.engine = engine
    app.state.session_factory = create_session_factory(engine)

    @app.middleware("http")
    async def log_requests(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        # Method, path, status and duration only: never the query string, headers (tokens,
        # cookies) or bodies (passwords), so nothing secret reaches the logs (ADR 0009).
        started = perf_counter()
        response = await call_next(request)
        elapsed_ms = (perf_counter() - started) * 1000
        access_logger.info(
            "%s %s %s %.0fms", request.method, request.url.path, response.status_code, elapsed_ms
        )
        return response

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(time.router)
    app.include_router(shopping.router)
    app.include_router(habits.router)
    app.include_router(calendar.router)
    app.include_router(account.router)
    return app
