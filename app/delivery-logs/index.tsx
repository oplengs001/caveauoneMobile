import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { getStores } from "@/lib/queries";
import { Delivery, Store, WineRequest } from "@/types";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Layers,
  MapPin,
  Package,
  PackageCheck,
  QrCode,
  RefreshCw,
  Search,
  Truck,
  User,
  Wine,
  X,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export interface IntakeWineItem {
  masterWineId: string;
  wineName: string;
  vintage?: string;
  producer?: string;
  format?: string;
  sku?: string;
  wineCategory?: "fun" | "fine" | "reserve" | "standard";
  expectedQty: number;
  confirmedQty: number;
  bottleIds?: string[];
  confirmedAt?: string;
}

export interface IntakeLogRecord {
  id: string;
  type: "direct_delivery" | "transfer";
  referenceCode: string;
  rawId: string;
  originName: string;
  storeId: string;
  status: "ingress_complete" | "receiving" | "dispatched" | "cancelled" | "outbound";
  totalBottlesExpected: number;
  totalBottlesConfirmed: number;
  createdAt: Date;
  confirmedAt: Date;
  confirmedBy?: string;
  notes?: string;
  wines: IntakeWineItem[];
}

export default function DeliveryLogsScreen() {
  const router = useRouter();
  const { profile } = useAuth();

  const [records, setRecords] = useState<IntakeLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [periodFilter, setPeriodFilter] = useState<"today" | "week" | "month" | "all">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "direct" | "transfer">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "receiving">("all");

  // Expanded items state (set of record IDs)
  const [expandedRecordIds, setExpandedRecordIds] = useState<Set<string>>(new Set());
  // Expanded bottle IDs per wine item: `${recordId}_${wineIndex}`
  const [expandedBottleKey, setExpandedBottleKey] = useState<string | null>(null);

  const theme = Colors.store;

  const fetchIntakeLogs = useCallback(async () => {
    const storeId = profile?.locationId;
    if (!storeId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const [deliveriesData, requestsData, storesData] = await Promise.all([
        apiFetch(`/deliveries?storeId=${storeId}`).catch((err) => {
          console.warn("Failed to fetch deliveries:", err);
          return [];
        }),
        apiFetch(`/wine-requests?storeId=${storeId}`).catch((err) => {
          console.warn("Failed to fetch wine-requests:", err);
          return [];
        }),
        getStores().catch(() => []),
      ]);

      const rawDeliveries: Delivery[] = Array.isArray(deliveriesData)
        ? deliveriesData
        : deliveriesData?.deliveries || [];

      const rawRequests: WineRequest[] = Array.isArray(requestsData)
        ? requestsData
        : requestsData?.wineRequests || [];

      const storesList: Store[] = storesData || [];
      const storeMap: Record<string, string> = {};
      storesList.forEach((s) => {
        storeMap[s.id] = s.name;
      });

      const unified: IntakeLogRecord[] = [];

      // 1. Process Direct Deliveries
      rawDeliveries.forEach((del: any) => {
        const rawItems = Array.isArray(del.items) ? del.items : [];
        let totalExpected = 0;
        let totalConfirmed = 0;

        const parsedWines: IntakeWineItem[] = rawItems.map((item: any) => {
          const expected = Number(item.qty || 0);
          const confirmed = Number(item.ingressedQty || 0);
          totalExpected += expected;
          totalConfirmed += confirmed;

          const rawCat = (item.wineCategory || "standard").toLowerCase();
          const cat = rawCat === "fast" ? "fun" : rawCat;

          return {
            masterWineId: item.masterWineId || "",
            wineName: item.wineName || "Unknown Wine",
            vintage: item.vintage || "",
            producer: item.producer || "",
            format: item.format || "75cl",
            sku: item.sku || "",
            wineCategory: ["fun", "fine", "reserve", "standard"].includes(cat)
              ? (cat as any)
              : "standard",
            expectedQty: expected,
            confirmedQty: confirmed,
            bottleIds: Array.isArray(item.bottleIds) ? item.bottleIds : [],
            confirmedAt: item.confirmedAt || del.confirmedAt,
          };
        });

        // Use totalBottles if provided and expected items count was 0
        if (totalExpected === 0 && del.totalBottles) {
          totalExpected = Number(del.totalBottles);
        }

        const createdAt = del.createdAt ? new Date(del.createdAt) : new Date();
        const confirmedAt = del.confirmedAt
          ? new Date(del.confirmedAt)
          : del.updatedAt
            ? new Date(del.updatedAt)
            : createdAt;

        unified.push({
          id: `del_${del.id}`,
          rawId: del.id,
          type: "direct_delivery",
          referenceCode: `DEL-${del.id.slice(0, 6).toUpperCase()}`,
          originName: "Direct Supplier / Admin",
          storeId: del.storeId,
          status: del.status || "ingress_complete",
          totalBottlesExpected: totalExpected,
          totalBottlesConfirmed: totalConfirmed,
          createdAt,
          confirmedAt,
          confirmedBy: del.confirmedBy || del.createdBy || "Admin Delivery",
          notes: del.notes || undefined,
          wines: parsedWines,
        });
      });

      // 2. Process Store Inbound Wine Requests / Transfers
      rawRequests.forEach((req: any) => {
        // Only consider requests where this store is the destination
        if (req.storeId !== storeId) return;

        // Only include requests that have arrived or completed intake
        const st = req.status;
        if (!["ingress_complete", "receiving", "outbound"].includes(st)) {
          return;
        }

        const rawItems = Array.isArray(req.items) ? req.items : [];
        let totalExpected = 0;
        let totalConfirmed = 0;

        const parsedWines: IntakeWineItem[] = rawItems.map((item: any) => {
          const expected = Number(item.qty || item.pulledQty || 0);
          const confirmed = Number(item.ingressedQty || 0);
          totalExpected += expected;
          totalConfirmed += confirmed;

          const rawCat = (item.wineCategory || "standard").toLowerCase();
          const cat = rawCat === "fast" ? "fun" : rawCat;

          return {
            masterWineId: item.masterWineId || "",
            wineName: item.wineName || "Unknown Wine",
            vintage: item.vintage || "",
            producer: item.producer || "",
            format: item.format || "75cl",
            sku: item.sku || "",
            wineCategory: ["fun", "fine", "reserve", "standard"].includes(cat)
              ? (cat as any)
              : "standard",
            expectedQty: expected,
            confirmedQty: confirmed,
            bottleIds: Array.isArray(item.pulledBottleIds) ? item.pulledBottleIds : [],
            confirmedAt: req.confirmedAt,
          };
        });

        const targetName =
          req.targetStoreId === "warehouse"
            ? "Central Warehouse"
            : storeMap[req.targetStoreId || ""] || "Central Warehouse";

        const createdAt = req.createdAt ? new Date(req.createdAt) : new Date();
        const confirmedAt = req.confirmedAt
          ? new Date(req.confirmedAt)
          : req.updatedAt
            ? new Date(req.updatedAt)
            : createdAt;

        unified.push({
          id: `req_${req.id}`,
          rawId: req.id,
          type: "transfer",
          referenceCode: `REQ-${req.id.slice(0, 4).toUpperCase()}`,
          originName: targetName,
          storeId: req.storeId,
          status: req.status || "ingress_complete",
          totalBottlesExpected: totalExpected,
          totalBottlesConfirmed: totalConfirmed,
          createdAt,
          confirmedAt,
          confirmedBy: req.confirmedBy || req.createdBy || "Warehouse Transfer",
          notes: req.rejectionReason || undefined,
          wines: parsedWines,
        });
      });

      // Sort by confirmedAt descending (most recent first)
      unified.sort((a, b) => b.confirmedAt.getTime() - a.confirmedAt.getTime());

      setRecords(unified);
    } catch (err) {
      console.error("Failed to load intake logs:", err);
      Alert.alert("Error", "Unable to load delivery intake logs. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      fetchIntakeLogs();
    }, [fetchIntakeLogs]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchIntakeLogs();
    setRefreshing(false);
  };

  const toggleExpand = (recordId: string) => {
    setExpandedRecordIds((prev) => {
      const next = new Set(prev);
      if (next.has(recordId)) {
        next.delete(recordId);
      } else {
        next.add(recordId);
      }
      return next;
    });
  };

  // ── Date Formatting Helpers ────────────────────────────────────────────────
  const formatFullTimestamp = (date: Date) => {
    try {
      const dStr = date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const tStr = date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
      return `${dStr} · ${tStr}`;
    } catch {
      return "N/A";
    }
  };

  const formatRelativeBadge = (date: Date) => {
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      return "TODAY";
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();

    if (isYesterday) {
      return "YESTERDAY";
    }

    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 7) {
      return `${diffDays}D AGO`;
    }
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  // ── Filter & Search Logic ──────────────────────────────────────────────────
  const filteredRecords = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    return records.filter((rec) => {
      // 1. Period filter
      if (periodFilter === "today" && rec.confirmedAt < todayStart) return false;
      if (periodFilter === "week" && rec.confirmedAt < weekStart) return false;
      if (periodFilter === "month" && rec.confirmedAt < monthStart) return false;

      // 2. Type filter
      if (typeFilter === "direct" && rec.type !== "direct_delivery") return false;
      if (typeFilter === "transfer" && rec.type !== "transfer") return false;

      // 3. Status filter
      if (statusFilter === "completed" && rec.status !== "ingress_complete") return false;
      if (statusFilter === "receiving" && rec.status === "ingress_complete") return false;

      // 4. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesRef = rec.referenceCode.toLowerCase().includes(q);
        const matchesOrigin = rec.originName.toLowerCase().includes(q);
        const matchesHandler = rec.confirmedBy?.toLowerCase().includes(q) || false;
        const matchesWine = rec.wines.some(
          (w) =>
            w.wineName.toLowerCase().includes(q) ||
            w.vintage?.toLowerCase().includes(q) ||
            w.sku?.toLowerCase().includes(q) ||
            w.producer?.toLowerCase().includes(q) ||
            (w.bottleIds && w.bottleIds.some((b) => b.toLowerCase().includes(q))),
        );

        if (!matchesRef && !matchesOrigin && !matchesHandler && !matchesWine) {
          return false;
        }
      }

      return true;
    });
  }, [records, periodFilter, typeFilter, statusFilter, searchQuery]);

  // ── KPI Stats Computed from Filtered Set ────────────────────────────────────
  const stats = useMemo(() => {
    const totalIntakes = filteredRecords.length;
    let totalBottles = 0;
    const uniqueWineSkus = new Set<string>();

    filteredRecords.forEach((r) => {
      totalBottles += r.totalBottlesConfirmed;
      r.wines.forEach((w) => {
        if (w.masterWineId) uniqueWineSkus.add(w.masterWineId);
        else if (w.sku) uniqueWineSkus.add(w.sku);
        else uniqueWineSkus.add(w.wineName);
      });
    });

    const latestDate =
      filteredRecords.length > 0 ? filteredRecords[0].confirmedAt : null;

    return {
      totalIntakes,
      totalBottles,
      uniqueSkus: uniqueWineSkus.size,
      latestTimeStr: latestDate ? formatRelativeBadge(latestDate) : "—",
    };
  }, [filteredRecords]);

  const getCategoryColor = (cat?: string) => {
    switch (cat) {
      case "fun":
        return { text: "#b45309", bg: "#fef3c7", border: "#fde68a", label: "FUN" };
      case "fine":
        return { text: "#be185d", bg: "#fce7f3", border: "#fbcfe8", label: "FINE" };
      case "reserve":
        return { text: "#4338ca", bg: "#e0e7ff", border: "#c7d2fe", label: "RESERVE" };
      default:
        return { text: "#475569", bg: "#f1f5f9", border: "#e2e8f0", label: "STANDARD" };
    }
  };

  const renderIntakeCard = ({ item }: { item: IntakeLogRecord }) => {
    const isExpanded = expandedRecordIds.has(item.id);
    const isComplete = item.status === "ingress_complete";
    const statusColor = isComplete ? "#10b981" : "#f59e0b";
    const statusBg = isComplete ? "rgba(16, 185, 129, 0.12)" : "rgba(245, 158, 11, 0.12)";
    const statusBorder = isComplete ? "rgba(16, 185, 129, 0.3)" : "rgba(245, 158, 11, 0.3)";
    const statusLabel = isComplete ? "CONFIRMED" : "RECEIVING";

    const isDirect = item.type === "direct_delivery";
    const typeColor = isDirect ? "#8b5cf6" : "#3b82f6";
    const typeBg = isDirect ? "#8b5cf615" : "#3b82f615";
    const typeBorder = isDirect ? "#8b5cf635" : "#3b82f635";
    const typeLabel = isDirect ? "DIRECT DELIVERY" : "WAREHOUSE TRANSFER";

    const pct =
      item.totalBottlesExpected > 0
        ? Math.min(100, Math.round((item.totalBottlesConfirmed / item.totalBottlesExpected) * 100))
        : 100;

    return (
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {/* Card Header */}
        <View style={styles.cardHeader}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", flex: 1 }}>
            <View style={[styles.typeBadge, { backgroundColor: typeBg, borderColor: typeBorder }]}>
              {isDirect ? (
                <Truck size={12} color={typeColor} strokeWidth={2.2} />
              ) : (
                <Package size={12} color={typeColor} strokeWidth={2.2} />
              )}
              <Text style={[styles.typeBadgeText, { color: typeColor }]}>{typeLabel}</Text>
            </View>
            <View style={[styles.refBadge, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <Text style={[styles.refBadgeText, { color: theme.text }]}>{item.referenceCode}</Text>
            </View>
          </View>

          <View style={[styles.statusBadge, { backgroundColor: statusBg, borderColor: statusBorder }]}>
            {isComplete ? (
              <CheckCircle2 size={12} color={statusColor} strokeWidth={2.4} />
            ) : (
              <Clock size={12} color={statusColor} strokeWidth={2.4} />
            )}
            <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>

        {/* Timestamp & Confirmation Details Banner */}
        <View style={[styles.timestampBanner, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <View style={styles.timestampRow}>
            <Clock size={14} color="#059669" strokeWidth={2.2} />
            <Text style={[styles.timestampLabel, { color: theme.textSecondary }]}>
              Confirmed Arrival:
            </Text>
            <Text style={[styles.timestampValue, { color: theme.text }]}>
              {formatFullTimestamp(item.confirmedAt)}
            </Text>
            <View style={styles.relativeBadge}>
              <Text style={styles.relativeBadgeText}>{formatRelativeBadge(item.confirmedAt)}</Text>
            </View>
          </View>

          <View style={styles.detailsRow}>
            <View style={styles.detailItem}>
              <MapPin size={13} color="#64748b" strokeWidth={2} />
              <Text style={[styles.detailText, { color: theme.textSecondary }]} numberOfLines={1}>
                Origin: <Text style={{ color: theme.text, fontWeight: "700" }}>{item.originName}</Text>
              </Text>
            </View>
            <View style={styles.detailItem}>
              <User size={13} color="#64748b" strokeWidth={2} />
              <Text style={[styles.detailText, { color: theme.textSecondary }]} numberOfLines={1}>
                By: <Text style={{ color: theme.text, fontWeight: "700" }}>{item.confirmedBy}</Text>
              </Text>
            </View>
          </View>
        </View>

        {/* Confirmation Volume & Progress */}
        <View style={styles.volumeContainer}>
          <View style={styles.volumeHeader}>
            <Text style={[styles.volumeTitle, { color: theme.text }]}>
              Bottles Intake Progress
            </Text>
            <Text style={[styles.volumeCount, { color: isComplete ? "#059669" : theme.primary }]}>
              {item.totalBottlesConfirmed} / {item.totalBottlesExpected} confirmed ({pct}%)
            </Text>
          </View>
          <View style={[styles.progressBarTrack, { backgroundColor: theme.border }]}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${pct}%`,
                  backgroundColor: isComplete ? "#10b981" : theme.primary,
                },
              ]}
            />
          </View>
        </View>

        {/* Wine SKU List Accordion Toggle */}
        <TouchableOpacity
          style={[styles.accordionToggle, { borderTopColor: theme.border }]}
          onPress={() => toggleExpand(item.id)}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Wine size={16} color={theme.primary} strokeWidth={2.2} />
            <Text style={[styles.accordionToggleText, { color: theme.text }]}>
              {item.wines.length} Wine SKU{item.wines.length === 1 ? "" : "s"} Arrived
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={[styles.accordionSubText, { color: theme.textSecondary }]}>
              {isExpanded ? "Collapse" : "View Wines"}
            </Text>
            {isExpanded ? (
              <ChevronUp size={16} color={theme.textSecondary} />
            ) : (
              <ChevronDown size={16} color={theme.textSecondary} />
            )}
          </View>
        </TouchableOpacity>

        {/* Expanded Wines Section */}
        {isExpanded && (
          <View style={[styles.winesListContainer, { borderTopColor: theme.border }]}>
            {item.wines.map((wine, idx) => {
              const catConfig = getCategoryColor(wine.wineCategory);
              const isItemComplete = wine.confirmedQty >= wine.expectedQty;
              const bottleKey = `${item.id}_${idx}`;
              const isBottleExpanded = expandedBottleKey === bottleKey;

              return (
                <View
                  key={idx}
                  style={[
                    styles.wineItemCard,
                    {
                      backgroundColor: theme.background,
                      borderColor: theme.border,
                      marginBottom: idx === item.wines.length - 1 ? 0 : 8,
                    },
                  ]}
                >
                  <View style={styles.wineItemTop}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <Text style={[styles.wineNameText, { color: theme.text }]} numberOfLines={2}>
                          {wine.wineName}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {wine.vintage ? (
                          <View style={styles.wineVintagePill}>
                            <Text style={styles.wineVintageText}>{wine.vintage}</Text>
                          </View>
                        ) : null}
                        <View
                          style={[
                            styles.wineCatPill,
                            { backgroundColor: catConfig.bg, borderColor: catConfig.border },
                          ]}
                        >
                          <Text style={[styles.wineCatText, { color: catConfig.text }]}>
                            {catConfig.label}
                          </Text>
                        </View>
                        {wine.format ? (
                          <Text style={[styles.wineFormatText, { color: theme.textSecondary }]}>
                            {wine.format}
                          </Text>
                        ) : null}
                        {wine.sku ? (
                          <Text style={[styles.wineSkuText, { color: theme.textSecondary }]}>
                            · SKU: {wine.sku}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    {/* Confirmed Count Badge */}
                    <View
                      style={[
                        styles.wineQtyBadge,
                        {
                          backgroundColor: isItemComplete ? "#10b98118" : "#f59e0b18",
                          borderColor: isItemComplete ? "#10b98140" : "#f59e0b40",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.wineQtyBadgeText,
                          { color: isItemComplete ? "#059669" : "#d97706" },
                        ]}
                      >
                        {wine.confirmedQty} / {wine.expectedQty} btl
                      </Text>
                      <Text style={[styles.wineQtySubText, { color: isItemComplete ? "#059669" : "#d97706" }]}>
                        {isItemComplete ? "✓ Complete" : "Partial"}
                      </Text>
                    </View>
                  </View>

                  {/* Bottle IDs accordion if bottles exist */}
                  {wine.bottleIds && wine.bottleIds.length > 0 && (
                    <View style={styles.bottleSectionContainer}>
                      <TouchableOpacity
                        style={styles.bottleToggleBtn}
                        onPress={() =>
                          setExpandedBottleKey(isBottleExpanded ? null : bottleKey)
                        }
                        activeOpacity={0.7}
                      >
                        <QrCode size={13} color={theme.textSecondary} />
                        <Text style={[styles.bottleToggleText, { color: theme.textSecondary }]}>
                          {isBottleExpanded ? "Hide Bottle IDs" : `View ${wine.bottleIds.length} Bottle ID(s)`}
                        </Text>
                        {isBottleExpanded ? (
                          <ChevronUp size={13} color={theme.textSecondary} />
                        ) : (
                          <ChevronDown size={13} color={theme.textSecondary} />
                        )}
                      </TouchableOpacity>

                      {isBottleExpanded && (
                        <View style={styles.bottlePillsGrid}>
                          {wine.bottleIds.map((bid, bIdx) => (
                            <View
                              key={bIdx}
                              style={[
                                styles.bottleIdPill,
                                { backgroundColor: theme.card, borderColor: theme.border },
                              ]}
                            >
                              <CheckCircle2 size={11} color="#10b981" strokeWidth={2.4} />
                              <Text style={[styles.bottleIdText, { color: theme.text }]}>{bid}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Card Footer Deep Link */}
        <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
          <TouchableOpacity
            style={[styles.viewDetailsBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
            onPress={() => {
              if (item.type === "direct_delivery") {
                router.push({
                  pathname: "/deliveries/[id]",
                  params: { id: item.rawId },
                });
              } else {
                router.push({
                  pathname: "/wine-requests/[id]",
                  params: { id: item.rawId },
                });
              }
            }}
            activeOpacity={0.8}
          >
            <Text style={[styles.viewDetailsBtnText, { color: theme.primary }]}>
              Open Original {isDirect ? "Delivery" : "Request"}
            </Text>
            <ExternalLink size={13} color={theme.primary} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Screen Header */}
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft size={22} color={theme.text} strokeWidth={2.4} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 4 }}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>
              Delivery Intake Logs
            </Text>
            <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
              Store arrivals, confirmed wines & timestamps
            </Text>
          </View>
          <TouchableOpacity style={styles.refreshIconBtn} onPress={onRefresh}>
            <RefreshCw size={18} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Search Input */}
        <View style={[styles.searchBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <Search size={18} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search wine, vintage, SKU, DEL/REQ ID, or bottle..."
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

        {/* Period Filter Tabs */}
        <View style={styles.periodFilterRow}>
          {(
            [
              { key: "all", label: "All Time" },
              { key: "today", label: "Today" },
              { key: "week", label: "This Week" },
              { key: "month", label: "This Month" },
            ] as const
          ).map((tab) => {
            const active = periodFilter === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.periodTab,
                  active && { backgroundColor: theme.primary, borderColor: theme.primary },
                ]}
                onPress={() => setPeriodFilter(tab.key)}
              >
                <Text
                  style={[
                    styles.periodTabText,
                    { color: active ? "#ffffff" : theme.textSecondary },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Main List */}
      <FlatList
        data={filteredRecords}
        keyExtractor={(item) => item.id}
        renderItem={renderIntakeCard}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.primary]}
            tintColor={theme.primary}
          />
        }
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            {/* KPI Statistics Bar */}
            <View style={styles.kpiRow}>
              <View style={[styles.kpiCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <PackageCheck size={18} color={theme.primary} strokeWidth={2.4} />
                <Text style={[styles.kpiValue, { color: theme.text }]}>{stats.totalIntakes}</Text>
                <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Intakes</Text>
              </View>

              <View style={[styles.kpiCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Wine size={18} color="#059669" strokeWidth={2.4} />
                <Text style={[styles.kpiValue, { color: theme.text }]}>{stats.totalBottles}</Text>
                <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Bottles Confirmed</Text>
              </View>

              <View style={[styles.kpiCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Layers size={18} color="#8b5cf6" strokeWidth={2.4} />
                <Text style={[styles.kpiValue, { color: theme.text }]}>{stats.uniqueSkus}</Text>
                <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Wine SKUs</Text>
              </View>
            </View>

            {/* Sub-Filters: Type & Status */}
            <View style={styles.subFiltersContainer}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                <Text style={[styles.subFilterHeading, { color: theme.textSecondary }]}>TYPE:</Text>
                <TouchableOpacity
                  style={[
                    styles.subFilterPill,
                    typeFilter === "all" && styles.subFilterPillActive,
                  ]}
                  onPress={() => setTypeFilter("all")}
                >
                  <Text style={[styles.subFilterText, typeFilter === "all" && styles.subFilterTextActive]}>
                    All
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.subFilterPill,
                    typeFilter === "direct" && styles.subFilterPillActive,
                  ]}
                  onPress={() => setTypeFilter("direct")}
                >
                  <Text style={[styles.subFilterText, typeFilter === "direct" && styles.subFilterTextActive]}>
                    Direct Deliveries
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.subFilterPill,
                    typeFilter === "transfer" && styles.subFilterPillActive,
                  ]}
                  onPress={() => setTypeFilter("transfer")}
                >
                  <Text style={[styles.subFilterText, typeFilter === "transfer" && styles.subFilterTextActive]}>
                    Transfers
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <Text style={[styles.subFilterHeading, { color: theme.textSecondary }]}>STATUS:</Text>
                <TouchableOpacity
                  style={[
                    styles.subFilterPill,
                    statusFilter === "all" && styles.subFilterPillActive,
                  ]}
                  onPress={() => setStatusFilter("all")}
                >
                  <Text style={[styles.subFilterText, statusFilter === "all" && styles.subFilterTextActive]}>
                    All
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.subFilterPill,
                    statusFilter === "completed" && styles.subFilterPillActive,
                  ]}
                  onPress={() => setStatusFilter("completed")}
                >
                  <Text style={[styles.subFilterText, statusFilter === "completed" && styles.subFilterTextActive]}>
                    Confirmed (Complete)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.subFilterPill,
                    statusFilter === "receiving" && styles.subFilterPillActive,
                  ]}
                  onPress={() => setStatusFilter("receiving")}
                >
                  <Text style={[styles.subFilterText, statusFilter === "receiving" && styles.subFilterTextActive]}>
                    Receiving
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
                Loading intake history...
              </Text>
            </View>
          ) : (
            <View style={[styles.emptyContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={[styles.emptyIconCircle, { backgroundColor: theme.primary + "15" }]}>
                <PackageCheck size={36} color={theme.primary} strokeWidth={1.8} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                No Delivery Intakes Found
              </Text>
              <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
                {searchQuery
                  ? `No confirmed intake records matching "${searchQuery}".`
                  : "No delivery intake logs recorded for this time range."}
              </Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 1,
  },
  refreshIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
  },
  periodFilterRow: {
    flexDirection: "row",
    gap: 6,
  },
  periodTab: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  periodTabText: {
    fontSize: 11,
    fontWeight: "700",
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  kpiCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: "900",
    marginTop: 4,
  },
  kpiLabel: {
    fontSize: 9.5,
    fontWeight: "700",
    textTransform: "uppercase",
    marginTop: 1,
    textAlign: "center",
  },
  subFiltersContainer: {
    paddingVertical: 4,
  },
  subFilterHeading: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  subFilterPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
  },
  subFilterPillActive: {
    backgroundColor: Colors.store.primary,
  },
  subFilterText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#64748b",
  },
  subFilterTextActive: {
    color: "#ffffff",
  },
  card: {
    borderRadius: 16,
    borderWidth: 1.2,
    marginBottom: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    paddingBottom: 10,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  typeBadgeText: {
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  refBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  refBadgeText: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  timestampBanner: {
    marginHorizontal: 14,
    marginBottom: 12,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  timestampRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
    flexWrap: "wrap",
  },
  timestampLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  timestampValue: {
    fontSize: 12,
    fontWeight: "800",
  },
  relativeBadge: {
    backgroundColor: "#10b98120",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 2,
  },
  relativeBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#059669",
  },
  detailsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flex: 1,
  },
  detailText: {
    fontSize: 11,
    fontWeight: "500",
  },
  volumeContainer: {
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  volumeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  volumeTitle: {
    fontSize: 11.5,
    fontWeight: "700",
  },
  volumeCount: {
    fontSize: 11.5,
    fontWeight: "900",
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  accordionToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  accordionToggleText: {
    fontSize: 12.5,
    fontWeight: "800",
  },
  accordionSubText: {
    fontSize: 11,
    fontWeight: "600",
  },
  winesListContainer: {
    padding: 12,
    borderTopWidth: 1,
    gap: 8,
  },
  wineItemCard: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  wineItemTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  wineNameText: {
    fontSize: 12.5,
    fontWeight: "800",
  },
  wineVintagePill: {
    backgroundColor: "#e2e8f0",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  wineVintageText: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#334155",
  },
  wineCatPill: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  wineCatText: {
    fontSize: 9,
    fontWeight: "900",
  },
  wineFormatText: {
    fontSize: 10.5,
    fontWeight: "600",
  },
  wineSkuText: {
    fontSize: 10.5,
    fontWeight: "600",
  },
  wineQtyBadge: {
    alignItems: "flex-end",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  wineQtyBadgeText: {
    fontSize: 11.5,
    fontWeight: "900",
  },
  wineQtySubText: {
    fontSize: 9,
    fontWeight: "700",
    marginTop: 1,
  },
  bottleSectionContainer: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f080",
    paddingTop: 6,
  },
  bottleToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  bottleToggleText: {
    fontSize: 10.5,
    fontWeight: "700",
  },
  bottlePillsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  bottleIdPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  bottleIdText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  viewDetailsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  viewDetailsBtnText: {
    fontSize: 11,
    fontWeight: "800",
  },
  centerLoading: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 10,
  },
  loadingText: {
    fontSize: 12,
    fontWeight: "600",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "900",
  },
  emptySubtitle: {
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
    paddingHorizontal: 16,
  },
});
