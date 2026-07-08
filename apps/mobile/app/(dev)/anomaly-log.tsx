/**
 * Anomaly Log — DEV ONLY
 * Displays the in-memory ring buffer of anomaly events from the detection engine.
 * Shows detection phase, z-score, confidence, and per-feature breakdown.
 * Used to validate the detection pipeline during test rides.
 */
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDetectionStore, type AnomalyLogEntry } from '@/store/detectionStore';
import { useCalibrationStore } from '@/store/calibrationStore';

const PHASE_COLORS: Record<string, string> = {
  NORMAL: '#2ECC71',
  ANOMALY_STAGE1: '#F39C12',
  STAGE2_CLASSIFYING: '#FF8C3B',
  CRASH_CONFIRMED: '#FF3B3B',
  FALSE_ALARM: '#8888AA',
};

export default function AnomalyLogScreen() {
  const { anomalyLog, clearLog, phase } = useDetectionStore();
  const calibration = useCalibrationStore();
  const isValid = calibration.userBaseline?.isValid ?? false;
  const sampleCount = calibration.baseline.sampleCount;

  const reversed = [...anomalyLog].reverse();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Anomaly Log</Text>
          <Text style={styles.subtitle}>DEV ONLY · {anomalyLog.length} events</Text>
        </View>
        <TouchableOpacity style={styles.clearBtn} onPress={clearLog}>
          <Text style={styles.clearBtnText}>Clear</Text>
        </TouchableOpacity>
      </View>

      {/* Current detection state */}
      <View style={styles.stateCard}>
        <View style={styles.stateRow}>
          <Text style={styles.stateLabel}>Detection Phase</Text>
          <Text style={[styles.stateValue, { color: PHASE_COLORS[phase] ?? '#FFFFFF' }]}>
            {phase}
          </Text>
        </View>
        <View style={styles.stateRow}>
          <Text style={styles.stateLabel}>Baseline Valid</Text>
          <Text style={[styles.stateValue, { color: isValid ? '#2ECC71' : '#FF3B3B' }]}>
            {isValid ? `YES (${sampleCount} samples)` : `NO (${sampleCount}/${100})`}
          </Text>
        </View>
        <View style={styles.stateRow}>
          <Text style={styles.stateLabel}>Detection Enabled</Text>
          <Text style={[styles.stateValue, { color: isValid ? '#2ECC71' : '#666680' }]}>
            {isValid ? 'YES — riding' : 'NO — requires calibration'}
          </Text>
        </View>
      </View>

      {/* Log entries */}
      <ScrollView showsVerticalScrollIndicator={false}>
        {reversed.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📊</Text>
            <Text style={styles.emptyText}>No anomaly events yet</Text>
            <Text style={styles.emptySubtext}>Start a ride — events appear here in real time</Text>
          </View>
        ) : (
          reversed.map((entry) => <AnomalyCard key={entry.id} entry={entry} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function AnomalyCard({ entry }: { entry: AnomalyLogEntry }) {
  const phaseColor = PHASE_COLORS[entry.phase] ?? '#FFFFFF';
  const time = new Date(entry.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <View style={styles.card}>
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={[styles.phaseBadge, { backgroundColor: phaseColor + '22', borderColor: phaseColor + '66' }]}>
          <Text style={[styles.phaseBadgeText, { color: phaseColor }]}>{entry.phase}</Text>
        </View>
        <Text style={styles.timestamp}>{time}</Text>
      </View>

      {/* Z-score and confidence */}
      <View style={styles.scoreRow}>
        <ScoreCell label="Composite Z" value={entry.compositeZScore.toFixed(2)} highlight={entry.compositeZScore >= 4.5} />
        <ScoreCell label="Confidence" value={`${(entry.confidence * 100).toFixed(0)}%`} highlight={entry.confidence > 0.5} />
        <ScoreCell label="Alarm" value={entry.triggeredAlarm ? 'YES' : 'no'} highlight={entry.triggeredAlarm} />
      </View>

      {/* Per-feature z-scores */}
      <View style={styles.featuresGrid}>
        {Object.entries(entry.perFeatureZScores).map(([key, rawZ]) => {
          const z = rawZ ?? 0;
          return (
            <View key={key} style={styles.featureCell}>
              <Text style={styles.featureKey} numberOfLines={1}>
                {formatFeatureKey(key)}
              </Text>
              <Text style={[
                styles.featureZ,
                { color: Math.abs(z) >= 4.5 ? '#FF3B3B' : Math.abs(z) >= 2 ? '#F39C12' : '#666680' }
              ]}>
                {z >= 0 ? '+' : ''}{z.toFixed(1)}σ
              </Text>
            </View>
          );
        })}
      </View>

      {/* Reason */}
      <Text style={styles.reason} numberOfLines={2}>{entry.reason}</Text>
    </View>
  );
}

function ScoreCell({ label, value, highlight }: { label: string; value: string; highlight: boolean }) {
  return (
    <View style={styles.scoreCell}>
      <Text style={styles.scoreCellLabel}>{label}</Text>
      <Text style={[styles.scoreCellValue, highlight && styles.scoreCellHighlight]}>{value}</Text>
    </View>
  );
}

function formatFeatureKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .replace('Accel', 'Acc')
    .replace('Magnitude', 'Mag')
    .replace('Barometric', 'Baro')
    .trim();
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F14' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: { fontSize: 22, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5 },
  subtitle: { fontSize: 11, color: '#FF8C3B', fontWeight: '600', marginTop: 2 },
  clearBtn: {
    backgroundColor: '#1E1E2A',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  clearBtnText: { fontSize: 12, color: '#666680', fontWeight: '700' },
  stateCard: {
    margin: 16,
    backgroundColor: '#16161E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2A36',
    overflow: 'hidden',
  },
  stateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E2A',
  },
  stateLabel: { fontSize: 12, color: '#666680', fontWeight: '500' },
  stateValue: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  emptyState: { flex: 1, alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#444456' },
  emptySubtext: { fontSize: 13, color: '#2A2A36', textAlign: 'center', paddingHorizontal: 40 },
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#16161E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2A36',
    padding: 14,
    gap: 10,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  phaseBadge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  phaseBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  timestamp: { fontSize: 11, color: '#444456', fontVariant: ['tabular-nums'] },
  scoreRow: { flexDirection: 'row', gap: 8 },
  scoreCell: {
    flex: 1,
    backgroundColor: '#1E1E2A',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
  },
  scoreCellLabel: { fontSize: 9, color: '#555566', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  scoreCellValue: { fontSize: 14, fontWeight: '700', color: '#AAAABC', fontVariant: ['tabular-nums'] },
  scoreCellHighlight: { color: '#FF3B3B' },
  featuresGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  featureCell: {
    backgroundColor: '#1E1E2A',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    minWidth: 88,
  },
  featureKey: { fontSize: 9, color: '#555566', marginBottom: 1 },
  featureZ: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  reason: { fontSize: 11, color: '#555566', lineHeight: 16 },
});
