from fastapi import APIRouter
from datetime import datetime

router = APIRouter()


@router.get("/health", tags=["health"])
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "crashguard-ml",
        "version": "0.1.0",
        "timestamp": datetime.utcnow().isoformat(),
    }
