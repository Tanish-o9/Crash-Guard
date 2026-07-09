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
import { placeCall, setSpeakerphone } from '@/modules/native-call';
import { speakInCall, stopInCall } from '@/modules/native-tts';
import { agentService, type ScriptSegment } from '@/services/agentService';
import { languageChainForLocation, ttsLocale } from '@/services/languageService';
import type { EmergencyContact, User } from '@crashguard/types';
import {
  LOCATION_UPDATE_INTERVAL_SECONDS,
  EMERGENCY_MOCK_NUMBER,
  EMERGENCY_AMBULANCE_NUMBER,
  USE_REAL_EMERGENCY_NUMBER,
} from '@crashguard/constants';

/** Seconds to wait after dialing before enabling speakerphone + speaking (call must connect first). */
const CALL_CONNECT_WAIT_SECONDS = 6;

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

/**
 * Deterministic fallback dispatcher script (used when the AI backend is
 * unreachable). Produces a Hindi + English segment — the two guaranteed
 * fallback languages — so the dispatcher path never depends on the network.
 */
function buildFallbackSegments(
  profile: User | null,
  lat: number,
  lng: number,
): ScriptSegment[] {
  const name = profile?.name ?? 'the rider';
  const blood = profile?.bloodGroup ?? 'unknown';
  const loc = `latitude ${lat.toFixed(4)}, longitude ${lng.toFixed(4)}`;
  return [
    {
      lang: 'hi',
      text:
        `Namaste. Yah CrashGuard se automatic emergency alert hai. ` +
        `${name} ka motorcycle accident hua hai aur unhe turant madad chahiye. ` +
        `Location ${loc} hai. Blood group ${blood} hai. Kripya turant ambulance bhejein.`,
    },
    {
      lang: 'en',
      text:
        `Hello. This is an automatic emergency alert from CrashGuard. ` +
        `${name} has been in a motorcycle accident and needs immediate help. ` +
        `The location is ${loc}. Blood group is ${blood}. Please send an ambulance immediately.`,
    },
  ];
}

/**
 * Speak an ordered list of script segments on the VOICE-CALL stream so a live
 * dispatcher hears them (acoustic bridge). Repeated `repeats` times because we
 * cannot detect when the callee actually answers an outbound call.
 */
