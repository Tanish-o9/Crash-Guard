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
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

const C = {
  bg: '#F5F0E8', bgDeep: '#EDE7D9', bgCard: '#FFFFFF',
  sage: '#4A7060', sagePale: '#C4D8CC', sageTint: '#EBF3EF', teal: '#356060',
  ink: '#1C2826', inkMid: '#445550', inkFaint: '#8A9E96',
  line: '#DDD6C8', lineLight: '#EAE4D8', coral: '#C8503C',
};

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
        <View style={s.inner}>

          {/* Back */}
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Feather name="arrow-left" size={18} color={C.inkMid} />
            <Text style={s.backText}>Back</Text>
          </TouchableOpacity>

          {/* Header */}
          <View style={s.header}>
            <Text style={s.title}>Verify your{'\n'}number</Text>
            <Text style={s.subtitle}>
              Enter the 6-digit code sent to{'\n'}
              <Text style={s.phoneHighlight}>{maskedPhone}</Text>
            </Text>
          </View>

          {/* OTP Boxes */}
          <View style={s.otpRow}>
            {Array(OTP_LENGTH).fill(null).map((_, i) => (
              <TextInput
                key={i}
                ref={el => { inputRefs.current[i] = el; }}
                style={[s.otpBox, otp[i] ? s.otpBoxFilled : null]}
                value={otp[i]}
                onChangeText={t => handleDigit(t, i)}
                onKeyPress={({ nativeEvent }) => {
                  if (nativeEvent.key === 'Backspace') handleBackspace(i);
                }}
                keyboardType="number-pad"
                maxLength={6}
                selectTextOnFocus
                autoFocus={i === 0}
              />
            ))}
          </View>

          {/* Verify button */}
          <TouchableOpacity
            style={[s.btnWrap, (!isComplete || isVerifying) && s.btnWrapDisabled]}
            onPress={handleVerify}
            disabled={!isComplete || isVerifying}
            activeOpacity={0.88}
          >
            {!isComplete || isVerifying ? (
              <View style={s.btnInner}>
                <Text style={[s.btnText, { color: C.inkFaint }]}>
                  {isVerifying ? 'Verifying…' : 'Verify'}
                </Text>
              </View>
            ) : (
              <LinearGradient colors={[C.sage, C.teal]} style={s.btnInner}>
                <Text style={s.btnText}>{isVerifying ? 'Verifying…' : 'Verify'}</Text>
                <Feather name="arrow-right" size={18} color="#FFFFFF" />
              </LinearGradient>
            )}
          </TouchableOpacity>

          {/* Resend */}
          <View style={s.resendRow}>
            <Text style={s.resendLabel}>Didn't receive the code? </Text>
            <TouchableOpacity onPress={handleResend} disabled={countdown > 0}>
              <Text style={[s.resendBtn, countdown > 0 && s.resendBtnDisabled]}>
                {countdown > 0 ? `Resend in ${countdown}s` : 'Resend OTP'}
              </Text>
            </TouchableOpacity>
          </View>

        </View>
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
  inner: { flex: 1, padding: 24 },
  backBtn:{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 36 },
  backText:{ fontSize: 14, color: C.inkMid, fontWeight: '600' },
  header:{ marginBottom: 48 },
  title: {
    fontSize: 36, fontWeight: '900', color: C.ink, letterSpacing: -1,
    marginBottom: 14, lineHeight: 44,
    fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Heavy' : 'sans-serif-black',
  },
  subtitle: { fontSize: 14, color: C.inkFaint, lineHeight: 24, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  phoneHighlight: { color: C.ink, fontWeight: '700' },
  otpRow: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginBottom: 40 },
  otpBox: {
    flex: 1, height: 68, backgroundColor: C.bgCard, borderRadius: 16,
    borderWidth: 1.5, borderColor: C.line, textAlign: 'center',
    fontSize: 28, fontWeight: '800', color: C.ink, maxWidth: 52,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  otpBoxFilled: {
    borderColor: C.sage, backgroundColor: C.sageTint,
    shadowColor: C.sage, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 6, elevation: 4,
  },
  btnWrap:{ borderRadius: 18, overflow: 'hidden', marginBottom: 24 },
  btnWrapDisabled: {},
  btnInner:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 20, backgroundColor: C.lineLight },
  btnText: { fontSize: 17, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.5 },
  resendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  resendLabel: { fontSize: 13, color: C.inkFaint, fontWeight: '500' },
  resendBtn: { fontSize: 13, fontWeight: '800', color: C.sage },
  resendBtnDisabled: { color: C.inkFaint },
});
