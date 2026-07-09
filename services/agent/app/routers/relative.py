"""
Relative-message agent — composes the SMS/spoken text sent to the injured
rider's emergency contacts. Tone: informative and reassuring, never panic-inducing.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from app.bedrock import converse

router = APIRouter()


class RelativeRequest(BaseModel):
    rider_name: Optional[str] = None
    contact_name: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    blood_group: Optional[str] = None
    language: str = "en"     # single language for the message body


class RelativeResponse(BaseModel):
    message: str
    maps_link: Optional[str] = None
    model_used: str


def _maps_link(lat: Optional[float], lng: Optional[float]) -> Optional[str]:
    if lat is None or lng is None:
        return None
    return f"https://maps.google.com/?q={lat:.5f},{lng:.5f}"


def _fallback(req: RelativeRequest, link: Optional[str]) -> str:
    name = req.rider_name or "Your contact"
    loc = link or "Location unavailable"
    if req.language == "hi":
        return (
            f"CrashGuard alert: {name} ka motorcycle accident hua ho sakta hai. "
            f"Emergency services ko soochit kar diya gaya hai. Location: {loc}. "
            f"Blood group: {req.blood_group or 'unknown'}. Kripya sampark karein."
        )
    return (
        f"CrashGuard alert: {name} may have been in a motorcycle accident. "
        f"Emergency services have been contacted. Location: {loc}. "
        f"Blood group: {req.blood_group or 'unknown'}. Please try to reach them."
    )


SYSTEM_PROMPT = (
    "You write a short SMS to notify a family member that their relative may have been in a "
    "motorcycle accident. Be calm, clear and reassuring; do not use alarming language or emojis "
    "excessively. Include that emergency services have been contacted and the location link if "
    "provided. Keep it under 320 characters. Return ONLY the message text, no preamble."
)


@router.post("/", response_model=RelativeResponse)
async def relative_message(req: RelativeRequest) -> RelativeResponse:
    link = _maps_link(req.lat, req.lng)
    facts = {
        "rider_name": req.rider_name,
        "contact_name": req.contact_name,
        "maps_link": link,
        "blood_group": req.blood_group,
        "language": req.language,
    }
    text = converse(SYSTEM_PROMPT, f"Write the SMS in language '{req.language}'. Facts: {facts}")
    if text:
        return RelativeResponse(message=text.strip(), maps_link=link, model_used="bedrock")
    return RelativeResponse(message=_fallback(req, link), maps_link=link, model_used="fallback")
