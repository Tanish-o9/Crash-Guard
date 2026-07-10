import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#F5F0E8' },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="phone" />
      <Stack.Screen name="otp" />
      <Stack.Screen name="setup" options={{ animation: 'fade' }} />
    </Stack>
  );
}
