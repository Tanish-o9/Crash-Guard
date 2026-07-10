/**
 * Crash Simulator — DEV ONLY
 * Injects a synthetic sensor window that mimics a high-severity crash.
 * Used to test the full pipeline: anomaly → alarm → countdown → call.
 *
 * SAFETY: __DEV__ gated — this screen is unreachable in production.
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
import { runStage1, runStage2StillnessCheck } from '@/services/crashDetector';
import type { SensorFeatures } from '@crashguard/types';

// ─── Crash presets ────────────────────────────────────────────────────────────

const CRASH_PRESETS: Record<string, { label: string; emoji: string; features: SensorFeatures }> = {
  highSpeed: {
    label: 'High-speed collision',
    emoji: '💥',
    features: {
      peakAccelMagnitude: 55.0,  // ~5.6G
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
      peakAccelMagnitude: 22.0,  // ~2.2G
      peakJerk: 55.0,
      gpsSpeedDelta: 4.0,
      rotationRateSpike: 5.5,
      postEventStillness: 0.12,
      barometricDelta: 0.0,
    },
  },
  pothole: {
    label: 'Pothole (should be false alarm)',
    emoji: '🕳️',
    features: {
      peakAccelMagnitude: 18.0,  // ~1.8G - barely over floor
      peakJerk: 30.0,
      gpsSpeedDelta: 0.5,
      rotationRateSpike: 1.2,
      postEventStillness: 2.5,   // still moving
      barometricDelta: 0.0,
    },
  },
};

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CrashSimulatorScreen() {
  const router = useRouter();
  const [selectedPreset, setSelectedPreset] = useState<string>('highSpeed');
  const [autoTrigger, setAutoTrigger] = useState(true);
  const [result, setResult] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const { setLatestFeatures, setStatus } = useSensorStore();
  const { startAlarm } = useAlarmStore();
  const { processWindow, reportStillnessCheck, resetToNormal } = useDetectionStore();

  async function runSimulation() {
    if (isRunning) return;
    if (!__DEV__) {
      Alert.alert('Not available', 'Crash simulator is only available in dev builds.');
      return;
    }

    setIsRunning(true);
    setResult(null);

    const preset = CRASH_PRESETS[selectedPreset];
    const features = preset.features;

    // 1. Temporarily set status to riding so detection gates pass
    setStatus('riding');
    setLatestFeatures(features);

    // 2. Run Stage 1 twice (hysteresis requires 2 consecutive windows)
    const r1 = runStage1(features);
    const phase1 = processWindow(features, r1);

    let log = `✅ Window 1: z=${r1.compositeZScore.toFixed(2)} → ${phase1}\n`;

    const r2 = runStage1(features);
    const phase2 = processWindow(features, r2);

    log += `✅ Window 2: z=${r2.compositeZScore.toFixed(2)} → ${phase2}\n`;

    if (phase2 === 'STAGE2_CLASSIFYING') {
      // 3. Run Stage 2 with stillness windows
      const isStill = features.postEventStillness < 0.5 && features.peakAccelMagnitude < 2.5;
      // For simulation, still = postEventStillness < 1.0
      const stillSim = features.postEventStillness < 1.0;

      reportStillnessCheck(stillSim);
      reportStillnessCheck(stillSim);
      const finalPhase = reportStillnessCheck(stillSim);

      log += `✅ Stillness check: still=${stillSim} → ${finalPhase}\n`;

      if (finalPhase === 'CRASH_CONFIRMED' && autoTrigger) {
        log += `🚨 Triggering alarm!\n`;
        await startAlarm('manual_test');
        setIsRunning(false);
        setResult(log);
        router.push('/alarm');
        return;
      } else if (finalPhase === 'FALSE_ALARM') {
        log += `✅ False alarm detected correctly.`;
      }
    } else {
      log += `ℹ️ Calibration not valid — detection gates blocked triggering.\n`;
      log += `To bypass, calibration must be valid. Run a calibration ride first.`;
    }

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
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>💥 Crash Simulator</Text>
          <Text style={styles.subtitle}>DEV ONLY · Injects synthetic sensor data</Text>
        </View>

        {/* Warning */}
        <View style={styles.warningCard}>
          <Text style={styles.warningText}>
            ⚠️  This bypasses calibration gates to simulate a crash event. The pipeline is still fully deterministic — this just provides the input.
          </Text>
        </View>

        {/* Preset selector */}
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
                <FeatureChip label="Accel" value={`${CRASH_PRESETS[key].features.peakAccelMagnitude.toFixed(0)} m/s²`} />
                <FeatureChip label="Jerk" value={`${CRASH_PRESETS[key].features.peakJerk.toFixed(0)}`} />
                <FeatureChip label="Still" value={`${CRASH_PRESETS[key].features.postEventStillness.toFixed(2)}`} />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Auto-trigger toggle */}
        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.toggleLabel}>Auto-trigger alarm</Text>
            <Text style={styles.toggleSub}>Navigate to /alarm on CRASH_CONFIRMED</Text>
          </View>
          <Switch
            value={autoTrigger}
            onValueChange={setAutoTrigger}
            trackColor={{ false: '#2A2A36', true: '#FF3B3B' }}
            thumbColor="#FFFFFF"
          />
        </View>

        {/* Run button */}
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

        {/* Result log */}
        {result && (
          <View style={[styles.resultCard, result.includes('🚨') && styles.resultError]}>
            <Text style={[styles.resultTitle, result.includes('🚨') && styles.resultErrorText]}>Simulation Output</Text>
            <Text style={[styles.resultText, result.includes('🚨') && styles.resultErrorText]}>{result}</Text>
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
  sectionTitle: {
    fontSize: 11, fontWeight: '800', color: C.inkFaint, letterSpacing: 1.5,
    textTransform: 'uppercase', marginHorizontal: 20, marginBottom: 10,
  },
  presetsGrid: { paddingHorizontal: 16, gap: 10, marginBottom: 20 },
  presetCard: {
    backgroundColor: C.bgCard, borderRadius: 18, borderWidth: 1.5,
    borderColor: C.line, padding: 16, gap: 8,
    shadowColor: '#00000008', shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6, elevation: 1,
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
    paddingVertical: 18, alignItems: 'center', shadowColor: C.coral,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
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
  resultErrorText: { color: C.coral },
});
