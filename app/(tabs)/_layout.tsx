import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, TouchableOpacity } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: true,
        tabBarButton: HapticTab,
        tabBarStyle: Platform.select({
          ios: {
            // Use a transparent background on iOS to show the blur effect
            position: 'absolute',
          },
          default: {},
        }),
      }}>
      <Tabs.Screen
        name="home"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
          headerRight: () => (
            <TouchableOpacity
              onPress={async () => {
                const { getAuth, signOut } = await import('firebase/auth');
                const auth = getAuth();
                try {
                  await signOut(auth);
                } catch (e) {
                  console.error(e);
                }
                const { router } = await import('expo-router');
                router.replace('/login');
              }}
              style={{ marginRight: 16 }}
            >
              <ThemedText style={{ color: Colors[colorScheme ?? 'light'].tint, fontWeight: '600', fontSize: 16 }}>Logout</ThemedText>
            </TouchableOpacity>
          ),
        }}
      />
    </Tabs>
  );
}
