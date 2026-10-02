import pytest

from app.config import Settings

# Points at a port nothing listens on, so any accidental connection fails fast.
UNREACHABLE_DATABASE_URL = "postgresql://orbit:not-a-secret@127.0.0.1:1/orbit"


@pytest.fixture
def settings() -> Settings:
    return Settings(ORBIT_ENV="test", DATABASE_URL=UNREACHABLE_DATABASE_URL, _env_file=None)
