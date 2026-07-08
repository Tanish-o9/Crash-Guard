/**
 * Calibration Service — computes and manages the per-user sensor baseline.
 *
 * ## Algorithm: Exponential Moving Average (EMA) Baseline
 *
 * For each feature f, we maintain running mean (μ) and variance (σ²):
 *
 *   μ_new = α × x + (1 − α) × μ_old          (EMA mean update)
 *   σ²_new = (1 − α) × (σ²_old + α × (x − μ_old)²)   (Welford-style EMA variance)
 *
 * Where α = smoothing factor (0.01 = very slow update, 0.1 = faster adaptation).
 *
 * We use α = 0.02 so the baseline is stable against single anomalous windows
 * but does adapt over hundreds of rides.
 *
 * ## Validity
 * A baseline is considered VALID when sampleCount >= MIN_BASELINE_SAMPLES (100).
 * Before that, the anomaly detector is disabled (prevents cold-start false positives).
 *
 * ## Seeding
 * On first calibration ride, we use a simple running mean/variance (Welford online algorithm)
 * for the first MIN_BASELINE_SAMPLES windows, then switch to EMA for subsequent updates.
 *
 * ## Design Note
 * This matches the Python anomaly_detector.py implementation exactly — both must use
 * the same z-score formula. Any change here must be mirrored in services/ml.
 */
import type { SensorFeatures, UserBaseline } from '@crashguard/types';
import { MIN_BASELINE_SAMPLES } from '@crashguard/constants';

// ─── Constants ────────────────────────────────────────────────────────────────

/** EMA smoothing factor — controls how quickly baseline adapts to new data */
const EMA_ALPHA = 0.02;

/** Minimum std dev floor to prevent division-by-zero in z-score computation */
const MIN_STD_FLOOR = 0.001;

/** Feature keys in a fixed, canonical order */
export const FEATURE_KEYS: (keyof SensorFeatures)[] = [
  'peakAccelMagnitude',
  'peakJerk',
  'gpsSpeedDelta',
  'rotationRateSpike',
  'postEventStillness',
  'barometricDelta',
];

// ─── Types ────────────────────────────────────────────────────────────────────

/** Running accumulator for the cold-start (Welford) phase */
export interface WelfordAccumulator {
  count: number;
  mean: Record<keyof SensorFeatures, number>;
  M2: Record<keyof SensorFeatures, number>; // sum of squared deviations
}

/** In-memory mutable baseline (before persistence) */
export interface MutableBaseline {
  means: Record<keyof SensorFeatures, number>;
  variances: Record<keyof SensorFeatures, number>;
  sampleCount: number;
}

// ─── Initialization ───────────────────────────────────────────────────────────

export function emptyWelfordAccumulator(): WelfordAccumulator {
  const zero = () =>
    Object.fromEntries(FEATURE_KEYS.map(k => [k, 0])) as Record<keyof SensorFeatures, number>;
  return { count: 0, mean: zero(), M2: zero() };
}

export function emptyMutableBaseline(): MutableBaseline {
  const zero = () =>
    Object.fromEntries(FEATURE_KEYS.map(k => [k, 0])) as Record<keyof SensorFeatures, number>;
  return { means: zero(), variances: zero(), sampleCount: 0 };
}

// ─── Cold-Start Phase: Welford Online Algorithm ───────────────────────────────

/**
 * Update Welford accumulator with a new feature window.
 * Used for the first MIN_BASELINE_SAMPLES windows.
 * This gives an exact online mean and variance without storing all data.
 */
export function welfordUpdate(
  acc: WelfordAccumulator,
  features: SensorFeatures
): WelfordAccumulator {
  const newAcc = {
    count: acc.count + 1,
    mean: { ...acc.mean },
    M2: { ...acc.M2 },
  };

  for (const key of FEATURE_KEYS) {
    const x = features[key];
    const delta = x - newAcc.mean[key];
    newAcc.mean[key] += delta / newAcc.count;
    const delta2 = x - newAcc.mean[key];
    newAcc.M2[key] += delta * delta2;
  }

  return newAcc;
}

/**
 * Finalize Welford accumulator into a MutableBaseline.
 * Called when sampleCount reaches MIN_BASELINE_SAMPLES.
 */
export function finalizeWelford(acc: WelfordAccumulator): MutableBaseline {
  const means = { ...acc.mean };
  const variances = Object.fromEntries(
    FEATURE_KEYS.map(k => [
      k,
      acc.count > 1 ? acc.M2[k] / (acc.count - 1) : MIN_STD_FLOOR ** 2,
    ])
  ) as Record<keyof SensorFeatures, number>;

  return { means, variances, sampleCount: acc.count };
}

// ─── EMA Update Phase ─────────────────────────────────────────────────────────

/**
 * Update an existing baseline with a new feature window using EMA.
 * Used for all windows after the cold-start phase.
 *
 * This provides graceful baseline drift — if the rider's style changes
 * (new bike, new mount position) the baseline adapts over time rather than
 * permanently anchoring to old riding patterns.
 */
