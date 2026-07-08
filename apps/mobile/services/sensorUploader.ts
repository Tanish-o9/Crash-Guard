/**
 * Sensor Uploader — batch uploads pending SensorWindows to Supabase Storage.
 *
 * Upload strategy:
 *   - Groups windows into batches (up to 50 per upload)
 *   - Stores raw readings in Supabase Storage (JSON files) for later model training
 *   - Stores feature summary rows in `sensor_logs` table for quick querying
 *   - Runs automatically every SENSOR_UPLOAD_INTERVAL_MINUTES via the background fetch task
 *   - Also called manually when riding mode is stopped (flush on exit)
 *
 * This builds the Phase 0 negative-class dataset (normal riding data) that
 * the false-positive-reduction work depends on.
 */
import { supabase } from '@/lib/supabase';
import { useSensorStore } from '@/store/sensorStore';
import { useAuthStore } from '@/store/authStore';
import { useUserStore } from '@/store/userStore';
import * as Device from 'expo-device';
import type { SensorWindow } from '@crashguard/types';

const BATCH_SIZE = 50; // windows per upload call

class SensorUploader {
  private isUploading = false;

  async uploadPendingWindows(): Promise<void> {
    if (this.isUploading) return;

    const sensorState = useSensorStore.getState();
    const { session } = useAuthStore.getState();

    if (!session?.user.id) return;
    if (sensorState.windowBuffer.length === 0) return;

    this.isUploading = true;

    try {
      // Take the oldest batch
      const batch = sensorState.windowBuffer.slice(0, BATCH_SIZE);
      await this.uploadBatch(session.user.id, batch);
      useSensorStore.getState().markWindowsUploaded(batch.length);
    } catch (err: any) {
      useSensorStore.getState().setError(`Upload failed: ${err.message}`);
    } finally {
      this.isUploading = false;
    }
  }

  private async uploadBatch(userId: string, windows: SensorWindow[]): Promise<void> {
    const { onboardingDraft } = useUserStore.getState();
    const deviceModel = Device.modelName ?? 'unknown';
    const osVersion = `Android ${Device.osVersion ?? 'unknown'}`;
    const mountPosition = onboardingDraft.mountPosition;

    // ── Upload raw readings to Supabase Storage ──────────────────────────────
    // Store as a JSON file per batch — these are the raw sensor sequences
    // used for labeled dataset construction and future model training.
    const batchId = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const rawPayload = JSON.stringify({
      userId,
      batchId,
      deviceModel,
      osVersion,
      mountPosition,
      uploadedAt: new Date().toISOString(),
      windows: windows.map(w => ({
        startTimestamp: w.startTimestamp,
        endTimestamp: w.endTimestamp,
        features: w.features,
        // Only store every 5th reading to reduce storage size (~10Hz effective)
        readings: w.readings.filter((_, i) => i % 5 === 0),
      })),
    });

    const { error: storageError } = await supabase.storage
      .from('sensor-logs')
      .upload(`${batchId}.json`, rawPayload, {
        contentType: 'application/json',
        upsert: false,
      });

    if (storageError) {
      throw new Error(`Storage upload failed: ${storageError.message}`);
    }

    // ── Insert feature summary rows into sensor_logs table ───────────────────
    const rows = windows.map(w => ({
      user_id: userId,
      window_start_ts: w.startTimestamp,
      window_end_ts: w.endTimestamp,
      features: w.features,
      storage_path: `${batchId}.json`,
      phone_model: deviceModel,
      os_version: osVersion,
      mount_position: mountPosition,
      is_anomaly: false, // negative-class data (normal riding)
    }));

    const { error: dbError } = await supabase.from('sensor_logs').insert(rows);
    if (dbError) {
      throw new Error(`DB insert failed: ${dbError.message}`);
    }
  }
}

export const sensorUploader = new SensorUploader();
