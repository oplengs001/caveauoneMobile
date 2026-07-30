import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/utils/format";
import { WineRequest } from "@/types";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import {
  ArrowRight,
  Ban,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Clock,
  Filter,
  Layers,
  Package,
  Plus,
  Search,
  Truck,
  X,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const FILTER_TAGS = [
  { id: "all", label: "All", icon: Layers },
  { id: "pending", label: "Pending", icon: Clock },
  { id: "converted", label: "Pulling", icon: Package },
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
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

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

  const toggleExpand = (id: string) => {
    setExpandedCards((prev) => ({ ...prev, [id]: !prev[id] }));
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

  // Status Style Helper
  const getStatusStyle = (status: string, resolutionType?: string | null) => {
    if (resolutionType === "swap") {
      return {
        color: "#9333ea",
        bg: "#f3e8ff",
        icon: Package,
        label: "🔄 SWAP / REPLACED",
        step: 2,
      };
    }
    if (resolutionType === "discontinued") {
      return {
        color: "#d97706",
        bg: "#fef3c7",
        icon: Ban,
        label: "🚫 DISCONTINUED / DELAYED",
        step: 0,
      };
    }
    if (resolutionType === "stay_pending") {
      return {
        color: "#2563eb",
        bg: "#dbeafe",
        icon: Clock,
        label: "⏳ STAY PENDING (WAITING)",
        step: 1,
      };
    }
    if (resolutionType === "stockout") {
      return {
        color: "#dc2626",
        bg: "#fee2e2",
        icon: Ban,
        label: "📦 STOCKOUT",
        step: 0,
      };
    }

    switch (status) {
      case "pending":
        return {
          color: "#d97706",
          bg: "#fef3c7",
          icon: Clock,
          label: "PENDING APPROVAL",
          step: 1,
        };
      case "converted":
        return {
          color: "#ca8a04",
          bg: "#fef9c3",
          icon: Package,
          label: "PULLING OUT",
          step: 2,
        };
      case "outbound":
        return {
          color: "#2563eb",
          bg: "#dbeafe",
          icon: Truck,
          label: "OUTBOUND (IN-TRANSIT)",
          step: 3,
        };
      case "ingress_complete":
        return {
          color: "#059669",
          bg: "#d1fae5",
          icon: CheckCircle2,
          label: "RECEIVED & INVENTORIED",
          step: 4,
        };
      case "rejected":
        return {
          color: "#dc2626",
          bg: "#fee2e2",
          icon: Ban,
          label: "REJECTED",
          step: 0,
        };
      default:
        return {
          color: "#475569",
          bg: "#f1f5f9",
          icon: Clock,
          label: status.toUpperCase(),
          step: 1,
        };
    }
  };

  // Filter requests by search query
  const filteredRequests = useMemo(() => {
    if (!searchQuery.trim()) return requests;
    const q = searchQuery.toLowerCase().trim();
    return requests.filter((r) => {
      const matchId = r.id.toLowerCase().includes(q);
      const matchWine = r.items.some(
        (i) =>
          i.wineName.toLowerCase().includes(q) ||
          i.producer?.toLowerCase().includes(q) ||
          i.vintage?.toLowerCase().includes(q)
      );
      return matchId || matchWine;
    });
  }, [requests, searchQuery]);

  const renderItem = ({ item }: { item: WineRequest }) => {
    const status = getStatusStyle(item.status, item.resolutionType);
    const StatusIcon = status.icon;
    const targetStoreName =
      item.targetStoreId === "warehouse"
        ? "Central Warehouse"
        : locations[item.targetStoreId || ""] || "Target Store";

    const totalQty = item.items.reduce((sum, i) => sum + (i.qty || 0), 0);
    const isExpanded = !!expandedCards[item.id];
    const displayItems = isExpanded ? item.items : item.items.slice(0, 2);
    const hiddenCount = item.items.length - 2;

    return (
      <View
        style={[
          styles.card,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        {/* Card Header & Status */}
        <TouchableOpacity
          onPress={() =>
            router.push({
              pathname: "/wine-requests/[id]",
              params: { id: item.id },
            })
          }
          activeOpacity={0.8}
        >
          <View style={styles.cardHeader}>
            <View>
              <View style={styles.idRow}>
                <Text style={[styles.idText, { color: theme.primary }]}>
                  REQ-{item.id.slice(0, 8).toUpperCase()}
                </Text>
                <View style={styles.bottleBadge}>
                  <Package size={12} color={theme.primary} />
                  <Text style={[styles.bottleBadgeText, { color: theme.primary }]}>
                    {totalQty} {totalQty === 1 ? "Bottle" : "Bottles"}
                  </Text>
                </View>
              </View>
              <View style={styles.dateRow}>
                <Calendar size={12} color={theme.textSecondary} />
                <Text style={[styles.dateText, { color: theme.textSecondary }]}>
                  {formatDate(item.createdAt, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </Text>
              </View>
            </View>

            <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
              <StatusIcon size={12} color={status.color} strokeWidth={2.5} />
              <Text style={[styles.statusText, { color: status.color }]}>
                {status.label}
              </Text>
            </View>
          </View>

          {/* Visual Progress Stepper Tracker */}
          {item.status !== "rejected" && (
            <View style={styles.stepperContainer}>
              {[
                { step: 1, label: "Requested" },
                { step: 2, label: "Pulling" },
                { step: 3, label: "Outbound" },
                { step: 4, label: "Received" },
              ].map((s, idx) => {
                const isPassed = status.step >= s.step;
                const isCurrent = status.step === s.step;
                return (
                  <React.Fragment key={s.step}>
                    <View style={styles.stepItem}>
                      <View
                        style={[
                          styles.stepCircle,
                          isPassed && { backgroundColor: status.color },
                        ]}
                      >
                        {isPassed ? (
                          <Check size={10} color="#fff" strokeWidth={3} />
                        ) : (
                          <Text style={styles.stepNum}>{s.step}</Text>
                        )}
                      </View>
                      <Text
                        style={[
                          styles.stepLabel,
                          isPassed && { color: theme.text, fontWeight: "700" },
                          isCurrent && { color: status.color, fontWeight: "800" },
                        ]}
                      >
                        {s.label}
                      </Text>
                    </View>
                    {idx < 3 && (
                      <View
                        style={[
                          styles.stepLine,
                          status.step > s.step && { backgroundColor: status.color },
                        ]}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </View>
          )}

          {/* Location Badge */}
          <View style={styles.targetStoreContainer}>
            <Truck size={14} color={theme.textSecondary} />
            <Text
              style={[styles.targetStoreText, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              Source:{" "}
              <Text style={{ fontWeight: "800", color: theme.text }}>
                {targetStoreName}
              </Text>
            </Text>
          </View>

          {/* Resolution Note Banner */}
          {!!item.rejectionReason && (
            <View style={styles.noteBanner}>
              <Text style={styles.noteBannerTitle}>Resolution Note:</Text>
              <Text style={styles.noteBannerText}>{item.rejectionReason}</Text>
            </View>
          )}

          {/* Items List Preview */}
          <View style={styles.itemsContainer}>
            {displayItems.map((wine, idx) => (
              <View key={idx} style={styles.wineRow}>
                <View
                  style={[
                    styles.qtyBadge,
                    { backgroundColor: theme.primary + "15" },
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
                    {[wine.producer, wine.vintage, wine.format]
                      .filter(Boolean)
                      .join(" • ")}
                  </Text>
                </View>
              </View>
            ))}

            {hiddenCount > 0 && !isExpanded && (
              <TouchableOpacity
                onPress={() => toggleExpand(item.id)}
                style={styles.expandPill}
              >
                <Text style={[styles.expandText, { color: theme.primary }]}>
                  + {hiddenCount} more {hiddenCount === 1 ? "wine" : "wines"}
                </Text>
                <ChevronDown size={14} color={theme.primary} />
              </TouchableOpacity>
            )}

            {isExpanded && item.items.length > 2 && (
              <TouchableOpacity
                onPress={() => toggleExpand(item.id)}
                style={styles.expandPill}
              >
                <Text style={[styles.expandText, { color: theme.primary }]}>
                  Show less
                </Text>
                <ChevronUp size={14} color={theme.primary} />
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>

        {/* Card Footer & Action Buttons */}
        <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
          <Text style={[styles.itemCountText, { color: theme.textSecondary }]}>
            {item.items.length} {item.items.length === 1 ? "Line Item" : "Line Items"}
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

            {(item.status === "outbound" || item.status === "converted") && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#2563eb" }]}
                onPress={() =>
                  router.push({
                    pathname: "/wine-requests/[id]",
                    params: { id: item.id },
                  })
                }
              >
                <CheckCircle2 size={13} color="#fff" strokeWidth={2.5} />
                <Text style={styles.actionBtnText}>Check & Receive</Text>
              </TouchableOpacity>
            )}

            {item.status !== "outbound" && item.status !== "converted" && (
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
                  View Details
                </Text>
                <ArrowRight size={14} color={theme.primary} strokeWidth={2.5} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <Stack.Screen
        options={{ headerShown: false, animation: "slide_from_left" }}
      />

      {/* Header Bar */}
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


      {/* Search Input Bar */}
      <View style={styles.searchSection}>
        <View style={[styles.searchBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Search size={16} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search request ID, wine name, producer..."
            placeholderTextColor={theme.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <X size={16} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Horizontal Scroll */}
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
                  size={13}
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

      {/* Requests List */}
      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredRequests}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Package size={56} color={theme.border} strokeWidth={1} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                {searchQuery ? "No matching requests found" : "No requests found"}
              </Text>
              <TouchableOpacity
                style={[styles.emptyBtn, { borderColor: theme.primary }]}
                onPress={() => {
                  if (searchQuery) setSearchQuery("");
                  else if (activeFilter !== "all") handleFilterChange("all");
                  else router.push("/wine-requests/create");
                }}
              >
                <Text style={[styles.emptyBtnText, { color: theme.primary }]}>
                  {searchQuery || activeFilter !== "all" ? "Reset Filters" : "Create Requisition"}
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
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  /* KPI Summary */
  kpiContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 12,
  },
  kpiCard: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  kpiCardActive: {
    borderColor: "#6366f1",
    backgroundColor: "#eff6ff",
  },
  kpiIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0f172a",
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    marginTop: 2,
  },
  /* Search Input */
  searchSection: {
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    padding: 0,
  },
  /* Filters */
  filterContainer: {
    marginBottom: 14,
  },
  filterScrollContent: {
    paddingHorizontal: 20,
    gap: 6,
  },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
  },
  filterText: {
    fontSize: 12,
    fontWeight: "700",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  /* Request Cards */
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  idRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  idText: {
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  bottleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  bottleBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  dateText: {
    fontSize: 11,
    fontWeight: "600",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 5,
  },
  statusText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  /* Stepper Progress Bar */
  stepperContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
    padding: 10,
    borderRadius: 12,
    marginBottom: 12,
  },
  stepItem: {
    alignItems: "center",
    gap: 3,
  },
  stepCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
  },
  stepCircleActive: {
    borderWidth: 2,
    borderColor: "#6366f1",
  },
  stepNum: {
    fontSize: 9,
    fontWeight: "900",
    color: "#fff",
  },
  stepLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: "#94a3b8",
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: "#e2e8f0",
    marginHorizontal: 4,
    marginTop: -10,
  },
  /* Location */
  targetStoreContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 6,
  },
  targetStoreText: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  /* Items List */
  itemsContainer: {
    gap: 8,
    marginBottom: 12,
  },
  wineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  qtyBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  qtyText: {
    fontSize: 12,
    fontWeight: "900",
  },
  wineName: {
    fontSize: 13,
    fontWeight: "700",
  },
  wineMeta: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 1,
  },
  expandPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 4,
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    marginTop: 4,
  },
  expandText: {
    fontSize: 11,
    fontWeight: "800",
  },
  /* Card Footer */
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: 1,
  },
  itemCountText: {
    fontSize: 11,
    fontWeight: "700",
  },
  footerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cancelButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#fee2e2",
  },
  cancelButtonText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#dc2626",
    textTransform: "uppercase",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#fff",
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
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 60,
    gap: 16,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: "600",
  },
  emptyBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  emptyBtnText: {
    fontWeight: "800",
    fontSize: 13,
  },
  noteBanner: {
    backgroundColor: "#fffbebf5",
    borderColor: "#fde68a",
    borderWidth: 1,
    padding: 10,
    borderRadius: 12,
    marginBottom: 10,
  },
  noteBannerTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#b45309",
    marginBottom: 2,
  },
  noteBannerText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#78350f",
  },
});
