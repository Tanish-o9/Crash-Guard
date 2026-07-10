import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { useUserStore } from '@/store/userStore';
import { SetupShell } from '@/components/SetupShell';

export default function MedicalInfoScreen() {
  const router = useRouter();
  const { session } = useAuthStore();
  const { onboardingDraft, updateDraft, saveMedicalInfo, isLoading } = useUserStore();

  async function handleNext() {
    if (!session?.user.id) return;
    const ok = await saveMedicalInfo(session.user.id);
    if (ok) router.push('/(auth)/setup/permissions');
    else Alert.alert('Error', 'Failed to save medical info. Please try again.');
  }

  function handleSkip() {
    router.push('/(auth)/setup/permissions');
  }

  return (
    <SetupShell
      step={4}
      totalSteps={5}
      title={"Medical info\n(Optional)"}
      subtitle="This helps emergency responders give better care. It's stored securely and shared only during an active emergency."
      onBack={() => router.back()}
      onNext={handleNext}
      nextLabel="Save & Continue →"
      isLoading={isLoading}
    >
      {/* Allergies */}
      <Text style={styles.label}>Known allergies</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={onboardingDraft.medicalAllergies}
        onChangeText={t => updateDraft({ medicalAllergies: t })}
        placeholder="e.g. Penicillin, Aspirin"
        placeholderTextColor="#444456"
        multiline
        numberOfLines={3}
        autoCapitalize="words"
      />
      <Text style={styles.hint}>Separate multiple with commas</Text>

      {/* Medical conditions */}
      <Text style={styles.label}>Medical conditions</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={onboardingDraft.medicalConditions}
        onChangeText={t => updateDraft({ medicalConditions: t })}
        placeholder="e.g. Diabetes, Hypertension, Heart condition"
        placeholderTextColor="#444456"
        multiline
        numberOfLines={3}
        autoCapitalize="words"
      />
      <Text style={styles.hint}>Separate multiple with commas</Text>

      {/* Privacy note */}
      <View style={styles.privacyCard}>
        <Text style={styles.privacyIcon}>🔒</Text>
        <Text style={styles.privacyText}>
          Medical data is encrypted at rest and only visible to you and emergency
          responders during an active incident. We never share it with third parties.
        </Text>
      </View>

      {/* Skip button */}
      <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
        <Text style={styles.skipText}>Skip for now</Text>
      </TouchableOpacity>
    </SetupShell>
  );
}

const C = {
  bgCard: '#FFFFFF', sage: '#4A7060', sagePale: '#C4D8CC', sageTint: '#EBF3EF',
  ink: '#1C2826', inkMid: '#445550', inkFaint: '#8A9E96',
  line: '#DDD6C8', lineLight: '#EAE4D8',
};

const styles = StyleSheet.create({
  label: {
    fontSize: 11, fontWeight: '800', color: C.inkFaint,
    letterSpacing: 2, marginBottom: 10, textTransform: 'uppercase',
  },
  input: {
    backgroundColor: C.bgCard,
    borderRadius: 14, borderWidth: 1.5, borderColor: C.line,
    padding: 16, fontSize: 15, fontWeight: '500', color: C.ink, marginBottom: 6,
  },
  multiline: { height: 90, textAlignVertical: 'top' },
  hint: { fontSize: 12, color: C.inkFaint, marginBottom: 24, marginLeft: 2 },
  privacyCard: {
    flexDirection: 'row', gap: 12, backgroundColor: C.sageTint,
    borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.sagePale,
    alignItems: 'flex-start', marginBottom: 20,
  },
  privacyIcon: { fontSize: 18 },
  privacyText: { flex: 1, fontSize: 12, color: C.inkMid, lineHeight: 18 },
  skipBtn: { alignItems: 'center', paddingVertical: 10 },
  skipText: { fontSize: 14, color: C.inkFaint, fontWeight: '600' },
});

