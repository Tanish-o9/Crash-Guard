"""
Hospital agent (backed by Amazon Location Service):
  - GET  /hospital/nearby   : nearest hospitals (name/address/coords/distance/phone)
  - GET  /hospital/details  : phone number for a specific place id
  - POST /hospital/prealert : composes a spoken pre-alert script for the hospital
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.bedrock import converse_json
from app import geolocation

router = APIRouter()


class Hospital(BaseModel):
    place_id: str
    name: str
    address: Optional[str] = None
    lat: float
    lng: float
    distance_km: float
    phone: Optional[str] = None


@router.get("/nearby", response_model=list[Hospital])
async def nearby_hospitals(lat: float, lng: float, radius_m: int = 10000, limit: int = 5):
    if not geolocation.is_configured():
        raise HTTPException(status_code=503, detail="Amazon Location API key not configured")
    results = geolocation.search_hospitals(lat, lng, radius_m=radius_m, limit=limit)
    return [Hospital(**h) for h in results]


class HospitalDetails(BaseModel):
    place_id: str
    phone: Optional[str] = None


@router.get("/details", response_model=HospitalDetails)
async def hospital_details(place_id: str):
    """Fetch a hospital's phone number so the app can place the pre-alert call."""
    if not geolocation.is_configured():
        raise HTTPException(status_code=503, detail="Amazon Location API key not configured")
    phone = geolocation.place_phone(place_id)
    return HospitalDetails(place_id=place_id, phone=phone)


class PrealertRequest(BaseModel):
    hospital_name: Optional[str] = None
    victims: int = 1
    severity: Optional[str] = None
    eta_minutes: Optional[int] = None
    summary: Optional[str] = None
    languages: list[str] = ["hi", "en"]


class Segment(BaseModel):
    lang: str
    text: str


class PrealertResponse(BaseModel):
    segments: list[Segment]
    model_used: str


def _prealert_fallback(req: PrealertRequest) -> list[Segment]:
    hosp = req.hospital_name or "the hospital"
    eta = f"{req.eta_minutes} minutes" if req.eta_minutes else "shortly"
    eta_hi = f"{req.eta_minutes} minute mein" if req.eta_minutes else "jald hi"
    sev = req.severity or "unknown"
    segs = []
    for lang in req.languages:
        if lang == "hi":
            text = (
                f"Namaste, yah CrashGuard se soochna hai. Ek durghatna hui hai. "
                f"{req.victims} ghayal mareez {hosp} la rahe hain, {eta_hi} pahunchenge. "
                f"Sthiti {sev} hai. Kripya emergency team taiyar rakhein."
            )
        else:
            text = (
                f"Hello, this is a pre-alert from CrashGuard. There has been an accident. "
                f"{req.victims} injured patient(s) are being brought to {hosp}, arriving in {eta}. "
                f"Condition is {sev}. Please have your emergency team ready."
            )
        segs.append(Segment(lang=lang, text=text))
    return segs


SYSTEM_PROMPT = (
    "You compose a short spoken pre-alert that an automated system reads aloud to a hospital, "
    "warning them that injured accident patients are being brought in so they can prepare. Be calm, "
    "concise (2-3 sentences per language), factual, and end by asking them to keep the emergency team "
    'ready. Return ONLY valid JSON: {"segments":[{"lang":"<code>","text":"<text>"}]}, one per requested '
    "language in order."
)


@router.post("/prealert", response_model=PrealertResponse)
async def hospital_prealert(req: PrealertRequest) -> PrealertResponse:
    facts = {
        "hospital_name": req.hospital_name,
        "injured_count": req.victims,
        "severity": req.severity,
        "eta_minutes": req.eta_minutes,
        "summary": req.summary,
    }
    langs = ", ".join(req.languages)
    data = converse_json(SYSTEM_PROMPT, f"Languages in order: {langs}. Facts: {facts}")
    if data and isinstance(data.get("segments"), list) and data["segments"]:
        try:
            segs = [
                Segment(lang=str(s["lang"]), text=str(s["text"]).strip())
                for s in data["segments"]
                if s.get("text")
            ]
            if segs:
                return PrealertResponse(segments=segs, model_used="bedrock")
        except (KeyError, TypeError):
            pass
    return PrealertResponse(segments=_prealert_fallback(req), model_used="fallback")
