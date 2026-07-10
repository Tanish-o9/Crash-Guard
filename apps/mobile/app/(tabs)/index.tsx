import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSensorPipeline } from '@/hooks/useSensorPipeline';
import { useSensorStore } from '@/store/sensorStore';
import { useUserStore } from '@/store/userStore';
import { useCrashDetection } from '@/hooks/useCrashDetection';
import { MAX_BUFFERED_WINDOWS } from '@crashguard/constants';
import { Feather } from '@expo/vector-icons';

const GRAVITY = 9.81;
const magnitude = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z);

// ─── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:        '#F5F0E8',
  bgDeep:    '#EDE7D9',
  bgCard:    '#FFFFFF',
  sage:      '#4A7060',
  sageLight: '#7A9E8E',
  sagePale:  '#C4D8CC',
  sageTint:  '#EBF3EF',
  teal:      '#356060',
  coral:     '#C8503C',
  amber:     '#B87830',
  ink:       '#1C2826',
  inkMid:    '#445550',
  inkFaint:  '#8A9E96',
  line:      '#DDD6C8',
  lineLight: '#EAE4D8',
};

const RING = 188; // central button diameter

export default function HomeScreen() {
  const router = useRouter();
  const { isRiding, isMonitoring, status, toggleRidingMode } = useSensorPipeline();
  const { currentSpeedKmh, latestReading, windowBuffer, lastError } = useSensorStore();
  const { profile } = useUserStore();
  const {
    detectionPhase, isDetectionEnabled, isAnomalyStage1,
    isStage2Classifying, isCrashConfirmed,
  } = useCrashDetection();

  const live     = isRiding || isMonitoring ? latestReading : null;
  const gForce   = live ? magnitude(live.ax, live.ay, live.az) / GRAVITY : null;
  const gyroMag  = live ? magnitude(live.gx, live.gy, live.gz) : null;

  // ── Animated values ─────────────────────────────────────────────────────────
  // Rule: each Animated.Value is used with ONE driver type forever.
  // "N" = useNativeDriver:true (opacity / transform only)
  // "J" = useNativeDriver:false (anything else, e.g. shadow, color)

  const outerOpacity = useRef(new Animated.Value(0.25)).current; // N — outer ring fade
  const ring2Scale   = useRef(new Animated.Value(1)).current;    // N — middle ring scale
  const btnScale     = useRef(new Animated.Value(1)).current;    // N — button scale

  const glowRadius   = useRef(new Animated.Value(0)).current;    // J — middle ring shadow

  useEffect(() => {
    if (isRiding || isMonitoring) {
      // Outer ring opacity pulse (native)
      Animated.loop(
        Animated.sequence([
          Animated.timing(outerOpacity, { toValue: 0.85, duration: 1800, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
          Animated.timing(outerOpacity, { toValue: 0.2,  duration: 1800, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
        ])
      ).start();

      // Middle ring scale pulse (native)
      Animated.loop(
        Animated.sequence([
          Animated.timing(ring2Scale, { toValue: 1.07, duration: 2000, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
          Animated.timing(ring2Scale, { toValue: 1,    duration: 2000, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        ])
      ).start();

      // Button scale pulse (native)
      Animated.loop(
        Animated.sequence([
          Animated.timing(btnScale, { toValue: 1.04, duration: 1800, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
          Animated.timing(btnScale, { toValue: 1,    duration: 1800, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        ])
      ).start();

      // Glow radius (JS/non-native — shadow only, on its own Animated.View)
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowRadius, { toValue: 1, duration: 1800, useNativeDriver: false, easing: Easing.inOut(Easing.quad) }),
          Animated.timing(glowRadius, { toValue: 0, duration: 1800, useNativeDriver: false, easing: Easing.inOut(Easing.quad) }),
        ])
      ).start();
    } else {
      outerOpacity.stopAnimation(); outerOpacity.setValue(0.25);
      ring2Scale.stopAnimation();   ring2Scale.setValue(1);
      btnScale.stopAnimation();     btnScale.setValue(1);
      glowRadius.stopAnimation();   glowRadius.setValue(0);
    }
  }, [isRiding, isMonitoring]);

  const shadowR = glowRadius.interpolate({ inputRange: [0, 1], outputRange: [4, 24] });

  const activeColor = isCrashConfirmed ? C.coral
    : isRiding    ? C.sage
    : isMonitoring ? C.amber
    : C.inkFaint;

  const statusLabel = isCrashConfirmed   ? 'CRASH DETECTED'
    : isStage2Classifying ? 'ANALYZING…'
    : isRiding            ? 'MONITORING'
    : isMonitoring        ? 'ALERT MODE'
    : 'STANDBY';

  const firstName = profile?.name ? profile.name.split(' ')[0] : 'Rider';
  const bufferPct = Math.min(1, windowBuffer.length / MAX_BUFFERED_WINDOWS);

  return (
    <SafeAreaView style={s.root} edges={['top']}>

      {/* ════════════════════  BACKGROUND ART  ════════════════════════════ */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">

        {/* Base warm-cream gradient */}
        <LinearGradient colors={[C.bg, '#E8E0D0']} style={StyleSheet.absoluteFill} />

        {/* ── Large quarter-circle top-right ── */}
        <View style={bg.arcTopRight} />

        {/* ── Small filled accent circle top-right ── */}
        <View style={bg.accentDotTR} />

        {/* ── Medium circle bottom-left ── */}
        <View style={bg.arcBottomLeft} />

        {/* ── Fine horizontal rule lines (3 tiers) ── */}
        <View style={bg.hRule1} />
        <View style={bg.hRule2} />
        <View style={bg.hRule3} />

        {/* ── Paired diagonal slash lines ── */}
        <View style={bg.slash1} />
        <View style={bg.slash1b} />
        <View style={bg.slash2} />
        <View style={bg.slash2b} />

        {/* ── Cross-hatch segment (top-right corner detail) ── */}
        {[0,1,2,3,4].map(i => (
          <View
            key={`ch-${i}`}
            style={[bg.crosshatch, { top: 40 + i * 18, right: 28 - i * 4 }]}
          />
        ))}

        {/* ── Dot grid ── */}
        {[0,1,2,3,4,5,6].map(row =>
          [0,1,2,3,4].map(col => (
            <View
              key={`d-${row}-${col}`}
              style={[bg.dot, { top: 110 + row * 68, left: 18 + col * 82 }]}
            />
          ))
        )}

        {/* ── Corner bracket ornament (top-left) ── */}
        <View style={bg.bracketH} />
        <View style={bg.bracketV} />

        {/* ── Fine arc stroke bottom-right ── */}
        <View style={bg.arcBR} />
      </View>
      {/* ═════════════════════════════════════════════════════════════════ */}

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.eyebrow}>Good to see you,</Text>
            <Text style={s.name}>{firstName}</Text>
          </View>

          <View style={[s.statusPill, isRiding && s.statusPillActive]}>
            <View style={[s.statusDot, { backgroundColor: isRiding ? C.sage : C.inkFaint }]} />
            <Text style={[s.statusPillTxt, { color: isRiding ? C.sage : C.inkFaint }]}>
              {isRiding ? 'Ride Active' : 'Standby'}
            </Text>
          </View>
        </View>

        {/* ══════════  CENTRAL RING  ══════════ */}
        <View style={s.centralWrap}>

          {/* Outermost ring — opacity only (native driver) */}
          <Animated.View
            style={[
              s.ring3,
              { borderColor: activeColor, opacity: outerOpacity },
            ]}
          />

          {/* Middle ring — scale only (native driver) */}
          <Animated.View
            style={[
              s.ring2,
              {
                borderColor: activeColor + '55',
                transform: [{ scale: ring2Scale }],
              },
            ]}
          />

          {/* Glow halo — shadow only (JS driver, its OWN Animated.View) */}
          <Animated.View
            style={[
              s.ring1GlowWrap,
              {
                shadowColor: activeColor,
                shadowRadius: shadowR,
                shadowOpacity: 0.45,
                shadowOffset: { width: 0, height: 0 },
              },
            ]}
          >
            {/* Button — scale only (native driver), nested inside JS shadow wrapper */}
            <Animated.View style={{ transform: [{ scale: btnScale }] }}>
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={toggleRidingMode}
                style={s.btnTouchable}
              >
                <LinearGradient
                  colors={
                    isCrashConfirmed ? [C.coral, '#A03428']
                    : isRiding       ? [C.sage,  C.teal]
                    :                  ['#F8F3EA', '#EDE5D5']
                  }
                  style={s.btnGradient}
                >
                  <Feather
                    name={isCrashConfirmed ? 'alert-triangle' : isRiding ? 'shield' : 'shield-off'}
                    size={34}
                    color={isRiding || isCrashConfirmed ? '#FFFFFF' : C.inkFaint}
                  />
                  <Text style={[s.btnLabel, { color: isRiding || isCrashConfirmed ? '#FFFFFF' : C.inkMid }]}>
                    {isCrashConfirmed ? 'CRASH' : isRiding ? 'PROTECTED' : 'START RIDE'}
                  </Text>
                  <Text style={[s.btnSub, { color: isRiding || isCrashConfirmed ? 'rgba(255,255,255,0.7)' : C.inkFaint }]}>
                    {isCrashConfirmed
                      ? 'Emergency activated'
                      : isRiding
                      ? 'Tap to stop'
                      : 'Tap to begin'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>

          {/* Status chip below ring */}
          <View style={[s.statusChip, { borderColor: activeColor + '55', backgroundColor: activeColor + '18' }]}>
            <View style={[s.chipDot, { backgroundColor: activeColor }]} />
            <Text style={[s.chipTxt, { color: activeColor }]}>{statusLabel}</Text>
          </View>
        </View>

        {/* Speed strip */}
        <View style={s.speedStrip}>
          <View style={s.speedLeft}>
            <Text style={s.speedLabel}>SPEED</Text>
            <View style={s.speedRow}>
              <Text style={[s.speedNum, { color: isRiding ? C.ink : C.inkFaint }]}>
                {currentSpeedKmh != null ? currentSpeedKmh.toFixed(0) : '—'}
              </Text>
              <Text style={s.speedUnit}>km/h</Text>
            </View>
          </View>
          <View style={s.speedDivider} />
          <View style={s.speedRight}>
            <View style={s.speedStat}>
              <Feather name="activity" size={13} color={isRiding ? C.sage : C.inkFaint} />
              <Text style={s.speedStatLbl}>G-Force</Text>
              <Text style={[s.speedStatVal, { color: isRiding ? C.ink : C.inkFaint }]}>
                {gForce != null ? `${gForce.toFixed(2)}g` : '—'}
              </Text>
            </View>
            <View style={s.speedStat}>
              <Feather name="rotate-cw" size={13} color={isRiding ? C.sage : C.inkFaint} />
              <Text style={s.speedStatLbl}>Gyro</Text>
              <Text style={[s.speedStatVal, { color: isRiding ? C.ink : C.inkFaint }]}>
                {gyroMag != null ? gyroMag.toFixed(2) : '—'}
              </Text>
            </View>
          </View>
        </View>

        {/* Sensor cards row */}
        <View style={s.cardRow}>
          {[
            { icon: 'cpu',     label: 'Sensors',   val: isRiding ? 'Online'   : 'Offline',  active: isRiding },
            { icon: 'map-pin', label: 'GPS',        val: currentSpeedKmh != null ? 'Locked' : 'Searching', active: currentSpeedKmh != null },
            { icon: 'zap',     label: 'Detection',  val: isDetectionEnabled ? 'Ready' : 'Disabled', active: isDetectionEnabled },
          ].map(item => (
            <View key={item.label} style={s.sCard}>
              <View style={[s.sCardIcon, { backgroundColor: item.active ? C.sageTint : C.lineLight }]}>
                <Feather name={item.icon as any} size={16} color={item.active ? C.sage : C.inkFaint} />
              </View>
              <Text style={s.sCardLbl}>{item.label}</Text>
              <Text style={[s.sCardVal, { color: item.active ? C.sage : C.inkFaint }]}>{item.val}</Text>
            </View>
          ))}
        </View>

        {/* Buffer bar */}
        <View style={s.bufferCard}>
          <View style={s.bufferRow}>
            <Text style={s.bufferLbl}>SENSOR BUFFER</Text>
            <Text style={s.bufferCount}>{windowBuffer.length} / {MAX_BUFFERED_WINDOWS}</Text>
          </View>
          <View style={s.bufferTrack}>
            <View style={[s.bufferFill, {
              width: `${bufferPct * 100}%`,
              backgroundColor: isRiding ? C.sage : C.line,
            }]} />
          </View>
        </View>

        {/* Samaritan card */}
        <TouchableOpacity activeOpacity={0.82} onPress={() => router.push('/samaritan')} style={s.samCard}>
          <LinearGradient colors={['#FBF5EE', '#F4EAE0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.samGrad}>
            <View style={s.samLeft}>
              <View style={s.samIcon}>
                <Feather name="heart" size={20} color={C.coral} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.samTitle}>Witnessed a crash?</Text>
                <Text style={s.samSub}>Help someone nearby — tap to report</Text>
              </View>
            </View>
            <View style={s.samArrow}>
              <Feather name="arrow-right" size={16} color={C.coral} />
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Dev tools */}
        <View style={s.devSection}>
          <Text style={s.devHeading}>DIAGNOSTICS</Text>
          <View style={s.devRow}>
            {[
              { label: 'Test Alarm', icon: 'bell',      route: '/alarm' },
              { label: 'Logs',       icon: 'file-text', route: '/(dev)/anomaly-log' },
              { label: 'Sensors',    icon: 'activity',  route: '/(dev)/sensor-dashboard' },
            ].map(d => (
              <TouchableOpacity key={d.label} style={s.devBtn} onPress={() => router.push(d.route as any)}>
                <Feather name={d.icon as any} size={13} color={C.inkMid} />
                <Text style={s.devBtnTxt}>{d.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {lastError && (
          <Text style={s.errTxt}>⚠ {lastError}</Text>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Background art styles ─────────────────────────────────────────────────────
const bg = StyleSheet.create({
  // Large quarter-arc top-right (translucent sage ring)
  arcTopRight: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 180,
    borderWidth: 1,
    borderColor: C.sagePale,
    top: -180,
    right: -90,
  },
  // Small filled dot accent top-right
  accentDotTR: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.sagePale,
    top: 52,
    right: 52,
  },
  // Medium arc bottom-left
  arcBottomLeft: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
    borderColor: C.line,
    bottom: 60,
    left: -100,
  },
  // Fine arc bottom-right (smaller circle)
  arcBR: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1,
    borderColor: C.lineLight,
    bottom: 140,
    right: -40,
  },
  // Horizontal rules — three fine lines
  hRule1: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 196,
    height: 1,
    backgroundColor: C.lineLight,
  },
  hRule2: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: 210,
    height: 1,
    backgroundColor: C.lineLight,
    opacity: 0.5,
  },
  hRule3: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 580,
    height: 1,
    backgroundColor: C.lineLight,
  },
  // Paired diagonal slashes — left cluster
  slash1: {
    position: 'absolute',
    width: 120,
    height: 1,
    backgroundColor: C.line,
    bottom: 240,
    left: -10,
    transform: [{ rotate: '-22deg' }],
  },
  slash1b: {
    position: 'absolute',
    width: 120,
    height: 1,
    backgroundColor: C.lineLight,
    bottom: 256,
    left: -10,
    transform: [{ rotate: '-22deg' }],
  },
  // Paired diagonal slashes — right cluster
  slash2: {
    position: 'absolute',
    width: 100,
    height: 1,
    backgroundColor: C.line,
    top: 310,
    right: 12,
    transform: [{ rotate: '22deg' }],
  },
  slash2b: {
    position: 'absolute',
    width: 100,
    height: 1,
    backgroundColor: C.lineLight,
    top: 326,
    right: 12,
    transform: [{ rotate: '22deg' }],
  },
  // Cross-hatch tick marks (top-right detail)
  crosshatch: {
    position: 'absolute',
    width: 14,
    height: 1,
    backgroundColor: C.sagePale,
    transform: [{ rotate: '45deg' }],
  },
  // Dot grid
  dot: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: C.sagePale,
  },
  // Corner bracket — top-left ornament
  bracketH: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 24,
    height: 1,
    backgroundColor: C.sage,
    opacity: 0.3,
  },
  bracketV: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 1,
    height: 24,
    backgroundColor: C.sage,
    opacity: 0.3,
  },
});

// ─── Component styles ──────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 120 },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 28 },
  eyebrow: { fontSize: 13, color: C.inkFaint, fontWeight: '500', letterSpacing: 0.3, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  name: { fontSize: 28, fontWeight: '900', color: C.ink, letterSpacing: -0.5, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Heavy' : 'sans-serif-black' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, borderWidth: 1, borderColor: C.line, backgroundColor: C.bgCard },
  statusPillActive: { borderColor: C.sagePale, backgroundColor: C.sageTint },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusPillTxt: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },

  // Central ring area
  centralWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 32 },

  // Ring 3 — outermost (opacity pulse, native)
  ring3: {
    position: 'absolute',
    width: RING + 64,
    height: RING + 64,
    borderRadius: (RING + 64) / 2,
    borderWidth: 1,
  },
  // Ring 2 — scale pulse (native)
  ring2: {
    position: 'absolute',
    width: RING + 32,
    height: RING + 32,
    borderRadius: (RING + 32) / 2,
    borderWidth: 1,
  },
  // Ring 1 glow wrapper — non-native shadow only
  ring1GlowWrap: {
    borderRadius: RING / 2,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },

  // Button
  btnTouchable: { borderRadius: RING / 2, overflow: 'hidden' },
  btnGradient: { width: RING, height: RING, borderRadius: RING / 2, alignItems: 'center', justifyContent: 'center', gap: 4 },
  btnLabel: { fontSize: 13, fontWeight: '900', letterSpacing: 2.5, marginTop: 8, fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Heavy' : 'sans-serif-black' },
  btnSub: { fontSize: 10, fontWeight: '500', letterSpacing: 0.3, textAlign: 'center', paddingHorizontal: 20, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },

  // Status chip
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 20, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 100, borderWidth: 1 },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipTxt: { fontSize: 11, fontWeight: '800', letterSpacing: 2 },

  // Speed strip
  speedStrip: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bgCard, borderRadius: 20, borderWidth: 1, borderColor: C.line, paddingVertical: 20, paddingHorizontal: 22, marginBottom: 14, shadowColor: '#00000010', shadowOffset: { width: 0, height: 3 }, shadowRadius: 10, elevation: 2 },
  speedLeft: { flex: 1 },
  speedLabel: { fontSize: 9, fontWeight: '800', color: C.inkFaint, letterSpacing: 2, marginBottom: 4 },
  speedRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  speedNum: { fontSize: 50, fontWeight: '900', letterSpacing: -3, lineHeight: 56, fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Heavy' : 'sans-serif-black' },
  speedUnit: { fontSize: 13, color: C.inkFaint, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  speedDivider: { width: 1, height: 56, backgroundColor: C.line, marginHorizontal: 18 },
  speedRight: { gap: 14 },
  speedStat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  speedStatLbl: { fontSize: 11, color: C.inkFaint, fontWeight: '600', width: 46 },
  speedStatVal: { fontSize: 13, fontWeight: '800', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  // Sensor cards
  cardRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  sCard: { flex: 1, backgroundColor: C.bgCard, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 14, alignItems: 'flex-start', gap: 8, shadowColor: '#00000008', shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 1 },
  sCardIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  sCardLbl: { fontSize: 10, fontWeight: '700', color: C.inkFaint, letterSpacing: 0.2 },
  sCardVal: { fontSize: 13, fontWeight: '800', letterSpacing: 0.2 },

  // Buffer bar
  bufferCard: { backgroundColor: C.bgCard, borderRadius: 16, borderWidth: 1, borderColor: C.line, paddingVertical: 14, paddingHorizontal: 18, marginBottom: 16 },
  bufferRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  bufferLbl: { fontSize: 9, fontWeight: '800', color: C.inkFaint, letterSpacing: 2 },
  bufferCount: { fontSize: 11, fontWeight: '800', color: C.inkMid, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  bufferTrack: { height: 4, borderRadius: 2, backgroundColor: C.lineLight, overflow: 'hidden' },
  bufferFill: { height: '100%', borderRadius: 2 },

  // Samaritan
  samCard: { borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: C.line, marginBottom: 30, shadowColor: '#00000010', shadowOffset: { width: 0, height: 3 }, shadowRadius: 8, elevation: 2 },
  samGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
  samLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  samIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#FAE4E0', alignItems: 'center', justifyContent: 'center' },
  samTitle: { fontSize: 15, fontWeight: '800', color: C.ink, letterSpacing: -0.2, fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Bold' : 'sans-serif-medium' },
  samSub: { fontSize: 12, color: C.inkFaint, marginTop: 3, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  samArrow: { width: 30, height: 30, borderRadius: 10, backgroundColor: '#FAE4E0', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },

  // Dev
  devSection: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 20 },
  devHeading: { fontSize: 9, fontWeight: '800', color: C.inkFaint, letterSpacing: 3, textAlign: 'center', marginBottom: 14 },
  devRow: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  devBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.bgCard, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: C.line },
  devBtnTxt: { fontSize: 11, color: C.inkMid, fontWeight: '700', letterSpacing: 0.3 },
  errTxt: { color: C.coral, fontSize: 11, textAlign: 'center', marginTop: 20, fontWeight: '600' },
});
