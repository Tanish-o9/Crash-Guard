/**
 * Calling Screen — live dashboard shown after the alarm countdown expires.
 *
 * Renders the real-time emergency response timeline as the orchestrator
 * progresses through: emergency call → TTS speech → contact cascade → SMS → done.
 *
 * Design: warm cream / sage theme — professional, not panic-inducing at this stage
 * since emergency is already being handled.
 */
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Easing,
  Clipboard,
  Platform,
} from 'react-native';
import { useEffect, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useEmergencyOrchestrator } from '@/hooks/useEmergencyOrchestrator';
import { useAlarmStore } from '@/store/alarmStore';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:        '#F5F0E8',
  bgDeep:    '#EDE7D9',
  bgCard:    '#FFFFFF',
  sage:      '#4A7060',
  sagePale:  '#C4D8CC',
  sageTint:  '#EBF3EF',
  teal:      '#356060',
  coral:     '#C8503C',
  green:     '#3A8050',
  greenTint: '#E8F5EE',
  ink:       '#1C2826',
  inkMid:    '#445550',
  inkFaint:  '#8A9E96',
  line:      '#DDD6C8',
  lineLight: '#EAE4D8',
};

// ─── Phase label map ─────────────────────────────────────────────────────────

const STATE_LABEL: Record<string, { text: string; icon: string }> = {
  CALLING_EMERGENCY: { text: 'Calling emergency services…', icon: 'phone-call' },
  CALLING_CONTACTS:  { text: 'Contacting emergency contacts…', icon: 'users' },
  DONE:              { text: 'Help is on the way',              icon: 'check-circle' },
  CANCELLED:         { text: 'Cancelled',                       icon: 'x-circle' },
  IDLE:              { text: 'Preparing response…',             icon: 'loader' },
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CallingScreen() {
  const router  = useRouter();
  const {
    machineState,
    trackingLink,
    ttsMessage,
    ttsLanguage,
    currentContact,
    contactCascadeIndex,
    smsSentCount,
    emergencyCallMade,
    currentLat,
    currentLng,
    statusLog,
    isDone,
    isCallingEmergency,
    isCallingContacts,
  } = useEmergencyOrchestrator();

  const { reset: resetAlarm } = useAlarmStore();

  // Auto-scroll log to bottom
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [statusLog.length]);

  // Pulsing dot (native driver — opacity only)
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isDone) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.2, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isDone]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleDone() {
    resetAlarm();
    router.dismissAll();
  }

  function handleCopyLink() {
    if (trackingLink) {
      Clipboard.setString(trackingLink);
    }
  }

  const phaseInfo = STATE_LABEL[machineState] ?? { text: 'Processing…', icon: 'loader' };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <View style={s.root}>
      <StatusBar style="dark" />

      {/* Background */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient colors={[C.bg, C.bgDeep]} style={StyleSheet.absoluteFill} />
        <View style={bg.arcTR} />
        <View style={bg.arcBL} />
        <View style={bg.hRule} />
        {[0,1,2,3,4,5].map(row =>
          [0,1,2,3,4].map(col => (
            <View key={`d-${row}-${col}`} style={[bg.dot, { top: 100 + row * 80, left: 16 + col * 82 }]} />
          ))
        )}
      </View>

      <SafeAreaView style={s.safe}>

        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.eyebrow}>Emergency active</Text>
            <Text style={s.title}>Response</Text>
          </View>
          <View style={[s.statusBadge, isDone && s.statusBadgeDone]}>
            {!isDone && (
              <Animated.View style={[s.statusDot, { opacity: pulseAnim }]} />
            )}
            {isDone && <Feather name="check" size={12} color={C.green} />}
            <Text style={[s.statusBadgeTxt, isDone && s.statusBadgeTxtDone]}>
              {isDone ? 'COMPLETE' : 'ACTIVE'}
            </Text>
          </View>
        </View>

        {/* Current phase card */}
        <View style={[s.phaseCard, isDone && s.phaseCardDone]}>
          <View style={[s.phaseIconWrap, { backgroundColor: isDone ? C.greenTint : C.sageTint }]}>
            <Feather name={phaseInfo.icon as any} size={22} color={isDone ? C.green : C.sage} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.phaseLabel}>{phaseInfo.text}</Text>
            {isCallingEmergency && (
              <Text style={s.phaseDetail}>
                Speaking TTS in {ttsLanguage?.toUpperCase() ?? 'EN'}
              </Text>
            )}
            {isCallingContacts && currentContact && (
              <Text style={s.phaseDetail}>
                Contact {contactCascadeIndex + 1}: {currentContact.name}
              </Text>
            )}
          </View>
        </View>

        {/* Location pill */}
        {(currentLat != null && currentLng != null) && (
          <View style={s.locationRow}>
            <Feather name="map-pin" size={13} color={C.sage} />
            <Text style={s.locationTxt}>
              {currentLat.toFixed(5)}, {currentLng.toFixed(5)}
            </Text>
          </View>
        )}

        {/* Tracking link card */}
        {trackingLink && (
          <View style={s.trackCard}>
            <View style={s.trackRow}>
              <View style={s.trackLabelRow}>
                <View style={s.trackDot} />
                <Text style={s.trackLabel}>Live tracking</Text>
              </View>
              <TouchableOpacity onPress={handleCopyLink} style={s.copyBtn}>
                <Feather name="copy" size={12} color={C.sage} />
                <Text style={s.copyBtnTxt}>Copy</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.trackLink} numberOfLines={1}>{trackingLink}</Text>
          </View>
        )}

        {/* Summary pills */}
        <View style={s.summaryRow}>
          <SummaryPill icon="phone" label="Emergency" active={emergencyCallMade} />
          <SummaryPill icon="users" label={`Contacts ×${contactCascadeIndex}`} active={contactCascadeIndex > 0} />
          <SummaryPill icon="message-square" label={`SMS ×${smsSentCount}`} active={smsSentCount > 0} />
        </View>

        {/* Timeline log */}
        <View style={s.logWrap}>
          <Text style={s.logHeading}>TIMELINE</Text>
          <ScrollView
            ref={scrollRef}
            style={s.logScroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.logContent}
          >
            {statusLog.map((entry, idx) => (
              <View key={idx} style={s.logEntry}>
                <View style={s.logDot} />
                <View style={s.logEntryBody}>
                  <Text style={s.logMsg}>{entry.message}</Text>
                  <Text style={s.logTime}>
                    {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </Text>
                </View>
              </View>
            ))}
            {statusLog.length === 0 && (
              <Text style={s.logEmpty}>Starting response engine…</Text>
            )}
          </ScrollView>
        </View>

        {/* Done button */}
        {isDone && (
          <TouchableOpacity style={s.doneBtn} onPress={handleDone} activeOpacity={0.85}>
            <LinearGradient colors={[C.sage, C.teal]} style={s.doneBtnGrad}>
              <Feather name="check-circle" size={20} color="#FFFFFF" />
              <Text style={s.doneBtnTxt}>Close — Help Is On The Way</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}

      </SafeAreaView>
    </View>
  );
}

