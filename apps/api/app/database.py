from sqlalchemy import Engine, create_engine, text

from app.config import Settings


def create_database_engine(settings: Settings) -> Engine:
    # create_engine does not connect; the first query does.
    return create_engine(settings.database_url.get_secret_value(), pool_pre_ping=True)


def database_is_reachable(engine: Engine) -> bool:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception:
        return False
    return True