export function emaUpdate(baseline: MutableBaseline, features: SensorFeatures): MutableBaseline {
  const newMeans = { ...baseline.means };
  const newVariances = { ...baseline.variances };

  for (const key of FEATURE_KEYS) {
    const x = features[key];
    const oldMean = baseline.means[key];
    const oldVar = baseline.variances[key];

    // EMA mean
    newMeans[key] = EMA_ALPHA * x + (1 - EMA_ALPHA) * oldMean;
    // EMA variance (Welford-style)
    newVariances[key] = (1 - EMA_ALPHA) * (oldVar + EMA_ALPHA * (x - oldMean) ** 2);
  }

  return {
    means: newMeans,
    variances: newVariances,
    sampleCount: baseline.sampleCount + 1,
  };
}

// ─── Ingest: Route to correct update algorithm ────────────────────────────────

/**
 * Ingest a new feature window into the calibration system.
 * Automatically routes to Welford (cold-start) or EMA (ongoing) based on sample count.
 */
export function ingestWindow(
  features: SensorFeatures,
  baseline: MutableBaseline,
  accumulator: WelfordAccumulator
): { baseline: MutableBaseline; accumulator: WelfordAccumulator } {
  if (baseline.sampleCount < MIN_BASELINE_SAMPLES) {
    // Cold-start phase — use Welford exact algorithm
    const newAcc = welfordUpdate(accumulator, features);
    const newBaseline =
      newAcc.count >= MIN_BASELINE_SAMPLES
        ? finalizeWelford(newAcc) // Finalize into a baseline once we hit the threshold
        : { means: newAcc.mean, variances: {
            ...Object.fromEntries(
              FEATURE_KEYS.map(k => [
                k,
                newAcc.count > 1 ? newAcc.M2[k] / newAcc.count : MIN_STD_FLOOR ** 2,
              ])
            ) as Record<keyof SensorFeatures, number>,
          }, sampleCount: newAcc.count };
    return { baseline: newBaseline, accumulator: newAcc };
  } else {
    // Ongoing phase — use EMA
    const newBaseline = emaUpdate(baseline, features);
    return { baseline: newBaseline, accumulator };
  }
}

// ─── Z-Score Computation ──────────────────────────────────────────────────────

/**
 * Compute per-feature z-scores and composite score for a given window.
 * Mirrors the Python implementation in services/ml/app/services/anomaly_detector.py.
 */
export function computeZScores(
  features: SensorFeatures,
  baseline: MutableBaseline
): { perFeature: Record<keyof SensorFeatures, number>; composite: number } {
  const perFeature = {} as Record<keyof SensorFeatures, number>;

  for (const key of FEATURE_KEYS) {
    const mean = baseline.means[key];
    const std = Math.max(Math.sqrt(baseline.variances[key]), MIN_STD_FLOOR);
    perFeature[key] = (features[key] - mean) / std;
  }

  // Composite: weighted average of absolute z-scores
  // Higher weights for the most reliable crash indicators
  const WEIGHTS: Record<keyof SensorFeatures, number> = {
    peakAccelMagnitude: 0.35,
    peakJerk: 0.20,
    gpsSpeedDelta: 0.15,
    rotationRateSpike: 0.15,
    postEventStillness: 0.10,
    barometricDelta: 0.05,
  };

  const composite = FEATURE_KEYS.reduce(
    (sum, key) => sum + WEIGHTS[key] * Math.abs(perFeature[key]),
    0
  );

  return { perFeature, composite };
}

// ─── Serialization ────────────────────────────────────────────────────────────

/** Convert MutableBaseline to the DB-compatible UserBaseline format */
export function toUserBaseline(
  userId: string,
  baseline: MutableBaseline
): Omit<UserBaseline, 'id' | 'updatedAt'> {
  const featureStds = Object.fromEntries(
    FEATURE_KEYS.map(k => [k, Math.max(Math.sqrt(baseline.variances[k]), MIN_STD_FLOOR)])
  ) as Record<keyof SensorFeatures, number>;

  return {
    userId,
    featureMeans: baseline.means,
    featureStds,
    sampleCount: baseline.sampleCount,
    isValid: baseline.sampleCount >= MIN_BASELINE_SAMPLES,
  };
}

/** Convert a loaded UserBaseline back to MutableBaseline for in-memory use */
export function fromUserBaseline(b: UserBaseline): MutableBaseline {
  const variances = Object.fromEntries(
    FEATURE_KEYS.map(k => [k, b.featureStds[k] ** 2])
  ) as Record<keyof SensorFeatures, number>;
  return { means: b.featureMeans, variances, sampleCount: b.sampleCount };
}

// ─── Calibration Progress ─────────────────────────────────────────────────────

/** Progress 0–1 through the cold-start calibration phase */
export function calibrationProgress(sampleCount: number): number {
  return Math.min(sampleCount / MIN_BASELINE_SAMPLES, 1);
}

/** Human-readable estimated time remaining */
export function calibrationETA(sampleCount: number, windowsPerMinute = 60): string {
  const remaining = Math.max(MIN_BASELINE_SAMPLES - sampleCount, 0);
  const minutes = Math.ceil(remaining / windowsPerMinute);
  if (minutes <= 0) return 'Done';
  if (minutes === 1) return '~1 min left';
  return `~${minutes} min left`;
}
