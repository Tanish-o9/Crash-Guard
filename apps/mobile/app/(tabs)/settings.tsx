import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { useUserStore } from '@/store/userStore';
import { useCalibration } from '@/hooks/useCalibration';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:        '#F5F0E8',
  bgDeep:    '#EDE7D9',
  bgCard:    '#FFFFFF',
  sage:      '#4A7060',
  sageLight: '#7A9E8E',
  sagePale:  '#C4D8CC',
  sageTint:  '#EBF3EF',
  teal:      '#356060',
  coral:     '#C8503C',
  amber:     '#B87830',
  ink:       '#1C2826',
  inkMid:    '#445550',
  inkFaint:  '#8A9E96',
  line:      '#DDD6C8',
  lineLight: '#EAE4D8',
};

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
    <SafeAreaView style={s.root}>

      {/* Background art */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient colors={[C.bg, C.bgDeep]} style={StyleSheet.absoluteFill} />
        <View style={bg.arcTR} />
        <View style={bg.arcBL} />
        <View style={bg.hRule} />
        <View style={bg.slash1} />
        <View style={bg.slash1b} />
        <View style={bg.bracketH} />
        <View style={bg.bracketV} />
        {[0,1,2,3,4,5,6].map(row =>
          [0,1,2,3,4].map(col => (
            <View key={`d-${row}-${col}`} style={[bg.dot, { top: 130 + row * 70, left: 16 + col * 82 }]} />
          ))
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.eyebrow}>App configuration</Text>
          <Text style={s.title}>Settings</Text>
        </View>

        {/* Profile hero card */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push('/(auth)/setup/profile')}
          style={s.profileCard}
        >
          <LinearGradient colors={[C.sage, C.teal]} style={s.profileGrad}>
            <View style={s.profileAvatar}>
              <Feather name="user" size={26} color={C.sage} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.profileName}>{profile?.name ?? 'Set your name'}</Text>
              <Text style={s.profileSub}>
                {profile?.bloodGroup ? `Blood: ${profile.bloodGroup}` : 'Tap to complete profile'}
                {profile?.vehicleType ? `  ·  ${profile.vehicleType}` : ''}
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.6)" />
          </LinearGradient>
        </TouchableOpacity>

        {/* ACCOUNT */}
        <Section title="ACCOUNT" icon="user">
          <SettingRow icon="user"    label="Profile"             value={profile?.name ?? 'Not set'}           onPress={() => router.push('/(auth)/setup/profile')} />
          <SettingRow icon="phone"   label="Emergency Contacts"  value="Manage contacts"                       onPress={() => router.push('/(auth)/setup/contacts')} />
          <SettingRow icon="activity" label="Medical Info"       value="Update health info"                    onPress={() => router.push('/(auth)/setup/medical')} isLast />
        </Section>

        {/* CRASH DETECTION */}
        <Section title="CRASH DETECTION" icon="shield">
          {/* Calibration row */}
          <View style={s.calibRow}>
            <View style={[s.rowIconWrap, { backgroundColor: isValid ? C.sageTint : C.lineLight }]}>
              <Feather name="target" size={18} color={isValid ? C.sage : C.inkFaint} />
            </View>
            <View style={s.calibContent}>
              <Text style={s.rowLabel}>Personal Calibration</Text>
              <Text style={[s.calibStatus, isValid && s.calibStatusActive]}>
                {calibrationLabel}
              </Text>
              {/* Progress bar */}
              {(isValid || calibrationStatus === 'calibrating') && (
                <View style={s.progressTrack}>
                  <View
                    style={[
                      s.progressFill,
                      {
                        width: isValid ? '100%' : `${progressFraction * 100}%`,
                        backgroundColor: isValid ? C.sage : C.amber,
                      },
                    ]}
                  />
                </View>
              )}
            </View>
          </View>

          {/* Calibration action buttons */}
          {(!isValid && calibrationStatus !== 'calibrating') && (
            <TouchableOpacity
              style={s.calibStartBtn}
              onPress={() => router.push('/(auth)/setup/calibration')}
              activeOpacity={0.85}
            >
              <LinearGradient colors={[C.sage, C.teal]} style={s.calibStartGrad}>
                <Feather name="play" size={16} color="#FFFFFF" />
                <Text style={s.calibStartTxt}>Start Calibration Ride</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
          {(calibrationStatus !== 'none' && calibrationStatus !== 'reset') && (
            <TouchableOpacity
              style={s.calibResetBtn}
              onPress={handleResetCalibration}
              activeOpacity={0.8}
              disabled={isSaving}
            >
              <Feather name="rotate-ccw" size={14} color={C.inkFaint} />
              <Text style={s.calibResetTxt}>Reset Calibration</Text>
            </TouchableOpacity>
          )}
        </Section>

        {/* PERMISSIONS */}
        <Section title="PERMISSIONS" icon="lock">
          <SettingRow icon="map-pin" label="Manage Permissions" value="Location, Notifications, Mic" onPress={() => router.push('/(auth)/setup/permissions')} isLast />
        </Section>

        {/* VEHICLE */}
        <Section title="VEHICLE" icon="navigation">
          <SettingRow icon="navigation" label="Vehicle Type"    value={profile?.vehicleType    ?? 'Not set'} onPress={() => router.push('/(auth)/setup/profile')} />
          <SettingRow icon="smartphone" label="Mount Position"  value={profile?.mountPosition  ?? 'Not set'} onPress={() => router.push('/(auth)/setup/mount')} isLast />
        </Section>

        {/* PRIVACY */}
        <Section title="PRIVACY & DATA" icon="shield">
          <SettingRow icon="trash-2" label="Delete My Data" value="Permanently remove all data" onPress={() => Alert.alert('Delete Data', 'Contact support to delete all your data.')} danger isLast />
        </Section>

        {/* DEVELOPER */}
        <Section title="DEVELOPER" icon="code">
          <SettingRow icon="activity"   label="Sensor Dashboard"  value="Live sensor debug view"         onPress={() => router.push('/(dev)/sensor-dashboard')} />
          <SettingRow icon="target"     label="Baseline Viewer"   value="Per-feature baseline values"    onPress={() => router.push('/(dev)/baseline-viewer')} />
          <SettingRow icon="file-text"  label="Anomaly Log"       value="Real-time detection events"     onPress={() => router.push('/(dev)/anomaly-log')} />
          <SettingRow icon="zap"        label="Crash Simulator"   value="Inject synthetic crash window"  onPress={() => router.push('/(dev)/crash-simulator')} isLast />
        </Section>

        {/* Sign out */}
        <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut} activeOpacity={0.85}>
          <Feather name="log-out" size={18} color={C.coral} />
          <Text style={s.signOutTxt}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={s.version}>CrashGuard v1.0.0  ·  Hackathon Build</Text>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.section}>
      <View style={s.sectionTitleRow}>
        <Feather name={icon as any} size={11} color={C.sageLight} />
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      <View style={s.sectionCard}>{children}</View>
    </View>
  );
}

