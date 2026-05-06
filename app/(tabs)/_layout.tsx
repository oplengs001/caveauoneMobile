import { Stack } from "expo-router";
import React from "react";
import { TouchableOpacity } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function StackLayout() {
  const colorScheme = useColorScheme();

  return (
    <Stack
      screenOptions={{
        // The root Stack in app/_layout.tsx has headerShown: false for (tabs),
        // so individual screens within this Stack will manage their own headers.
        headerShown: true, // Ensure headers are shown for screens within this stack
      }}
    >
      <Stack.Screen
        name="home"
        options={{
          title: "Dashboard",
          // Removed tabBarIcon as it's not applicable for Stack navigation
          headerRight: () => (
            <TouchableOpacity
              onPress={async () => {
                const { getAuth, signOut } = await import("firebase/auth");
                const auth = getAuth();
                try {
                  await signOut(auth);
                } catch (e) {
                  console.error(e);
                }
                const { router } = await import("expo-router");
                router.replace("/login");
              }}
              style={{ marginRight: 16 }}
            >
              <ThemedText
                style={{
                  color: Colors[colorScheme ?? "light"].tint,
                  fontWeight: "600",
                  fontSize: 16,
                }}
              >
                Logout
              </ThemedText>
            </TouchableOpacity>
          ),
        }}
      />
    </Stack>
  );
}
