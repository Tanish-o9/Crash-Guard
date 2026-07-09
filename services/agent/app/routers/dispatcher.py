"""
Dispatcher-script agent.

Composes the spoken message that the phone will read aloud on the emergency call
(via the speakerphone acoustic bridge). Returns one text segment per requested
language, in order — the app TTS-speaks each segment with the matching locale.

Per product decision the default spoken order for the dispatcher is the caller's
language chain (local language -> Hindi -> English). The mobile app builds that
chain from STATE_LANGUAGE_MAP and passes it here.
"""
from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Optional

from app.bedrock import converse_json
from app.languages import name_for

router = APIRouter()


class DispatcherRequest(BaseModel):
    languages: list[str] = Field(default_factory=lambda: ["hi", "en"])
    lat: Optional[float] = None
    lng: Optional[float] = None
    address: Optional[str] = None
    rider_name: Optional[str] = None
    blood_group: Optional[str] = None
    severity: Optional[str] = None            # low | medium | high | unknown
    victims: Optional[int] = None
    summary: Optional[str] = None             # e.g. bystander description
    is_samaritan: bool = False                # True if a bystander is reporting


class Segment(BaseModel):
    lang: str
    text: str


class DispatcherResponse(BaseModel):
    segments: list[Segment]
    model_used: str  # "bedrock" | "fallback"


def _location_str(req: DispatcherRequest) -> str:
    if req.address:
        return req.address
    if req.lat is not None and req.lng is not None:
        return f"latitude {req.lat:.4f}, longitude {req.lng:.4f}"
    return "an unknown location"


def _fallback(req: DispatcherRequest) -> list[Segment]:
    loc = _location_str(req)
    name = req.rider_name or ("a rider" if not req.is_samaritan else "a rider")
    blood = req.blood_group or "unknown"
    victims = req.victims or 1
    segs: list[Segment] = []
    for lang in req.languages:
        if lang == "hi":
            if req.is_samaritan:
                text = (
                    f"Namaste. Main ek raahgir hoon aur ek durghatna ki soochna de raha hoon. "
                    f"{loc} par ek motorcycle durghatna hui hai. "
                    f"Lagbhag {victims} log ghayal hain. Kripya turant ambulance bhejein."
                )
            else:
                text = (
                    f"Namaste. Yah CrashGuard se automatic emergency alert hai. "
                    f"{name} ka motorcycle accident hua hai aur unhe turant madad chahiye. "
                    f"Location {loc} hai. Blood group {blood} hai. Kripya turant ambulance bhejein."
                )
        else:  # English and any other locale falls back to English text
            if req.is_samaritan:
                text = (
                    f"Hello. I am a bystander reporting an accident. "
                    f"A motorcycle crash has occurred at {loc}. "
                    f"Approximately {victims} person(s) injured. Please send an ambulance immediately."
                )
            else:
                text = (
                    f"Hello. This is an automatic emergency alert from CrashGuard. "
                    f"{name} has been in a motorcycle accident and needs immediate help. "
                    f"The location is {loc}. Blood group is {blood}. "
                    f"Please send an ambulance immediately."
                )
        segs.append(Segment(lang=lang, text=text))
    return segs


SYSTEM_PROMPT = (
    "You are an emergency-dispatch voice assistant for a motorcycle crash-response app in India. "
    "You write short, calm, factual spoken messages that will be read aloud by TTS to a 112/108 "
    "emergency dispatcher over a phone call. Rules: state the essential facts first (that a crash "
    "occurred, the exact location, number of injured, blood group if given); be concise (2-4 short "
    "sentences per language); never invent facts not provided; end by clearly requesting an ambulance. "
    "Return ONLY valid JSON: {\"segments\":[{\"lang\":\"<code>\",\"text\":\"<spoken text in that language>\"}]}. "
    "Produce one segment per requested language, in the order given. Write each text natively in that "
    "language (Hindi in Devanagari is fine for TTS)."
)


@router.post("/", response_model=DispatcherResponse)
async def dispatcher_script(req: DispatcherRequest) -> DispatcherResponse:
    langs_desc = ", ".join(f"{name_for(l)} ({l})" for l in req.languages)
    facts = {
        "location": _location_str(req),
        "rider_name": req.rider_name,
        "blood_group": req.blood_group,
        "severity": req.severity,
        "estimated_victims": req.victims,
        "bystander_summary": req.summary,
        "reporter": "bystander/good-samaritan" if req.is_samaritan else "automatic crash detection",
    }
    user_prompt = (
        f"Compose the dispatcher message in these languages, in this exact order: {langs_desc}.\n"
        f"Incident facts (JSON): {facts}"
    )

    data = converse_json(SYSTEM_PROMPT, user_prompt)
    if data and isinstance(data.get("segments"), list) and data["segments"]:
        try:
            segs = [
                Segment(lang=str(s["lang"]), text=str(s["text"]).strip())
                for s in data["segments"]
                if s.get("text")
            ]
            if segs:
                return DispatcherResponse(segments=segs, model_used="bedrock")
        except (KeyError, TypeError):
            pass

    return DispatcherResponse(segments=_fallback(req), model_used="fallback")
