/**
 * useCalibration — React hook that wires the calibration store into the sensor pipeline.
 *
 * - On mount: loads the baseline from cache/Supabase
 * - While riding: ingests each new feature window into the calibration store
 * - Provides calibration status, progress, and actions to UI components
 *
 * This hook is designed to be used alongside useSensorPipeline.
 * It observes sensorStore.latestFeatures and calls calibrationStore.ingestWindow
 * whenever a new feature window is ready.
 */
import { useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useSensorStore } from '@/store/sensorStore';
import { useCalibrationStore } from '@/store/calibrationStore';

export function useCalibration() {
  const { session } = useAuthStore();
  const { latestFeatures, status: rideStatus } = useSensorStore();
  const {
    status,
    progressFraction,
    etaString,
    userBaseline,
    baseline,
    isSaving,
    error,
    loadBaseline,
    ingestWindow,
    persistBaseline,
    resetBaseline,
    setStatus,
    clearError,
  } = useCalibrationStore();

  // Load baseline on session availability
  useEffect(() => {
    if (session?.user.id) {
      loadBaseline();
    }
  }, [session?.user.id]);

  // Ingest new feature windows while riding
  useEffect(() => {
    if (!latestFeatures) return;
    if (rideStatus !== 'riding') return;

    // Activate calibration if we have a session and baseline isn't already valid
    if (status === 'none' || status === 'reset') {
      setStatus('calibrating');
    }

    ingestWindow(latestFeatures);
  }, [latestFeatures, rideStatus, status]);

  // Persist to Supabase when riding mode stops
  useEffect(() => {
    if (rideStatus === 'idle' && (status === 'calibrating' || status === 'valid' || status === 'updating')) {
      persistBaseline(true);
    }
  }, [rideStatus]);

  const handleReset = useCallback(async () => {
    await resetBaseline();
  }, []);

  return {
    // Status
    calibrationStatus: status,
    isCalibrating: status === 'calibrating',
    isValid: status === 'valid' || status === 'updating',
    needsCalibration: status === 'none' || status === 'reset',

    // Progress
    progressFraction,
    etaString,
    sampleCount: baseline.sampleCount,

    // Data (for anomaly detector)
    baseline: baseline,
    userBaseline,

    // Actions
    resetCalibration: handleReset,

    // Util
    isSaving,
    error,
    clearError,
  };
}
