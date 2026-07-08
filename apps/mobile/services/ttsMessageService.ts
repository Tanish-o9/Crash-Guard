/**
 * TTS Message Service — composes a calm, factual emergency message for the
 * dispatcher via Gemini, in the correct language for the rider's location.
 *
 * Language selection:
 *   1. Reverse-geocode the crash coordinates → get Indian state name
 *   2. Look up STATE_LANGUAGE_MAP → get priority language chain
 *   3. Use primary language as Gemini target
 *   4. Fallback: Hindi (hi)
 *
 * The generated message is ~25s spoken duration and includes:
 *   - Rider name, blood type, vehicle type
 *   - GPS coordinates + state
 *   - Severity estimate
 *   - Request for immediate assistance
 *
 * Graceful fallback: if Gemini fails, returns a template in English.
 */
import * as Location from 'expo-location';
import type { SupportedLanguage } from '@crashguard/types';
import {
  STATE_LANGUAGE_MAP,
  DEFAULT_LANGUAGE_CHAIN,
} from '@crashguard/constants';

// ─── Constants ────────────────────────────────────────────────────────────────

const GEMINI_API_KEY  = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: 'English',
  hi: 'Hindi',
  ta: 'Tamil',
  te: 'Telugu',
  kn: 'Kannada',
  ml: 'Malayalam',
  mr: 'Marathi',
  gu: 'Gujarati',
  bn: 'Bengali',
  pa: 'Punjabi',
  or: 'Odia',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TtsMessageParams {
  lat: number;
  lng: number;
  userName: string;
  bloodGroup?: string;
  vehicleType?: string;
  severity?: string;
}

export interface TtsMessageResult {
  message: string;
  language: SupportedLanguage;
  stateName: string | null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function reverseGeocodeState(lat: number, lng: number): Promise<string | null> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    return results[0]?.region ?? null;
  } catch {
    return null;
  }
}

function selectLanguage(stateName: string | null): SupportedLanguage {
  if (!stateName) return DEFAULT_LANGUAGE_CHAIN[0];
  const chain = STATE_LANGUAGE_MAP[stateName] ?? DEFAULT_LANGUAGE_CHAIN;
  return chain[0];
}

function buildFallbackMessage(params: TtsMessageParams, stateName: string | null): string {
  const { userName, bloodGroup, vehicleType, lat, lng, severity } = params;
  const loc = stateName ? `${stateName}, coordinates ${lat.toFixed(4)}, ${lng.toFixed(4)}` : `coordinates ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  return (
    `Emergency alert. A ${vehicleType ?? 'motorcycle'} rider named ${userName} has been in a crash near ${loc}. ` +
    `Blood type is ${bloodGroup ?? 'unknown'}. ` +
    (severity && severity !== 'unknown' ? `Estimated severity is ${severity}. ` : '') +
    `Please send immediate medical assistance.`
  );
}

async function callGemini(params: TtsMessageParams, language: SupportedLanguage, stateName: string | null): Promise<string> {
  const langName = LANGUAGE_NAMES[language] ?? 'Hindi';
  const { userName, bloodGroup, vehicleType, lat, lng, severity } = params;
  const locationStr = stateName
    ? `${stateName} (${lat.toFixed(4)}, ${lng.toFixed(4)})`
    : `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

  const prompt = `You are composing a calm, factual emergency spoken message for a dispatcher.
Write it in ${langName}. If not ${langName}, fall back to English.

Incident details:
- Rider name: ${userName}
- Vehicle: ${vehicleType ?? 'motorcycle'}
- Location: ${locationStr}
- Blood type: ${bloodGroup ?? 'unknown'}
- Severity estimate: ${severity ?? 'unknown'}

Requirements:
- Start with "Emergency alert" in ${langName}
- State the person's name, vehicle, and GPS location
- Mention blood type
- Request immediate ambulance assistance
- Be calm and factual
- Readable in approximately 25 seconds when spoken
- Return ONLY the message text, no explanation, no formatting`;

  const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
    }),
  });

  if (!response.ok) throw new Error(`Gemini ${response.status}`);
  const data = await response.json();
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text.trim()) throw new Error('Empty response');
  return text.trim();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const ttsMessageService = {
  async compose(params: TtsMessageParams): Promise<TtsMessageResult> {
    const stateName = await reverseGeocodeState(params.lat, params.lng);
    const language  = selectLanguage(stateName);

    if (GEMINI_API_KEY) {
      try {
        const message = await callGemini(params, language, stateName);
        return { message, language, stateName };
      } catch (err) {
        console.warn('[TTS] Gemini failed, using fallback:', err);
      }
    }

    // English fallback
    return {
      message: buildFallbackMessage(params, stateName),
      language: 'en',
      stateName,
    };
  },
};
