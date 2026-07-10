import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Linking,
  ScrollView,
  Image,
} from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { useSamaritanStore } from '@/store/samaritanStore';
import { analyzeIncidentDescription } from '@/services/geminiService';
import { agentService } from '@/services/agentService';
import { emergencyService } from '@/services/emergencyService';
import { DEMO_VERIFIED_NUMBER, USE_REAL_DESTINATION_NUMBERS } from '@crashguard/constants';

// Quick-select incident types. Tapping an image fills the description with a canned
// phrase so the AI (intake + hospital pre-alert) speaks the right kind of accident —
// no typing needed in an emergency.
const INCIDENT_OPTIONS = [
  {
    key: 'bikes',
    label: 'Two bikes collided',
    src: require('../assets/bikes_collision.png'),
    description: 'Two bikes have collided with each other and riders are injured.',
  },
  {
    key: 'bike_car',
    label: 'Bike hit a car',
    src: require('../assets/bike_car_collision.png'),
    description: 'A bike has collided with a car and people are injured.',
  },
  {
    key: 'car',
    label: 'Car accident',
    src: require('../assets/car_accident_disaster.webp'),
    description: 'A car has met with a serious accident and occupants are injured.',
  },
  {
    key: 'mountain',
    label: 'Car fell off road',
    src: require('../assets/car_felloff_mountain.webp'),
    description: 'A car has fallen off a mountain road and occupants are injured.',
  },
];

