from fastapi import APIRouter

from app.bedrock import bedrock_available
from app.config import settings

router = APIRouter()


@router.get("/")
async def health():
    return {
        "status": "ok",
        "service": "crashguard-agent",
        "model": settings.BEDROCK_MODEL_ID,
        "region": settings.AWS_REGION,
        "bedrock_configured": bedrock_available(),
        "places_configured": bool(settings.GOOGLE_PLACES_API_KEY),
        "twilio_configured": bool(
            settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM_NUMBER
        ),
    }
