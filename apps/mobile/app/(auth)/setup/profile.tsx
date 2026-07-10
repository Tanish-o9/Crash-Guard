import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { useUserStore } from '@/store/userStore';
import { SetupShell } from '@/components/SetupShell';
import type { BloodGroup, VehicleType } from '@crashguard/types';

const C = {
  bg: '#F5F0E8', bgCard: '#FFFFFF', sage: '#4A7060', sageTint: '#EBF3EF',
  sagePale: '#C4D8CC', ink: '#1C2826', inkMid: '#445550', inkFaint: '#8A9E96',
  line: '#DDD6C8', lineLight: '#EAE4D8', coral: '#C8503C',
};

const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];

const VEHICLE_TYPES: { value: VehicleType; label: string; icon: string }[] = [
  { value: 'motorcycle', label: 'Motorcycle', icon: '🏍️' },
  { value: 'scooter',    label: 'Scooter',    icon: '🛵' },
  { value: 'moped',      label: 'Moped',      icon: '🛵' },
  { value: 'other',      label: 'Other',      icon: '🚗' },
];

export default function ProfileSetupScreen() {
  const router = useRouter();
  const { session } = useAuthStore();
  const { onboardingDraft, updateDraft, saveProfile, isLoading } = useUserStore();

  const isValid = onboardingDraft.name.trim().length >= 2;

  async function handleNext() {
    if (!session?.user.id || !isValid) return;
    const ok = await saveProfile(session.user.id);
    if (ok) router.push('/(auth)/setup/mount');
    else {
      const errorMsg = useUserStore.getState().error;
      Alert.alert('Database Error', `Failed to save profile:\n${errorMsg || 'Unknown error'}`);
    }
  }

  return (
    <SetupShell
      step={1}
      totalSteps={5}
      title={"Tell us about\nyourself"}
      subtitle="This information will be shared with emergency responders if you're in a crash."
      onNext={handleNext}
      nextDisabled={!isValid}
      isLoading={isLoading}
    >
      {/* Name */}
      <Text style={s.label}>Full name *</Text>
      <TextInput
        style={s.input}
        value={onboardingDraft.name}
        onChangeText={t => updateDraft({ name: t })}
        placeholder="Arjun Sharma"
        placeholderTextColor={C.inkFaint}
        autoCapitalize="words"
        returnKeyType="next"
        autoFocus
      />

      {/* Blood Group */}
      <Text style={s.label}>Blood group</Text>
      <View style={s.pillGrid}>
        {BLOOD_GROUPS.map(bg => (
          <TouchableOpacity
            key={bg}
            style={[s.pill, onboardingDraft.bloodGroup === bg && s.pillSelected]}
            onPress={() => updateDraft({ bloodGroup: bg })}
            activeOpacity={0.7}
          >
            <Text style={[s.pillText, onboardingDraft.bloodGroup === bg && s.pillTextSelected]}>
              {bg}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Vehicle Type */}
      <Text style={s.label}>Your vehicle</Text>
      <View style={s.vehicleGrid}>
        {VEHICLE_TYPES.map(v => (
          <TouchableOpacity
            key={v.value}
            style={[s.vehicleCard, onboardingDraft.vehicleType === v.value && s.vehicleCardSelected]}
            onPress={() => updateDraft({ vehicleType: v.value })}
            activeOpacity={0.8}
          >
            <Text style={s.vehicleIcon}>{v.icon}</Text>
            <Text style={[s.vehicleLabel, onboardingDraft.vehicleType === v.value && s.vehicleLabelSelected]}>
              {v.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </SetupShell>
  );
}

const s = StyleSheet.create({
  label: {
    fontSize: 11, fontWeight: '800', color: C.inkFaint,
    letterSpacing: 2, marginBottom: 10, textTransform: 'uppercase',
  },
  input: {
    backgroundColor: C.bgCard, borderRadius: 16, borderWidth: 1.5,
    borderColor: C.line, padding: 16, fontSize: 18, fontWeight: '600',
    color: C.ink, marginBottom: 28,
    fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Medium' : 'sans-serif-medium',
  },
  pillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28 },
  pill: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
    backgroundColor: C.bgCard, borderWidth: 1.5, borderColor: C.line,
  },
  pillSelected: { backgroundColor: C.sageTint, borderColor: C.sage },
  pillText: { fontSize: 14, fontWeight: '700', color: C.inkFaint },
  pillTextSelected: { color: C.sage },
  vehicleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 8 },
  vehicleCard: {
    flex: 1, minWidth: '44%', backgroundColor: C.bgCard, borderRadius: 18,
    borderWidth: 1.5, borderColor: C.line, padding: 18,
    alignItems: 'center', gap: 8,
  },
  vehicleCardSelected: { backgroundColor: C.sageTint, borderColor: C.sage },
  vehicleIcon: { fontSize: 32 },
  vehicleLabel: { fontSize: 13, fontWeight: '700', color: C.inkFaint },
  vehicleLabelSelected: { color: C.sage },
});
