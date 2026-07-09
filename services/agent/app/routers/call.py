"""
Outbound AI voice call to relatives, via Twilio.

WHY cloud telephony: an Android app cannot put AI-generated audio onto a live
cellular call (OS blocks call-audio injection since API 20/21). So to actually
*speak* to a relative, the call is placed from the cloud (Twilio) with inline
TwiML — no public webhook needed. The relative sees the Twilio number as caller
ID. Emergency services are NOT called this way (illegal to robo-call 112/108).
"""
from xml.sax.saxutils import escape

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.bedrock import converse_json
from app.config import settings

router = APIRouter()

_twilio_client = None


def _get_twilio():
    global _twilio_client
    if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM_NUMBER):
        return None
    if _twilio_client is None:
        from twilio.rest import Client
        _twilio_client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    return _twilio_client


class RelativeCallRequest(BaseModel):
    to: str                                  # relative's phone number (E.164)
    rider_name: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    blood_group: Optional[str] = None


class RelativeCallResponse(BaseModel):
    sid: Optional[str] = None
    status: str                              # queued | failed | not_configured
    model_used: str                          # bedrock | fallback
    detail: Optional[str] = None


def _maps_link(lat: Optional[float], lng: Optional[float]) -> Optional[str]:
    if lat is None or lng is None:
        return None
    return f"https://maps.google.com/?q={lat:.5f},{lng:.5f}"


def _fallback_messages(req: RelativeCallRequest) -> dict:
    name = req.rider_name or "your family member"
    blood = req.blood_group or "unknown"
    return {
        "hi": (
            f"Namaste. Yah CrashGuard se ek zaroori soochna hai. "
            f"{name} ka motorcycle accident hua ho sakta hai. "
            f"Emergency services aur aapko soochit kiya gaya hai. "
            f"Location aur details aapke phone par SMS mein bheji gayi hain. "
            f"Kripya turant sampark karein."
        ),
        "en": (
            f"Hello. This is an important alert from CrashGuard. "
            f"{name} may have been in a motorcycle accident. "
            f"Emergency services have been notified. "
            f"The location and details have been sent to you by SMS. "
            f"Blood group is {blood}. Please try to reach them immediately."
        ),
    }


SYSTEM_PROMPT = (
    "You compose a short, calm, reassuring phone message that an AUTOMATED system will "
    "speak aloud to a family member whose relative may have been in a motorcycle accident. "
    "Produce two versions: Hindi and English. "
    "CRITICAL RULES: This is an automated call — introduce it as 'an automated safety alert "
    "from CrashGuard'. Do NOT pretend to be a specific person. Do NOT include any placeholders, "
    "brackets, or template fields such as [name], [Your Name], or {rider}. Use ONLY the facts "
    "given (use the rider's actual name if provided). Be clear and non-panic-inducing; say "
    "emergency services have been notified and details were sent by SMS; ask them to try to "
    "reach the person. Keep each version to 2-3 sentences. "
    'Return ONLY valid JSON: {"hi":"<hindi text>","en":"<english text>"}'
)


def _compose_messages(req: RelativeCallRequest) -> tuple[dict, str]:
    facts = {
        "rider_name": req.rider_name,
        "maps_link": _maps_link(req.lat, req.lng),
        "blood_group": req.blood_group,
    }
    data = converse_json(SYSTEM_PROMPT, f"Facts: {facts}")
    if data and data.get("hi") and data.get("en"):
        return {"hi": str(data["hi"]), "en": str(data["en"])}, "bedrock"
    return _fallback_messages(req), "fallback"


def _build_twiml(messages: dict) -> str:
    hi = escape(messages.get("hi", ""))
    en = escape(messages.get("en", ""))
    return (
        "<Response>"
        f'<Say voice="Polly.Aditi" language="hi-IN">{hi}</Say>'
        "<Pause length=\"1\"/>"
        f'<Say voice="Polly.Raveena" language="en-IN">{en}</Say>'
        "</Response>"
    )


@router.post("/relative", response_model=RelativeCallResponse)
async def call_relative(req: RelativeCallRequest) -> RelativeCallResponse:
    client = _get_twilio()
    messages, model_used = _compose_messages(req)

    if client is None:
        return RelativeCallResponse(
            sid=None, status="not_configured", model_used=model_used,
            detail="Twilio credentials not set in the agent service .env",
        )

    try:
        call = client.calls.create(
            to=req.to,
            from_=settings.TWILIO_FROM_NUMBER,
            twiml=_build_twiml(messages),
        )
        return RelativeCallResponse(sid=call.sid, status=call.status or "queued", model_used=model_used)
    except Exception as e:  # Twilio errors (unverified number, geo perms, etc.)
        raise HTTPException(status_code=502, detail=f"Twilio call failed: {e}")
