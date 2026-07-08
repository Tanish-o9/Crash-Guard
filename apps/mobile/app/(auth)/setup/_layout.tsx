import { Stack } from 'expo-router';

export default function SetupLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0F0F14' },
        animation: 'slide_from_right',
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
