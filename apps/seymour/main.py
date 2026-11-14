"""Seymour API entry point."""

from fastapi import FastAPI

from src.executions.infrastructure.router import router as execution_router
from src.health.infrastructure.health_router import router as health_router
from src.shared.infrastructure.logs import configure_logging
from src.shared.infrastructure.model_provider import model_provider

configure_logging()
# Refuses a fake model in a deployed stage at boot, and logs loudly where it is enabled.
model_provider()

app = FastAPI(title="Seymour", description="Papert AI tutor service")

app.include_router(health_router)
app.include_router(execution_router)
