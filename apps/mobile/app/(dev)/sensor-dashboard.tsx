/**
 * Sensor Dashboard — DEV ONLY
 *
 * Real-time display of all sensor pipeline internals.
 * This screen is hidden from regular users (only accessible via dev button on Home).
 * Used for validating sensor readings, feature extraction, and anomaly detection
 * during beta testing and calibration development.
 */
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { useSensorStore } from '@/store/sensorStore';
import { useSensorPipeline } from '@/hooks/useSensorPipeline';
import { sensorUploader } from '@/services/sensorUploader';

export default function SensorDashboard() {
  const {
    status,
    latestReading,
    latestFeatures,
    currentLat,
    currentLng,
    currentSpeedKmh,
    latestZScore,
    isAnomalyDetected,
    totalWindowsCollected,
    totalWindowsUploaded,
    windowBuffer,
    lastError,
    ridingModeStartedAt,
  } = useSensorStore();

  const { isRiding, toggleRidingMode } = useSensorPipeline();
  const [isUploading, setIsUploading] = useState(false);
  const [tick, setTick] = useState(0);

  // Force re-render every 500ms to show live values
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 500);
    return () => clearInterval(t);
  }, []);

  async function handleManualUpload() {
    setIsUploading(true);
    await sensorUploader.uploadPendingWindows().catch(() => {});
    setIsUploading(false);
  }

  const ridingSeconds = ridingModeStartedAt
    ? Math.floor((Date.now() - ridingModeStartedAt) / 1000)
    : 0;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} tintColor="#FF3B3B" />}
      >
        {/* Header */}
        <View style={styles.topBar}>
          <View>
            <Text style={styles.pageTitle}>Sensor Dashboard</Text>
            <Text style={styles.pageSubtitle}>DEV ONLY · Real-time sensor debug view</Text>
          </View>
          <TouchableOpacity
            style={[styles.ridingToggle, isRiding && styles.ridingToggleActive]}
            onPress={toggleRidingMode}
            activeOpacity={0.8}
          >
            <Text style={styles.ridingToggleText}>{isRiding ? '⬛ Stop' : '▶ Start'}</Text>
          </TouchableOpacity>
        </View>

        {/* Status */}
        <Section title="STATUS">
          <Row label="Riding status" value={status.toUpperCase()} highlight={isRiding} />
          <Row label="Riding duration" value={isRiding ? `${ridingSeconds}s` : '—'} />
          <Row label="Error" value={lastError ?? 'None'} error={!!lastError} />
        </Section>

        {/* GPS */}
        <Section title="GPS">
          <Row label="Latitude" value={currentLat?.toFixed(6) ?? '—'} />
          <Row label="Longitude" value={currentLng?.toFixed(6) ?? '—'} />
          <Row label="Speed" value={currentSpeedKmh != null ? `${currentSpeedKmh.toFixed(1)} km/h` : '—'} />
        </Section>

        {/* Raw Accelerometer */}
        <Section title="ACCELEROMETER (m/s²)">
          <Row label="X (ax)" value={latestReading?.ax.toFixed(4) ?? '—'} />
          <Row label="Y (ay)" value={latestReading?.ay.toFixed(4) ?? '—'} />
          <Row label="Z (az)" value={latestReading?.az.toFixed(4) ?? '—'} />
        </Section>

        {/* Raw Gyroscope */}
        <Section title="GYROSCOPE (rad/s)">
          <Row label="X (gx)" value={latestReading?.gx.toFixed(4) ?? '—'} />
          <Row label="Y (gy)" value={latestReading?.gy.toFixed(4) ?? '—'} />
          <Row label="Z (gz)" value={latestReading?.gz.toFixed(4) ?? '—'} />
        </Section>

        {/* Barometer */}
        <Section title="BAROMETER">
          <Row
            label="Pressure (hPa)"
            value={latestReading?.pressure?.toFixed(2) ?? 'Not available'}
          />
        </Section>

        {/* Extracted Features */}
        <Section title="EXTRACTED FEATURES (latest window)">
          {latestFeatures ? (
            <>
              <Row label="Peak Accel" value={`${latestFeatures.peakAccelMagnitude} m/s²`} />
              <Row label="Peak Jerk" value={`${latestFeatures.peakJerk.toFixed(3)} m/s³`} />
              <Row label="GPS Speed Δ" value={`${latestFeatures.gpsSpeedDelta.toFixed(3)} km/h`} />
              <Row label="Rotation Spike" value={`${latestFeatures.rotationRateSpike.toFixed(3)} rad/s`} />
              <Row label="Post Stillness" value={`${latestFeatures.postEventStillness.toFixed(4)}`} />
              <Row label="Baro Δ" value={`${latestFeatures.barometricDelta.toFixed(4)} hPa`} />
            </>
          ) : (
            <Text style={styles.emptyText}>No features yet — start riding mode</Text>
          )}
        </Section>

        {/* Anomaly Detection */}
        <Section title="ANOMALY DETECTION">
          <Row
            label="Z-Score"
            value={latestZScore != null ? latestZScore.toFixed(3) : '—'}
            highlight={isAnomalyDetected}
          />
          <Row
            label="Anomaly"
            value={isAnomalyDetected ? '⚠️ YES' : 'No'}
            highlight={isAnomalyDetected}
            error={isAnomalyDetected}
          />
        </Section>

        {/* Upload stats */}
        <Section title="SENSOR UPLOAD">
          <Row label="Windows collected" value={String(totalWindowsCollected)} />
          <Row label="Windows uploaded" value={String(totalWindowsUploaded)} />
          <Row label="Buffer pending" value={String(windowBuffer.length)} />

          <TouchableOpacity
            style={[styles.uploadBtn, isUploading && styles.uploadBtnDisabled]}
            onPress={handleManualUpload}
            disabled={isUploading}
            activeOpacity={0.8}
          >
            <Text style={styles.uploadBtnText}>
              {isUploading ? 'Uploading...' : '↑ Force Upload Now'}
            </Text>
          </TouchableOpacity>
        </Section>

        {/* Recent windows mini-list */}
        {windowBuffer.length > 0 && (
          <Section title={`WINDOW BUFFER (${windowBuffer.length} pending)`}>
            {windowBuffer
              .slice(-5)
              .reverse()
              .map((w, i) => (
                <View key={i} style={styles.windowRow}>
                  <Text style={styles.windowTime}>
                    {new Date(w.endTimestamp).toLocaleTimeString()}
                  </Text>
                  <Text style={styles.windowFeature}>
                    accel={w.features.peakAccelMagnitude} | jerk={w.features.peakJerk.toFixed(1)}
                  </Text>
                </View>
              ))}
            {windowBuffer.length > 5 && (
              <Text style={styles.emptyText}>+{windowBuffer.length - 5} more…</Text>
            )}
          </Section>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function Row({
  label,
  value,
  highlight = false,
  error = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  error?: boolean;
}) {
  const valueColor = error ? '#FF6B6B' : highlight ? '#FF3B3B' : '#FFFFFF';
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, { color: valueColor }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F14' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    paddingBottom: 8,
  },
  pageTitle: { fontSize: 22, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 11, color: '#FF8C3B', fontWeight: '600', marginTop: 2 },
  ridingToggle: {
    backgroundColor: '#16161E',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: '#2A2A36',
  },
  ridingToggleActive: { backgroundColor: '#1A0D0D', borderColor: '#FF3B3B' },
  ridingToggleText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  section: { paddingHorizontal: 20, marginBottom: 16 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#444456',
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  sectionCard: {
    backgroundColor: '#16161E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2A36',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E2A',
  },
  rowLabel: { fontSize: 12, color: '#666680', flex: 1 },
  rowValue: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'], maxWidth: 200, textAlign: 'right' },
  emptyText: { fontSize: 12, color: '#444456', padding: 14, textAlign: 'center' },
  uploadBtn: {
    margin: 12,
    backgroundColor: '#1E1E2A',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3A3A4A',
  },
  uploadBtnDisabled: { opacity: 0.5 },
  uploadBtnText: { fontSize: 13, fontWeight: '700', color: '#FF3B3B' },
  windowRow: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E2A',
  },
  windowTime: { fontSize: 11, color: '#666680', marginBottom: 2 },
  windowFeature: { fontSize: 11, color: '#888899', fontVariant: ['tabular-nums'] },
});
