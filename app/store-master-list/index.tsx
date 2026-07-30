import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { MasterWine, StockStatus, StoreWineSetting } from "@/types";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertTriangle,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Lock,
  Package,
  RefreshCw,
  Search,
  Star,
  TrendingDown,
  TrendingUp,
  Truck,
  Wine,
  X,
  Zap
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const theme = Colors.store;

interface WineEntry {
  masterWine: MasterWine;
  stockCount: number;
  fullBottlesCount: number;
  openGlassesCount: number;
  setting: StoreWineSetting | null;
  status: StockStatus;
  requestedQty: number;
  activeRequest?: { id: string; status: string };
}

function computeStatus(
  stockCount: number,
  setting: StoreWineSetting | null,
  hasPendingRequest?: boolean,
): { status: StockStatus; requestedQty: number } {
  if (!setting) return { status: "unset", requestedQty: 0 };
  if (setting.discontinued) return { status: "discontinued", requestedQty: 0 };

  let status: StockStatus = "in_stock";
  let requestedQty = 0;

  if (stockCount === 0) {
    status = "stockout";
    requestedQty = setting.safetyStock;
  } else if (stockCount > setting.safetyStock) {
    status = "overstock";
  } else if (stockCount <= setting.parLevel) {
    status = "par_alert";
    requestedQty = Math.ceil(setting.safetyStock - stockCount);
  } else if (stockCount < setting.safetyStock) {
    status = "under_safety";
    requestedQty = Math.ceil(setting.safetyStock - stockCount);
  }

  if (hasPendingRequest) {
    requestedQty = 0;
  }

  return { status, requestedQty: Math.max(0, requestedQty) };
}

const STATUS_CONFIG: Record<
  StockStatus,
  { label: string; color: string; bg: string; accent: string }
> = {
  in_stock: {
    label: "Optimal",
    color: "#065f46",
    bg: "#d1fae5",
    accent: "#10b981",
  },
  stockout: {
    label: "Stockout",
    color: "#991b1b",
    bg: "#fee2e2",
    accent: "#ef4444",
  },
  overstock: {
    label: "Overstock",
    color: "#1e3a8a",
    bg: "#dbeafe",
    accent: "#3b82f6",
  },
  par_alert: {
    label: "PAR Alert",
    color: "#9a3412",
    bg: "#fff7ed",
    accent: "#f97316",
  },
  under_safety: {
    label: "Under Safety",
    color: "#854d0e",
    bg: "#fefce8",
    accent: "#eab308",
  },
  unset: { label: "Unset", color: "#475569", bg: "#e2e8f0", accent: "#94a3b8" },
  discontinued: {
    label: "Discontinued",
    color: "#475569",
    bg: "#f1f5f9",
    accent: "#94a3b8",
  },
};

