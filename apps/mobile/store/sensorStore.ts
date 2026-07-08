import { create } from 'zustand';
import type { RawSensorReading, SensorFeatures, SensorWindow } from '@crashguard/types';
import { MAX_BUFFERED_WINDOWS } from '@crashguard/constants';

// ─── Types ───────────────────────────────────────────────────────────────────

export type RidingModeStatus =
  | 'idle'           // Not riding, sensors off
  | 'monitoring'     // GPS speed being tracked, not yet fast enough
  | 'riding'         // Active riding — sensors collecting
  | 'paused';        // User manually paused

interface SensorState {
  // Riding mode
  status: RidingModeStatus;
  ridingModeStartedAt: number | null;
  isManualOverride: boolean;         // user toggled manually

  // Live readings (last values received, for dev UI)
  latestReading: RawSensorReading | null;
  latestFeatures: SensorFeatures | null;

  // GPS
  currentLat: number | null;
  currentLng: number | null;
  currentSpeedKmh: number | null;

  // Ring buffer of completed feature windows
  windowBuffer: SensorWindow[];

  // Anomaly
  latestZScore: number | null;
  isAnomalyDetected: boolean;

  // Upload stats
  totalWindowsCollected: number;
  totalWindowsUploaded: number;

  // Errors
  lastError: string | null;

  // Actions
  setStatus: (status: RidingModeStatus) => void;
  setManualOverride: (override: boolean) => void;
  setLatestReading: (reading: RawSensorReading) => void;
  setLatestFeatures: (features: SensorFeatures) => void;
  updateGPS: (lat: number, lng: number, speedKmh: number) => void;
  addWindow: (window: SensorWindow) => void;
  markWindowsUploaded: (count: number) => void;
  setAnomalyResult: (zScore: number, isAnomaly: boolean) => void;
  setError: (msg: string | null) => void;
  reset: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSensorStore = create<SensorState>((set, get) => ({
  status: 'idle',
  ridingModeStartedAt: null,
  isManualOverride: false,

  latestReading: null,
  latestFeatures: null,

  currentLat: null,
  currentLng: null,
  currentSpeedKmh: null,

  windowBuffer: [],
  latestZScore: null,
  isAnomalyDetected: false,

  totalWindowsCollected: 0,
  totalWindowsUploaded: 0,
  lastError: null,

  setStatus: (status) =>
    set(s => ({
      status,
      ridingModeStartedAt:
        status === 'riding' && s.status !== 'riding' ? Date.now() : s.ridingModeStartedAt,
    })),

  setManualOverride: (override) => set({ isManualOverride: override }),

  setLatestReading: (reading) => set({ latestReading: reading }),

  setLatestFeatures: (features) => set({ latestFeatures: features }),

  updateGPS: (lat, lng, speedKmh) =>
    set({ currentLat: lat, currentLng: lng, currentSpeedKmh: speedKmh }),

  addWindow: (window) =>
    set(s => {
      const buffer = [...s.windowBuffer, window];
      // Keep buffer within max size (drop oldest first)
      const trimmed = buffer.length > MAX_BUFFERED_WINDOWS
        ? buffer.slice(buffer.length - MAX_BUFFERED_WINDOWS)
        : buffer;
      return {
        windowBuffer: trimmed,
        totalWindowsCollected: s.totalWindowsCollected + 1,
      };
    }),

  markWindowsUploaded: (count) =>
    set(s => ({
      windowBuffer: s.windowBuffer.slice(count),
      totalWindowsUploaded: s.totalWindowsUploaded + count,
    })),

  setAnomalyResult: (zScore, isAnomaly) =>
    set({ latestZScore: zScore, isAnomalyDetected: isAnomaly }),

  setError: (lastError) => set({ lastError }),

  reset: () =>
    set({
      status: 'idle',
      ridingModeStartedAt: null,
      isManualOverride: false,
      latestReading: null,
      latestFeatures: null,
      currentLat: null,
      currentLng: null,
      currentSpeedKmh: null,
      windowBuffer: [],
      latestZScore: null,
      isAnomalyDetected: false,
      lastError: null,
    }),
}));
