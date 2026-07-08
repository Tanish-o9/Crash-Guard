/**
 * Gemini Service — calls the Gemini REST API to extract structured data from
 * a bystander's natural-language accident description.
 *
 * Uses gemini-1.5-flash (fast, cheap, good at structured extraction).
 *
 * For the hackathon: API key read from EXPO_PUBLIC_GEMINI_API_KEY env var.
 * In production: move to backend to protect the key.
 *
 * Falls back to a mock result if the API call fails (keeps demo resilient).
 */
import type { NlpResult } from '@/store/samaritanStore';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

const SYSTEM_PROMPT = `You are an emergency dispatch assistant. Analyze the accident description and extract structured information.
Return ONLY valid JSON with this exact shape:
{
  "severity": "low" | "medium" | "high" | "unknown",
  "estimatedVictims": <number, 1 if unclear>,
  "vehicleTypes": [<string array of vehicles mentioned>],
  "summary": "<one calm sentence summarizing the incident for a dispatcher>"
}`;

const MOCK_RESULT: NlpResult = {
  severity: 'medium',
  estimatedVictims: 1,
  vehicleTypes: ['motorcycle'],
  summary: 'One rider involved in a road accident. Appears to be conscious.',
};

export async function analyzeIncidentDescription(description: string): Promise<NlpResult> {
  if (!description.trim()) return MOCK_RESULT;

  // If no API key configured, return mock immediately
  if (!GEMINI_API_KEY) {
    console.warn('[GeminiService] No API key — returning mock result');
    return MOCK_RESULT;
  }

  try {
    const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: `${SYSTEM_PROMPT}\n\nAccident description: "${description}"` },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 256,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    const text: string =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';

    const parsed = JSON.parse(text);

    return {
      severity: ['low', 'medium', 'high'].includes(parsed.severity)
        ? parsed.severity
        : 'unknown',
      estimatedVictims: Number(parsed.estimatedVictims) || 1,
      vehicleTypes: Array.isArray(parsed.vehicleTypes)
        ? parsed.vehicleTypes.map(String)
        : ['motorcycle'],
      summary: typeof parsed.summary === 'string' ? parsed.summary : MOCK_RESULT.summary,
    };
  } catch (err) {
    console.warn('[GeminiService] Analysis failed, using mock:', err);
    return MOCK_RESULT;
  }
}
