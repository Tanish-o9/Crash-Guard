import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { useUserStore } from '@/store/userStore';
import { useCalibration } from '@/hooks/useCalibration';

export default function SettingsScreen() {
  const router = useRouter();
  const { signOut } = useAuthStore();
  const { profile } = useUserStore();
  const {
    calibrationStatus,
    isValid,
    progressFraction,
    sampleCount,
    etaString,
    isSaving,
    resetCalibration,
  } = useCalibration();

  async function handleResetCalibration() {
    Alert.alert(
      'Reset Calibration',
      'This will delete your personal sensor baseline. Crash detection will be disabled until you complete a new calibration ride.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await resetCalibration();
            Alert.alert('Done', 'Calibration reset. Start a new ride to recalibrate.');
          },
        },
      ]
    );
  }

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
    ]);
  }

  const calibrationLabel = isValid
    ? `Active · ${sampleCount} samples`
    : calibrationStatus === 'calibrating'
    ? `In progress · ${Math.round(progressFraction * 100)}% · ${etaString}`
    : 'Not calibrated';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>Settings</Text>

        {/* Profile card */}
        <Section title="ACCOUNT">
          <SettingRow
            icon="👤"
            label="Profile"
            value={profile?.name ?? 'Not set'}
            onPress={() => router.push('/(auth)/setup/profile')}
          />
          <SettingRow
            icon="📞"
            label="Emergency Contacts"
            value="Manage contacts"
            onPress={() => router.push('/(auth)/setup/contacts')}
          />
          <SettingRow
            icon="🩺"
            label="Medical Info"
            value="Update info"
            onPress={() => router.push('/(auth)/setup/medical')}
          />
        </Section>

        {/* Calibration section */}
        <Section title="CRASH DETECTION">
          <View style={styles.calibRow}>
            <View style={styles.calibIcon}>
              <Text style={styles.calibIconText}>🎯</Text>
            </View>
            <View style={styles.calibContent}>
              <Text style={styles.calibTitle}>Personal Calibration</Text>
              <Text style={[styles.calibStatus, isValid && styles.calibStatusActive]}>
                {calibrationLabel}
              </Text>
              {isValid && (
                <View style={styles.progressBarOuter}>
                  <View style={[styles.progressBarInner, { width: '100%' }]} />
                </View>
              )}
              {!isValid && calibrationStatus === 'calibrating' && (
                <View style={styles.progressBarOuter}>
                  <View style={[styles.progressBarInner, { width: `${progressFraction * 100}%` }]} />
                </View>
              )}
            </View>
          </View>

          {/* Calibration actions */}
          <View style={styles.calibActions}>
            {(!isValid && calibrationStatus !== 'calibrating') && (
              <TouchableOpacity
                style={styles.calibBtn}
                onPress={() => router.push('/(auth)/setup/calibration')}
                activeOpacity={0.8}
              >
                <Text style={styles.calibBtnText}>▶ Start Calibration Ride</Text>
              </TouchableOpacity>
            )}
            {calibrationStatus !== 'none' && calibrationStatus !== 'reset' && (
              <TouchableOpacity
                style={styles.calibResetBtn}
                onPress={handleResetCalibration}
                activeOpacity={0.8}
                disabled={isSaving}
              >
                <Text style={styles.calibResetText}>Reset Calibration</Text>
              </TouchableOpacity>
            )}
          </View>
        </Section>

        {/* Permissions */}
        <Section title="PERMISSIONS">
          <SettingRow
            icon="🔑"
            label="Manage Permissions"
            value="Location, Notifications, Mic"
            onPress={() => router.push('/(auth)/setup/permissions')}
          />
        </Section>

        {/* Vehicle */}
        <Section title="VEHICLE">
          <SettingRow
            icon="🏍️"
            label="Vehicle Type"
            value={profile?.vehicleType ?? 'Not set'}
            onPress={() => router.push('/(auth)/setup/profile')}
          />
          <SettingRow
            icon="📱"
            label="Mount Position"
            value={profile?.mountPosition ?? 'Not set'}
            onPress={() => router.push('/(auth)/setup/mount')}
          />
        </Section>

        {/* Privacy */}
        <Section title="PRIVACY & DATA">
          <SettingRow
            icon="🗑️"
            label="Delete My Data"
            value="Permanently remove all data"
            onPress={() =>
              Alert.alert('Delete Data', 'Contact support to delete all your data.')
            }
            danger
          />
        </Section>

        {/* Dev tools */}
        <Section title="DEVELOPER">
          <SettingRow
            icon="📊"
            label="Sensor Dashboard"
            value="Live sensor debug view"
            onPress={() => router.push('/(dev)/sensor-dashboard')}
          />
          <SettingRow
            icon="🎯"
            label="Baseline Viewer"
            value="Per-feature baseline values"
            onPress={() => router.push('/(dev)/baseline-viewer')}
          />
          <SettingRow
            icon="🔬"
            label="Anomaly Log"
            value="Real-time detection events"
            onPress={() => router.push('/(dev)/anomaly-log')}
          />
          <SettingRow
            icon="💥"
            label="Crash Simulator"
            value="Inject synthetic crash window"
            onPress={() => router.push('/(dev)/crash-simulator')}
          />
        </Section>

        {/* Sign out */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.8}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>CrashGuard v1.0.0 · Hackathon Build</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function SettingRow({
  icon,
  label,
  value,
  onPress,
  danger = false,
}: {
  icon: string;
  label: string;
  value?: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.settingRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.settingIcon}>
        <Text style={styles.settingIconText}>{icon}</Text>
      </View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingLabel, danger && styles.settingLabelDanger]}>{label}</Text>
        {value && <Text style={styles.settingValue} numberOfLines={1}>{value}</Text>}
      </View>
      <Text style={styles.settingChevron}>›</Text>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F14' },
  pageTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    letterSpacing: -0.5,
  },
  section: { paddingHorizontal: 20, marginBottom: 24 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#444456',
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  sectionCard: {
    backgroundColor: '#16161E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A36',
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E2A',
    gap: 12,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#1E1E2A',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  settingIconText: { fontSize: 18 },
  settingContent: { flex: 1 },
  settingLabel: { fontSize: 14, fontWeight: '600', color: '#FFFFFF', marginBottom: 1 },
  settingLabelDanger: { color: '#FF6B6B' },
  settingValue: { fontSize: 11, color: '#555566' },
  settingChevron: { fontSize: 18, color: '#2A2A36', fontWeight: '300' },
  calibRow: {
    flexDirection: 'row',
    padding: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E2A',
  },
  calibIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#1E1E2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calibIconText: { fontSize: 18 },
  calibContent: { flex: 1, gap: 4 },
  calibTitle: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  calibStatus: { fontSize: 11, color: '#555566' },
  calibStatusActive: { color: '#2ECC71' },
  progressBarOuter: {
    height: 4,
    backgroundColor: '#1E1E2A',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressBarInner: { height: 4, backgroundColor: '#FF3B3B', borderRadius: 2 },
  calibActions: { gap: 0 },
  calibBtn: {
    margin: 12,
    backgroundColor: '#FF3B3B',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: '#FF3B3B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  calibBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  calibResetBtn: {
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2A36',
  },
  calibResetText: { fontSize: 13, fontWeight: '600', color: '#666680' },
  signOutBtn: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: '#1A0D0D',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3A1A1A',
  },
  signOutText: { fontSize: 15, fontWeight: '700', color: '#FF6B6B' },
  version: { textAlign: 'center', fontSize: 11, color: '#2A2A36', marginBottom: 24 },
});
