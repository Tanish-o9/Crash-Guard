/**
 * Agent Service — mobile client for the CrashGuard Python AI-agent backend
 * (services/agent, FastAPI + Amazon Bedrock Nova Pro).
 *
 * Every method returns null on any failure (network down, backend unreachable,
 * timeout). Callers MUST have a local fallback so the emergency path never
 * depends on this backend being reachable — the backend is an enhancement, not a
 * dependency.
 */
import type { NlpResult } from '@/store/samaritanStore';
import type { Hospital } from '@crashguard/types';

const AGENT_URL = process.env.EXPO_PUBLIC_AGENT_SERVICE_URL ?? 'http://localhost:8100';

/** Spoken-message segment: text in one language to be TTS'd with that locale. */
export interface ScriptSegment {
  lang: string;
  text: string;
}

async function postJson<T>(path: string, body: unknown, timeoutMs = 6000): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${AGENT_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Agent ${path} → ${res.status}`);
    return (await res.json()) as T;
  } catch (e) {
    console.warn(`[AgentService] ${path} failed:`, e);
    return null;
  }
}

async function getJson<T>(path: string, timeoutMs = 8000): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${AGENT_URL}${path}`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Agent ${path} → ${res.status}`);
    return (await res.json()) as T;
  } catch (e) {
    console.warn(`[AgentService] ${path} failed:`, e);
    return null;
  }
}

export interface DispatcherParams {
  languages: string[];
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  riderName?: string | null;
  bloodGroup?: string | null;
  severity?: string | null;
  victims?: number | null;
  summary?: string | null;
  isSamaritan?: boolean;
}

export const agentService = {
  /** Compose the spoken dispatcher script (one segment per language, in order). */
  async getDispatcherScript(p: DispatcherParams): Promise<ScriptSegment[] | null> {
    const data = await postJson<{ segments: ScriptSegment[]; model_used: string }>(
      '/agent/dispatcher-script/',
      {
        languages: p.languages,
        lat: p.lat ?? null,
        lng: p.lng ?? null,
        address: p.address ?? null,
        rider_name: p.riderName ?? null,
        blood_group: p.bloodGroup ?? null,
        severity: p.severity ?? null,
        victims: p.victims ?? null,
        summary: p.summary ?? null,
        is_samaritan: p.isSamaritan ?? false,
      },
    );
    return data?.segments ?? null;
  },

  /** Bystander free-text → structured incident info. Replaces the old Gemini call. */
  async analyzeIncident(description: string): Promise<NlpResult | null> {
    const data = await postJson<{
      severity: NlpResult['severity'];
      estimated_victims: number;
      vehicle_types: string[];
      summary: string;
    }>('/agent/samaritan-intake/', { description }, 12000);
    if (!data) return null;
    return {
      severity: data.severity,
      estimatedVictims: data.estimated_victims,
      vehicleTypes: data.vehicle_types,
      summary: data.summary,
    };
  },

  /** Compose a calm SMS/spoken message for an emergency contact. */
  async getRelativeMessage(p: {
    riderName?: string | null;
    contactName?: string | null;
    lat?: number | null;
    lng?: number | null;
    bloodGroup?: string | null;
    language?: string;
  }): Promise<{ message: string; mapsLink: string | null } | null> {
    const data = await postJson<{ message: string; maps_link: string | null }>(
      '/agent/relative-message/',
      {
        rider_name: p.riderName ?? null,
        contact_name: p.contactName ?? null,
        lat: p.lat ?? null,
        lng: p.lng ?? null,
        blood_group: p.bloodGroup ?? null,
        language: p.language ?? 'en',
      },
    );
    if (!data) return null;
    return { message: data.message, mapsLink: data.maps_link };
  },

  /**
   * Place a REAL AI-voice phone call to a relative via the backend's Twilio
   * integration (the phone itself cannot put AI audio on a cellular call).
   * Returns the call status, or null if the backend is unreachable.
   */
  async callRelative(p: {
    to: string;
    riderName?: string | null;
    lat?: number | null;
    lng?: number | null;
    bloodGroup?: string | null;
  }): Promise<{
    sid: string | null;
    status: string;
    modelUsed: string;
    error?: string;
  } | null> {
    // Uses a direct fetch (not postJson) so we can surface Twilio's error detail
    // — e.g. "trial accounts may only call verified numbers" — in the status log.
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(`${AGENT_URL}/call/relative`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: p.to,
          rider_name: p.riderName ?? null,
          lat: p.lat ?? null,
          lng: p.lng ?? null,
          blood_group: p.bloodGroup ?? null,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { sid: null, status: 'failed', modelUsed: '', error: String(body?.detail ?? res.status) };
      }
      return { sid: body.sid, status: body.status, modelUsed: body.model_used };
    } catch (e: any) {
      console.warn('[AgentService] /call/relative unreachable:', e);
      return null; // backend unreachable → caller falls back to native dial
    }
  },

  /** Nearest hospitals via the backend's server-side Amazon Location lookup. */
  async getNearbyHospitals(lat: number, lng: number): Promise<Hospital[] | null> {
    const data = await getJson<
      Array<{
        place_id: string;
        name: string;
        address?: string;
        lat: number;
        lng: number;
        distance_km: number;
        phone?: string;
      }>
    >(`/hospital/nearby?lat=${lat}&lng=${lng}`);
    if (!data) return null;
    return data.map((h) => ({
      placeId: h.place_id,
      name: h.name,
      address: h.address ?? '',
      lat: h.lat,
      lng: h.lng,
      distanceKm: h.distance_km,
      phoneNumber: h.phone,
    }));
  },

  /** Fetch a hospital's dialable phone number via Amazon Location GetPlace. */
  async getHospitalDetails(placeId: string): Promise<{ placeId: string; phone: string | null } | null> {
    const data = await getJson<{ place_id: string; phone: string | null }>(
      `/hospital/details?place_id=${encodeURIComponent(placeId)}`,
    );
    if (!data) return null;
    return { placeId: data.place_id, phone: data.phone };
  },

  /**
   * Place a REAL AI-voice pre-alert call to a hospital via Twilio (samaritan
   * "I have a vehicle" flow). Returns call status, or null if backend unreachable.
   */
  async callHospital(p: {
    to: string;
    hospitalName?: string | null;
    victims?: number;
    severity?: string | null;
    etaMinutes?: number | null;
    summary?: string | null;
    lat?: number | null;
    lng?: number | null;
  }): Promise<{ sid: string | null; status: string; modelUsed: string; error?: string } | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(`${AGENT_URL}/call/hospital`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: p.to,
          hospital_name: p.hospitalName ?? null,
          victims: p.victims ?? 1,
          severity: p.severity ?? null,
          eta_minutes: p.etaMinutes ?? null,
          summary: p.summary ?? null,
          lat: p.lat ?? null,
          lng: p.lng ?? null,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return { sid: null, status: 'failed', modelUsed: '', error: String(body?.detail ?? res.status) };
      return { sid: body.sid, status: body.status, modelUsed: body.model_used };
    } catch (e) {
      console.warn('[AgentService] /call/hospital unreachable:', e);
      return null;
    }
  },

  /** Generate an underwriter-style natural-language summary of the risk profile. */
  async getRiskSummary(p: {
    score: number;
    tier: string;
    factors: { label: string; score: number; detail?: string }[];
    ridingMinutes: number;
    incidents: number;
    dataPoints: number;
  }): Promise<string | null> {
    const data = await postJson<{ summary: string; model_used: string }>(
      '/agent/risk-summary/',
      {
        score: p.score,
        tier: p.tier,
        factors: p.factors.map((f) => ({ label: f.label, score: f.score, detail: f.detail ?? null })),
        riding_minutes: p.ridingMinutes,
        incidents: p.incidents,
        data_points: p.dataPoints,
      },
      12000,
    );
    return data?.summary ?? null;
  },

  /** Compose the spoken hospital pre-alert (one segment per language). */
  async getHospitalPrealert(p: {
    hospitalName?: string | null;
    victims?: number;
    severity?: string | null;
    etaMinutes?: number | null;
    summary?: string | null;
    languages?: string[];
  }): Promise<ScriptSegment[] | null> {
    const data = await postJson<{ segments: ScriptSegment[]; model_used: string }>(
      '/hospital/prealert',
      {
        hospital_name: p.hospitalName ?? null,
        victims: p.victims ?? 1,
        severity: p.severity ?? null,
        eta_minutes: p.etaMinutes ?? null,
        summary: p.summary ?? null,
        languages: p.languages ?? ['hi', 'en'],
      },
    );
    return data?.segments ?? null;
  },
};
