/**
 * Shared shell for all setup flow screens.
 * Renders: back button, step indicator, title, subtitle, children, and a CTA button.
 */
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';

// ─── Design tokens (shared across app) ────────────────────────────────────────
const C = {
  bg:        '#F5F0E8',
  bgDeep:    '#EDE7D9',
  bgCard:    '#FFFFFF',
  sage:      '#4A7060',
  sagePale:  '#C4D8CC',
  sageTint:  '#EBF3EF',
  teal:      '#356060',
  ink:       '#1C2826',
  inkMid:    '#445550',
  inkFaint:  '#8A9E96',
  line:      '#DDD6C8',
  lineLight: '#EAE4D8',
};

interface Props {
  step: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  onNext: () => void;
  onBack?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  isLoading?: boolean;
  children: React.ReactNode;
}

export function SetupShell({
  step,
  totalSteps,
  title,
  subtitle,
  onNext,
  onBack,
  nextLabel = 'Continue',
  nextDisabled = false,
  isLoading = false,
  children,
}: Props) {
  return (
    <SafeAreaView style={s.root}>

      {/* Background art */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient colors={[C.bg, C.bgDeep]} style={StyleSheet.absoluteFill} />
        <View style={bg.arcTR} />
        <View style={bg.arcBL} />
        <View style={bg.bracketH} />
        <View style={bg.bracketV} />
        {[0,1,2,3,4,5].map(row =>
          [0,1,2,3,4].map(col => (
            <View key={`d-${row}-${col}`} style={[bg.dot, { top: 160 + row * 80, left: 16 + col * 82 }]} />
          ))
        )}
      </View>

      {/* Fixed top bar */}
      <View style={s.topBar}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <Feather name="arrow-left" size={18} color={C.inkMid} />
            <Text style={s.backText}>Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={s.backBtn} />
        )}

        {/* Step pills */}
        <View style={s.stepRow}>
          {Array(totalSteps).fill(null).map((_, i) => (
            <View
              key={i}
              style={[
                s.stepPill,
                i < step - 1 && s.stepPillDone,
                i === step - 1 && s.stepPillActive,
              ]}
            />
          ))}
        </View>

        <Text style={s.stepLabel}>{step}/{totalSteps}</Text>
      </View>

      {/* Scrollable content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.title}>{title}</Text>
        {subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
        {children}
      </ScrollView>

      {/* Fixed CTA footer */}
      <View style={s.footer}>
        <TouchableOpacity
          style={[s.btnWrap, (nextDisabled || isLoading) && s.btnWrapDisabled]}
          onPress={onNext}
          disabled={nextDisabled || isLoading}
          activeOpacity={0.88}
        >
          {nextDisabled || isLoading ? (
            <View style={s.btnInner}>
              {isLoading
                ? <ActivityIndicator color={C.inkFaint} />
                : <Text style={[s.btnText, s.btnTextDisabled]}>{nextLabel}</Text>
              }
            </View>
          ) : (
            <LinearGradient colors={[C.sage, C.teal]} style={s.btnInner}>
              <Text style={s.btnText}>{nextLabel}</Text>
              <Feather name="arrow-right" size={18} color="#FFFFFF" />
            </LinearGradient>
          )}
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

// ─── Background art styles ─────────────────────────────────────────────────────
const bg = StyleSheet.create({
  arcTR:    { position: 'absolute', width: 260, height: 260, borderRadius: 130, borderWidth: 1, borderColor: C.sagePale, top: -120, right: -70 },
  arcBL:    { position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 1, borderColor: C.lineLight, bottom: 100, left: -70 },
  bracketH: { position: 'absolute', top: 16, left: 16, width: 22, height: 1, backgroundColor: C.sage, opacity: 0.3 },
  bracketV: { position: 'absolute', top: 16, left: 16, width: 1, height: 22, backgroundColor: C.sage, opacity: 0.3 },
  dot:      { position: 'absolute', width: 3, height: 3, borderRadius: 1.5, backgroundColor: C.sagePale },
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  backBtn: {
    width: 80,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: { fontSize: 14, color: C.inkMid, fontWeight: '600' },

  stepRow: { flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center' },
  stepPill: {
    height: 4,
    width: 26,
    borderRadius: 2,
    backgroundColor: C.lineLight,
  },
  stepPillActive: { backgroundColor: C.sage, width: 38 },
  stepPillDone:   { backgroundColor: C.sagePale },

  stepLabel: {
    width: 80,
    textAlign: 'right',
    fontSize: 12,
    color: C.inkFaint,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  content: { paddingHorizontal: 24, paddingBottom: 24 },

  title: {
    fontSize: 32,
    fontWeight: '900',
    color: C.ink,
    letterSpacing: -0.8,
    marginBottom: 10,
    marginTop: 16,
    lineHeight: 40,
    fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Heavy' : 'sans-serif-black',
  },
  subtitle: {
    fontSize: 14,
    color: C.inkFaint,
    lineHeight: 22,
    marginBottom: 32,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },

  footer: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: C.lineLight,
    backgroundColor: C.bg,
  },
  btnWrap: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: C.sage,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6,
  },
  btnWrapDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  btnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    backgroundColor: C.lineLight,
  },
  btnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
    fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Bold' : 'sans-serif-medium',
  },
  btnTextDisabled: { color: C.inkFaint },
});
