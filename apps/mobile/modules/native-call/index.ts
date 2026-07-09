import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

const NativeCall = Platform.OS === 'android' ? requireNativeModule('NativeCall') : null;

/**
 * Place a phone call silently using Android's native ACTION_CALL intent.
 * No user interaction needed — call is placed immediately in the background.
 * 
 * @param phone - Phone number (e.g., +917859901142)
 * @returns true if call was initiated successfully
 * @throws Error if permission denied or call failed
 */
export async function placeCall(phone: string): Promise<boolean> {
  if (!NativeCall) {
    console.warn('[NativeCall] Not available on this platform');
    return false;
  }
  return NativeCall.placeCall(phone);
}

/**
 * Check if CALL_PHONE permission is currently granted.
 */
export function hasCallPermission(): boolean {
  if (!NativeCall) return false;
  return NativeCall.hasPermission();
}

/**
 * Route the active call audio to the loudspeaker (or back) — the "acoustic bridge".
 * With speakerphone on, TTS played through the speaker is picked up by the phone's
 * mic and transmitted into the call so the dispatcher/relative hears the message.
 *
 * @param enable - true to force loudspeaker, false to restore
 */
export async function setSpeakerphone(enable: boolean): Promise<boolean> {
  if (!NativeCall) return false;
  try {
    return await NativeCall.setSpeakerphone(enable);
  } catch (e) {
    console.warn('[NativeCall] setSpeakerphone failed:', e);
    return false;
  }
}
