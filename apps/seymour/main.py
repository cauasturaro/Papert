"""Seymour API entry point."""

from fastapi import FastAPI

from src.health.infrastructure.health_router import router as health_router
from src.tutor.infrastructure.router import router as tutor_router

app = FastAPI(title="Seymour", description="Papert AI tutor service")

app.include_router(health_router)
app.include_router(tutor_router)
