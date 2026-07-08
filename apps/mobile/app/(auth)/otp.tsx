import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useState, useRef, useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

export default function OTPScreen() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const setSession = useAuthStore(s => s.setSession);

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const otpValue = otp.join('');
  const isComplete = otpValue.length === OTP_LENGTH;

  function handleDigit(digit: string, index: number) {
    if (!/^\d*$/.test(digit)) return;
    const newOtp = [...otp];

    if (digit.length > 1) {
      // Handle paste — distribute across boxes
      const digits = digit.replace(/\D/g, '').slice(0, OTP_LENGTH);
      digits.split('').forEach((d, i) => {
        if (index + i < OTP_LENGTH) newOtp[index + i] = d;
      });
      setOtp(newOtp);
      const nextFocus = Math.min(index + digits.length, OTP_LENGTH - 1);
      inputRefs.current[nextFocus]?.focus();
    } else {
      newOtp[index] = digit;
      setOtp(newOtp);
      if (digit && index < OTP_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    }
  }

  function handleBackspace(index: number) {
    if (otp[index]) {
      const newOtp = [...otp];
      newOtp[index] = '';
      setOtp(newOtp);
    } else if (index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function handleVerify() {
    if (!isComplete || isVerifying) return;
    setIsVerifying(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone: phone!,
        token: otpValue,
        type: 'sms',
      });
      if (error) throw error;
      setSession(data.session);
      // Root layout will redirect to setup/profile automatically
    } catch (err: any) {
      Alert.alert('Invalid Code', err.message ?? 'The OTP entered is incorrect. Please try again.');
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleResend() {
    if (countdown > 0 || isResending) return;
    setIsResending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: phone!,
        options: { channel: 'sms' },
      });
      if (error) throw error;
      setCountdown(RESEND_SECONDS);
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not resend OTP.');
    } finally {
      setIsResending(false);
    }
  }

  // Auto-verify when all 6 digits entered
  useEffect(() => {
    if (isComplete) handleVerify();
  }, [otpValue]);

  const maskedPhone = phone
    ? `+91 ${phone.slice(-10, -5).replace(/./g, '•')} ${phone.slice(-5)}`
    : '';

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.inner}>
          {/* Back */}
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Verify your{'\n'}number</Text>
            <Text style={styles.subtitle}>
              Enter the 6-digit code sent to{'\n'}
              <Text style={styles.phoneHighlight}>{maskedPhone}</Text>
            </Text>
          </View>

          {/* OTP Boxes */}
          <View style={styles.otpRow}>
            {Array(OTP_LENGTH)
              .fill(null)
              .map((_, i) => (
                <TextInput
                  key={i}
                  ref={el => { inputRefs.current[i] = el; }}
                  style={[styles.otpBox, otp[i] ? styles.otpBoxFilled : null]}
                  value={otp[i]}
                  onChangeText={t => handleDigit(t, i)}
                  onKeyPress={({ nativeEvent }) => {
                    if (nativeEvent.key === 'Backspace') handleBackspace(i);
                  }}
                  keyboardType="number-pad"
                  maxLength={6} // allow paste
                  selectTextOnFocus
                  autoFocus={i === 0}
                />
              ))}
          </View>

          {/* Verify button */}
          <TouchableOpacity
            style={[styles.btn, (!isComplete || isVerifying) && styles.btnDisabled]}
            onPress={handleVerify}
            disabled={!isComplete || isVerifying}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>
              {isVerifying ? 'Verifying...' : 'Verify →'}
            </Text>
          </TouchableOpacity>

          {/* Resend */}
          <View style={styles.resendRow}>
            <Text style={styles.resendLabel}>Didn't receive the code? </Text>
            <TouchableOpacity onPress={handleResend} disabled={countdown > 0}>
              <Text style={[styles.resendBtn, countdown > 0 && styles.resendBtnDisabled]}>
                {countdown > 0 ? `Resend in ${countdown}s` : 'Resend OTP'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F14' },
  inner: { flex: 1, padding: 24 },
  backBtn: { marginBottom: 32 },
  backBtnText: { fontSize: 15, color: '#888899', fontWeight: '600' },
  header: { marginBottom: 48 },
  title: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -1,
    marginBottom: 12,
    lineHeight: 42,
  },
  subtitle: { fontSize: 15, color: '#666680', lineHeight: 24 },
  phoneHighlight: { color: '#FFFFFF', fontWeight: '700' },
  otpRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 40,
  },
  otpBox: {
    flex: 1,
    height: 64,
    backgroundColor: '#16161E',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#2A2A36',
    textAlign: 'center',
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    maxWidth: 52,
  },
  otpBoxFilled: {
    borderColor: '#FF3B3B',
    backgroundColor: '#1E0D0D',
  },
  btn: {
    backgroundColor: '#FF3B3B',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#FF3B3B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  btnDisabled: { backgroundColor: '#3A1A1A', shadowOpacity: 0 },
  btnText: { fontSize: 17, fontWeight: '800', color: '#FFFFFF' },
  resendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  resendLabel: { fontSize: 14, color: '#666680' },
  resendBtn: { fontSize: 14, fontWeight: '700', color: '#FF3B3B' },
  resendBtnDisabled: { color: '#444456' },
});
