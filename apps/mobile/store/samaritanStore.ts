/**
 * Samaritan Store — state machine for the Good Samaritan multi-step flow.
 *
 * Steps:
 *   0  LANDING      — "I've witnessed an accident"
 *   1  DESCRIBE     — Free-text description + can-transport checkbox
 *   2  LOCATING     — GPS acquisition (auto)
 *   3  ANALYZING    — Gemini NLP analysis (spinner)
 *   4  CONFIRM      — Review all info before calling
 *   5  CALLING      — Animated calling / TTS playback
 *   6  HOSPITAL     — Nearby hospitals (only if canTransport = true)
 *   7  DONE         — Thank you + tracking link
 */
import { create } from 'zustand';
import type { Hospital, SamaritanReport } from '@crashguard/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NlpResult {
  severity: 'low' | 'medium' | 'high' | 'unknown';
  estimatedVictims: number;
  vehicleTypes: string[];
  summary: string;
}

export type SamaritanStep =
  | 'landing'
  | 'describe'
  | 'locating'
  | 'analyzing'
  | 'confirm'
  | 'calling'
  | 'hospital'
  | 'done';

const STEP_ORDER: SamaritanStep[] = [
  'landing',
  'describe',
  'locating',
  'analyzing',
  'confirm',
  'calling',
  'hospital',
  'done',
];

interface SamaritanState {
  step: SamaritanStep;

  // Inputs
  description: string;
  canTransport: boolean;

  // Location
  lat: number | null;
  lng: number | null;
  address: string | null;

  // NLP
  nlpResult: NlpResult | null;

  // Output
  reportId: string | null;
  trackingLink: string | null;

  // Hospitals
  hospitals: Hospital[];
  selectedHospital: Hospital | null;

  // Loading / error
  isLoading: boolean;
  error: string | null;

  // Actions
  goTo: (step: SamaritanStep) => void;
  next: () => void;
  setDescription: (desc: string) => void;
  setCanTransport: (value: boolean) => void;
  setLocation: (lat: number, lng: number, address: string) => void;
  setNlpResult: (result: NlpResult) => void;
  setReport: (reportId: string, trackingLink: string) => void;
  setHospitals: (hospitals: Hospital[]) => void;
  selectHospital: (hospital: Hospital) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const INITIAL: Pick<
  SamaritanState,
  | 'step'
  | 'description'
  | 'canTransport'
  | 'lat'
  | 'lng'
  | 'address'
  | 'nlpResult'
  | 'reportId'
  | 'trackingLink'
  | 'hospitals'
  | 'selectedHospital'
  | 'isLoading'
  | 'error'
> = {
  step: 'landing',
  description: '',
  canTransport: false,
  lat: null,
  lng: null,
  address: null,
  nlpResult: null,
  reportId: null,
  trackingLink: null,
  hospitals: [],
  selectedHospital: null,
  isLoading: false,
  error: null,
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSamaritanStore = create<SamaritanState>((set, get) => ({
  ...INITIAL,

  goTo: (step) => set({ step }),

  next: () => {
    const { step, canTransport } = get();
    const idx = STEP_ORDER.indexOf(step);
    if (idx === -1) return;

    let nextStep = STEP_ORDER[idx + 1];
    // Skip hospital step if user cannot transport
    if (nextStep === 'hospital' && !canTransport) {
      nextStep = 'done';
    }
    if (nextStep) set({ step: nextStep });
  },

  setDescription: (description) => set({ description }),
  setCanTransport: (canTransport) => set({ canTransport }),
  setLocation: (lat, lng, address) => set({ lat, lng, address }),
  setNlpResult: (nlpResult) => set({ nlpResult }),
  setReport: (reportId, trackingLink) => set({ reportId, trackingLink }),
  setHospitals: (hospitals) => set({ hospitals }),
  selectHospital: (selectedHospital) => set({ selectedHospital }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  reset: () => set(INITIAL),
}));
