/**
 * Crash Simulator — DEV ONLY
 * Injects a synthetic sensor window that mimics a high-severity crash.
 */
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useSensorStore } from '@/store/sensorStore';
import { useAlarmStore } from '@/store/alarmStore';
import { useDetectionStore } from '@/store/detectionStore';
import type { SensorFeatures } from '@crashguard/types';

const CRASH_PRESETS: Record<string, { label: string; emoji: string; features: SensorFeatures }> = {
  highSpeed: {
    label: 'High-speed collision',
    emoji: '💥',
    features: {
      peakAccelMagnitude: 55.0,
      peakJerk: 140.0,
      gpsSpeedDelta: 18.0,
      rotationRateSpike: 12.0,
      postEventStillness: 0.08,
      barometricDelta: 0.5,
    },
  },
  lowSpeed: {
    label: 'Low-speed fall',
    emoji: '🤕',
    features: {
      peakAccelMagnitude: 22.0,
      peakJerk: 55.0,
      gpsSpeedDelta: 4.0,
      rotationRateSpike: 5.5,
      postEventStillness: 0.12,
      barometricDelta: 0.0,
    },
  },
  pothole: {
    label: 'Pothole (false alarm test)',
    emoji: '🕳️',
    features: {
      peakAccelMagnitude: 18.0,
      peakJerk: 30.0,
      gpsSpeedDelta: 0.5,
      rotationRateSpike: 1.2,
      postEventStillness: 2.5,
      barometricDelta: 0.0,
    },
  },
};

