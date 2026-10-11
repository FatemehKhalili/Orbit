"""Runtime configuration, read from environment variables.

Nothing here has a credential default: DATABASE_URL must be supplied by the
environment (or an untracked .env file next to where the API is started).
"""

from functools import lru_cache
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, SecretStr, field_validator, model_validator
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
    # The instance timezone decides what "today" is (ADR 0008).
    timezone: str = Field(default="UTC", validation_alias="ORBIT_TIMEZONE")
    # Sign-in throttling (ADR 0010). Each bucket allows this many failures before it is
    # blocked; each further failure doubles the block, up to the maximum.
    login_free_attempts: int = Field(
        default=5, ge=1, le=100, validation_alias="ORBIT_LOGIN_FREE_ATTEMPTS"
    )
    login_global_free_attempts: int = Field(
        default=100, ge=1, le=100_000, validation_alias="ORBIT_LOGIN_GLOBAL_FREE_ATTEMPTS"
    )
    login_block_seconds: int = Field(
        default=30, ge=1, le=3600, validation_alias="ORBIT_LOGIN_BLOCK_SECONDS"
    )
    login_max_block_seconds: int = Field(
        default=900, ge=1, le=86_400, validation_alias="ORBIT_LOGIN_MAX_BLOCK_SECONDS"
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

    @field_validator("timezone")
    @classmethod
    def known_timezone(cls, value: str) -> str:
        """Fail at startup on a zone that does not exist, rather than use the wrong day."""
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError(
                "ORBIT_TIMEZONE must be an IANA time zone name such as Europe/Berlin or UTC"
            ) from None
        return value

    @model_validator(mode="after")
    def block_cap_covers_first_block(self) -> "Settings":
        if self.login_max_block_seconds < self.login_block_seconds:
            raise ValueError(
                "ORBIT_LOGIN_MAX_BLOCK_SECONDS must be at least ORBIT_LOGIN_BLOCK_SECONDS"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
