/**
 * SensorService — the core sensor orchestration singleton.
 *
 * Responsibilities:
 *   1. Subscribe to accelerometer + gyroscope at 50 Hz
 *   2. Subscribe to barometer at 1 Hz
 *   3. Fuse readings into a RingBuffer (last 60 seconds)
 *   4. Emit a new feature window every ~1 second (every 50 new accel samples)
 *   5. Push completed windows to the sensorStore
 *   6. Trigger the anomaly detector for each window (Part 5)
 *
 * Architecture note:
 *   We use a sample-count trigger for window emission (every 50 accel samples ≈ 1 s at 50 Hz)
 *   rather than a wall-clock timer. This decouples window processing from clock drift
 *   and handles variable sampling rates on different devices gracefully.
 *
 * The location subscription lives in backgroundTask.ts (it acts as the foreground
 * service anchor). We receive GPS via the sensorStore.
 */
import {
  Accelerometer,
  Gyroscope,
  Barometer,
  type AccelerometerMeasurement,
  type GyroscopeMeasurement,
} from 'expo-sensors';
import type { EventSubscription } from 'expo-modules-core';
import Device from 'expo-device';
import type { RawSensorReading } from '@crashguard/types';
import { SENSOR_SAMPLE_RATE_HZ, FEATURE_WINDOW_SECONDS } from '@crashguard/constants';
import { useSensorStore } from '@/store/sensorStore';
import { RingBuffer, buildWindow, WINDOW_SIZE } from '@/services/featureExtractor';
import { startBackgroundLocationTask, stopBackgroundLocationTask } from '@/services/backgroundTask';

// ─── Constants ────────────────────────────────────────────────────────────────

/** How many new accel samples before we compute a new window (50% overlap) */
const WINDOW_STEP_SAMPLES = Math.floor(WINDOW_SIZE * 0.5); // 50 samples = 1s

/** Ring buffer capacity: 60 seconds of data at 50 Hz */
const RING_BUFFER_CAPACITY = SENSOR_SAMPLE_RATE_HZ * 60; // 3000 readings

// ─── Sensor Service ───────────────────────────────────────────────────────────

class SensorService {
  private accelSub: EventSubscription | null = null;
  private gyroSub: EventSubscription | null = null;
  private baroSub: EventSubscription | null = null;

  // Fused sensor state (latest values from each sensor type)
  private latestGyro = { gx: 0, gy: 0, gz: 0 };
  private latestPressure: number | null = null;

  // Ring buffer for accel+gyro readings
  private ringBuffer = new RingBuffer(RING_BUFFER_CAPACITY);

  // Counter for window emission
  private samplesSinceLastWindow = 0;

  private isRunning = false;

  // ─── Public API ─────────────────────────────────────────────────────────────

  async start(): Promise<boolean> {
    if (this.isRunning) return true;

    try {
      // Set sensor update intervals
      Accelerometer.setUpdateInterval(Math.round(1000 / SENSOR_SAMPLE_RATE_HZ)); // 20ms
      Gyroscope.setUpdateInterval(Math.round(1000 / SENSOR_SAMPLE_RATE_HZ));
      Barometer.setUpdateInterval(1000); // 1 Hz

      // Subscribe to accelerometer
      this.accelSub = Accelerometer.addListener(this.onAccel.bind(this));

      // Subscribe to gyroscope
      this.gyroSub = Gyroscope.addListener(this.onGyro.bind(this));

      // Subscribe to barometer (optional — fails gracefully if not available)
      try {
        const baroAvailable = await Barometer.isAvailableAsync();
        if (baroAvailable) {
          this.baroSub = Barometer.addListener(({ pressure }) => {
            this.latestPressure = pressure;
          });
        }
      } catch {}

      // Start background location task (GPS anchor + foreground service)
      await startBackgroundLocationTask();

      this.isRunning = true;
      useSensorStore.getState().setStatus('monitoring');
      return true;
    } catch (err: any) {
      useSensorStore.getState().setError(`SensorService start failed: ${err.message}`);
      return false;
    }
  }

  async stop(): Promise<void> {
    this.accelSub?.remove();
    this.gyroSub?.remove();
    this.baroSub?.remove();
    this.accelSub = null;
    this.gyroSub = null;
    this.baroSub = null;

    await stopBackgroundLocationTask();

    this.ringBuffer.clear();
    this.samplesSinceLastWindow = 0;
    this.isRunning = false;

    useSensorStore.getState().setStatus('idle');
  }

  get running(): boolean {
    return this.isRunning;
  }

  // ─── Private Handlers ────────────────────────────────────────────────────────

  private onGyro(data: GyroscopeMeasurement): void {
    // Store latest gyro values — fused into accel readings
    this.latestGyro = { gx: data.x, gy: data.y, gz: data.z };
  }

  private onAccel(data: AccelerometerMeasurement): void {
    const store = useSensorStore.getState();

    // Expo accelerometer reports in g — convert to m/s²
    const G = 9.81;
    const ax = data.x * G;
    const ay = data.y * G;
    const az = data.z * G;

    // Build fused reading
    const reading: RawSensorReading = {
      timestamp: Date.now(),
      ax,
      ay,
      az,
      gx: this.latestGyro.gx,
      gy: this.latestGyro.gy,
      gz: this.latestGyro.gz,
      lat: store.currentLat ?? undefined,
      lng: store.currentLng ?? undefined,
      speed: store.currentSpeedKmh != null ? store.currentSpeedKmh / 3.6 : undefined, // back to m/s
      pressure: this.latestPressure ?? undefined,
    };

    // Push to ring buffer
    this.ringBuffer.push(reading);

    // Update live state in store (throttled — every 10th sample for UI perf)
    this.samplesSinceLastWindow++;
    if (this.samplesSinceLastWindow % 10 === 0) {
      store.setLatestReading(reading);
    }

    // ── Window emission ─────────────────────────────────────────────────────
    if (this.samplesSinceLastWindow >= WINDOW_STEP_SAMPLES) {
      this.samplesSinceLastWindow = 0;
      this.processWindow();
    }
  }

  private processWindow(): void {
    // Need a full window worth of data before processing
    if (this.ringBuffer.length < WINDOW_SIZE) return;

    const readings = this.ringBuffer.last(WINDOW_SIZE);
    const window = buildWindow(readings);

    const store = useSensorStore.getState();
    store.setLatestFeatures(window.features);
    store.addWindow(window);

    // ── Anomaly detection ─────────────────────────────────────────────────
    const { status: rideStatus } = useSensorStore.getState();
    if (rideStatus === 'riding') {
      const { runStage1 } = require('@/services/crashDetector');
      const { useDetectionStore } = require('@/store/detectionStore');
      const { useAlarmStore } = require('@/store/alarmStore');
      const { runStage2StillnessCheck } = require('@/services/crashDetector');

      const result = runStage1(window.features);
      const detStore = useDetectionStore.getState();
      const newPhase = detStore.processWindow(window.features, result);

      const isInStage2 = newPhase === 'STAGE2_CLASSIFYING' || detStore.phase === 'STAGE2_CLASSIFYING';
      if (isInStage2) {
        const isStill = runStage2StillnessCheck(window.features);
        const finalPhase = detStore.reportStillnessCheck(isStill);
        if (finalPhase === 'CRASH_CONFIRMED') {
          useAlarmStore.getState().startAlarm('auto_sensor');
        }
      }
    }
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const sensorService = new SensorService();
