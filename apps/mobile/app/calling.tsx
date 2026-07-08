/**
 * Calling Screen — live dashboard shown after the alarm countdown expires.
 *
 * Renders the real-time emergency response timeline as the orchestrator
 * progresses through: emergency call → TTS speech → contact cascade → SMS → done.
 *
 * Design: dark blue background (professional, not panic-inducing at this stage
 * since emergency is already being handled).
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
import { useEmergencyOrchestrator } from '@/hooks/useEmergencyOrchestrator';
import { useAlarmStore } from '@/store/alarmStore';

// ─── Phase label map ─────────────────────────────────────────────────────────

const STATE_LABEL: Record<string, string> = {
  CALLING_EMERGENCY: '📞 Calling emergency services…',
  CALLING_CONTACTS:  '📱 Contacting emergency contacts…',
  DONE:              '✅ Help is on the way',
  CANCELLED:         '❌ Cancelled',
  IDLE:              'Preparing…',
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

  // Auto-scroll the log to bottom on new entries
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [statusLog.length]);

  // Pulsing dot animation
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isDone) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.4, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 600, useNativeDriver: true }),
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

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Background gradient */}
      <LinearGradient
        colors={isDone ? ['#0D2A1A', '#0F0F14'] : ['#0A1628', '#0F0F14']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      <SafeAreaView style={styles.safeArea}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Emergency Response</Text>
          <View style={[styles.statusBadge, isDone && styles.statusBadgeDone]}>
            {!isDone && (
              <Animated.View style={[styles.statusDot, { transform: [{ scale: pulseAnim }] }]} />
            )}
            <Text style={[styles.statusBadgeText, isDone && styles.statusBadgeTextDone]}>
              {isDone ? 'COMPLETE' : 'ACTIVE'}
            </Text>
          </View>
        </View>

        {/* ── Current phase card ── */}
        <View style={styles.phaseCard}>
          <Text style={styles.phaseLabel}>
            {STATE_LABEL[machineState] ?? 'Processing…'}
          </Text>
          {isCallingEmergency && (
            <Text style={styles.phaseDetail}>
              Speaking TTS in {ttsLanguage?.toUpperCase() ?? 'EN'}
            </Text>
          )}
          {isCallingContacts && currentContact && (
            <Text style={styles.phaseDetail}>
              Contact {contactCascadeIndex + 1}: {currentContact.name}
            </Text>
          )}
        </View>

        {/* ── Location ── */}
        {(currentLat != null && currentLng != null) && (
          <View style={styles.locationRow}>
            <Text style={styles.locationText}>
              📍 {currentLat.toFixed(5)}, {currentLng.toFixed(5)}
            </Text>
          </View>
        )}

        {/* ── Tracking link ── */}
        {trackingLink && (
          <View style={styles.trackingCard}>
            <View style={styles.trackingRow}>
              <Text style={styles.trackingLabel}>🔴 Live tracking</Text>
              <TouchableOpacity onPress={handleCopyLink} style={styles.copyBtn}>
                <Text style={styles.copyBtnText}>Copy</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.trackingLink} numberOfLines={1}>
              {trackingLink}
            </Text>
          </View>
        )}

        {/* ── Progress summary row ── */}
        <View style={styles.summaryRow}>
          <SummaryPill icon="📞" label="Emergency" active={emergencyCallMade} />
          <SummaryPill icon="📱" label={`Contacts ×${contactCascadeIndex}`} active={contactCascadeIndex > 0} />
          <SummaryPill icon="✉️" label={`SMS ×${smsSentCount}`} active={smsSentCount > 0} />
        </View>

        {/* ── Status log timeline ── */}
        <View style={styles.logContainer}>
          <Text style={styles.logTitle}>Timeline</Text>
          <ScrollView
            ref={scrollRef}
            style={styles.logScroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.logContent}
          >
            {statusLog.map((entry, idx) => (
              <View key={idx} style={styles.logEntry}>
                <Text style={styles.logEntryIcon}>{entry.icon}</Text>
                <View style={styles.logEntryBody}>
                  <Text style={styles.logEntryMsg}>{entry.message}</Text>
                  <Text style={styles.logEntryTime}>
                    {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </Text>
                </View>
              </View>
            ))}
            {statusLog.length === 0 && (
              <Text style={styles.logEmpty}>Starting response engine…</Text>
            )}
          </ScrollView>
        </View>

        {/* ── Done button ── */}
        {isDone && (
          <TouchableOpacity style={styles.doneBtn} onPress={handleDone} activeOpacity={0.85}>
            <Text style={styles.doneBtnText}>Close — Help Is On The Way</Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryPill({ icon, label, active }: { icon: string; label: string; active: boolean }) {
  return (
    <View style={[styles.summaryPill, active && styles.summaryPillActive]}>
      <Text style={styles.summaryPillIcon}>{icon}</Text>
      <Text style={[styles.summaryPillLabel, active && styles.summaryPillLabelActive]}>
        {label}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A1628' },
  safeArea: { flex: 1, paddingHorizontal: 20 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 20,
  },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#FFFFFF' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,59,59,0.12)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#FF3B3B44',
  },
  statusBadgeDone: {
    backgroundColor: 'rgba(46,204,113,0.12)',
    borderColor: '#2ECC7144',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#FF3B3B',
  },
  statusBadgeText: { fontSize: 11, fontWeight: '800', color: '#FF3B3B', letterSpacing: 1 },
  statusBadgeTextDone: { color: '#2ECC71' },

  phaseCard: {
    backgroundColor: '#111A2E',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E3052',
  },
  phaseLabel: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 },
  phaseDetail: { fontSize: 13, color: '#7A9CC4', fontWeight: '500' },

  locationRow: {
    marginBottom: 12,
  },
  locationText: { fontSize: 12, color: '#445566', fontVariant: ['tabular-nums'] },

  trackingCard: {
    backgroundColor: '#0D1E0D',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1A4A1A',
  },
  trackingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  trackingLabel: { fontSize: 13, fontWeight: '700', color: '#2ECC71' },
  copyBtn: {
    backgroundColor: '#1A4A1A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  copyBtnText: { fontSize: 11, fontWeight: '700', color: '#2ECC71' },
  trackingLink: { fontSize: 11, color: '#5A8A5A', fontVariant: ['tabular-nums'] },

  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  summaryPill: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    backgroundColor: '#111A2E',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1E3052',
    gap: 4,
  },
  summaryPillActive: {
    backgroundColor: '#0D2A1A',
    borderColor: '#1A4A1A',
  },
  summaryPillIcon: { fontSize: 18 },
  summaryPillLabel: { fontSize: 10, color: '#445566', fontWeight: '600', textAlign: 'center' },
  summaryPillLabelActive: { color: '#2ECC71' },

  logContainer: {
    flex: 1,
    backgroundColor: '#111A2E',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E3052',
    marginBottom: 16,
  },
  logTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#445566',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  logScroll: { flex: 1 },
  logContent: { gap: 8, paddingBottom: 4 },
  logEntry: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  logEntryIcon: { fontSize: 14, marginTop: 1, width: 20 },
  logEntryBody: { flex: 1 },
  logEntryMsg: { fontSize: 12, color: '#AABBCC', fontWeight: '500', lineHeight: 17 },
  logEntryTime: { fontSize: 9, color: '#334455', marginTop: 2, fontVariant: ['tabular-nums'] },
  logEmpty: { fontSize: 12, color: '#334455', textAlign: 'center', paddingVertical: 20 },

  doneBtn: {
    backgroundColor: '#2ECC71',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: Platform.OS === 'ios' ? 0 : 8,
    shadowColor: '#2ECC71',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  doneBtnText: { fontSize: 16, fontWeight: '800', color: '#0D2A1A' },
});
