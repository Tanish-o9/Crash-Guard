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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/authStore';
import { fetchRiskProfile, type RiskProfile } from '@/services/riskProfileService';
import { agentService } from '@/services/agentService';

function tierColor(tier: RiskProfile['tier']): string {
  if (tier === 'Low') return '#2ECC71';
  if (tier === 'Moderate') return '#F39C12';
  return '#FF3B3B';
}

function scoreColor(score: number): string {
  if (score >= 80) return '#2ECC71';
  if (score >= 60) return '#F39C12';
  return '#FF3B3B';
}

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

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    setSummary(null);
    load();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00E5FF" />}
      >
        <Text style={styles.h1}>Risk Profile</Text>
        <Text style={styles.sub}>Your telematics driving score</Text>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#00E5FF" size="large" />
            <Text style={styles.muted}>Analysing your riding data…</Text>
          </View>
        ) : !profile || !profile.hasEnoughData ? (
          <View style={styles.card}>
            <Text style={styles.emoji}>🏍️</Text>
            <Text style={styles.buildTitle}>Building your profile</Text>
            <Text style={styles.muted}>
              Keep riding with CrashGuard active. Once we've analysed enough of your rides, your
              driving safety score will appear here.
            </Text>
            {profile && (
              <Text style={[styles.muted, { marginTop: 8 }]}>
                {profile.dataPoints} data points collected so far.
              </Text>
            )}
          </View>
        ) : (
          <>
            {/* Score */}
            <View style={styles.scoreCard}>
              <Text style={[styles.score, { color: scoreColor(profile.score) }]}>{profile.score}</Text>
              <Text style={styles.scoreOutOf}>/ 100 safety score</Text>
              <View style={[styles.tierPill, { backgroundColor: tierColor(profile.tier) + '22', borderColor: tierColor(profile.tier) }]}>
                <Text style={[styles.tierText, { color: tierColor(profile.tier) }]}>
                  {profile.tier.toUpperCase()} INSURANCE RISK
                </Text>
              </View>
            </View>

            {/* AI summary */}
            {summary && (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>🤖 Underwriter assessment</Text>
                <Text style={styles.summaryText}>{summary}</Text>
              </View>
            )}

            {/* Factors */}
            <Text style={styles.section}>Factor breakdown</Text>
            {profile.factors.map((f) => (
              <View key={f.key} style={styles.factorCard}>
                <View style={styles.factorHeader}>
                  <Text style={styles.factorLabel}>{f.label}</Text>
                  <Text style={[styles.factorScore, { color: scoreColor(f.score) }]}>{f.score}</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${f.score}%`, backgroundColor: scoreColor(f.score) }]} />
                </View>
                <Text style={styles.factorDetail}>{f.detail}</Text>
              </View>
            ))}

            {/* Exposure */}
            <View style={styles.statsRow}>
              <Stat label="Ride time" value={`${profile.ridingMinutes} min`} />
              <Stat label="Data points" value={`${profile.dataPoints}`} />
              <Stat label="Incidents" value={`${profile.incidents}`} />
            </View>

            {/* Disclaimer */}
            <Text style={styles.disclaimer}>
              Your risk profile is private. It is shared with insurance partners only after your explicit,
              revocable consent, in line with the DPDP Act.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F14' },
  scroll: { padding: 20, paddingBottom: 40 },
  h1: { fontSize: 26, fontWeight: '900', color: '#FFFFFF' },
  sub: { fontSize: 13, color: '#666680', marginTop: 2, marginBottom: 20 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  muted: { fontSize: 13, color: '#666680', textAlign: 'center', lineHeight: 19 },
  emoji: { fontSize: 44, textAlign: 'center', marginBottom: 8 },
  buildTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', marginBottom: 8 },

  scoreCard: {
    backgroundColor: '#16161E',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2A2A36',
    alignItems: 'center',
    paddingVertical: 28,
    marginBottom: 16,
  },
  score: { fontSize: 72, fontWeight: '900', lineHeight: 76 },
  scoreOutOf: { fontSize: 13, color: '#666680', marginTop: 2 },
  tierPill: { marginTop: 14, borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 6 },
  tierText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },

  card: {
    backgroundColor: '#16161E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A36',
    padding: 18,
    marginBottom: 16,
  },
  cardLabel: { fontSize: 12, fontWeight: '700', color: '#00E5FF', marginBottom: 8, letterSpacing: 0.5 },
  summaryText: { fontSize: 14, color: '#D0D0DC', lineHeight: 21 },

  section: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666680',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  factorCard: {
    backgroundColor: '#16161E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2A36',
    padding: 14,
    marginBottom: 10,
  },
  factorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  factorLabel: { fontSize: 14, fontWeight: '600', color: '#FFFFFF', flex: 1 },
  factorScore: { fontSize: 16, fontWeight: '800' },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: '#2A2A36', marginTop: 10, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  factorDetail: { fontSize: 11, color: '#666680', marginTop: 6 },

  statsRow: { flexDirection: 'row', gap: 10, marginTop: 6, marginBottom: 20 },
  stat: {
    flex: 1,
    backgroundColor: '#16161E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2A36',
    alignItems: 'center',
    paddingVertical: 14,
  },
  statValue: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  statLabel: { fontSize: 10, color: '#666680', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },

  disclaimer: { fontSize: 11, color: '#444456', lineHeight: 16, textAlign: 'center' },
});