// ─── Summary pill ─────────────────────────────────────────────────────────────

function SummaryPill({ icon, label, active }: { icon: string; label: string; active: boolean }) {
  return (
    <View style={[s.sPill, active && s.sPillActive]}>
      <Feather name={icon as any} size={16} color={active ? C.sage : C.inkFaint} />
      <Text style={[s.sPillLbl, active && s.sPillLblActive]}>{label}</Text>
    </View>
  );
}

// ─── Background art styles ─────────────────────────────────────────────────────
const bg = StyleSheet.create({
  arcTR: { position: 'absolute', width: 260, height: 260, borderRadius: 130, borderWidth: 1, borderColor: C.sagePale, top: -120, right: -70 },
  arcBL: { position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 1, borderColor: C.lineLight, bottom: 100, left: -70 },
  hRule: { position: 'absolute', left: 0, right: 0, top: 180, height: 1, backgroundColor: C.lineLight },
  dot:   { position: 'absolute', width: 3, height: 3, borderRadius: 1.5, backgroundColor: C.sagePale },
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  safe:    { flex: 1, paddingHorizontal: 24 },

  header:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 16, paddingBottom: 24 },
  eyebrow:  { fontSize: 13, color: C.inkFaint, fontWeight: '500', letterSpacing: 0.3, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  title:    { fontSize: 30, fontWeight: '900', color: C.ink, letterSpacing: -0.5, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Heavy' : 'sans-serif-black' },

  statusBadge:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.lineLight, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: C.line, marginBottom: 4 },
  statusBadgeDone:{ backgroundColor: C.greenTint, borderColor: C.sage + '44' },
  statusDot:      { width: 7, height: 7, borderRadius: 4, backgroundColor: C.coral },
  statusBadgeTxt: { fontSize: 11, fontWeight: '800', color: C.coral, letterSpacing: 1 },
  statusBadgeTxtDone: { color: C.green },

  phaseCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.bgCard, borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: C.line, shadowColor: '#00000010', shadowOffset: { width: 0, height: 3 }, shadowRadius: 8, elevation: 2 },
  phaseCardDone: { borderColor: C.sage + '44' },
  phaseIconWrap: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  phaseLabel:  { fontSize: 15, fontWeight: '700', color: C.ink, marginBottom: 3, letterSpacing: -0.1 },
  phaseDetail: { fontSize: 12, color: C.inkFaint, fontWeight: '500' },

  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14, backgroundColor: C.lineLight, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  locationTxt: { fontSize: 12, color: C.inkMid, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  trackCard: { backgroundColor: C.sageTint, borderRadius: 16, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: C.sagePale },
  trackRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  trackLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trackDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: C.sage },
  trackLabel:{ fontSize: 13, fontWeight: '700', color: C.sage },
  copyBtn:   { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.bgCard, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: C.sagePale },
  copyBtnTxt:{ fontSize: 11, fontWeight: '700', color: C.sage },
  trackLink: { fontSize: 11, color: C.inkMid, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  sPill:     { flex: 1, alignItems: 'center', backgroundColor: C.bgCard, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: C.line, gap: 4 },
  sPillActive: { backgroundColor: C.sageTint, borderColor: C.sagePale },
  sPillLbl:  { fontSize: 10, color: C.inkFaint, fontWeight: '600', textAlign: 'center' },
  sPillLblActive: { color: C.sage },

  logWrap:   { flex: 1, backgroundColor: C.bgCard, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.line, marginBottom: 16 },
  logHeading:{ fontSize: 9, fontWeight: '800', color: C.inkFaint, letterSpacing: 3, marginBottom: 12 },
  logScroll: { flex: 1 },
  logContent:{ gap: 10, paddingBottom: 4 },
  logEntry:  { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  logDot:    { width: 7, height: 7, borderRadius: 3.5, backgroundColor: C.sagePale, marginTop: 4 },
  logEntryBody: { flex: 1 },
  logMsg:    { fontSize: 13, color: C.inkMid, fontWeight: '500', lineHeight: 18 },
  logTime:   { fontSize: 10, color: C.inkFaint, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  logEmpty:  { fontSize: 13, color: C.inkFaint, textAlign: 'center', paddingVertical: 20 },

  doneBtn:     { borderRadius: 18, overflow: 'hidden', marginBottom: Platform.OS === 'ios' ? 0 : 8 },
  doneBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18 },
  doneBtnTxt:  { fontSize: 16, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.3 },
});
