import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { Delivery } from "@/types";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  PackageCheck,
  Search,
  Truck,
  XCircle,
} from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function DeliveriesIndex() {
  const router = useRouter();
  const { profile } = useAuth();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchDeliveries = useCallback(async () => {
    if (!profile?.locationId) return;

    try {
      const data = await apiFetch(`/deliveries?storeId=${profile.locationId}`);
      const deliveries: Delivery[] = data.deliveries || data;
      // Sort by createdAt desc
      deliveries.sort((a: any, b: any) => {
        const aTime = a.createdAt?._seconds ?? new Date(a.createdAt).getTime() / 1000;
        const bTime = b.createdAt?._seconds ?? new Date(b.createdAt).getTime() / 1000;
        return bTime - aTime;
      });
      setDeliveries(deliveries);
    } catch (error) {
      console.error("Error fetching deliveries:", error);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      fetchDeliveries();
    }, [fetchDeliveries]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDeliveries();
    setRefreshing(false);
  };

  const filteredDeliveries = deliveries.filter(
    (d) =>
      d.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.items.some((i) => i.wineName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const getStatusConfig = (status: Delivery["status"]) => {
    switch (status) {
      case "dispatched":
        return {
          color: "#3b82f6",
          bg: "#eff6ff",
          label: "Dispatched",
          icon: Clock,
        };
      case "receiving":
        return {
          color: "#f59e0b",
          bg: "#fffbeb",
          label: "Receiving",
          icon: PackageCheck,
        };
      case "ingress_complete":
        return {
          color: "#10b981",
          bg: "#ecfdf5",
          label: "Complete",
          icon: CheckCircle2,
        };
      case "cancelled":
        return {
          color: "#ef4444",
          bg: "#fef2f2",
          label: "Cancelled",
          icon: XCircle,
        };
      default:
        return {
          color: "#64748b",
          bg: "#f8fafc",
          label: "Unknown",
          icon: Truck,
        };
    }
  };

  const theme = profile?.role === "store" ? Colors.store : Colors.warehouse;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: theme.card, borderBottomColor: theme.border },
        ]}
      >
        <View style={styles.headerTop}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <ArrowLeft size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            Deliveries
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <View
          style={[
            styles.searchContainer,
            { backgroundColor: theme.background, borderColor: theme.border },
          ]}
        >
          <Search size={20} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search deliveries or wines..."
            placeholderTextColor={theme.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* List */}
      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.primary]}
            tintColor={theme.primary}
          />
        }
      >
        {loading ? (
          <ActivityIndicator
            size="large"
            color={theme.primary}
            style={{ marginTop: 40 }}
          />
        ) : filteredDeliveries.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: theme.card }]}>
              <Truck size={32} color={theme.textSecondary} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              No Deliveries
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
              {searchQuery
                ? "No deliveries match your search query."
                : "You don't have any deliveries yet."}
            </Text>
          </View>
        ) : (
          filteredDeliveries.map((delivery) => {
            const status = getStatusConfig(delivery.status);
            const StatusIcon = status.icon;

            return (
              <TouchableOpacity
                key={delivery.id}
                style={[
                  styles.card,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
                onPress={() =>
                  router.push({
                    pathname: "/deliveries/[id]",
                    params: { id: delivery.id },
                  })
                }
              >
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={[styles.cardId, { color: theme.text }]}>
                      DEL-{delivery.id.slice(0, 6).toUpperCase()}
                    </Text>
                    <Text
                      style={[
                        styles.cardDate,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {delivery.createdAt.toDate().toLocaleDateString()}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: status.bg },
                    ]}
                  >
                    <StatusIcon size={14} color={status.color} />
                    <Text style={[styles.statusText, { color: status.color }]}>
                      {status.label}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardFooter}>
                  <View style={styles.statItem}>
                    <Text style={[styles.statValue, { color: theme.text }]}>
                      {delivery.totalBottles}
                    </Text>
                    <Text
                      style={[
                        styles.statLabel,
                        { color: theme.textSecondary },
                      ]}
                    >
                      Total Bottles
                    </Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={[styles.statValue, { color: theme.text }]}>
                      {delivery.items.length}
                    </Text>
                    <Text
                      style={[
                        styles.statLabel,
                        { color: theme.textSecondary },
                      ]}
                    >
                      Unique Wines
                    </Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text
                      style={[
                        styles.statValue,
                        {
                          color:
                            delivery.status === "ingress_complete"
                              ? "#10b981"
                              : theme.primary,
                        },
                      ]}
                    >
                      {delivery.items.reduce((s, i) => s + i.ingressedQty, 0)}
                    </Text>
                    <Text
                      style={[
                        styles.statLabel,
                        { color: theme.textSecondary },
                      ]}
                    >
                      Ingressed
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    gap: 16,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
  },
  listContent: {
    padding: 20,
    gap: 16,
  },
  card: {
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  cardId: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 4,
  },
  cardDate: {
    fontSize: 13,
    fontWeight: "500",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    maxWidth: "80%",
  },
});
