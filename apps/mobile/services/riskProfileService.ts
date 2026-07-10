/**
 * Risk Profile Service — computes a telematics-style driving-risk / safety score
 * from the rider's own sensor history in Supabase.
 *
 * This powers the (B2B) risk-profile page: a "credit score for driving" derived
 * from how the rider actually rides — harsh braking/acceleration, sharp cornering,
 * night riding, anomaly/near-miss rate and confirmed incidents.
 *
 * Deterministic and auditable (no LLM in the number). A natural-language summary of
 * the numbers is generated separately by the agent (see agentService.getRiskSummary).
 */
import { supabase } from '@/lib/supabase';

// ─── Heuristic thresholds (per 2-second window) — tunable ──────────────────────
const HARSH_SPEED_DELTA_MS = 4.0;      // |Δspeed| over the window → harsh brake/accel
const SHARP_CORNER_RAD_S = 3.0;        // gyro spike → sharp cornering
const IMPACT_ACCEL_MS2 = 15.0;         // ~1.5G → jolt / rough impact
const NIGHT_START_HOUR = 22;           // 22:00–05:00 counts as night riding
const NIGHT_END_HOUR = 5;
const WINDOW_SECONDS = 2;
const MIN_WINDOWS_FOR_PROFILE = 20;    // below this we're still "building" the profile
const MAX_WINDOWS_QUERIED = 3000;

export interface RiskFactor {
  key: string;
  label: string;
  score: number;       // 0–100, higher = safer
  detail: string;
}

export interface RiskProfile {
  score: number;                       // 0–100 overall safety score (higher = safer)
  tier: 'Low' | 'Moderate' | 'High';   // insurance RISK tier
  factors: RiskFactor[];
  dataPoints: number;                  // sensor windows analysed
  ridingMinutes: number;               // approx exposure
  incidents: number;
  hasEnoughData: boolean;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.round(Math.max(lo, Math.min(hi, n)));

function tierForScore(score: number): RiskProfile['tier'] {
  if (score >= 80) return 'Low';
  if (score >= 60) return 'Moderate';
  return 'High';
}

/** Weighted overall score from the individual factor sub-scores. */
function overall(factors: RiskFactor[]): number {
  const weights: Record<string, number> = {
    braking: 0.3,
    cornering: 0.2,
    night: 0.15,
    stability: 0.2,
    incidents: 0.15,
  };
  let sum = 0;
  let wsum = 0;
  for (const f of factors) {
    const w = weights[f.key] ?? 0;
    sum += f.score * w;
    wsum += w;
  }
  return wsum > 0 ? Math.round(sum / wsum) : 0;
}

export async function fetchRiskProfile(userId: string): Promise<RiskProfile> {
  // Pull recent sensor windows + total incident count.
  const [logsRes, incidentsRes] = await Promise.all([
    supabase
      .from('sensor_logs')
      .select('features, is_anomaly, window_start_ts')
      .eq('user_id', userId)
      .order('window_start_ts', { ascending: false })
      .limit(MAX_WINDOWS_QUERIED),
    supabase
      .from('incidents')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
  ]);

  const rows = (logsRes.data ?? []) as Array<{
    features: Record<string, number> | null;
    is_anomaly: boolean | null;
    window_start_ts: number | null;
  }>;
  const incidents = incidentsRes.count ?? 0;
  const total = rows.length;

  let harsh = 0;
  let corner = 0;
  let impact = 0;
  let anomalies = 0;
  let night = 0;

  for (const r of rows) {
    const f = r.features ?? {};
    if (Math.abs(f.gpsSpeedDelta ?? 0) >= HARSH_SPEED_DELTA_MS || (f.peakJerk ?? 0) >= 40) harsh++;
    if ((f.rotationRateSpike ?? 0) >= SHARP_CORNER_RAD_S) corner++;
    if ((f.peakAccelMagnitude ?? 0) >= IMPACT_ACCEL_MS2) impact++;
    if (r.is_anomaly) anomalies++;
    if (r.window_start_ts) {
      const hr = new Date(r.window_start_ts).getHours();
      if (hr >= NIGHT_START_HOUR || hr < NIGHT_END_HOUR) night++;
    }
  }

  const rate = (n: number) => (total > 0 ? n / total : 0);
  const harshRate = rate(harsh);
  const cornerRate = rate(corner);
  const anomalyRate = rate(anomalies + impact);
  const nightFraction = rate(night);

  const factors: RiskFactor[] = [
    {
      key: 'braking',
      label: 'Smooth braking & acceleration',
      score: clamp(100 - harshRate * 300),
      detail: `${(harshRate * 100).toFixed(1)}% of windows had harsh speed changes`,
    },
    {
      key: 'cornering',
      label: 'Cornering control',
      score: clamp(100 - cornerRate * 300),
      detail: `${(cornerRate * 100).toFixed(1)}% of windows had sharp turns`,
    },
    {
      key: 'stability',
      label: 'Ride stability (jolts / near-misses)',
      score: clamp(100 - anomalyRate * 500),
      detail: `${(anomalyRate * 100).toFixed(1)}% of windows flagged anomalous`,
    },
    {
      key: 'night',
      label: 'Daytime riding',
      score: clamp(100 - nightFraction * 120),
      detail: `${(nightFraction * 100).toFixed(0)}% of riding was at night`,
    },
    {
      key: 'incidents',
      label: 'Incident history',
      score: clamp(100 - incidents * 25),
      detail: incidents === 0 ? 'No confirmed incidents' : `${incidents} confirmed incident(s)`,
    },
  ];

  const score = overall(factors);

  return {
    score,
    tier: tierForScore(score),
    factors,
    dataPoints: total,
    ridingMinutes: Math.round((total * WINDOW_SECONDS) / 60),
    incidents,
    hasEnoughData: total >= MIN_WINDOWS_FOR_PROFILE,
  };
}
