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

interface PermissionItem {
  id: string;
  icon: string;
  title: string;
  description: string;
  critical: boolean;
  status: 'granted' | 'denied' | 'undetermined';
}

export default function PermissionsScreen() {
  const router = useRouter();
  const { setOnboarded } = useAuthStore();

  const [permissions, setPermissions] = useState<PermissionItem[]>([
    {
      id: 'location',
      icon: '📍',
      title: 'Location (Always)',
      description:
        'Required for crash detection and sharing your GPS position with emergency services. Must be enabled "Always" so it works in background.',
      critical: true,
      status: 'undetermined',
    },
    {
      id: 'notifications',
      icon: '🔔',
      title: 'Notifications',
      description:
        'Alerts you when riding mode is active, when an alarm fires, and when emergency contacts have been notified.',
      critical: true,
      status: 'undetermined',
    },
    {
      id: 'microphone',
      icon: '🎙️',
      title: 'Microphone',
      description:
        'Used to listen for voice cancel commands ("cancel", "I\'m fine") during the 10-second alarm countdown — in case your phone is out of reach.',
      critical: false,
      status: 'undetermined',
    },
    {
      id: 'sms',
      icon: '✉️',
      title: 'Send SMS',
      description:
        'Allows CrashGuard to automatically send an emergency SMS with your GPS location to your emergency contacts — without any user interaction.',
      critical: true,
      status: 'undetermined',
    },
    {
      id: 'phone',
      icon: '📞',
      title: 'Phone Calls',
      description:
        'Allows CrashGuard to automatically call your emergency contacts when a crash is detected — without needing to tap anything.',
      critical: true,
      status: 'undetermined',
    },
  ]);

  // Check current permission statuses on mount
  useEffect(() => {
    checkStatuses();
  }, []);

  async function checkStatuses() {
    const [locStatus, notifStatus, audioStatus] = await Promise.all([
      Location.getForegroundPermissionsAsync(),
      Notifications.getPermissionsAsync(),
      Audio.getPermissionsAsync(),
    ]);

    // Check Android-specific dangerous permissions
    let smsGranted = false;
    let phoneGranted = false;
    if (Platform.OS === 'android') {
      smsGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.SEND_SMS);
      phoneGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CALL_PHONE);
    }

    setPermissions(prev =>
      prev.map(p => {
        if (p.id === 'location')
          return { ...p, status: locStatus.granted ? 'granted' : locStatus.canAskAgain ? 'undetermined' : 'denied' };
        if (p.id === 'notifications')
          return { ...p, status: notifStatus.granted ? 'granted' : notifStatus.canAskAgain ? 'undetermined' : 'denied' };
        if (p.id === 'microphone')
          return { ...p, status: audioStatus.granted ? 'granted' : audioStatus.canAskAgain ? 'undetermined' : 'denied' };
        if (p.id === 'sms')
          return { ...p, status: smsGranted ? 'granted' : 'undetermined' };
        if (p.id === 'phone')
          return { ...p, status: phoneGranted ? 'granted' : 'undetermined' };
        return p;
      })
    );
  }

  async function requestPermission(id: string) {
    let granted = false;

    if (id === 'location') {
      // First request foreground, then background
      const fg = await Location.requestForegroundPermissionsAsync();
      if (fg.granted) {
        try {
          const bg = await Location.requestBackgroundPermissionsAsync();
          granted = bg.granted;
        } catch (e) {
          // Expo Go throws an error for background location requests.
          // Fallback to accepting foreground permission as sufficient.
          granted = fg.granted;
        }
      } else {
        granted = false;
      }
    } else if (id === 'notifications') {
      const res = await Notifications.requestPermissionsAsync();
      granted = res.granted;
    } else if (id === 'microphone') {
      const res = await Audio.requestPermissionsAsync();
      granted = res.granted;
    } else if (id === 'sms' && Platform.OS === 'android') {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.SEND_SMS,
        {
          title: 'SMS Permission',
          message: 'CrashGuard needs to send emergency SMS with your location to your emergency contacts when a crash is detected.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        }
      );
      granted = result === PermissionsAndroid.RESULTS.GRANTED;
    } else if (id === 'phone' && Platform.OS === 'android') {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CALL_PHONE,
        {
          title: 'Phone Call Permission',
          message: 'CrashGuard needs to automatically call your emergency contacts when a crash is detected.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        }
      );
      granted = result === PermissionsAndroid.RESULTS.GRANTED;
    }

    setPermissions(prev =>
      prev.map(p => (p.id === id ? { ...p, status: granted ? 'granted' : 'denied' } : p))
    );

    if (!granted) {
      Alert.alert(
        'Permission Required',
        `Please enable ${id === 'location' ? 'Location' : id === 'notifications' ? 'Notifications' : 'Microphone'} permission in your phone settings for CrashGuard to work correctly.`,
        [
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  }

  async function handleGrantAll() {
    for (const perm of permissions) {
      if (perm.status !== 'granted') {
        await requestPermission(perm.id);
      }
    }
  }

  const criticalGranted = permissions
    .filter(p => p.critical)
    .every(p => p.status === 'granted');

  function handleFinish() {
    if (!criticalGranted) {
      Alert.alert(
        'Critical permissions missing',
        'Location and Notifications are required for crash detection to work. Please grant them.',
        [
          { text: 'Grant Now', onPress: handleGrantAll },
          { text: 'Skip anyway', style: 'destructive', onPress: completeOnboarding },
        ]
      );
    } else {
      completeOnboarding();
    }
  }

  function completeOnboarding() {
    setOnboarded(true);
    // Root layout's Redirect will take care of navigation to (tabs)
  }

  return (
    <SetupShell
      step={5}
      totalSteps={5}
      title={"Allow\npermissions"}
      subtitle="CrashGuard needs these permissions to monitor for crashes and respond in emergencies. We never collect data beyond what's needed."
      onBack={() => router.back()}
      onNext={handleFinish}
      nextLabel={criticalGranted ? 'Finish Setup ✓' : 'Continue →'}
    >
      {/* Grant all */}
      <TouchableOpacity style={styles.grantAllBtn} onPress={handleGrantAll} activeOpacity={0.8}>
        <Text style={styles.grantAllText}>✓ Allow all permissions</Text>
      </TouchableOpacity>

      {/* Permission list */}
      <View style={styles.list}>
        {permissions.map(perm => (
          <View key={perm.id} style={[styles.permCard, perm.status === 'granted' && styles.permCardGranted]}>
            {/* Icon + title */}
            <View style={styles.permTop}>
              <View style={styles.permIconWrap}>
                <Text style={styles.permIcon}>{perm.icon}</Text>
              </View>
              <View style={styles.permMeta}>
                <View style={styles.permTitleRow}>
                  <Text style={styles.permTitle}>{perm.title}</Text>
                  {perm.critical && (
                    <View style={styles.critBadge}>
                      <Text style={styles.critBadgeText}>Required</Text>
                    </View>
                  )}
                </View>
                {/* Status badge */}
                <View style={[styles.statusBadge, STATUS_STYLES[perm.status]]}>
                  <Text style={styles.statusText}>
                    {perm.status === 'granted'
                      ? '✓ Granted'
                      : perm.status === 'denied'
                      ? '✗ Denied'
                      : 'Not set'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Description */}
            <Text style={styles.permDesc}>{perm.description}</Text>

            {/* Grant button */}
            {perm.status !== 'granted' && (
              <TouchableOpacity
                style={styles.grantBtn}
                onPress={() => requestPermission(perm.id)}
                activeOpacity={0.8}
              >
                <Text style={styles.grantBtnText}>
                  {perm.status === 'denied' ? 'Open Settings →' : 'Allow →'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>
    </SetupShell>
  );
}

const STATUS_STYLES: Record<string, object> = {
  granted: { backgroundColor: '#0D2A1A', borderColor: '#2A6B3A' },
  denied: { backgroundColor: '#2A0D0D', borderColor: '#6B2A2A' },
  undetermined: { backgroundColor: '#1E1E2A', borderColor: '#2A2A36' },
};

const styles = StyleSheet.create({
  grantAllBtn: {
    backgroundColor: '#16161E',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#2A2A36',
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  grantAllText: { fontSize: 15, fontWeight: '700', color: '#888899' },
  list: { gap: 12, marginBottom: 8 },
  permCard: {
    backgroundColor: '#16161E',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#2A2A36',
    padding: 16,
    gap: 10,
  },
  permCardGranted: { borderColor: '#2A6B3A22' },
  permTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  permIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#1E1E2A',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  permIcon: { fontSize: 24 },
  permMeta: { flex: 1, gap: 6 },
  permTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  permTitle: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  critBadge: {
    backgroundColor: '#2A1A0A',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#FF8C3B44',
  },
  critBadgeText: { fontSize: 10, fontWeight: '700', color: '#FF8C3B' },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  statusText: { fontSize: 11, fontWeight: '700', color: '#888899' },
  permDesc: { fontSize: 13, color: '#555566', lineHeight: 19 },
  grantBtn: {
    backgroundColor: '#1E1E2A',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3A3A4A',
  },
  grantBtnText: { fontSize: 13, fontWeight: '700', color: '#FF3B3B' },
});
