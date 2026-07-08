/**
 * Background task registration for CrashGuard sensor pipeline.
 *
 * Background execution strategy:
 * - BACKGROUND_LOCATION_TASK: keeps the process alive on Android via a
 *   foreground service started by expo-location. This is the "anchor" that
 *   prevents the OS from killing our process.
 * - Sensor subscriptions (accel/gyro) run in the main JS thread and survive
 *   as long as the foreground service is alive.
 * - BACKGROUND_FETCH_TASK: used for periodic sensor log uploads to Supabase
 *   when the app is fully backgrounded.
 *
 * NOTE: Background battery optimization workarounds for MIUI/ColorOS/OxygenOS
 * are explicitly deferred per project design decision. This code works correctly
 * on stock Android. OEM-specific workarounds will be added in a later phase.
 */
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as BackgroundFetch from 'expo-background-fetch';
import { useSensorStore } from '@/store/sensorStore';
import {
  RIDING_MODE_MIN_SPEED_KMH,
  RIDING_MODE_ACTIVATION_SECONDS,
} from '@crashguard/constants';

// ─── Task Names ───────────────────────────────────────────────────────────────

export const BACKGROUND_LOCATION_TASK = 'crashguard-background-location';
export const BACKGROUND_FETCH_TASK = 'crashguard-background-fetch';

// ─── Speed tracking for auto riding-mode ─────────────────────────────────────

/** Timestamp when GPS speed first exceeded the threshold */
let speedThresholdFirstMet: number | null = null;

// ─── Background Location Task ─────────────────────────────────────────────────

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    useSensorStore.getState().setError(`Location task error: ${error.message}`);
    return;
  }

  if (!data) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  const loc = locations[locations.length - 1]; // Most recent
  if (!loc) return;

  const speedMs = loc.coords.speed ?? 0;
  const speedKmh = speedMs * 3.6;

  // Update GPS state in store
  useSensorStore
    .getState()
    .updateGPS(loc.coords.latitude, loc.coords.longitude, speedKmh);

  // ── Auto riding mode detection ──────────────────────────────────────────
  const { status, isManualOverride, setStatus } = useSensorStore.getState();

  // Don't override manual user control
  if (isManualOverride) return;

  if (speedKmh >= RIDING_MODE_MIN_SPEED_KMH) {
    if (!speedThresholdFirstMet) {
      speedThresholdFirstMet = Date.now();
    }
    const elapsedSeconds = (Date.now() - speedThresholdFirstMet) / 1000;
    if (elapsedSeconds >= RIDING_MODE_ACTIVATION_SECONDS && status !== 'riding') {
      setStatus('riding');
    } else if (status === 'idle') {
      setStatus('monitoring');
    }
  } else {
    // Speed dropped below threshold — reset timer
    speedThresholdFirstMet = null;
    // Auto-deactivate after 60s below threshold (avoid flipping on/off in traffic)
    // (simplified: just set to monitoring for now)
    if (status === 'riding') {
      setStatus('monitoring');
    }
  }
});

// ─── Background Fetch Task (upload trigger) ───────────────────────────────────

TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  try {
    // Dynamic import to avoid circular dependencies
    const { sensorUploader } = await import('@/services/sensorUploader');
    await sensorUploader.uploadPendingWindows();
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ─── Start / Stop Helpers ─────────────────────────────────────────────────────

/**
 * Start the background location task.
 * Requires Location.requestBackgroundPermissionsAsync() to have been granted.
 */
export async function startBackgroundLocationTask(): Promise<boolean> {
  try {
    const { status } = await Location.getBackgroundPermissionsAsync();
    if (status !== 'granted') return false;

    const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (isRunning) return true;

    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 1000,          // 1 Hz GPS updates
      distanceInterval: 0,          // Always update regardless of distance
      showsBackgroundLocationIndicator: false,
      foregroundService: {
        notificationTitle: 'CrashGuard Active',
        notificationBody: 'Monitoring for crashes in the background',
        notificationColor: '#FF3B3B',
      },
    });
    return true;
  } catch (err: any) {
    useSensorStore.getState().setError(`Failed to start location task: ${err.message}`);
    return false;
  }
}

export async function stopBackgroundLocationTask(): Promise<void> {
  try {
    const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (isRunning) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }
  } catch {}
}

/**
 * Register the background fetch task for sensor log uploads.
 * Minimum interval is 15 minutes (enforced by iOS and Android).
 */
export async function registerBackgroundFetch(): Promise<void> {
  try {
    await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
      minimumInterval: 15 * 60, // 15 minutes minimum
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch {}
}
