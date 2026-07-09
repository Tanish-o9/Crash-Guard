import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

const NativeSms = Platform.OS === 'android' ? requireNativeModule('NativeSms') : null;

/**
 * Send an SMS silently using Android's native SmsManager.
 * No user interaction needed — message is sent in the background.
 * Works without internet — uses the phone's SIM card.
 * 
 * @param phone - Phone number in E.164 format (e.g., +917859901142)
 * @param message - SMS body text
 * @returns true if sent successfully
 * @throws Error if permission denied or SMS failed
 */
export async function sendSilentSms(phone: string, message: string): Promise<boolean> {
  if (!NativeSms) {
    console.warn('[NativeSms] Not available on this platform');
    return false;
  }
  return NativeSms.sendSilentSms(phone, message);
}

/**
 * Check if SEND_SMS permission is currently granted.
 */
export function hasSmsPermission(): boolean {
  if (!NativeSms) return false;
  return NativeSms.hasPermission();
}
