/**
 * Unit tests — Calibration Service
 *
 * Tests: Welford online algorithm, EMA updates, z-score computation,
 * calibration progress / ETA helpers, and finalization.
 *
 * All functions are pure — no mocks needed.
 */
import {
  emptyWelfordAccumulator,
  emptyMutableBaseline,
  welfordUpdate,
  finalizeWelford,
  emaUpdate,
  ingestWindow,
  computeZScores,
  calibrationProgress,
  calibrationETA,
  FEATURE_KEYS,
} from '../services/calibrationService';
import { MIN_BASELINE_SAMPLES } from '@crashguard/constants';
import type { SensorFeatures } from '@crashguard/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** A typical "normal riding" window */
function normalWindow(overrides: Partial<SensorFeatures> = {}): SensorFeatures {
  return {
    peakAccelMagnitude: 12.0,
    peakJerk: 8.0,
    gpsSpeedDelta: 0.5,
    rotationRateSpike: 0.8,
    postEventStillness: 1.2,
    barometricDelta: 0.0,
    ...overrides,
  };
}

/** A crash-like window */
function crashWindow(): SensorFeatures {
  return {
    peakAccelMagnitude: 58.0,
    peakJerk: 140.0,
    gpsSpeedDelta: 15.0,
    rotationRateSpike: 12.0,
    postEventStillness: 0.05,
    barometricDelta: 0.5,
  };
}

// ─── Welford Tests ────────────────────────────────────────────────────────────

describe('welfordUpdate', () => {
  it('starts at zero accumulator', () => {
    const acc = emptyWelfordAccumulator();
    expect(acc.count).toBe(0);
    FEATURE_KEYS.forEach(k => {
      expect(acc.mean[k]).toBe(0);
      expect(acc.M2[k]).toBe(0);
    });
  });

  it('computes correct mean after N identical samples', () => {
    const VALUE = 10.0;
    let acc = emptyWelfordAccumulator();
    for (let i = 0; i < 10; i++) {
      acc = welfordUpdate(acc, normalWindow({ peakAccelMagnitude: VALUE }));
    }
    expect(acc.mean.peakAccelMagnitude).toBeCloseTo(VALUE, 5);
    expect(acc.count).toBe(10);
  });

  it('accumulates M2 (variance numerator) correctly for 2 samples', () => {
    let acc = emptyWelfordAccumulator();
    acc = welfordUpdate(acc, normalWindow({ peakAccelMagnitude: 4.0 }));
    acc = welfordUpdate(acc, normalWindow({ peakAccelMagnitude: 8.0 }));
    // Mean should be 6.0
    expect(acc.mean.peakAccelMagnitude).toBeCloseTo(6.0, 5);
    // M2 = (4-6)² + (8-6)² = 4 + 4 = 8.0 (via online Welford)
    expect(acc.M2.peakAccelMagnitude).toBeCloseTo(8.0, 4);
  });

  it('does not mutate the original accumulator', () => {
    const acc = emptyWelfordAccumulator();
    const acc2 = welfordUpdate(acc, normalWindow());
    expect(acc.count).toBe(0);
    expect(acc2.count).toBe(1);
  });
});

describe('finalizeWelford', () => {
  it('produces correct sample variance for known data', () => {
    const values = [2, 4, 4, 4, 5, 5, 7, 9]; // mean=5, variance=4
    let acc = emptyWelfordAccumulator();
    for (const v of values) {
      acc = welfordUpdate(acc, normalWindow({ peakAccelMagnitude: v }));
    }
    const baseline = finalizeWelford(acc);
    expect(baseline.means.peakAccelMagnitude).toBeCloseTo(5.0, 4);
    // Sample variance = M2/(n-1) = 32/7 ≈ 4.571
    expect(baseline.variances.peakAccelMagnitude).toBeCloseTo(32 / 7, 3);
    expect(baseline.sampleCount).toBe(8);
  });
});

// ─── EMA Update Tests ─────────────────────────────────────────────────────────

describe('emaUpdate', () => {
  it('does not mutate the original baseline', () => {
    const baseline = emptyMutableBaseline();
    baseline.means.peakAccelMagnitude = 10;
    baseline.variances.peakAccelMagnitude = 1;
    baseline.sampleCount = 200;
    const updated = emaUpdate(baseline, normalWindow({ peakAccelMagnitude: 20 }));
    expect(baseline.means.peakAccelMagnitude).toBe(10);
    expect(updated.means.peakAccelMagnitude).not.toBe(10);
  });

  it('slowly shifts mean toward new value with alpha=0.02', () => {
    let baseline = emptyMutableBaseline();
    baseline.means.peakAccelMagnitude = 10;
    baseline.variances.peakAccelMagnitude = 1;
    baseline.sampleCount = 200;
    baseline = emaUpdate(baseline, normalWindow({ peakAccelMagnitude: 110 }));
    // α=0.02: new_mean = 0.02×110 + 0.98×10 = 2.2 + 9.8 = 12.0
    expect(baseline.means.peakAccelMagnitude).toBeCloseTo(12.0, 4);
  });

  it('increments sampleCount', () => {
    let baseline = emptyMutableBaseline();
    baseline.sampleCount = 150;
    baseline = emaUpdate(baseline, normalWindow());
    expect(baseline.sampleCount).toBe(151);
  });
});

