from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
import numpy as np

from app.config import settings
from app.services.anomaly_detector import AnomalyDetector

router = APIRouter()
detector = AnomalyDetector()


class SensorFeatures(BaseModel):
    """Extracted sensor features for one 2-second window."""
    peak_accel_magnitude: float = Field(..., description="Peak |a| = sqrt(ax²+ay²+az²) in m/s²")
    peak_jerk: float = Field(..., description="Max rate of change of acceleration")
    gps_speed_delta: float = Field(..., description="GPS speed change in m/s over the window")
    rotation_rate_spike: float = Field(..., description="Peak gyroscope magnitude in rad/s")
    post_event_stillness: float = Field(..., description="Variance of accel in 2s post-window (0=still)")
    barometric_delta: float = Field(..., description="Barometric pressure change in hPa")


class UserBaseline(BaseModel):
    """Per-user baseline — means and std devs for each feature."""
    means: dict[str, float]
    stds: dict[str, float]
    sample_count: int


class DetectRequest(BaseModel):
    user_id: str
    features: SensorFeatures
    baseline: Optional[UserBaseline] = None


class DetectResponse(BaseModel):
    is_anomaly: bool
    composite_z_score: float
    per_feature_z_scores: dict[str, float]
    confidence: float
    reason: str


@router.post("/", response_model=DetectResponse)
async def detect_anomaly(request: DetectRequest) -> DetectResponse:
    """
    Stage 1 anomaly detection using rolling z-score against per-user baseline.
    
    IMPORTANT: This endpoint does NOT make any decision about calling emergency services.
    It only returns whether sensor readings are anomalous relative to this user's baseline.
    The calling decision is made by the deterministic state machine on the device.
    """
    if request.baseline is None:
        # No baseline yet — cannot detect anomaly safely, return False
        return DetectResponse(
            is_anomaly=False,
            composite_z_score=0.0,
            per_feature_z_scores={},
            confidence=0.0,
            reason="No baseline available — calibration required before detection",
        )

    if request.baseline.sample_count < settings.MIN_BASELINE_SAMPLES:
        return DetectResponse(
            is_anomaly=False,
            composite_z_score=0.0,
            per_feature_z_scores={},
            confidence=0.0,
            reason=f"Insufficient baseline samples ({request.baseline.sample_count} < {settings.MIN_BASELINE_SAMPLES})",
        )

    result = detector.detect(request.features, request.baseline)
    return result
