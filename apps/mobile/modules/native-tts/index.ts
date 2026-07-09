import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import * as Speech from 'expo-speech';

const NativeTts =
  Platform.OS === 'android' ? requireOptionalNativeModule('NativeTts') : null;

/**
 * Speak text so it is audible on an active phone call (the acoustic bridge).
 *
 * On Android it routes through the native TTS engine on the VOICE_CALL stream,
 * which emits during a live call (unlike media-stream TTS, which the OS mutes
 * mid-call). Falls back to expo-speech (media stream) when the native module
 * isn't available — e.g. before the app has been rebuilt, or on iOS.
 */
export async function speakInCall(
  text: string,
  language: string,
  timeoutMs = 15000,
): Promise<void> {
  const speak = (async () => {
    if (NativeTts) {
      try {
        await NativeTts.speakInCall(text, language);
        return;
      } catch (e) {
        console.warn('[NativeTts] speakInCall failed, falling back to expo-speech:', e);
      }
    }
    await new Promise<void>((resolve) => {
      Speech.speak(text, {
        language,
        rate: 0.9,
        onDone: () => resolve(),
        onError: () => resolve(),
        onStopped: () => resolve(),
      });
    });
  })();

  // Hard timeout so a stalled TTS engine (e.g. missing on-device voice, no onDone
  // callback) can NEVER hang the emergency cascade.
  await Promise.race([
    speak,
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

/** Stop any in-progress in-call speech. */
export function stopInCall(): void {
  try {
    NativeTts?.stop?.();
  } catch {
    // ignore
  }
  Speech.stop();
}

/** True when the native voice-call TTS path is available (Android, rebuilt app). */
export const hasNativeInCallTts = !!NativeTts;
