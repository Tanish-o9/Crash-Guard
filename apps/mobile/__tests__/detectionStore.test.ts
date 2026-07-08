/**
 * Unit tests — Detection State Machine
 *
 * Tests: processWindow hysteresis, reportStillnessCheck, resetToNormal,
 * phase transitions, and the addLogEntry ring buffer.
 *
 * The Zustand store is tested via its exposed pure action functions.
 */
import { act } from 'react-test-renderer';
import { useDetectionStore } from '../store/detectionStore';
import type { SensorFeatures } from '../../packages/types/src/index';
import type { DetectionResult } from '../store/detectionStore';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function anomalousResult(compositeZScore = 5.5): DetectionResult {
  return {
    isAnomaly: true,
    compositeZScore,
    perFeatureZScores: { peakAccelMagnitude: 8.0, peakJerk: 6.0 },
    confidence: 0.6,
    reason: 'Test anomaly',
  };
}

function normalResult(): DetectionResult {
  return {
    isAnomaly: false,
    compositeZScore: 1.2,
    perFeatureZScores: {},
    confidence: 0,
    reason: 'Normal',
  };
}

function sensorWindow(overrides: Partial<SensorFeatures> = {}): SensorFeatures {
  return {
    peakAccelMagnitude: 55.0,
    peakJerk: 120.0,
    gpsSpeedDelta: 12.0,
    rotationRateSpike: 10.0,
    postEventStillness: 0.05,
    barometricDelta: 0.3,
    ...overrides,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Reset store before each test
  act(() => {
    useDetectionStore.getState().resetToNormal();
    useDetectionStore.getState().clearLog();
  });
});

// ─── processWindow Tests ──────────────────────────────────────────────────────

describe('processWindow — hysteresis', () => {
  it('stays NORMAL on a single normal window', () => {
    let phase: string;
    act(() => {
      phase = useDetectionStore.getState().processWindow(sensorWindow(), normalResult());
    });
    expect(phase!).toBe('NORMAL');
    expect(useDetectionStore.getState().phase).toBe('NORMAL');
  });

  it('transitions to ANOMALY_STAGE1 on first anomalous window', () => {
    let phase: string;
    act(() => {
      phase = useDetectionStore.getState().processWindow(sensorWindow(), anomalousResult());
    });
    expect(phase!).toBe('ANOMALY_STAGE1');
    expect(useDetectionStore.getState().consecutiveAnomalyCount).toBe(1);
  });

  it('transitions to STAGE2_CLASSIFYING on second consecutive anomalous window', () => {
    let phase: string;
    act(() => {
      useDetectionStore.getState().processWindow(sensorWindow(), anomalousResult());
      phase = useDetectionStore.getState().processWindow(sensorWindow(), anomalousResult());
    });
    expect(phase!).toBe('STAGE2_CLASSIFYING');
  });

  it('resets to NORMAL if a normal window breaks the anomaly chain', () => {
    let phase: string;
    act(() => {
      useDetectionStore.getState().processWindow(sensorWindow(), anomalousResult()); // count=1
      phase = useDetectionStore.getState().processWindow(sensorWindow(), normalResult()); // reset
    });
    expect(phase!).toBe('NORMAL');
    expect(useDetectionStore.getState().consecutiveAnomalyCount).toBe(0);
  });

  it('does not advance to STAGE2 with only one anomalous window', () => {
    act(() => {
      useDetectionStore.getState().processWindow(sensorWindow(), anomalousResult());
    });
    expect(useDetectionStore.getState().phase).toBe('ANOMALY_STAGE1');
    // Verify we haven't triggered stage 2
    expect(useDetectionStore.getState().stage2StartTime).toBeNull();
  });
});

// ─── reportStillnessCheck Tests ───────────────────────────────────────────────

describe('reportStillnessCheck', () => {
  beforeEach(() => {
    // Pre-set to STAGE2_CLASSIFYING
    act(() => {
      useDetectionStore.getState().processWindow(sensorWindow(), anomalousResult());
      useDetectionStore.getState().processWindow(sensorWindow(), anomalousResult());
    });
    expect(useDetectionStore.getState().phase).toBe('STAGE2_CLASSIFYING');
  });

  it('accumulates still windows toward CRASH_CONFIRMED', () => {
    let phase: string;
    act(() => {
      useDetectionStore.getState().reportStillnessCheck(true);
      useDetectionStore.getState().reportStillnessCheck(true);
      phase = useDetectionStore.getState().reportStillnessCheck(true); // 3rd window → confirmed
    });
    expect(phase!).toBe('CRASH_CONFIRMED');
    expect(useDetectionStore.getState().phase).toBe('CRASH_CONFIRMED');
  });

  it('transitions to FALSE_ALARM if device is moving', () => {
    let phase: string;
    act(() => {
      phase = useDetectionStore.getState().reportStillnessCheck(false);
    });
    expect(phase!).toBe('FALSE_ALARM');
    expect(useDetectionStore.getState().phase).toBe('FALSE_ALARM');
  });

  it('resets consecutiveAnomalyCount on FALSE_ALARM', () => {
    act(() => {
      useDetectionStore.getState().reportStillnessCheck(false);
    });
    expect(useDetectionStore.getState().consecutiveAnomalyCount).toBe(0);
  });
});

// ─── addLogEntry ring buffer ──────────────────────────────────────────────────

describe('addLogEntry ring buffer', () => {
  it('adds entries to the log', () => {
    act(() => {
      useDetectionStore.getState().addLogEntry({
        id: 'test-1',
        timestamp: Date.now(),
        features: sensorWindow(),
        compositeZScore: 5.5,
        perFeatureZScores: {},
        confidence: 0.6,
        phase: 'ANOMALY_STAGE1',
        triggeredAlarm: false,
        reason: 'Test',
      });
    });
    expect(useDetectionStore.getState().anomalyLog).toHaveLength(1);
  });

  it('clears log via clearLog', () => {
    act(() => {
      useDetectionStore.getState().addLogEntry({
        id: 'test-2',
        timestamp: Date.now(),
        features: sensorWindow(),
        compositeZScore: 5.5,
        perFeatureZScores: {},
        confidence: 0.6,
        phase: 'ANOMALY_STAGE1',
        triggeredAlarm: false,
        reason: 'Test',
      });
      useDetectionStore.getState().clearLog();
    });
    expect(useDetectionStore.getState().anomalyLog).toHaveLength(0);
  });
});

// ─── resetToNormal ────────────────────────────────────────────────────────────

describe('resetToNormal', () => {
  it('resets all fields to initial state', () => {
    act(() => {
      useDetectionStore.getState().processWindow(sensorWindow(), anomalousResult());
      useDetectionStore.getState().processWindow(sensorWindow(), anomalousResult());
      useDetectionStore.getState().resetToNormal();
    });
    const state = useDetectionStore.getState();
    expect(state.phase).toBe('NORMAL');
    expect(state.consecutiveAnomalyCount).toBe(0);
    expect(state.lastAnomalyResult).toBeNull();
    expect(state.stage2StartTime).toBeNull();
    expect(state.stage2StillWindowCount).toBe(0);
  });
});
