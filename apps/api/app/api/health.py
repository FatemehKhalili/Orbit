from fastapi import APIRouter, Request, Response, status

from app.database import database_is_reachable

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
def liveness() -> dict[str, str]:
    """The process is up. Does not touch the database."""
    return {"status": "ok", "service": "orbit-api"}


@router.get("/ready")
def readiness(request: Request, response: Response) -> dict[str, str]:
    """The API can serve traffic: the database answers a trivial query."""
    if database_is_reachable(request.app.state.engine):
        return {"status": "ok", "database": "ok"}
    response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {"status": "unavailable", "database": "unreachable"}
