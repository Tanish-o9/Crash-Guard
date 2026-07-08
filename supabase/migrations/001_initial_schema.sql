-- ============================================================
-- CrashGuard — Initial Database Schema
-- Migration: 001_initial_schema
-- ============================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis"; -- for geo queries (optional, requires PostGIS)

-- ─── ENUMS ──────────────────────────────────────────────────

CREATE TYPE blood_group AS ENUM ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown');
CREATE TYPE vehicle_type AS ENUM ('motorcycle', 'scooter', 'moped', 'other');
CREATE TYPE mount_position AS ENUM ('handlebar', 'chest_pocket', 'jacket_pocket', 'tank_bag', 'other');
CREATE TYPE incident_trigger_type AS ENUM ('auto_sensor', 'samaritan_widget', 'manual_test');
CREATE TYPE incident_status AS ENUM (
  'alarm_active', 'cancelled', 'auto_called', 'contacts_notified', 'resolved'
);
CREATE TYPE cancel_reason AS ENUM (
  'dropped_phone', 'rough_road', 'hard_braking', 'im_fine', 'false_trigger', 'other'
);

-- ─── USERS ──────────────────────────────────────────────────

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  blood_group blood_group DEFAULT 'Unknown',
  vehicle_type vehicle_type DEFAULT 'motorcycle',
  mount_position mount_position DEFAULT 'handlebar',
  is_calibrated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── EMERGENCY CONTACTS ──────────────────────────────────────

CREATE TABLE emergency_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  priority_order SMALLINT NOT NULL CHECK (priority_order IN (1, 2, 3)),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, priority_order)
);

-- ─── MEDICAL INFO ─────────────────────────────────────────────

CREATE TABLE medical_info (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blood_type blood_group DEFAULT 'Unknown',
  allergies TEXT[] DEFAULT '{}',
  conditions TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── USER BASELINES ───────────────────────────────────────────

CREATE TABLE user_baselines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- JSON object with feature names as keys and mean values
  feature_means JSONB NOT NULL DEFAULT '{}',
  -- JSON object with feature names as keys and std dev values  
  feature_stds JSONB NOT NULL DEFAULT '{}',
  sample_count INTEGER NOT NULL DEFAULT 0,
  is_valid BOOLEAN GENERATED ALWAYS AS (sample_count >= 100) STORED,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── INCIDENTS ────────────────────────────────────────────────

CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trigger_type incident_trigger_type NOT NULL,
  status incident_status NOT NULL DEFAULT 'alarm_active',
  
  -- Location at time of trigger
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  
  -- Timestamps
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  called_emergency_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  
  -- Cancel info
  cancel_reason cancel_reason,
  cancel_reason_note TEXT,
  
  -- Outcome flags
  called_emergency BOOLEAN NOT NULL DEFAULT FALSE,
  contacts_notified BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Detection metadata
  composite_z_score REAL,
  sensor_window_id UUID, -- FK to sensor_logs
  
  -- Tracking link (time-limited, public)
  tracking_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  tracking_expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);

-- ─── INCIDENT LOCATION UPDATES (real-time) ───────────────────

CREATE TABLE incident_location_updates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable real-time for location updates
ALTER TABLE incident_location_updates REPLICA IDENTITY FULL;

-- ─── SENSOR LOGS ──────────────────────────────────────────────

CREATE TABLE sensor_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  incident_id UUID REFERENCES incidents(id) ON DELETE SET NULL,
  
  -- Window metadata
  window_start_ts BIGINT NOT NULL, -- Unix ms
  window_end_ts BIGINT NOT NULL,
  
  -- Extracted features (JSON for flexibility)
  features JSONB NOT NULL DEFAULT '{}',
  
  -- Raw readings stored in Supabase Storage (path to the JSON file)
  storage_path TEXT,
  
  -- Detection output
  composite_z_score REAL,
  is_anomaly BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  phone_model TEXT,
  os_version TEXT,
  mount_position mount_position,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SAMARITAN EVENTS ─────────────────────────────────────────

CREATE TABLE samaritan_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id UUID REFERENCES incidents(id) ON DELETE SET NULL,
  
  -- Reporter info (optional — they may not share)
  reporter_phone TEXT,
  reporter_name TEXT,
  
  -- Location
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  
  -- NLP intake from bystander
  nlp_intake TEXT,
  severity_estimate TEXT CHECK (severity_estimate IN ('low', 'medium', 'high', 'unknown')),
  
  -- Transport
  can_transport BOOLEAN DEFAULT FALSE,
  hospital_chosen TEXT,
  hospital_place_id TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── INDEXES ──────────────────────────────────────────────────

CREATE INDEX idx_incidents_user_id ON incidents(user_id);
CREATE INDEX idx_incidents_triggered_at ON incidents(triggered_at DESC);
CREATE INDEX idx_incidents_tracking_token ON incidents(tracking_token);
CREATE INDEX idx_sensor_logs_user_id ON sensor_logs(user_id);
CREATE INDEX idx_sensor_logs_incident_id ON sensor_logs(incident_id);
CREATE INDEX idx_location_updates_incident_id ON incident_location_updates(incident_id);
CREATE INDEX idx_emergency_contacts_user_id ON emergency_contacts(user_id);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_location_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_logs ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "users_own_data" ON users FOR ALL USING (auth.uid() = id);
CREATE POLICY "contacts_own_data" ON emergency_contacts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "medical_own_data" ON medical_info FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "baselines_own_data" ON user_baselines FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "incidents_own_data" ON incidents FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "sensor_logs_own_data" ON sensor_logs FOR ALL USING (auth.uid() = user_id);

-- Incident location updates: owner can write, public can read (for tracking)
CREATE POLICY "location_updates_write" ON incident_location_updates 
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM incidents WHERE id = incident_id AND user_id = auth.uid())
  );
CREATE POLICY "location_updates_public_read" ON incident_location_updates 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM incidents 
      WHERE id = incident_id 
      AND tracking_expires_at > NOW()
    )
  );

-- ─── TRIGGERS ─────────────────────────────────────────────────

-- Auto-update updated_at on users
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER baselines_updated_at BEFORE UPDATE ON user_baselines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
