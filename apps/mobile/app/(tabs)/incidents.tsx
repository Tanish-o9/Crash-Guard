/**
 * Incidents Tab — Full incident history screen.
 * Fetches all past incidents for the current user from Supabase.
 * Shows each incident with trigger type, timestamp, cancellation status,
 * and a link to the live tracking URL.
 */
import * as React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState, useCallback } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

// ─── Design tokens (shared with home screen) ──────────────────────────────────
const C = {
  bg:        '#F5F0E8',
  bgDeep:    '#EDE7D9',
  bgCard:    '#FFFFFF',
  sage:      '#4A7060',
  sageLight: '#7A9E8E',
  sagePale:  '#C4D8CC',
  sageTint:  '#EBF3EF',
  coral:     '#C8503C',
  amber:     '#B87830',
  violet:    '#7A5A96',
  blue:      '#4A6A9A',
  green:     '#3A8050',
  ink:       '#1C2826',
  inkMid:    '#445550',
  inkFaint:  '#8A9E96',
  line:      '#DDD6C8',
  lineLight: '#EAE4D8',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface IncidentRecord {
  id: string;
  trigger_type: string;
  lat: number;
  lng: number;
  status: string;
  triggered_at: string;
  cancelled_at: string | null;
  cancel_reason: string | null;
  called_emergency: boolean | null;
  contacts_notified: boolean | null;
  tracking_token: string | null;
}

const TRIGGER_META: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  auto_sensor:  { label: 'Auto Detected',   icon: 'cpu',          color: C.coral,  bg: '#FAE8E5' },
  manual_test:  { label: 'Test Alarm',       icon: 'bell',         color: C.amber,  bg: '#FAF0E0' },
  samaritan:    { label: 'Samaritan Report', icon: 'heart',        color: C.violet, bg: '#F2EBF8' },
  manual:       { label: 'Manual Trigger',   icon: 'alert-circle', color: C.blue,   bg: '#E8EDF5' },
};

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function IncidentsScreen() {
  const { session } = useAuthStore();
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchIncidents = useCallback(async () => {
    if (!session?.user.id) return;
    try {
      const { data, error: fetchError } = await supabase
        .from('incidents')
        .select('id, trigger_type, lat, lng, status, triggered_at, cancelled_at, cancel_reason, called_emergency, contacts_notified, tracking_token')
        .eq('user_id', session.user.id)
        .order('triggered_at', { ascending: false })
        .limit(20);

      if (fetchError) throw fetchError;
      setIncidents(data ?? []);
      setError(null);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load incidents');
    }
  }, [session?.user.id]);

  useEffect(() => {
    setLoading(true);
    fetchIncidents().finally(() => setLoading(false));
  }, [fetchIncidents]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchIncidents();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={s.root}>
        <BgArt />
        <View style={s.header}>
          <Text style={s.eyebrow}>Your safety log</Text>
          <Text style={s.title}>History</Text>
        </View>
        <View style={s.centered}>
          <ActivityIndicator size="large" color={C.sage} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root}>
      <BgArt />

      <View style={s.header}>
        <View>
          <Text style={s.eyebrow}>Your safety log</Text>
          <Text style={s.title}>History</Text>
        </View>
        {incidents.length > 0 && (
          <View style={s.countBadge}>
            <Text style={s.countBadgeTxt}>{incidents.length}</Text>
          </View>
        )}
      </View>

      {error && (
        <View style={s.errorBar}>
          <Feather name="alert-triangle" size={14} color={C.coral} />
          <Text style={s.errorTxt}>{error}</Text>
        </View>
      )}

      <FlatList
        data={incidents}
        keyExtractor={(item) => item.id}
        contentContainerStyle={incidents.length === 0 ? s.emptyContainer : s.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.sage} />
        }
        ListEmptyComponent={<EmptyState />}
        renderItem={({ item }) => <IncidentCard incident={item} />}
      />
    </SafeAreaView>
  );
}

// ─── Background decoration (matches home screen style) ────────────────────────

