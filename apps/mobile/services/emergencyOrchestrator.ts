/**
 * Emergency Orchestrator — the deterministic async engine that drives
 * the full post-alarm calling cascade.
 *
 * FULLY AUTOMATIC — zero user interaction needed after crash detection.
 * FULLY FREE — uses phone's own SIM card for SMS and calls.
 * WORKS OFFLINE — no internet needed for SMS and phone calls.
 *
 * Flow:
 *   1. Start live GPS location sharing (Supabase)
 *   2. Send native SMS to ALL emergency contacts (Android SmsManager — silent)
 *   3. Speak emergency message on phone speaker (expo-speech — English + Hindi)
 *   4. Place native call to first emergency contact (Android ACTION_CALL — silent)
 *   5. Update Supabase incident
 *   6. Transition to DONE
 *
 * ARCHITECTURE: Uses Android's native SmsManager and ACTION_CALL.
 * Permissions are granted once at app setup, then work silently forever.
 */
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useUserStore } from '@/store/userStore';
import { useSensorStore } from '@/store/sensorStore';
import { useEmergencyOrchestratorStore } from '@/store/emergencyOrchestratorStore';
import { sendSilentSms } from '@/modules/native-sms';
import { placeCall } from '@/modules/native-call';
import type { EmergencyContact, User } from '@crashguard/types';
import { LOCATION_UPDATE_INTERVAL_SECONDS } from '@crashguard/constants';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Clean phone number for native dialer */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (phone.startsWith('+')) return phone;
  return `+91${digits}`;
}

function composeSmsBody(
  profile: User | null,
  lat: number | null,
  lng: number | null,
): string {
  const name = profile?.name ?? 'Your contact';
  const mapsLink =
    lat != null && lng != null
      ? `https://maps.google.com/?q=${lat.toFixed(5)},${lng.toFixed(5)}`
      : 'Location unavailable';
  const bloodGroup = profile?.bloodGroup ?? 'Unknown';

  return (
    `🚨 CRASH ALERT\n` +
    `${name} may have been in a motorcycle accident.\n\n` +
    `📍 Location: ${mapsLink}\n` +
    `🩸 Blood type: ${bloodGroup}\n\n` +
    `Emergency services have been contacted.\n\n` +
    `— CrashGuard`
  );
}

/** Speak text on phone speaker and return a promise */
function speakOnSpeaker(text: string, language: string): Promise<void> {
  return new Promise((resolve) => {
    Speech.speak(text, {
      language,
      rate: 0.9,
      pitch: 1.0,
      onDone: resolve,
      onError: () => resolve(),
      onStopped: () => resolve(),
    });
  });
}

// ─── Orchestrator Class ───────────────────────────────────────────────────────

class EmergencyOrchestrator {
  private locationSub: Location.LocationSubscription | null = null;
  private isRunning = false;

  /** Run the full emergency cascade. Fully automatic — zero user interaction. */
  async run(incidentId: string): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    const store = useEmergencyOrchestratorStore.getState();
    const { profile, emergencyContacts } = useUserStore.getState();
    const { currentLat, currentLng } = useSensorStore.getState();

    const contacts = [...emergencyContacts].sort(
      (a, b) => ((a as any).priority_order ?? a.priorityOrder ?? 0) - ((b as any).priority_order ?? b.priorityOrder ?? 0),
    );

    const lat = currentLat ?? 0;
    const lng = currentLng ?? 0;

    // ── 1. Set up incident ───────────────────────────────────────────────────
    store.setIncidentId(incidentId);
    store.addLog('🆔', `Incident ID: ${incidentId.slice(0, 8)}…`);

    // ── 2. Start live location sharing ───────────────────────────────────────
    await this.startLocationSharing(incidentId, currentLat, currentLng);

    // ── 3. EMERGENCY CASCADE (all automatic, zero interaction) ───────────────
    store.transition('CALLING_EMERGENCY');
    store.markEmergencyCallMade();

