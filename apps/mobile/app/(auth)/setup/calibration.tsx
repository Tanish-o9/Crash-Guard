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
  Platform,
} from 'react-native';
import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { useSensorPipeline } from '@/hooks/useSensorPipeline';
import { useCalibration } from '@/hooks/useCalibration';
import { MIN_BASELINE_SAMPLES } from '@crashguard/constants';

const C = {
  bg: '#F5F0E8', bgDeep: '#EDE7D9', bgCard: '#FFFFFF',
  sage: '#4A7060', sagePale: '#C4D8CC', sageTint: '#EBF3EF', teal: '#356060',
  ink: '#1C2826', inkMid: '#445550', inkFaint: '#8A9E96',
  line: '#DDD6C8', lineLight: '#EAE4D8',
};

const CALIBRATION_TIPS = [
  'Ride at your normal speed on a familiar route',
  'Avoid deliberately braking hard or swerving',
  'This only needs to happen once — it refines automatically after',
  'You can skip now and calibrate later from Settings',
];

const RING_SIZE = 220;
const RING_THICKNESS = 12;

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
    <SafeAreaView style={s.root}>
      {/* Background art */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient colors={[C.bg, C.bgDeep]} style={StyleSheet.absoluteFill} />
        <View style={bg.arcTR} />
        <View style={bg.arcBL} />
        <View style={bg.bracketH} />
        <View style={bg.bracketV} />
      </View>

      {/* Header */}
      <View style={s.header}>
        <View style={s.stepRow}>
          {[1, 2, 3, 4, 5].map(i => (
            <View key={i} style={s.stepPill} />
          ))}
          <View style={[s.stepPill, s.stepPillActive]} />
        </View>
        <Text style={s.stepLabel}>6/6</Text>
      </View>

      {/* Title */}
      <View style={s.content}>
        <Text style={s.title}>Calibrate your{'\n'}baseline</Text>
        <Text style={s.subtitle}>
          Ride normally for ~5 minutes while CrashGuard learns your
          riding patterns. This eliminates false alarms.
        </Text>

        {/* Progress ring */}
        <View style={s.ringOuter}>
          {/* Background ring */}
          <View style={s.ringTrack} />

          {/* Spinning accent (while calibrating) */}
          {isRiding && !isValid && (
            <Animated.View
              style={[s.ringSpinner, { transform: [{ rotate }] }]}
            />
          )}

          {/* Center content */}
          <Animated.View style={[s.ringCenter, { transform: [{ scale: pulseAnim }] }]}>
            {isValid ? (
              <>
                <Feather name="check" style={s.ringDoneIcon} />
                <Text style={s.ringDoneText}>Calibrated!</Text>
              </>
            ) : (
              <>
                <Text style={s.ringPercent}>
                  {Math.round(progressFraction * 100)}%
                </Text>
                <Text style={s.ringEta}>{etaString}</Text>
                <Text style={s.ringSamples}>{sampleCount}/{MIN_BASELINE_SAMPLES}</Text>
              </>
            )}
          </Animated.View>
        </View>

        {/* Start/Stop button */}
        {!isValid && (
          <TouchableOpacity
            style={[s.startBtn, isRiding && s.startBtnActive]}
            onPress={toggleRidingMode}
            activeOpacity={0.85}
          >
            {isRiding ? (
              <View style={s.startBtnInnerActive}>
                <Text style={[s.startBtnText, { color: C.inkFaint }]}>Stop Calibration</Text>
              </View>
            ) : (
              <LinearGradient colors={[C.sage, C.teal]} style={s.startBtnInner}>
                <Text style={s.startBtnText}>Start Calibration Ride</Text>
                <Feather name="play" size={18} color="#FFFFFF" />
              </LinearGradient>
            )}
          </TouchableOpacity>
        )}

        {/* Tips */}
        {!isValid && (
          <View style={s.tipsCard}>
            {CALIBRATION_TIPS.map((tip, i) => (
              <View key={i} style={s.tipRow}>
                <Feather name="info" size={14} color={C.sage} style={{ marginTop: 2 }} />
                <Text style={s.tipText}>{tip}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Done or skip */}
        {isValid ? (
          <TouchableOpacity style={s.doneBtnWrap} onPress={handleFinish} activeOpacity={0.88}>
            <LinearGradient colors={[C.sage, C.teal]} style={s.doneBtnInner}>
              <Text style={s.startBtnText}>Go to App</Text>
              <Feather name="arrow-right" size={18} color="#FFFFFF" />
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={s.skipBtn} onPress={handleSkip}>
            <Text style={s.skipText}>Skip — I'll calibrate later</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const bg = StyleSheet.create({
  arcTR:    { position: 'absolute', width: 280, height: 280, borderRadius: 140, borderWidth: 1, borderColor: C.sagePale, top: -130, right: -70 },
  arcBL:    { position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 1, borderColor: C.lineLight, bottom: 100, left: -70 },
  bracketH: { position: 'absolute', top: 16, left: 16, width: 22, height: 1, backgroundColor: C.sage, opacity: 0.3 },
  bracketV: { position: 'absolute', top: 16, left: 16, width: 1, height: 22, backgroundColor: C.sage, opacity: 0.3 },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14,
  },
  stepRow: { flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center' },
  stepPill: { height: 4, width: 26, borderRadius: 2, backgroundColor: C.sagePale },
  stepPillActive: { backgroundColor: C.sage, width: 38 },
  stepLabel: { width: 80, textAlign: 'right', fontSize: 12, color: C.inkFaint, fontWeight: '700', letterSpacing: 0.5 },
  
  content: { flex: 1, paddingHorizontal: 24, paddingBottom: 24 },
  title: {
    fontSize: 32, fontWeight: '900', color: C.ink, letterSpacing: -0.8,
    marginBottom: 10, marginTop: 16, lineHeight: 40,
    fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Heavy' : 'sans-serif-black',
  },
  subtitle: {
    fontSize: 14, color: C.inkFaint, lineHeight: 22, marginBottom: 40,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  
  ringOuter: {
    width: RING_SIZE, height: RING_SIZE, alignSelf: 'center',
    alignItems: 'center', justifyContent: 'center', marginBottom: 40,
  },
  ringTrack: {
    position: 'absolute', width: RING_SIZE, height: RING_SIZE,
    borderRadius: RING_SIZE / 2, borderWidth: RING_THICKNESS, borderColor: C.line,
  },
  ringSpinner: {
    position: 'absolute', width: RING_SIZE, height: RING_SIZE,
    borderRadius: RING_SIZE / 2, borderWidth: RING_THICKNESS,
    borderColor: 'transparent', borderTopColor: C.sage, borderRightColor: C.sagePale,
  },
  ringCenter: { alignItems: 'center', gap: 4, backgroundColor: C.bgCard, width: RING_SIZE - RING_THICKNESS * 2, height: RING_SIZE - RING_THICKNESS * 2, borderRadius: RING_SIZE / 2, justifyContent: 'center' },
  ringPercent: {
    fontSize: 48, fontWeight: '900', color: C.ink, letterSpacing: -2,
    fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Heavy' : 'sans-serif-black',
  },
  ringEta: { fontSize: 13, color: C.inkFaint, fontWeight: '700' },
  ringSamples: { fontSize: 11, color: C.inkFaint },
  ringDoneIcon: { fontSize: 48, color: C.sage },
  ringDoneText: { fontSize: 16, fontWeight: '800', color: C.sage },
  
  startBtn: {
    borderRadius: 18, overflow: 'hidden', marginBottom: 20,
    shadowColor: C.sage, shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28, shadowRadius: 12, elevation: 6,
  },
  startBtnActive: { shadowOpacity: 0, elevation: 0 },
  startBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18,
  },
  startBtnInnerActive: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18,
    backgroundColor: C.lineLight,
  },
  startBtnText: {
    fontSize: 16, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.3,
    fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Bold' : 'sans-serif-medium',
  },
  
  tipsCard: {
    backgroundColor: C.bgCard, borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: C.line, gap: 12, marginBottom: 20,
  },
  tipRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  tipText: {
    flex: 1, fontSize: 13, color: C.inkMid, lineHeight: 19,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  
  doneBtnWrap: {
    borderRadius: 18, overflow: 'hidden', marginBottom: 20,
    shadowColor: C.sage, shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28, shadowRadius: 12, elevation: 6,
  },
  doneBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18,
  },
  
  skipBtn: { alignItems: 'center', paddingVertical: 12 },
  skipText: { fontSize: 14, color: C.inkFaint, fontWeight: '700' },
});
