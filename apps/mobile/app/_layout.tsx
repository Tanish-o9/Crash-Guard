import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useUserStore } from '@/store/userStore';
import { useCalibrationStore } from '@/store/calibrationStore';

function LoadingScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: '#0F0F14', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color="#FF3B3B" size="large" />
    </View>
  );
}

export default function RootLayout() {
  const { isLoading, session, isOnboarded, initialize } = useAuthStore();
  const loadBaseline = useCalibrationStore(s => s.loadBaseline);
  const loadProfile = useUserStore(s => s.loadProfile);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    initialize();
  }, []);

  // Load baseline and user profile when session becomes available
  useEffect(() => {
    if (session?.user.id) {
      loadBaseline();
      loadProfile(session.user.id);
    }
  }, [session?.user.id]);

  // Auth routing guard. Only bounce users when they're in the WRONG area — never
  // clobber an explicit deep link (e.g. the home-screen widget opening /samaritan).
  useEffect(() => {
    if (isLoading) return;
    const inAuth = segments[0] === '(auth)';
    if (!session) {
      if (!inAuth) router.replace('/(auth)/welcome');
    } else if (!isOnboarded) {
      if (!inAuth) router.replace('/(auth)/setup/profile');
    } else if (inAuth) {
      // logged in + onboarded but still on an auth screen → go to the app.
      router.replace('/(tabs)');
    }
    // logged in + onboarded on any other route (tabs, samaritan, alarm…) → leave it.
  }, [isLoading, session, isOnboarded, segments]);

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <StatusBar style="light" />

        {isLoading ? (
          <LoadingScreen />
        ) : (
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: '#0F0F14' },
              headerTintColor: '#FFFFFF',
              headerTitleStyle: { fontWeight: '700' },
              contentStyle: { backgroundColor: '#0F0F14' },
              animation: 'slide_from_right',
            }}
          >
            {/* ── Auth group ────────────────────────────────────── */}
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />

            {/* ── Main app tabs ─────────────────────────────────── */}
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

            {/* ── Full-screen alarm modal ───────────────────────── */}
            <Stack.Screen
              name="alarm"
              options={{
                headerShown: false,
                presentation: 'fullScreenModal',
                animation: 'fade',
              }}
            />

            {/* ── Good Samaritan modal ──────────────────────────── */}
            <Stack.Screen
              name="samaritan"
              options={{
                title: 'Report Accident',
                presentation: 'modal',
                animation: 'slide_from_bottom',
              }}
            />

            {/* ── Emergency calling dashboard ───────────────────── */}
            <Stack.Screen
              name="calling"
              options={{
                headerShown: false,
                presentation: 'fullScreenModal',
                animation: 'fade',
              }}
            />

            {/* ── Dev tools (hidden from users) ────────────────── */}
            <Stack.Screen
              name="(dev)"
              options={{ headerShown: false }}
            />
          </Stack>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
