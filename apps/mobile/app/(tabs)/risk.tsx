/**
 * Risk Profile — a telematics "credit score for driving".
 *
 * Shows a deterministic safety score (0–100) + factor breakdown computed from the
 * rider's own sensor history, plus an AI underwriter-style summary. This is the
 * data product intended for B2B insurance partners (shared only with consent).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { fetchRiskProfile, type RiskProfile } from '@/services/riskProfileService';
import { agentService } from '@/services/agentService';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:        '#F5F0E8',
  bgDeep:    '#EDE7D9',
  bgCard:    '#FFFFFF',
  sage:      '#4A7060',
  sagePale:  '#C4D8CC',
  sageTint:  '#EBF3EF',
  teal:      '#356060',
  green:     '#3A8050',
  greenTint: '#E8F5EE',
  amber:     '#B87830',
  amberTint: '#FAF0E0',
  coral:     '#C8503C',
  coralTint: '#FAE8E5',
  ink:       '#1C2826',
  inkMid:    '#445550',
  inkFaint:  '#8A9E96',
  line:      '#DDD6C8',
  lineLight: '#EAE4D8',
};

// ─── Score helpers ─────────────────────────────────────────────────────────────

function tierColors(tier: RiskProfile['tier']) {
  if (tier === 'Low')      return { fg: C.green,  bg: C.greenTint, grad: [C.sage, C.teal] as [string,string] };
  if (tier === 'Moderate') return { fg: C.amber,  bg: C.amberTint, grad: ['#B87830', '#96621A'] as [string,string] };
  return                          { fg: C.coral,  bg: C.coralTint, grad: [C.coral, '#A03428'] as [string,string] };
}

function scoreColor(score: number): string {
  if (score >= 80) return C.green;
  if (score >= 60) return C.amber;
  return C.coral;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RiskScreen() {
  const userId = useAuthStore((s) => s.session?.user.id);
  const [profile, setProfile] = useState<RiskProfile | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      const p = await fetchRiskProfile(userId);
      setProfile(p);
      if (p.hasEnoughData) {
        const s = await agentService.getRiskSummary({
          score: p.score,
          tier: p.tier,
          factors: p.factors,
          ridingMinutes: p.ridingMinutes,
          incidents: p.incidents,
          dataPoints: p.dataPoints,
        });
        setSummary(s);
      }
    } catch (e) {
      console.warn('[Risk] failed to load profile:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    setSummary(null);
    load();
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>

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
            <View key={`d-${row}-${col}`} style={[bg.dot, { top: 110 + row * 78, left: 16 + col * 82 }]} />
          ))
        )}
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.sage} />}
      >
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.eyebrow}>Your telematics score</Text>
            <Text style={s.title}>Risk Profile</Text>
          </View>
          <View style={s.headerIconWrap}>
            <Feather name="bar-chart-2" size={22} color={C.sage} />
          </View>
        </View>

        {/* ── Loading ─────────────────────────────────────────────────────── */}
        {loading ? (
          <View style={s.center}>
            <View style={s.loadingIconWrap}>
              <ActivityIndicator color={C.sage} size="large" />
            </View>
            <Text style={s.muted}>Analysing your riding data…</Text>
          </View>

        ) : !profile || !profile.hasEnoughData ? (
          /* ── Not enough data ──────────────────────────────────────────── */
          <View style={s.buildCard}>
            <View style={s.buildIconWrap}>
              <Feather name="trending-up" size={36} color={C.sage} />
            </View>
            <Text style={s.buildTitle}>Building your profile</Text>
            <Text style={s.buildSub}>
              Keep riding with CrashGuard active. Once we've analysed enough of your rides, your
              driving safety score will appear here.
            </Text>
            {profile && (
              <View style={s.dataPointPill}>
                <Feather name="database" size={13} color={C.sage} />
                <Text style={s.dataPointTxt}>{profile.dataPoints} data points collected</Text>
              </View>
            )}
          </View>

        ) : (
          /* ── Full profile ─────────────────────────────────────────────── */
          <>
            {/* Score card */}
            {(() => {
              const tc = tierColors(profile.tier);
              return (
                <View style={s.scoreCard}>
                  <LinearGradient colors={tc.grad} style={s.scoreGrad}>
                    {/* Score ring */}
                    <View style={s.scoreRing}>
                      <Text style={s.scoreNum}>{profile.score}</Text>
                      <Text style={s.scoreOutOf}>/ 100</Text>
                    </View>
                    <Text style={s.scoreSub}>Safety Score</Text>
                  </LinearGradient>

                  {/* Tier badge */}
                  <View style={[s.tierPill, { backgroundColor: tc.bg, borderColor: tc.fg + '55' }]}>
                    <View style={[s.tierDot, { backgroundColor: tc.fg }]} />
                    <Text style={[s.tierText, { color: tc.fg }]}>
                      {profile.tier.toUpperCase()} INSURANCE RISK
                    </Text>
                  </View>
                </View>
              );
            })()}

            {/* AI underwriter summary */}
            {summary && (
              <View style={s.summaryCard}>
                <View style={s.summaryHeader}>
                  <View style={s.summaryIconWrap}>
                    <Feather name="cpu" size={16} color={C.sage} />
                  </View>
                  <Text style={s.summaryLabel}>Underwriter Assessment</Text>
                </View>
                <Text style={s.summaryText}>{summary}</Text>
              </View>
            )}

            {/* Factor breakdown */}
            <Text style={s.sectionTitle}>Factor Breakdown</Text>
            {profile.factors.map((f) => {
              const fc = scoreColor(f.score);
              const barBg = f.score >= 80 ? C.greenTint : f.score >= 60 ? C.amberTint : C.coralTint;
              return (
                <View key={f.key} style={s.factorCard}>
                  <View style={s.factorHeader}>
                    <Text style={s.factorLabel}>{f.label}</Text>
                    <Text style={[s.factorScore, { color: fc }]}>{f.score}</Text>
                  </View>
                  {/* Progress bar */}
                  <View style={s.barTrack}>
                    <View style={[s.barFill, {
                      width: `${f.score}%` as any,
                      backgroundColor: fc,
                    }]} />
                  </View>
                  <Text style={s.factorDetail}>{f.detail}</Text>
                </View>
              );
            })}

            {/* Exposure stats */}
            <View style={s.statsRow}>
              <StatCard icon="clock"    label="Ride time"    value={`${profile.ridingMinutes} min`} />
              <StatCard icon="database" label="Data points"  value={`${profile.dataPoints}`} />
              <StatCard icon="alert-circle" label="Incidents" value={`${profile.incidents}`} />
            </View>

            {/* Disclaimer */}
            <View style={s.disclaimerCard}>
              <Feather name="lock" size={13} color={C.inkFaint} />
              <Text style={s.disclaimerText}>
                Your risk profile is private. It is shared with insurance partners only after your
                explicit, revocable consent, in line with the DPDP Act.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={s.statCard}>
      <Feather name={icon as any} size={16} color={C.sage} />
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Background art ───────────────────────────────────────────────────────────
const bg = StyleSheet.create({
  arcTR:    { position: 'absolute', width: 300, height: 300, borderRadius: 150, borderWidth: 1, borderColor: C.sagePale, top: -140, right: -80 },
  arcBL:    { position: 'absolute', width: 180, height: 180, borderRadius: 90, borderWidth: 1, borderColor: C.lineLight, bottom: 80, left: -80 },
  hRule:    { position: 'absolute', left: 0, right: 0, top: 185, height: 1, backgroundColor: C.lineLight },
  slash1:   { position: 'absolute', width: 100, height: 1, backgroundColor: C.line,      top: 380, right: 12, transform: [{ rotate: '22deg' }] },
  slash1b:  { position: 'absolute', width: 100, height: 1, backgroundColor: C.lineLight, top: 396, right: 12, transform: [{ rotate: '22deg' }] },
  bracketH: { position: 'absolute', top: 16, left: 16, width: 22, height: 1, backgroundColor: C.sage, opacity: 0.3 },
  bracketV: { position: 'absolute', top: 16, left: 16, width: 1, height: 22, backgroundColor: C.sage, opacity: 0.3 },
  dot:      { position: 'absolute', width: 3, height: 3, borderRadius: 1.5, backgroundColor: C.sagePale },
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 120 },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-end', marginTop: 12, marginBottom: 28,
  },
  eyebrow: {
    fontSize: 13, color: C.inkFaint, fontWeight: '500', letterSpacing: 0.3,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  title: {
    fontSize: 30, fontWeight: '900', color: C.ink, letterSpacing: -0.5, marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Heavy' : 'sans-serif-black',
  },
  headerIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: C.sageTint, alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },

  // Loading
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 16 },
  loadingIconWrap: {
    width: 72, height: 72, borderRadius: 24,
    backgroundColor: C.sageTint, alignItems: 'center', justifyContent: 'center',
  },
  muted: {
    fontSize: 14, color: C.inkFaint, textAlign: 'center', lineHeight: 22,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },

  // Build card (not enough data)
  buildCard: {
    backgroundColor: C.bgCard, borderRadius: 24, borderWidth: 1, borderColor: C.line,
    padding: 28, alignItems: 'center', gap: 14,
    shadowColor: '#00000010', shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12, elevation: 2,
  },
  buildIconWrap: {
    width: 80, height: 80, borderRadius: 28,
    backgroundColor: C.sageTint, alignItems: 'center', justifyContent: 'center',
  },
  buildTitle: {
    fontSize: 22, fontWeight: '800', color: C.ink, textAlign: 'center', letterSpacing: -0.3,
    fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Heavy' : 'sans-serif-black',
  },
  buildSub: {
    fontSize: 14, color: C.inkFaint, textAlign: 'center', lineHeight: 22,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  dataPointPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.sageTint, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: C.sagePale,
  },
  dataPointTxt: { fontSize: 13, fontWeight: '700', color: C.sage },

  // Score card
  scoreCard: {
    backgroundColor: C.bgCard, borderRadius: 24, borderWidth: 1, borderColor: C.line,
    overflow: 'hidden', marginBottom: 16,
    shadowColor: '#00000012', shadowOffset: { width: 0, height: 5 },
    shadowRadius: 14, elevation: 3,
  },
  scoreGrad: {
    alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24,
  },
  scoreRing: {
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  scoreNum: {
    fontSize: 80, fontWeight: '900', color: '#FFFFFF', letterSpacing: -4, lineHeight: 84,
    fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Heavy' : 'sans-serif-black',
  },
  scoreOutOf: { fontSize: 16, color: 'rgba(255,255,255,0.7)', fontWeight: '700', letterSpacing: 1 },
  scoreSub:   { fontSize: 14, color: 'rgba(255,255,255,0.8)', fontWeight: '600', letterSpacing: 0.5 },
  tierPill: {
    margin: 16, marginTop: 0, borderRadius: 100, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 9,
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center',
  },
  tierDot:  { width: 7, height: 7, borderRadius: 4 },
  tierText: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },

  // AI summary
  summaryCard: {
    backgroundColor: C.bgCard, borderRadius: 20, borderWidth: 1, borderColor: C.line,
    padding: 18, marginBottom: 22,
    shadowColor: '#00000008', shadowOffset: { width: 0, height: 3 }, shadowRadius: 8, elevation: 1,
  },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  summaryIconWrap: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: C.sageTint, alignItems: 'center', justifyContent: 'center',
  },
  summaryLabel: { fontSize: 11, fontWeight: '800', color: C.sage, letterSpacing: 1.5, textTransform: 'uppercase' },
  summaryText: {
    fontSize: 14, color: C.inkMid, lineHeight: 22,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },

  // Factors
  sectionTitle: {
    fontSize: 10, fontWeight: '800', color: C.inkFaint,
    letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12,
  },
  factorCard: {
    backgroundColor: C.bgCard, borderRadius: 18, borderWidth: 1, borderColor: C.line,
    padding: 16, marginBottom: 10,
  },
  factorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  factorLabel:  { fontSize: 14, fontWeight: '700', color: C.ink, flex: 1 },
  factorScore:  { fontSize: 18, fontWeight: '900', letterSpacing: -0.5,
    fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Heavy' : 'sans-serif-black' },
  barTrack: { height: 5, borderRadius: 3, backgroundColor: C.lineLight, overflow: 'hidden', marginBottom: 10 },
  barFill:  { height: 5, borderRadius: 3 },
  factorDetail: { fontSize: 12, color: C.inkFaint, lineHeight: 18,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 20 },
  statCard: {
    flex: 1, backgroundColor: C.bgCard, borderRadius: 16, borderWidth: 1, borderColor: C.line,
    alignItems: 'center', paddingVertical: 16, gap: 6,
    shadowColor: '#00000008', shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 1,
  },
  statValue: {
    fontSize: 18, fontWeight: '900', color: C.ink, letterSpacing: -0.3,
    fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Heavy' : 'sans-serif-black',
  },
  statLabel: { fontSize: 10, color: C.inkFaint, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },

  // Disclaimer
  disclaimerCard: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: C.lineLight, borderRadius: 14, padding: 14,
  },
  disclaimerText: {
    flex: 1, fontSize: 11, color: C.inkFaint, lineHeight: 17,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
});
