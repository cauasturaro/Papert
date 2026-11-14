"""Settings loaded from environment variables."""

import functools

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Kept in infrastructure so inner layers never depend on pydantic-settings."""

    seymour_database_url: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@functools.cache
def get_settings() -> Settings:
    """Return the Settings singleton. Result is cached after the first call."""
    return Settings()
