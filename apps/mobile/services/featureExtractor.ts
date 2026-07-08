/**
 * Feature Extractor — processes raw sensor windows into engineered features.
 *
 * Window strategy:
 *   - Window size: 2 seconds = 100 samples at 50Hz
 *   - Overlap: 50% → new window computed every 1 second (every 50 new samples)
 *   - This gives good temporal resolution without excessive compute
 *
 * All math here is the same as in packages/utils/src/index.ts so they
 * stay in sync. The mobile service uses this directly for real-time extraction;
 * the shared utils version is used for testing.
 */
import type { RawSensorReading, SensorFeatures, SensorWindow } from '@crashguard/types';
import {
  SENSOR_SAMPLE_RATE_HZ,
  FEATURE_WINDOW_SECONDS,
} from '@crashguard/constants';

const WINDOW_SIZE = SENSOR_SAMPLE_RATE_HZ * FEATURE_WINDOW_SECONDS; // 100 samples

// ─── Core Math ────────────────────────────────────────────────────────────────

function accelMagnitude(ax: number, ay: number, az: number): number {
  return Math.sqrt(ax * ax + ay * ay + az * az);
}

function gyroMagnitude(gx: number, gy: number, gz: number): number {
  return Math.sqrt(gx * gx + gy * gy + gz * gz);
}

// ─── Feature Extraction ───────────────────────────────────────────────────────

/**
 * Extract features from a window of raw sensor readings.
 * Input: array of RawSensorReading (must have at least 2 readings).
 * Output: SensorFeatures for use with the anomaly detector.
 */
export function extractFeaturesFromReadings(readings: RawSensorReading[]): SensorFeatures {
  if (readings.length < 2) {
    return zeroed();
  }

  let peakAccelMagnitude = 0;
  let peakJerk = 0;
  let peakRotationRate = 0;
  let prevMag = accelMagnitude(readings[0].ax, readings[0].ay, readings[0].az);

  for (let i = 1; i < readings.length; i++) {
    const r = readings[i];
    const mag = accelMagnitude(r.ax, r.ay, r.az);

    if (mag > peakAccelMagnitude) peakAccelMagnitude = mag;

    const rot = gyroMagnitude(r.gx, r.gy, r.gz);
    if (rot > peakRotationRate) peakRotationRate = rot;

    // Jerk = rate of change of acceleration magnitude
    const dt = (r.timestamp - readings[i - 1].timestamp) / 1000;
    if (dt > 0) {
      const jerk = Math.abs(mag - prevMag) / dt;
      if (jerk > peakJerk) peakJerk = jerk;
    }
    prevMag = mag;
  }

  // GPS speed delta: compare first-half average vs second-half average
  const speeds = readings.map(r => r.speed ?? 0).filter(s => s > 0);
  let gpsSpeedDelta = 0;
  if (speeds.length >= 2) {
    const half = Math.floor(speeds.length / 2);
    const firstHalfAvg = speeds.slice(0, half).reduce((a, b) => a + b, 0) / half;
    const secondHalfAvg = speeds.slice(half).reduce((a, b) => a + b, 0) / (speeds.length - half);
    gpsSpeedDelta = Math.abs(firstHalfAvg - secondHalfAvg) * 3.6; // convert m/s → km/h delta
  }

  // Post-event stillness: variance of accel magnitude in last quarter of window
  const lastQuarter = readings.slice(Math.floor(readings.length * 0.75));
  const postMags = lastQuarter.map(r => accelMagnitude(r.ax, r.ay, r.az));
  const postMean = postMags.reduce((a, b) => a + b, 0) / (postMags.length || 1);
  const postVariance =
    postMags.reduce((sum, v) => sum + (v - postMean) ** 2, 0) / (postMags.length || 1);

  // Barometric delta
  const pressures = readings.map(r => r.pressure ?? 0).filter(p => p > 0);
  let barometricDelta = 0;
  if (pressures.length >= 2) {
    barometricDelta = Math.abs(pressures[0] - pressures[pressures.length - 1]);
  }

  return {
    peakAccelMagnitude: round2(peakAccelMagnitude),
    peakJerk: round2(peakJerk),
    gpsSpeedDelta: round2(gpsSpeedDelta),
    rotationRateSpike: round2(peakRotationRate),
    postEventStillness: round2(postVariance),
    barometricDelta: round2(barometricDelta),
  };
}

/**
 * Build a SensorWindow from a slice of readings.
 */
export function buildWindow(readings: RawSensorReading[]): SensorWindow {
  const features = extractFeaturesFromReadings(readings);
  return {
    startTimestamp: readings[0]?.timestamp ?? Date.now(),
    endTimestamp: readings[readings.length - 1]?.timestamp ?? Date.now(),
    readings,
    features,
  };
}

// ─── Ring Buffer Manager ──────────────────────────────────────────────────────

/**
 * RingBuffer: fixed-capacity circular buffer of sensor readings.
 * When full, oldest reading is dropped to make room for the new one.
 */
export class RingBuffer {
  private buf: RawSensorReading[];
  private capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buf = [];
  }

  push(reading: RawSensorReading): void {
    if (this.buf.length >= this.capacity) {
      this.buf.shift(); // drop oldest
    }
    this.buf.push(reading);
  }

  /** Get a copy of the last N readings (most recent) */
  last(n: number): RawSensorReading[] {
    if (n >= this.buf.length) return [...this.buf];
    return this.buf.slice(this.buf.length - n);
  }

  get length(): number {
    return this.buf.length;
  }

  clear(): void {
    this.buf = [];
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function zeroed(): SensorFeatures {
  return {
    peakAccelMagnitude: 0,
    peakJerk: 0,
    gpsSpeedDelta: 0,
    rotationRateSpike: 0,
    postEventStillness: 0,
    barometricDelta: 0,
  };
}

export { WINDOW_SIZE };