export default function StoreMasterListScreen() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const storeId = profile?.locationId ?? "";

  const [entries, setEntries] = useState<WineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { filter: initialFilter } = useLocalSearchParams<{
    filter:
    | "all"
    | "under_safety"
    | "stockout"
    | "overstock"
    | "optimal"
    | "discontinued";
  }>();
  const [filter, setFilter] = useState<
    "all" | "under_safety" | "stockout" | "overstock" | "optimal" | "discontinued"
  >(initialFilter || "all");

  const [isWineFilterModalOpen, setIsWineFilterModalOpen] = useState(false);
  const [masterWinesList, setMasterWinesList] = useState<MasterWine[]>([]);
  const [selectedWineFilter, setSelectedWineFilter] =
    useState<MasterWine | null>(null);
  const [wineSearchTerm, setWineSearchTerm] = useState("");

  const [selected, setSelected] = useState<WineEntry | null>(null);
  const [sheetPar, setSheetPar] = useState("");
  const [sheetSafety, setSheetSafety] = useState("");
  const [sheetSellingPrice, setSheetSellingPrice] = useState("");
  const [sheetDiscontinued, setSheetDiscontinued] = useState(false);
  const [sheetWineCategory, setSheetWineCategory] = useState<"fast" | "fine" | "reserve" | "none">("none");
  const [sheetVatMode, setSheetVatMode] = useState<"included" | "excluded">("excluded");
  const [saving, setSaving] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [isBatchConfirmVisible, setIsBatchConfirmVisible] = useState(false);
  const [batchRequesting, setBatchRequesting] = useState(false);
  const [isSuccessVisible, setIsSuccessVisible] = useState(false);

  useEffect(() => {
    const fetchMasterWines = async () => {
      try {
        const data = await apiFetch("/wines");
        const wines: MasterWine[] = data.wines || data;
        setMasterWinesList(wines);
      } catch (err) {
        console.error("Failed to fetch master wines:", err);
      }
    };
    fetchMasterWines();
  }, []);

  const filteredMasterWines = useMemo(() => {
    const q = wineSearchTerm.toLowerCase();
    return masterWinesList
      .filter(
        (w) =>
          w.name?.toLowerCase().includes(q) ||
          w.producer?.toLowerCase().includes(q) ||
          w.sku?.toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [masterWinesList, wineSearchTerm]);

  const fetchData = useCallback(async () => {
    if (authLoading) return;
    if (!storeId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const fetchBottles = apiFetch(`/bottles?storeId=${storeId}`).catch((err) => {
        console.error("Error fetching bottles:", err);
        return [];
      });

      const fetchSettings = apiFetch(`/stock-settings?storeId=${storeId}`).catch((err) => {
        console.error("Error fetching settings:", err);
        return [];
      });

      const fetchMasterWinesDocs = apiFetch("/wines").catch((err) => {
        console.error("Error fetching master wines:", err);
        return [];
      });

      const fetchPendingRequests = apiFetch(`/wine-requests?storeId=${storeId}&status=pending,converted,outbound,receiving`).catch((err) => {
        console.error("Error fetching pending requests:", err);
        return [];
      });

      const [bottlesRes, settingsRes, masterWinesRes, pendingRequestsRes] =
        await Promise.all([
          fetchBottles,
          fetchSettings,
          fetchMasterWinesDocs,
          fetchPendingRequests,
        ]);

      const wineIdsSet = new Set<string>();
      const stockCountMap = new Map<string, number>();
      const fullBottlesMap = new Map<string, number>();
      const openGlassesMap = new Map<string, number>();
      const settingsMap = new Map<string, StoreWineSetting>();
      const masterWinesMap = new Map<string, MasterWine>();

      const bottlesList: any[] = bottlesRes.bottles || bottlesRes || [];
      const settingsList: any[] = settingsRes.settings || settingsRes || [];
      const masterWinesListRes: any[] = masterWinesRes.wines || masterWinesRes || [];
      const pendingRequestsList: any[] = pendingRequestsRes.wineRequests || pendingRequestsRes || [];

      bottlesList.forEach((data: any) => {
        const refId = data.masterWineId || data.masterWineRef?.id;
        if (refId) {
          wineIdsSet.add(refId);
          if (data.status === "received" || data.status === "shelved") {
            stockCountMap.set(refId, (stockCountMap.get(refId) || 0) + 1);
            fullBottlesMap.set(refId, (fullBottlesMap.get(refId) || 0) + 1);
          } else if (data.status === "open") {
            const glasses = data.glassesRemaining ?? 6;
            const fraction = glasses / 6;
            stockCountMap.set(refId, (stockCountMap.get(refId) || 0) + fraction);
            openGlassesMap.set(refId, (openGlassesMap.get(refId) || 0) + glasses);
          }
        }
      });

      settingsList.forEach((settingData: any) => {
        if (settingData.masterWineId) {
          settingsMap.set(settingData.masterWineId, settingData as StoreWineSetting);
          wineIdsSet.add(settingData.masterWineId);
        }
      });

      masterWinesListRes.forEach((w: any) => {
        masterWinesMap.set(w.id, w as MasterWine);
      });

      const pendingWineRequestMap = new Map<
        string,
        { id: string; status: string }
      >();
      pendingRequestsList.forEach((request: any) => {
        request.items?.forEach((item: { masterWineId: string }) => {
          if (item.masterWineId) {
            pendingWineRequestMap.set(item.masterWineId, {
              id: request.id,
              status: request.status,
            });
          }
        });
      });

      const results: WineEntry[] = Array.from(wineIdsSet).map((wineId) => {
        const masterWine: MasterWine = masterWinesMap.get(wineId) ?? {
          id: wineId,
          name: "Unknown Wine",
          vintage: "",
          price: 0,
        };
        const rawStock = stockCountMap.get(wineId) || 0;
        const stockCount = Math.round(rawStock * 100) / 100;
        const fullBottlesCount = fullBottlesMap.get(wineId) || 0;
        const openGlassesCount = openGlassesMap.get(wineId) || 0;
        const setting = settingsMap.get(wineId) ?? null;
        const activeRequest = pendingWineRequestMap.get(wineId);

        const { status, requestedQty } = computeStatus(
          stockCount,
          setting,
          !!activeRequest,
        );

        return {
          masterWine,
          stockCount,
          fullBottlesCount,
          openGlassesCount,
          setting,
          status,
          requestedQty,
          activeRequest,
        };
      });

      const order: StockStatus[] = [
        "stockout",
        "par_alert",
        "under_safety",
        "in_stock",
        "overstock",
        "unset",
        "discontinued",
      ];
      const validResults = results.filter(
        (entry) => !(entry.stockCount === 0 && entry.status === "unset")
      );
      validResults.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
      setEntries(validResults);
    } catch (err: any) {
      console.error("MasterList fetch error:", err);
      Alert.alert("Fetch Error", err?.message || String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [storeId, authLoading]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const openSheet = (entry: WineEntry) => {
    setSelected(entry);
    setSheetPar(entry.setting?.parLevel?.toString() ?? "");
    setSheetSafety(entry.setting?.safetyStock?.toString() ?? "");
    setSheetSellingPrice(entry.setting?.sellingPrice?.toString() ?? "");
    setSheetDiscontinued(entry.setting?.discontinued ?? false);

    let cat: "fast" | "fine" | "reserve" | "none" = "none";
    if (entry.setting?.wineCategory) {
      cat = entry.setting.wineCategory as "fast" | "fine" | "reserve";
    }
    setSheetWineCategory(cat);

    setSheetVatMode(entry.setting?.vatMode ?? "excluded");
  };

  const closeSheet = () => setSelected(null);

  const handleSaveSettings = async () => {
    if (!selected || !storeId) return;
    const par = parseInt(sheetPar, 10) || 0;
    const safety = parseInt(sheetSafety, 10) || 0;
    if (safety < par) {
      Alert.alert(
        "Invalid Settings",
        "Safety Stock must be greater than or equal to PAR Level.",
      );
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/stock-settings", {
        method: "POST",
        body: JSON.stringify({
          storeId,
          masterWineId: selected.masterWine.id,
          parLevel: par,
          safetyStock: safety,
          sellingPrice: sheetSellingPrice ? parseFloat(sheetSellingPrice) : null,
          discontinued: sheetDiscontinued,
          wineCategory: sheetWineCategory === "none" ? null : sheetWineCategory,
          vatMode: sheetVatMode,
        }),
      });

      await apiFetch(`/wines/${selected.masterWine.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          wineCategory: sheetWineCategory === "none" ? null : sheetWineCategory,
        }),
      });

      closeSheet();
      fetchData();
    } catch (err) {
      Alert.alert("Error", "Failed to save settings.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleRequestStock = async () => {
    if (!selected || !storeId || !profile) return;
    const qty = selected.requestedQty;
    if (qty <= 0) return;

    Alert.alert(
      "Submit Request",
      `Request ${qty} bottles of ${selected.masterWine.name}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Submit",
          onPress: async () => {
            setRequesting(true);
            try {
              await apiFetch("/wine-requests", {
                method: "POST",
                body: JSON.stringify({
                  storeId,
                  targetStoreId: "warehouse",
                  createdBy: profile.email,
                  requesterId: profile.id,
                  status: "pending",
                  items: [
                    {
                      masterWineId: selected.masterWine.id,
                      wineName: selected.masterWine.name,
                      vintage: selected.masterWine.vintage,
                      sku: selected.masterWine.sku ?? "",
                      format: selected.masterWine.format,
                      producer: selected.masterWine.producer,
                      qty,
                      price: selected.masterWine.price,
                      pulledQty: 0,
                      ingressedQty: 0,
                    },
                  ],
                  totalAmount: selected.masterWine.price * qty,
                }),
              });
              Alert.alert(
                "Submitted!",
                `Request for ${qty} bottles has been sent to the warehouse.`,
              );
              closeSheet();
              fetchData();
            } catch (err) {
              Alert.alert("Error", "Failed to submit request.");
              console.error(err);
            } finally {
              setRequesting(false);
            }
          },
        },
      ],
    );
  };

  const executeBatchRequest = async () => {
    if (!storeId || !profile) return;
    if (itemsToRequest.length === 0) return;

    setBatchRequesting(true);
    try {
      const requestItems = itemsToRequest.map((item) => ({
        masterWineId: item.masterWine.id,
        wineName: item.masterWine.name,
        vintage: item.masterWine.vintage,
        format: item.masterWine.format,
        producer: item.masterWine.producer,
        sku: item.masterWine.sku ?? "",
        qty: item.requestedQty,
        price: item.masterWine.price,
        pulledQty: 0,
        ingressedQty: 0,
      }));

      const totalAmount = requestItems.reduce(
        (sum, item) => sum + item.price * item.qty,
        0,
      );

      await apiFetch("/wine-requests", {
        method: "POST",
        body: JSON.stringify({
          storeId,
          targetStoreId: "warehouse",
          createdBy: profile.email,
          requesterId: profile.id,
          status: "pending",
          items: requestItems,
          totalAmount,
        }),
      });

      setIsBatchConfirmVisible(false);
      setIsSuccessVisible(true);
    } catch (err) {
      Alert.alert("Error", "Failed to submit batch request.");
      console.error(err);
    } finally {
      setBatchRequesting(false);
    }
  };

  const handleBatchRequest = () => {
    if (itemsToRequest.length === 0) {
      Alert.alert(
        "No Items",
        "There are no items that need replenishment in the current view.",
      );
      return;
    }
    setIsBatchConfirmVisible(true);
  };

  const filtered = entries.filter((e) => {
    if (selectedWineFilter && e.masterWine.id !== selectedWineFilter.id) {
      return false;
    }
    if (filter === "under_safety") return e.status === "under_safety";
    if (filter === "stockout") return e.status === "stockout";
    if (filter === "overstock") return e.status === "overstock";
    if (filter === "optimal") return e.status === "in_stock";
    if (filter === "discontinued") return e.status === "discontinued";
    return true;
  });

  const itemsToRequest = filtered.filter(
    (entry) => entry.requestedQty > 0 && !entry.setting?.discontinued,
  );

  const alertCount = entries.filter(
    (e) => e.status === "par_alert" || e.status === "stockout",
  ).length;

  const renderItem = ({ item }: { item: WineEntry }) => {
    const cfg = STATUS_CONFIG[item.status];
    const isConfigured = !!item.setting && !item.setting.discontinued;

    const safetyStock = item.setting?.safetyStock || 0;
    const parLevel = item.setting?.parLevel || 0;

    const fillPercentage =
      safetyStock > 0
        ? Math.min(100, (item.stockCount / safetyStock) * 100)
        : item.stockCount > 0
          ? 100
          : 0;

    const parPercentage =
      safetyStock > 0 ? Math.min(100, (parLevel / safetyStock) * 100) : 0;

    return (
      <TouchableOpacity
        style={[
          styles.card,
          {
            borderColor: item.status === "stockout" ? "#fecaca" : theme.border,
          },
        ]}
        onPress={() => openSheet(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeaderRow}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={styles.wineName} numberOfLines={2}>
              {item.masterWine.name}
            </Text>
            <Text style={styles.wineMeta}>
              {item.masterWine.vintage}
              {item.masterWine.producer ? ` · ${item.masterWine.producer}` : ""}
              {item.masterWine.format ? ` · ${item.masterWine.format}` : ""}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
              <Text style={[styles.statusText, { color: cfg.color }]}>
                {cfg.label}
              </Text>
            </View>
            {item.setting?.sellingPrice != null && (
              <Text style={styles.sellingPrice}>
                ₱
                {item.setting.sellingPrice.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                })}
              </Text>
            )}
          </View>
        </View>

        {item.setting?.wineCategory && (
          <View style={styles.tagsRow}>
            {item.setting.wineCategory === "fast" && (
              <View style={[styles.indicatorBadge, { backgroundColor: "#fef3c7" }]}>
                <Zap size={10} color="#d97706" strokeWidth={2.5} />
                <Text style={[styles.indicatorText, { color: "#d97706" }]}>Fast Wine</Text>
              </View>
            )}
            {item.setting.wineCategory === "fine" && (
              <View style={[styles.indicatorBadge, { backgroundColor: "#fce7f3" }]}>
                <Star size={10} color="#be185d" strokeWidth={2.5} />
                <Text style={[styles.indicatorText, { color: "#be185d" }]}>Fine Wine</Text>
              </View>
            )}
            {item.setting.wineCategory === "reserve" && (
              <View style={[styles.indicatorBadge, { backgroundColor: "#e0e7ff" }]}>
                <Lock size={10} color="#4338ca" strokeWidth={2.5} />
                <Text style={[styles.indicatorText, { color: "#4338ca" }]}>Reserved Wine</Text>
              </View>
            )}
          </View>
        )}

        {isConfigured ? (
          <View style={styles.barContainer}>
            <View style={styles.barStatsRow}>
              <View style={styles.stockHeaderRow}>
                <Package size={16} color={theme.textSecondary} />
                <Text style={styles.stockPrimaryValue}>
                  {item.stockCount % 1 === 0 ? item.stockCount : item.stockCount.toFixed(2)}
                </Text>
                <Text style={styles.stockPrimaryLabel}>IN STOCK</Text>
                {item.openGlassesCount > 0 && (
                  <View style={{ backgroundColor: "#3b82f615", borderColor: "#3b82f640", borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 6 }}>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: "#2563eb" }}>
                      🍷 {item.openGlassesCount}/6 glasses open
                    </Text>
                  </View>
                )}
              </View>

              {item.requestedQty > 0 && (
                <View style={styles.deficitBadge}>
                  <TrendingDown size={12} color="#ea580c" strokeWidth={2.5} />
                  <Text style={styles.deficitText}>
                    {item.requestedQty} DEFICIT
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  { width: `${fillPercentage}%`, backgroundColor: cfg.accent },
                ]}
              />
              {parLevel > 0 && parPercentage < 100 && (
                <View
                  style={[
                    styles.parMarkerContainer,
                    { left: `${parPercentage}%` },
                  ]}
                >
                  <Text style={styles.parMarkerArrow}>▼</Text>
                  <View style={styles.parMarkerLine} />
                </View>
              )}
            </View>

            <View style={styles.barLabelsRow}>
              <Text style={styles.barLabelSecondary}>
                {parLevel > 0 ? `PAR: ${parLevel}` : ""}
              </Text>
              <Text style={styles.barLabel}>SAFETY TARGET: {safetyStock}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.unconfiguredStockRow}>
            <Package size={14} color={theme.textSecondary} />
            <Text style={styles.stockPrimaryValue}>
              {item.stockCount % 1 === 0 ? item.stockCount : item.stockCount.toFixed(2)}
            </Text>
            <Text style={styles.stockPrimaryLabel}>IN STOCK (UNSET)</Text>
            {item.openGlassesCount > 0 && (
              <View style={{ backgroundColor: "#3b82f615", borderColor: "#3b82f640", borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 6 }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: "#2563eb" }}>
                  🍷 {item.openGlassesCount}/6 glasses open
                </Text>
              </View>
            )}
          </View>
        )}

        {item.activeRequest && (
          <TouchableOpacity
            style={[styles.requestedFooter, { backgroundColor: cfg.bg }]}
            onPress={(e) => {
              e.stopPropagation();
              router.push(`/wine-requests/${item.activeRequest!.id}`);
            }}
          >
            {item.activeRequest.status === "outbound" ||
              item.activeRequest.status === "converted" ? (
              <Truck size={14} color={cfg.accent} />
            ) : item.activeRequest.status === "receiving" ? (
              <CheckCircle2 size={14} color={cfg.accent} />
            ) : (
              <Clock size={14} color={cfg.accent} />
            )}
            <Text style={[styles.requestedFooterText, { color: cfg.color }]}>
              {item.activeRequest.status === "pending"
                ? "Request Pending Approval"
                : item.activeRequest.status === "converted"
                  ? "Warehouse is Pulling Out"
                  : item.activeRequest.status === "outbound"
                    ? "Stock is Outbound"
                    : item.activeRequest.status === "receiving"
                      ? "Ready to Receive"
                      : "Requested"}
            </Text>
            <ChevronRight
              size={14}
              color={cfg.color}
              style={{ marginLeft: "auto" }}
            />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={28} color={theme.primary} strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Stock Management</Text>
          <Text style={styles.subtitle}>{entries.length} wines tracked</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
          <RefreshCw size={20} color={theme.primary} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      {alertCount > 0 && (
        <View style={styles.alertBanner}>
          <AlertTriangle size={16} color="#92400e" />
          <Text style={styles.alertBannerText}>
            {alertCount} wine{alertCount > 1 ? "s" : ""} require attention
          </Text>
        </View>
      )}

      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 }}>
        <TouchableOpacity
          style={[
            styles.wineFilterBtn,
            {
              backgroundColor: selectedWineFilter
                ? theme.primary + "10"
                : theme.card,
              borderColor: selectedWineFilter ? theme.primary : theme.border,
            },
          ]}
          onPress={() => setIsWineFilterModalOpen(true)}
          activeOpacity={0.7}
        >
          <Wine
            size={16}
            color={selectedWineFilter ? theme.primary : theme.textSecondary}
          />
          <Text
            style={[
              styles.wineFilterBtnText,
              { color: selectedWineFilter ? theme.primary : theme.text },
            ]}
            numberOfLines={1}
          >
            {selectedWineFilter
              ? selectedWineFilter.name
              : "Filter specific wine..."}
          </Text>
          {selectedWineFilter ? (
            <TouchableOpacity
              onPress={() => setSelectedWineFilter(null)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={16} color={theme.primary} />
            </TouchableOpacity>
          ) : (
            <ChevronDown size={16} color={theme.textSecondary} />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {(
            [
              "all",
              "under_safety",
              "stockout",
              "overstock",
              "optimal",
              "discontinued",
            ] as const
          ).map((f) => (
            <TouchableOpacity
              key={f}
              style={[
                styles.filterChip,
                filter === f && styles.filterChipActive,
              ]}
              onPress={() => setFilter(f)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  filter === f && styles.filterChipTextActive,
                ]}
              >
                {f === "all"
                  ? "All"
                  : f === "under_safety"
                    ? "🛡 Under Safety"
                    : f === "stockout"
                      ? "🔴 Stockout"
                      : f === "overstock"
                        ? "🔵 Overstock"
                        : f === "optimal"
                          ? "🟢 Optimal"
                          : "🚫 Discontinued"}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator
          size="large"
          color={theme.primary}
          style={{ flex: 1 }}
        />
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(e) => e.masterWine.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <BarChart3 size={56} color={theme.border} strokeWidth={1} />
              <Text style={styles.emptyText}>
                {selectedWineFilter
                  ? "No data found for this wine."
                  : "No wines found."}
              </Text>
            </View>
          }
        />
      )}

      {itemsToRequest.length > 0 && !loading && (
        <View style={styles.batchRequestContainer}>
          <TouchableOpacity
            style={[
              styles.batchRequestButton,
              batchRequesting && styles.btnDisabled,
            ]}
            onPress={handleBatchRequest}
            disabled={batchRequesting}
          >
            {batchRequesting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <TrendingUp size={20} color="#fff" strokeWidth={2.5} />
                <Text style={styles.batchRequestButtonText}>
                  REQUEST ALL (
                  {itemsToRequest.reduce(
                    (sum, item) => sum + item.requestedQty,
                    0,
                  )}{" "}
                  bottles)
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={isSuccessVisible} animationType="fade" transparent>
        <View style={styles.successOverlay}>
          <View style={styles.successContainer}>
            <View
              style={[
                styles.successIconContainer,
                { backgroundColor: theme.primary + "15" },
              ]}
            >
              <CheckCircle2 size={48} color={theme.primary} strokeWidth={1.5} />
            </View>
            <Text style={styles.successTitle}>Request Sent!</Text>
            <Text style={styles.successMessage}>
              Your batch request has been sent to the warehouse for processing.
            </Text>
            <TouchableOpacity
              style={[
                styles.successViewButton,
                { backgroundColor: theme.primary },
              ]}
              onPress={() => {
                setIsSuccessVisible(false);
                fetchData();
                router.push("/wine-requests");
              }}
            >
              <Text style={styles.successViewButtonText}>VIEW REQUESTS</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.successCloseButton}
              onPress={() => {
                setIsSuccessVisible(false);
                fetchData();
              }}
            >
              <Text
                style={[
                  styles.successCloseButtonText,
                  { color: theme.textSecondary },
                ]}
              >
                CLOSE
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isBatchConfirmVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsBatchConfirmVisible(false)}
      >
        <View style={styles.sheetOverlay}>
          <View style={[styles.sheet, { maxHeight: "80%" }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetWineName}>Confirm Batch Request</Text>
                <Text style={styles.sheetWineMeta}>
                  Requesting {itemsToRequest.length} wines (
                  {itemsToRequest.reduce(
                    (sum, item) => sum + item.requestedQty,
                    0,
                  )}{" "}
                  total bottles)
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsBatchConfirmVisible(false)}
                style={styles.closeBtn}
              >
                <X size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={itemsToRequest}
              keyExtractor={(item) => item.masterWine.id}
              renderItem={({ item }) => (
                <View style={styles.confirmItemRow}>
                  <View
                    style={[
                      styles.confirmItemQty,
                      { backgroundColor: theme.primary + "15" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.confirmItemQtyText,
                        { color: theme.primary },
                      ]}
                    >
                      {item.requestedQty}x
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.confirmItemName, { color: theme.text }]}
                      numberOfLines={1}
                    >
                      {item.masterWine.name}
                    </Text>
                    <Text
                      style={[
                        styles.confirmItemMeta,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {item.masterWine.vintage}
                      {item.masterWine.format
                        ? ` · ${item.masterWine.format}`
                        : ""}
                    </Text>
                  </View>
                </View>
              )}
              contentContainerStyle={{ paddingBottom: 20, paddingTop: 10 }}
            />

            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={() => setIsBatchConfirmVisible(false)}
              >
                <Text style={styles.confirmCancelBtnText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  { flex: 2, marginTop: 0 },
                  batchRequesting && styles.btnDisabled,
                ]}
                onPress={executeBatchRequest}
                disabled={batchRequesting}
              >
                <Text style={styles.saveBtnText}>CONFIRM & SUBMIT</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Adjustment Sheet Modal */}
      <Modal
        visible={!!selected}
        animationType="slide"
        transparent
        onRequestClose={closeSheet}
      >
        <View style={styles.sheetOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetWineName} numberOfLines={2}>
                  {selected?.masterWine.name}
                </Text>
                <Text style={styles.sheetWineMeta}>
                  {selected?.masterWine.vintage}
                  {selected?.masterWine.format
                    ? ` · ${selected.masterWine.format}`
                    : ""}
                </Text>
              </View>
              <TouchableOpacity onPress={closeSheet} style={styles.closeBtn}>
                <X size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.stockRow}>
              <View style={styles.stockPill}>
                <Text style={styles.stockCount}>
                  {selected?.stockCount !== undefined ? (selected.stockCount % 1 === 0 ? selected.stockCount : selected.stockCount.toFixed(2)) : 0}
                </Text>
                <Text style={styles.stockLabel}>
                  {selected?.openGlassesCount && selected.openGlassesCount > 0
                    ? `bottles (${selected.fullBottlesCount} full + ${selected.openGlassesCount}/6 glasses)`
                    : "bottles in store"}
                </Text>
              </View>
              {selected && (
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: STATUS_CONFIG[selected.status].bg },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      { color: STATUS_CONFIG[selected.status].color },
                    ]}
                  >
                    {STATUS_CONFIG[selected.status].label}
                  </Text>
                </View>
              )}
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>

              {/* --- SETTINGS LIST: INPUTS --- */}
              <View style={styles.settingsCard}>

                {/* Par Level */}
                <View style={styles.settingRow}>
                  <View style={styles.settingTextContainer}>
                    <Text style={styles.fieldLabel}>PAR LEVEL</Text>
                    <Text style={styles.fieldHint}>
                      When stock reaches this number, a reorder is triggered.
                    </Text>
                  </View>
                  <TextInput
                    style={[styles.input, styles.inputSmall]}
                    value={sheetPar}
                    onChangeText={setSheetPar}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
                <View style={styles.divider} />

                {/* Safety Stock */}
                <View style={styles.settingRow}>
                  <View style={styles.settingTextContainer}>
                    <Text style={styles.fieldLabel}>SAFETY STOCK</Text>
                    <Text style={styles.fieldHint}>
                      Target quantity to restore when reordering.
                    </Text>
                  </View>
                  <TextInput
                    style={[styles.input, styles.inputSmall]}
                    value={sheetSafety}
                    onChangeText={setSheetSafety}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
                <View style={styles.divider} />

                {/* Selling Price */}
                <View style={styles.settingRow}>
                  <View style={styles.settingTextContainer}>
                    <Text style={styles.fieldLabel}>SELLING PRICE</Text>
                    <Text style={styles.fieldHint}>
                      The retail price of this wine at this store.
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 8 }}>
                    <View style={styles.priceInputContainer}>
                      <Text style={styles.currencyPrefix}>₱</Text>
                      <TextInput
                        style={[styles.input, styles.inputPrice]}
                        value={sheetSellingPrice}
                        onChangeText={setSheetSellingPrice}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor="#94a3b8"
                      />
                    </View>
                    <View style={{ flexDirection: "row", backgroundColor: Colors.store.primary + "1A", borderRadius: 8, padding: 2 }}>
                      <TouchableOpacity
                        onPress={() => setSheetVatMode("excluded")}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 6,
                          backgroundColor: sheetVatMode === "excluded" ? Colors.store.card : "transparent",
                          shadowColor: sheetVatMode === "excluded" ? "#000" : "transparent",
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.1,
                          shadowRadius: 1,
                          elevation: sheetVatMode === "excluded" ? 1 : 0,
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: "800", color: sheetVatMode === "excluded" ? Colors.store.primary : Colors.store.primary + "80" }}>EX VAT</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setSheetVatMode("included")}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 6,
                          backgroundColor: sheetVatMode === "included" ? Colors.store.card : "transparent",
                          shadowColor: sheetVatMode === "included" ? "#000" : "transparent",
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.1,
                          shadowRadius: 1,
                          elevation: sheetVatMode === "included" ? 1 : 0,
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: "800", color: sheetVatMode === "included" ? Colors.store.primary : Colors.store.primary + "80" }}>INC VAT</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>

              {/* Dynamic Formula Display */}
              {sheetPar && sheetSafety && (
                <View style={styles.formulaBox}>
                  <Text style={styles.formulaLabel}>REQUEST FORMULA</Text>
                  <Text style={styles.formulaText}>
                    Safety Stock ({sheetSafety}) − Current (
                    {selected?.stockCount !== undefined ? (selected.stockCount % 1 === 0 ? selected.stockCount : selected.stockCount.toFixed(2)) : 0}) ={" "}
                    <Text style={{ color: theme.primary, fontWeight: "900" }}>
                      {Math.ceil(
                        Math.max(
                          0,
                          parseInt(sheetSafety, 10) - (selected?.stockCount ?? 0),
                        )
                      )}{" "}
                      bottles
                    </Text>
                  </Text>
                </View>
              )}

              {/* --- SETTINGS LIST: SWITCHES --- */}
              <View style={[styles.settingsCard, { marginTop: 20 }]}>

                {/* Wine Category Selection */}
                <View style={[styles.settingRow, { alignItems: "flex-start", paddingVertical: 16 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>WINE CATEGORY</Text>
                    <Text style={styles.fieldHint}>
                      Classify this wine to affect its prominence and handling.
                    </Text>

                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                      {[
                        { id: "none", label: "Standard", icon: null, color: theme.textSecondary },
                        { id: "fast", label: "Fast Wine", icon: Zap, color: "#d97706", bg: "#fef3c7" },
                        { id: "fine", label: "Fine Wine", icon: Star, color: "#be185d", bg: "#fce7f3" },
                        { id: "reserve", label: "Reserved Wine", icon: Lock, color: "#4338ca", bg: "#e0e7ff" }
                      ].map(cat => {
                        const isSelected = sheetWineCategory === cat.id;
                        const Icon = cat.icon;
                        return (
                          <TouchableOpacity
                            key={cat.id}
                            onPress={() => setSheetWineCategory(cat.id as any)}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                              paddingVertical: 8,
                              paddingHorizontal: 12,
                              borderRadius: 16,
                              borderWidth: 1,
                              borderColor: isSelected ? cat.color : theme.border,
                              backgroundColor: isSelected ? (cat.bg || theme.card) : "transparent",
                            }}
                          >
                            {Icon && <Icon size={14} color={isSelected ? cat.color : theme.textSecondary} />}
                            <Text style={{
                              fontSize: 12,
                              fontWeight: isSelected ? "700" : "500",
                              color: isSelected ? cat.color : theme.textSecondary
                            }}>
                              {cat.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </View>
                <View style={styles.divider} />

                {/* Discontinued */}
                <View style={styles.settingRow}>
                  <View style={styles.settingTextContainer}>
                    <Text style={styles.fieldLabel}>DISCONTINUED</Text>
                    <Text style={styles.fieldHint}>
                      No alerts or requests will be generated.
                    </Text>
                  </View>
                  <Switch
                    value={sheetDiscontinued}
                    onValueChange={setSheetDiscontinued}
                    trackColor={{
                      false: "#e2e8f0",
                      true: "#ef444460", // Red track for negative action
                    }}
                    thumbColor={sheetDiscontinued ? "#ef4444" : "#94a3b8"}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.btnDisabled]}
                onPress={handleSaveSettings}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>SAVE SETTINGS</Text>
                )}
              </TouchableOpacity>



              {selected?.activeRequest ? (
                <TouchableOpacity
                  style={styles.requestBtn}
                  onPress={() => {
                    closeSheet();
                    router.push(`/wine-requests/${selected.activeRequest!.id}`);
                  }}
                >
                  {selected.activeRequest.status === "outbound" ||
                    selected.activeRequest.status === "converted" ? (
                    <Truck size={18} color={theme.primary} strokeWidth={2.5} />
                  ) : selected.activeRequest.status === "receiving" ? (
                    <CheckCircle2
                      size={18}
                      color={theme.primary}
                      strokeWidth={2.5}
                    />
                  ) : (
                    <Clock size={18} color={theme.primary} strokeWidth={2.5} />
                  )}
                  <Text style={styles.requestBtnText}>VIEW ACTIVE REQUEST</Text>
                </TouchableOpacity>
              ) : (
                selected &&
                selected.requestedQty > 0 &&
                !sheetDiscontinued && (
                  <TouchableOpacity
                    style={[
                      styles.requestBtn,
                      requesting && styles.btnDisabled,
                    ]}
                    onPress={handleRequestStock}
                    disabled={requesting}
                  >
                    {requesting ? (
                      <ActivityIndicator color={theme.primary} />
                    ) : (
                      <>
                        <TrendingUp
                          size={18}
                          color={theme.primary}
                          strokeWidth={2.5}
                        />
                        <Text style={styles.requestBtnText}>
                          REQUEST {selected.requestedQty} BOTTLES
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )
              )}

              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={isWineFilterModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.card, height: "80%" },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                Select Wine
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setIsWineFilterModalOpen(false);
                  setWineSearchTerm("");
                }}
              >
                <X size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <View
              style={[
                styles.searchWrapper,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                  marginBottom: 16,
                },
              ]}
            >
              <Search
                size={18}
                color={theme.textSecondary}
                style={styles.searchIcon}
              />
              <TextInput
                style={[styles.searchInput, { color: theme.text }]}
                placeholder="Search catalog..."
                placeholderTextColor={theme.textSecondary}
                value={wineSearchTerm}
                onChangeText={setWineSearchTerm}
                autoFocus
                clearButtonMode="while-editing"
              />
            </View>

            <FlatList
              data={filteredMasterWines}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.modalOption,
                    { borderColor: theme.border, paddingVertical: 10 },
                    selectedWineFilter?.id === item.id && {
                      borderColor: theme.primary,
                      backgroundColor: theme.primary + "10",
                    },
                  ]}
                  onPress={() => {
                    setSelectedWineFilter(item);
                    setIsWineFilterModalOpen(false);
                    setWineSearchTerm("");
                  }}
                >
                  <View
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        backgroundColor:
                          selectedWineFilter?.id === item.id
                            ? theme.primary + "20"
                            : theme.background,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Wine
                        size={20}
                        color={
                          selectedWineFilter?.id === item.id
                            ? theme.primary
                            : theme.textSecondary
                        }
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.modalOptionText, { color: theme.text }]}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                      <Text
                        style={{
                          fontSize: 12,
                          color: theme.textSecondary,
                          marginTop: 2,
                          fontWeight: "500",
                        }}
                        numberOfLines={1}
                      >
                        {[item.vintage, item.producer, item.format]
                          .filter(Boolean)
                          .join(" • ")}
                      </Text>
                    </View>
                  </View>
                  {selectedWineFilter?.id === item.id && (
                    <Check size={20} color={theme.primary} />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={{ padding: 20, alignItems: "center" }}>
                  <Text style={{ color: theme.textSecondary, fontSize: 14 }}>
                    No wines found in catalog.
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  backBtn: { marginRight: 12 },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.primary + "10",
    borderWidth: 1,
    borderColor: theme.primary + "30",
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: theme.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    color: theme.textSecondary,
    fontWeight: "600",
    marginTop: 2,
  },

  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fef3c7",
    marginHorizontal: 20,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fcd34d",
  },
  alertBannerText: { color: "#92400e", fontWeight: "700", fontSize: 13 },

  wineFilterBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 48,
    gap: 10,
  },
  wineFilterBtnText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },

  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
  },
  filterChipActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.textSecondary,
  },
  filterChipTextActive: { color: "#fff" },

  list: { paddingHorizontal: 16, paddingBottom: 100 },

  card: {
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  wineName: {
    fontSize: 15,
    fontWeight: "800",
    color: theme.text,
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  wineMeta: { fontSize: 12, color: theme.textSecondary, fontWeight: "500" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: {
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sellingPrice: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.primary,
    marginTop: 4,
    textAlign: "right",
  },

  tagsRow: { flexDirection: "row", gap: 6, marginBottom: 12 },
  indicatorBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  indicatorText: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  barContainer: { marginBottom: 12, marginTop: 4 },

  barStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 14,
  },
  stockHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stockPrimaryValue: {
    fontSize: 22,
    fontWeight: "900",
    color: theme.text,
    lineHeight: 24,
  },
  stockPrimaryLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: theme.textSecondary,
    letterSpacing: 0.5,
    paddingBottom: 2,
  },

  deficitBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fff7ed",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#ffedd5",
  },
  deficitText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#ea580c",
    letterSpacing: 0.5,
  },

  barTrack: {
    height: 8,
    backgroundColor: "#f1f5f9",
    borderRadius: 4,
    position: "relative",
  },
  barFill: { height: "100%", borderRadius: 4 },

  parMarkerContainer: {
    position: "absolute",
    top: -12,
    width: 20,
    marginLeft: -10,
    alignItems: "center",
    zIndex: 10,
  },
  parMarkerArrow: {
    fontSize: 10,
    color: "#ea580c",
    lineHeight: 10,
    marginBottom: 1,
  },
  parMarkerLine: {
    width: 4,
    height: 12,
    backgroundColor: "#ea580c",
    borderRadius: 2,
    borderWidth: 1,
    borderColor: "#fff",
  },

  barLabelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  barLabelSecondary: {
    fontSize: 10,
    fontWeight: "900",
    color: "#ea580c",
  },
  barLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: theme.textSecondary,
  },

  unconfiguredStockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    marginBottom: 8,
  },

  requestedFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
  },
  requestedFooterText: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  empty: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyText: { color: theme.textSecondary, fontWeight: "600", fontSize: 15 },

  successOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  successContainer: {
    backgroundColor: theme.card,
    borderRadius: 24,
    padding: 32,
    paddingTop: 24,
    alignItems: "center",
    width: "100%",
    maxWidth: 400,
  },
  successIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: theme.text,
    marginBottom: 8,
  },
  successMessage: {
    fontSize: 14,
    color: theme.textSecondary,
    textAlign: "center",
    marginBottom: 28,
    lineHeight: 20,
  },
  successViewButton: {
    width: "100%",
    height: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  successViewButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1,
  },
  successCloseButton: { marginTop: 8, padding: 12 },
  successCloseButtonText: { fontSize: 14, fontWeight: "800" },

  confirmItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  confirmItemQty: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  confirmItemQtyText: { fontSize: 13, fontWeight: "900" },
  confirmItemName: { fontSize: 14, fontWeight: "700" },
  confirmItemMeta: { fontSize: 12, fontWeight: "500", marginTop: 2 },
  confirmActions: {
    flexDirection: "row",
    gap: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  confirmCancelBtn: {
    flex: 1,
    height: 58,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.card,
    borderWidth: 1.5,
    borderColor: theme.border,
  },
  confirmCancelBtnText: {
    color: theme.textSecondary,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1,
  },

  batchRequestContainer: {
    position: "absolute",
    bottom: 30,
    left: 20,
    right: 20,
    alignItems: "center",
  },
  batchRequestButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: theme.primary,
    height: 58,
    borderRadius: 29,
    paddingHorizontal: 24,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  batchRequestButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: theme.card,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    maxHeight: "95%", // gave a tiny bit more room since we added descriptive cards
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.border,
    alignSelf: "center",
    marginBottom: 24,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  sheetWineName: {
    fontSize: 20,
    fontWeight: "900",
    color: theme.text,
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  sheetWineMeta: {
    fontSize: 13,
    color: theme.textSecondary,
    fontWeight: "500",
  },
  closeBtn: { padding: 4 },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  stockPill: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    backgroundColor: theme.background,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  stockCount: { fontSize: 28, fontWeight: "900", color: theme.text },
  stockLabel: { fontSize: 12, color: theme.textSecondary, fontWeight: "600" },

  // --- NEW SETTINGS CARD LIST STYLES ---
  settingsCard: {
    backgroundColor: theme.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 16,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    minHeight: 84, // Ensure comfortable tap height and space for text wrapping
  },
  settingTextContainer: {
    flex: 1,
    paddingRight: 16,
  },
  divider: {
    height: 1,
    backgroundColor: theme.border,
  },

  fieldLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: theme.textSecondary,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  fieldHint: {
    fontSize: 12,
    color: "#94a3b8",
    fontWeight: "500",
    lineHeight: 16,
  },

  input: {
    borderWidth: 1.5,
    borderColor: theme.border,
    borderRadius: 12,
    height: 48,
    fontSize: 16,
    fontWeight: "800",
    color: theme.text,
    backgroundColor: theme.card, // Stand out from the background slightly
  },
  inputSmall: {
    width: 80,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  priceInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    width: 160,
  },
  currencyPrefix: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.textSecondary,
    marginRight: 8,
  },
  inputPrice: {
    flex: 1,
    paddingHorizontal: 12,
  },

  formulaBox: {
    backgroundColor: theme.primary + "08",
    borderRadius: 14,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: theme.primary + "20",
  },
  formulaLabel: {
    fontSize: 9,
    fontWeight: "900",
    color: theme.primary,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  formulaText: {
    fontSize: 14,
    color: theme.text,
    fontWeight: "600",
    lineHeight: 20,
  },

  saveBtn: {
    backgroundColor: theme.primary,
    height: 58,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    borderRadius: 18,
    marginTop: 24,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1,
  },
  requestBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 2,
    borderColor: theme.primary,
    height: 58,
    borderRadius: 18,
    marginTop: 12,
  },
  requestBtnText: {
    color: theme.primary,
    fontSize: 14,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  btnDisabled: { opacity: 0.4 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    minHeight: "40%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: "900" },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  modalOptionText: { fontSize: 15, fontWeight: "700" },
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 52,
  },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, fontSize: 15, fontWeight: "600" },
});