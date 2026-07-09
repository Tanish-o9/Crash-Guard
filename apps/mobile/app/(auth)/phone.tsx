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
import { supabase } from '@/lib/supabase';

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
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.inner}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back */}
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Enter your{'\n'}phone number</Text>
            <Text style={styles.subtitle}>
              We'll send a one-time code to verify it's you.{'\n'}
              Your number is only used for emergency alerts.
            </Text>
          </View>

          {/* Phone input */}
          <View style={styles.inputCard}>
            {/* Country prefix */}
            <View style={styles.prefix}>
              <Text style={styles.flag}>🇮🇳</Text>
              <Text style={styles.prefixText}>+91</Text>
            </View>
            <View style={styles.divider} />
            <TextInput
              style={styles.input}
              value={formatDisplay(phone)}
              onChangeText={t => setPhone(t.replace(/\D/g, '').slice(0, 10))}
              placeholder="98765 43210"
              placeholderTextColor="#444456"
              keyboardType="phone-pad"
              returnKeyType="done"
              onSubmitEditing={handleSendOTP}
              autoFocus
              maxLength={11} // 10 digits + 1 space
            />
          </View>

          {/* Validation hint */}
          {phone.length > 0 && !isValid && (
            <Text style={styles.hint}>Enter a 10-digit Indian mobile number</Text>
          )}

          {/* CTA */}
          <TouchableOpacity
            style={[styles.btn, (!isValid || isLoading) && styles.btnDisabled]}
            onPress={handleSendOTP}
            disabled={!isValid || isLoading}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>
              {isLoading ? 'Sending...' : 'Send OTP →'}
            </Text>
          </TouchableOpacity>

          {/* Privacy note */}
          <View style={styles.privacyCard}>
            <Text style={styles.privacyIcon}>🔒</Text>
            <Text style={styles.privacyText}>
              Your number is stored securely and shared with emergency services
              only during an active crash alert.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' },
  inner: { flex: 1, padding: 24, paddingBottom: 48 },
  backBtn: { marginBottom: 32 },
  backBtnText: { fontSize: 13, color: '#00E5FF', fontWeight: '800', letterSpacing: 1 },
  header: { marginBottom: 40 },
  title: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1,
    marginBottom: 12,
    lineHeight: 42,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  subtitle: { fontSize: 13, color: '#888888', lineHeight: 22, fontWeight: '600' },
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111111',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#222222',
    marginBottom: 12,
    overflow: 'hidden',
    height: 66,
  },
  prefix: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  flag: { fontSize: 22 },
  prefixText: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', letterSpacing: 1 },
  divider: { width: 1, height: 36, backgroundColor: '#222222' },
  input: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: '#00E5FF',
    paddingHorizontal: 16,
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  hint: { fontSize: 11, color: '#FF2A4D', marginBottom: 8, marginLeft: 4, fontWeight: '700' },
  btn: {
    backgroundColor: '#00E5FF',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 28,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  btnDisabled: { backgroundColor: '#050505', shadowOpacity: 0, borderWidth: 1, borderColor: '#222222' },
  btnText: { fontSize: 17, fontWeight: '900', color: '#050505', letterSpacing: 1 },
  privacyCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#111111',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#222222',
    alignItems: 'flex-start',
  },
  privacyIcon: { fontSize: 18 },
  privacyText: { flex: 1, fontSize: 11, color: '#666666', lineHeight: 18, fontWeight: '600' },
});
