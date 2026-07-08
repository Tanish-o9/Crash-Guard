/**
 * Alarm Screen — the most critical UI in the entire app.
 *
 * Design principles (from spec):
 *   - Giant touch targets — operable with shaky / injured hands
 *   - Maximum contrast — visible in direct sunlight
 *   - Bold colours — full-screen red communicates EMERGENCY instantly
 *   - Sacred 20s window — countdown always visible, never hidden
 *
 * Phases handled inline (no sub-navigation):
 *   active         → pulsing countdown + giant cancel button
 *   cancel_reason  → overlaid reason picker slides up from bottom
 *   escalating     → "Calling…" state with animated phone icon
 *
 * Voice cancel badge is shown even in fallback mode to communicate that
 * the system is "listening" (visual affordance per UX spec).
 */
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Animated,
  Easing,
  Dimensions,
  Vibration,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useAlarm } from '@/hooks/useAlarm';
import { ALARM_COUNTDOWN_SECONDS } from '@crashguard/constants';
import type { CancelReason } from '@crashguard/types';

const { width: W, height: H } = Dimensions.get('window');

// ─── Cancel reasons (per spec 7.4) ───────────────────────────────────────────

interface ReasonOption {
  key: CancelReason;
  emoji: string;
  label: string;
}

const REASONS: ReasonOption[] = [
  { key: 'dropped_phone',  emoji: '📦', label: 'Dropped phone'        },
  { key: 'rough_road',     emoji: '🛣️', label: 'Rough road / pothole' },
  { key: 'hard_braking',   emoji: '🛑', label: 'Hard braking'          },
  { key: 'im_fine',        emoji: '✅', label: "I'm fine"               },
  { key: 'false_trigger',  emoji: '🤔', label: 'False trigger'          },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AlarmScreen() {
  const {
    phase,
    countdown,
    isActive,
    isCancelReasonPhase,
    isEscalating,
    cancelReason,
    cancelReasonNote,
    start,
    handleCancel,
    setCancelReason,
    setCancelReasonNote,
    handleSubmitReason,
    handleDismissReason,
  } = useAlarm();

  // ── Animations ──────────────────────────────────────────────────────────────

  // Background glow pulse (slow breathe)
  const glowAnim  = useRef(new Animated.Value(0)).current;
  // Countdown number scale (pulse on each tick)
  const numScale  = useRef(new Animated.Value(1)).current;
  // Cancel-reason sheet slide-up
  const sheetY    = useRef(new Animated.Value(H)).current;
  // Escalating phone icon bounce
  const phoneAnim = useRef(new Animated.Value(0)).current;

  // Glow loop
  useEffect(() => {
    if (isActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 1200, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
          Animated.timing(glowAnim, { toValue: 0, duration: 1200, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        ])
      ).start();
    } else {
      glowAnim.setValue(0);
    }
  }, [isActive]);

  // Number pulse on each countdown tick
  useEffect(() => {
    if (!isActive) return;
    Animated.sequence([
      Animated.timing(numScale, { toValue: 1.12, duration: 80, useNativeDriver: true }),
      Animated.timing(numScale, { toValue: 1.00, duration: 160, useNativeDriver: true }),
    ]).start();
    // Extra shake when low
    if (countdown <= 5) Vibration.vibrate(40);
  }, [countdown, isActive]);

  // Reason sheet slide-up / slide-down
  useEffect(() => {
    Animated.spring(sheetY, {
      toValue: isCancelReasonPhase ? 0 : H,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [isCancelReasonPhase]);

  // Phone bounce loop when escalating
  useEffect(() => {
    if (isEscalating) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(phoneAnim, { toValue: -10, duration: 100, useNativeDriver: true }),
          Animated.timing(phoneAnim, { toValue:  10, duration: 100, useNativeDriver: true }),
          Animated.timing(phoneAnim, { toValue:   0, duration: 100, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [isEscalating]);

  // Auto-start with manual_test trigger when mounted directly (for testing)
  useEffect(() => {
    if (phase === 'idle') {
      start('manual_test');
    }
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.0] });
  const progress    = countdown / ALARM_COUNTDOWN_SECONDS; // 1→0
  const isUrgent    = countdown <= 5;

  // ─── Main render ────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* ── Pulsing gradient background ─── */}
      <Animated.View style={[styles.bgLayer, { opacity: glowOpacity }]}>
        <LinearGradient
          colors={isUrgent ? ['#8B0000', '#FF0000', '#CC0000'] : ['#5C0000', '#CC0000', '#8B0000']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
      </Animated.View>

      {/* ── Progress strip at top ─── */}
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      {/* ── Header label ─── */}
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel}>⚠️  CRASH DETECTED</Text>

        {/* Voice badge (shown even in tap-only fallback — UX affordance) */}
        <View style={styles.voiceBadge}>
          <Text style={styles.voiceBadgeText}>🎙 Listening</Text>
        </View>
      </View>

      {/* ── Escalating state ─── */}
      {isEscalating && (
        <View style={styles.escalatingContainer}>
          <Animated.Text style={[styles.phoneIcon, { transform: [{ translateX: phoneAnim }] }]}>
            📞
          </Animated.Text>
          <Text style={styles.escalatingTitle}>Calling 112…</Text>
          <Text style={styles.escalatingSub}>Emergency services have been notified</Text>
        </View>
      )}

      {/* ── Active countdown ─── */}
      {isActive && (
        <View style={styles.countdownContainer}>
          {/* Ring outline */}
          <View style={[styles.ring, isUrgent && styles.ringUrgent]}>
            <Animated.Text style={[styles.countdownNum, { transform: [{ scale: numScale }] }]}>
              {countdown}
            </Animated.Text>
          </View>
          <Text style={styles.countdownLabel}>
            Calling emergency services in {countdown}s
          </Text>
        </View>
      )}

      {/* ── Giant CANCEL button ─── */}
      {isActive && (
        <View style={styles.cancelWrapper}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={handleCancel}
            activeOpacity={0.85}
            accessibilityLabel="Cancel alarm — I am okay"
            accessibilityRole="button"
          >
            <Text style={styles.cancelBtnTop}>I'M OKAY</Text>
            <Text style={styles.cancelBtnSub}>TAP TO CANCEL</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Cancel Reason Sheet (slides up from bottom) ─── */}
      <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetY }] }]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>What happened?</Text>
            <Text style={styles.sheetSub}>
              Helps us reduce false alarms for you. Totally optional.
            </Text>

            {/* Reason pills */}
            <View style={styles.reasonGrid}>
              {REASONS.map((r) => (
                <TouchableOpacity
                  key={r.key}
                  style={[
                    styles.reasonPill,
                    cancelReason === r.key && styles.reasonPillActive,
                  ]}
                  onPress={() => setCancelReason(r.key)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.reasonEmoji}>{r.emoji}</Text>
                  <Text style={[styles.reasonLabel, cancelReason === r.key && styles.reasonLabelActive]}>
                    {r.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Free text for "other" */}
            {cancelReason && cancelReason !== 'im_fine' && (
              <TextInput
                style={styles.noteInput}
                placeholder="Add a note (optional)…"
                placeholderTextColor="#666680"
                value={cancelReasonNote}
                onChangeText={setCancelReasonNote}
                multiline
                maxLength={200}
              />
            )}

            {/* Actions */}
            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleSubmitReason}
              activeOpacity={0.85}
            >
              <Text style={styles.submitBtnText}>
                {cancelReason ? 'Submit & Close' : 'Just Close'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.dismissBtn} onPress={handleDismissReason}>
              <Text style={styles.dismissBtnText}>Dismiss without answer</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#8B0000' },

  bgLayer: { ...StyleSheet.absoluteFill },

  progressTrack: {
    height: 5,
    backgroundColor: 'rgba(0,0,0,0.3)',
    width: '100%',
  },
  progressFill: {
    height: 5,
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start',
  },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 12,
  },
  headerLabel: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  voiceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    gap: 6,
  },
  voiceBadgeText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
  },

  // ── Countdown ──────────────────────────────────────────────────────────────

  countdownContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  ring: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 6,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    shadowColor: '#FF0000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 20,
  },
  ringUrgent: {
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  countdownNum: {
    fontSize: 110,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -4,
    includeFontPadding: false,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 10,
  },
  countdownLabel: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 24,
  },

  // ── Escalating ────────────────────────────────────────────────────────────

  escalatingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  phoneIcon: { fontSize: 80 },
  escalatingTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  escalatingSub: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    paddingHorizontal: 40,
  },

  // ── Cancel Button (7.2 — giant, accessible) ───────────────────────────────

  cancelWrapper: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 48 : 32,
  },
  cancelBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
    minHeight: 100,
    justifyContent: 'center',
  },
  cancelBtnTop: {
    fontSize: 28,
    fontWeight: '900',
    color: '#CC0000',
    letterSpacing: 1,
  },
  cancelBtnSub: {
    fontSize: 13,
    fontWeight: '700',
    color: '#CC000099',
    marginTop: 4,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  // ── Cancel Reason Sheet (7.4) ─────────────────────────────────────────────

  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0F0F14',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 48 : 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
    maxHeight: H * 0.75,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#2A2A36',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  sheetSub: {
    fontSize: 13,
    color: '#666680',
    marginBottom: 24,
    lineHeight: 19,
  },
  reasonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  reasonPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#16161E',
    borderRadius: 40,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: '#2A2A36',
  },
  reasonPillActive: {
    borderColor: '#FF3B3B',
    backgroundColor: '#1A0D0D',
  },
  reasonEmoji: { fontSize: 16 },
  reasonLabel: { fontSize: 14, color: '#AAAABC', fontWeight: '600' },
  reasonLabelActive: { color: '#FF6B6B' },
  noteInput: {
    backgroundColor: '#16161E',
    borderRadius: 12,
    padding: 14,
    color: '#FFFFFF',
    fontSize: 14,
    minHeight: 72,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#2A2A36',
    marginBottom: 20,
  },
  submitBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    marginBottom: 10,
  },
  submitBtnText: { fontSize: 16, fontWeight: '800', color: '#0F0F14' },
  dismissBtn: { paddingVertical: 12, alignItems: 'center' },
  dismissBtnText: { fontSize: 13, color: '#444456', fontWeight: '600' },
});
