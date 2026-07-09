"""
Samaritan-intake agent — replaces the old Gemini service.

Takes a bystander's free-text (or transcribed voice) description of an accident
and extracts structured fields a dispatcher needs. Deterministic fallback keeps
the flow working offline / without Bedrock.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from app.bedrock import converse_json

router = APIRouter()


class IntakeRequest(BaseModel):
    description: str


class IntakeResponse(BaseModel):
    severity: str            # low | medium | high | unknown
    estimated_victims: int
    vehicle_types: list[str]
    summary: str
    model_used: str          # "bedrock" | "fallback"


_FALLBACK = IntakeResponse(
    severity="medium",
    estimated_victims=1,
    vehicle_types=["motorcycle"],
    summary="A rider appears to be involved in a road accident.",
    model_used="fallback",
)

SYSTEM_PROMPT = (
    "You are an emergency dispatch assistant. Analyze the accident description and extract "
    "structured information. Return ONLY valid JSON with this exact shape: "
    '{"severity":"low|medium|high|unknown","estimated_victims":<int, 1 if unclear>,'
    '"vehicle_types":[<strings>],"summary":"<one calm sentence for a dispatcher>"}'
)


@router.post("/", response_model=IntakeResponse)
async def samaritan_intake(req: IntakeRequest) -> IntakeResponse:
    if not req.description.strip():
        return _FALLBACK

    data = converse_json(SYSTEM_PROMPT, f'Accident description: "{req.description}"')
    if not data:
        return _FALLBACK

    sev = str(data.get("severity", "unknown")).lower()
    if sev not in ("low", "medium", "high"):
        sev = "unknown"
    try:
        victims = int(data.get("estimated_victims", 1)) or 1
    except (TypeError, ValueError):
        victims = 1
    vehicles = data.get("vehicle_types")
    vehicles = [str(v) for v in vehicles] if isinstance(vehicles, list) and vehicles else ["motorcycle"]
    summary = data.get("summary")
    summary = str(summary) if summary else _FALLBACK.summary

    return IntakeResponse(
        severity=sev,
        estimated_victims=victims,
        vehicle_types=vehicles,
        summary=summary,
        model_used="bedrock",
    )
