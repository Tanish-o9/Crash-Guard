"""
Anomaly Detector — Rolling Z-Score approach.

Design principles:
- Fully deterministic and auditable (no black-box ML in the safety loop)
- Per-user baseline comparison (not global thresholds)
- Conservative thresholds (bias toward false negatives over false positives)
- Composite z-score across multiple features, not a single threshold
"""
import numpy as np
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.routers.detect import SensorFeatures, UserBaseline, DetectResponse

from app.config import settings

# Features and their weights in the composite z-score
# Higher weight = this feature matters more for crash classification
FEATURE_WEIGHTS = {
    "peak_accel_magnitude": 0.35,
    "peak_jerk": 0.25,
    "gps_speed_delta": 0.20,
    "rotation_rate_spike": 0.10,
    "post_event_stillness": 0.05,
    "barometric_delta": 0.05,
}


class AnomalyDetector:
    """
    Stage 1: Lightweight anomaly detector using weighted composite z-score.
    
    For each feature:
      z_i = (observed_i - baseline_mean_i) / baseline_std_i
    
    Composite:
      z_composite = sum(weight_i * max(z_i, 0)) / sum(weight_i)
    
    Only upward deviations count (a crash makes readings HIGHER, not lower).
    Anomaly fires if:
      z_composite > ANOMALY_Z_THRESHOLD AND peak_accel > ANOMALY_ABS_FLOOR_ACCEL
    """

    def detect(self, features: "SensorFeatures", baseline: "UserBaseline") -> "DetectResponse":
        from app.routers.detect import DetectResponse

        feature_dict = features.model_dump()
        per_feature_z: dict[str, float] = {}
        
        for feat_name in FEATURE_WEIGHTS:
            observed = feature_dict.get(feat_name, 0.0)
            mean = baseline.means.get(feat_name, 0.0)
            std = baseline.stds.get(feat_name, 1.0)
            
            # Guard against near-zero std (very consistent rider)
            if std < 0.01:
                std = 0.01
            
            z = (observed - mean) / std
            per_feature_z[feat_name] = round(float(z), 3)

        # Weighted composite — only positive deviations count
        composite_z = 0.0
        total_weight = sum(FEATURE_WEIGHTS.values())
        for feat_name, weight in FEATURE_WEIGHTS.items():
            z = per_feature_z.get(feat_name, 0.0)
            composite_z += weight * max(z, 0.0)
        composite_z = composite_z / total_weight

        # Absolute floor check
        abs_floor_ok = features.peak_accel_magnitude >= settings.ANOMALY_ABS_FLOOR_ACCEL

        # Threshold check
        threshold_ok = composite_z >= settings.ANOMALY_Z_THRESHOLD

        is_anomaly = threshold_ok and abs_floor_ok

        # Confidence: how far above threshold (capped at 1.0)
        confidence = 0.0
        if is_anomaly:
            confidence = min(1.0, (composite_z - settings.ANOMALY_Z_THRESHOLD) / settings.ANOMALY_Z_THRESHOLD)

        # Build human-readable reason
        if not abs_floor_ok:
            reason = f"Absolute floor not met: peak_accel={features.peak_accel_magnitude:.1f} m/s² < {settings.ANOMALY_ABS_FLOOR_ACCEL}"
        elif not threshold_ok:
            reason = f"Z-score {composite_z:.2f} below threshold {settings.ANOMALY_Z_THRESHOLD}"
        else:
            top_features = sorted(per_feature_z.items(), key=lambda x: x[1], reverse=True)[:2]
            top_str = ", ".join(f"{k}={v:.1f}σ" for k, v in top_features)
            reason = f"Anomaly detected: composite z={composite_z:.2f}. Top features: {top_str}"

        return DetectResponse(
            is_anomaly=is_anomaly,
            composite_z_score=round(float(composite_z), 3),
            per_feature_z_scores=per_feature_z,
            confidence=round(confidence, 3),
            reason=reason,
        )
