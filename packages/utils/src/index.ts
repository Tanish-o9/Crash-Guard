import type { RawSensorReading, SensorFeatures, SensorWindow } from '@crashguard/types';
import { SENSOR_SAMPLE_RATE_HZ, FEATURE_WINDOW_SECONDS } from '@crashguard/constants';

// ─── Sensor Math ──────────────────────────────────────────────────────────────

/**
 * Compute the magnitude of a 3-axis acceleration vector.
 * |a| = sqrt(ax² + ay² + az²)
 */
export function accelMagnitude(ax: number, ay: number, az: number): number {
  return Math.sqrt(ax * ax + ay * ay + az * az);
}

/**
 * Compute the magnitude of a 3-axis gyroscope reading.
 */
export function gyroMagnitude(gx: number, gy: number, gz: number): number {
  return Math.sqrt(gx * gx + gy * gy + gz * gz);
}

/**
 * Compute jerk (rate of change of acceleration magnitude) between two readings.
 */
export function computeJerk(prev: RawSensorReading, curr: RawSensorReading): number {
  const prevMag = accelMagnitude(prev.ax, prev.ay, prev.az);
  const currMag = accelMagnitude(curr.ax, curr.ay, curr.az);
  const dt = (curr.timestamp - prev.timestamp) / 1000; // seconds
  if (dt <= 0) return 0;
  return Math.abs(currMag - prevMag) / dt;
}

/**
 * Extract features from a window of raw sensor readings.
 * This is the core feature extraction function — deterministic and pure.
 */
export function extractFeatures(readings: RawSensorReading[]): SensorFeatures {
  if (readings.length === 0) {
    return {
      peakAccelMagnitude: 0,
      peakJerk: 0,
      gpsSpeedDelta: 0,
      rotationRateSpike: 0,
      postEventStillness: 0,
      barometricDelta: 0,
    };
  }

  let peakAccelMagnitude = 0;
  let peakJerk = 0;
  let peakRotation = 0;

  for (let i = 0; i < readings.length; i++) {
    const r = readings[i];
    const mag = accelMagnitude(r.ax, r.ay, r.az);
    if (mag > peakAccelMagnitude) peakAccelMagnitude = mag;

    const rot = gyroMagnitude(r.gx, r.gy, r.gz);
    if (rot > peakRotation) peakRotation = rot;

    if (i > 0) {
      const jerk = computeJerk(readings[i - 1], r);
      if (jerk > peakJerk) peakJerk = jerk;
    }
  }

  // GPS speed delta
  const firstSpeed = readings.find(r => r.speed != null)?.speed ?? 0;
  const lastSpeed = [...readings].reverse().find(r => r.speed != null)?.speed ?? 0;
  const gpsSpeedDelta = Math.abs(firstSpeed - lastSpeed);

  // Post-event stillness: variance of accel in second half of window
  const half = Math.floor(readings.length / 2);
  const postHalf = readings.slice(half);
  const postMags = postHalf.map(r => accelMagnitude(r.ax, r.ay, r.az));
  const postMean = postMags.reduce((a, b) => a + b, 0) / (postMags.length || 1);
  const postVariance =
    postMags.reduce((sum, v) => sum + (v - postMean) ** 2, 0) / (postMags.length || 1);

  // Barometric delta
  const firstPressure = readings.find(r => r.pressure != null)?.pressure ?? 0;
  const lastPressure = [...readings].reverse().find(r => r.pressure != null)?.pressure ?? 0;
  const barometricDelta = Math.abs(firstPressure - lastPressure);

  return {
    peakAccelMagnitude: round2(peakAccelMagnitude),
    peakJerk: round2(peakJerk),
    gpsSpeedDelta: round2(gpsSpeedDelta),
    rotationRateSpike: round2(peakRotation),
    postEventStillness: round2(postVariance),
    barometricDelta: round2(barometricDelta),
  };
}

// ─── Language Utilities ───────────────────────────────────────────────────────

import { STATE_LANGUAGE_MAP, DEFAULT_LANGUAGE_CHAIN } from '@crashguard/constants';
import type { SupportedLanguage } from '@crashguard/types';

/**
 * Get the language priority chain for a given Indian state name.
 * Returns [primary, ...fallbacks] with English always last.
 */
export function getLanguageChainForState(stateName: string): SupportedLanguage[] {
  return STATE_LANGUAGE_MAP[stateName] ?? DEFAULT_LANGUAGE_CHAIN;
}

// ─── Geo Utilities ────────────────────────────────────────────────────────────

/**
 * Haversine distance between two lat/lng coordinates in kilometers.
 */
export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = deg2rad(lat2 - lat1);
  const dLng = deg2rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Format coordinates as a Google Maps link.
 */
export function toGoogleMapsLink(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${lat},${lng}`;
}

// ─── Time Utilities ───────────────────────────────────────────────────────────

/**
 * Format seconds into MM:SS display string.
 */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
}

/**
 * Format a timestamp into a human-readable relative string.
 */
export function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ─── Misc Helpers ─────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Generate a short random incident ID (not UUID — human readable).
 */
export function generateIncidentId(): string {
  return `INC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
