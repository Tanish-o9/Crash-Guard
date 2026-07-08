import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { useUserStore } from '@/store/userStore';
import { SetupShell } from '@/components/SetupShell';
import type { BloodGroup, VehicleType } from '@crashguard/types';

const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];

const VEHICLE_TYPES: { value: VehicleType; label: string; icon: string }[] = [
  { value: 'motorcycle', label: 'Motorcycle', icon: '🏍️' },
  { value: 'scooter', label: 'Scooter', icon: '🛵' },
  { value: 'moped', label: 'Moped', icon: '🛵' },
  { value: 'other', label: 'Other', icon: '🚗' },
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
      // Show the exact error message from the store
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
      <Text style={styles.label}>Your full name *</Text>
      <TextInput
        style={styles.input}
        value={onboardingDraft.name}
        onChangeText={t => updateDraft({ name: t })}
        placeholder="Arjun Sharma"
        placeholderTextColor="#444456"
        autoCapitalize="words"
        returnKeyType="next"
        autoFocus
      />

      {/* Blood Group */}
      <Text style={styles.label}>Blood group</Text>
      <View style={styles.pillGrid}>
        {BLOOD_GROUPS.map(bg => (
          <TouchableOpacity
            key={bg}
            style={[
              styles.pill,
              onboardingDraft.bloodGroup === bg && styles.pillSelected,
            ]}
            onPress={() => updateDraft({ bloodGroup: bg })}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.pillText,
                onboardingDraft.bloodGroup === bg && styles.pillTextSelected,
              ]}
            >
              {bg}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Vehicle Type */}
      <Text style={styles.label}>Your vehicle</Text>
      <View style={styles.vehicleGrid}>
        {VEHICLE_TYPES.map(v => (
          <TouchableOpacity
            key={v.value}
            style={[
              styles.vehicleCard,
              onboardingDraft.vehicleType === v.value && styles.vehicleCardSelected,
            ]}
            onPress={() => updateDraft({ vehicleType: v.value })}
            activeOpacity={0.8}
          >
            <Text style={styles.vehicleIcon}>{v.icon}</Text>
            <Text
              style={[
                styles.vehicleLabel,
                onboardingDraft.vehicleType === v.value && styles.vehicleLabelSelected,
              ]}
            >
              {v.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </SetupShell>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '700', color: '#666680', letterSpacing: 0.5, marginBottom: 10, textTransform: 'uppercase' },
  input: {
    backgroundColor: '#16161E',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#2A2A36',
    padding: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 28,
  },
  pillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28 },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#16161E',
    borderWidth: 1.5,
    borderColor: '#2A2A36',
  },
  pillSelected: { backgroundColor: '#1E0D0D', borderColor: '#FF3B3B' },
  pillText: { fontSize: 14, fontWeight: '700', color: '#666680' },
  pillTextSelected: { color: '#FF3B3B' },
  vehicleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 8 },
  vehicleCard: {
    flex: 1,
    minWidth: '44%',
    backgroundColor: '#16161E',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#2A2A36',
    padding: 18,
    alignItems: 'center',
    gap: 8,
  },
  vehicleCardSelected: { backgroundColor: '#1E0D0D', borderColor: '#FF3B3B' },
  vehicleIcon: { fontSize: 32 },
  vehicleLabel: { fontSize: 13, fontWeight: '700', color: '#666680' },
  vehicleLabelSelected: { color: '#FF3B3B' },
});
