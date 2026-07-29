import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { WineRequest } from "@/types";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import {
  ArrowRight,
  Ban,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Layers,
  Package,
  Plus,
  Truck,
} from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from "react-native";

const PAGE_SIZE = 10;

// Added icons to the filter definitions
const FILTER_TAGS = [
  { id: "all", label: "All Requests", icon: Layers },
  { id: "pending", label: "Pending", icon: Clock },
  { id: "converted", label: "Pulling Out", icon: Package },
  { id: "outbound", label: "Outbound", icon: Truck },
  { id: "ingress_complete", label: "Received", icon: CheckCircle2 },
  { id: "rejected", label: "Rejected", icon: Ban },
];

export default function WineRequestsIndex() {
  const router = useRouter();
  const { profile } = useAuth();
  const theme = Colors.store;

  const [requests, setRequests] = useState<WineRequest[]>([]);
  const [locations, setLocations] = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState("all");

  // Loading States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRequests = async () => {
    if (!profile?.email) return;
    setLoading(true);

    try {
      const params = new URLSearchParams({ createdBy: profile.email });
      if (activeFilter !== "all") params.set("status", activeFilter);
      const [reqData, storesData] = await Promise.all([
        apiFetch(`/wine-requests?${params}`),
        apiFetch("/stores"),
      ]);

      const locMap: Record<string, string> = {};
      const stores: any[] = storesData.stores || storesData;
      stores.forEach((s: any) => (locMap[s.id] = s.name));
      setLocations(locMap);

      setRequests((reqData.wineRequests || reqData) as WineRequest[]);
    } catch (error) {
      console.error("Error fetching requests:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchRequests();
    }, [profile?.email, activeFilter]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchRequests();
  };

  const handleFilterChange = (filterId: string) => {
    if (filterId === activeFilter) return;
    setActiveFilter(filterId);
    setRequests([]);
  };

  const handleCancelRequest = (requestId: string) => {
    Alert.alert(
      "Cancel Request",
      "Are you sure you want to cancel this pending request?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true);
              await apiFetch(`/wine-requests/${requestId}`, {
                method: "PATCH",
                body: JSON.stringify({
                  status: "rejected",
                  rejectionReason: "Cancelled by user",
                }),
              });

              Alert.alert("Success", "Request has been cancelled.");
              fetchRequests();
            } catch (error) {
              console.error("Error cancelling request:", error);
              Alert.alert("Error", "Failed to cancel request.");
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "pending":
        return {
          color: "#f59e0b",
          bg: "#f59e0b15",
          icon: Clock,
          label: "PENDING",
        };
      case "converted":
        return {
          color: "#eab308",
          bg: "#eab30815",
          icon: Truck,
          label: "PULLING OUT",
        };
      case "outbound":
        return {
          color: "#3b82f6",
          bg: "#3b82f615",
          icon: Truck,
          label: "OUTBOUND",
        };
      case "ingress_complete":
        return {
          color: "#059669",
          bg: "#a7f3d0",
          icon: CheckCircle2,
          label: "RECEIVED",
        };
      case "rejected":
        return {
          color: "#ef4444",
          bg: "#ef444415",
          icon: Ban,
          label: "REJECTED",
        };
      default:
        return {
          color: "#64748b",
          bg: "#64748b15",
          icon: Clock,
          label: status.toUpperCase(),
        };
    }
  };

  const renderItem = ({ item }: { item: WineRequest }) => {
    const status = getStatusStyle(item.status);
    const StatusIcon = status.icon;
    const targetStoreName =
      item.targetStoreId === "warehouse"
        ? "Central Warehouse"
        : locations[item.targetStoreId || ""] || "Unknown";

    return (
      <View
        style={[
          styles.card,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        <TouchableOpacity
          onPress={() =>
            router.push({
              pathname: "/wine-requests/[id]",
              params: { id: item.id },
            })
          }
          activeOpacity={0.7}
        >
          <View style={styles.cardHeader}>
            <View style={styles.dateRow}>
              <Calendar size={14} color={theme.textSecondary} />
              <Text style={[styles.dateText, { color: theme.textSecondary }]}>
                {item.createdAt.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
              <StatusIcon size={12} color={status.color} strokeWidth={2.5} />
              <Text style={[styles.statusText, { color: status.color }]}>
                {status.label}
              </Text>
            </View>
          </View>

          <View style={styles.itemsContainer}>
            {item.items.map((wine, idx) => (
              <View key={idx} style={styles.wineRow}>
                <View
                  style={[
                    styles.qtyBadge,
                    { backgroundColor: theme.primary + "10" },
                  ]}
                >
                  <Text style={[styles.qtyText, { color: theme.primary }]}>
                    {wine.qty}x
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.wineName, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {wine.wineName}
                  </Text>
                  <Text style={[styles.wineMeta, { color: theme.textSecondary }]}>
                    {wine.vintage}
                    {wine.format && ` • ${wine.format}`}
                  </Text>
                </View>
              </View>
            ))}
          </View>
          <View style={styles.targetStoreContainer}>
            <Truck size={14} color={theme.textSecondary} />
            <Text
              style={[styles.targetStoreText, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              {" "}
              Requesting from:{" "}
              <Text style={{ fontWeight: "800", color: theme.text }}>
                {targetStoreName}
              </Text>
            </Text>
          </View>
        </TouchableOpacity>

        <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
          <Text style={[styles.idText, { color: theme.textSecondary }]}>
            REQ: {item.id.slice(0, 8).toUpperCase()}
          </Text>
          <View style={styles.footerActions}>
            {item.status === "pending" && (
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => handleCancelRequest(item.id)}
              >
                <Ban size={12} color="#ef4444" strokeWidth={2.5} />
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.viewDetails}
              onPress={() =>
                router.push({
                  pathname: "/wine-requests/[id]",
                  params: { id: item.id },
                })
              }
            >
              <Text style={[styles.detailsLabel, { color: theme.primary }]}>
                Details
              </Text>
              <ArrowRight size={14} color={theme.primary} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const renderFooter = () => null;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <Stack.Screen
        options={{ headerShown: false, animation: "slide_from_left" }}
      />

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <ChevronLeft size={28} color={theme.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.primary }]}>
            Wine Requests
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Sommelier Requisitions
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: theme.primary }]}
          onPress={() => router.push("/wine-requests/create")}
        >
          <Plus size={24} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      <View style={styles.filterContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
        >
          {FILTER_TAGS.map((tag) => {
            const isActive = activeFilter === tag.id;
            const Icon = tag.icon;
            return (
              <TouchableOpacity
                key={tag.id}
                onPress={() => handleFilterChange(tag.id)}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: isActive ? theme.primary : theme.card,
                    borderColor: isActive ? theme.primary : theme.border,
                  },
                ]}
              >
                <Icon
                  size={14}
                  color={isActive ? "#fff" : theme.textSecondary}
                  strokeWidth={2.5}
                />
                <Text
                  style={[
                    styles.filterText,
                    { color: isActive ? "#fff" : theme.textSecondary },
                  ]}
                >
                  {tag.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListFooterComponent={renderFooter}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Package size={64} color={theme.border} strokeWidth={1} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No{" "}
                {activeFilter !== "all" ? activeFilter.replace("_", " ") : ""}{" "}
                requests found
              </Text>
              <TouchableOpacity
                style={[styles.emptyBtn, { borderColor: theme.primary }]}
                onPress={() => {
                  if (activeFilter !== "all") {
                    handleFilterChange("all");
                  } else {
                    router.push("/wine-requests/create");
                  }
                }}
              >
                <Text style={[styles.emptyBtnText, { color: theme.primary }]}>
                  {activeFilter !== "all"
                    ? "Clear Filters"
                    : "Create First Request"}
                </Text>
              </TouchableOpacity>
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
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 24,
    paddingTop: 8,
    gap: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  filterContainer: {
    marginBottom: 16,
  },
  filterScrollContent: {
    paddingHorizontal: 24,
    gap: 8,
  },
  filterPill: {
    flexDirection: "row", // Aligns icon and text horizontally
    alignItems: "center", // Centers them vertically
    gap: 6, // Adds spacing between icon and text
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterText: {
    fontSize: 13,
    fontWeight: "700",
  },
  listContent: {
    padding: 24,
    paddingTop: 0,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dateText: {
    fontSize: 12,
    fontWeight: "700",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  targetStoreContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    borderRadius: 12,
  },
  targetStoreText: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  itemsContainer: {
    gap: 10,
    marginBottom: 20,
    marginTop: 16,
  },
  wineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  qtyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  qtyText: {
    fontSize: 12,
    fontWeight: "900",
  },
  wineName: {
    fontSize: 14,
    fontWeight: "700",
  },
  wineMeta: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 16,
    borderTopWidth: 1,
  },
  idText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  viewDetails: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  detailsLabel: {
    fontSize: 12,
    fontWeight: "800",
  },
  footerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  cancelButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#ef444415",
  },
  cancelButtonText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#ef4444",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 100,
    gap: 20,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  emptyBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  emptyBtnText: {
    fontWeight: "800",
    fontSize: 14,
  },
});
