"""
Unit tests — Anomaly Detector (Python ML Service)

Tests:
- AnomalyDetector.detect() for crash vs. normal windows
- Absolute floor check (< ANOMALY_ABS_FLOOR_ACCEL → not anomaly)
- Composite z-score computation
- Confidence calculation
- Edge cases: zero std dev, all-zero features
"""
import pytest
from app.services.anomaly_detector import AnomalyDetector, FEATURE_WEIGHTS


# ─── Mock Pydantic Models ─────────────────────────────────────────────────────

class MockSensorFeatures:
    """Mirrors the SensorFeatures Pydantic model"""
    def __init__(
        self,
        peak_accel_magnitude: float = 12.0,
        peak_jerk: float = 8.0,
        gps_speed_delta: float = 0.5,
        rotation_rate_spike: float = 0.8,
        post_event_stillness: float = 1.2,
        barometric_delta: float = 0.0,
    ):
        self.peak_accel_magnitude = peak_accel_magnitude
        self.peak_jerk = peak_jerk
        self.gps_speed_delta = gps_speed_delta
        self.rotation_rate_spike = rotation_rate_spike
        self.post_event_stillness = post_event_stillness
        self.barometric_delta = barometric_delta

    def model_dump(self):
        return {
            "peak_accel_magnitude": self.peak_accel_magnitude,
            "peak_jerk": self.peak_jerk,
            "gps_speed_delta": self.gps_speed_delta,
            "rotation_rate_spike": self.rotation_rate_spike,
            "post_event_stillness": self.post_event_stillness,
            "barometric_delta": self.barometric_delta,
        }


class MockUserBaseline:
    """Mirrors the UserBaseline Pydantic model"""
    def __init__(self, means: dict, stds: dict):
        self.means = means
        self.stds = stds


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def detector():
    return AnomalyDetector()


@pytest.fixture
def normal_baseline():
    """A baseline representing normal riding behaviour"""
    return MockUserBaseline(
        means={
            "peak_accel_magnitude": 12.0,
            "peak_jerk": 8.0,
            "gps_speed_delta": 0.5,
            "rotation_rate_spike": 0.8,
            "post_event_stillness": 1.2,
            "barometric_delta": 0.0,
        },
        stds={
            "peak_accel_magnitude": 2.0,  # tight — ±2 m/s²
            "peak_jerk": 3.0,
            "gps_speed_delta": 0.3,
            "rotation_rate_spike": 0.5,
            "post_event_stillness": 0.4,
            "barometric_delta": 0.1,
        },
    )


@pytest.fixture
def crash_features():
    """A window that clearly looks like a crash"""
    return MockSensorFeatures(
        peak_accel_magnitude=58.0,   # ~5.9G
        peak_jerk=140.0,
        gps_speed_delta=15.0,
        rotation_rate_spike=12.0,
        post_event_stillness=0.05,
        barometric_delta=0.5,
    )


@pytest.fixture
def normal_features():
    """A completely normal riding window"""
    return MockSensorFeatures(
        peak_accel_magnitude=12.0,
        peak_jerk=8.0,
        gps_speed_delta=0.5,
        rotation_rate_spike=0.8,
        post_event_stillness=1.2,
        barometric_delta=0.0,
    )


@pytest.fixture
def pothole_features():
    """A pothole hit — high accel but normal everything else"""
    return MockSensorFeatures(
        peak_accel_magnitude=18.0,   # just over floor
        peak_jerk=20.0,
        gps_speed_delta=0.3,
        rotation_rate_spike=1.5,
        post_event_stillness=2.0,   # still moving
        barometric_delta=0.0,
    )


# ─── Tests ────────────────────────────────────────────────────────────────────

class TestAnomalyDetector:

    def test_detects_crash(self, detector, crash_features, normal_baseline):
        result = detector.detect(crash_features, normal_baseline)
        assert result.is_anomaly is True, f"Expected anomaly. Z={result.composite_z_score}, reason={result.reason}"

    def test_normal_window_not_anomaly(self, detector, normal_features, normal_baseline):
        result = detector.detect(normal_features, normal_baseline)
        assert result.is_anomaly is False, f"Expected not anomaly. Z={result.composite_z_score}"

    def test_abs_floor_blocks_detection(self, detector, normal_baseline):
        """Window with peakAccel < ANOMALY_ABS_FLOOR should never be flagged"""
        low_accel = MockSensorFeatures(
            peak_accel_magnitude=10.0,  # below 15.0 floor
            peak_jerk=500.0,            # extreme jerk — but floor check blocks it
            gps_speed_delta=50.0,
        )
        result = detector.detect(low_accel, normal_baseline)
        assert result.is_anomaly is False
        assert "Absolute floor" in result.reason

    def test_composite_z_score_is_zero_for_baseline_mean(self, detector, normal_features, normal_baseline):
        """When features equal baseline means, z-scores should be zero"""
        result = detector.detect(normal_features, normal_baseline)
        # All z-scores should be ~0
        for feat, z in result.per_feature_z_scores.items():
            assert abs(z) < 0.1, f"Expected z≈0 for {feat}, got {z}"

    def test_confidence_is_zero_for_normal(self, detector, normal_features, normal_baseline):
        result = detector.detect(normal_features, normal_baseline)
        assert result.confidence == 0.0

    def test_confidence_is_positive_for_crash(self, detector, crash_features, normal_baseline):
        result = detector.detect(crash_features, normal_baseline)
        assert result.confidence > 0
        assert result.confidence <= 1.0

    def test_near_zero_std_handled_gracefully(self, detector):
        """std < 0.01 should be clamped to 0.01 — no division by zero"""
        tight_baseline = MockUserBaseline(
            means={k: 1.0 for k in FEATURE_WEIGHTS},
            stds={k: 0.0 for k in FEATURE_WEIGHTS},  # all zero std
        )
        features = MockSensorFeatures(peak_accel_magnitude=20.0)
        # Should not raise
        result = detector.detect(features, tight_baseline)
        assert isinstance(result.composite_z_score, float)

    def test_all_zero_features_not_anomaly(self, detector, normal_baseline):
        zero_features = MockSensorFeatures(
            peak_accel_magnitude=0.0,
            peak_jerk=0.0,
            gps_speed_delta=0.0,
            rotation_rate_spike=0.0,
            post_event_stillness=0.0,
            barometric_delta=0.0,
        )
        result = detector.detect(zero_features, normal_baseline)
        assert result.is_anomaly is False  # abs floor not met

    def test_per_feature_z_scores_are_returned(self, detector, crash_features, normal_baseline):
        result = detector.detect(crash_features, normal_baseline)
        assert isinstance(result.per_feature_z_scores, dict)
        assert "peak_accel_magnitude" in result.per_feature_z_scores

    def test_feature_weights_sum_to_one(self):
        total = sum(FEATURE_WEIGHTS.values())
        assert abs(total - 1.0) < 1e-6, f"Weights should sum to 1.0, got {total}"

    def test_response_has_required_fields(self, detector, crash_features, normal_baseline):
        result = detector.detect(crash_features, normal_baseline)
        assert hasattr(result, "is_anomaly")
        assert hasattr(result, "composite_z_score")
        assert hasattr(result, "per_feature_z_scores")
        assert hasattr(result, "confidence")
        assert hasattr(result, "reason")