export default function SamaritanScreen() {
  const router = useRouter();
  const {
    step,
    description,
    canTransport,
    lat,
    lng,
    nlpResult,
    hospitals,
    isLoading,
    goTo,
    next,
    setDescription,
    setCanTransport,
    setLocation,
    setNlpResult,
    setHospitals,
    setLoading,
    reset,
  } = useSamaritanStore();

  // Small UI note shown after a hospital pre-alert (real vs demo number).
  const [dispatchInfo, setDispatchInfo] = useState<string | null>(null);
  // Guards the auto-dispatch so the nearest hospital is only dispatched once.
  const hasDispatched = useRef(false);

  // Reset store on mount
  useEffect(() => {
    reset();
    hasDispatched.current = false;
  }, []);

  // ─── Step Handlers ─────────────────────────────────────────────────────────

  const handleStart = () => next(); // -> describe

  const handleDescribeSubmit = () => next(); // -> locating

  // Quick-select: fill the description from the tapped incident image and continue.
  const handlePickIncident = (desc: string) => {
    setDescription(desc);
    next(); // -> locating (same flow as the typed description)
  };

  // Locating effect
  useEffect(() => {
    if (step === 'locating') {
      (async () => {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') throw new Error('Permission denied');
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setLocation(loc.coords.latitude, loc.coords.longitude, 'Unknown Address');
          next(); // -> analyzing
        } catch (err) {
          setLocation(0, 0, 'Location unknown');
          next();
        }
      })();
    }
  }, [step]);

  // Analyzing effect (Bedrock agent, with Gemini/mock fallback). After analysis we
  // log the samaritan report and go STRAIGHT to hospitals (if the samaritan can
  // transport) or finish. There is NO mock "confirm" screen, and NO emergency call
  // is placed from the samaritan's own phone — dialing emergency from the SIM is the
  // personal auto-crash workflow, not the samaritan workflow.
  useEffect(() => {
    if (step === 'analyzing') {
      (async () => {
        const result =
          (await agentService.analyzeIncident(description)) ??
          (await analyzeIncidentDescription(description));
        setNlpResult(result);

        if (lat && lng) {
          const id = await emergencyService.submitSamaritanReport({
            lat,
            lng,
            nlpIntake: description,
            severityEstimate: result?.severity,
            canTransport,
            hospitalChosen: undefined,
          });
          if (id) console.log('Samaritan report logged:', id);
        }

        goTo(canTransport ? 'hospital' : 'done');
      })();
    }
  }, [step]);

  const handleDone = () => {
    Speech.stop();
    router.back();
  };

  // Route to a hospital AND pre-alert it: open navigation, look up the hospital's
  // phone via Place Details, call it, and speak the AI pre-alert over the acoustic
  // bridge so the receiving hospital can prepare for the inbound patient(s).
  const dispatchHospital = async (h: {
    placeId: string;
    name: string;
    lat: number;
    lng: number;
    distanceKm: number;
    phoneNumber?: string;
  }) => {
    // 1. Open the map immediately, navigating the samaritan to the hospital
    //    (runs in parallel with the pre-alert call below).
    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`,
    ).catch(() => {});

    // 2. Resolve the hospital's REAL phone (from the nearby result, else a lookup).
    let realPhone = h.phoneNumber ?? null;
    if (!realPhone) realPhone = (await agentService.getHospitalDetails(h.placeId))?.phone ?? null;

    // 3. Decide which number to actually dial. On the Twilio trial we can only call
    //    verified numbers, so route the demo call to DEMO_VERIFIED_NUMBER while still
    //    surfacing the real hospital number in the UI.
    const dialTo = USE_REAL_DESTINATION_NUMBERS ? realPhone : DEMO_VERIFIED_NUMBER;
    const etaMinutes = Math.max(1, Math.round(h.distanceKm * 3));

    setDispatchInfo(
      USE_REAL_DESTINATION_NUMBERS
        ? `Pre-alerting ${h.name}${realPhone ? ` at ${realPhone}` : ''}…`
        : `Pre-alerting ${h.name}. Real number: ${realPhone ?? 'not listed'} — demo call placed to ${DEMO_VERIFIED_NUMBER}.`,
    );

    // 4. Place the AI pre-alert call via Twilio (cloud) — the phone can't carry AI
    //    voice on a cellular call, so this comes from the backend.
    if (dialTo) {
      const r = await agentService.callHospital({
        to: dialTo,
        hospitalName: h.name,
        victims: nlpResult?.estimatedVictims ?? 1,
        severity: nlpResult?.severity ?? null,
        etaMinutes,
        summary: nlpResult?.summary ?? undefined,
        lat, // incident location — spoken to the hospital so they know where it happened
        lng,
      });
      console.log(`[Hospital pre-alert] ${h.name} → ${dialTo}: ${r?.status ?? 'unreachable'}${r?.error ? ' — ' + r.error : ''}`);
    } else {
      console.log(`[Hospital pre-alert] no number to dial for ${h.name}`);
    }
  };

  // Hospital fetch + AUTO-dispatch: on reaching the hospital step, fetch the nearest
  // hospitals and immediately route to + pre-alert the closest one. No manual list
  // selection — in an emergency the samaritan has no time to choose.
  useEffect(() => {
    if (step === 'hospital' && canTransport && lat && lng && !hasDispatched.current) {
      hasDispatched.current = true;
      (async () => {
        setLoading(true);
        const fetched =
          (await agentService.getNearbyHospitals(lat, lng)) ??
          (await emergencyService.getNearbyHospitals(lat, lng));
        setHospitals(fetched);
        setLoading(false);
        if (fetched.length > 0) {
          void dispatchHospital(fetched[0]); // nearest (backend sorts by distance)
        }
      })();
    }
  }, [step]);

  // ─── Renderers ──────────────────────────────────────────────────────────────

  const renderLanding = () => (
    <View style={styles.content}>
      <Text style={styles.emoji}>🆘</Text>
      <Text style={styles.title}>Witnessed an Accident?</Text>
      <Text style={styles.subtitle}>
        Tap below to quickly alert emergency services and notify the rider's family.
      </Text>
      <TouchableOpacity style={styles.primaryBtn} onPress={handleStart}>
        <Text style={styles.primaryBtnText}>Report Accident Now</Text>
      </TouchableOpacity>
    </View>
  );

  const renderDescribe = () => (
    <View style={styles.content}>
      <Text style={styles.title}>What do you see?</Text>
      <Text style={styles.subtitle}>Tap what happened, or describe it below.</Text>

      <View style={styles.incidentGrid}>
        {INCIDENT_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={styles.incidentCard}
            activeOpacity={0.8}
            onPress={() => handlePickIncident(opt.description)}
          >
            <Image source={opt.src} style={styles.incidentImg} resizeMode="cover" />
            <Text style={styles.incidentLabel} numberOfLines={1}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.orDivider}>or describe it</Text>

      <TextInput
        style={styles.input}
        placeholder="e.g., Two bikes collided, one person injured..."
        placeholderTextColor="#666680"
        value={description}
        onChangeText={setDescription}
        multiline
        autoFocus
      />
      
      <TouchableOpacity
        style={styles.checkboxRow}
        onPress={() => setCanTransport(!canTransport)}
        activeOpacity={0.8}
      >
        <View style={[styles.checkbox, canTransport && styles.checkboxActive]}>
          {canTransport && <Text style={styles.checkIcon}>✓</Text>}
        </View>
        <Text style={styles.checkboxLabel}>I can transport the injured to a hospital</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.primaryBtn} onPress={handleDescribeSubmit}>
        <Text style={styles.primaryBtnText}>Next →</Text>
      </TouchableOpacity>
    </View>
  );

  const renderLocating = () => (
    <View style={styles.contentCentered}>
      <ActivityIndicator size="large" color="#FF3B3B" />
      <Text style={styles.loadingText}>Acquiring GPS location...</Text>
    </View>
  );

  const renderAnalyzing = () => (
    <View style={styles.contentCentered}>
      <ActivityIndicator size="large" color="#4285F4" />
      <Text style={styles.loadingText}>AI analyzing description...</Text>
    </View>
  );

  const renderHospital = () => {
    const nearest = hospitals[0];
    return (
      <View style={styles.content}>
        <Text style={styles.title}>Nearest Hospital</Text>
        <Text style={styles.subtitle}>
          Routing you to the nearest hospital and pre-alerting them automatically.
        </Text>

        {isLoading ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <ActivityIndicator size="small" color="#FF3B3B" />
            <Text style={styles.loadingText}>Finding the nearest hospital…</Text>
          </View>
        ) : !nearest ? (
          <Text style={{ color: '#666680', textAlign: 'center', marginTop: 20 }}>
            No hospitals found nearby.
          </Text>
        ) : (
          <>
            <View style={styles.hospitalCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.hospitalName} numberOfLines={1}>{nearest.name}</Text>
                <Text style={styles.hospitalDist}>
                  {nearest.distanceKm.toFixed(1)} km away{nearest.phoneNumber ? ` • ${nearest.phoneNumber}` : ' • no number listed'}
                </Text>
                <Text style={{ fontSize: 11, color: '#555566', marginTop: 4 }} numberOfLines={2}>{nearest.address}</Text>
              </View>
            </View>

            {dispatchInfo && (
              <View style={styles.dispatchNote}>
                <Text style={styles.dispatchNoteText}>{dispatchInfo}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.secondaryBtn, { marginTop: 4 }]}
              onPress={() =>
                Linking.openURL(
                  `https://www.google.com/maps/dir/?api=1&destination=${nearest.lat},${nearest.lng}`,
                ).catch(() => {})
              }
            >
              <Text style={styles.secondaryBtnText}>Reopen directions</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity style={[styles.primaryBtn, { marginTop: 16 }]} onPress={handleDone}>
          <Text style={styles.primaryBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderDone = () => (
    <View style={styles.contentCentered}>
      <Text style={styles.emoji}>✅</Text>
      <Text style={styles.title}>Help is on the way</Text>
      <Text style={styles.subtitle}>Emergency contacts have been notified via SMS.</Text>
      <TouchableOpacity style={styles.primaryBtn} onPress={handleDone}>
        <Text style={styles.primaryBtnText}>Done</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {step === 'landing' && renderLanding()}
        {step === 'describe' && renderDescribe()}
        {step === 'locating' && renderLocating()}
        {step === 'analyzing' && renderAnalyzing()}
        {step === 'hospital' && renderHospital()}
        {step === 'done' && renderDone()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F14' },
  scroll: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  content: { flex: 1, justifyContent: 'center' },
  contentCentered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emoji: { fontSize: 64, marginBottom: 20, textAlign: 'center' },
  title: { fontSize: 28, fontWeight: '900', color: '#FFFFFF', marginBottom: 12, textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#666680', textAlign: 'center', marginBottom: 32, lineHeight: 20 },
  primaryBtn: {
    backgroundColor: '#FF3B3B',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#FF3B3B',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  secondaryBtn: {
    marginTop: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '600', color: '#666680' },
  input: {
    backgroundColor: '#16161E',
    borderRadius: 16,
    padding: 16,
    color: '#FFFFFF',
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#2A2A36',
    marginBottom: 20,
  },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 32, gap: 12 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#444456',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: '#FF3B3B', borderColor: '#FF3B3B' },
  checkIcon: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  checkboxLabel: { fontSize: 14, color: '#FFFFFF' },
  loadingText: { color: '#666680', marginTop: 16, fontSize: 14, fontWeight: '600' },
  summaryCard: {
    backgroundColor: '#16161E',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2A2A36',
    marginBottom: 32,
  },
  summaryLabel: { fontSize: 12, color: '#666680', fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  summaryValue: { fontSize: 16, color: '#FFFFFF', fontWeight: '500' },
  hospitalCard: {
    backgroundColor: '#16161E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A36',
  },
  hospitalName: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 },
  hospitalDist: { fontSize: 14, color: '#666680', marginBottom: 16 },
  navBtn: { backgroundColor: '#4285F4', borderRadius: 10, padding: 12, alignItems: 'center' },
  navBtnText: { color: '#FFF', fontWeight: '700' },
  dispatchNote: {
    backgroundColor: '#1A2A16',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2E4A26',
    padding: 12,
    marginBottom: 12,
  },
  dispatchNoteText: { fontSize: 12, color: '#9CCB8C', lineHeight: 17 },
  incidentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  incidentCard: {
    width: '48%',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A2A36',
    backgroundColor: '#16161E',
  },
  incidentImg: { width: '100%', height: 90 },
  incidentLabel: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 8,
  },
  orDivider: {
    fontSize: 12,
    color: '#555566',
    textAlign: 'center',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
