import { Tabs } from 'expo-router';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:        '#F5F0E8',
  bgCard:    '#FFFFFF',
  sage:      '#4A7060',
  sagePale:  '#C4D8CC',
  sageTint:  '#EBF3EF',
  teal:      '#356060',
  ink:       '#1C2826',
  inkFaint:  '#A0AEA8',
  line:      '#DDD6C8',
};

// ─── Tab config ───────────────────────────────────────────────────────────────
const TABS: { name: string; icon: string; label: string }[] = [
  { name: 'index',     icon: 'home',       label: 'Home'      },
  { name: 'incidents', icon: 'clock',      label: 'History'   },
  { name: 'risk',      icon: 'bar-chart-2',label: 'Risk'      },
  { name: 'settings',  icon: 'settings',   label: 'Settings'  },
];

// ─── Custom tab icon ─────────────────────────────────────────────────────────

function TabIcon({
  icon,
  label,
  focused,
}: {
  icon: string;
  label: string;
  focused: boolean;
}) {
  return (
    <View style={[s.iconCol, focused && s.iconColActive]}>
      {/* Active indicator dot above icon */}
      <View style={[s.activeDot, focused && s.activeDotVisible]} />

      {/* Icon chip */}
      <View style={[s.iconChip, focused && s.iconChipActive]}>
        <Feather
          name={icon as any}
          size={20}
          color={focused ? C.sage : C.inkFaint}
          strokeWidth={focused ? 2.5 : 1.8}
        />
      </View>
    </View>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: C.bgCard,
          borderTopColor: C.line,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 88 : 72,
          paddingBottom: Platform.OS === 'ios' ? 28 : 12,
          paddingTop: 10,
          // Subtle shadow upward
          shadowColor: '#1C2826',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.06,
          shadowRadius: 12,
          elevation: 10,
        },
        tabBarActiveTintColor:   C.sage,
        tabBarInactiveTintColor: C.inkFaint,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '800',
          letterSpacing: 0.5,
          marginTop: 2,
          fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Bold' : 'sans-serif-medium',
        },
        tabBarShowLabel: true,
      }}
    >
      {TABS.map(tab => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.label,
            tabBarLabel: tab.label,
            tabBarIcon: ({ focused }) => (
              <TabIcon icon={tab.icon} label={tab.label} focused={focused} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  iconCol: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingTop: 2,
  },
  iconColActive: {},

  // 3px dot indicator above the icon when active
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'transparent',
    marginBottom: 1,
  },
  activeDotVisible: {
    backgroundColor: C.sage,
  },

  // The icon background chip
  iconChip: {
    width: 42,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  iconChipActive: {
    backgroundColor: C.sageTint,
    // Subtle inner border
    borderWidth: 1,
    borderColor: C.sagePale,
  },
});
