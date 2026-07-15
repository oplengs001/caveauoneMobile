import React from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { X, MapPin } from "lucide-react-native";
import { Colors } from "@/constants/theme";

export interface BottleWithLocation {
  bottleId: string;
  locationName: string;
  locationId: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onBottleSelected: (bottleId: string) => void;
  bottles: BottleWithLocation[];
  title?: string;
  theme?: any;
  wineName?: string;
  wineVintage?: string;
  wineProducer?: string;
}

export default function BottlePickerModal({
  visible,
  onClose,
  onBottleSelected,
  bottles,
  title = "Select a Bottle",
  theme = Colors.store,
  wineName,
  wineVintage,
  wineProducer,
}: Props) {
  // Group bottles by location
  const groupedBottles = bottles.reduce((acc, bottle) => {
    if (!acc[bottle.locationName]) {
      acc[bottle.locationName] = [];
    }
    acc[bottle.locationName].push(bottle);
    return acc;
  }, {} as Record<string, BottleWithLocation[]>);

  const locationNames = Object.keys(groupedBottles).sort();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: theme.background }]}>
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          {(wineName || wineVintage || wineProducer) && (
            <View style={[styles.wineCard, { backgroundColor: theme.primary + "12", borderColor: theme.primary + "30" }]}>
              <Text style={[styles.wineCardName, { color: theme.text }]} numberOfLines={2}>
                {wineName}
              </Text>
              <Text style={[styles.wineCardMeta, { color: theme.textSecondary }]}>
                {[wineVintage, wineProducer].filter(Boolean).join(" · ")}
              </Text>
            </View>
          )}

          <ScrollView style={styles.scrollArea}>
            {locationNames.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                  No bottles found
                </Text>
              </View>
            ) : (
              locationNames.map((locName) => (
                <View key={locName} style={styles.groupContainer}>
                  <TouchableOpacity
                    style={[styles.bottleList, { borderColor: theme.border, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}
                    onPress={() => onBottleSelected(groupedBottles[locName][0].bottleId)}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
                      <View style={{ backgroundColor: theme.primary + "20", padding: 12, borderRadius: 12 }}>
                        <MapPin size={24} color={theme.primary} />
                      </View>
                      <View>
                        <Text style={[styles.groupTitle, { color: theme.text }]}>{locName}</Text>
                        <Text style={{ color: theme.textSecondary, marginTop: 4 }}>
                          {groupedBottles[locName].length} bottle(s) available
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.selectBtn, { backgroundColor: theme.primary }]}>
                      <Text style={styles.selectBtnText}>Select</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              ))
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: "80%",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
  },
  wineCard: {
    marginHorizontal: 24,
    marginBottom: 8,
    marginTop: 4,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  wineCardName: {
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 4,
  },
  wineCardMeta: {
    fontSize: 13,
    fontWeight: "500",
  },
  closeButton: {
    padding: 4,
  },
  scrollArea: {
    padding: 24,
  },
  emptyState: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
  },
  groupContainer: {
    marginBottom: 24,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  bottleList: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
  },
  bottleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
  },
  bottleInfo: {
    flex: 1,
  },
  bottleLabel: {
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  bottleId: {
    fontSize: 15,
    fontWeight: "600",
    fontFamily: "monospace",
  },
  selectBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  selectBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