export default function CrashSimulatorScreen() {
  const router = useRouter();
  const [selectedPreset, setSelectedPreset] = useState<string>('highSpeed');
  const [autoTrigger, setAutoTrigger] = useState(true);
  const [result, setResult] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const { setLatestFeatures, setStatus } = useSensorStore();
  const { startAlarm } = useAlarmStore();
  const { resetToNormal } = useDetectionStore();

  async function runSimulation() {
    if (isRunning) return;

    setIsRunning(true);
    setResult(null);

    const preset = CRASH_PRESETS[selectedPreset];
    const features = preset.features;

    setStatus('riding');
    setLatestFeatures(features);

    let log = `🚨 Simulating: ${preset.label}\n`;
    log += `Accel: ${features.peakAccelMagnitude} m/s² | Jerk: ${features.peakJerk}\n`;

    if (autoTrigger) {
      log += `✅ Alarm triggered!`;
      await startAlarm('manual_test');
      setIsRunning(false);
      setResult(log);
      router.push('/alarm');
      return;
    }

    log += `ℹ️ Auto-trigger is OFF — alarm not fired.`;
    setResult(log);
    setIsRunning(false);
  }

  function handleReset() {
    resetToNormal();
    setResult(null);
    Alert.alert('Reset', 'Detection state reset to NORMAL.');
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>💥 Crash Simulator</Text>
          <Text style={styles.subtitle}>DEV ONLY · Injects synthetic sensor data</Text>
        </View>

        <View style={styles.warningCard}>
          <Text style={styles.warningText}>
            ⚠️  Directly triggers the alarm screen. Auto-trigger must be ON.
          </Text>
        </View>

        <Text style={styles.sectionLabel}>CRASH PRESET</Text>
        <View style={styles.presetsGrid}>
          {Object.entries(CRASH_PRESETS).map(([key, preset]) => (
            <TouchableOpacity
              key={key}
              style={[styles.presetCard, selectedPreset === key && styles.presetCardActive]}
              onPress={() => setSelectedPreset(key)}
              activeOpacity={0.8}
            >
              <Text style={styles.presetEmoji}>{preset.emoji}</Text>
              <Text style={[styles.presetLabel, selectedPreset === key && styles.presetLabelActive]}>
                {preset.label}
              </Text>
              <View style={styles.presetFeatures}>
                <FeatureChip label="Accel" value={`${preset.features.peakAccelMagnitude.toFixed(0)} m/s²`} />
                <FeatureChip label="Jerk" value={`${preset.features.peakJerk.toFixed(0)}`} />
                <FeatureChip label="Still" value={`${preset.features.postEventStillness.toFixed(2)}`} />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.toggleLabel}>Auto-trigger alarm</Text>
            <Text style={styles.toggleSub}>Navigate to /alarm on run</Text>
          </View>
          <Switch
            value={autoTrigger}
            onValueChange={setAutoTrigger}
            trackColor={{ false: '#2A2A36', true: '#FF3B3B' }}
            thumbColor="#FFFFFF"
          />
        </View>

        <TouchableOpacity
          style={[styles.runBtn, isRunning && styles.runBtnDisabled]}
          onPress={runSimulation}
          activeOpacity={0.8}
          disabled={isRunning}
        >
          <Text style={styles.runBtnText}>{isRunning ? '⏳ Running…' : '▶ Run Simulation'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.resetBtn} onPress={handleReset} activeOpacity={0.8}>
          <Text style={styles.resetBtnText}>↺ Reset Detection State</Text>
        </TouchableOpacity>

        {result && (
          <View style={[styles.resultCard, result.includes('🚨') && styles.resultError]}>
            <Text style={styles.resultTitle}>Simulation Output</Text>
            <Text style={styles.resultText}>{result}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function FeatureChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={styles.chipValue}>{value}</Text>
    </View>
  );
}

const C = {
  bgCard: '#FFFFFF', sage: '#4A7060', sagePale: '#C4D8CC', sageTint: '#EBF3EF',
  ink: '#1C2826', inkMid: '#445550', inkFaint: '#8A9E96',
  line: '#DDD6C8', lineLight: '#EAE4D8', coral: '#C8503C', coralTint: '#FAE8E5',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F0E8' },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '900', color: C.ink, letterSpacing: -0.5 },
  subtitle: { fontSize: 11, color: C.sage, fontWeight: '800', marginTop: 2, letterSpacing: 0.5 },
  warningCard: {
    marginHorizontal: 16, marginBottom: 20, backgroundColor: '#1A150A',
    borderRadius: 12, borderWidth: 1, borderColor: '#F39C1244', padding: 12,
  },
  warningText: { fontSize: 12, color: '#F39C12', lineHeight: 18 },
  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: C.inkFaint, letterSpacing: 1.5,
    textTransform: 'uppercase', marginHorizontal: 20, marginBottom: 10,
  },
  presetsGrid: { paddingHorizontal: 16, gap: 10, marginBottom: 20 },
  presetCard: {
    backgroundColor: C.bgCard, borderRadius: 18, borderWidth: 1.5,
    borderColor: C.line, padding: 16, gap: 8,
  },
  presetCardActive: { borderColor: C.sage, backgroundColor: C.sageTint },
  presetEmoji: { fontSize: 24 },
  presetLabel: { fontSize: 14, fontWeight: '800', color: C.inkMid },
  presetLabelActive: { color: C.ink },
  presetFeatures: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { backgroundColor: C.lineLight, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  chipLabel: { fontSize: 9, color: C.inkMid, textTransform: 'uppercase', fontWeight: '800' },
  chipValue: { fontSize: 11, color: C.ink, fontWeight: '800', fontFamily: 'monospace' },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 16, marginBottom: 20, backgroundColor: C.bgCard, borderRadius: 18,
    borderWidth: 1.5, borderColor: C.line, padding: 16,
  },
  toggleLabel: { fontSize: 14, fontWeight: '800', color: C.ink },
  toggleSub: { fontSize: 12, color: C.inkFaint, marginTop: 2 },
  runBtn: {
    marginHorizontal: 16, marginBottom: 10, backgroundColor: C.coral, borderRadius: 18,
    paddingVertical: 18, alignItems: 'center',
  },
  runBtnDisabled: { opacity: 0.5 },
  runBtnText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },
  resetBtn: {
    marginHorizontal: 16, marginBottom: 20, backgroundColor: C.bgCard, borderRadius: 18,
    paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: C.line,
  },
  resetBtnText: { fontSize: 14, fontWeight: '700', color: C.inkMid },
  resultCard: {
    marginHorizontal: 16, marginBottom: 40, backgroundColor: C.sageTint, borderRadius: 18,
    borderWidth: 1.5, borderColor: C.sagePale, padding: 16,
  },
  resultTitle: { fontSize: 13, fontWeight: '800', color: C.sage, marginBottom: 8, textTransform: 'uppercase' },
  resultText: { fontSize: 12, color: C.inkMid, fontFamily: 'monospace', lineHeight: 18 },
  resultError: { backgroundColor: C.coralTint, borderColor: C.coral + '44' },
});
