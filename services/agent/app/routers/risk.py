"""
Risk-summary agent — turns the deterministic driving-risk numbers into a short
underwriter-style assessment (for the B2B risk-profile page). The SCORE itself is
computed on-device; this only narrates it. Deterministic fallback included.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from app.bedrock import converse

router = APIRouter()


class RiskFactor(BaseModel):
    label: str
    score: float                    # accept int or float
    detail: Optional[str] = None


class RiskSummaryRequest(BaseModel):
    score: float
    tier: str                       # Low | Moderate | High (risk)
    factors: list[RiskFactor] = []
    riding_minutes: int = 0
    incidents: int = 0
    data_points: int = 0


class RiskSummaryResponse(BaseModel):
    summary: str
    model_used: str


def _fallback(req: RiskSummaryRequest) -> str:
    weakest = min(req.factors, key=lambda f: f.score, default=None)
    strongest = max(req.factors, key=lambda f: f.score, default=None)
    parts = [
        f"Driving safety score {req.score}/100 — {req.tier.lower()} insurance risk."
    ]
    if strongest:
        parts.append(f"Strength: {strongest.label.lower()}.")
    if weakest and weakest.score < 80:
        parts.append(f"Main concern: {weakest.label.lower()}.")
    if req.incidents:
        parts.append(f"{req.incidents} confirmed incident(s) on record.")
    return " ".join(parts)


SYSTEM_PROMPT = (
    "You are a motor-insurance risk analyst. Given a rider's telematics safety score (0-100, higher is "
    "safer), risk tier, and factor breakdown, write a concise 2-3 sentence assessment for an underwriter: "
    "state the overall risk, the rider's main strength, and the main concern to watch. Neutral and factual, "
    "no emojis. Return ONLY the assessment text."
)


@router.post("/", response_model=RiskSummaryResponse)
async def risk_summary(req: RiskSummaryRequest) -> RiskSummaryResponse:
    facts = {
        "score": req.score,
        "tier": req.tier,
        "riding_minutes": req.riding_minutes,
        "incidents": req.incidents,
        "data_points": req.data_points,
        "factors": [{"label": f.label, "score": f.score, "detail": f.detail} for f in req.factors],
    }
    text = converse(SYSTEM_PROMPT, f"Rider telematics data: {facts}")
    if text:
        return RiskSummaryResponse(summary=text.strip(), model_used="bedrock")
    return RiskSummaryResponse(summary=_fallback(req), model_used="fallback")
