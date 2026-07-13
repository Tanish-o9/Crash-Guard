/**
 * useCrashDetection — hook that wires the detection engine into the sensor
 * pipeline and calibration system, triggering the alarm when a crash is confirmed.
 *
 * Data flow:
 *   useSensorStore.latestFeatures (updated every 2s while riding)
 *     ↓
 *   runStage1() — mobile z-score against personal baseline
 *     ↓ anomalous?
 *   detectionStore.processWindow() — applies hysteresis (2 consecutive windows)
 *     ↓ STAGE2_CLASSIFYING?
 *   runStage2StillnessCheck() — device still? (speed + accel check)
 *     ↓ CRASH_CONFIRMED?
 *   alarmStore.startAlarm('auto_sensor') → navigate to /alarm
 *     ↓ simultaneously (fire-and-forget)
 *   callMlService() — Python service for audit/model training
 *
 * FALSE_ALARM path:
 *   Phase resets to NORMAL after 3s hold.
 *   Cancel reason logged automatically.
 *
 * Safety gates (all must pass to trigger):
 *   ✓ Riding mode is active (useSensorStore.status === 'riding')
 *   ✓ Calibration is valid (useCalibrationStore.isValid)
 *   ✓ Absolute accel floor met (> 15 m/s²)
 *   ✓ 2 consecutive anomalous windows
 *   ✓ Device still for 3+ consecutive windows (Stage 2)
 */
import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useSensorStore } from '@/store/sensorStore';
import { useCalibrationStore } from '@/store/calibrationStore';
import { useDetectionStore, type AnomalyLogEntry } from '@/store/detectionStore';
import { useAlarmStore } from '@/store/alarmStore';
import { useAuthStore } from '@/store/authStore';
import { runStage1, runStage2StillnessCheck, callMlService } from '@/services/crashDetector';

export function useCrashDetection() {
  const router = useRouter();
  const hasTriggeredRef = useRef(false); // Prevent double-trigger

  const { latestFeatures, status: rideStatus } = useSensorStore();
  const calibrationState = useCalibrationStore();
  const baselineValid = __DEV__ ? true : (calibrationState.userBaseline?.isValid ?? false);
  const { phase, processWindow, reportStillnessCheck, resetToNormal, addLogEntry } = useDetectionStore();
  const { startAlarm } = useAlarmStore();
  const { session } = useAuthStore();

  // ── Process each new feature window ────────────────────────────────────────

  useEffect(() => {
    if (!latestFeatures) return;
    if (rideStatus !== 'riding') return;
    if (!baselineValid) return;

    // Stage 1 — z-score detection
    const result = runStage1(latestFeatures);
    const newPhase = processWindow(latestFeatures, result);

    // Log anomaly events to in-memory ring buffer
    if (result.isAnomaly || newPhase !== 'NORMAL') {
      const entry: AnomalyLogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        features: latestFeatures,
        compositeZScore: result.compositeZScore,
        perFeatureZScores: result.perFeatureZScores,
        confidence: result.confidence,
        phase: newPhase,
        triggeredAlarm: false,
        reason: result.reason,
      };
      addLogEntry(entry);

      // Fire-and-forget ML service call (audit only — does not affect decision)
      if (session?.user.id) {
        void callMlService(session.user.id, latestFeatures);
      }
    }

    // Stage 2 — run stillness check whenever we ARE in or ENTERING STAGE2_CLASSIFYING
    // This is crucial: after the 2nd anomalous window, every subsequent window runs stage 2
    // until CRASH_CONFIRMED or FALSE_ALARM. Using both `phase` (existing) and `newPhase` covers:
    //   - Window that just entered STAGE2_CLASSIFYING (newPhase === 'STAGE2_CLASSIFYING')
    //   - All subsequent NORMAL-looking windows while still classifying (phase === 'STAGE2_CLASSIFYING')
    const isInStage2 = newPhase === 'STAGE2_CLASSIFYING' || phase === 'STAGE2_CLASSIFYING';
    if (isInStage2) {
      const isStill = runStage2StillnessCheck(latestFeatures);
      const nextPhase = reportStillnessCheck(isStill);

      if (nextPhase === 'CRASH_CONFIRMED' && !hasTriggeredRef.current) {
        hasTriggeredRef.current = true;

        // Trigger alarm (non-blocking)
        void startAlarm('auto_sensor').then(() => {
          router.push('/alarm');
          // Reset the guard after navigation
          setTimeout(() => { hasTriggeredRef.current = false; }, 30_000);
        });
      }
    }
  }, [latestFeatures, rideStatus, baselineValid]);

  // ── Reset detection when riding stops ──────────────────────────────────────

  useEffect(() => {
    if (rideStatus !== 'riding') {
      resetToNormal();
      hasTriggeredRef.current = false;
    }
  }, [rideStatus]);

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * manualTest — triggers a test alarm bypassing all detection gates.
   * For dev/QA use only (gated behind __DEV__).
   */
  const manualTest = useCallback(async () => {
    if (!__DEV__) return;
    if (hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;
    await startAlarm('manual_test');
    router.push('/alarm');
  }, [startAlarm, router]);

  return {
    detectionPhase: phase,
    isNormal: phase === 'NORMAL',
    isAnomalyStage1: phase === 'ANOMALY_STAGE1',
    isStage2Classifying: phase === 'STAGE2_CLASSIFYING',
    isCrashConfirmed: phase === 'CRASH_CONFIRMED',
    isFalseAlarm: phase === 'FALSE_ALARM',
    isDetectionEnabled: rideStatus === 'riding' && baselineValid,
    manualTest,
  };
}
