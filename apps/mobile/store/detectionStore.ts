/**
 * Detection Store — the Stage 1 + Stage 2 crash detection state machine.
 *
 * State flow:
 *
 *   NORMAL
 *     ↓ Stage 1: composite z-score > threshold AND absolute floor met
 *   ANOMALY_STAGE1
 *     ↓ Stage 1 fires 2 consecutive windows (hysteresis — reduces false positives)
 *   STAGE2_CLASSIFYING
 *     ↓ Stage 2: device is still (speed < 2 km/h AND accel variance near zero) for 5+ seconds
 *   CRASH_CONFIRMED   → triggers alarm
 *     OR
 *   FALSE_ALARM       → back to NORMAL (log for model feedback)
 *
 * Design constraints (from spec):
 * - No LLM in the decision path — fully deterministic z-score math
 * - Personal calibration required — detection disabled without valid baseline
 * - Conservative bias — require 2 consecutive anomalous windows to advance
 * - "No LLM in safety-critical decision loop" — Python service is called for
 *   logging/validation but the MOBILE DECISION is the authoritative one.
 */
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import type { SensorFeatures } from '@crashguard/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DetectionPhase =
  | 'NORMAL'              // No anomaly — baseline riding
  | 'ANOMALY_STAGE1'      // 1 anomalous window detected — waiting for confirmation
  | 'STAGE2_CLASSIFYING'  // 2nd consecutive window anomalous — checking stillness
  | 'CRASH_CONFIRMED'     // Stage 2 passed — crash confirmed → alarm
  | 'FALSE_ALARM';        // Stage 2 negative — device is moving → reset

export interface DetectionResult {
  isAnomaly: boolean;
  compositeZScore: number;
  perFeatureZScores: Partial<Record<keyof SensorFeatures, number>>;
  confidence: number;
  reason: string;
}

export interface AnomalyLogEntry {
  id: string;
  timestamp: number;
  features: SensorFeatures;
  compositeZScore: number;
  perFeatureZScores: Partial<Record<keyof SensorFeatures, number>>;
  confidence: number;
  phase: DetectionPhase;
  triggeredAlarm: boolean;
  reason: string;
}

interface DetectionState {
  phase: DetectionPhase;
  consecutiveAnomalyCount: number;   // Resets to 0 on any NORMAL window
  lastAnomalyResult: DetectionResult | null;
  lastAnomalyFeatures: SensorFeatures | null;

  // Stage 2 stillness monitoring
  stage2StartTime: number | null;
  stage2StillWindowCount: number;

  // Anomaly log (in-memory ring buffer, 200 entries)
  anomalyLog: AnomalyLogEntry[];

  // Actions
  processWindow: (features: SensorFeatures, result: DetectionResult) => DetectionPhase;
  reportStillnessCheck: (isStill: boolean) => DetectionPhase;
  resetToNormal: () => void;
  addLogEntry: (entry: AnomalyLogEntry) => void;
  clearLog: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CONSECUTIVE_WINDOWS_REQUIRED = 2;   // hysteresis
const STAGE2_STILL_WINDOWS_REQUIRED = 3;  // ~6 seconds of stillness at 2s windows
const MAX_LOG_ENTRIES = 200;

// ─── Store ────────────────────────────────────────────────────────────────────

export const useDetectionStore = create<DetectionState>((set, get) => ({
  phase: 'NORMAL',
  consecutiveAnomalyCount: 0,
  lastAnomalyResult: null,
  lastAnomalyFeatures: null,
  stage2StartTime: null,
  stage2StillWindowCount: 0,
  anomalyLog: [],

  processWindow: (features, result): DetectionPhase => {
    const { phase, consecutiveAnomalyCount } = get();

    // If calibration not valid — always NORMAL (safety constraint)
    if (!result.isAnomaly) {
      if (phase === 'NORMAL' || phase === 'FALSE_ALARM') {
        // Clean window — keep/reset to NORMAL
        set({ phase: 'NORMAL', consecutiveAnomalyCount: 0, lastAnomalyResult: null });
        return 'NORMAL';
      }
      // Anomaly chain broken — reset
      set({ phase: 'NORMAL', consecutiveAnomalyCount: 0 });
      return 'NORMAL';
    }

    // Anomalous window
    const newCount = consecutiveAnomalyCount + 1;
    set({ consecutiveAnomalyCount: newCount, lastAnomalyResult: result, lastAnomalyFeatures: features });

    if (newCount < CONSECUTIVE_WINDOWS_REQUIRED) {
      // First anomalous window — wait for confirmation
      set({ phase: 'ANOMALY_STAGE1' });
      return 'ANOMALY_STAGE1';
    }

    // Second consecutive anomalous window → advance to Stage 2
    set({
      phase: 'STAGE2_CLASSIFYING',
      stage2StartTime: Date.now(),
      stage2StillWindowCount: 0,
    });

    // Log to Supabase (async, non-blocking)
    void logAnomalyToSupabase(features, result, 'STAGE2_CLASSIFYING');

    return 'STAGE2_CLASSIFYING';
  },

  reportStillnessCheck: (isStill): DetectionPhase => {
    const { stage2StillWindowCount, lastAnomalyResult, lastAnomalyFeatures } = get();

    if (!isStill) {
      // Device is moving — false alarm
      set({ phase: 'FALSE_ALARM', stage2StillWindowCount: 0, consecutiveAnomalyCount: 0 });
      if (lastAnomalyFeatures && lastAnomalyResult) {
        void logAnomalyToSupabase(lastAnomalyFeatures, lastAnomalyResult, 'FALSE_ALARM');
      }
      // Auto-reset to NORMAL after brief hold
      setTimeout(() => {
        get().resetToNormal();
      }, 3_000);
      return 'FALSE_ALARM';
    }

    const newCount = stage2StillWindowCount + 1;
    set({ stage2StillWindowCount: newCount });

    if (newCount >= STAGE2_STILL_WINDOWS_REQUIRED) {
      // Crash confirmed!
      set({ phase: 'CRASH_CONFIRMED', consecutiveAnomalyCount: 0 });
      if (lastAnomalyFeatures && lastAnomalyResult) {
        void logAnomalyToSupabase(lastAnomalyFeatures, lastAnomalyResult, 'CRASH_CONFIRMED');
      }
      return 'CRASH_CONFIRMED';
    }

    // Still collecting stillness windows
    return 'STAGE2_CLASSIFYING';
  },

  resetToNormal: () =>
    set({
      phase: 'NORMAL',
      consecutiveAnomalyCount: 0,
      lastAnomalyResult: null,
      lastAnomalyFeatures: null,
      stage2StartTime: null,
      stage2StillWindowCount: 0,
    }),

  addLogEntry: (entry) =>
    set((s) => ({
      anomalyLog: [...s.anomalyLog.slice(-MAX_LOG_ENTRIES + 1), entry],
    })),

  clearLog: () => set({ anomalyLog: [] }),
}));

// ─── Supabase logging helper ───────────────────────────────────────────────────

async function logAnomalyToSupabase(
  features: SensorFeatures,
  result: DetectionResult,
  phase: DetectionPhase,
): Promise<void> {
  const userId = useAuthStore.getState().session?.user.id;
  if (!userId) return;

  await supabase.from('anomaly_events').insert({
    user_id: userId,
    timestamp: new Date().toISOString(),
    features: features as unknown as Record<string, number>,
    composite_z_score: result.compositeZScore,
    confidence: result.confidence,
    detection_phase: phase,
    triggered_alarm: phase === 'CRASH_CONFIRMED',
    reason: result.reason,
  });
}