function BgArt() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={[C.bg, C.bgDeep]} style={StyleSheet.absoluteFill} />
      <View style={bg.arcTR} />
      <View style={bg.arcBL} />
      <View style={bg.hRule1} />
      <View style={bg.hRule2} />
      <View style={bg.slash1} />
      <View style={bg.slash1b} />
      <View style={bg.bracketH} />
      <View style={bg.bracketV} />
      {[0,1,2,3,4,5].map(row =>
        [0,1,2,3,4].map(col => (
          <View key={`d-${row}-${col}`} style={[bg.dot, { top: 130 + row * 72, left: 16 + col * 82 }]} />
        ))
      )}
    </View>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <View style={s.emptyState}>
      <View style={s.emptyIconWrap}>
        <Feather name="shield" size={40} color={C.sage} />
      </View>
      <Text style={s.emptyTitle}>No incidents yet</Text>
      <Text style={s.emptySubtitle}>
        Your crash events, test alarms and Samaritan reports will appear here. Ride safe!
      </Text>
    </View>
  );
}

// ─── Incident Card ────────────────────────────────────────────────────────────

function IncidentCard({ incident }: { incident: IncidentRecord }) {
  const meta = TRIGGER_META[incident.trigger_type] ?? {
    label: incident.trigger_type,
    icon: 'map-pin',
    color: C.inkFaint,
    bg: C.lineLight,
  };

  const dateStr = new Date(incident.triggered_at).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
  const timeStr = new Date(incident.triggered_at).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit',
  });

  const isCancelled = incident.status === 'cancelled' || incident.cancelled_at != null;
  const wasCalled   = incident.called_emergency === true;
  const wasNotified = incident.contacts_notified === true;

  const outcome = isCancelled
    ? { text: 'Cancelled',       color: C.green,  bg: '#E8F5EE' }
    : wasCalled
    ? { text: 'Emergency Called', color: C.coral,  bg: '#FAE8E5' }
    : { text: 'In Progress',     color: C.amber,  bg: '#FAF0E0' };

  return (
    <View style={s.card}>
      {/* Coloured left accent bar */}
      <View style={[s.cardAccent, { backgroundColor: meta.color }]} />

      <View style={s.cardInner}>
        {/* Header row */}
        <View style={s.cardHeader}>
          <View style={[s.triggerBadge, { backgroundColor: meta.bg }]}>
            <Feather name={meta.icon as any} size={12} color={meta.color} />
            <Text style={[s.triggerLbl, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <View style={[s.outcomeBadge, { backgroundColor: outcome.bg }]}>
            <Text style={[s.outcomeTxt, { color: outcome.color }]}>{outcome.text}</Text>
          </View>
        </View>

        {/* Date / time / location */}
        <View style={s.dateRow}>
          <Feather name="clock" size={11} color={C.inkFaint} />
          <Text style={s.dateTxt}>{dateStr} · {timeStr}</Text>
        </View>
        <View style={s.dateRow}>
          <Feather name="map-pin" size={11} color={C.inkFaint} />
          <Text style={s.coordsTxt}>
            {incident.lat.toFixed(4)}, {incident.lng.toFixed(4)}
          </Text>
        </View>

        {/* Divider */}
        <View style={s.cardDivider} />

        {/* Status pills */}
        <View style={s.pillRow}>
          <StatusPill active={wasCalled}    label="112 Called" />
          <StatusPill active={wasNotified}  label="Contacts SMS" />
          {isCancelled && incident.cancel_reason && (
            <View style={s.pill}>
              <Feather name="edit-2" size={10} color={C.inkFaint} />
              <Text style={s.pillTxt}>{incident.cancel_reason}</Text>
            </View>
          )}
        </View>

        {/* Tracking link */}
        {incident.tracking_token && !isCancelled && (
          <TouchableOpacity
            style={s.trackBtn}
            onPress={() => Linking.openURL(`https://crashguard.app/track/${incident.tracking_token}`)}
          >
            <Feather name="link" size={13} color={C.sage} />
            <Text style={s.trackBtnTxt}>View Tracking Link</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <View style={[s.pill, active && s.pillActive]}>
      <Feather
        name={active ? 'check-circle' : 'circle'}
        size={10}
        color={active ? C.sage : C.inkFaint}
      />
      <Text style={[s.pillTxt, active && s.pillTxtActive]}>{label}</Text>
    </View>
  );
}

// ─── Background art styles ─────────────────────────────────────────────────────
const bg = StyleSheet.create({
  arcTR: { position: 'absolute', width: 300, height: 300, borderRadius: 150, borderWidth: 1, borderColor: C.sagePale, top: -140, right: -80 },
  arcBL: { position: 'absolute', width: 180, height: 180, borderRadius: 90, borderWidth: 1, borderColor: C.lineLight, bottom: 80, left: -80 },
  hRule1: { position: 'absolute', left: 0, right: 0, top: 180, height: 1, backgroundColor: C.lineLight },
  hRule2: { position: 'absolute', left: 24, right: 24, top: 193, height: 1, backgroundColor: C.lineLight, opacity: 0.5 },
  slash1:  { position: 'absolute', width: 100, height: 1, backgroundColor: C.line,      bottom: 200, left: -8, transform: [{ rotate: '-20deg' }] },
  slash1b: { position: 'absolute', width: 100, height: 1, backgroundColor: C.lineLight, bottom: 215, left: -8, transform: [{ rotate: '-20deg' }] },
  bracketH: { position: 'absolute', top: 16, left: 16, width: 22, height: 1, backgroundColor: C.sage, opacity: 0.3 },
  bracketV: { position: 'absolute', top: 16, left: 16, width: 1, height: 22, backgroundColor: C.sage, opacity: 0.3 },
  dot: { position: 'absolute', width: 3, height: 3, borderRadius: 1.5, backgroundColor: C.sagePale },
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
  },
  eyebrow: {
    fontSize: 13,
    color: C.inkFaint,
    fontWeight: '500',
    letterSpacing: 0.3,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    color: C.ink,
    letterSpacing: -0.5,
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Heavy' : 'sans-serif-black',
  },
  countBadge: {
    backgroundColor: C.sage,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 4,
  },
  countBadgeTxt: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },

  errorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 24,
    marginBottom: 12,
    backgroundColor: '#FAE8E5',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: C.coral + '55',
  },
  errorTxt: { fontSize: 13, color: C.coral, fontWeight: '600', flex: 1 },

  list: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 120, gap: 14 },
  emptyContainer: { flex: 1 },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingBottom: 80,
    gap: 14,
    minHeight: 400,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 28,
    backgroundColor: C.sageTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: C.ink,
    letterSpacing: -0.3,
    fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Heavy' : 'sans-serif-black',
  },
  emptySubtitle: {
    fontSize: 14,
    color: C.inkFaint,
    textAlign: 'center',
    lineHeight: 22,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },

  // Card
  card: {
    backgroundColor: C.bgCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.line,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#00000010',
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 10,
    elevation: 2,
  },
  cardAccent: { width: 4 },
  cardInner: { flex: 1, padding: 16, gap: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  triggerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5,
  },
  triggerLbl: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  outcomeBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  outcomeTxt: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateTxt: {
    fontSize: 13,
    color: C.inkMid,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  coordsTxt: {
    fontSize: 12,
    color: C.inkFaint,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  cardDivider: { height: 1, backgroundColor: C.lineLight, marginVertical: 2 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 8, backgroundColor: C.lineLight,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  pillActive: { backgroundColor: C.sageTint },
  pillTxt: { fontSize: 11, color: C.inkFaint, fontWeight: '700' },
  pillTxtActive: { color: C.sage },
  trackBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 4, backgroundColor: C.sageTint,
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  trackBtnTxt: { fontSize: 12, color: C.sage, fontWeight: '800', letterSpacing: 0.3 },
});
