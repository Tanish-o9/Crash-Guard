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
  container: { flex: 1, backgroundColor: '#0F0F14' },
  inner: { flexGrow: 1, padding: 24, paddingBottom: 48 },
  backBtn: { marginBottom: 32 },
  backBtnText: { fontSize: 15, color: '#888899', fontWeight: '600' },
  header: { marginBottom: 40 },
  title: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -1,
    marginBottom: 12,
    lineHeight: 42,
  },
  subtitle: { fontSize: 14, color: '#666680', lineHeight: 22 },
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16161E',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#2A2A36',
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
  prefixText: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  divider: { width: 1, height: 36, backgroundColor: '#2A2A36' },
  input: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    paddingHorizontal: 16,
    letterSpacing: 1,
  },
  hint: { fontSize: 12, color: '#FF6B6B', marginBottom: 8, marginLeft: 4 },
  btn: {
    backgroundColor: '#FF3B3B',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 28,
    shadowColor: '#FF3B3B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  btnDisabled: { backgroundColor: '#3A1A1A', shadowOpacity: 0 },
  btnText: { fontSize: 17, fontWeight: '800', color: '#FFFFFF' },
  privacyCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#16161E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A36',
    alignItems: 'flex-start',
  },
  privacyIcon: { fontSize: 18 },
  privacyText: { flex: 1, fontSize: 12, color: '#666680', lineHeight: 18 },
});
