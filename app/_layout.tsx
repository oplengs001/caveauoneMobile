import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider } from '@/context/AuthContext';

import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { Alert, AppState } from 'react-native';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { isUpdatePending } = Updates.useUpdates();

  // Proactively check and download OTA updates on launch and whenever returning to foreground
  useEffect(() => {
    async function checkAndFetchUpdate() {
      try {
        if (!__DEV__ && Updates.isEnabled) {
          const update = await Updates.checkForUpdateAsync();
          if (update.isAvailable) {
            await Updates.fetchUpdateAsync();
          }
        }
      } catch (error) {
        console.log('Expo update check error:', error);
      }
    }

    checkAndFetchUpdate();

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        checkAndFetchUpdate();
      }
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (isUpdatePending) {
      Alert.alert(
        "Update Available",
        "A new version of CaveauOne is ready. Restart now to apply the latest changes?",
        [
          { text: "Later", style: "cancel" },
          { 
            text: "Restart Now", 
            onPress: async () => {
              await Updates.reloadAsync();
            } 
          }
        ]
      );
    }
  }, [isUpdatePending]);

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="intake/scan" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="intake/review" options={{ headerShown: false }} />
          <Stack.Screen name="tagging/index" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="deliveries" options={{ headerShown: false }} />
          <Stack.Screen name="delivery-logs" options={{ headerShown: false }} />
          <Stack.Screen name="pos/index" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="day-close" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </AuthProvider>
  );
}
