"""Infrastructure: HTTP driving adapter for the health probe."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.health.application.health_service import check_health
from src.health.domain.health import HealthStatus
from src.infrastructure.database.database import get_session

router = APIRouter()


@router.get("/health", response_model=dict)
async def health(session: AsyncSession = Depends(get_session)) -> dict:
    result: HealthStatus = await check_health(session)
    return {"status": result.status, "db": result.db}
