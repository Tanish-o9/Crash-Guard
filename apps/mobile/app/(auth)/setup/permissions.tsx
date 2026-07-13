import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  Linking,
  ScrollView,
  PermissionsAndroid,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';
import { SetupShell } from '@/components/SetupShell';
import { useAuthStore } from '@/store/authStore';
import { Feather } from '@expo/vector-icons';

interface PermissionItem {
  id: string;
  icon: any; // feather name
  title: string;
  description: string;
  critical: boolean;
  status: 'granted' | 'denied' | 'undetermined';
}

const C = {
  bgCard: '#FFFFFF', sage: '#4A7060', sagePale: '#C4D8CC', sageTint: '#EBF3EF',
  ink: '#1C2826', inkMid: '#445550', inkFaint: '#8A9E96',
  line: '#DDD6C8', lineLight: '#EAE4D8', coral: '#C8503C', amber: '#B87830',
  amberTint: '#FDF3E7', coralTint: '#FDECEA',
};

export default function PermissionsScreen() {
  const router = useRouter();
  const { setOnboarded } = useAuthStore();

  const [permissions, setPermissions] = useState<PermissionItem[]>([
    {
      id: 'location',
      icon: 'map-pin',
      title: 'Location (Always)',
      description:
        'Required for crash detection and sharing your GPS position with emergency services. Must be enabled "Always" so it works in background.',
      critical: true,
      status: 'undetermined',
    },
    {
      id: 'notifications',
      icon: 'bell',
      title: 'Notifications',
      description:
        'Alerts you when riding mode is active, when an alarm fires, and when emergency contacts have been notified.',
      critical: true,
      status: 'undetermined',
    },
    {
      id: 'microphone',
      icon: 'mic',
      title: 'Microphone',
      description:
        'Used to listen for voice cancel commands ("cancel", "I\'m fine") during the 10-second alarm countdown — in case your phone is out of reach.',
      critical: false,
      status: 'undetermined',
    },
    ...(Platform.OS === 'android'
      ? [
          {
            id: 'sms',
            icon: 'message-square',
            title: 'Send SMS',
            description:
              'Allows CrashGuard to automatically text your emergency contacts with your location if a crash is confirmed.',
            critical: true,
            status: 'undetermined' as const,
          },
          {
            id: 'call',
            icon: 'phone',
            title: 'Phone Calls',
            description:
              'Allows CrashGuard to automatically call your primary emergency contact after an accident.',
            critical: true,
            status: 'undetermined' as const,
          },
        ]
      : []),
  ]);

  const updateStatus = (id: string, status: PermissionItem['status']) => {
    setPermissions(prev => prev.map(p => (p.id === id ? { ...p, status } : p)));
  };

  useEffect(() => { checkAllPermissions(); }, []);

  async function checkAllPermissions() {
    try {
      const { status: loc } = await Location.getBackgroundPermissionsAsync();
      updateStatus('location', loc === 'granted' ? 'granted' : loc === 'denied' ? 'denied' : 'undetermined');

      const { status: notif } = await Notifications.getPermissionsAsync();
      updateStatus('notifications', notif === 'granted' ? 'granted' : notif === 'denied' ? 'denied' : 'undetermined');

      const { status: mic } = await Audio.getPermissionsAsync();
      updateStatus('microphone', mic === 'granted' ? 'granted' : mic === 'denied' ? 'denied' : 'undetermined');

      if (Platform.OS === 'android') {
        const sms = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.SEND_SMS);
        updateStatus('sms', sms ? 'granted' : 'undetermined');

        const call = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CALL_PHONE);
        updateStatus('call', call ? 'granted' : 'undetermined');
      }
    } catch (e) { console.warn('Failed to check permissions on mount', e); }
  }

  async function requestLocation() {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      updateStatus('location', 'denied');
      return;
    }
    const bg = await Location.requestBackgroundPermissionsAsync();
    updateStatus('location', bg.status);
  }

  async function requestNotifications() {
    const { status } = await Notifications.requestPermissionsAsync();
    updateStatus('notifications', status);
  }

  async function requestMicrophone() {
    const { status } = await Audio.requestPermissionsAsync();
    updateStatus('microphone', status);
  }

  async function requestAndroid(id: 'sms' | 'call', perm: any) {
    if (Platform.OS !== 'android') return;
    try {
      const granted = await PermissionsAndroid.request(perm);
      updateStatus(id, granted === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied');
    } catch (e) { console.warn(e); }
  }

  async function requestPermission(item: PermissionItem) {
    if (item.status === 'denied') {
      Alert.alert(
        'Permission Denied',
        `You previously denied ${item.title}. Please enable it in Settings.`,
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }]
      );
      return;
    }
    switch (item.id) {
      case 'location': await requestLocation(); break;
      case 'notifications': await requestNotifications(); break;
      case 'microphone': await requestMicrophone(); break;
      case 'sms': await requestAndroid('sms', PermissionsAndroid.PERMISSIONS.SEND_SMS); break;
      case 'call': await requestAndroid('call', PermissionsAndroid.PERMISSIONS.CALL_PHONE); break;
    }
  }

  async function requestAllPending() {
    for (const p of permissions) {
      if (p.status === 'undetermined') await requestPermission(p);
    }
  }

  function handleNext() {
    const missingCritical = permissions.filter(p => p.critical && p.status !== 'granted');
    if (missingCritical.length > 0 && Platform.OS === 'android') {
      Alert.alert('Required Permissions Missing', 'Please grant all critical permissions before continuing.');
      return;
    }
    router.push('/(auth)/setup/calibration');
  }

  return (
    <SetupShell
      step={5}
      totalSteps={5}
      title={"System\npermissions"}
      subtitle="CrashGuard needs access to your device sensors to function autonomously during a crash."
      onBack={() => router.back()}
      onNext={handleNext}
      nextLabel="Finish Setup →"
    >
      <TouchableOpacity style={s.grantAllBtn} onPress={requestAllPending} activeOpacity={0.7}>
        <Feather name="check-square" size={16} color={C.sage} />
        <Text style={s.grantAllText}>Grant all pending</Text>
      </TouchableOpacity>

      <View style={s.list}>
        {permissions.map(p => {
          const isGranted = p.status === 'granted';
          return (
            <TouchableOpacity
              key={p.id}
              style={[s.permCard, isGranted && s.permCardGranted]}
              onPress={() => requestPermission(p)}
              disabled={isGranted}
              activeOpacity={0.7}
            >
              <View style={s.permTop}>
                <View style={[s.permIconWrap, isGranted && s.permIconWrapGranted]}>
                  <Feather name={p.icon} size={20} color={isGranted ? C.sage : C.inkMid} />
                </View>
                <View style={s.permMeta}>
                  <View style={s.permTitleRow}>
                    <Text style={[s.permTitle, isGranted && s.permTitleGranted]}>{p.title}</Text>
                    {p.critical && (
                      <View style={s.critBadge}>
                        <Text style={s.critBadgeText}>CRITICAL</Text>
                      </View>
                    )}
                  </View>
                  <View style={[s.statusBadge, s[`status_${p.status}`]]}>
                    {p.status === 'granted' && <Feather name="check-circle" size={12} color={C.sage} style={{ marginRight: 4 }} />}
                    <Text style={[s.statusText, s[`statusText_${p.status}`]]}>
                      {p.status === 'granted' ? 'GRANTED' : p.status === 'denied' ? 'DENIED' : 'PENDING'}
                    </Text>
                  </View>
                </View>
              </View>
              <Text style={s.permDesc}>{p.description}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SetupShell>
  );
}

const s = StyleSheet.create({
  grantAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: C.sageTint, borderRadius: 14, borderWidth: 1.5, borderColor: C.sagePale,
    padding: 14, marginBottom: 16,
  },
  grantAllText: { fontSize: 15, fontWeight: '700', color: C.sage },
  list: { gap: 12, marginBottom: 8 },
  permCard: {
    backgroundColor: C.bgCard, borderRadius: 18, borderWidth: 1.5, borderColor: C.line,
    padding: 16, gap: 12,
    shadowColor: '#00000008', shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 1,
  },
  permCardGranted: { borderColor: C.sage, backgroundColor: C.sageTint },
  permTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  permIconWrap: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: C.lineLight, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  permIconWrapGranted: { backgroundColor: C.bgCard, borderColor: C.sagePale, borderWidth: 1 },
  permMeta: { flex: 1, gap: 6, paddingTop: 2 },
  permTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  permTitle: { fontSize: 15, fontWeight: '800', color: C.ink },
  permTitleGranted: { color: C.sage },
  critBadge: {
    backgroundColor: C.amberTint, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  critBadgeText: { fontSize: 9, fontWeight: '800', color: C.amber, letterSpacing: 0.5 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1,
  },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  // Status states
  status_undetermined: { backgroundColor: C.lineLight, borderColor: C.line },
  statusText_undetermined: { color: C.inkFaint },
  status_granted: { backgroundColor: C.bgCard, borderColor: C.sagePale, paddingVertical: 2 },
  statusText_granted: { color: C.sage },
  status_denied: { backgroundColor: C.coralTint, borderColor: C.coral + '44' },
  statusText_denied: { color: C.coral },
  permDesc: { fontSize: 13, color: C.inkFaint, lineHeight: 19, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
});
