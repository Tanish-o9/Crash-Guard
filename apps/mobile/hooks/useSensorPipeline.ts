/**
 * useSensorPipeline — React hook that manages the full sensor lifecycle.
 *
 * This is the single integration point for components that need to start/stop
 * the sensor pipeline. It handles:
 *   - Starting/stopping sensors when riding mode changes
 *   - Periodic sensor log uploads (every SENSOR_UPLOAD_INTERVAL_MINUTES)
 *   - Background task registration on mount
 *   - Flushing pending uploads when riding mode stops
 *
 * Usage:
 *   const { isRiding, toggleRidingMode, startRiding, stopRiding } = useSensorPipeline();
 */
import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useSensorStore } from '@/store/sensorStore';
import { sensorService } from '@/services/sensorService';
import { sensorUploader } from '@/services/sensorUploader';
import { registerBackgroundFetch } from '@/services/backgroundTask';
import { SENSOR_UPLOAD_INTERVAL_MINUTES } from '@crashguard/constants';

export function useSensorPipeline() {
  const { status, isManualOverride, setStatus, setManualOverride } = useSensorStore();
  const uploadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Register background fetch on first mount
  useEffect(() => {
    registerBackgroundFetch();
  }, []);

  // Start periodic upload timer
  const startUploadTimer = useCallback(() => {
    if (uploadTimerRef.current) return;
    uploadTimerRef.current = setInterval(
      () => sensorUploader.uploadPendingWindows(),
      SENSOR_UPLOAD_INTERVAL_MINUTES * 60 * 1000
    );
  }, []);

  const stopUploadTimer = useCallback(() => {
    if (uploadTimerRef.current) {
      clearInterval(uploadTimerRef.current);
      uploadTimerRef.current = null;
    }
  }, []);

  // Handle app background/foreground transitions
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;

      // App went to background while riding — flush pending uploads
      if (prev === 'active' && nextState === 'background') {
        if (status === 'riding') {
          // Fire and forget — background task will handle retries
          sensorUploader.uploadPendingWindows().catch(() => {});
        }
      }
    });
    return () => sub.remove();
  }, [status]);

  // ── Public API ───────────────────────────────────────────────────────────────

  const startRiding = useCallback(async () => {
    setManualOverride(true);
    const ok = await sensorService.start();
    if (ok) {
      setStatus('riding');
      startUploadTimer();
    }
  }, [setManualOverride, setStatus, startUploadTimer]);

  const stopRiding = useCallback(async () => {
    setManualOverride(false);
    await sensorService.stop();
    stopUploadTimer();
    // Flush any remaining windows
    await sensorUploader.uploadPendingWindows().catch(() => {});
    setStatus('idle');
  }, [setManualOverride, setStatus, stopUploadTimer]);

  const toggleRidingMode = useCallback(async () => {
    if (status === 'riding') {
      await stopRiding();
    } else {
      await startRiding();
    }
  }, [status, startRiding, stopRiding]);

  // ── Auto start if status was set to 'riding' by background GPS task ─────────
  useEffect(() => {
    if (status === 'riding' && !sensorService.running) {
      sensorService.start().then(ok => {
        if (ok) startUploadTimer();
      });
    }
  }, [status, startUploadTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopUploadTimer();
    };
  }, [stopUploadTimer]);

  return {
    isRiding: status === 'riding',
    isMonitoring: status === 'monitoring',
    status,
    toggleRidingMode,
    startRiding,
    stopRiding,
  };
}
