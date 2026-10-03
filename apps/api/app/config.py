"""Runtime configuration, read from environment variables.

Nothing here has a credential default: DATABASE_URL must be supplied by the
environment (or an untracked .env file next to where the API is started).
"""

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_POSTGRES_SCHEMES = ("postgresql://", "postgres://", "postgresql+psycopg://")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["development", "test", "production"] = Field(
        default="development", validation_alias="ORBIT_ENV"
    )
    database_url: SecretStr = Field(validation_alias="DATABASE_URL")
    session_ttl_days: int = Field(
        default=30, ge=1, le=365, validation_alias="ORBIT_SESSION_TTL_DAYS"
    )

    @field_validator("database_url")
    @classmethod
    def use_psycopg_driver(cls, value: SecretStr) -> SecretStr:
        """Accept the common postgres:// forms and pin SQLAlchemy to psycopg 3."""
        url = value.get_secret_value()
        if not url.startswith(_POSTGRES_SCHEMES):
            raise ValueError("DATABASE_URL must be a PostgreSQL URL (postgresql://...)")
        scheme, rest = url.split("://", 1)
        return SecretStr(f"postgresql+psycopg://{rest}")


@lru_cache
def get_settings() -> Settings:
    return Settings()