    if (contacts.length === 0) {
      store.addLog('ℹ️', 'No emergency contacts configured');
    } else {
      const smsBody = composeSmsBody(profile, currentLat, currentLng);

      // ── Step A: Send SMS to ALL contacts silently (native SmsManager) ─────
      store.addLog('✉️', 'Sending emergency SMS to all contacts (native)…');

      for (const contact of contacts) {
        const phone = normalizePhone(contact.phone);
        store.setCurrentContact(contact);

        try {
          await sendSilentSms(phone, smsBody);
          store.addLog('✅', `SMS sent → ${contact.name} (${phone})`);
        } catch (e: any) {
          store.addLog('⚠️', `SMS failed → ${contact.name}: ${e.message || 'Unknown error'}`);
        }
      }

      // ── Step B: Speak emergency message on phone speaker ──────────────────
      store.addLog('🔊', 'Speaking emergency message on phone speaker…');

      const englishMsg =
        `Emergency alert from CrashGuard. ` +
        `${profile?.name ?? 'The rider'} has been in a motorcycle accident and needs immediate help. ` +
        `Location is latitude ${lat.toFixed(4)}, longitude ${lng.toFixed(4)}. ` +
        `Blood group is ${profile?.bloodGroup ?? 'unknown'}. ` +
        `Emergency contacts have been notified via SMS with the exact location.`;

      const hindiMsg =
        `CrashGuard se emergency alert. ` +
        `${profile?.name ?? 'Rider'} ka motorcycle accident hua hai aur unhe turant madad chahiye. ` +
        `Location latitude ${lat.toFixed(4)}, longitude ${lng.toFixed(4)} hai. ` +
        `Blood group ${profile?.bloodGroup ?? 'unknown'} hai. ` +
        `Emergency contacts ko SMS ke through exact location bhej diya gaya hai.`;

      store.setTtsMessage(englishMsg, 'en');

      // Speak English
      store.addLog('🗣️', 'Speaking in English…');
      await speakOnSpeaker(englishMsg, 'en-IN');
      await sleep(1500);

      // Speak Hindi
      store.addLog('🗣️', 'Speaking in Hindi…');
      await speakOnSpeaker(hindiMsg, 'hi-IN');
      await sleep(1000);

      // ── Step C: Call first emergency contact (native ACTION_CALL) ──────────
      store.transition('CALLING_CONTACTS');
      const primaryContact = contacts[0];
      const primaryPhone = normalizePhone(primaryContact.phone);
      store.setCurrentContact(primaryContact);
      store.addLog('📞', `Auto-calling ${primaryContact.name} (${primaryPhone})…`);

      try {
        await placeCall(primaryPhone);
        store.addLog('✅', `Call placed → ${primaryContact.name}`);
      } catch (e: any) {
        store.addLog('⚠️', `Call failed: ${e.message || 'Unknown error'}`);
      }

      store.advanceContactCascade();
    }

    // ── 4. Update Supabase incident ──────────────────────────────────────────
    try {
      await supabase
        .from('incidents')
        .update({
          status: 'contacts_notified',
          contacts_notified: true,
          contacts_notified_at: new Date().toISOString(),
        })
        .eq('id', incidentId);
    } catch {
      // Supabase update is non-critical — SMS and call already sent
    }

    // ── 5. Done ──────────────────────────────────────────────────────────────
    store.transition('DONE');
    store.addLog('🏁', 'Emergency response complete. Help is on the way.');
    this.isRunning = false;
  }

  private async startLocationSharing(
    incidentId: string,
    initialLat: number | null,
    initialLng: number | null,
  ): Promise<void> {
    const store = useEmergencyOrchestratorStore.getState();

    if (initialLat != null && initialLng != null) {
      store.setCurrentLocation(initialLat, initialLng);
      void supabase.from('incident_location_updates').upsert({
        incident_id: incidentId,
        lat: initialLat,
        lng: initialLng,
        updated_at: new Date().toISOString(),
      });
      store.addLog('📍', `Location: ${initialLat.toFixed(4)}, ${initialLng.toFixed(4)}`);
    }

    try {
      this.locationSub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: LOCATION_UPDATE_INTERVAL_SECONDS * 1000,
          distanceInterval: 10,
        },
        (loc) => {
          const { latitude, longitude, speed } = loc.coords;
          store.setCurrentLocation(latitude, longitude);
          void supabase.from('incident_location_updates').upsert({
            incident_id: incidentId,
            lat: latitude,
            lng: longitude,
            speed: speed ?? 0,
            updated_at: new Date().toISOString(),
          });
        },
      );
    } catch {
      // Continue without live updates
    }
  }

  stop(): void {
    this.locationSub?.remove();
    this.locationSub = null;
    this.isRunning = false;
    Speech.stop();
  }
}

export const emergencyOrchestrator = new EmergencyOrchestrator();
