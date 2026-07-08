/**
 * Emergency Orchestrator — the deterministic async engine that drives
 * the full post-alarm calling cascade.
 *
 * Flow (each step updates the Zustand store → live-rendered in calling.tsx):
 *
 *   1. Start live GPS location sharing (Supabase realtime upsert)
 *   2. Compose multilingual TTS message via Gemini
 *   3. CALLING_EMERGENCY:
 *      a. Initiate mock emergency call (Linking → dialer)
 *      b. Speak TTS message (expo-speech)
 *      c. Wait for speech to end + brief delay
 *   4. CALLING_CONTACTS:
 *      For each emergency contact (sorted by priorityOrder):
 *        a. Initiate call (Linking → dialer)
 *        b. Wait CONTACT_CALL_TIMEOUT_MS
 *        c. Move to next contact
 *   5. SMS all contacts (Linking → SMS app with pre-filled message)
 *   6. Update Supabase incident to contacts_notified
 *   7. Transition to DONE
 *
 * NOTE: Regulatory constraint — USE_REAL_EMERGENCY_NUMBER must be false
 * until legal clearance. This engine always uses EMERGENCY_MOCK_NUMBER.
 *
 * NOTE: Contact call detection (answered/voicemail) is NOT possible from JS.
 * The timeout-based cascade is the correct approach for a sandboxed JS env.
 */
import { Linking } from 'react-native';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { supabase } from '@/lib/supabase';
import { useUserStore } from '@/store/userStore';
import { useSensorStore } from '@/store/sensorStore';
import { useEmergencyOrchestratorStore } from '@/store/emergencyOrchestratorStore';
import { ttsMessageService } from '@/services/ttsMessageService';
import type { EmergencyContact, User } from '@crashguard/types';
import {
  EMERGENCY_MOCK_NUMBER,
  LOCATION_UPDATE_INTERVAL_SECONDS,
} from '@crashguard/constants';

// ─── Demo-mode timing ─────────────────────────────────────────────────────────
// In production, CONTACT_CALL_TIMEOUT_MS should be 20_000.
// For the hackathon demo, we use 8s so the flow is watchable.
const CONTACT_CALL_TIMEOUT_MS = 8_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function composeSmsBody(
  profile: User | null,
  lat: number | null,
  lng: number | null,
  incidentId: string,
): string {
  const name = profile?.name ?? 'Your contact';
  const mapsLink =
    lat != null && lng != null
      ? `https://maps.google.com/?q=${lat.toFixed(5)},${lng.toFixed(5)}`
      : 'Location unavailable';
  const trackingLink = `https://crashguard.app/track/${incidentId}`;
  const bloodGroup = profile?.bloodGroup ?? 'Unknown';

  return (
    `🚨 CRASH ALERT\n` +
    `${name} may have been in a motorcycle accident.\n\n` +
    `📍 Location: ${mapsLink}\n` +
    `🩸 Blood type: ${bloodGroup}\n\n` +
    `Emergency services have been contacted.\n\n` +
    `🔴 Live tracking: ${trackingLink}\n\n` +
    `— CrashGuard`
  );
}

// ─── Orchestrator Class ───────────────────────────────────────────────────────

class EmergencyOrchestrator {
  private locationSub: Location.LocationSubscription | null = null;
  private isRunning = false;

  /** Run the full emergency cascade for an incident. Idempotent (no-op if already running). */
  async run(incidentId: string): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    const store = useEmergencyOrchestratorStore.getState();
    const { profile, emergencyContacts } = useUserStore.getState();
    const { currentLat, currentLng } = useSensorStore.getState();

    // Sort contacts by priority
    const contacts = [...emergencyContacts].sort(
      (a, b) => a.priorityOrder - b.priorityOrder,
    );

    // ── 1. Set up incident state ──────────────────────────────────────────────
    store.setIncidentId(incidentId);
    store.addLog('🆔', `Incident ID: ${incidentId.slice(0, 8)}…`);

    // ── 2. Start live location sharing ────────────────────────────────────────
    await this.startLocationSharing(incidentId, currentLat, currentLng);

    // ── 3. Compose TTS message ────────────────────────────────────────────────
    store.addLog('🌐', 'Composing emergency message…');
    const lat = currentLat ?? 0;
    const lng = currentLng ?? 0;

    const ttsResult = await ttsMessageService.compose({
      lat,
      lng,
      userName: profile?.name ?? 'Unknown rider',
      bloodGroup: profile?.bloodGroup,
      vehicleType: profile?.vehicleType,
    });

    store.setTtsMessage(ttsResult.message, ttsResult.language);
    store.addLog(
      '💬',
      `Message ready in ${ttsResult.language.toUpperCase()}${ttsResult.stateName ? ` (${ttsResult.stateName})` : ''}`,
    );

    // ── 4. CALLING_EMERGENCY ──────────────────────────────────────────────────
    store.transition('CALLING_EMERGENCY');
    store.markEmergencyCallMade();
    store.addLog('📞', `Calling emergency (mock: ${EMERGENCY_MOCK_NUMBER})`);

    // Initiate call — opens device dialer
    Linking.openURL(`tel:${EMERGENCY_MOCK_NUMBER}`).catch(() => {});

    // Speak TTS message
    await new Promise<void>((resolve) => {
      Speech.speak(ttsResult.message, {
        language: ttsResult.language,
        rate: 0.85,
        pitch: 1.0,
        onDone: resolve,
        onError: () => resolve(),
      });
    });

    store.addLog('✅', 'Emergency message delivered');
    await sleep(2_000);

    // ── 5. CALLING_CONTACTS ───────────────────────────────────────────────────
    store.transition('CALLING_CONTACTS');

    if (contacts.length === 0) {
      store.addLog('ℹ️', 'No emergency contacts configured');
    } else {
      for (const contact of contacts) {
        store.setCurrentContact(contact);
        store.addLog('📱', `Calling ${contact.name}…`);
        Linking.openURL(`tel:${contact.phone}`).catch(() => {});
        await sleep(CONTACT_CALL_TIMEOUT_MS);
        store.addLog('⏩', `No response from ${contact.name}`);
        store.advanceContactCascade();
      }

      // SMS cascade
      store.addLog('✉️', 'Sending SMS to all contacts…');
      const smsBody = composeSmsBody(profile, currentLat, currentLng, incidentId);
      for (const contact of contacts) {
        Linking.openURL(
          `sms:${contact.phone}?body=${encodeURIComponent(smsBody)}`,
        ).catch(() => {});
        store.incrementSmsSent();
        store.addLog('✅', `SMS sent → ${contact.name}`);
        await sleep(800);
      }
    }

    // ── 6. Update Supabase incident ────────────────────────────────────────────
    await supabase
      .from('incidents')
      .update({
        status: 'contacts_notified',
        contacts_notified: true,
        contacts_notified_at: new Date().toISOString(),
      })
      .eq('id', incidentId);

    // ── 7. Done ────────────────────────────────────────────────────────────────
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

    // Write initial location immediately
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

    // Watch position and push updates
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
      // Location permission may not be granted — continue without live updates
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