// ─── ingestWindow routing ─────────────────────────────────────────────────────

describe('ingestWindow', () => {
  it('uses Welford in cold-start phase (< MIN_BASELINE_SAMPLES)', () => {
    const baseline = emptyMutableBaseline(); // sampleCount = 0
    const acc = emptyWelfordAccumulator();
    const { baseline: newB } = ingestWindow(normalWindow(), baseline, acc);
    expect(newB.sampleCount).toBe(1);
  });

  it('switches to EMA after MIN_BASELINE_SAMPLES', () => {
    let baseline = emptyMutableBaseline();
    baseline.sampleCount = MIN_BASELINE_SAMPLES; // already valid
    baseline.means.peakAccelMagnitude = 12;
    baseline.variances.peakAccelMagnitude = 1;
    const acc = emptyWelfordAccumulator();
    const { baseline: newB } = ingestWindow(normalWindow({ peakAccelMagnitude: 100 }), baseline, acc);
    // EMA update: new_mean = 0.02×100 + 0.98×12 = 2 + 11.76 = 13.76
    expect(newB.means.peakAccelMagnitude).toBeCloseTo(13.76, 3);
  });
});

// ─── Z-Score Computation Tests ────────────────────────────────────────────────

describe('computeZScores', () => {
  it('returns zero composite z-score when features equal the baseline mean', () => {
    const baseline = emptyMutableBaseline();
    const window = normalWindow();
    // Set means equal to window values and non-zero variances
    FEATURE_KEYS.forEach(k => {
      baseline.means[k] = window[k];
      baseline.variances[k] = 1.0; // std = 1
    });
    baseline.sampleCount = 200;
    const { composite } = computeZScores(window, baseline);
    expect(composite).toBeCloseTo(0, 5);
  });

  it('returns high composite z-score for a crash window vs normal baseline', () => {
    const baseline = emptyMutableBaseline();
    // Seed baseline with normal riding values
    const normal = normalWindow();
    FEATURE_KEYS.forEach(k => {
      baseline.means[k] = normal[k];
      baseline.variances[k] = 1.0; // tight std dev of 1 m/s²
    });
    baseline.sampleCount = 200;
    const { composite } = computeZScores(crashWindow(), baseline);
    // Crash has peakAccel=58 vs baseline mean=12, std=1 → z_accel=46 → composite >> threshold
    expect(composite).toBeGreaterThan(4.5);
  });

  it('returns per-feature z-scores object with all expected keys', () => {
    const baseline = emptyMutableBaseline();
    FEATURE_KEYS.forEach(k => { baseline.means[k] = 5; baseline.variances[k] = 1; });
    baseline.sampleCount = 200;
    const { perFeature } = computeZScores(normalWindow(), baseline);
    FEATURE_KEYS.forEach(k => {
      expect(perFeature).toHaveProperty(k);
      expect(typeof perFeature[k]).toBe('number');
    });
  });
});

// ─── Progress / ETA Helpers ───────────────────────────────────────────────────

describe('calibrationProgress', () => {
  it('returns 0 at 0 samples', () => {
    expect(calibrationProgress(0)).toBe(0);
  });

  it('returns 1 at MIN_BASELINE_SAMPLES', () => {
    expect(calibrationProgress(MIN_BASELINE_SAMPLES)).toBe(1);
  });

  it('caps at 1 beyond MIN_BASELINE_SAMPLES', () => {
    expect(calibrationProgress(MIN_BASELINE_SAMPLES + 100)).toBe(1);
  });

  it('returns 0.5 at half the required samples', () => {
    expect(calibrationProgress(MIN_BASELINE_SAMPLES / 2)).toBeCloseTo(0.5, 5);
  });
});

describe('calibrationETA', () => {
  it('returns Done when calibrated', () => {
    expect(calibrationETA(MIN_BASELINE_SAMPLES)).toBe('Done');
  });

  it('returns ~1 min left when close', () => {
    expect(calibrationETA(MIN_BASELINE_SAMPLES - 30, 60)).toBe('~1 min left');
  });

  it('returns approximate minutes remaining', () => {
    // 0 samples, 60 windows/min → 100/60 = 1.67 → ceil = 2 min
    expect(calibrationETA(0, 60)).toBe('~2 min left');
  });
});
