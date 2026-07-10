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
  Platform,
} from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { useSamaritanStore } from '@/store/samaritanStore';
import { analyzeIncidentDescription } from '@/services/geminiService';
import { agentService } from '@/services/agentService';
import { emergencyService } from '@/services/emergencyService';
import { DEMO_VERIFIED_NUMBER, USE_REAL_DESTINATION_NUMBERS } from '@crashguard/constants';

const C = {
  bg: '#F5F0E8', bgDeep: '#EDE7D9', bgCard: '#FFFFFF',
  sage: '#4A7060', sagePale: '#C4D8CC', sageTint: '#EBF3EF', teal: '#356060',
  ink: '#1C2826', inkMid: '#445550', inkFaint: '#8A9E96',
  line: '#DDD6C8', lineLight: '#EAE4D8',
  coral: '#C8503C', coralTint: '#FAE8E5',
};

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

  const [dispatchInfo, setDispatchInfo] = useState<string | null>(null);
  const hasDispatched = useRef(false);

  useEffect(() => {
    reset();
    hasDispatched.current = false;
  }, []);

  const handleStart = () => next();
  const handleDescribeSubmit = () => next();

  const handlePickIncident = (desc: string) => {
    setDescription(desc);
    next();
  };

  useEffect(() => {
    if (step === 'locating') {
      (async () => {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') throw new Error('Permission denied');
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setLocation(loc.coords.latitude, loc.coords.longitude, 'Unknown Address');
          next();
        } catch (err) {
          setLocation(0, 0, 'Location unknown');
          next();
        }
      })();
    }
  }, [step]);

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

  const dispatchHospital = async (h: {
    placeId: string;
    name: string;
    lat: number;
    lng: number;
    distanceKm: number;
    phoneNumber?: string;
  }) => {
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`).catch(() => {});

    let realPhone = h.phoneNumber ?? null;
    if (!realPhone) realPhone = (await agentService.getHospitalDetails(h.placeId))?.phone ?? null;

    const dialTo = USE_REAL_DESTINATION_NUMBERS ? realPhone : DEMO_VERIFIED_NUMBER;
    const etaMinutes = Math.max(1, Math.round(h.distanceKm * 3));

    setDispatchInfo(
      USE_REAL_DESTINATION_NUMBERS
        ? `Pre-alerting ${h.name}${realPhone ? ` at ${realPhone}` : ''}…`
        : `Pre-alerting ${h.name}. Real number: ${realPhone ?? 'not listed'} — demo call placed to ${DEMO_VERIFIED_NUMBER}.`,
    );

    if (dialTo) {
      const r = await agentService.callHospital({
        to: dialTo,
        hospitalName: h.name,
        victims: nlpResult?.estimatedVictims ?? 1,
        severity: nlpResult?.severity ?? null,
        etaMinutes,
        summary: nlpResult?.summary ?? undefined,
        lat,
        lng,
      });
      console.log(`[Hospital pre-alert] ${h.name} → ${dialTo}: ${r?.status ?? 'unreachable'}${r?.error ? ' — ' + r.error : ''}`);
    } else {
      console.log(`[Hospital pre-alert] no number to dial for ${h.name}`);
    }
  };

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
          void dispatchHospital(fetched[0]);
        }
      })();
    }
  }, [step]);

  // ─── Renderers ──────────────────────────────────────────────────────────────

  const renderLanding = () => (
    <View style={s.contentCentered}>
      <View style={s.emojiWrapBig}>
        <Text style={s.emoji}>🆘</Text>
      </View>
      <Text style={s.title}>Witnessed an Accident?</Text>
      <Text style={s.subtitle}>
        Tap below to quickly alert emergency services and notify the rider's family.
      </Text>
      <TouchableOpacity style={s.primaryBtn} onPress={handleStart} activeOpacity={0.88}>
        <LinearGradient colors={[C.coral, '#A03428']} style={s.btnInner}>
          <Text style={s.btnText}>Report Accident Now</Text>
          <Feather name="alert-triangle" size={18} color="#FFFFFF" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  const renderDescribe = () => (
    <View style={s.content}>
      <Text style={[s.title, { textAlign: 'left' }]}>What do you see?</Text>
      <Text style={[s.subtitle, { textAlign: 'left', marginBottom: 20 }]}>
        Tap what happened, or describe it below.
      </Text>

      <View style={s.incidentGrid}>
        {INCIDENT_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={s.incidentCard}
            activeOpacity={0.8}
            onPress={() => handlePickIncident(opt.description)}
          >
            <Image source={opt.src} style={s.incidentImg} resizeMode="cover" />
            <Text style={s.incidentLabel} numberOfLines={1}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={s.orDivider}>or describe it</Text>

      <TextInput
        style={s.input}
        placeholder="e.g., Two bikes collided, one person injured..."
        placeholderTextColor={C.inkFaint}
        value={description}
        onChangeText={setDescription}
        multiline
        autoFocus
      />
      
      <TouchableOpacity
        style={s.checkboxRow}
        onPress={() => setCanTransport(!canTransport)}
        activeOpacity={0.8}
      >
        <View style={[s.checkbox, canTransport && s.checkboxActive]}>
          {canTransport && <Feather name="check" size={14} color="#FFFFFF" />}
        </View>
        <Text style={s.checkboxLabel}>I can transport the injured to a hospital</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.primaryBtn} onPress={handleDescribeSubmit} activeOpacity={0.88}>
        <LinearGradient colors={[C.sage, C.teal]} style={s.btnInner}>
          <Text style={s.btnText}>Next</Text>
          <Feather name="arrow-right" size={18} color="#FFFFFF" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  const renderLocating = () => (
    <View style={s.contentCentered}>
      <ActivityIndicator size="large" color={C.coral} />
      <Text style={s.loadingText}>Acquiring GPS location...</Text>
    </View>
  );

  const renderAnalyzing = () => (
    <View style={s.contentCentered}>
      <ActivityIndicator size="large" color={C.sage} />
      <Text style={s.loadingText}>AI analyzing description...</Text>
    </View>
  );

  const renderHospital = () => {
    const nearest = hospitals[0];
    return (
      <View style={s.content}>
        <Text style={[s.title, { textAlign: 'left' }]}>Nearest Hospital</Text>
        <Text style={[s.subtitle, { textAlign: 'left' }]}>
          Routing you to the nearest hospital and pre-alerting them automatically.
        </Text>

        {isLoading ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={C.coral} />
            <Text style={s.loadingText}>Finding the nearest hospital…</Text>
          </View>
        ) : !nearest ? (
          <Text style={{ color: C.inkFaint, textAlign: 'center', marginTop: 20 }}>
            No hospitals found nearby.
          </Text>
        ) : (
          <>
            <View style={s.hospitalCard}>
              <View style={s.hospitalIconWrap}>
                <Feather name="activity" size={24} color={C.coral} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.hospitalName} numberOfLines={1}>{nearest.name}</Text>
                <Text style={s.hospitalDist}>
                  {nearest.distanceKm.toFixed(1)} km away{nearest.phoneNumber ? ` • ${nearest.phoneNumber}` : ' • no number listed'}
                </Text>
                <Text style={s.hospitalAddress} numberOfLines={2}>{nearest.address}</Text>
              </View>
            </View>

            {dispatchInfo && (
              <View style={s.dispatchNote}>
                <Feather name="info" size={14} color={C.sage} style={{ marginTop: 2 }} />
                <Text style={s.dispatchNoteText}>{dispatchInfo}</Text>
              </View>
            )}

            <TouchableOpacity
              style={s.secondaryBtn}
              onPress={() =>
                Linking.openURL(
                  `https://www.google.com/maps/dir/?api=1&destination=${nearest.lat},${nearest.lng}`,
                ).catch(() => {})
              }
            >
              <Text style={s.secondaryBtnText}>Reopen directions</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity style={[s.primaryBtn, { marginTop: 16 }]} onPress={handleDone} activeOpacity={0.88}>
          <LinearGradient colors={[C.sage, C.teal]} style={s.btnInner}>
            <Text style={s.btnText}>Done</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  };

  const renderDone = () => (
    <View style={s.contentCentered}>
      <View style={[s.emojiWrapBig, { backgroundColor: C.sageTint }]}>
        <Feather name="check" size={48} color={C.sage} />
      </View>
      <Text style={s.title}>Help is on the way</Text>
      <Text style={s.subtitle}>Emergency contacts have been notified via SMS.</Text>
      <TouchableOpacity style={s.primaryBtn} onPress={handleDone} activeOpacity={0.88}>
        <LinearGradient colors={[C.sage, C.teal]} style={s.btnInner}>
          <Text style={s.btnText}>Done</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={s.container} edges={['bottom', 'left', 'right']}>
      {/* Background art */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient colors={[C.bg, C.bgDeep]} style={StyleSheet.absoluteFill} />
        <View style={bg.arcTR} />
        <View style={bg.arcBL} />
        <View style={bg.bracketH} />
        <View style={bg.bracketV} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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

const bg = StyleSheet.create({
  arcTR:    { position: 'absolute', width: 280, height: 280, borderRadius: 140, borderWidth: 1, borderColor: C.sagePale, top: -130, right: -70 },
  arcBL:    { position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 1, borderColor: C.lineLight, bottom: 80, left: -70 },
  bracketH: { position: 'absolute', top: 16, left: 16, width: 22, height: 1, backgroundColor: C.sage, opacity: 0.3 },
  bracketV: { position: 'absolute', top: 16, left: 16, width: 1, height: 22, backgroundColor: C.sage, opacity: 0.3 },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  content: { flex: 1, justifyContent: 'center' },
  contentCentered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  emojiWrapBig: {
    width: 100, height: 100, borderRadius: 32, backgroundColor: C.coralTint,
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
    shadowColor: C.coral, shadowOffset: { width: 0, height: 4 }, shadowRadius: 16, shadowOpacity: 0.15, elevation: 4,
  },
  emoji: { fontSize: 52 },
  
  title: {
    fontSize: 32, fontWeight: '900', color: C.ink, letterSpacing: -0.8,
    marginBottom: 12, textAlign: 'center', lineHeight: 40,
    fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Heavy' : 'sans-serif-black',
  },
  subtitle: {
    fontSize: 14, color: C.inkFaint, textAlign: 'center', marginBottom: 36, lineHeight: 22,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  
  primaryBtn: {
    borderRadius: 18, overflow: 'hidden', width: '100%',
    shadowColor: C.sage, shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28, shadowRadius: 12, elevation: 6,
  },
  btnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18,
  },
  btnText: {
    fontSize: 16, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.3,
    fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Bold' : 'sans-serif-medium',
  },
  
  secondaryBtn: {
    marginTop: 16, paddingVertical: 16, alignItems: 'center', borderRadius: 14,
    backgroundColor: C.lineLight,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '700', color: C.inkMid },
  
  input: {
    backgroundColor: C.bgCard, borderRadius: 18, borderWidth: 1.5, borderColor: C.line,
    padding: 16, color: C.ink, fontSize: 16, minHeight: 120, textAlignVertical: 'top',
    marginBottom: 20, shadowColor: '#00000008', shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 1,
  },
  
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 32, gap: 12 },
  checkbox: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: C.line,
    alignItems: 'center', justifyContent: 'center', backgroundColor: C.bgCard,
  },
  checkboxActive: { backgroundColor: C.sage, borderColor: C.sage },
  checkboxLabel: { fontSize: 14, color: C.inkMid, fontWeight: '500' },
  
  loadingText: { color: C.inkFaint, marginTop: 16, fontSize: 14, fontWeight: '600' },
  
  hospitalCard: {
    flexDirection: 'row', gap: 14, alignItems: 'center',
    backgroundColor: C.bgCard, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.line,
    shadowColor: '#00000008', shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 1,
    marginBottom: 16,
  },
  hospitalIconWrap: {
    width: 48, height: 48, borderRadius: 14, backgroundColor: C.coralTint,
    alignItems: 'center', justifyContent: 'center',
  },
  hospitalName: { fontSize: 18, fontWeight: '800', color: C.ink, marginBottom: 4 },
  hospitalDist: { fontSize: 13, color: C.inkMid, fontWeight: '600', marginBottom: 2 },
  hospitalAddress: { fontSize: 11, color: C.inkFaint, lineHeight: 16 },
  
  dispatchNote: {
    flexDirection: 'row', gap: 10, backgroundColor: C.sageTint, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: C.sagePale, marginBottom: 12,
  },
  dispatchNoteText: { flex: 1, fontSize: 12, color: C.inkMid, lineHeight: 18 },
  
  incidentGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 8 },
  incidentCard: {
    width: '48%', borderRadius: 16, overflow: 'hidden', marginBottom: 12,
    borderWidth: 1.5, borderColor: C.line, backgroundColor: C.bgCard,
  },
  incidentImg: { width: '100%', height: 90 },
  incidentLabel: {
    fontSize: 12, color: C.inkMid, fontWeight: '700', textAlign: 'center', paddingVertical: 10,
  },
  
  orDivider: {
    fontSize: 11, color: C.inkFaint, textAlign: 'center', marginBottom: 12,
    textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '800',
  },
});
