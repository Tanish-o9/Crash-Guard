"""
Outbound AI voice calls, via Twilio (an Android app cannot put AI audio on a live
cellular call, so these are placed from the cloud with inline TwiML):
  - POST /call/relative  : reassuring AI voice call to an emergency contact
  - POST /call/hospital  : AI pre-alert call to a hospital (samaritan "I have a vehicle")

Emergency services (112/108) are NEVER called this way (illegal to robo-call them).
"""
from xml.sax.saxutils import escape

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.bedrock import converse_json
from app.config import settings
from app import geolocation

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


def _twiml_bilingual(hi: str, en: str) -> str:
    """Inline TwiML: speak Hindi (Polly Aditi) then English (Polly Raveena)."""
    return (
        "<Response>"
        f'<Say voice="Polly.Aditi" language="hi-IN">{escape(hi)}</Say>'
        '<Pause length="1"/>'
        f'<Say voice="Polly.Raveena" language="en-IN">{escape(en)}</Say>'
        "</Response>"
    )


# ─── Relative call ─────────────────────────────────────────────────────────────


class RelativeCallRequest(BaseModel):
    to: str
    rider_name: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    blood_group: Optional[str] = None
    severity: Optional[str] = None  # low | medium | high | unknown (from crash detection)


class RelativeCallResponse(BaseModel):
    sid: Optional[str] = None
    status: str
    model_used: str
    location: Optional[str] = None
    detail: Optional[str] = None


def _resolve_location(lat: Optional[float], lng: Optional[float]) -> Optional[str]:
    """Reverse-geocode to a human address (Amazon Location); fall back to coords."""
    if lat is None or lng is None:
        return None
    addr = geolocation.reverse_geocode(lat, lng)
    if addr:
        return addr
    return f"latitude {lat:.4f}, longitude {lng:.4f}"


def _relative_fallback(req: RelativeCallRequest, location: Optional[str]) -> dict:
    name = req.rider_name or "your family member"
    loc = location or "an unknown location"
    sev = f" Reported severity is {req.severity}." if req.severity else ""
    sev_hi = f" Sthiti {req.severity} batayi gayi hai." if req.severity else ""
    return {
        "hi": (
            f"Namaste. Yah CrashGuard se ek zaroori suraksha alert hai. "
            f"{name} ka motorcycle accident hua ho sakta hai. Location {loc} hai.{sev_hi} "
            f"Aapatkalin sevaon ko soochit kar diya gaya hai aur vivaran SMS mein bheja gaya hai. "
            f"Kripya turant sampark karein."
        ),
        "en": (
            f"Hello. This is an automated safety alert from CrashGuard. "
            f"{name} may have been in a motorcycle accident. The location is {loc}.{sev} "
            f"Emergency services have been notified and details were sent by SMS. "
            f"Please try to reach them immediately."
        ),
    }


RELATIVE_SYSTEM_PROMPT = (
    "You compose a short, calm, reassuring phone message that an AUTOMATED system will speak to a "
    "family member whose relative may have been in a motorcycle accident. Two versions: Hindi and English. "
    "CRITICAL RULES: introduce it as 'an automated safety alert from CrashGuard'; do NOT pretend to be a "
    "person; do NOT include placeholders/brackets. Use ONLY the given facts. Include the rider's name, "
    "state the LOCATION provided, and the severity if provided. Say emergency services were notified and "
    "details were sent by SMS; ask them to try to reach the person. 2-3 sentences each. "
    'Return ONLY valid JSON: {"hi":"<hindi>","en":"<english>"}'
)


def _compose_relative(req: RelativeCallRequest, location: Optional[str]) -> tuple[dict, str]:
    facts = {
        "rider_name": req.rider_name,
        "location": location,
        "severity": req.severity,
        "blood_group": req.blood_group,
    }
    data = converse_json(RELATIVE_SYSTEM_PROMPT, f"Facts: {facts}")
    if data and data.get("hi") and data.get("en"):
        return {"hi": str(data["hi"]), "en": str(data["en"])}, "bedrock"
    return _relative_fallback(req, location), "fallback"


