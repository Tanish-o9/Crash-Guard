/**
 * Crash Detector Service — runs the Stage 1 z-score check and, optionally,
 * also calls the Python ML service for server-side validation/logging.
 *
 * ARCHITECTURE NOTE:
 * The mobile z-score check (Stage 1) is the AUTHORITATIVE safety decision.
 * The Python service call is supplemental — used for audit logging and future
 * model improvement. If the Python service is unreachable, the mobile
 * detection still operates normally (offline-first design).
 *
 * STAGE 1 — Mobile z-score:
 *   Uses computeZScores() from calibrationService (exact same math as Python).
 *   Two-window hysteresis via detectionStore.processWindow().
 *
 * STAGE 2 — Stillness check:
 *   After 2 consecutive anomalous windows, check if device is stationary:
 *   - GPS speed < STAGE2_STILL_SPEED_KMH
 *   - Current accel magnitude < STAGE2_STILL_ACCEL_THRESHOLD
 *   If still for STAGE2_STILL_WINDOWS_REQUIRED windows → CRASH_CONFIRMED.
 */
import { computeZScores } from '@/services/calibrationService';
import { useCalibrationStore } from '@/store/calibrationStore';
import { useSensorStore } from '@/store/sensorStore';
import { useDetectionStore, type DetectionResult } from '@/store/detectionStore';
import type { SensorFeatures } from '@crashguard/types';
import {
  ANOMALY_Z_THRESHOLD,
  ANOMALY_ABS_FLOOR_ACCEL_MS2,
} from '@crashguard/constants';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Speed below which we consider the device stationary (Stage 2) */
const STAGE2_STILL_SPEED_KMH = 2.0;

/** Absolute accel magnitude below which we consider device still */
const STAGE2_STILL_ACCEL_THRESHOLD = 2.5; // m/s² — approx 0.25G ambient noise

/** ML service base URL — reads from env */
const ML_SERVICE_URL = process.env.EXPO_PUBLIC_ML_SERVICE_URL ?? 'http://localhost:8000';

// ─── Stage 1: Mobile Z-Score ──────────────────────────────────────────────────

export function runStage1(features: SensorFeatures): DetectionResult {
  const { baseline, userBaseline } = useCalibrationStore.getState();

  // Safety gate: detection disabled without valid baseline
  if (!userBaseline?.isValid || baseline.sampleCount < 100) {
    return {
      isAnomaly: false,
      compositeZScore: 0,
      perFeatureZScores: {},
      confidence: 0,
      reason: 'Detection disabled — calibration required',
    };
  }

  // Absolute floor check (< 1.5G → cannot be a serious crash impact)
  if (features.peakAccelMagnitude < ANOMALY_ABS_FLOOR_ACCEL_MS2) {
    return {
      isAnomaly: false,
      compositeZScore: 0,
      perFeatureZScores: {},
      confidence: 0,
      reason: `Abs floor not met (${features.peakAccelMagnitude.toFixed(1)} m/s² < ${ANOMALY_ABS_FLOOR_ACCEL_MS2})`,
    };
  }

  // Compute z-scores
  const { perFeature, composite } = computeZScores(features, baseline);

  const isAnomaly = composite >= ANOMALY_Z_THRESHOLD;
  const confidence = isAnomaly
    ? Math.min(1.0, (composite - ANOMALY_Z_THRESHOLD) / ANOMALY_Z_THRESHOLD)
    : 0;

  const topFeatures = Object.entries(perFeature)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2)
    .map(([k, v]) => `${k}=${v.toFixed(1)}σ`)
    .join(', ');

  return {
    isAnomaly,
    compositeZScore: composite,
    perFeatureZScores: perFeature,
    confidence,
    reason: isAnomaly
      ? `Anomaly z=${composite.toFixed(2)}. Top: ${topFeatures}`
      : `Normal z=${composite.toFixed(2)} < ${ANOMALY_Z_THRESHOLD}`,
  };
}

// ─── Stage 2: Stillness Check ─────────────────────────────────────────────────

export function runStage2StillnessCheck(features: SensorFeatures): boolean {
  const { currentSpeedKmh } = useSensorStore.getState();

  const speedOk = (currentSpeedKmh ?? 0) < STAGE2_STILL_SPEED_KMH;
  const accelOk = features.peakAccelMagnitude < STAGE2_STILL_ACCEL_THRESHOLD;
  const stillnessOk = features.postEventStillness < 0.5; // low variance = still

  return speedOk && accelOk && stillnessOk;
}

// ─── Optional: Python ML Service Call ─────────────────────────────────────────

/**
 * Calls the Python ML service for server-side validation + logging.
 * Non-blocking, fire-and-forget — result is for audit only.
 * Mobile detection is authoritative regardless of this response.
 */
export async function callMlService(
  userId: string,
  features: SensorFeatures,
): Promise<void> {
  const { userBaseline } = useCalibrationStore.getState();
  if (!userBaseline || !ML_SERVICE_URL) return;

  try {
    await fetch(`${ML_SERVICE_URL}/detect/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        features: {
          peak_accel_magnitude: features.peakAccelMagnitude,
          peak_jerk: features.peakJerk,
          gps_speed_delta: features.gpsSpeedDelta,
          rotation_rate_spike: features.rotationRateSpike,
          post_event_stillness: features.postEventStillness,
          barometric_delta: features.barometricDelta,
        },
        baseline: {
          means: Object.fromEntries(
            Object.entries(userBaseline.featureMeans).map(([k, v]) => [
              k.replace(/([A-Z])/g, '_$1').toLowerCase(), v,
            ])
          ),
          stds: Object.fromEntries(
            Object.entries(userBaseline.featureStds).map(([k, v]) => [
              k.replace(/([A-Z])/g, '_$1').toLowerCase(), v,
            ])
          ),
          sample_count: userBaseline.sampleCount,
        },
      }),
    });
  } catch {
    // ML service unavailable — mobile detection continues independently
  }
}
