/**
 * Incidents Tab — Full incident history screen.
 * Fetches all past incidents for the current user from Supabase.
 * Shows each incident with trigger type, timestamp, cancellation status,
 * and a link to the live tracking URL.
 */
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface IncidentRecord {
  id: string;
  trigger_type: string;
  lat: number;
  lng: number;
  triggered_at: string;
  cancelled: boolean | null;
  cancel_reason: string | null;
  called_emergency: boolean | null;
  contacts_notified: boolean | null;
  tracking_token: string | null;
}

const TRIGGER_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  auto_sensor:  { label: 'Auto Detected',   emoji: '🤖', color: '#FF3B3B' },
  manual_test:  { label: 'Test Alarm',       emoji: '🔔', color: '#F39C12' },
  samaritan:    { label: 'Samaritan Report', emoji: '🆘', color: '#9B59B6' },
  manual:       { label: 'Manual Trigger',   emoji: '👆', color: '#3498DB' },
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
      <SafeAreaView style={styles.container}>
        <Text style={styles.pageTitle}>Incidents</Text>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#FF3B3B" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Incidents</Text>
        {incidents.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{incidents.length}</Text>
          </View>
        )}
      </View>

      {error && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      )}

      <FlatList
        data={incidents}
        keyExtractor={(item) => item.id}
        contentContainerStyle={incidents.length === 0 ? styles.emptyContainer : styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF3B3B" />
        }
        ListEmptyComponent={<EmptyState />}
        renderItem={({ item }) => <IncidentCard incident={item} />}
      />
    </SafeAreaView>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>🛡️</Text>
      <Text style={styles.emptyTitle}>No incidents yet</Text>
      <Text style={styles.emptySubtitle}>
        Your crash events, test alarms and Samaritan reports will appear here. Ride safe!
      </Text>
    </View>
  );
}

// ─── Incident Card ────────────────────────────────────────────────────────────

function IncidentCard({ incident }: { incident: IncidentRecord }) {
  const meta = TRIGGER_LABELS[incident.trigger_type] ?? {
    label: incident.trigger_type,
    emoji: '📍',
    color: '#666680',
  };

  const dateStr = new Date(incident.triggered_at).toLocaleDateString();
  const timeStr = new Date(incident.triggered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  const isCancelled = incident.status === 'cancelled' || incident.cancelled_at != null;
  const wasCalled = incident.called_emergency === true;
  const wasNotified = incident.contacts_notified === true;

  const outcome = isCancelled
    ? { text: 'Cancelled', color: '#2ECC71' }
    : wasCalled
    ? { text: 'Emergency Called', color: '#FF3B3B' }
    : { text: 'In Progress', color: '#F39C12' };

  return (
    <View style={styles.card}>
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={[styles.triggerBadge, { backgroundColor: meta.color + '22', borderColor: meta.color + '55' }]}>
          <Text style={{ fontSize: 12 }}>{meta.emoji}</Text>
          <Text style={[styles.triggerLabel, { color: meta.color }]}>{meta.label}</Text>
        </View>
        <View style={[styles.outcomeBadge, { borderColor: outcome.color + '55' }]}>
          <Text style={[styles.outcomeText, { color: outcome.color }]}>{outcome.text}</Text>
        </View>
      </View>

      {/* Date / time / location */}
      <Text style={styles.dateText}>{dateStr} · {timeStr}</Text>
      <Text style={styles.coordsText}>
        📍 {incident.lat.toFixed(4)}, {incident.lng.toFixed(4)}
      </Text>

      {/* Status pills */}
      <View style={styles.pillRow}>
        <StatusPill active={wasCalled} label="112 Called" />
        <StatusPill active={wasNotified} label="Contacts SMS" />
        {isCancelled && incident.cancel_reason && (
          <View style={styles.pill}>
            <Text style={styles.pillText}>✏️ {incident.cancel_reason}</Text>
          </View>
        )}
      </View>

      {/* Tracking link */}
      {incident.tracking_token && !isCancelled && (
        <TouchableOpacity
          style={styles.trackBtn}
          onPress={() => Linking.openURL(`https://crashguard.app/track/${incident.tracking_token}`)}
        >
          <Text style={styles.trackBtnText}>🔗 View Tracking Link</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <View style={[styles.pill, active && styles.pillActive]}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>
        {active ? '✓' : '○'} {label}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F14' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 10,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  countBadge: {
    backgroundColor: '#FF3B3B',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
  },
  countBadgeText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  errorBar: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#1A0D0D',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#3A1A1A',
  },
  errorText: { fontSize: 12, color: '#FF6B6B' },
  list: { padding: 16, gap: 12, paddingBottom: 40 },
  emptyContainer: { flex: 1 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingBottom: 80,
    gap: 10,
    minHeight: 400,
  },
  emptyIcon: { fontSize: 56, marginBottom: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
  emptySubtitle: { fontSize: 14, color: '#444456', textAlign: 'center', lineHeight: 21 },
  card: {
    backgroundColor: '#16161E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A36',
    padding: 14,
    gap: 8,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  triggerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
  },
  triggerLabel: { fontSize: 11, fontWeight: '700' },
  outcomeBadge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  outcomeText: { fontSize: 10, fontWeight: '700' },
  dateText: { fontSize: 12, color: '#AAAABC', fontWeight: '500', fontVariant: ['tabular-nums'] },
  coordsText: { fontSize: 11, color: '#444456' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  pill: {
    borderRadius: 6,
    backgroundColor: '#1E1E2A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#2A2A36',
  },
  pillActive: { backgroundColor: '#0D1A0D', borderColor: '#2ECC7133' },
  pillText: { fontSize: 10, color: '#444456', fontWeight: '600' },
  pillTextActive: { color: '#2ECC71' },
  trackBtn: {
    marginTop: 4,
    backgroundColor: '#1E1E2A',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#2A2A36',
  },
  trackBtnText: { fontSize: 11, color: '#4285F4', fontWeight: '600' },
});
