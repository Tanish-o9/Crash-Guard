import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ImageBackground,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

const { height } = Dimensions.get('window');

const FEATURES = [
  { icon: '🔊', text: 'Auto crash detection via motion sensors' },
  { icon: '📞', text: 'Instant emergency alert to your contacts' },
  { icon: '🗺️', text: 'Live location shared with responders' },
  { icon: '🆘', text: 'Good Samaritan widget for bystanders' },
];

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      {/* Gradient background */}
      <LinearGradient
        colors={['#002A2A', '#050505', '#050505']}
        style={StyleSheet.absoluteFill}
      />

      {/* Top glow effect */}
      <View style={styles.glowTop} />

      <SafeAreaView style={styles.inner}>
        {/* Hero Section */}
        <View style={styles.hero}>
          <View style={styles.logoWrap}>
            <Text style={styles.logoIcon}>🏍️</Text>
          </View>
          <Text style={styles.appName}>CrashGuard</Text>
          <Text style={styles.tagline}>
            Crash detection & emergency{'\n'}response for Indian riders
          </Text>
        </View>

        {/* Feature list */}
        <View style={styles.features}>
          {FEATURES.map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <View style={styles.featureIconWrap}>
                <Text style={styles.featureIcon}>{f.icon}</Text>
              </View>
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>

        {/* CTA Buttons */}
        <View style={styles.cta}>
          <TouchableOpacity
            style={styles.primaryBtn}
            activeOpacity={0.85}
            onPress={() => router.push('/(auth)/phone')}
          >
            <Text style={styles.primaryBtnText}>Get Started →</Text>
          </TouchableOpacity>

          <Text style={styles.disclaimer}>
            Designed for two-wheeler riders in India.{'\n'}
            Works offline. No subscription required.
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' },
  inner: { flex: 1, paddingHorizontal: 28 },
  glowTop: {
    position: 'absolute',
    top: -120,
    left: '50%',
    marginLeft: -150,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#00E5FF',
    opacity: 0.1,
  },
  hero: { alignItems: 'center', paddingTop: 60, paddingBottom: 40 },
  logoWrap: {
    width: 100,
    height: 100,
    borderRadius: 28,
    backgroundColor: '#001A1A',
    borderWidth: 1.5,
    borderColor: '#00E5FF44',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 12,
  },
  logoIcon: { fontSize: 52 },
  appName: {
    fontSize: 38,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
    marginBottom: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  tagline: {
    fontSize: 14,
    color: '#888888',
    textAlign: 'center',
    lineHeight: 24,
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  features: {
    flex: 1,
    justifyContent: 'center',
    gap: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111111',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#222222',
    gap: 14,
  },
  featureIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#050505',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#222222',
  },
  featureIcon: { fontSize: 22 },
  featureText: { flex: 1, fontSize: 13, color: '#FFFFFF', fontWeight: '700', lineHeight: 20, letterSpacing: 0.5 },
  cta: { paddingBottom: 32 },
  primaryBtn: {
    backgroundColor: '#00E5FF',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  primaryBtnText: { fontSize: 17, fontWeight: '900', color: '#050505', letterSpacing: 1 },
  disclaimer: {
    fontSize: 11,
    color: '#444444',
    textAlign: 'center',
    lineHeight: 18,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});
