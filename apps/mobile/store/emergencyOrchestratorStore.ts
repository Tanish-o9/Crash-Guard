/**
 * Emergency Orchestrator Store — the central state machine for the post-alarm
 * calling and contact-cascade flow.
 *
 * Every transition is timestamped and logged to Supabase incidents table.
 *
 * State flow:
 *   CALLING_EMERGENCY  → Initiating emergency (mock) call + TTS
 *   CALLING_CONTACTS   → Sequential contact cascade
 *   DONE               → All contacts notified, incident complete
 *   CANCELLED          → User/system cancelled before DONE
 *
 * This store is read by calling.tsx which renders the live timeline.
 */
import { create } from 'zustand';
import type { EmergencyContact, EmergencyState } from '@crashguard/types';

// ─── Status log entry (for calling screen timeline) ─────────────────────────

export interface StatusLogEntry {
  timestamp: number;   // Date.now()
  icon: string;
  message: string;
}

// ─── Store ───────────────────────────────────────────────────────────────────

interface EmergencyOrchestratorState {
  machineState: EmergencyState;
  incidentId: string | null;
  trackingLink: string | null;

  // TTS
  ttsMessage: string | null;
  ttsLanguage: string | null;

  // Contact cascade
  contactCascadeIndex: number;
  currentContact: EmergencyContact | null;
  smsSentCount: number;

  // Flags
  emergencyCallMade: boolean;

  // Live location (for display on calling screen)
  currentLat: number | null;
  currentLng: number | null;

  // Real-time timeline feed
  statusLog: StatusLogEntry[];

  // Actions
  transition: (state: EmergencyState) => void;
  setIncidentId: (id: string) => void;
  setTrackingLink: (link: string) => void;
  setTtsMessage: (msg: string, lang: string) => void;
  setCurrentContact: (contact: EmergencyContact | null) => void;
  advanceContactCascade: () => void;
  markEmergencyCallMade: () => void;
  incrementSmsSent: () => void;
  setCurrentLocation: (lat: number, lng: number) => void;
  addLog: (icon: string, message: string) => void;
  reset: () => void;
}

const INITIAL: Omit<EmergencyOrchestratorState, keyof { transition: unknown; setIncidentId: unknown; setTrackingLink: unknown; setTtsMessage: unknown; setCurrentContact: unknown; advanceContactCascade: unknown; markEmergencyCallMade: unknown; incrementSmsSent: unknown; setCurrentLocation: unknown; addLog: unknown; reset: unknown }> = {
  machineState: 'IDLE',
  incidentId: null,
  trackingLink: null,
  ttsMessage: null,
  ttsLanguage: null,
  contactCascadeIndex: 0,
  currentContact: null,
  smsSentCount: 0,
  emergencyCallMade: false,
  currentLat: null,
  currentLng: null,
  statusLog: [],
};

export const useEmergencyOrchestratorStore = create<EmergencyOrchestratorState>((set, get) => ({
  machineState: 'IDLE',
  incidentId: null,
  trackingLink: null,
  ttsMessage: null,
  ttsLanguage: null,
  contactCascadeIndex: 0,
  currentContact: null,
  smsSentCount: 0,
  emergencyCallMade: false,
  currentLat: null,
  currentLng: null,
  statusLog: [],

  transition: (machineState) => {
    set({ machineState });
  },

  setIncidentId: (incidentId) => {
    const trackingLink = `https://crashguard.app/track/${incidentId}`;
    set({ incidentId, trackingLink });
  },

  setTrackingLink: (trackingLink) => set({ trackingLink }),

  setTtsMessage: (ttsMessage, ttsLanguage) => set({ ttsMessage, ttsLanguage }),

  setCurrentContact: (currentContact) => set({ currentContact }),

  advanceContactCascade: () =>
    set((s) => ({ contactCascadeIndex: s.contactCascadeIndex + 1, currentContact: null })),

  markEmergencyCallMade: () => set({ emergencyCallMade: true }),

  incrementSmsSent: () => set((s) => ({ smsSentCount: s.smsSentCount + 1 })),

  setCurrentLocation: (currentLat, currentLng) => set({ currentLat, currentLng }),

  addLog: (icon, message) =>
    set((s) => ({
      statusLog: [
        ...s.statusLog,
        { timestamp: Date.now(), icon, message },
      ],
    })),

  reset: () => set({
    machineState: 'IDLE',
    incidentId: null,
    trackingLink: null,
    ttsMessage: null,
    ttsLanguage: null,
    contactCascadeIndex: 0,
    currentContact: null,
    smsSentCount: 0,
    emergencyCallMade: false,
    currentLat: null,
    currentLng: null,
    statusLog: [],
  }),
}));
