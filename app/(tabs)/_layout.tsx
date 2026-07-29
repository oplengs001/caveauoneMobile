import { Stack } from "expo-router";
import React from "react";
import { TouchableOpacity } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";

export default function StackLayout() {
  const { profile } = useAuth();
  const role = profile?.role === 'store' ? 'store' : 'warehouse';
  const theme = Colors[role];

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: theme.background,
        },
        headerTintColor: theme.text,
        headerTitleStyle: {
          fontWeight: '800',
        },
      }}
    >
      <Stack.Screen
        name="home"
        options={{
          title: "Dashboard",
          headerRight: () => (
            <TouchableOpacity
              onPress={async () => {
                const { clearToken } = await import("@/lib/auth");
                await clearToken();
                const { router } = await import("expo-router");
                router.replace("/login");
              }}
              style={{ marginRight: 16 }}
            >
              <ThemedText
                style={{
                  color: theme.primary,
                  fontWeight: "800",
                  fontSize: 14,
                }}
              >
                LOGOUT
              </ThemedText>
            </TouchableOpacity>
          ),
        }}
      />
    </Stack>
  );
}
