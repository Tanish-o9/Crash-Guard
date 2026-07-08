import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useSensorPipeline } from '@/hooks/useSensorPipeline';
import { useSensorStore } from '@/store/sensorStore';
import { useUserStore } from '@/store/userStore';
import { useCrashDetection } from '@/hooks/useCrashDetection';

export default function HomeScreen() {
  const router = useRouter();
  const { isRiding, isMonitoring, status, toggleRidingMode } = useSensorPipeline();
  const { currentSpeedKmh, latestFeatures, totalWindowsCollected, windowBuffer, lastError } =
    useSensorStore();
  const { profile } = useUserStore();
  const { detectionPhase, isDetectionEnabled, isAnomalyStage1, isStage2Classifying, isCrashConfirmed } = useCrashDetection();

  // Pulse animation for the active dot
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (isRiding) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.4, duration: 600, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRiding]);

  const statusColor = isRiding ? '#FF3B3B' : isMonitoring ? '#FF8C3B' : '#444456';
  const statusLabel = isRiding ? 'RIDING' : isMonitoring ? 'MONITORING' : 'IDLE';

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>
            {profile?.name ? `Hey, ${profile.name.split(' ')[0]} 👋` : '🏍️ CrashGuard'}
          </Text>
          <Text style={styles.subGreeting}>Stay safe on the road</Text>
        </View>
        <View style={[styles.statusBadge, { borderColor: statusColor + '44' }]}>
          <Animated.View
            style={[styles.statusDot, { backgroundColor: statusColor, transform: [{ scale: pulseAnim }] }]}
          />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      {/* Riding mode card */}
      <View style={[styles.card, isRiding && styles.cardActive]}>
        <View style={styles.cardRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Riding Mode</Text>
            <Text style={styles.cardSubtitle}>
              {isRiding
                ? '🔴 Sensors active — monitoring for crashes'
                : isMonitoring
                ? '🟡 Tracking speed — will activate at 10 km/h'
                : 'Tap to start crash monitoring'}
            </Text>
            {/* Detection phase indicator */}
            {isRiding && (
              <View style={[
                styles.detectionBadge,
                isAnomalyStage1 && styles.detectionBadgeWarn,
                isStage2Classifying && styles.detectionBadgeDanger,
                isCrashConfirmed && styles.detectionBadgeAlarm,
              ]}>
                <Text style={styles.detectionBadgeText}>
                  {isCrashConfirmed ? '🚨 CRASH CONFIRMED'
                    : isStage2Classifying ? '⚠️ Checking stillness…'
                    : isAnomalyStage1 ? '⚡ Anomaly detected (1/2)'
                    : isDetectionEnabled ? '✅ Detection active'
                    : '⏳ Calibrating…'}
                </Text>
              </View>
            )}
          </View>
          <Switch
            value={isRiding}
            onValueChange={toggleRidingMode}
            trackColor={{ false: '#2A2A36', true: '#FF3B3B' }}
            thumbColor="#FFFFFF"
            ios_backgroundColor="#2A2A36"
          />
        </View>

        {/* Speed indicator (visible when riding) */}
        {(isRiding || isMonitoring) && (
          <View style={styles.speedRow}>
            <Text style={styles.speedValue}>
              {currentSpeedKmh != null ? `${currentSpeedKmh.toFixed(0)}` : '—'}
            </Text>
            <Text style={styles.speedUnit}>km/h</Text>
            <View style={styles.speedDivider} />
            <Text style={styles.windowCount}>
              {totalWindowsCollected} windows collected
            </Text>
          </View>
        )}
      </View>

      {/* Status pills row */}
      <View style={styles.pillsRow}>
        <StatusPill
          label="GPS"
          value={currentSpeedKmh != null ? 'Locked' : 'Off'}
          active={currentSpeedKmh != null}
        />
        <StatusPill
          label="Sensors"
          value={isRiding ? 'Active' : 'Off'}
          active={isRiding}
        />
        <StatusPill
          label="Buffer"
          value={`${windowBuffer.length}`}
          active={windowBuffer.length > 0}
        />
      </View>

      {/* Feature readout (when riding) */}
      {isRiding && latestFeatures && (
        <View style={styles.featuresCard}>
          <Text style={styles.featuresTitle}>Live sensor features</Text>
          <View style={styles.featuresGrid}>
            <FeatureRow label="Peak Accel" value={`${latestFeatures.peakAccelMagnitude} m/s²`} />
            <FeatureRow label="Peak Jerk" value={`${latestFeatures.peakJerk.toFixed(1)} m/s³`} />
            <FeatureRow label="Speed Δ" value={`${latestFeatures.gpsSpeedDelta.toFixed(1)} km/h`} />
            <FeatureRow label="Gyro Spike" value={`${latestFeatures.rotationRateSpike.toFixed(2)} rad/s`} />
          </View>
        </View>
      )}

      {/* Error state */}
      {lastError && (
        <View style={styles.errorCard}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorText} numberOfLines={2}>{lastError}</Text>
        </View>
      )}

      {/* Good Samaritan button — always visible */}
      <TouchableOpacity
        style={styles.samaritanBtn}
        activeOpacity={0.85}
        onPress={() => router.push('/samaritan')}
      >
        <Text style={styles.samaritanIcon}>🆘</Text>
        <View>
          <Text style={styles.samaritanTitle}>Witnessed an Accident?</Text>
          <Text style={styles.samaritanSub}>Tap to alert emergency services</Text>
        </View>
      </TouchableOpacity>

      {/* Dev tools row */}
      <View style={styles.devRow}>
        <TouchableOpacity
          style={styles.testAlarmBtn}
          onPress={() => router.push('/alarm')}
          activeOpacity={0.8}
        >
          <Text style={styles.testAlarmText}>🔔 Test Alarm</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.devBtn}
          onPress={() => router.push('/(dev)/anomaly-log')}
          activeOpacity={0.7}
        >
          <Text style={styles.devBtnText}>📊 Anomaly Log</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.devBtn}
          onPress={() => router.push('/(dev)/sensor-dashboard')}
          activeOpacity={0.7}
        >
          <Text style={styles.devBtnText}>⚙️ Sensors</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function StatusPill({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <View style={[styles.pill, active && styles.pillActive]}>
      <View style={[styles.pillDot, active && styles.pillDotActive]} />
      <Text style={styles.pillLabel}>{label}</Text>
      <Text style={[styles.pillValue, active && styles.pillValueActive]}>{value}</Text>
    </View>
  );
}

function FeatureRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.featureRow}>
      <Text style={styles.featureLabel}>{label}</Text>
      <Text style={styles.featureValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F14', padding: 20 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  greeting: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 },
  subGreeting: { fontSize: 12, color: '#444456', marginTop: 2 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16161E',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 7,
    borderWidth: 1,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  card: {
    backgroundColor: '#16161E',
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#2A2A36',
  },
  cardActive: { borderColor: '#FF3B3B44', backgroundColor: '#1A0D0D' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 },
  cardSubtitle: { fontSize: 12, color: '#666680', lineHeight: 18, maxWidth: 220 },
  detectionBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#0D1A0D',
    borderWidth: 1,
    borderColor: '#2ECC7133',
  },
  detectionBadgeWarn: { backgroundColor: '#1A150A', borderColor: '#F39C1244' },
  detectionBadgeDanger: { backgroundColor: '#1A0D00', borderColor: '#FF8C3B55' },
  detectionBadgeAlarm: { backgroundColor: '#1A0000', borderColor: '#FF3B3B66' },
  detectionBadgeText: { fontSize: 10, fontWeight: '700', color: '#2ECC71', letterSpacing: 0.3 },
  speedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#2A2A36',
    gap: 8,
  },
  speedValue: { fontSize: 28, fontWeight: '900', color: '#FF3B3B', letterSpacing: -1 },
  speedUnit: { fontSize: 14, color: '#666680', fontWeight: '600', alignSelf: 'flex-end', marginBottom: 4 },
  speedDivider: { flex: 1 },
  windowCount: { fontSize: 11, color: '#444456', fontWeight: '600' },
  pillsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  pill: {
    flex: 1,
    backgroundColor: '#16161E',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2A2A36',
    alignItems: 'center',
    gap: 4,
  },
  pillActive: { borderColor: '#FF3B3B33' },
  pillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#444' },
  pillDotActive: { backgroundColor: '#FF3B3B' },
  pillLabel: { fontSize: 10, fontWeight: '700', color: '#444456', letterSpacing: 0.5, textTransform: 'uppercase' },
  pillValue: { fontSize: 12, fontWeight: '700', color: '#666680' },
  pillValueActive: { color: '#FF3B3B' },
  featuresCard: {
    backgroundColor: '#16161E',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2A2A36',
  },
  featuresTitle: { fontSize: 11, fontWeight: '700', color: '#444456', letterSpacing: 0.5, marginBottom: 10, textTransform: 'uppercase' },
  featuresGrid: { gap: 8 },
  featureRow: { flexDirection: 'row', justifyContent: 'space-between' },
  featureLabel: { fontSize: 12, color: '#666680' },
  featureValue: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A0A0A',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#6B1A1A',
    gap: 10,
  },
  errorIcon: { fontSize: 16 },
  errorText: { flex: 1, fontSize: 12, color: '#FF6B6B', lineHeight: 17 },
  samaritanBtn: {
    backgroundColor: '#1A0D0D',
    borderRadius: 18,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#FF3B3B33',
    flex: 1,
  },
  samaritanIcon: { fontSize: 32 },
  samaritanTitle: { fontSize: 16, fontWeight: '800', color: '#FF3B3B', marginBottom: 2 },
  samaritanSub: { fontSize: 12, color: '#666680' },
  devRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  testAlarmBtn: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FF3B3B44',
    backgroundColor: '#1A0808',
  },
  testAlarmText: { fontSize: 12, color: '#FF6B6B', fontWeight: '700' },
  devBtn: {
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E1E2A',
    borderStyle: 'dashed',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  devBtnText: { fontSize: 12, color: '#2A2A40', fontWeight: '600' },
});