// ─── Setting row ──────────────────────────────────────────────────────────────

function SettingRow({
  icon,
  label,
  value,
  onPress,
  danger = false,
  isLast = false,
}: {
  icon: string;
  label: string;
  value?: string;
  onPress: () => void;
  danger?: boolean;
  isLast?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[s.settingRow, isLast && s.settingRowLast]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[s.rowIconWrap, { backgroundColor: danger ? '#FAE8E5' : C.lineLight }]}>
        <Feather name={icon as any} size={16} color={danger ? C.coral : C.inkMid} />
      </View>
      <View style={s.rowContent}>
        <Text style={[s.rowLabel, danger && s.rowLabelDanger]}>{label}</Text>
        {value && <Text style={s.rowValue} numberOfLines={1}>{value}</Text>}
      </View>
      <Feather name="chevron-right" size={18} color={C.line} />
    </TouchableOpacity>
  );
}

// ─── Background art styles ─────────────────────────────────────────────────────
const bg = StyleSheet.create({
  arcTR:    { position: 'absolute', width: 280, height: 280, borderRadius: 140, borderWidth: 1, borderColor: C.sagePale, top: -130, right: -70 },
  arcBL:    { position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 1, borderColor: C.lineLight, bottom: 100, left: -70 },
  hRule:    { position: 'absolute', left: 0, right: 0, top: 190, height: 1, backgroundColor: C.lineLight },
  slash1:   { position: 'absolute', width: 100, height: 1, backgroundColor: C.line,      top: 340, right: 10, transform: [{ rotate: '20deg' }] },
  slash1b:  { position: 'absolute', width: 100, height: 1, backgroundColor: C.lineLight, top: 355, right: 10, transform: [{ rotate: '20deg' }] },
  bracketH: { position: 'absolute', top: 16, left: 16, width: 22, height: 1, backgroundColor: C.sage, opacity: 0.3 },
  bracketV: { position: 'absolute', top: 16, left: 16, width: 1, height: 22, backgroundColor: C.sage, opacity: 0.3 },
  dot:      { position: 'absolute', width: 3, height: 3, borderRadius: 1.5, backgroundColor: C.sagePale },
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingTop: 8, paddingBottom: 48 },

  // Header
  header: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20 },
  eyebrow: { fontSize: 13, color: C.inkFaint, fontWeight: '500', letterSpacing: 0.3, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  title: { fontSize: 30, fontWeight: '900', color: C.ink, letterSpacing: -0.5, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Heavy' : 'sans-serif-black' },

  // Profile hero card
  profileCard: {
    marginHorizontal: 24,
    marginBottom: 28,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: C.sage,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 6,
  },
  profileGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 20,
  },
  profileAvatar: {
    width: 50,
    height: 50,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
    fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Bold' : 'sans-serif-medium',
  },
  profileSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 3,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },

  // Section
  section: { paddingHorizontal: 24, marginBottom: 24 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  sectionTitle: { fontSize: 10, fontWeight: '800', color: C.sageLight, letterSpacing: 2, textTransform: 'uppercase' },
  sectionCard: {
    backgroundColor: C.bgCard,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.line,
    overflow: 'hidden',
    shadowColor: '#00000008',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 1,
  },

  // Setting row
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.lineLight,
    gap: 12,
  },
  settingRowLast: { borderBottomWidth: 0 },
  rowIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 14, fontWeight: '700', color: C.ink, marginBottom: 1, letterSpacing: 0.1 },
  rowLabelDanger: { color: C.coral },
  rowValue: { fontSize: 11, color: C.inkFaint, fontWeight: '500' },

  // Calibration
  calibRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.lineLight,
  },
  calibContent: { flex: 1, gap: 4 },
  calibStatus: { fontSize: 12, color: C.inkFaint, fontWeight: '500' },
  calibStatusActive: { color: C.sage, fontWeight: '600' },
  progressTrack: { height: 4, backgroundColor: C.lineLight, borderRadius: 2, overflow: 'hidden', marginTop: 6 },
  progressFill: { height: '100%', borderRadius: 2 },
  calibStartBtn: {
    margin: 12,
    marginTop: 4,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: C.sage,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  calibStartGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  calibStartTxt: { fontSize: 14, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },
  calibResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.bg,
  },
  calibResetTxt: { fontSize: 13, fontWeight: '600', color: C.inkFaint },

  // Sign out
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: 24,
    marginBottom: 14,
    backgroundColor: '#FAE8E5',
    borderRadius: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: C.coral + '44',
  },
  signOutTxt: { fontSize: 15, fontWeight: '800', color: C.coral, letterSpacing: 0.3 },

  version: {
    textAlign: 'center',
    fontSize: 11,
    color: C.inkFaint,
    marginBottom: 24,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
});
