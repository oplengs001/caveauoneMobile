import { PropsWithChildren, useState } from "react";
import { StyleSheet, TouchableOpacity } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export function Collapsible({
  children,
  title,
}: PropsWithChildren & { title: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const colorScheme = useColorScheme() ?? "light";
  const currentThemeColors = Colors[colorScheme === "dark" ? "warehouse" : "store"];

  return (
    <ThemedView style={[styles.container, {backgroundColor: currentThemeColors.card, borderColor: currentThemeColors.border}]}>
      <TouchableOpacity
        style={styles.heading}
        onPress={() => setIsOpen((value) => !value)}
        activeOpacity={0.8}
      >
        <IconSymbol
          name="chevron.right"
          size={18}
          weight="medium"
          color={currentThemeColors.textSecondary}
          style={{ transform: [{ rotate: isOpen ? "90deg" : "0deg" }] }}
        />

        <ThemedText type="defaultSemiBold" style={{color: currentThemeColors.text}}>{title}</ThemedText>
      </TouchableOpacity>
      {isOpen && <ThemedView style={styles.content}>{children}</ThemedView>}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 12, // Add some space between collapsible items
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10, // Increased gap for better spacing
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  content: {
    marginTop: 0,
    paddingHorizontal: 20,
    paddingLeft: 40, // Increased indentation to account for the icon
    paddingBottom: 18,
  },
});
