import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

const C = {
  bg: '#F5F0E8', bgDeep: '#EDE7D9', bgCard: '#FFFFFF',
  sage: '#4A7060', sagePale: '#C4D8CC', sageTint: '#EBF3EF', teal: '#356060',
  ink: '#1C2826', inkMid: '#445550', inkFaint: '#8A9E96',
  line: '#DDD6C8', lineLight: '#EAE4D8', coral: '#C8503C',
};

export default function PhoneScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Format: strip non-digits, then prepend +91
  const rawDigits = phone.replace(/\D/g, '');
  const isValid = rawDigits.length === 10;
  const e164 = `+91${rawDigits}`;

  async function handleSendOTP() {
    if (!isValid) return;
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: e164,
        options: { channel: 'sms' },
      });
      if (error) throw error;
      router.push({ pathname: '/(auth)/otp', params: { phone: e164 } });
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to send OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  function formatDisplay(raw: string) {
    const d = raw.replace(/\D/g, '').slice(0, 10);
    if (d.length <= 5) return d;
    return `${d.slice(0, 5)} ${d.slice(5)}`;
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
        {[0,1,2,3,4,5,6].map(row =>
          [0,1,2,3,4].map(col => (
            <View key={`d-${row}-${col}`} style={[bg.dot, { top: 100 + row * 80, left: 16 + col * 82 }]} />
          ))
        )}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Back */}
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Feather name="arrow-left" size={18} color={C.inkMid} />
            <Text style={s.backText}>Back</Text>
          </TouchableOpacity>

          {/* Header */}
          <View style={s.header}>
            <Text style={s.title}>Enter your{'\n'}phone number</Text>
            <Text style={s.subtitle}>
              We'll send a one-time code to verify it's you.{'\n'}
              Your number is only used for emergency alerts.
            </Text>
          </View>

          {/* Phone input card */}
          <View style={[s.inputCard, isValid && s.inputCardValid]}>
            <View style={s.prefix}>
              <Text style={s.flag}>🇮🇳</Text>
              <Text style={s.prefixText}>+91</Text>
            </View>
            <View style={s.divider} />
            <TextInput
              style={s.input}
              value={formatDisplay(phone)}
              onChangeText={t => setPhone(t.replace(/\D/g, '').slice(0, 10))}
              placeholder="98765 43210"
              placeholderTextColor={C.inkFaint}
              keyboardType="phone-pad"
              returnKeyType="done"
              onSubmitEditing={handleSendOTP}
              autoFocus
              maxLength={11}
            />
            {isValid && <Feather name="check-circle" size={20} color={C.sage} style={{ marginRight: 16 }} />}
          </View>

          {/* Hint */}
          {phone.length > 0 && !isValid && (
            <Text style={s.hint}>Enter a 10-digit Indian mobile number</Text>
          )}

          {/* CTA */}
          <TouchableOpacity
            style={[s.btnWrap, (!isValid || isLoading) && s.btnWrapDisabled]}
            onPress={handleSendOTP}
            disabled={!isValid || isLoading}
            activeOpacity={0.88}
          >
            {!isValid || isLoading ? (
              <View style={s.btnInner}>
                <Text style={[s.btnText, { color: C.inkFaint }]}>
                  {isLoading ? 'Sending…' : 'Send OTP'}
                </Text>
              </View>
            ) : (
              <LinearGradient colors={[C.sage, C.teal]} style={s.btnInner}>
                <Text style={s.btnText}>{isLoading ? 'Sending…' : 'Send OTP'}</Text>
                <Feather name="arrow-right" size={18} color="#FFFFFF" />
              </LinearGradient>
            )}
          </TouchableOpacity>

          {/* Privacy note */}
          <View style={s.privacyCard}>
            <View style={s.privacyIconWrap}>
              <Feather name="lock" size={16} color={C.sage} />
            </View>
            <Text style={s.privacyText}>
              Your number is stored securely and shared with emergency services only during an active crash alert.
            </Text>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const bg = StyleSheet.create({
  arcTR:    { position: 'absolute', width: 280, height: 280, borderRadius: 140, borderWidth: 1, borderColor: C.sagePale, top: -130, right: -70 },
  arcBL:    { position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 1, borderColor: C.lineLight, bottom: 80, left: -70 },
  bracketH: { position: 'absolute', top: 16, left: 16, width: 22, height: 1, backgroundColor: C.sage, opacity: 0.3 },
  bracketV: { position: 'absolute', top: 16, left: 16, width: 1, height: 22, backgroundColor: C.sage, opacity: 0.3 },
  dot:      { position: 'absolute', width: 3, height: 3, borderRadius: 1.5, backgroundColor: C.sagePale },
});

const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: C.bg },
  scroll:{ flex: 1, padding: 24, paddingBottom: 48 },
  backBtn:{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 36 },
  backText:{ fontSize: 14, color: C.inkMid, fontWeight: '600' },
  header:{ marginBottom: 40 },
  title: {
    fontSize: 36, fontWeight: '900', color: C.ink, letterSpacing: -1,
    marginBottom: 14, lineHeight: 44,
    fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Heavy' : 'sans-serif-black',
  },
  subtitle: {
    fontSize: 14, color: C.inkFaint, lineHeight: 22,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  inputCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.bgCard,
    borderRadius: 18, borderWidth: 1.5, borderColor: C.line,
    marginBottom: 12, overflow: 'hidden', height: 70,
  },
  inputCardValid: { borderColor: C.sage },
  prefix: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 8 },
  flag:   { fontSize: 22 },
  prefixText: { fontSize: 18, fontWeight: '800', color: C.ink, letterSpacing: 0.5 },
  divider:{ width: 1, height: 36, backgroundColor: C.line },
  input:  {
    flex: 1, fontSize: 24, fontWeight: '700', color: C.ink,
    paddingHorizontal: 16, letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  hint:   { fontSize: 12, color: C.coral, marginBottom: 10, marginLeft: 4, fontWeight: '700' },
  btnWrap:{ borderRadius: 18, overflow: 'hidden', marginTop: 8, marginBottom: 28 },
  btnWrapDisabled: {},
  btnInner:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 20, backgroundColor: C.lineLight },
  btnText: { fontSize: 17, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.5 },
  privacyCard: {
    flexDirection: 'row', gap: 12, backgroundColor: C.bgCard,
    borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.line, alignItems: 'flex-start',
  },
  privacyIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.sageTint, alignItems: 'center', justifyContent: 'center' },
  privacyText: { flex: 1, fontSize: 12, color: C.inkFaint, lineHeight: 18, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
});
