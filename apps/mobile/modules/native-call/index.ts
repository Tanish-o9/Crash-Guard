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