async function speakSegments(
  segments: ScriptSegment[],
  log: (icon: string, msg: string) => void,
  repeats = 2,
): Promise<void> {
  for (let pass = 0; pass < repeats; pass++) {
    for (const seg of segments) {
      log('🗣️', `Speaking (${seg.lang})${repeats > 1 ? ` [${pass + 1}/${repeats}]` : ''}…`);
      await speakInCall(seg.text, ttsLocale(seg.lang));
      await sleep(600);
    }
  }
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

    const lat = currentLat ?? 0;
    const lng = currentLng ?? 0;
    const log = (icon: string, msg: string) => store.addLog(icon, msg);

    // Load contacts. If the in-memory list is empty (e.g. the user profile hasn't
    // hydrated yet this session), fetch them directly from Supabase so the AI
    // relative call is never silently skipped.
    let sourceContacts: EmergencyContact[] = emergencyContacts;
    if (sourceContacts.length === 0) {
      sourceContacts = await this.fetchContacts();
      if (sourceContacts.length > 0) {
        log('🔄', `Loaded ${sourceContacts.length} contact(s) from server`);
      }
    }
    const contacts = [...sourceContacts].sort(
      (a, b) => ((a as any).priority_order ?? a.priorityOrder ?? 0) - ((b as any).priority_order ?? b.priorityOrder ?? 0),
    );

    // ── 1. Set up incident ───────────────────────────────────────────────────
    store.setIncidentId(incidentId);
    log('🆔', `Incident ID: ${incidentId.slice(0, 8)}…`);
    log('👥', `${contacts.length} emergency contact(s) configured`);

    // ── 2. Start live location sharing ───────────────────────────────────────
    await this.startLocationSharing(incidentId, currentLat, currentLng);

    // ── 3. Resolve spoken-language chain for this location ────────────────────
    // local state language → Hindi → English (guaranteed fallbacks).
    let languages: string[] = ['hi', 'en'];
    try {
      const { stateName, chain } = await languageChainForLocation(lat, lng);
      languages = chain;
      if (stateName) log('🌐', `Location: ${stateName} • languages: ${chain.join(' → ')}`);
    } catch {
      // keep default hi → en
    }

    // ── 4. STEP 1: CALL EMERGENCY / AMBULANCE FIRST ──────────────────────────
    // Per product spec the first call goes to emergency services, then relatives.
    // Real 112/108 stays gated behind USE_REAL_EMERGENCY_NUMBER (mock until legal
    // clearance) — see CONTEXT (2).md.
    store.transition('CALLING_EMERGENCY');
    store.markEmergencyCallMade();

    const emergencyNumber = USE_REAL_EMERGENCY_NUMBER
      ? EMERGENCY_AMBULANCE_NUMBER
      : EMERGENCY_MOCK_NUMBER;

    // Compose the dispatcher script via the AI agent, falling back to a local template.
    let segments = await agentService.getDispatcherScript({
      languages,
      lat,
      lng,
      riderName: profile?.name ?? null,
      bloodGroup: profile?.bloodGroup ?? null,
      isSamaritan: false,
    });
    if (!segments || segments.length === 0) {
      log('📝', 'AI backend unreachable — using offline script template');
      segments = buildFallbackSegments(profile, lat, lng);
    } else {
      log('🤖', 'AI-composed dispatcher script ready');
    }
    store.setTtsMessage(segments.map((s) => s.text).join('\n\n'), (segments[0]?.lang ?? 'en') as any);

    log('📞', `Auto-calling emergency services (${emergencyNumber})…`);
    try {
      await placeCall(emergencyNumber);
      log('✅', 'Emergency call placed');
    } catch (e: any) {
      log('⚠️', `Emergency call failed: ${e.message || 'Unknown error'}`);
    }

    // Speak the dispatcher script LOCALLY as ambient audio. This is fire-and-forget
    // on purpose: it cannot reach the dispatcher over a cellular call (OS block), and
    // — critically — must NEVER block the relative notification below. If on-device
    // TTS stalls, the cascade still proceeds.
    const speakSegmentsSnapshot = segments;
    void (async () => {
      await sleep(CALL_CONNECT_WAIT_SECONDS * 1000);
      log('🔊', 'Enabling speakerphone (acoustic bridge)…');
      await setSpeakerphone(true);
      await speakSegments(speakSegmentsSnapshot, log, 1);
      await setSpeakerphone(false);
    })();

    // ── 5. STEP 2: NOTIFY RELATIVES (SMS all + AI voice call) ────────────────
    // Runs immediately — does NOT wait for the local speech above.
    store.transition('CALLING_CONTACTS');
    if (contacts.length === 0) {
      log('⚠️', 'No emergency contacts — AI relative call SKIPPED. Add a contact in Settings → Emergency Contacts.');
    } else {
      log('👥', `Notifying ${contacts.length} emergency contact(s) — primary: ${contacts[0].name}`);
      // Compose the relative SMS via the AI agent (calm/reassuring), fall back to template.
      const relative = await agentService.getRelativeMessage({
        riderName: profile?.name ?? null,
        lat,
        lng,
        bloodGroup: profile?.bloodGroup ?? null,
        language: languages[0],
      });
      const smsBody = relative?.message ?? composeSmsBody(profile, currentLat, currentLng);

      log('✉️', 'Sending emergency SMS to all contacts (native)…');
      for (const contact of contacts) {
        const phone = normalizePhone(contact.phone);
        store.setCurrentContact(contact);
        try {
          await sendSilentSms(phone, smsBody);
          log('✅', `SMS sent → ${contact.name} (${phone})`);
        } catch (e: any) {
          log('⚠️', `SMS failed → ${contact.name}: ${e.message || 'Unknown error'}`);
        }
      }

      // Call the first (highest-priority) emergency contact with an AI voice
      // message. The phone can't put AI audio on a cellular call, so this call is
      // placed from the cloud (Twilio) via the agent backend. If that's
      // unavailable, fall back to a plain dial from the phone's own SIM.
      const primaryContact = contacts[0];
      const primaryPhone = normalizePhone(primaryContact.phone);
      store.setCurrentContact(primaryContact);
      log('📞', `Calling ${primaryContact.name} with AI voice message…`);

      const callResult = await agentService.callRelative({
        to: primaryPhone,
        riderName: profile?.name ?? null,
        lat,
        lng,
        bloodGroup: profile?.bloodGroup ?? null,
      });

      const okStatuses = ['queued', 'ringing', 'in-progress', 'initiated'];
      if (callResult && okStatuses.includes(callResult.status)) {
        log('✅', `AI voice call placed via Twilio → ${primaryContact.name} (from cloud, ${callResult.modelUsed})`);
      } else if (callResult?.error) {
        // Do NOT dial a relative from the rider's SIM — relatives are reached via the
        // cloud AI call or the SMS already sent above. The phone only dials emergency.
        log('⚠️', `AI relative call failed: ${callResult.error}. Relatives were notified by SMS.`);
      } else {
        log('⚠️', 'AI relative call unavailable (agent unreachable). Relatives were notified by SMS.');
      }
      store.advanceContactCascade();
    }

    // ── 6. Update Supabase incident ──────────────────────────────────────────
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

  /** Fetch emergency contacts straight from Supabase (fallback when the store is empty). */
  private async fetchContacts(): Promise<EmergencyContact[]> {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase
        .from('emergency_contacts')
        .select('*')
        .eq('user_id', user.id)
        .order('priority_order');
      return (data ?? []).map((c: any) => ({
        name: c.name,
        phone: c.phone,
        priorityOrder: c.priority_order ?? 1,
      })) as EmergencyContact[];
    } catch {
      return [];
    }
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
    stopInCall();
    Speech.stop();
    void setSpeakerphone(false);
  }
}

export const emergencyOrchestrator = new EmergencyOrchestrator();
