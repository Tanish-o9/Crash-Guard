/**
 * Calibration onboarding screen (Step 6 of setup).
 *
 * Shown after permissions step if no valid baseline exists.
 * Guides the user through a 5-minute calibration ride.
 *
 * The actual calibration happens passively in the background via useCalibration()
 * as soon as riding mode is active. This screen just shows progress and waits.
 *
 * Users can skip calibration — they'll be reminded later. Without calibration,
 * the anomaly detector is disabled (prevents false positives on a cold start).
 */
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/authStore';
import { useSensorPipeline } from '@/hooks/useSensorPipeline';
import { useCalibration } from '@/hooks/useCalibration';
import { MIN_BASELINE_SAMPLES } from '@crashguard/constants';

const CALIBRATION_TIPS = [
  'Ride at your normal speed on a familiar route',
  'Avoid deliberately braking hard or swerving',
  'This only needs to happen once — it refines automatically after',
  'You can skip now and calibrate later from Settings',
];

export default function CalibrationScreen() {
  const router = useRouter();
  const { setOnboarded } = useAuthStore();
  const { isRiding, toggleRidingMode } = useSensorPipeline();
  const { progressFraction, etaString, sampleCount, isValid } = useCalibration();

  // Animated ring
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Spinning ring while calibrating
    if (isRiding && !isValid) {
      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
          easing: Easing.linear,
        })
      ).start();
    } else {
      rotateAnim.stopAnimation();
    }

    // Pulse when done
    if (isValid) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [isRiding, isValid]);

  const rotate = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  function handleFinish() {
    setOnboarded(true);
    // Root layout Redirect will navigate to (tabs)
  }

  function handleSkip() {
    setOnboarded(true);
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.stepRow}>
          {[1, 2, 3, 4, 5].map(i => (
            <View key={i} style={styles.stepPill} />
          ))}
          <View style={[styles.stepPill, styles.stepPillActive]} />
        </View>
        <Text style={styles.stepLabel}>6/6</Text>
      </View>

      {/* Title */}
      <View style={styles.content}>
        <Text style={styles.title}>Calibrate your{'\n'}baseline</Text>
        <Text style={styles.subtitle}>
          Ride normally for ~5 minutes while CrashGuard learns your
          riding patterns. This eliminates false alarms.
        </Text>

        {/* Progress ring */}
        <View style={styles.ringOuter}>
          {/* Background ring */}
          <View style={styles.ringTrack} />

          {/* Spinning accent (while calibrating) */}
          {isRiding && !isValid && (
            <Animated.View
              style={[styles.ringSpinner, { transform: [{ rotate }] }]}
            />
          )}

          {/* Center content */}
          <Animated.View style={[styles.ringCenter, { transform: [{ scale: pulseAnim }] }]}>
            {isValid ? (
              <>
                <Text style={styles.ringDoneIcon}>✓</Text>
                <Text style={styles.ringDoneText}>Calibrated!</Text>
              </>
            ) : (
              <>
                <Text style={styles.ringPercent}>
                  {Math.round(progressFraction * 100)}%
                </Text>
                <Text style={styles.ringEta}>{etaString}</Text>
                <Text style={styles.ringSamples}>{sampleCount}/{MIN_BASELINE_SAMPLES}</Text>
              </>
            )}
          </Animated.View>
        </View>

        {/* Start/Stop button */}
        {!isValid && (
          <TouchableOpacity
            style={[styles.startBtn, isRiding && styles.startBtnActive]}
            onPress={toggleRidingMode}
            activeOpacity={0.85}
          >
            <Text style={styles.startBtnText}>
              {isRiding ? '⬛ Stop Calibration' : '▶ Start Calibration Ride'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Tips */}
        {!isValid && (
          <View style={styles.tipsCard}>
            {CALIBRATION_TIPS.map((tip, i) => (
              <View key={i} style={styles.tipRow}>
                <Text style={styles.tipBullet}>·</Text>
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Done or skip */}
        {isValid ? (
          <TouchableOpacity style={styles.doneBtn} onPress={handleFinish} activeOpacity={0.85}>
            <Text style={styles.doneBtnText}>Go to App →</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
            <Text style={styles.skipText}>Skip — I'll calibrate later</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const RING_SIZE = 200;
const RING_THICKNESS = 10;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F14' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  stepRow: { flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center' },
  stepPill: { height: 4, width: 28, borderRadius: 2, backgroundColor: '#FF3B3B66' },
  stepPillActive: { backgroundColor: '#FF3B3B', width: 40 },
  stepLabel: { width: 72, textAlign: 'right', fontSize: 12, color: '#666680', fontWeight: '600' },
  content: { flex: 1, paddingHorizontal: 24, paddingBottom: 24 },
  title: {
    fontSize: 30,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.8,
    marginBottom: 10,
    marginTop: 16,
    lineHeight: 38,
  },
  subtitle: { fontSize: 14, color: '#666680', lineHeight: 22, marginBottom: 40 },
  ringOuter: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 36,
  },
  ringTrack: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: RING_THICKNESS,
    borderColor: '#1E1E2A',
  },
  ringSpinner: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: RING_THICKNESS,
    borderColor: 'transparent',
    borderTopColor: '#FF3B3B',
    borderRightColor: '#FF3B3B44',
  },
  ringCenter: { alignItems: 'center', gap: 4 },
  ringPercent: { fontSize: 42, fontWeight: '900', color: '#FFFFFF', letterSpacing: -2 },
  ringEta: { fontSize: 13, color: '#666680', fontWeight: '600' },
  ringSamples: { fontSize: 11, color: '#444456' },
  ringDoneIcon: { fontSize: 52, color: '#2ECC71' },
  ringDoneText: { fontSize: 16, fontWeight: '800', color: '#2ECC71' },
  startBtn: {
    backgroundColor: '#FF3B3B',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#FF3B3B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  startBtnActive: { backgroundColor: '#2A2A36', shadowOpacity: 0 },
  startBtnText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  tipsCard: {
    backgroundColor: '#16161E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A36',
    gap: 10,
    marginBottom: 20,
  },
  tipRow: { flexDirection: 'row', gap: 8 },
  tipBullet: { fontSize: 14, color: '#FF3B3B', marginTop: 1 },
  tipText: { flex: 1, fontSize: 13, color: '#666680', lineHeight: 19 },
  doneBtn: {
    backgroundColor: '#0D2A1A',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#2A6B3A',
    shadowColor: '#2ECC71',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  doneBtnText: { fontSize: 16, fontWeight: '800', color: '#2ECC71' },
  skipBtn: { alignItems: 'center', paddingVertical: 12 },
  skipText: { fontSize: 14, color: '#444456', fontWeight: '600' },
});
