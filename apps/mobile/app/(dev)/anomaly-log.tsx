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
  NORMAL:              '#3A8050',
  ANOMALY_STAGE1:      '#B87830',
  STAGE2_CLASSIFYING:  '#C8503C',
  CRASH_CONFIRMED:     '#C8503C',
  FALSE_ALARM:         '#8A9E96',
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
  container: { flex: 1, backgroundColor: '#F5F0E8' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EAE4D8',
  },
  title: { fontSize: 24, fontWeight: '900', color: '#1C2826', letterSpacing: -0.5 },
  subtitle: { fontSize: 11, color: '#B87830', fontWeight: '700', marginTop: 2, letterSpacing: 0.5 },
  clearBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#DDD6C8',
  },
  clearBtnText: { fontSize: 12, color: '#445550', fontWeight: '700' },
  stateCard: {
    margin: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DDD6C8',
    overflow: 'hidden',
  },
  stateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EAE4D8',
  },
  stateLabel: { fontSize: 12, color: '#8A9E96', fontWeight: '600' },
  stateValue: { fontSize: 12, fontWeight: '800', color: '#1C2826', fontVariant: ['tabular-nums'] },
  emptyState: { flex: 1, alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#445550' },
  emptySubtext: { fontSize: 13, color: '#8A9E96', textAlign: 'center', paddingHorizontal: 40 },
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DDD6C8',
    padding: 14,
    gap: 10,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  phaseBadge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  phaseBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  timestamp: { fontSize: 11, color: '#8A9E96', fontVariant: ['tabular-nums'] },
  scoreRow: { flexDirection: 'row', gap: 8 },
  scoreCell: {
    flex: 1,
    backgroundColor: '#EBF3EF',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  scoreCellLabel: { fontSize: 9, color: '#8A9E96', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  scoreCellValue: { fontSize: 14, fontWeight: '800', color: '#1C2826', fontVariant: ['tabular-nums'] },
  scoreCellHighlight: { color: '#C8503C' },
  featuresGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  featureCell: {
    backgroundColor: '#EAE4D8',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    minWidth: 88,
  },
  featureKey: { fontSize: 9, color: '#8A9E96', marginBottom: 2 },
  featureZ: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'], color: '#445550' },
  reason: { fontSize: 11, color: '#8A9E96', lineHeight: 16 },
});
