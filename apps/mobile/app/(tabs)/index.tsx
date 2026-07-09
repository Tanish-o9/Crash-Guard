import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSensorPipeline } from '@/hooks/useSensorPipeline';
import { useSensorStore } from '@/store/sensorStore';
import { useUserStore } from '@/store/userStore';
import { useCrashDetection } from '@/hooks/useCrashDetection';

// Premium Color Palette
const COLORS = {
  background: '#050505',
  card: '#111111',
  cardBorder: '#222222',
  neonCyan: '#00E5FF',
  neonRed: '#FF2A4D',
  neonOrange: '#FF9100',
  textPrimary: '#FFFFFF',
  textSecondary: '#888888',
};

export default function HomeScreen() {
  const router = useRouter();
  const { isRiding, isMonitoring, status, toggleRidingMode } = useSensorPipeline();
  const { currentSpeedKmh, latestFeatures, totalWindowsCollected, windowBuffer, lastError } =
    useSensorStore();
  const { profile } = useUserStore();
  const { detectionPhase, isDetectionEnabled, isAnomalyStage1, isStage2Classifying, isCrashConfirmed } = useCrashDetection();

  // Premium glow animation for active state
  const pulseAnim = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    if (isRiding || isMonitoring) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: false, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(pulseAnim, { toValue: 0, duration: 1500, useNativeDriver: false, easing: Easing.inOut(Easing.ease) }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(0);
    }
  }, [isRiding, isMonitoring]);

  const activeColor = isCrashConfirmed ? COLORS.neonRed : isRiding ? COLORS.neonCyan : isMonitoring ? COLORS.neonOrange : COLORS.cardBorder;
  const glowShadow = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [5, 20],
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Subtle Background Gradient */}
      <LinearGradient
        colors={['#0A0F14', '#050505']}
        style={StyleSheet.absoluteFill}
      />
      
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Sleek Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>
              {profile?.name ? profile.name.split(' ')[0].toUpperCase() : 'RIDER'}
            </Text>
            <Text style={styles.subGreeting}>SYSTEM ONLINE</Text>
          </View>
          
          <View style={styles.statusIndicator}>
            <View style={[styles.statusDot, { backgroundColor: isRiding ? COLORS.neonCyan : COLORS.textSecondary }]} />
            <Text style={styles.statusText}>{isRiding ? 'ENGAGED' : 'STANDBY'}</Text>
          </View>
        </View>

        {/* Central Ride Mode Dashboard (Massive Interactive Button) */}
        <Animated.View style={[
          styles.mainCardContainer, 
          { 
            shadowColor: activeColor, 
            shadowOpacity: isRiding || isMonitoring ? 0.6 : 0,
            shadowRadius: glowShadow,
            elevation: isRiding || isMonitoring ? 10 : 0
          }
        ]}>
          <TouchableOpacity 
            activeOpacity={0.9} 
            onPress={toggleRidingMode}
            style={[styles.mainCard, { borderColor: activeColor }]}
          >
            <LinearGradient
              colors={isCrashConfirmed ? ['#330A0A', '#111111'] : isRiding ? ['#0A2A2A', '#111111'] : ['#111111', '#111111']}
              style={styles.mainCardGradient}
            >
              <View style={styles.mainCardHeader}>
                <Text style={styles.mainCardTitle}>{isRiding ? 'RIDE MODE ACTIVE' : 'RIDE MODE OFF'}</Text>
                {isRiding && (
                  <View style={[styles.pillBadge, { backgroundColor: activeColor + '33', borderColor: activeColor }]}>
                    <Text style={[styles.pillText, { color: activeColor }]}>
                      {isCrashConfirmed ? 'CRASH DETECTED' : isStage2Classifying ? 'ANALYZING...' : 'MONITORING'}
                    </Text>
                  </View>
                )}
              </View>

              <Text style={styles.mainCardSub}>
                {isCrashConfirmed ? 'Initiating emergency sequence.' : isRiding ? 'Sensors locked. Crash detection is running.' : 'Tap anywhere here to engage system.'}
              </Text>

              {/* Digital Speedometer */}
              <View style={styles.speedometerContainer}>
                <Text style={[styles.speedValue, { color: isRiding ? COLORS.textPrimary : COLORS.textSecondary }]}>
                  {currentSpeedKmh != null ? currentSpeedKmh.toFixed(0) : '00'}
                </Text>
                <Text style={styles.speedUnit}>KM/H</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* Bento Grid layout for stats */}
        <View style={styles.bentoGrid}>
          
          <View style={[styles.bentoBox, styles.bentoSmall]}>
            <Text style={styles.bentoLabel}>SENSORS</Text>
            <Text style={[styles.bentoValue, { color: isRiding ? COLORS.neonCyan : COLORS.textSecondary }]}>
              {isRiding ? 'ONLINE' : 'OFFLINE'}
            </Text>
          </View>

          <View style={[styles.bentoBox, styles.bentoSmall]}>
            <Text style={styles.bentoLabel}>GPS LOCK</Text>
            <Text style={[styles.bentoValue, { color: currentSpeedKmh != null ? COLORS.neonCyan : COLORS.textSecondary }]}>
              {currentSpeedKmh != null ? 'SECURE' : 'SEARCHING'}
            </Text>
          </View>

          <View style={[styles.bentoBox, styles.bentoWide]}>
            <Text style={styles.bentoLabel}>LIVE TELEMETRY</Text>
            <View style={styles.telemetryRow}>
              <View>
                <Text style={styles.telemetrySub}>G-FORCE</Text>
                <Text style={styles.telemetryData}>{latestFeatures ? `${latestFeatures.peakAccelMagnitude}G` : '--'}</Text>
              </View>
              <View>
                <Text style={styles.telemetrySub}>GYRO (RAD/S)</Text>
                <Text style={styles.telemetryData}>{latestFeatures ? latestFeatures.rotationRateSpike.toFixed(2) : '--'}</Text>
              </View>
              <View>
                <Text style={styles.telemetrySub}>BUFFER</Text>
                <Text style={styles.telemetryData}>{windowBuffer.length}/40</Text>
              </View>
            </View>
          </View>

        </View>

        {/* Action Row */}
        <TouchableOpacity
          style={styles.samaritanBtn}
          activeOpacity={0.8}
          onPress={() => router.push('/samaritan')}
        >
          <LinearGradient
            colors={['#FF2A4D22', '#111111']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.samaritanGradient}
          >
            <View>
              <Text style={styles.samaritanTitle}>EMERGENCY OVERRIDE</Text>
              <Text style={styles.samaritanSub}>Report a witnessed crash</Text>
            </View>
            <Text style={styles.samaritanArrow}>→</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Dev Tools - Hidden behind a clean design */}
        <View style={styles.devContainer}>
          <Text style={styles.devTitle}>SYSTEM DIAGNOSTICS</Text>
          <View style={styles.devRow}>
            <TouchableOpacity style={styles.devBtn} onPress={() => router.push('/alarm')}>
              <Text style={styles.devBtnText}>TEST ALARM</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.devBtn} onPress={() => router.push('/(dev)/anomaly-log')}>
              <Text style={styles.devBtnText}>LOGS</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.devBtn} onPress={() => router.push('/(dev)/sensor-dashboard')}>
              <Text style={styles.devBtnText}>SENSORS</Text>
            </TouchableOpacity>
          </View>
        </View>
        
        {lastError && (
          <Text style={styles.errorText}>SYS_ERR: {lastError}</Text>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
    marginTop: 10,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  subGreeting: {
    fontSize: 10,
    color: COLORS.neonCyan,
    letterSpacing: 3,
    fontWeight: '700',
    marginTop: 4,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: 1,
  },
  mainCardContainer: {
    marginBottom: 20,
    borderRadius: 24,
  },
  mainCard: {
    borderRadius: 24,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  mainCardGradient: {
    padding: 24,
    minHeight: 220,
    justifyContent: 'space-between',
  },
  mainCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  mainCardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: 1,
  },
  mainCardSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 6,
    fontWeight: '500',
  },
  pillBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  speedometerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  speedValue: {
    fontSize: 84,
    fontWeight: '900',
    letterSpacing: -4,
    lineHeight: 90,
  },
  speedUnit: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '800',
    letterSpacing: 4,
  },
  bentoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  bentoBox: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  bentoSmall: {
    flex: 1,
    minWidth: '45%',
  },
  bentoWide: {
    width: '100%',
  },
  bentoLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 12,
  },
  bentoValue: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  telemetryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  telemetrySub: {
    fontSize: 9,
    color: COLORS.textSecondary,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  telemetryData: {
    fontSize: 16,
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  samaritanBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#FF2A4D44',
    marginBottom: 30,
  },
  samaritanGradient: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
  },
  samaritanTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.neonRed,
    letterSpacing: 1,
  },
  samaritanSub: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  samaritanArrow: {
    fontSize: 24,
    color: COLORS.neonRed,
  },
  devContainer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
    paddingTop: 20,
  },
  devTitle: {
    fontSize: 9,
    color: COLORS.textSecondary,
    fontWeight: '800',
    letterSpacing: 3,
    marginBottom: 12,
    textAlign: 'center',
  },
  devRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  devBtn: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  devBtnText: {
    fontSize: 10,
    color: '#666',
    fontWeight: '700',
    letterSpacing: 1,
  },
  errorText: {
    color: COLORS.neonRed,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 20,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  }
});
