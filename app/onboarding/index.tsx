import { apiFetch } from "@/lib/api";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import {
  ArrowRight,
  ChevronLeft,
  FileDown,
  Package,
} from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { OnboardingTask } from "../../types";

export default function OnboardingTasksScreen() {
  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<
    "incoming" | "active" | "completed"
  >("incoming");
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      const statusMap = {
        incoming: "warehouse",
        active: "warehouse",
        completed: "completed",
      };

      apiFetch(`/onboarding?status=${statusMap[selectedTab]}`)
        .then((data) => {
          const all: OnboardingTask[] = data.onboardingTasks || data;
          if (selectedTab === "incoming") {
            setTasks(all.filter((t) => t.items.every((i) => i.onboardedQty === 0)));
          } else if (selectedTab === "active") {
            setTasks(
              all.filter(
                (t) =>
                  t.items.some((i) => i.onboardedQty > 0) &&
                  t.items.some((i) => i.onboardedQty < i.qty),
              ),
            );
          } else {
            setTasks(all);
          }
        })
        .catch((err) => console.error("Failed to load onboarding tasks:", err))
        .finally(() => setLoading(false));
    }, [selectedTab])
  );

  const renderItem = ({ item }: { item: OnboardingTask }) => {
    const totalQty = item.items.reduce((sum, i) => sum + i.qty, 0);
    const totalOnboarded = item.items.reduce(
      (sum, i) => sum + i.onboardedQty,
      0,
    );
    const progress = totalQty > 0 ? (totalOnboarded / totalQty) * 100 : 0;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/onboarding/${item.id}`)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.idContainer}>
            <FileDown size={14} color="#64748b" />
            <Text style={styles.requestId}>
              ONB: {item.id.slice(0, 8).toUpperCase()}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor:
                  item.status === "completed" ? "#10b981" : "#4f46e5",
              },
            ]}
          >
            <Text style={styles.statusText}>
              {item.status.replace("_", " ").toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Intake Progress</Text>
            <Text style={styles.progressValue}>
              {totalOnboarded} / {totalQty} bottles
            </Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
          </View>
        </View>

        <View style={styles.itemsSummary}>
          <Text style={styles.summaryTitle}>Shipment Overview</Text>
          <View style={styles.summaryList}>
            {item.items.slice(0, 3).map((i, index) => (
              <View key={index} style={styles.summaryItemRow}>
                <View style={styles.summaryItemDot} />
                <View style={styles.summaryItemContent}>
                  <Text style={styles.summaryItemName} numberOfLines={1}>
                    {i.wineName}
                  </Text>
                  <Text style={styles.summaryItemMeta} numberOfLines={1}>
                    {i.producerName || "Unknown Producer"} •{" "}
                    {i.format || "Standard"}
                  </Text>
                </View>
                <View style={styles.summaryItemQtyBadge}>
                  <Text style={styles.summaryItemQtyText}>{i.qty}</Text>
                </View>
              </View>
            ))}
          </View>
          {item.items.length > 3 && (
            <Text style={styles.summaryMore}>
              + {item.items.length - 3} more wines in this shipment
            </Text>
          )}
        </View>

        <View style={styles.cardFooter}>
          <View
            style={[
              styles.actionButton,
              {
                backgroundColor:
                  item.status === "completed" ? "#10b981" : "#4f46e5",
              },
            ]}
          >
            <Text style={styles.actionButtonText}>
              {item.status === "completed" ? "View Details" : "Continue Intake"}
            </Text>
            <ArrowRight size={18} color="#fff" strokeWidth={3} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderTab = (tab: typeof selectedTab, label: string) => {
    const isActive = selectedTab === tab;
    return (
      <TouchableOpacity
        style={[styles.tab, isActive && styles.activeTab]}
        onPress={() => setSelectedTab(tab)}
      >
        <Text style={[styles.tabText, isActive && styles.activeTabText]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.dismissTo("/home")}
          style={styles.backButton}
        >
          <ChevronLeft size={28} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Onboarding</Text>
          <View style={styles.badgeCount}>
            <Text style={styles.badgeCountText}>{tasks.length}</Text>
          </View>
        </View>
      </View>

      <View style={styles.tabBar}>
        {renderTab("incoming", "Incoming")}
        {renderTab("active", "Active")}
        {renderTab("completed", "Done")}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4f46e5" />
          <Text style={styles.loadingText}>Loading tasks...</Text>
        </View>
      ) : (
        <FlatList
          data={tasks}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Package size={64} color="#334155" strokeWidth={1} />
              <Text style={styles.emptyText}>
                No {selectedTab} tasks found.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 24,
    paddingBottom: 20,
  },
  backButton: {
    marginRight: 12,
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: -0.5,
  },
  badgeCount: {
    backgroundColor: "#334155",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeCountText: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "900",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "#64748b",
    marginTop: 16,
    fontWeight: "600",
  },
  listContent: {
    padding: 24,
    paddingTop: 12,
    paddingBottom: 40,
    gap: 20,
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 24,
    marginBottom: 16,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
  },
  activeTab: {
    backgroundColor: "#4f46e5",
    borderColor: "#4f46e5",
  },
  tabText: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  activeTabText: {
    color: "#fff",
  },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: "#334155",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  idContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  requestId: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "900",
  },
  progressSection: {
    marginBottom: 24,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  progressLabel: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "700",
  },
  progressValue: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  progressBarBg: {
    height: 10,
    backgroundColor: "#0f172a",
    borderRadius: 5,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#4f46e5",
    borderRadius: 5,
  },
  itemsSummary: {
    backgroundColor: "#0f172a",
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
  },
  summaryTitle: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  summaryList: {
    gap: 12,
  },
  summaryItemRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  summaryItemDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#4f46e5",
    marginRight: 10,
  },
  summaryItemContent: {
    flex: 1,
  },
  summaryItemName: {
    color: "#f1f5f9",
    fontSize: 14,
    fontWeight: "700",
  },
  summaryItemMeta: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  summaryItemQtyBadge: {
    backgroundColor: "rgba(79, 70, 229, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 8,
  },
  summaryItemQtyText: {
    color: "#818cf8",
    fontSize: 12,
    fontWeight: "900",
  },
  summaryMore: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },
  cardFooter: {
    alignItems: "center",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 16,
    width: "100%",
    gap: 10,
  },
  actionButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 80,
    gap: 16,
  },
  emptyText: {
    color: "#475569",
    fontSize: 16,
    fontWeight: "700",
  },
});
