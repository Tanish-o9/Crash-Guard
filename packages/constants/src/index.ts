import type { SupportedLanguage } from '@crashguard/types';

// ─── Sensor Thresholds ────────────────────────────────────────────────────────

/** Minimum GPS speed (km/h) to consider the user is riding */
export const RIDING_MODE_MIN_SPEED_KMH = 10;

/** Consecutive seconds above RIDING_MODE_MIN_SPEED_KMH before riding mode activates */
export const RIDING_MODE_ACTIVATION_SECONDS = 30;

/** Sensor sampling rate in Hz (accelerometer + gyroscope) */
export const SENSOR_SAMPLE_RATE_HZ = 50;

/** Window size in seconds for feature extraction */
export const FEATURE_WINDOW_SECONDS = 2;

/** Window overlap (50%) */
export const FEATURE_WINDOW_OVERLAP = 0.5;

/** Absolute minimum acceleration (m/s²) to even consider an anomaly (~1.5G) */
export const ANOMALY_ABS_FLOOR_ACCEL_MS2 = 15.0;

/** Stage 1 composite z-score threshold — above this, Stage 2 fires */
export const ANOMALY_Z_THRESHOLD = 4.5;

/** Minimum baseline samples before detection is enabled */
export const MIN_BASELINE_SAMPLES = 100;

// ─── Alarm & Countdown ────────────────────────────────────────────────────────

/** Countdown duration in seconds — NEVER reduce this */
export const ALARM_COUNTDOWN_SECONDS = 10;

/** Volume level for alarm (0–1), always plays at max regardless of system volume */
export const ALARM_VOLUME = 1.0;

/** Voice cancel keywords (lowercase) */
export const VOICE_CANCEL_KEYWORDS = ['cancel', 'stop', 'fine', 'ok', 'okay', 'ruko'];

// ─── Emergency Numbers ────────────────────────────────────────────────────────

/**
 * IMPORTANT: Never use the real emergency number until legal/regulatory research
 * on India ERSS/112 auto-dialing from third-party apps is resolved.
 * Build and test ONLY against EMERGENCY_MOCK_NUMBER.
 */
export const EMERGENCY_REAL_NUMBER = '112'; // DO NOT USE until legal clearance
export const EMERGENCY_AMBULANCE_NUMBER = '108'; // DO NOT USE until legal clearance
export const EMERGENCY_MOCK_NUMBER = '+919999999999'; // Replace with your test number

/** Whether to use the real emergency number (set to false until legal research done) */
export const USE_REAL_EMERGENCY_NUMBER = false;

// ─── Location Sharing ─────────────────────────────────────────────────────────

/** How often to update live location during an active incident (seconds) */
export const LOCATION_UPDATE_INTERVAL_SECONDS = 5;

/** How long a public tracking link is valid (hours) */
export const TRACKING_LINK_VALIDITY_HOURS = 24;

// ─── Language-to-State Mapping (India) ───────────────────────────────────────
/**
 * Maps Indian state names to their primary language priority chain.
 * Format: [primary, secondary, tertiary] — always falls back to English.
 * Source: Scheduled Languages of India + State official languages.
 */
export const STATE_LANGUAGE_MAP: Record<string, SupportedLanguage[]> = {
  // South India — Do NOT assume Hindi as first fallback
  'Tamil Nadu': ['ta', 'hi', 'en'],
  'Puducherry': ['ta', 'hi', 'en'],
  'Andhra Pradesh': ['te', 'hi', 'en'],
  'Telangana': ['te', 'hi', 'en'],
  'Karnataka': ['kn', 'hi', 'en'],
  'Kerala': ['ml', 'hi', 'en'],

  // West India
  'Maharashtra': ['mr', 'hi', 'en'],
  'Gujarat': ['gu', 'hi', 'en'],
  'Goa': ['mr', 'en', 'hi'],

  // North India (Hindi belt)
  'Uttar Pradesh': ['hi', 'en'],
  'Bihar': ['hi', 'en'],
  'Rajasthan': ['hi', 'en'],
  'Madhya Pradesh': ['hi', 'en'],
  'Haryana': ['hi', 'en'],
  'Himachal Pradesh': ['hi', 'en'],
  'Uttarakhand': ['hi', 'en'],
  'Delhi': ['hi', 'en'],
  'Jharkhand': ['hi', 'en'],
  'Chhattisgarh': ['hi', 'en'],

  // East India
  'West Bengal': ['bn', 'hi', 'en'],
  'Odisha': ['or', 'hi', 'en'],
  'Assam': ['bn', 'hi', 'en'],

  // North-west
  'Punjab': ['pa', 'hi', 'en'],
  'Jammu and Kashmir': ['hi', 'en'],
  'Ladakh': ['hi', 'en'],

  // Northeast
  'Manipur': ['hi', 'en'],
  'Meghalaya': ['hi', 'en'],
  'Mizoram': ['hi', 'en'],
  'Nagaland': ['hi', 'en'],
  'Tripura': ['bn', 'hi', 'en'],
  'Arunachal Pradesh': ['hi', 'en'],
  'Sikkim': ['hi', 'en'],
};

/** Default fallback if state is not in the map */
export const DEFAULT_LANGUAGE_CHAIN: SupportedLanguage[] = ['hi', 'en'];

// ─── Sensor Upload ────────────────────────────────────────────────────────────

/** How often to batch-upload sensor logs to Supabase (minutes) */
export const SENSOR_UPLOAD_INTERVAL_MINUTES = 5;

/** Max sensor windows to buffer in memory before forcing upload */
export const MAX_BUFFERED_WINDOWS = 300;

// ─── Hospital Search ──────────────────────────────────────────────────────────

/** Search radius for nearby hospitals (km) */
export const HOSPITAL_SEARCH_RADIUS_KM = 10;

/** Max hospitals to show in the list */
export const MAX_HOSPITALS_SHOWN = 5;
