"""HTTP adapter for the health probe."""

from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.health.application.health_service import check_health
from src.health.domain.health import HealthStatus
from src.health.infrastructure.database_probe import SqlAlchemyProbe
from src.shared.infrastructure.database.database import get_session

router = APIRouter()


@router.get("/health", response_model=dict)
async def health(
    session: Annotated[AsyncSession, Depends(get_session)], response: Response
) -> dict:
    result: HealthStatus = await check_health(SqlAlchemyProbe(session))

    if result.status != "ok":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {"status": result.status, "db": result.db}
