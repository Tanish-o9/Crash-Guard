/**
 * useAlarm — hook managing the alarm countdown lifecycle.
 *
 * Responsibilities:
 *   - Starts/stops the 1-second interval ticker when phase = 'active'
 *   - Starts/stops the AlarmAudioService in sync with phase changes
 *   - Exposes a clean API to the alarm screen (start, cancel, escalation path)
 *   - Triggers navigation to /(tabs) when alarm resolves (Part 8 will navigate
 *     to a calling screen instead of home when escalating)
 *
 * Voice cancel (7.3):
 *   Full @react-native-voice/voice STT integration requires a native build.
 *   For the hackathon, we implement the screen-tap path (primary path per spec)
 *   and expose a `triggerVoiceCancel` method that can be wired to STT results
 *   when the native module is added. The alarm screen shows a "voice listening"
 *   badge as a UI affordance even in the fallback mode.
 */
import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useAlarmStore } from '@/store/alarmStore';
import { alarmAudioService } from '@/services/alarmAudioService';
import type { CancelReason, IncidentTriggerType } from '@crashguard/types';
import { VOICE_CANCEL_KEYWORDS } from '@crashguard/constants';

export function useAlarm() {
  const router = useRouter();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const {
    phase,
    countdown,
    cancelReason,
    cancelReasonNote,
    startAlarm: storeStart,
    tick,
    cancelAlarm,
    setCancelReason,
    setCancelReasonNote,
    submitCancelReason,
    dismissCancelReason,
    escalate,
    reset,
  } = useAlarmStore();

  // ── Countdown ticker ────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase === 'active') {
      intervalRef.current = setInterval(() => {
        tick();
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [phase]);

  // ── Audio lifecycle ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase === 'active') {
      alarmAudioService.start();
    } else {
      alarmAudioService.stop();
    }
  }, [phase]);

  // ── Escalation navigation (Part 8) ───────────────────────────────────────────

  useEffect(() => {
    if (phase === 'escalating') {
      // Navigate to the calling screen — orchestrator starts there
      router.push('/calling');
    }
  }, [phase]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      alarmAudioService.stop();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // ── Public API ──────────────────────────────────────────────────────────────

  const start = useCallback(async (triggerType: IncidentTriggerType = 'manual_test') => {
    await storeStart(triggerType);
  }, [storeStart]);

  const handleCancel = useCallback(() => {
    cancelAlarm();
  }, [cancelAlarm]);

  const handleSubmitReason = useCallback(async () => {
    await submitCancelReason();
    router.back();
  }, [submitCancelReason, router]);

  const handleDismissReason = useCallback(() => {
    dismissCancelReason();
    router.back();
  }, [dismissCancelReason, router]);

  /**
   * Voice cancel — call this with the transcript text from STT.
   * Checks if any VOICE_CANCEL_KEYWORDS appear in the transcription.
   * Wire to @react-native-voice/voice onSpeechResults in a future build.
   */
  const triggerVoiceCancel = useCallback((transcript: string) => {
    const lower = transcript.toLowerCase();
    const matched = VOICE_CANCEL_KEYWORDS.some(kw => lower.includes(kw));
    if (matched) {
      cancelAlarm();
    }
  }, [cancelAlarm]);

  return {
    // State
    phase,
    countdown,
    isActive: phase === 'active',
    isCancelReasonPhase: phase === 'cancel_reason',
    isEscalating: phase === 'escalating',
    cancelReason,
    cancelReasonNote,

    // Actions
    start,
    handleCancel,
    setCancelReason,
    setCancelReasonNote,
    handleSubmitReason,
    handleDismissReason,
    triggerVoiceCancel,
    reset,
  };
}
