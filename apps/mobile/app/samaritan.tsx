import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Animated,
  Linking,
  ScrollView,
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
import { placeCall, setSpeakerphone } from '@/modules/native-call';
import { speakInCall } from '@/modules/native-tts';
import { languageChainForLocation, ttsLocale } from '@/services/languageService';
import { EMERGENCY_MOCK_NUMBER } from '@crashguard/constants';

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

  // Reset store on mount
  useEffect(() => {
    reset();
  }, []);

  // ─── Step Handlers ─────────────────────────────────────────────────────────

  const handleStart = () => next(); // -> describe

  const handleDescribeSubmit = () => next(); // -> locating

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

  // Analyzing effect (Bedrock agent, with Gemini/mock fallback)
  useEffect(() => {
    if (step === 'analyzing') {
      (async () => {
        const result =
          (await agentService.analyzeIncident(description)) ??
          (await analyzeIncidentDescription(description));
        setNlpResult(result);
        next(); // -> confirm
      })();
    }
  }, [step]);

  const handleConfirm = () => next(); // -> calling

  // Calling effect — AI-composed dispatcher script + acoustic-bridge call
  useEffect(() => {
    if (step === 'calling') {
      (async () => {
        // 1. Resolve spoken-language chain for this location (local → hi → en).
        let languages: string[] = ['hi', 'en'];
        try {
          if (lat && lng) languages = (await languageChainForLocation(lat, lng)).chain;
        } catch {
          // keep default
        }

        // 2. Compose the bystander dispatcher script (AI, with offline fallback).
        let segments = await agentService.getDispatcherScript({
          languages,
          lat,
          lng,
          severity: nlpResult?.severity ?? null,
          victims: nlpResult?.estimatedVictims ?? 1,
          summary: nlpResult?.summary ?? description,
          isSamaritan: true,
        });
        if (!segments || segments.length === 0) {
          segments = [
            {
              lang: 'en',
              text:
                `Hello. I am a bystander reporting an accident. ` +
                `${nlpResult?.summary ?? 'A rider has crashed.'} ` +
                `Location coordinates are ${lat?.toFixed(4)}, ${lng?.toFixed(4)}. ` +
                `Estimated severity is ${nlpResult?.severity ?? 'unknown'}. Please send an ambulance.`,
            },
          ];
        }

        // 3. Place the call (mock number until legal clearance), enable speakerphone,
        //    and speak each segment so the dispatcher hears it via the acoustic bridge.
        try {
          await placeCall(EMERGENCY_MOCK_NUMBER);
        } catch {
          Linking.openURL(`tel:${EMERGENCY_MOCK_NUMBER}`).catch(() => {});
        }
        await new Promise((r) => setTimeout(r, 6000));
        await setSpeakerphone(true);
        // Speak twice: we can't detect when the dispatcher actually answers.
        for (let pass = 0; pass < 2; pass++) {
          for (const seg of segments) {
            await speakInCall(seg.text, ttsLocale(seg.lang));
          }
        }
        await setSpeakerphone(false);

        // 4. Log the samaritan report, then advance.
        if (lat && lng) {
          const id = await emergencyService.submitSamaritanReport({
            lat,
            lng,
            nlpIntake: description,
            severityEstimate: nlpResult?.severity,
            canTransport,
            hospitalChosen: undefined,
          });
          if (id) console.log('Samaritan report logged:', id);
        }
        next(); // -> hospital or done
      })();
    }
  }, [step]);

  // Hospital fetch effect
  useEffect(() => {
    if (step === 'hospital' && canTransport && lat && lng) {
      (async () => {
        setLoading(true);
        const fetched =
          (await agentService.getNearbyHospitals(lat, lng)) ??
          (await emergencyService.getNearbyHospitals(lat, lng));
        setHospitals(fetched.slice(0, 3)); // show top 3
        setLoading(false);
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
  }) => {
    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`,
    ).catch(() => {});

    let languages: string[] = ['hi', 'en'];
    try {
      if (lat && lng) languages = (await languageChainForLocation(lat, lng)).chain;
    } catch {
      // keep default
    }

    const etaMinutes = Math.max(1, Math.round(h.distanceKm * 3));
    const segs = await agentService.getHospitalPrealert({
      hospitalName: h.name,
      victims: nlpResult?.estimatedVictims ?? 1,
      severity: nlpResult?.severity ?? null,
      etaMinutes,
      summary: nlpResult?.summary ?? undefined,
      languages,
    });

    // Look up the hospital's phone number and place a real call if available.
    const details = await agentService.getHospitalDetails(h.placeId);
    const phone = details?.phone ?? null;
    if (phone) {
      try {
        await placeCall(phone);
      } catch {
        Linking.openURL(`tel:${phone}`).catch(() => {});
      }
      await new Promise((r) => setTimeout(r, 6000)); // wait for connect
      await setSpeakerphone(true);
    }

    for (const seg of segs ?? []) {
      await speakInCall(seg.text, ttsLocale(seg.lang));
    }

    if (phone) await setSpeakerphone(false);
    console.log(`[Pre-Alert] ${h.name} (${h.placeId}) phone=${phone ?? 'n/a'}`);
  };

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
      <Text style={styles.subtitle}>Optional: Briefly describe the situation so we can prepare responders.</Text>
      
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

  const renderConfirm = () => (
    <View style={styles.content}>
      <Text style={styles.title}>Ready to dispatch</Text>
      
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Location</Text>
        <Text style={styles.summaryValue}>{lat?.toFixed(5)}, {lng?.toFixed(5)}</Text>
        
        <Text style={[styles.summaryLabel, { marginTop: 16 }]}>Extracted Info (Gemini)</Text>
        <Text style={styles.summaryValue}>Severity: {nlpResult?.severity?.toUpperCase()}</Text>
        <Text style={styles.summaryValue}>Summary: {nlpResult?.summary}</Text>
      </View>

      <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: '#FF3B3B' }]} onPress={handleConfirm}>
        <Text style={styles.primaryBtnText}>🚨 Call Emergency (Mock)</Text>
      </TouchableOpacity>
    </View>
  );

  const renderCalling = () => (
    <View style={styles.contentCentered}>
      <Animated.Text style={[styles.emoji, { opacity: 1 }]}>📞</Animated.Text>
      <Text style={styles.title}>Calling 112...</Text>
      <Text style={styles.subtitle}>Speaking automated emergency message</Text>
    </View>
  );

  const renderHospital = () => (
    <View style={styles.content}>
      <Text style={styles.title}>Nearby Hospitals</Text>
      <Text style={styles.subtitle}>You indicated you can transport. (Powered by Google Places)</Text>
      
      {isLoading ? (
        <View style={{ padding: 40, alignItems: 'center' }}>
          <ActivityIndicator size="small" color="#FF3B3B" />
        </View>
      ) : hospitals.length === 0 ? (
        <Text style={{ color: '#666680', textAlign: 'center', marginTop: 20 }}>No hospitals found nearby.</Text>
      ) : (
        hospitals.map((h) => (
          <View key={h.placeId} style={styles.hospitalCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.hospitalName} numberOfLines={1}>{h.name}</Text>
              <Text style={styles.hospitalDist}>{h.distanceKm.toFixed(1)} km away • {h.rating ? `★ ${h.rating}` : 'Unrated'}</Text>
              <Text style={{ fontSize: 11, color: '#555566', marginTop: 4 }} numberOfLines={1}>{h.address}</Text>
            </View>
            <TouchableOpacity
              style={styles.navBtn}
              onPress={() => void dispatchHospital(h)}
            >
              <Text style={styles.navBtnText}>Navigate & Alert</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
      
      <TouchableOpacity style={[styles.secondaryBtn, { marginTop: 12 }]} onPress={() => next()}>
        <Text style={styles.secondaryBtnText}>Skip / Finish</Text>
      </TouchableOpacity>
    </View>
  );

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
        {step === 'confirm' && renderConfirm()}
        {step === 'calling' && renderCalling()}
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
});
