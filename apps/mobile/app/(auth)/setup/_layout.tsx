import { Stack } from 'expo-router';

export default function SetupLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#F5F0E8' },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="profile" />
      <Stack.Screen name="mount" />
      <Stack.Screen name="contacts" />
      <Stack.Screen name="medical" />
      <Stack.Screen name="permissions" />
      <Stack.Screen name="calibration" />
    </Stack>
  );
}
