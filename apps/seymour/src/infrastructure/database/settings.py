"""Infrastructure: application settings loaded from environment variables."""

import functools

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Reads environment variables for the Seymour service.

    Database and external service configuration stays in the infrastructure
    layer; domain and application layers have no dependency on pydantic-settings.
    """

    seymour_database_url: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@functools.cache
def get_settings() -> Settings:
    """Return the Settings singleton. Result is cached after the first call."""
    return Settings()
