"""
Hospital agent:
  - GET  /hospital/nearby      : nearest hospitals via Google Places (key stays server-side)
  - POST /hospital/prealert    : composes a spoken pre-alert script for the receiving hospital
"""
import math
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import httpx

from app.bedrock import converse
from app.config import settings

router = APIRouter()

PLACES_URL = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
PLACE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"


class Hospital(BaseModel):
    place_id: str
    name: str
    address: Optional[str] = None
    lat: float
    lng: float
    distance_km: float
    rating: Optional[float] = None


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.asin(math.sqrt(a))


@router.get("/nearby", response_model=list[Hospital])
async def nearby_hospitals(lat: float, lng: float, radius_m: int = 10000, limit: int = 5):
    if not settings.GOOGLE_PLACES_API_KEY:
        raise HTTPException(status_code=503, detail="Google Places API key not configured")

    params = {
        "location": f"{lat},{lng}",
        "radius": radius_m,
        "type": "hospital",
        "key": settings.GOOGLE_PLACES_API_KEY,
    }
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(PLACES_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError) as e:
        raise HTTPException(status_code=502, detail=f"Places request failed: {e}")

    results = []
    for h in data.get("results", []):
        loc = h.get("geometry", {}).get("location", {})
        hlat, hlng = loc.get("lat", lat), loc.get("lng", lng)
        results.append(
            Hospital(
                place_id=h.get("place_id", ""),
                name=h.get("name", "Unknown hospital"),
                address=h.get("vicinity"),
                lat=hlat,
                lng=hlng,
                distance_km=round(_haversine_km(lat, lng, hlat, hlng), 2),
                rating=h.get("rating"),
            )
        )
    results.sort(key=lambda x: x.distance_km)
    return results[:limit]


class HospitalDetails(BaseModel):
    place_id: str
    name: Optional[str] = None
    phone: Optional[str] = None            # E.164-ish international number for dialing
    formatted_phone: Optional[str] = None  # human-readable local format
    lat: Optional[float] = None
    lng: Optional[float] = None


@router.get("/details", response_model=HospitalDetails)
async def hospital_details(place_id: str):
    """Fetch a hospital's phone number (and coords) via Google Place Details so the
    app can actually place a call to it."""
    if not settings.GOOGLE_PLACES_API_KEY:
        raise HTTPException(status_code=503, detail="Google Places API key not configured")

    params = {
        "place_id": place_id,
        "fields": "name,international_phone_number,formatted_phone_number,geometry",
        "key": settings.GOOGLE_PLACES_API_KEY,
    }
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(PLACE_DETAILS_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError) as e:
        raise HTTPException(status_code=502, detail=f"Place details request failed: {e}")

    result = data.get("result", {})
    loc = result.get("geometry", {}).get("location", {})
    intl = result.get("international_phone_number")
    return HospitalDetails(
        place_id=place_id,
        name=result.get("name"),
        # normalize international number to a dialable string (drop spaces/dashes)
        phone=(intl.replace(" ", "").replace("-", "") if intl else None),
        formatted_phone=result.get("formatted_phone_number"),
        lat=loc.get("lat"),
        lng=loc.get("lng"),
    )


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
    "You compose a short spoken pre-alert that a good samaritan's phone reads aloud to a hospital, "
    "warning them that injured accident patients are being brought in so they can prepare. Be calm, "
    "concise (2-3 sentences per language), factual, and end by asking them to keep the emergency team "
    'ready. Return ONLY valid JSON: {"segments":[{"lang":"<code>","text":"<text>"}]}, one per requested '
    "language in order."
)


@router.post("/prealert", response_model=PrealertResponse)
async def hospital_prealert(req: PrealertRequest) -> PrealertResponse:
    from app.bedrock import converse_json

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
            segs = [Segment(lang=str(s["lang"]), text=str(s["text"]).strip())
                    for s in data["segments"] if s.get("text")]
            if segs:
                return PrealertResponse(segments=segs, model_used="bedrock")
        except (KeyError, TypeError):
            pass
    return PrealertResponse(segments=_prealert_fallback(req), model_used="fallback")
