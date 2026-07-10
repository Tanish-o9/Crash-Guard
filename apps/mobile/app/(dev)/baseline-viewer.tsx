/**
 * Baseline Viewer — DEV ONLY
 * Shows the current per-feature baseline values and their standard deviations.
 * Used to validate calibration quality and spot drift.
 */
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCalibration } from '@/hooks/useCalibration';
import { useCalibrationStore } from '@/store/calibrationStore';
import { FEATURE_KEYS } from '@/services/calibrationService';
import { MIN_BASELINE_SAMPLES } from '@crashguard/constants';
import type { SensorFeatures } from '@crashguard/types';

const FEATURE_LABELS: Record<keyof SensorFeatures, string> = {
  peakAccelMagnitude: 'Peak Accel (m/s²)',
  peakJerk: 'Peak Jerk (m/s³)',
  gpsSpeedDelta: 'GPS Speed Δ (km/h)',
  rotationRateSpike: 'Rotation Spike (rad/s)',
  postEventStillness: 'Post-Event Stillness',
  barometricDelta: 'Baro Δ (hPa)',
};

export default function BaselineViewer() {
  const {
    calibrationStatus,
    isValid,
    progressFraction,
    sampleCount,
    etaString,
    baseline,
  } = useCalibration();

  const { lastSavedAt, isSaving } = useCalibrationStore();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Baseline Viewer</Text>
          <Text style={styles.subtitle}>DEV ONLY · Per-feature sensor baseline</Text>
        </View>

        {/* Status */}
        <Section title="STATUS">
          <Row label="Status" value={calibrationStatus.toUpperCase()} highlight={isValid} />
          <Row label="Sample count" value={`${sampleCount} / ${MIN_BASELINE_SAMPLES}`} />
          <Row label="Progress" value={`${Math.round(progressFraction * 100)}%`} />
          <Row label="ETA" value={etaString} />
          <Row label="Last saved" value={lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString() : '—'} />
          <Row label="Saving" value={isSaving ? 'Yes' : 'No'} />
        </Section>

        {/* Feature means */}
        <Section title="BASELINE MEANS">
          {FEATURE_KEYS.map(key => (
            <Row
              key={key}
              label={FEATURE_LABELS[key]}
              value={isValid || sampleCount > 0
                ? baseline.means[key].toFixed(4)
                : '—'}
            />
          ))}
        </Section>

        {/* Feature std devs */}
        <Section title="BASELINE STD DEVS (σ)">
          {FEATURE_KEYS.map(key => (
            <Row
              key={key}
              label={FEATURE_LABELS[key]}
              value={isValid || sampleCount > 0
                ? Math.sqrt(baseline.variances[key]).toFixed(4)
                : '—'}
            />
          ))}
        </Section>

        {/* Threshold context */}
        <Section title="ANOMALY THRESHOLD CONTEXT">
          <Row label="Z-score threshold" value="4.5" />
          <Row label="Abs accel floor" value="15.0 m/s² (~1.5G)" />
          <Row label="Min samples for detection" value={String(MIN_BASELINE_SAMPLES)} />
          <Row label="Detection enabled" value={isValid ? 'YES' : 'NO (calibrating)'} highlight={isValid} />
        </Section>

        {/* Variance sanity check */}
        {(isValid || sampleCount > 0) && (
          <Section title="VARIANCE SANITY CHECK">
            {FEATURE_KEYS.map(key => {
              const variance = baseline.variances[key];
              const isSane = variance > 0 && variance < 1e6;
              return (
                <Row
                  key={key}
                  label={FEATURE_LABELS[key]}
                  value={isSane ? `✓ ${variance.toFixed(6)}` : `⚠️ ${variance.toFixed(6)}`}
                  highlight={isSane}
                  error={!isSane}
                />
              );
            })}
          </Section>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

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
  valueColor = C.ink,
}: {
  label: string;
  value: string | number;
  valueColor?: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: valueColor }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const C = {
  bgCard: '#FFFFFF', sage: '#4A7060', sagePale: '#C4D8CC', sageTint: '#EBF3EF',
  ink: '#1C2826', inkMid: '#445550', inkFaint: '#8A9E96',
  line: '#DDD6C8', lineLight: '#EAE4D8',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F0E8' },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '900', color: C.ink, letterSpacing: -0.5 },
  subtitle: { fontSize: 11, color: C.sage, fontWeight: '800', marginTop: 2, letterSpacing: 0.5 },
  section: { paddingHorizontal: 20, marginBottom: 16 },
  sectionTitle: {
    fontSize: 11, fontWeight: '800', color: C.inkFaint,
    letterSpacing: 1.5, marginBottom: 8, textTransform: 'uppercase',
  },
  sectionCard: {
    backgroundColor: C.bgCard, borderRadius: 14, borderWidth: 1.5,
    borderColor: C.line, overflow: 'hidden',
    shadowColor: '#00000008', shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6, elevation: 1,
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.lineLight,
  },
  label: { fontSize: 13, fontWeight: '700', color: C.inkMid },
  value: { fontSize: 13, fontWeight: '800', color: C.ink, fontFamily: 'monospace' },
  emptyState: { padding: 40, alignItems: 'center' },
  emptyText: { color: C.inkFaint, fontWeight: '600' },
});
