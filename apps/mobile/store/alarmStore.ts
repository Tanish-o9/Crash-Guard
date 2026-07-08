/**
 * Alarm Store — state machine for the crash alarm + countdown flow.
 *
 * Phase transitions:
 *   idle
 *     → active       (alarm starts, countdown ticking)
 *     → cancel_reason (user tapped cancel during countdown)
 *     → escalating   (countdown hit 0 — calling flow starts; Part 8 hooks in here)
 *
 * Key design decisions:
 * - The 20s countdown is sacred — never shortened, only cancellable.
 * - Cancel reason capture is non-blocking (user can dismiss without selecting).
 * - Every state transition is logged to Supabase `incidents` table.
 * - incidentId is created at startAlarm() and threaded through all transitions.
 */
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useSensorStore } from '@/store/sensorStore';
import type { CancelReason, IncidentTriggerType } from '@crashguard/types';
import { ALARM_COUNTDOWN_SECONDS } from '@crashguard/constants';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AlarmPhase =
  | 'idle'           // Not active
  | 'active'         // Counting down
  | 'cancel_reason'  // User tapped cancel — asking why
  | 'escalating';    // Countdown hit 0 — initiating emergency call (Part 8)

interface AlarmState {
  phase: AlarmPhase;
  countdown: number;                     // seconds remaining (20 → 0)
  incidentId: string | null;
  triggerType: IncidentTriggerType;

  // Cancel flow
  cancelReason: CancelReason | null;
  cancelReasonNote: string;

  // Actions
  startAlarm: (triggerType: IncidentTriggerType) => Promise<void>;
  tick: () => void;
  cancelAlarm: () => void;
  setCancelReason: (reason: CancelReason) => void;
  setCancelReasonNote: (note: string) => void;
  submitCancelReason: () => Promise<void>;
  dismissCancelReason: () => void;
  escalate: () => Promise<void>;
  reset: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createIncidentRecord(
  userId: string,
  triggerType: IncidentTriggerType,
  lat: number | null,
  lng: number | null,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('incidents')
    .insert({
      user_id: userId,
      trigger_type: triggerType,
      lat: lat ?? 0,
      lng: lng ?? 0,
      status: 'alarm_active',
      called_emergency: false,
      contacts_notified: false,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[AlarmStore] Failed to create incident:', error.message);
    return null;
  }
  return data.id;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAlarmStore = create<AlarmState>((set, get) => ({
  phase: 'idle',
  countdown: ALARM_COUNTDOWN_SECONDS,
  incidentId: null,
  triggerType: 'auto_sensor',
  cancelReason: null,
  cancelReasonNote: '',

  startAlarm: async (triggerType) => {
    const userId = useAuthStore.getState().session?.user.id;
    const { currentLat, currentLng } = useSensorStore.getState();

    set({ phase: 'active', countdown: ALARM_COUNTDOWN_SECONDS, triggerType, cancelReason: null, cancelReasonNote: '' });

    // Log incident to DB (non-blocking — alarm starts immediately)
    if (userId) {
      const id = await createIncidentRecord(userId, triggerType, currentLat, currentLng);
      if (id) set({ incidentId: id });
    }
  },

  tick: () => {
    const { countdown, phase } = get();
    if (phase !== 'active') return;
    if (countdown <= 1) {
      get().escalate();
    } else {
      set({ countdown: countdown - 1 });
    }
  },

  cancelAlarm: () => {
    set({ phase: 'cancel_reason' });
  },

  setCancelReason: (cancelReason) => set({ cancelReason }),
  setCancelReasonNote: (cancelReasonNote) => set({ cancelReasonNote }),

  submitCancelReason: async () => {
    const { incidentId, cancelReason, cancelReasonNote } = get();
    set({ phase: 'idle' });

    if (!incidentId) return;

    await supabase
      .from('incidents')
      .update({
        status: 'cancelled',
        cancel_reason: cancelReason ?? 'im_fine',
        cancel_reason_note: cancelReasonNote || null,
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', incidentId);
  },

  dismissCancelReason: () => {
    // User dismissed without selecting a reason — still counts as cancelled
    const { incidentId } = get();
    set({ phase: 'idle' });
    if (incidentId) {
      void supabase
        .from('incidents')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', incidentId);
    }
  },

  escalate: async () => {
    const { incidentId } = get();
    set({ phase: 'escalating', countdown: 0 });

    if (incidentId) {
      await supabase
        .from('incidents')
        .update({ status: 'auto_called', called_emergency: true, called_emergency_at: new Date().toISOString() })
        .eq('id', incidentId);
    }
    // Part 8 emergency calling engine hooks in here
  },

  reset: () =>
    set({
      phase: 'idle',
      countdown: ALARM_COUNTDOWN_SECONDS,
      incidentId: null,
      triggerType: 'auto_sensor',
      cancelReason: null,
      cancelReasonNote: '',
    }),
}));
