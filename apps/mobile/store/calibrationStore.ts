/**
 * Calibration Store — persists the per-user sensor baseline and its in-memory
 * accumulators across the app lifecycle.
 *
 * State machine:
 *   'none'         → no baseline exists yet (fresh install)
 *   'calibrating'  → actively collecting windows for cold-start
 *   'valid'        → baseline is ready, anomaly detection enabled
 *   'updating'     → ongoing EMA updates (background, while valid)
 *   'reset'        → user reset, awaiting new calibration ride
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import type { UserBaseline, SensorFeatures } from '@crashguard/types';
import { MIN_BASELINE_SAMPLES } from '@crashguard/constants';
import {
  type MutableBaseline,
  type WelfordAccumulator,
  emptyMutableBaseline,
  emptyWelfordAccumulator,
  ingestWindow,
  toUserBaseline,
  fromUserBaseline,
  calibrationProgress,
  calibrationETA,
} from '@/services/calibrationService';

// ─── Constants ────────────────────────────────────────────────────────────────

const ASYNC_STORAGE_KEY = 'crashguard_baseline_v1';
/** Persist to Supabase every N windows during calibration to avoid data loss */
const PERSIST_EVERY_N_WINDOWS = 20;

// ─── Types ────────────────────────────────────────────────────────────────────

type CalibrationStatus = 'none' | 'calibrating' | 'valid' | 'updating' | 'reset';

interface CalibrationState {
  status: CalibrationStatus;
  baseline: MutableBaseline;
  accumulator: WelfordAccumulator;

  // Derived display values (updated when baseline changes)
  progressFraction: number;  // 0–1
  etaString: string;         // "~3 min left" | "Done"

  // Loaded DB record (used by anomaly detector)
  userBaseline: UserBaseline | null;

  isSaving: boolean;
  lastSavedAt: number | null;
  error: string | null;

  // Actions
  ingestWindow: (features: SensorFeatures) => void;
  loadBaseline: () => Promise<void>;
  persistBaseline: (force?: boolean) => Promise<void>;
  resetBaseline: () => Promise<void>;
  setStatus: (status: CalibrationStatus) => void;
  clearError: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useCalibrationStore = create<CalibrationState>((set, get) => ({
  status: 'none',
  baseline: emptyMutableBaseline(),
  accumulator: emptyWelfordAccumulator(),
  progressFraction: 0,
  etaString: calibrationETA(0),
  userBaseline: null,
  isSaving: false,
  lastSavedAt: null,
  error: null,

  ingestWindow: (features) => {
    const { baseline, accumulator, status } = get();

    // Don't ingest if not actively calibrating
    if (status !== 'calibrating' && status !== 'valid' && status !== 'updating') return;

    const { baseline: newBaseline, accumulator: newAcc } = ingestWindow(
      features,
      baseline,
      accumulator
    );

    const newCount = newBaseline.sampleCount;
    const isNowValid = newCount >= MIN_BASELINE_SAMPLES;

    set({
      baseline: newBaseline,
      accumulator: newAcc,
      status: isNowValid
        ? baseline.sampleCount >= MIN_BASELINE_SAMPLES
          ? 'updating'   // was already valid → ongoing update
          : 'valid'      // just crossed threshold → newly valid
        : 'calibrating',
      progressFraction: calibrationProgress(newCount),
      etaString: calibrationETA(newCount),
    });

    // Periodic persistence
    if (newCount % PERSIST_EVERY_N_WINDOWS === 0) {
      get().persistBaseline();
    }
  },

  loadBaseline: async () => {
    const userId = useAuthStore.getState().session?.user.id;
    if (!userId) return;

    try {
      // Try local cache first for fast startup
      const cached = await AsyncStorage.getItem(ASYNC_STORAGE_KEY);
      if (cached) {
        const parsed: UserBaseline = JSON.parse(cached);
        if (parsed.userId === userId) {
          const mutable = fromUserBaseline(parsed);
          set({
            baseline: mutable,
            accumulator: emptyWelfordAccumulator(),
            userBaseline: parsed,
            status: parsed.isValid ? 'valid' : 'calibrating',
            progressFraction: calibrationProgress(parsed.sampleCount),
            etaString: calibrationETA(parsed.sampleCount),
          });
        }
      }

      // Also fetch from Supabase (may be newer if user switched devices)
      const { data, error } = await supabase
        .from('user_baselines')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows

      if (data) {
        const serverBaseline: UserBaseline = {
          id: data.id,
          userId: data.user_id,
          featureMeans: data.feature_means,
          featureStds: data.feature_stds,
          sampleCount: data.sample_count,
          updatedAt: data.updated_at,
          isValid: data.is_valid,
        };

        // Use whichever has more samples (server or cache)
        const current = get().userBaseline;
        if (!current || serverBaseline.sampleCount >= current.sampleCount) {
          const mutable = fromUserBaseline(serverBaseline);
          set({
            baseline: mutable,
            userBaseline: serverBaseline,
            status: serverBaseline.isValid ? 'valid' : 'calibrating',
            progressFraction: calibrationProgress(serverBaseline.sampleCount),
            etaString: calibrationETA(serverBaseline.sampleCount),
          });
          // Update local cache
          await AsyncStorage.setItem(ASYNC_STORAGE_KEY, JSON.stringify(serverBaseline));
        }
      } else if (!cached) {
        // No baseline anywhere — fresh calibration needed
        set({ status: 'none' });
      }
    } catch (err: any) {
      set({ error: `Failed to load baseline: ${err.message}` });
    }
  },

  persistBaseline: async (force = false) => {
    const { baseline, isSaving, lastSavedAt, status } = get();
    if (isSaving) return;

    // Throttle: don't save more than once per 30s unless forced
    if (!force && lastSavedAt && Date.now() - lastSavedAt < 30_000) return;

    const userId = useAuthStore.getState().session?.user.id;
    if (!userId) return;

    set({ isSaving: true, error: null });
    try {
      const dbBaseline = toUserBaseline(userId, baseline);
      const now = new Date().toISOString();

      const { error } = await supabase.from('user_baselines').upsert({
        user_id: userId,
        feature_means: dbBaseline.featureMeans,
        feature_stds: dbBaseline.featureStds,
        sample_count: dbBaseline.sampleCount,
        is_valid: dbBaseline.isValid,
        updated_at: now,
      }, { onConflict: 'user_id' });

      if (error) throw error;

      const fullRecord: UserBaseline = {
        ...dbBaseline,
        id: userId, // placeholder
        updatedAt: now,
      };

      // Cache locally
      await AsyncStorage.setItem(ASYNC_STORAGE_KEY, JSON.stringify(fullRecord));
      set({ userBaseline: fullRecord, lastSavedAt: Date.now() });
    } catch (err: any) {
      set({ error: `Failed to save baseline: ${err.message}` });
    } finally {
      set({ isSaving: false });
    }
  },

  resetBaseline: async () => {
    const userId = useAuthStore.getState().session?.user.id;
    if (!userId) return;

    set({
      status: 'reset',
      baseline: emptyMutableBaseline(),
      accumulator: emptyWelfordAccumulator(),
      userBaseline: null,
      progressFraction: 0,
      etaString: calibrationETA(0),
      error: null,
    });

    try {
      await AsyncStorage.removeItem(ASYNC_STORAGE_KEY);
      await supabase.from('user_baselines').delete().eq('user_id', userId);
    } catch (err: any) {
      set({ error: `Failed to reset baseline: ${err.message}` });
    }
  },

  setStatus: (status) => set({ status }),
  clearError: () => set({ error: null }),
}));
