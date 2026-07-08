/**
 * Shared shell for all setup flow screens.
 * Renders: back button, step indicator, title, subtitle, children, and a CTA button.
 */
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Props {
  step: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  onNext: () => void;
  onBack?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  isLoading?: boolean;
  children: React.ReactNode;
}

export function SetupShell({
  step,
  totalSteps,
  title,
  subtitle,
  onNext,
  onBack,
  nextLabel = 'Continue →',
  nextDisabled = false,
  isLoading = false,
  children,
}: Props) {
  return (
    <SafeAreaView style={styles.container}>
      {/* Fixed header */}
      <View style={styles.topBar}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}

        {/* Step indicator pills */}
        <View style={styles.stepRow}>
          {Array(totalSteps)
            .fill(null)
            .map((_, i) => (
              <View
                key={i}
                style={[styles.stepPill, i < step && styles.stepPillDone, i === step - 1 && styles.stepPillActive]}
              />
            ))}
        </View>

        <Text style={styles.stepLabel}>
          {step}/{totalSteps}
        </Text>
      </View>

      {/* Scrollable content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        {children}
      </ScrollView>

      {/* Fixed CTA */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.btn, (nextDisabled || isLoading) && styles.btnDisabled]}
          onPress={onNext}
          disabled={nextDisabled || isLoading}
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.btnText}>{nextLabel}</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F14' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backBtn: { width: 72 },
  backText: { fontSize: 15, color: '#888899', fontWeight: '600' },
  stepRow: { flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center' },
  stepPill: {
    height: 4,
    width: 28,
    borderRadius: 2,
    backgroundColor: '#2A2A36',
  },
  stepPillActive: { backgroundColor: '#FF3B3B', width: 40 },
  stepPillDone: { backgroundColor: '#FF3B3B66' },
  stepLabel: { width: 72, textAlign: 'right', fontSize: 12, color: '#666680', fontWeight: '600' },
  content: { paddingHorizontal: 24, paddingBottom: 16 },
  title: {
    fontSize: 30,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.8,
    marginBottom: 10,
    marginTop: 16,
    lineHeight: 38,
  },
  subtitle: { fontSize: 14, color: '#666680', lineHeight: 22, marginBottom: 32 },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1E1E2A',
  },
  btn: {
    backgroundColor: '#FF3B3B',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: '#FF3B3B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  btnDisabled: { backgroundColor: '#2A1A1A', shadowOpacity: 0 },
  btnText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
});