@router.post("/relative", response_model=RelativeCallResponse)
async def call_relative(req: RelativeCallRequest) -> RelativeCallResponse:
    client = _get_twilio()
    location = _resolve_location(req.lat, req.lng)
    messages, model_used = _compose_relative(req, location)

    if client is None:
        return RelativeCallResponse(
            sid=None, status="not_configured", model_used=model_used, location=location,
            detail="Twilio credentials not set in the agent service .env",
        )
    try:
        call = client.calls.create(
            to=req.to,
            from_=settings.TWILIO_FROM_NUMBER,
            twiml=_twiml_bilingual(messages["hi"], messages["en"]),
        )
        return RelativeCallResponse(
            sid=call.sid, status=call.status or "queued", model_used=model_used, location=location,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Twilio call failed: {e}")


# ─── Hospital pre-alert call ────────────────────────────────────────────────────


class HospitalCallRequest(BaseModel):
    to: str
    hospital_name: Optional[str] = None
    victims: int = 1
    severity: Optional[str] = None
    eta_minutes: Optional[int] = None
    summary: Optional[str] = None
    lat: Optional[float] = None   # incident (accident) location
    lng: Optional[float] = None


class HospitalCallResponse(BaseModel):
    sid: Optional[str] = None
    status: str
    model_used: str
    detail: Optional[str] = None


def _hospital_fallback(req: HospitalCallRequest, location: Optional[str]) -> dict:
    hosp = req.hospital_name or "your hospital"
    eta = f"{req.eta_minutes} minutes" if req.eta_minutes else "shortly"
    eta_hi = f"{req.eta_minutes} minute mein" if req.eta_minutes else "jald hi"
    sev = req.severity or "unknown"
    loc = location or "a nearby location"
    loc_hi = f" Durghatna {loc} par hui hai." if location else ""
    loc_en = f" The accident occurred at {loc}." if location else ""
    return {
        "hi": (
            f"Namaste, yah CrashGuard se ek pre-alert hai. Ek durghatna hui hai.{loc_hi} "
            f"{req.victims} ghayal mareez {hosp} laye ja rahe hain aur {eta_hi} pahunchenge. "
            f"Sthiti {sev} hai. Kripya apni emergency team taiyar rakhein."
        ),
        "en": (
            f"Hello, this is a pre-alert from CrashGuard. There has been an accident.{loc_en} "
            f"{req.victims} injured patient(s) are being brought to {hosp}, arriving in {eta}. "
            f"Condition is {sev}. Please have your emergency team ready."
        ),
    }


HOSPITAL_SYSTEM_PROMPT = (
    "You compose a short spoken pre-alert an AUTOMATED system reads to a hospital so they prepare for "
    "inbound accident patients. Two versions: Hindi and English. Introduce it as a pre-alert from "
    "CrashGuard; clearly state WHERE the accident occurred (the incident location provided), the number "
    "of injured, the estimated arrival time (ETA) if given, and severity if given, so the hospital knows "
    "how far away the patients are; end by asking them to keep the emergency team ready. No placeholders. "
    '2-4 sentences each. Return ONLY valid JSON: {"hi":"<hindi>","en":"<english>"}'
)


def _compose_hospital(req: HospitalCallRequest) -> tuple[dict, str]:
    location = _resolve_location(req.lat, req.lng)  # reverse-geocode the incident spot
    facts = {
        "hospital_name": req.hospital_name,
        "incident_location": location,
        "injured_count": req.victims,
        "eta_minutes": req.eta_minutes,
        "severity": req.severity,
        "summary": req.summary,
    }
    data = converse_json(HOSPITAL_SYSTEM_PROMPT, f"Facts: {facts}")
    if data and data.get("hi") and data.get("en"):
        return {"hi": str(data["hi"]), "en": str(data["en"])}, "bedrock"
    return _hospital_fallback(req, location), "fallback"


@router.post("/hospital", response_model=HospitalCallResponse)
async def call_hospital(req: HospitalCallRequest) -> HospitalCallResponse:
    client = _get_twilio()
    messages, model_used = _compose_hospital(req)
    if client is None:
        return HospitalCallResponse(
            sid=None, status="not_configured", model_used=model_used,
            detail="Twilio credentials not set in the agent service .env",
        )
    try:
        call = client.calls.create(
            to=req.to,
            from_=settings.TWILIO_FROM_NUMBER,
            twiml=_twiml_bilingual(messages["hi"], messages["en"]),
        )
        return HospitalCallResponse(sid=call.sid, status=call.status or "queued", model_used=model_used)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Twilio hospital call failed: {e}")
