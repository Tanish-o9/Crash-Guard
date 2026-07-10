import { Stack } from 'expo-router';

export default function DevLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#F5F0E8' },
        headerTintColor: '#4A7060',
        headerTitleStyle: { fontWeight: '800', color: '#1C2826' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: '#F5F0E8' },
      }}
    />
  );
}
