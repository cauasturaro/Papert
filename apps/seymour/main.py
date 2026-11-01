"""Seymour API entry point."""

from fastapi import FastAPI

from src.health.infrastructure.health_router import router as health_router

app = FastAPI(title="Seymour", description="Papert AI tutor service")

app.include_router(health_router)
