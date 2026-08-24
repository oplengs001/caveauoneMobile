import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { Tabs } from "expo-router";
import { Trophy, Zap } from "lucide-react-native";
import React from "react";
import { Platform } from "react-native";

export default function TabsLayout() {
  const { profile } = useAuth();
  const isStoreStaff = profile?.role === "store_staff";
  const theme = Colors.store;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: "#94a3b8",
        tabBarStyle: isStoreStaff
          ? {
              backgroundColor: "#ffffff",
              borderTopColor: "#e2e8f0",
              borderTopWidth: 1,
              height: Platform.OS === "ios" ? 88 : 64,
              paddingBottom: Platform.OS === "ios" ? 28 : 10,
              paddingTop: 8,
              elevation: 8,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.05,
              shadowRadius: 4,
            }
          : {
              display: "none",
            },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "800",
          letterSpacing: 0.3,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: isStoreStaff ? "POS Terminal" : "Home",
          tabBarLabel: "POS Terminal",
          tabBarIcon: ({ color, focused }) => (
            <Zap size={22} color={color} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="staff-dashboard"
        options={{
          title: "My Performance",
          tabBarLabel: "My Sales",
          tabBarIcon: ({ color, focused }) => (
            <Trophy size={22} color={color} strokeWidth={focused ? 2.5 : 2} />
          ),
          href: isStoreStaff ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
