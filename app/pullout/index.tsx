import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import {
  ArrowRight,
  ChevronLeft,
  ClipboardList,
  Truck,
} from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { PulloutRequest } from "../../types";

const PAGE_SIZE = 10;

export default function PulloutRequestsScreen() {
  const [requests, setRequests] = useState<PulloutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<
    "pending" | "in_progress" | "completed"
  >("pending");
  const [refreshing, setRefreshing] = useState(false);
  const { profile } = useAuth();
  const router = useRouter();

  const fetchRequests = async (
    status: string = selectedTab,
    isRefresh = false,
  ) => {
    if (!profile) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const sourceIds = ["warehouse"];
      if (profile.locationId) sourceIds.push(profile.locationId);

      const params = new URLSearchParams({
        status,
        sourceStoreId: sourceIds.join(","),
      });
      const data = await apiFetch(`/pullout-requests?${params}`);
      setRequests((data.pulloutRequests || data) as PulloutRequest[]);
    } catch (error) {
      console.error("Error fetching pullout requests:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (profile) fetchRequests(selectedTab, true);
    }, [selectedTab, profile]),
  );

  const onRefresh = useCallback(() => {
    fetchRequests(selectedTab, true);
  }, [selectedTab]);

  const renderItem = ({ item }: { item: PulloutRequest }) => {
    const totalRequested = item.items.reduce(
      (sum, i) => sum + i.requestedQty,
      0,
    );
    const totalPulled = item.items.reduce((sum, i) => sum + i.pulledQty, 0);
    const progress =
      totalRequested > 0 ? (totalPulled / totalRequested) * 100 : 0;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/pullout/${item.id}`)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.idContainer}>
            <ClipboardList size={14} color="#64748b" />
            <Text style={styles.requestId}>
              REQ: {item.id.slice(0, 8).toUpperCase()}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor:
                  item.status === "in_progress"
                    ? "#3b82f6"
                    : item.status === "completed"
                      ? "#10b981"
                      : "#f59e0b",
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
            <Text style={styles.progressLabel}>Task Progress</Text>
            <Text style={styles.progressValue}>
              {totalPulled} / {totalRequested} bottles
            </Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
          </View>
        </View>

        <View style={styles.itemsSummary}>
          <Text style={styles.summaryTitle}>Item List Overview</Text>
          {item.items.map((i, index) => (
            <Text key={index} style={styles.summaryItem} numberOfLines={2}>
              • {i.wineName}{" "}
              <Text style={styles.summaryQty}>({i.requestedQty})</Text>
              {"\n"}{" "}
              <Text style={{ fontSize: 11, color: "#94a3b8" }}>
                {i.vintage} • {i.producer || "Independent Producer"} •{" "}
                {i.format}
              </Text>
            </Text>
          ))}
        </View>

        <View style={styles.cardFooter}>
          <View
            style={[
              styles.actionButton,
              {
                backgroundColor:
                  item.status === "in_progress"
                    ? "#4f46e5"
                    : item.status === "completed"
                      ? "#10b981"
                      : "#f59e0b",
              },
            ]}
          >
            <Text style={styles.actionButtonText}>
              {item.status === "in_progress"
                ? "Continue Task"
                : item.status === "completed"
                  ? "View Summary"
                  : "Start Pulling"}
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
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <ChevronLeft size={28} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Pullout Tasks</Text>
          <View style={styles.badgeCount}>
            <Text style={styles.badgeCountText}>{requests.length}</Text>
          </View>
        </View>
      </View>

      <View style={styles.tabBar}>
        {renderTab("pending", "Pending")}
        {renderTab("in_progress", "Active")}
        {renderTab("completed", "Done")}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4f46e5" />
          <Text style={styles.loadingText}>Syncing tasks...</Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          onEndReached={() => fetchRequests(selectedTab, false)}
          onEndReachedThreshold={0.5}
          ListFooterComponent={() => null}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#4f46e5"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Truck size={64} color="#334155" strokeWidth={1} />
              <Text style={styles.emptyText}>
                No {selectedTab.replace("_", " ")} tasks found.
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
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
  summaryItem: {
    color: "#f1f5f9",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  summaryQty: {
    color: "#64748b",
    fontWeight: "800",
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
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
