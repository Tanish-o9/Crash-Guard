// ─── User & Profile ──────────────────────────────────────────────────────────

export interface User {
  id: string;
  phone: string;
  name: string;
  bloodGroup?: BloodGroup;
  vehicleType: VehicleType;
  mountPosition: MountPosition;
  createdAt: string;
}

export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | 'Unknown';
export type VehicleType = 'motorcycle' | 'scooter' | 'moped' | 'other';
export type MountPosition = 'handlebar' | 'chest_pocket' | 'jacket_pocket' | 'tank_bag' | 'other';

export interface EmergencyContact {
  id: string;
  userId: string;
  name: string;
  phone: string;
  priorityOrder: 1 | 2 | 3;
}

export interface MedicalInfo {
  id: string;
  userId: string;
  bloodType?: BloodGroup;
  allergies?: string[];
  conditions?: string[];
}

// ─── Sensor Data ─────────────────────────────────────────────────────────────

export interface RawSensorReading {
  timestamp: number; // Unix ms
  ax: number; // m/s²
  ay: number;
  az: number;
  gx: number; // rad/s
  gy: number;
  gz: number;
  lat?: number;
  lng?: number;
  speed?: number; // m/s
  altitude?: number; // meters
  pressure?: number; // hPa
}

export interface SensorWindow {
  startTimestamp: number;
  endTimestamp: number;
  readings: RawSensorReading[];
  features: SensorFeatures;
}

export interface SensorFeatures {
  peakAccelMagnitude: number; // |a| = sqrt(ax²+ay²+az²)
  peakJerk: number;
  gpsSpeedDelta: number;
  rotationRateSpike: number;
  postEventStillness: number;
  barometricDelta: number;
}

// ─── User Baseline ────────────────────────────────────────────────────────────

export interface UserBaseline {
  id: string;
  userId: string;
  featureMeans: Record<keyof SensorFeatures, number>;
  featureStds: Record<keyof SensorFeatures, number>;
  sampleCount: number;
  updatedAt: string;
  isValid: boolean; // true if sampleCount >= MIN_BASELINE_SAMPLES
}

// ─── Anomaly Detection ───────────────────────────────────────────────────────

export interface AnomalyResult {
  isAnomaly: boolean;
  compositeZScore: number;
  perFeatureZScores: Record<string, number>;
  confidence: number;
  reason: string;
}

// ─── Incidents ───────────────────────────────────────────────────────────────

export type IncidentTriggerType = 'auto_sensor' | 'samaritan_widget' | 'manual_test';
export type IncidentStatus =
  | 'alarm_active'
  | 'cancelled'
  | 'auto_called'
  | 'contacts_notified'
  | 'resolved';

export type CancelReason =
  | 'dropped_phone'
  | 'rough_road'
  | 'hard_braking'
  | 'im_fine'
  | 'false_trigger'
  | 'other';

export interface Incident {
  id: string;
  userId: string;
  triggerType: IncidentTriggerType;
  status: IncidentStatus;
  lat: number;
  lng: number;
  triggeredAt: string;
  cancelledAt?: string;
  cancelReason?: CancelReason;
  cancelReasonNote?: string;
  calledEmergency: boolean;
  calledEmergencyAt?: string;
  contactsNotified: boolean;
  sensorWindowId?: string;
  compositeZScore?: number;
}

// ─── State Machine States ─────────────────────────────────────────────────────

export type EmergencyState =
  | 'IDLE'
  | 'ANOMALY_DETECTED'
  | 'STAGE2_CLASSIFYING'
  | 'ALARM_ACTIVE'
  | 'COUNTDOWN_EXPIRED'
  | 'CALLING_EMERGENCY'
  | 'CALLING_CONTACTS'
  | 'CANCELLED'
  | 'DONE';

// ─── Good Samaritan ──────────────────────────────────────────────────────────

export interface SamaritanReport {
  id: string;
  reporterPhone?: string;
  reporterName?: string;
  lat: number;
  lng: number;
  nlpIntake?: string;
  severityEstimate?: 'low' | 'medium' | 'high' | 'unknown';
  canTransport: boolean;
  hospitalChosen?: string;
  createdAt: string;
}

// ─── Hospital ────────────────────────────────────────────────────────────────

export interface Hospital {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distanceKm: number;
  rating?: number;
  phoneNumber?: string;
}

// ─── Language / Locale ───────────────────────────────────────────────────────

export type SupportedLanguage =
  | 'hi' // Hindi
  | 'en' // English
  | 'ta' // Tamil
  | 'te' // Telugu
  | 'kn' // Kannada
  | 'ml' // Malayalam
  | 'mr' // Marathi
  | 'gu' // Gujarati
  | 'bn' // Bengali
  | 'pa' // Punjabi
  | 'or'; // Odia

export interface EmergencyMessage {
  language: SupportedLanguage;
  text: string;
  audioUrl?: string;
}
