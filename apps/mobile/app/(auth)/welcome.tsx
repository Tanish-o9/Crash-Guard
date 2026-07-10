import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';

const { height } = Dimensions.get('window');

// ─── Design tokens ─────────────────────────────────────────────────────────────
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

const FEATURES = [
  { icon: 'activity',    text: 'Auto crash detection via motion sensors' },
  { icon: 'phone-call',  text: 'Instant emergency alert to your contacts' },
  { icon: 'map-pin',     text: 'Live location shared with responders' },
  { icon: 'heart',       text: 'Good Samaritan mode for bystanders' },
];

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <View style={s.root}>
      {/* Background art */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient colors={[C.bg, C.bgDeep]} style={StyleSheet.absoluteFill} />
        {/* Large quarter-arc top-right */}
        <View style={bg.arcTR} />
        {/* Second smaller arc */}
        <View style={bg.arcTR2} />
        {/* Bottom-left arc */}
        <View style={bg.arcBL} />
        {/* Horizontal rules */}
        <View style={bg.hRule1} />
        <View style={bg.hRule2} />
        {/* Paired diagonal slashes */}
        <View style={bg.slash1} />
        <View style={bg.slash1b} />
        {/* Corner bracket top-left */}
        <View style={bg.bracketH} />
        <View style={bg.bracketV} />
        {/* Cross-hatch ticks top-right */}
        {[0,1,2,3].map(i => (
          <View key={`ch-${i}`} style={[bg.tick, { top: 56 + i * 18, right: 30 - i * 3 }]} />
        ))}
        {/* Dot grid */}
        {[0,1,2,3,4,5,6,7].map(row =>
          [0,1,2,3,4].map(col => (
            <View key={`d-${row}-${col}`} style={[bg.dot, { top: 80 + row * 80, left: 16 + col * 82 }]} />
          ))
        )}
      </View>

      <SafeAreaView style={s.inner}>

        {/* Hero */}
        <View style={s.hero}>
          <View style={s.logoWrap}>
            <LinearGradient colors={[C.sage, C.teal]} style={s.logoGrad}>
              <Feather name="shield" size={42} color="#FFFFFF" />
            </LinearGradient>
          </View>
          <Text style={s.appName}>CrashGuard</Text>
          <Text style={s.tagline}>
            Crash detection & emergency{'\n'}response for Indian riders
          </Text>
        </View>

        {/* Feature list */}
        <View style={s.features}>
          {FEATURES.map((f, i) => (
            <View key={i} style={s.featureRow}>
              <View style={s.featureIconWrap}>
                <Feather name={f.icon as any} size={18} color={C.sage} />
              </View>
              <Text style={s.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>

        {/* CTA */}
        <View style={s.cta}>
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => router.push('/(auth)/phone')}
            style={s.primaryBtnWrap}
          >
            <LinearGradient colors={[C.sage, C.teal]} style={s.primaryBtn}>
              <Text style={s.primaryBtnText}>Get Started</Text>
              <Feather name="arrow-right" size={18} color="#FFFFFF" />
            </LinearGradient>
          </TouchableOpacity>

          <Text style={s.disclaimer}>
            Designed for two-wheeler riders in India.{'\n'}
            Works offline. No subscription required.
          </Text>
        </View>

      </SafeAreaView>
    </View>
  );
}

// ─── Background art styles ─────────────────────────────────────────────────────
const bg = StyleSheet.create({
  arcTR:   { position: 'absolute', width: 380, height: 380, borderRadius: 190, borderWidth: 1, borderColor: C.sagePale, top: -190, right: -100 },
  arcTR2:  { position: 'absolute', width: 260, height: 260, borderRadius: 130, borderWidth: 1, borderColor: C.lineLight, top: -100, right: -30 },
  arcBL:   { position: 'absolute', width: 200, height: 200, borderRadius: 100, borderWidth: 1, borderColor: C.line, bottom: 80, left: -90 },
  hRule1:  { position: 'absolute', left: 0, right: 0, top: height * 0.35, height: 1, backgroundColor: C.lineLight },
  hRule2:  { position: 'absolute', left: 24, right: 24, top: height * 0.35 + 14, height: 1, backgroundColor: C.lineLight, opacity: 0.5 },
  slash1:  { position: 'absolute', width: 110, height: 1, backgroundColor: C.line,      bottom: 200, left: -10, transform: [{ rotate: '-20deg' }] },
  slash1b: { position: 'absolute', width: 110, height: 1, backgroundColor: C.lineLight, bottom: 216, left: -10, transform: [{ rotate: '-20deg' }] },
  bracketH:{ position: 'absolute', top: 16, left: 16, width: 22, height: 1, backgroundColor: C.sage, opacity: 0.3 },
  bracketV:{ position: 'absolute', top: 16, left: 16, width: 1, height: 22, backgroundColor: C.sage, opacity: 0.3 },
  tick:    { position: 'absolute', width: 14, height: 1, backgroundColor: C.sagePale, transform: [{ rotate: '45deg' }] },
  dot:     { position: 'absolute', width: 3, height: 3, borderRadius: 1.5, backgroundColor: C.sagePale },
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: C.bg },
  inner: { flex: 1, paddingHorizontal: 28 },

  // Hero
  hero: { alignItems: 'center', paddingTop: 56, paddingBottom: 36 },
  logoWrap: {
    borderRadius: 32,
    overflow: 'hidden',
    marginBottom: 22,
    shadowColor: C.sage,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 12,
  },
  logoGrad: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: {
    fontSize: 40,
    fontWeight: '900',
    color: C.ink,
    letterSpacing: -1,
    marginBottom: 12,
    fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Heavy' : 'sans-serif-black',
  },
  tagline: {
    fontSize: 14,
    color: C.inkFaint,
    textAlign: 'center',
    lineHeight: 24,
    letterSpacing: 0.2,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },

  // Features
  features: { flex: 1, justifyContent: 'center', gap: 12 },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.bgCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.line,
    gap: 14,
    shadowColor: '#00000008',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  featureIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: C.sageTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
    fontSize: 13,
    color: C.ink,
    fontWeight: '600',
    lineHeight: 20,
    letterSpacing: 0.1,
  },

  // CTA
  cta: { paddingBottom: 36 },
  primaryBtnWrap: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 20,
    shadowColor: C.sage,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 20,
  },
  primaryBtnText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Heavy' : 'sans-serif-black',
  },
  disclaimer: {
    fontSize: 11,
    color: C.inkFaint,
    textAlign: 'center',
    lineHeight: 18,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
});
