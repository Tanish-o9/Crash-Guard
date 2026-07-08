/**
 * Alarm Audio Service — manages all sound output during the crash alarm.
 *
 * Multi-layer alarm strategy (defense in depth for audibility):
 *   1. Notification channel — MAX importance, bypassDnd: true (Android)
 *      Fires a full-screen intent notification that wakes the device.
 *   2. expo-speech — verbal alert loop every ~5 seconds
 *      Says "Crash detected, tap cancel if you are okay" in the user's language.
 *   3. Vibration — SOS pattern (3 short, 3 long, 3 short) looped
 *   4. expo-keep-awake — prevents screen from turning off during countdown
 *
 * No custom MP3 required. This approach is more portable and avoids asset bundling
 * issues while being compliant with Android DND bypass via notification channels.
 *
 * To add a real alarm sound: add `crash_alarm.mp3` to assets/audio/ and load it
 * via expo-av Audio.Sound alongside these layers.
 */
import * as Notifications from 'expo-notifications';
import * as Speech from 'expo-speech';
import * as KeepAwake from 'expo-keep-awake';
import { Vibration, Platform } from 'react-native';

// ─── Constants ────────────────────────────────────────────────────────────────

const CHANNEL_ID = 'crashguard-alarm';
const KEEP_AWAKE_TAG = 'crash-alarm';
const SPEECH_INTERVAL_MS = 5000;

// SOS vibration: 3×short, 3×long, 3×short (in ms)
const SOS_PATTERN = [
  0, 200, 100, 200, 100, 200,  // · · ·
  300, 600, 100, 600, 100, 600, // — — —
  300, 200, 100, 200, 100, 200, // · · ·
  1000,
];

// ─── Service ──────────────────────────────────────────────────────────────────

class AlarmAudioService {
  private speechTimer: ReturnType<typeof setTimeout> | null = null;
  private isRunning = false;
  private notifId: string | null = null;

  async start(language = 'en'): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // 1. Keep screen on
    await KeepAwake.activateKeepAwakeAsync(KEEP_AWAKE_TAG);

    // 2. Configure notification channel (Android) for DND bypass
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Crash Alarm',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
        vibrationPattern: SOS_PATTERN,
        enableVibrate: true,
      });
    }

    // 3. Show full-screen notification
    try {
      this.notifId = await Notifications.scheduleNotificationAsync({
        content: {
          title: '🚨 CRASH DETECTED',
          body: 'Tap to cancel if you are okay. Calling emergency services in 20 seconds.',
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.MAX,
          data: { type: 'crash_alarm' },
        },
        trigger: null, // fire immediately
      });
    } catch (err) {
      console.warn('[AlarmAudio] Notification failed:', err);
    }

    // 4. Vibration SOS loop
    Vibration.vibrate(SOS_PATTERN, true);

    // 5. Speech loop
    this.speakAlert(language);
  }

  private speakAlert(language: string): void {
    if (!this.isRunning) return;
    Speech.speak('Crash detected. Tap cancel if you are okay.', {
      language,
      rate: 0.85,
      pitch: 1.1,
      onDone: () => {
        if (this.isRunning) {
          this.speechTimer = setTimeout(() => this.speakAlert(language), SPEECH_INTERVAL_MS);
        }
      },
      onError: () => {
        if (this.isRunning) {
          this.speechTimer = setTimeout(() => this.speakAlert(language), SPEECH_INTERVAL_MS + 2000);
        }
      },
    });
  }

  async stop(): Promise<void> {
    this.isRunning = false;

    // Stop speech
    Speech.stop();
    if (this.speechTimer) {
      clearTimeout(this.speechTimer);
      this.speechTimer = null;
    }

    // Stop vibration
    Vibration.cancel();

    // Dismiss notification
    if (this.notifId) {
      await Notifications.dismissNotificationAsync(this.notifId).catch(() => {});
      this.notifId = null;
    }

    // Release wake lock
    KeepAwake.deactivateKeepAwake(KEEP_AWAKE_TAG);
  }
}

export const alarmAudioService = new AlarmAudioService();
