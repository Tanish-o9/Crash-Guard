/**
 * Language Service — resolves the spoken-language priority chain for a given
 * location, per the product rule: local state language → Hindi → English.
 *
 * The chain drives both the AI-composed dispatcher script and the TTS locale
 * used to speak each segment.
 */
import * as Location from 'expo-location';
import type { SupportedLanguage } from '@crashguard/types';
import { STATE_LANGUAGE_MAP, DEFAULT_LANGUAGE_CHAIN } from '@crashguard/constants';

/** BCP-47 locale tags for TTS, keyed by our language codes. */
const TTS_LOCALES: Record<string, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  kn: 'kn-IN',
  ml: 'ml-IN',
  mr: 'mr-IN',
  gu: 'gu-IN',
  bn: 'bn-IN',
  pa: 'pa-IN',
  or: 'or-IN',
};

export function ttsLocale(lang: string): string {
  return TTS_LOCALES[lang] ?? 'en-IN';
}

export async function reverseGeocodeState(lat: number, lng: number): Promise<string | null> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    return results[0]?.region ?? null;
  } catch {
    return null;
  }
}

/**
 * Build the ordered, de-duplicated language chain for a location.
 * Always guarantees Hindi and English are present as fallbacks.
 */
export function buildLanguageChain(stateName: string | null): SupportedLanguage[] {
  const base = (stateName && STATE_LANGUAGE_MAP[stateName]) || DEFAULT_LANGUAGE_CHAIN;
  const chain = [...base, 'hi', 'en'] as SupportedLanguage[];
  return chain.filter((l, i) => chain.indexOf(l) === i);
}

/** Convenience: reverse-geocode + build chain in one call. */
export async function languageChainForLocation(
  lat: number,
  lng: number,
): Promise<{ stateName: string | null; chain: SupportedLanguage[] }> {
  const stateName = await reverseGeocodeState(lat, lng);
  return { stateName, chain: buildLanguageChain(stateName) };
}
