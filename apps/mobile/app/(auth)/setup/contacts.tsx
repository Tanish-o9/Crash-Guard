import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { useUserStore } from '@/store/userStore';
import { SetupShell } from '@/components/SetupShell';

const MAX_CONTACTS = 3;

export default function EmergencyContactsScreen() {
  const router = useRouter();
  const { session } = useAuthStore();
  const { onboardingDraft, updateDraft, saveEmergencyContacts, isLoading, emergencyContacts } =
    useUserStore();

  // When editing post-onboarding (e.g. from Settings), seed the draft from the
  // already-saved contacts so they show up and aren't wiped on save.
  useEffect(() => {
    if (onboardingDraft.emergencyContacts.length === 0 && emergencyContacts.length > 0) {
      updateDraft({
        emergencyContacts: emergencyContacts.map((c, i) => ({
          name: c.name,
          phone: c.phone,
          priorityOrder: ((c as any).priorityOrder ?? i + 1) as 1 | 2 | 3,
        })),
      });
    }
  }, []);

  const contacts = onboardingDraft.emergencyContacts;

  function updateContact(index: number, field: 'name' | 'phone', value: string) {
    const updated = [...contacts];
    if (!updated[index]) {
      updated[index] = { name: '', phone: '', priorityOrder: (index + 1) as 1 | 2 | 3 };
    }
    updated[index] = { ...updated[index], [field]: value };
    updateDraft({ emergencyContacts: updated });
  }

  function addContact() {
    if (contacts.length >= MAX_CONTACTS) return;
    const newContact = {
      name: '',
      phone: '',
      priorityOrder: (contacts.length + 1) as 1 | 2 | 3,
    };
    updateDraft({ emergencyContacts: [...contacts, newContact] });
  }

  function removeContact(index: number) {
    const updated = contacts
      .filter((_, i) => i !== index)
      .map((c, i) => ({ ...c, priorityOrder: (i + 1) as 1 | 2 | 3 }));
    updateDraft({ emergencyContacts: updated });
  }

  const isValid =
    contacts.length >= 1 &&
    contacts.every(
      c =>
        c.name.trim().length >= 2 &&
        c.phone.replace(/\D/g, '').length === 10
    );

  async function handleNext() {
    if (!session?.user.id || !isValid) return;
    const ok = await saveEmergencyContacts(session.user.id);
    if (ok) router.push('/(auth)/setup/medical');
    else Alert.alert('Error', 'Failed to save emergency contacts. Please try again.');
  }

  return (
    <SetupShell
      step={3}
      totalSteps={5}
      title={"Emergency\ncontacts"}
      subtitle="These people will be called and texted immediately if a crash is detected. Add at least 1 contact."
      onBack={() => router.back()}
      onNext={handleNext}
      nextDisabled={!isValid}
      isLoading={isLoading}
    >
      {/* Contact cards */}
      {contacts.map((contact, i) => (
        <View key={i} style={styles.contactCard}>
          <View style={styles.contactHeader}>
            <View style={styles.contactBadge}>
              <Text style={styles.contactBadgeText}>#{i + 1}</Text>
              <Text style={styles.contactPriority}>
                {i === 0 ? ' · Called first' : i === 1 ? ' · Called second' : ' · Called third'}
              </Text>
            </View>
            {contacts.length > 1 && (
              <TouchableOpacity onPress={() => removeContact(i)} style={styles.removeBtn}>
                <Text style={styles.removeBtnText}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>

          <TextInput
            style={styles.input}
            value={contact.name}
            onChangeText={(t: string) => updateContact(i, 'name', t)}
            placeholder="Contact name"
            placeholderTextColor="#444456"
            autoCapitalize="words"
          />

          <View style={styles.phoneRow}>
            <View style={styles.phonePrefix}>
              <Text style={styles.phonePrefixText}>🇮🇳 +91</Text>
            </View>
            <TextInput
              style={styles.phoneInput}
              value={contact.phone.replace(/\D/g, '').slice(0, 10)}
              onChangeText={(t: string) => updateContact(i, 'phone', t.replace(/\D/g, '').slice(0, 10))}
              placeholder="Phone number"
              placeholderTextColor="#444456"
              keyboardType="phone-pad"
              maxLength={10}
            />
          </View>
        </View>
      ))}

      {/* Add contact */}
      {contacts.length < MAX_CONTACTS && (
        <TouchableOpacity style={styles.addBtn} onPress={addContact} activeOpacity={0.7}>
          <Text style={styles.addBtnText}>+ Add another contact</Text>
        </TouchableOpacity>
      )}

      {/* Info */}
      <View style={styles.infoCard}>
        <Text style={styles.infoIcon}>📞</Text>
        <Text style={styles.infoText}>
          Contacts are called in order. If the first doesn't answer, the second is called,
          then an SMS with your live location is sent to all.
        </Text>
      </View>
    </SetupShell>
  );
}

const C = {
  bgCard: '#FFFFFF', sage: '#4A7060', sagePale: '#C4D8CC', sageTint: '#EBF3EF',
  ink: '#1C2826', inkMid: '#445550', inkFaint: '#8A9E96',
  line: '#DDD6C8', lineLight: '#EAE4D8', coral: '#C8503C',
};

const styles = StyleSheet.create({
  contactCard: {
    backgroundColor: C.bgCard,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: C.line,
    padding: 16,
    marginBottom: 14,
    gap: 10,
    shadowColor: '#00000008',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  contactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  contactBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  contactBadgeText: { fontSize: 13, fontWeight: '800', color: C.sage },
  contactPriority: { fontSize: 12, color: C.inkFaint, fontWeight: '500' },
  removeBtn: {
    paddingVertical: 4, paddingHorizontal: 10,
    borderRadius: 8, backgroundColor: '#FAE8E5',
    borderWidth: 1, borderColor: C.coral + '44',
  },
  removeBtnText: { fontSize: 12, color: C.coral, fontWeight: '700' },
  input: {
    backgroundColor: C.lineLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    padding: 14,
    fontSize: 15,
    fontWeight: '600',
    color: C.ink,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.lineLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    overflow: 'hidden',
  },
  phonePrefix: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRightWidth: 1,
    borderRightColor: C.line,
  },
  phonePrefixText: { fontSize: 14, fontWeight: '700', color: C.inkMid },
  phoneInput: { flex: 1, padding: 14, fontSize: 15, fontWeight: '600', color: C.ink },
  addBtn: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: C.sagePale,
    borderStyle: 'dashed',
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: C.sageTint + '44',
  },
  addBtnText: { fontSize: 14, fontWeight: '700', color: C.sage },
  infoCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: C.sageTint,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.sagePale,
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  infoIcon: { fontSize: 18 },
  infoText: { flex: 1, fontSize: 12, color: C.inkMid, lineHeight: 18 },
});

