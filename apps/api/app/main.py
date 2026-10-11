from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from importlib.metadata import version
from zoneinfo import ZoneInfo

from fastapi import FastAPI

from app.api import auth, habits, health, shopping, time
from app.config import Settings, get_settings
from app.database import create_database_engine, create_session_factory


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    engine = create_database_engine(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        yield
        engine.dispose()

    app = FastAPI(title="Orbit API", version=version("orbit-api"), lifespan=lifespan)
    app.state.settings = settings
    app.state.timezone = ZoneInfo(settings.timezone)
    app.state.engine = engine
    app.state.session_factory = create_session_factory(engine)
    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(time.router)
    app.include_router(shopping.router)
    app.include_router(habits.router)
    return app
