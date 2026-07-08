import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useUserStore } from '@/store/userStore';
import { SetupShell } from '@/components/SetupShell';
import type { MountPosition } from '@crashguard/types';

const MOUNT_OPTIONS: {
  value: MountPosition;
  label: string;
  icon: string;
  description: string;
}[] = [
  {
    value: 'handlebar',
    label: 'Handlebar Mount',
    icon: '🏍️',
    description: 'Phone mounted on handlebar or stem — most common & best for detection',
  },
  {
    value: 'chest_pocket',
    label: 'Chest / Jacket Pocket',
    icon: '🧥',
    description: 'Phone in chest or breast pocket of riding jacket',
  },
  {
    value: 'jacket_pocket',
    label: 'Side / Hip Pocket',
    icon: '👖',
    description: 'Phone in jeans or jacket side pocket',
  },
  {
    value: 'tank_bag',
    label: 'Tank Bag / Top Case',
    icon: '🎒',
    description: 'Phone inside a magnetic tank bag or top case',
  },
  {
    value: 'other',
    label: 'Other Position',
    icon: '📱',
    description: 'Any other position — detection accuracy may be lower',
  },
];

export default function MountPositionScreen() {
  const router = useRouter();
  const { onboardingDraft, updateDraft } = useUserStore();

  return (
    <SetupShell
      step={2}
      totalSteps={5}
      title={"Where is your\nphone mounted?"}
      subtitle="This helps calibrate crash detection for your riding style. Choose what you use most often."
      onBack={() => router.back()}
      onNext={() => router.push('/(auth)/setup/contacts')}
    >
      <View style={styles.list}>
        {MOUNT_OPTIONS.map(opt => {
          const selected = onboardingDraft.mountPosition === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.card, selected && styles.cardSelected]}
              onPress={() => updateDraft({ mountPosition: opt.value })}
              activeOpacity={0.8}
            >
              {/* Left icon */}
              <View style={[styles.iconWrap, selected && styles.iconWrapSelected]}>
                <Text style={styles.icon}>{opt.icon}</Text>
              </View>

              {/* Text */}
              <View style={styles.cardText}>
                <Text style={[styles.cardLabel, selected && styles.cardLabelSelected]}>
                  {opt.label}
                </Text>
                <Text style={styles.cardDesc}>{opt.description}</Text>
              </View>

              {/* Radio */}
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Info note */}
      <View style={styles.infoCard}>
        <Text style={styles.infoIcon}>💡</Text>
        <Text style={styles.infoText}>
          Handlebar mount gives the most accurate detection. Other positions still work well
          but may have slightly higher false-positive rates.
        </Text>
      </View>
    </SetupShell>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10, marginBottom: 20 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16161E',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#2A2A36',
    padding: 16,
    gap: 14,
  },
  cardSelected: { backgroundColor: '#1A0D0D', borderColor: '#FF3B3B' },
  iconWrap: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#1E1E2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapSelected: { backgroundColor: '#2A1010' },
  icon: { fontSize: 26 },
  cardText: { flex: 1 },
  cardLabel: { fontSize: 15, fontWeight: '700', color: '#888899', marginBottom: 3 },
  cardLabelSelected: { color: '#FFFFFF' },
  cardDesc: { fontSize: 12, color: '#555566', lineHeight: 17 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#2A2A36',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: '#FF3B3B' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF3B3B' },
  infoCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#16161E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A36',
    alignItems: 'flex-start',
  },
  infoIcon: { fontSize: 18 },
  infoText: { flex: 1, fontSize: 12, color: '#555566', lineHeight: 18 },
});
