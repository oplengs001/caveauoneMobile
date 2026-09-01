import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { MasterWine, StockStatus, StoreWineSetting } from "@/types";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertTriangle,
  ArrowUpDown,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Ghost,
  LayoutGrid,
  LayoutList,
  Minus,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  TrendingDown,
  TrendingUp,
  Truck,
  Wine,
  X,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
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

type FilterType =
  | "all"
  | "needs_reorder"
  | "stockout"
  | "par_alert"
  | "under_safety"
  | "optimal"
  | "overstock"
  | "discontinued";

type CategoryFilterType =
  | "all"
  | "fun"
  | "fine"
  | "reserve"
  | "standard"
  | "portions"
  | "bottle_only";
type SortOption = "urgency" | "stock_asc" | "stock_desc" | "name_asc" | "price_desc";

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
  { label: string; color: string; bg: string; accent: string; icon?: any }
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
  unset: {
    label: "Unset",
    color: "#475569",
    bg: "#e2e8f0",
    accent: "#94a3b8",
  },
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
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isWide = width >= 600;
  const isCompactHeight = height < 520;

  const [entries, setEntries] = useState<WineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & Controls
  const { filter: initialFilter } = useLocalSearchParams<{
    filter: FilterType;
  }>();
  const [filter, setFilter] = useState<FilterType>(initialFilter || "all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("urgency");
  const [viewMode, setViewMode] = useState<"compact" | "detailed">("compact");
  const [isSortModalOpen, setIsSortModalOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const activeFiltersCount =
    (filter !== "all" ? 1 : 0) + (categoryFilter !== "all" ? 1 : 0);

  // Setting Sheet
  const [selected, setSelected] = useState<WineEntry | null>(null);
  const [sheetPar, setSheetPar] = useState("");
  const [sheetSafety, setSheetSafety] = useState("");
  const [sheetSellingPrice, setSheetSellingPrice] = useState("");
  const [sheetGlassPrice, setSheetGlassPrice] = useState("");
  const [sheetCarafePrice, setSheetCarafePrice] = useState("");
  const [sheetAllowGlass, setSheetAllowGlass] = useState(false);
  const [sheetAllowCarafe, setSheetAllowCarafe] = useState(false);
  const [sheetDiscontinued, setSheetDiscontinued] = useState(false);
  const [sheetWineCategory, setSheetWineCategory] = useState<"fun" | "fine" | "reserve" | "none">("none");
  const [sheetVatMode, setSheetVatMode] = useState<"included" | "excluded">("excluded");

  // Action states
  const [saving, setSaving] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [isBatchConfirmVisible, setIsBatchConfirmVisible] = useState(false);
  const [batchRequesting, setBatchRequesting] = useState(false);
  const [isSuccessVisible, setIsSuccessVisible] = useState(false);

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

      const fetchPendingRequests = apiFetch(
        `/wine-requests?storeId=${storeId}&status=pending,converted,outbound,receiving`
      ).catch((err) => {
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

      const pendingWineRequestMap = new Map<string, { id: string; status: string }>();
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

      const validResults = results.filter(
        (entry) => !(entry.stockCount === 0 && entry.status === "unset")
      );
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

  // High-Level KPI Summary Calculations
  const metrics = useMemo(() => {
    let totalPhysicalBottles = 0;
    let totalFullBottles = 0;
    let totalOpenGlasses = 0;
    let stockoutCount = 0;
    let parAlertCount = 0;
    let underSafetyCount = 0;
    let optimalCount = 0;
    let overstockCount = 0;
    let discontinuedCount = 0;
    let totalDeficit = 0;

    entries.forEach((e) => {
      totalPhysicalBottles += e.stockCount;
      totalFullBottles += e.fullBottlesCount;
      totalOpenGlasses += e.openGlassesCount;
      if (e.requestedQty > 0 && !e.setting?.discontinued) {
        totalDeficit += e.requestedQty;
      }

      switch (e.status) {
        case "stockout":
          stockoutCount++;
          break;
        case "par_alert":
          parAlertCount++;
          break;
        case "under_safety":
          underSafetyCount++;
          break;
        case "in_stock":
          optimalCount++;
          break;
        case "overstock":
          overstockCount++;
          break;
        case "discontinued":
          discontinuedCount++;
          break;
      }
    });

    const needsReorderCount = stockoutCount + parAlertCount + underSafetyCount;

    return {
      totalWines: entries.length,
      totalPhysicalBottles: Math.round(totalPhysicalBottles * 10) / 10,
      totalFullBottles,
      totalOpenGlasses,
      needsReorderCount,
      stockoutCount,
      parAlertCount,
      underSafetyCount,
      optimalCount,
      overstockCount,
      discontinuedCount,
      totalDeficit,
    };
  }, [entries]);

  // Filtering & Searching & Sorting
  const filteredAndSortedEntries = useMemo(() => {
    let result = entries.filter((e) => {
      // 1. Status Filter
      if (filter === "needs_reorder") {
        if (
          e.status !== "stockout" &&
          e.status !== "par_alert" &&
          e.status !== "under_safety"
        ) {
          return false;
        }
      } else if (filter === "stockout") {
        if (e.status !== "stockout") return false;
      } else if (filter === "par_alert") {
        if (e.status !== "par_alert") return false;
      } else if (filter === "under_safety") {
        if (e.status !== "under_safety") return false;
      } else if (filter === "optimal") {
        if (e.status !== "in_stock") return false;
      } else if (filter === "overstock") {
        if (e.status !== "overstock") return false;
      } else if (filter === "discontinued") {
        if (e.status !== "discontinued") return false;
      }

      // 2. Wine Category & Serving Mode Filter
      if (categoryFilter !== "all") {
        const isPortion =
          Boolean(e.setting?.allowGlass || e.setting?.allowCarafe) ||
          (e.setting?.glassPrice != null && Number(e.setting.glassPrice) > 0) ||
          (e.setting?.carafePrice != null && Number(e.setting.carafePrice) > 0);

        if (categoryFilter === "portions") {
          if (!isPortion) return false;
        } else if (categoryFilter === "bottle_only") {
          if (isPortion) return false;
        } else if (categoryFilter === "standard") {
          const cat = e.setting?.wineCategory ?? e.masterWine?.wineCategory ?? "standard";
          if (cat && cat !== "standard" && cat !== null) return false;
        } else {
          const cat = e.setting?.wineCategory ?? e.masterWine?.wineCategory ?? "standard";
          if (cat !== categoryFilter) return false;
        }
      }

      // 3. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = e.masterWine.name?.toLowerCase().includes(q);
        const matchesProducer = e.masterWine.producer?.toLowerCase().includes(q);
        const matchesVintage = e.masterWine.vintage?.toLowerCase().includes(q);
        const matchesSku = e.masterWine.sku?.toLowerCase().includes(q);
        const matchesRegion = e.masterWine.region?.toLowerCase().includes(q);
        if (
          !matchesName &&
          !matchesProducer &&
          !matchesVintage &&
          !matchesSku &&
          !matchesRegion
        ) {
          return false;
        }
      }

      return true;
    });

    // 4. Sorting
    result.sort((a, b) => {
      if (sortBy === "urgency") {
        // High deficit first, then status priority
        if (b.requestedQty !== a.requestedQty) {
          return b.requestedQty - a.requestedQty;
        }
        const order: StockStatus[] = [
          "stockout",
          "par_alert",
          "under_safety",
          "in_stock",
          "overstock",
          "unset",
          "discontinued",
        ];
        return order.indexOf(a.status) - order.indexOf(b.status);
      } else if (sortBy === "stock_asc") {
        return a.stockCount - b.stockCount;
      } else if (sortBy === "stock_desc") {
        return b.stockCount - a.stockCount;
      } else if (sortBy === "name_asc") {
        return (a.masterWine.name || "").localeCompare(b.masterWine.name || "");
      } else if (sortBy === "price_desc") {
        const priceA = a.setting?.sellingPrice ?? a.masterWine.price ?? 0;
        const priceB = b.setting?.sellingPrice ?? b.masterWine.price ?? 0;
        return priceB - priceA;
      }
      return 0;
    });

    return result;
  }, [entries, filter, categoryFilter, searchQuery, sortBy]);

  const itemsToRequest = useMemo(() => {
    return filteredAndSortedEntries.filter(
      (entry) => entry.requestedQty > 0 && !entry.setting?.discontinued
    );
  }, [filteredAndSortedEntries]);

  const openSheet = (entry: WineEntry) => {
    setSelected(entry);
    setSheetPar(entry.setting?.parLevel?.toString() ?? "");
    setSheetSafety(entry.setting?.safetyStock?.toString() ?? "");
    setSheetSellingPrice(entry.setting?.sellingPrice?.toString() ?? "");
    setSheetGlassPrice(entry.setting?.glassPrice?.toString() ?? "");
    setSheetCarafePrice(entry.setting?.carafePrice?.toString() ?? "");

    const allowPortion =
      Boolean(entry.setting?.allowGlass || entry.setting?.allowCarafe) ||
      (entry.setting?.glassPrice != null && Number(entry.setting.glassPrice) > 0) ||
      (entry.setting?.carafePrice != null && Number(entry.setting.carafePrice) > 0);
    setSheetAllowGlass(allowPortion);
    setSheetAllowCarafe(allowPortion);

    setSheetDiscontinued(entry.setting?.discontinued ?? false);

    let cat: "fun" | "fine" | "reserve" | "none" = "none";
    if (entry.setting?.wineCategory) {
      cat = entry.setting.wineCategory as "fun" | "fine" | "reserve";
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
        "Safety Stock must be greater than or equal to PAR Level."
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
          glassPrice:
            sheetAllowGlass && sheetGlassPrice ? parseFloat(sheetGlassPrice) : null,
          carafePrice:
            sheetAllowCarafe && sheetCarafePrice ? parseFloat(sheetCarafePrice) : null,
          allowGlass: sheetAllowGlass,
          allowCarafe: sheetAllowCarafe,
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
      "Submit Replenishment",
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
                `Request for ${qty} bottles has been sent to warehouse.`
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
      ]
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
        0
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
        "No Replenishment Needed",
        "There are no items currently in deficit under this filter."
      );
      return;
    }
    setIsBatchConfirmVisible(true);
  };

  // Stepper helper for Par and Safety
  const stepPar = (delta: number) => {
    const current = parseInt(sheetPar, 10) || 0;
    const updated = Math.max(0, current + delta);
    setSheetPar(updated.toString());
  };

  const stepSafety = (delta: number) => {
    const current = parseInt(sheetSafety, 10) || 0;
    const updated = Math.max(0, current + delta);
    setSheetSafety(updated.toString());
  };

  // --- RENDER COMPACT ROW ---
  const renderCompactItem = ({ item }: { item: WineEntry }) => {
    const cfg = STATUS_CONFIG[item.status];
    const isConfigured = !!item.setting && !item.setting.discontinued;
    const safetyStock = item.setting?.safetyStock || 0;
    const category = item.setting?.wineCategory || item.masterWine.wineCategory;

    const isPortion =
      Boolean(item.setting?.allowGlass || item.setting?.allowCarafe) ||
      (item.setting?.glassPrice != null && Number(item.setting.glassPrice) > 0) ||
      (item.setting?.carafePrice != null && Number(item.setting.carafePrice) > 0);

    return (
      <TouchableOpacity
        style={[
          styles.compactRow,
          item.status === "stockout" && styles.rowStockoutHighlight,
        ]}
        onPress={() => openSheet(item)}
        activeOpacity={0.7}
      >
        {/* Left Indicator & Info */}
        <View style={styles.compactLeft}>
          <View style={styles.compactTitleRow}>
            {category === "fun" && (
              <View style={[styles.miniCatBadge, { backgroundColor: "#fef3c7" }]}>
                <Zap size={10} color="#d97706" />
              </View>
            )}
            {category === "fine" && (
              <View style={[styles.miniCatBadge, { backgroundColor: "#fce7f3" }]}>
                <Star size={10} color="#be185d" />
              </View>
            )}
            {category === "reserve" && (
              <View style={[styles.miniCatBadge, { backgroundColor: "#e0e7ff" }]}>
                <Ghost size={10} color="#4338ca" />
              </View>
            )}
            <Text style={styles.compactWineName} numberOfLines={1}>
              {item.masterWine.name}
            </Text>
          </View>

          <View style={styles.compactMetaRow}>
            <Text style={styles.compactMetaText} numberOfLines={1}>
              {[item.masterWine.vintage, item.masterWine.producer, item.masterWine.format]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            {isPortion && (
              <View style={styles.portionTagGlass}>
                <MaterialCommunityIcons name="glass-wine" size={12} color="#be185d" />
                <Text style={styles.portionTagTextGlass}>Glass & Carafe</Text>
              </View>
            )}
            {item.setting?.sellingPrice != null && (
              <Text style={styles.compactPriceText}>
                ₱
                {item.setting.sellingPrice.toLocaleString("en-US", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })}
              </Text>
            )}
          </View>
        </View>

        {/* Right Stock & Status */}
        <View style={styles.compactRight}>
          <View style={styles.compactStockPill}>
            <Text style={styles.compactStockVal}>
              {item.stockCount % 1 === 0 ? item.stockCount : item.stockCount.toFixed(2)}
            </Text>
            {isConfigured ? (
              <Text style={styles.compactStockTarget}>/{safetyStock}</Text>
            ) : (
              <Text style={styles.compactStockUnset}>· unset</Text>
            )}
          </View>

          <View style={[styles.compactStatusBadge, { backgroundColor: cfg.bg }]}>
            <View style={[styles.compactStatusDot, { backgroundColor: cfg.accent }]} />
            <Text style={[styles.compactStatusText, { color: cfg.color }]}>
              {cfg.label}
            </Text>
          </View>

          {item.requestedQty > 0 && (
            <View style={styles.compactDeficitBadge}>
              <TrendingDown size={9} color="#ea580c" />
              <Text style={styles.compactDeficitText}>-{item.requestedQty}</Text>
            </View>
          )}

          {item.openGlassesCount > 0 && (
            <View style={styles.compactGlassBadge}>
              <MaterialCommunityIcons name="glass-wine" size={10} color="#2563eb" />
              <Text style={styles.compactGlassText}>{item.openGlassesCount}/6</Text>
            </View>
          )}
        </View>

        {/* Tactile Tuning Dial */}
        <View style={styles.compactTuneDial}>
          <SlidersHorizontal size={13} color={theme.primary} strokeWidth={2.2} />
        </View>
      </TouchableOpacity>
    );
  };

  // --- RENDER DETAILED CARD ---
  const renderDetailedItem = ({ item }: { item: WineEntry }) => {
    const cfg = STATUS_CONFIG[item.status];
    const isConfigured = !!item.setting && !item.setting.discontinued;
    const safetyStock = item.setting?.safetyStock || 0;
    const parLevel = item.setting?.parLevel || 0;
    const category = item.setting?.wineCategory || item.masterWine.wineCategory;

    const isPortion =
      Boolean(item.setting?.allowGlass || item.setting?.allowCarafe) ||
      (item.setting?.glassPrice != null && Number(item.setting.glassPrice) > 0) ||
      (item.setting?.carafePrice != null && Number(item.setting.carafePrice) > 0);

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
          styles.detailedCard,
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
              {[item.masterWine.vintage, item.masterWine.producer, item.masterWine.format]
                .filter(Boolean)
                .join(" · ")}
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

        <View style={styles.tagsRow}>
          {category === "fun" && (
            <View style={[styles.indicatorBadge, { backgroundColor: "#fef3c7" }]}>
              <Zap size={12} color="#d97706" strokeWidth={2.5} />
              <Text style={[styles.indicatorText, { color: "#d97706" }]}>Fun Wine</Text>
            </View>
          )}
          {category === "fine" && (
            <View style={[styles.indicatorBadge, { backgroundColor: "#fce7f3" }]}>
              <Star size={12} color="#be185d" strokeWidth={2.5} />
              <Text style={[styles.indicatorText, { color: "#be185d" }]}>Fine Wine</Text>
            </View>
          )}
          {category === "reserve" && (
            <View style={[styles.indicatorBadge, { backgroundColor: "#e0e7ff" }]}>
              <Ghost size={12} color="#4338ca" strokeWidth={2.5} />
              <Text style={[styles.indicatorText, { color: "#4338ca" }]}>Reserve Wine</Text>
            </View>
          )}
          {isPortion ? (
            <View style={[styles.indicatorBadge, { backgroundColor: "#fce7f3", borderColor: "#fbcfe8", borderWidth: 1 }]}>
              <MaterialCommunityIcons name="glass-wine" size={13} color="#be185d" />
              <Text style={[styles.indicatorText, { color: "#be185d" }]}>By Glass & Carafe</Text>
            </View>
          ) : (
            <View style={[styles.indicatorBadge, { backgroundColor: "#f1f5f9", borderColor: "#e2e8f0", borderWidth: 1 }]}>
              <MaterialCommunityIcons name="bottle-wine-outline" size={13} color="#64748b" />
              <Text style={[styles.indicatorText, { color: "#64748b" }]}>Bottle Only</Text>
            </View>
          )}
        </View>

        {isConfigured ? (
          <View style={styles.barContainer}>
            <View style={styles.barStatsRow}>
              <View style={styles.stockHeaderRow}>
                <Package size={15} color={theme.textSecondary} />
                <Text style={styles.stockPrimaryValue}>
                  {item.stockCount % 1 === 0 ? item.stockCount : item.stockCount.toFixed(2)}
                </Text>
                <Text style={styles.stockPrimaryLabel}>IN STORE</Text>
                {item.openGlassesCount > 0 && (
                  <View style={styles.openGlassesBadge}>
                    <MaterialCommunityIcons name="glass-wine" size={11} color="#2563eb" />
                    <Text style={styles.openGlassesText}>
                      {item.openGlassesCount}/6 glasses
                    </Text>
                  </View>
                )}
              </View>

              {item.requestedQty > 0 && (
                <View style={styles.deficitBadge}>
                  <TrendingDown size={12} color="#ea580c" strokeWidth={2.5} />
                  <Text style={styles.deficitText}>{item.requestedQty} DEFICIT</Text>
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
            <Text style={styles.stockPrimaryLabel}>IN STORE (UNSET PAR)</Text>
            {item.openGlassesCount > 0 && (
              <View style={styles.openGlassesBadge}>
                <Text style={styles.openGlassesText}>
                  🍷 {item.openGlassesCount}/6 glasses
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
                  ? "Warehouse Pullout in Progress"
                  : item.activeRequest.status === "outbound"
                    ? "Stock is Outbound"
                    : item.activeRequest.status === "receiving"
                      ? "Ready to Ingress / Receive"
                      : "Active Request"}
            </Text>
            <ChevronRight size={14} color={cfg.color} style={{ marginLeft: "auto" }} />
          </TouchableOpacity>
        )}

        {/* Luxury Cellar Target Strip */}
        <View style={styles.cellarGaugeFooter}>
          <View style={styles.cellarGaugeLeft}>
            <SlidersHorizontal size={11} color={theme.primary} strokeWidth={2} />
            <Text style={styles.cellarGaugeLabel}>
              {isConfigured
                ? `TARGETS: PAR ${parLevel} · SAFETY ${safetyStock}`
                : "NO TARGETS CONFIGURED"}
            </Text>
          </View>
          <View style={styles.cellarGaugeAction}>
            <Text
              style={[
                styles.cellarGaugeActionText,
                !isConfigured && { color: "#b45309" },
              ]}
            >
              {isConfigured ? "Adjust Targets" : "Set Target"}
            </Text>
            <ChevronRight
              size={12}
              color={!isConfigured ? "#b45309" : theme.primary}
              strokeWidth={2.5}
            />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={28} color={theme.primary} strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Stock Management</Text>
          <Text style={styles.subtitle}>
            {entries.length} wines · {metrics.totalPhysicalBottles} bottles in store · Tap to adjust
          </Text>
        </View>

        {/* View Mode Toggle */}
        <TouchableOpacity
          style={styles.viewModeBtn}
          onPress={() => setViewMode((v) => (v === "compact" ? "detailed" : "compact"))}
          activeOpacity={0.7}
        >
          {viewMode === "compact" ? (
            <LayoutList size={18} color={theme.primary} />
          ) : (
            <LayoutGrid size={18} color={theme.primary} />
          )}
          <Text style={styles.viewModeBtnText}>
            {viewMode === "compact" ? "Compact" : "Cards"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
          <RefreshCw size={18} color={theme.primary} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      {/* AT-A-GLANCE INVENTORY HEALTH DASHBOARD (KPI TILES) */}
      <View style={styles.kpiContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.kpiScrollContent}
        >
          {/* Card 1: Total Inventory */}
          <TouchableOpacity
            style={[styles.kpiCard, filter === "all" && styles.kpiCardActive]}
            onPress={() => setFilter("all")}
            activeOpacity={0.8}
          >
            <View style={styles.kpiCardHeader}>
              <Wine size={16} color={theme.primary} />
              <Text style={styles.kpiCardLabel}>TOTAL STORE</Text>
            </View>
            <Text style={styles.kpiCardValue}>{metrics.totalPhysicalBottles}</Text>
            <Text style={styles.kpiCardSub}>
              {metrics.totalWines} wines · {metrics.totalFullBottles} sealed
            </Text>
          </TouchableOpacity>

          {/* Card 2: Needs Reorder (Alerts) */}
          <TouchableOpacity
            style={[
              styles.kpiCard,
              styles.kpiCardAlert,
              filter === "needs_reorder" && styles.kpiCardAlertActive,
            ]}
            onPress={() => setFilter(filter === "needs_reorder" ? "all" : "needs_reorder")}
            activeOpacity={0.8}
          >
            <View style={styles.kpiCardHeader}>
              <AlertTriangle
                size={16}
                color={metrics.needsReorderCount > 0 ? "#ea580c" : theme.textSecondary}
              />
              <Text
                style={[
                  styles.kpiCardLabel,
                  metrics.needsReorderCount > 0 && { color: "#c2410c" },
                ]}
              >
                REORDER NEEDED
              </Text>
            </View>
            <Text
              style={[
                styles.kpiCardValue,
                metrics.needsReorderCount > 0 && { color: "#c2410c" },
              ]}
            >
              {metrics.needsReorderCount}
            </Text>
            <Text style={styles.kpiCardSub}>
              {metrics.totalDeficit > 0
                ? `${metrics.totalDeficit} bottles deficit`
                : "All targets met"}
            </Text>
          </TouchableOpacity>

          {/* Card 3: Optimal Stock */}
          <TouchableOpacity
            style={[styles.kpiCard, filter === "optimal" && styles.kpiCardOptimalActive]}
            onPress={() => setFilter(filter === "optimal" ? "all" : "optimal")}
            activeOpacity={0.8}
          >
            <View style={styles.kpiCardHeader}>
              <CheckCircle2 size={16} color="#10b981" />
              <Text style={[styles.kpiCardLabel, { color: "#047857" }]}>OPTIMAL</Text>
            </View>
            <Text style={[styles.kpiCardValue, { color: "#047857" }]}>
              {metrics.optimalCount}
            </Text>
            <Text style={styles.kpiCardSub}>Healthy stock balance</Text>
          </TouchableOpacity>

          {/* Card 4: Overstock */}
          <TouchableOpacity
            style={[styles.kpiCard, filter === "overstock" && styles.kpiCardOverstockActive]}
            onPress={() => setFilter(filter === "overstock" ? "all" : "overstock")}
            activeOpacity={0.8}
          >
            <View style={styles.kpiCardHeader}>
              <TrendingUp size={16} color="#3b82f6" />
              <Text style={[styles.kpiCardLabel, { color: "#1d4ed8" }]}>OVERSTOCK</Text>
            </View>
            <Text style={[styles.kpiCardValue, { color: "#1d4ed8" }]}>
              {metrics.overstockCount}
            </Text>
            <Text style={styles.kpiCardSub}>Above safety levels</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* SEARCH, FILTER TOGGLE & SORT TOOLBAR */}
      <View style={styles.searchAndToolbar}>
        <View style={styles.searchBox}>
          <Search size={16} color={theme.textSecondary} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search wine, vintage, SKU..."
            placeholderTextColor={theme.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && Platform.OS !== "ios" && (
            <TouchableOpacity onPress={() => setSearchQuery("")} style={{ padding: 4 }}>
              <X size={16} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Hide / Show Filters Toggle Button */}
        <TouchableOpacity
          style={[
            styles.filterToggleButton,
            (showFilters || activeFiltersCount > 0) && styles.filterToggleButtonActive,
          ]}
          onPress={() => setShowFilters(!showFilters)}
          activeOpacity={0.7}
        >
          <SlidersHorizontal
            size={16}
            color={
              showFilters || activeFiltersCount > 0
                ? theme.primary
                : theme.textSecondary
            }
          />
          <Text
            style={[
              styles.filterToggleButtonText,
              (showFilters || activeFiltersCount > 0) && {
                color: theme.primary,
                fontWeight: "800",
              },
            ]}
          >
            Filters
          </Text>
          {activeFiltersCount > 0 && (
            <View style={styles.filterCountBadge}>
              <Text style={styles.filterCountBadgeText}>{activeFiltersCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Sort Button */}
        <TouchableOpacity
          style={[styles.sortButton, sortBy !== "urgency" && styles.sortButtonActive]}
          onPress={() => setIsSortModalOpen(true)}
          activeOpacity={0.7}
        >
          <ArrowUpDown
            size={16}
            color={sortBy !== "urgency" ? theme.primary : theme.textSecondary}
          />
          <Text
            style={[
              styles.sortButtonText,
              sortBy !== "urgency" && { color: theme.primary, fontWeight: "800" },
            ]}
          >
            {sortBy === "urgency"
              ? "Sort"
              : sortBy === "stock_asc"
                ? "Stock ↑"
                : sortBy === "stock_desc"
                  ? "Stock ↓"
                  : sortBy === "name_asc"
                    ? "A-Z"
                    : "Price ↓"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* COLLAPSED ACTIVE FILTERS BAR (when filters are hidden but active) */}
      {!showFilters && activeFiltersCount > 0 && (
        <View style={styles.activeFilterSummaryRow}>
          <Text style={styles.activeFilterSummaryLabel}>Active:</Text>
          {filter !== "all" && (
            <TouchableOpacity
              style={styles.activeFilterPill}
              onPress={() => setFilter("all")}
            >
              <MaterialCommunityIcons
                name={
                  filter === "needs_reorder"
                    ? "alert-octagon-outline"
                    : filter === "stockout"
                      ? "close-circle-outline"
                      : filter === "par_alert"
                        ? "lightning-bolt-outline"
                        : filter === "under_safety"
                          ? "shield-alert-outline"
                          : filter === "optimal"
                            ? "check-circle-outline"
                            : filter === "overstock"
                              ? "trending-up"
                              : "cancel"
                }
                size={13}
                color={theme.primary}
              />
              <Text style={styles.activeFilterPillText}>
                {filter === "needs_reorder"
                  ? "Reorder"
                  : filter === "stockout"
                    ? "Stockout"
                    : filter === "par_alert"
                      ? "PAR Alert"
                      : filter === "under_safety"
                        ? "Under Safety"
                        : filter === "optimal"
                          ? "Optimal"
                          : filter === "overstock"
                            ? "Overstock"
                            : filter === "discontinued"
                              ? "Discontinued"
                              : filter}
              </Text>
              <X size={12} color={theme.primary} />
            </TouchableOpacity>
          )}
          {categoryFilter !== "all" && (
            <TouchableOpacity
              style={styles.activeFilterPill}
              onPress={() => setCategoryFilter("all")}
            >
              <MaterialCommunityIcons
                name={
                  categoryFilter === "portions"
                    ? "glass-wine"
                    : categoryFilter === "bottle_only"
                      ? "bottle-wine-outline"
                      : categoryFilter === "fun"
                        ? "lightning-bolt"
                        : categoryFilter === "fine"
                          ? "star"
                          : categoryFilter === "reserve"
                            ? "ghost"
                            : "bottle-wine-outline"
                }
                size={13}
                color={theme.primary}
              />
              <Text style={styles.activeFilterPillText}>
                {categoryFilter === "portions"
                  ? "Glass & Carafe"
                  : categoryFilter === "bottle_only"
                    ? "Bottle Only"
                    : categoryFilter === "fun"
                      ? "Fun Wine"
                      : categoryFilter === "fine"
                        ? "Fine Wine"
                        : categoryFilter === "reserve"
                          ? "Reserve Wine"
                          : "Standard"}
              </Text>
              <X size={12} color={theme.primary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => {
              setFilter("all");
              setCategoryFilter("all");
            }}
            style={styles.clearAllFiltersBtn}
          >
            <Text style={styles.clearAllFiltersText}>Clear</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* EXPANDABLE STATUS & CATEGORY FILTERS STRIP */}
      {showFilters && (
        <View style={styles.filtersSection}>
          <View style={styles.filtersHeaderBar}>
            <Text style={styles.filtersHeaderTitle}>FILTER BY STATUS & SERVING</Text>
            <TouchableOpacity onPress={() => setShowFilters(false)}>
              <Text style={styles.hideFiltersBtnText}>Hide filters ▲</Text>
            </TouchableOpacity>
          </View>

          {/* Status Chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterChipsRow}
          >
            {(
              [
                { key: "all", label: `All (${entries.length})`, icon: "layers-outline" },
                {
                  key: "needs_reorder",
                  label: `Reorder (${metrics.needsReorderCount})`,
                  icon: "alert-octagon-outline",
                  color: "#c2410c",
                },
                {
                  key: "stockout",
                  label: `Stockout (${metrics.stockoutCount})`,
                  icon: "close-circle-outline",
                  color: "#dc2626",
                },
                {
                  key: "par_alert",
                  label: `PAR Alert (${metrics.parAlertCount})`,
                  icon: "lightning-bolt-outline",
                  color: "#d97706",
                },
                {
                  key: "under_safety",
                  label: `Under Safety (${metrics.underSafetyCount})`,
                  icon: "shield-alert-outline",
                  color: "#ca8a04",
                },
                {
                  key: "optimal",
                  label: `Optimal (${metrics.optimalCount})`,
                  icon: "check-circle-outline",
                  color: "#059669",
                },
                {
                  key: "overstock",
                  label: `Overstock (${metrics.overstockCount})`,
                  icon: "trending-up",
                  color: "#2563eb",
                },
                {
                  key: "discontinued",
                  label: `Discontinued (${metrics.discontinuedCount})`,
                  icon: "cancel",
                  color: "#64748b",
                },
              ] as { key: FilterType; label: string; icon?: string; color?: string }[]
            ).map((chip) => {
              const isActive = filter === chip.key;
              return (
                <TouchableOpacity
                  key={chip.key}
                  style={[styles.filterChip, isActive && styles.filterChipActive]}
                  onPress={() => setFilter(chip.key)}
                >
                  {chip.icon && (
                    <MaterialCommunityIcons
                      name={chip.icon as any}
                      size={14}
                      color={isActive ? "#ffffff" : chip.color || theme.textSecondary}
                    />
                  )}
                  <Text
                    style={[
                      styles.filterChipText,
                      isActive && styles.filterChipTextActive,
                      !isActive && chip.color ? { color: chip.color } : null,
                    ]}
                  >
                    {chip.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Category & Serving Option Pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryChipsRow}
          >
            {(
              [
                { id: "all", label: "All Servings", icon: "layers-outline" },
                {
                  id: "portions",
                  label: "By Glass & Carafe",
                  icon: "glass-wine",
                  color: "#be185d",
                },
                {
                  id: "bottle_only",
                  label: "Bottle Only",
                  icon: "bottle-wine-outline",
                  color: "#64748b",
                },
                {
                  id: "fun",
                  label: "Fun Wine",
                  icon: "lightning-bolt",
                  color: "#d97706",
                },
                {
                  id: "fine",
                  label: "Fine Wine",
                  icon: "star",
                  color: "#be185d",
                },
                {
                  id: "reserve",
                  label: "Reserve Wine",
                  icon: "ghost",
                  color: "#4338ca",
                },
                {
                  id: "standard",
                  label: "Standard",
                  icon: "bottle-wine-outline",
                  color: theme.textSecondary,
                },
              ] as const
            ).map((cat) => {
              const isCatActive = categoryFilter === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => setCategoryFilter(cat.id as CategoryFilterType)}
                  style={[
                    styles.categoryChip,
                    isCatActive && styles.categoryChipActive,
                  ]}
                >
                  {cat.icon && (
                    <MaterialCommunityIcons
                      name={cat.icon as any}
                      size={14}
                      color={isCatActive ? "#ffffff" : (cat as any).color || theme.textSecondary}
                    />
                  )}
                  <Text
                    style={[
                      styles.categoryChipText,
                      isCatActive && styles.categoryChipTextActive,
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Wine List */}
      {loading ? (
        <ActivityIndicator
          size="large"
          color={theme.primary}
          style={{ flex: 1, marginTop: 40 }}
        />
      ) : (
        <FlatList
          data={filteredAndSortedEntries}
          renderItem={viewMode === "compact" ? renderCompactItem : renderDetailedItem}
          keyExtractor={(e) => e.masterWine.id}
          contentContainerStyle={[
            styles.list,
            itemsToRequest.length > 0 && { paddingBottom: 110 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <BarChart3 size={52} color={theme.border} strokeWidth={1.2} />
              <Text style={styles.emptyTitle}>No matching wines</Text>
              <Text style={styles.emptyText}>
                {searchQuery
                  ? `No wines matched "${searchQuery}" under current filters.`
                  : "No wines found under the selected status/category."}
              </Text>
              {(searchQuery || filter !== "all" || categoryFilter !== "all") && (
                <TouchableOpacity
                  style={styles.resetFilterBtn}
                  onPress={() => {
                    setSearchQuery("");
                    setFilter("all");
                    setCategoryFilter("all");
                  }}
                >
                  <Text style={styles.resetFilterBtnText}>Reset All Filters</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {/* FLOATING BATCH REPLENISHMENT BAR */}
      {itemsToRequest.length > 0 && !loading && (
        <View style={styles.batchRequestContainer}>
          <TouchableOpacity
            style={[
              styles.batchRequestButton,
              batchRequesting && styles.btnDisabled,
            ]}
            onPress={handleBatchRequest}
            disabled={batchRequesting}
            activeOpacity={0.85}
          >
            {batchRequesting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <View style={styles.batchCountBadge}>
                  <Text style={styles.batchCountBadgeText}>
                    {itemsToRequest.length}
                  </Text>
                </View>
                <Text style={styles.batchRequestButtonText}>
                  REQUEST REPLENISHMENT (
                  {itemsToRequest.reduce((sum, item) => sum + item.requestedQty, 0)}{" "}
                  BOTTLES)
                </Text>
                <TrendingUp size={18} color="#fff" strokeWidth={2.5} />
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* SORT SELECTION MODAL */}
      <Modal
        visible={isSortModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIsSortModalOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsSortModalOpen(false)}
        >
          <View style={styles.sortModalSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sortModalTitle}>Sort Inventory By</Text>

            {(
              [
                { id: "urgency", label: "Urgency & Deficit (Highest First)", icon: "alert-octagon-outline" },
                { id: "stock_asc", label: "Stock Count: Low to High", icon: "trending-down" },
                { id: "stock_desc", label: "Stock Count: High to Low", icon: "trending-up" },
                { id: "name_asc", label: "Wine Name (A to Z)", icon: "sort-alphabetical-ascending" },
                { id: "price_desc", label: "Retail Price: High to Low", icon: "tag-outline" },
              ] as const
            ).map((opt) => {
              const isSelected = sortBy === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.sortOptionItem, isSelected && styles.sortOptionSelected]}
                  onPress={() => {
                    setSortBy(opt.id);
                    setIsSortModalOpen(false);
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                    <MaterialCommunityIcons
                      name={opt.icon as any}
                      size={18}
                      color={isSelected ? theme.primary : theme.textSecondary}
                    />
                    <Text
                      style={[
                        styles.sortOptionText,
                        isSelected && { color: theme.primary, fontWeight: "800" },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </View>
                  {isSelected && <Check size={18} color={theme.primary} strokeWidth={2.5} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ADJUSTMENT & SETTINGS SHEET MODAL */}
      <Modal
        visible={!!selected}
        animationType="slide"
        transparent
        onRequestClose={closeSheet}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View
            style={[
              styles.sheetOverlay,
              isWide
                ? { justifyContent: "center", alignItems: "center", padding: 24 }
                : { justifyContent: "flex-end" },
            ]}
          >
            <View
              style={[
                styles.sheet,
                isWide
                  ? {
                      borderRadius: 24,
                      maxWidth: 580,
                      width: "100%",
                      maxHeight: "90%",
                      alignSelf: "center",
                    }
                  : {
                      borderTopLeftRadius: 28,
                      borderTopRightRadius: 28,
                      maxWidth: 540,
                      width: "100%",
                      alignSelf: "center",
                      maxHeight: "94%",
                    },
              ]}
            >
              <View style={styles.sheetHandle} />

              {/* ── COMPACT HEADER ── */}
              <View style={styles.sheetHeader}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <View style={styles.modalHeaderEyebrow}>
                    <SlidersHorizontal size={11} color={theme.primary} strokeWidth={2.2} />
                    <Text style={styles.modalHeaderEyebrowText}>CELLAR INVENTORY SETTINGS</Text>
                  </View>
                  <Text style={styles.sheetWineName} numberOfLines={2}>
                    {selected?.masterWine.name}
                  </Text>
                  <Text style={styles.sheetWineMeta}>
                    {[
                      selected?.masterWine.vintage,
                      selected?.masterWine.producer,
                      selected?.masterWine.format,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </View>
                <TouchableOpacity onPress={closeSheet} style={styles.closeBtn}>
                  <X size={22} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* ── STOCK SNAPSHOT STRIP ── */}
              <View style={styles.stockStrip}>
                <View style={styles.stockStripLeft}>
                  <Text style={styles.stockStripNum}>
                    {selected?.stockCount !== undefined
                      ? selected.stockCount % 1 === 0
                        ? selected.stockCount
                        : selected.stockCount.toFixed(2)
                      : 0}
                  </Text>
                  <View>
                    <Text style={styles.stockStripLabel}>BOTTLES IN STORE</Text>
                    <Text style={styles.stockStripSub}>
                      {selected?.openGlassesCount && selected.openGlassesCount > 0
                        ? `${selected.fullBottlesCount} sealed · ${selected.openGlassesCount}/6 glass open`
                        : `${selected?.fullBottlesCount ?? 0} sealed bottles`}
                    </Text>
                  </View>
                </View>
                {selected && (
                  <View
                    style={[
                      styles.statusChip,
                      { backgroundColor: STATUS_CONFIG[selected.status].bg },
                    ]}
                  >
                    <View
                      style={[
                        styles.statusChipDot,
                        { backgroundColor: STATUS_CONFIG[selected.status].accent },
                      ]}
                    />
                    <Text
                      style={[
                        styles.statusChipText,
                        { color: STATUS_CONFIG[selected.status].color },
                      ]}
                    >
                      {STATUS_CONFIG[selected.status].label}
                    </Text>
                  </View>
                )}
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                style={{ flexGrow: 1 }}
                keyboardShouldPersistTaps="handled"
              >
                {/* ── INVENTORY TARGETS: 2-COLUMN GRID ── */}
                <View style={styles.targetGrid}>
                  {/* PAR Alert Tile */}
                  <View style={[styles.targetTile, styles.targetTileLeft]}>
                    <View style={styles.targetTileHeader}>
                      <AlertTriangle size={13} color="#ea580c" />
                      <Text style={[styles.targetTileLabel, { color: "#ea580c" }]}>
                        PAR ALERT
                      </Text>
                    </View>
                    <Text style={styles.targetTileHint}>Reorder trigger level</Text>
                    <View style={[styles.stepperContainer, { marginTop: 10 }]}>
                      <TouchableOpacity style={styles.stepperBtn} onPress={() => stepPar(-1)}>
                        <Minus size={15} color="#ea580c" />
                      </TouchableOpacity>
                      <TextInput
                        style={[styles.input, styles.inputStepper]}
                        value={sheetPar}
                        onChangeText={setSheetPar}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor="#94a3b8"
                      />
                      <TouchableOpacity style={styles.stepperBtn} onPress={() => stepPar(1)}>
                        <Plus size={15} color="#ea580c" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Safety Target Tile */}
                  <View style={[styles.targetTile, styles.targetTileRight]}>
                    <View style={styles.targetTileHeader}>
                      <ShieldCheck size={13} color={theme.primary} />
                      <Text style={[styles.targetTileLabel, { color: theme.primary }]}>
                        SAFETY TARGET
                      </Text>
                    </View>
                    <Text style={styles.targetTileHint}>Ideal replenishment level</Text>
                    <View style={[styles.stepperContainer, { marginTop: 10 }]}>
                      <TouchableOpacity style={styles.stepperBtn} onPress={() => stepSafety(-1)}>
                        <Minus size={15} color={theme.primary} />
                      </TouchableOpacity>
                      <TextInput
                        style={[styles.input, styles.inputStepper]}
                        value={sheetSafety}
                        onChangeText={setSheetSafety}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor="#94a3b8"
                      />
                      <TouchableOpacity style={styles.stepperBtn} onPress={() => stepSafety(1)}>
                        <Plus size={15} color={theme.primary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* ── INLINE DEFICIT / BALANCE STATUS PILL ── */}
                {(() => {
                  const safetyNum = parseInt(sheetSafety, 10) || 0;
                  const parNum = parseInt(sheetPar, 10) || 0;
                  const stock = selected?.stockCount ?? 0;
                  const deficit = Math.ceil(Math.max(0, safetyNum - stock));
                  const valid = safetyNum >= parNum || (safetyNum === 0 && parNum === 0);
                  if (!sheetSafety && !sheetPar) return null;
                  return (
                    <View
                      style={[
                        styles.statusPill,
                        !valid
                          ? { backgroundColor: "#fef3c7", borderColor: "#fde68a" }
                          : deficit > 0
                            ? { backgroundColor: "#fef2f2", borderColor: "#fecaca" }
                            : { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusPillText,
                          !valid
                            ? { color: "#92400e" }
                            : deficit > 0
                              ? { color: "#991b1b" }
                              : { color: "#166534" },
                        ]}
                      >
                        {!valid
                          ? `⚠️  Safety Target must be ≥ PAR level`
                          : deficit > 0
                            ? `↓ ${deficit} bottle${deficit !== 1 ? "s" : ""} deficit  ·  Target (${safetyNum}) − Stock (${stock % 1 === 0 ? stock : stock.toFixed(1)}) = ${deficit}`
                            : `✓ Healthy stock balance  ·  Target (${safetyNum}) met`}
                      </Text>
                    </View>
                  );
                })()}

                {/* ── UNIFIED: SERVING MODE + CATEGORY + DISCONTINUED ── */}
                <View style={[styles.settingsCard, { marginTop: 14 }]}>
                  {/* Section A: Serving Mode */}
                  <View style={{ paddingVertical: 12 }}>
                    <Text style={styles.fieldLabel}>SERVING MODE</Text>
                    <Text style={styles.fieldHint}>How this wine is sold at POS</Text>
                    <View style={[styles.servingToggle, { marginTop: 10 }]}>
                      <TouchableOpacity
                        style={[
                          styles.servingToggleBtn,
                          !sheetAllowGlass && styles.servingToggleBtnActive,
                        ]}
                        onPress={() => {
                          setSheetAllowGlass(false);
                          setSheetAllowCarafe(false);
                          setSheetGlassPrice("");
                          setSheetCarafePrice("");
                        }}
                      >
                        <MaterialCommunityIcons
                          name="bottle-wine-outline"
                          size={14}
                          color={!sheetAllowGlass ? theme.primary : theme.textSecondary}
                        />
                        <Text
                          style={[
                            styles.servingToggleBtnText,
                            !sheetAllowGlass && styles.servingToggleBtnTextActive,
                          ]}
                        >
                          Bottle Only
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.servingToggleBtn,
                          sheetAllowGlass && styles.servingToggleBtnActive,
                        ]}
                        onPress={() => {
                          setSheetAllowGlass(true);
                          setSheetAllowCarafe(true);
                        }}
                      >
                        <MaterialCommunityIcons
                          name="glass-wine"
                          size={14}
                          color={sheetAllowGlass ? "#be185d" : theme.textSecondary}
                        />
                        <Text
                          style={[
                            styles.servingToggleBtnText,
                            sheetAllowGlass && {
                              color: "#be185d",
                              fontWeight: "800",
                            },
                          ]}
                        >
                          Glass & Carafe
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {sheetAllowGlass && (
                      <Text style={[styles.fieldHint, { marginTop: 6, color: "#be185d" + "99" }]}>
                        Glass & carafe prices visible in pricing below
                      </Text>
                    )}
                  </View>

                  <View style={styles.divider} />

                  {/* Section B: Wine Category */}
                  <View style={{ paddingVertical: 12 }}>
                    <Text style={styles.fieldLabel}>WINE CATEGORY</Text>
                    <Text style={styles.fieldHint}>
                      Menu prominence and staff priority level
                    </Text>
                    <View style={styles.categorySelectorGrid}>
                      {[
                        { id: "none", label: "Standard", icon: null, color: theme.textSecondary },
                        { id: "fun", label: "Fun Wine", icon: Zap, color: "#d97706", bg: "#fef3c7" },
                        { id: "fine", label: "Fine Wine", icon: Star, color: "#be185d", bg: "#fce7f3" },
                        {
                          id: "reserve",
                          label: "Reserve Wine",
                          icon: Ghost,
                          color: "#4338ca",
                          bg: "#e0e7ff",
                        },
                      ].map((cat) => {
                        const isSelected = sheetWineCategory === cat.id;
                        const Icon = cat.icon;
                        return (
                          <TouchableOpacity
                            key={cat.id}
                            onPress={() => setSheetWineCategory(cat.id as any)}
                            style={[
                              styles.catSelectBtn,
                              {
                                borderColor: isSelected ? cat.color : theme.border,
                                backgroundColor: isSelected
                                  ? (cat as any).bg || theme.card
                                  : "transparent",
                              },
                            ]}
                          >
                            {Icon && (
                              <Icon
                                size={14}
                                color={isSelected ? cat.color : theme.textSecondary}
                              />
                            )}
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: isSelected ? "800" : "500",
                                color: isSelected ? cat.color : theme.textSecondary,
                              }}
                            >
                              {cat.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  <View style={styles.divider} />

                  {/* Section C: Discontinued */}
                  <View style={styles.settingRow}>
                    <View style={styles.settingTextContainer}>
                      <Text style={styles.fieldLabel}>DISCONTINUED / INACTIVE</Text>
                      <Text style={styles.fieldHint}>
                        Stop reorder alerts and auto-replenishment requests.
                      </Text>
                    </View>
                    <Switch
                      value={sheetDiscontinued}
                      onValueChange={setSheetDiscontinued}
                      trackColor={{ false: "#e2e8f0", true: "#ef444460" }}
                      thumbColor={sheetDiscontinued ? "#ef4444" : "#94a3b8"}
                    />
                  </View>
                </View>

                {/* ── RETAIL PRICING ── */}
                <View style={[styles.settingsCard, { marginTop: 14 }]}>
                  <View style={{ flexDirection: "column", gap: 12, paddingVertical: 14 }}>
                    {/* Pricing Header + VAT toggle */}
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <View style={styles.settingTextContainer}>
                        <Text style={styles.fieldLabel}>RETAIL PRICING</Text>
                        <Text style={styles.fieldHint}>
                          Bottle{sheetAllowGlass ? ", glass (1/6) & carafe (2/6)" : " price"}
                        </Text>
                      </View>
                      <View style={styles.vatToggleContainer}>
                        <TouchableOpacity
                          onPress={() => setSheetVatMode("excluded")}
                          style={[
                            styles.vatPill,
                            sheetVatMode === "excluded" && styles.vatPillActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.vatPillText,
                              sheetVatMode === "excluded" && styles.vatPillTextActive,
                            ]}
                          >
                            EX VAT
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setSheetVatMode("included")}
                          style={[
                            styles.vatPill,
                            sheetVatMode === "included" && styles.vatPillActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.vatPillText,
                              sheetVatMode === "included" && styles.vatPillTextActive,
                            ]}
                          >
                            INC VAT
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Bottle Price — full row */}
                    <View style={styles.priceRow}>
                      <View style={styles.priceRowTitleGroup}>
                        <View style={styles.priceIconBadge}>
                          <MaterialCommunityIcons
                            name="bottle-wine-outline"
                            size={16}
                            color={theme.primary}
                          />
                        </View>
                        <View>
                          <Text style={styles.priceRowLabel}>Bottle Retail</Text>
                          <Text style={styles.priceRowSubLabel}>Full 75cl Bottle</Text>
                        </View>
                      </View>
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
                    </View>

                    {/* Glass & Carafe — side by side when active */}
                    {sheetAllowGlass && (
                      <View style={styles.pricingHalfRow}>
                        {/* Glass */}
                        <View style={styles.pricingHalf}>
                          <View style={styles.pricingHalfHeader}>
                            <MaterialCommunityIcons
                              name="glass-wine"
                              size={14}
                              color="#be185d"
                            />
                            <Text style={[styles.pricingHalfLabel, { color: "#be185d" }]}>
                              Glass Price (1/6)
                            </Text>
                          </View>
                          <View style={[styles.priceInputContainer, { width: "100%" }]}>
                            <Text style={styles.currencyPrefix}>₱</Text>
                            <TextInput
                              style={[styles.input, styles.inputPrice, { flex: 1 }]}
                              value={sheetGlassPrice}
                              onChangeText={setSheetGlassPrice}
                              keyboardType="decimal-pad"
                              placeholder="0.00"
                              placeholderTextColor="#94a3b8"
                            />
                          </View>
                        </View>

                        {/* Carafe */}
                        <View style={styles.pricingHalf}>
                          <View style={styles.pricingHalfHeader}>
                            <MaterialCommunityIcons
                              name="cup-water"
                              size={14}
                              color="#0284c7"
                            />
                            <Text style={[styles.pricingHalfLabel, { color: "#0284c7" }]}>
                              Carafe Price (2/6)
                            </Text>
                          </View>
                          <View style={[styles.priceInputContainer, { width: "100%" }]}>
                            <Text style={styles.currencyPrefix}>₱</Text>
                            <TextInput
                              style={[styles.input, styles.inputPrice, { flex: 1 }]}
                              value={sheetCarafePrice}
                              onChangeText={setSheetCarafePrice}
                              keyboardType="decimal-pad"
                              placeholder="0.00"
                              placeholderTextColor="#94a3b8"
                            />
                          </View>
                        </View>
                      </View>
                    )}
                  </View>
                </View>

                <View style={{ height: 24 }} />
              </ScrollView>

              {/* ── PINNED BOTTOM ACTIONS ── */}
              <View style={styles.sheetActionRow}>
                {selected?.activeRequest ? (
                  <TouchableOpacity
                    style={[styles.requestBtn, { flex: 1, marginTop: 0 }]}
                    onPress={() => {
                      closeSheet();
                      router.push(`/wine-requests/${selected.activeRequest!.id}`);
                    }}
                  >
                    {selected.activeRequest.status === "outbound" ||
                    selected.activeRequest.status === "converted" ? (
                      <Truck size={16} color={theme.primary} strokeWidth={2.5} />
                    ) : selected.activeRequest.status === "receiving" ? (
                      <CheckCircle2 size={16} color={theme.primary} strokeWidth={2.5} />
                    ) : (
                      <Clock size={16} color={theme.primary} strokeWidth={2.5} />
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
                        { flex: 1, marginTop: 0 },
                        requesting && styles.btnDisabled,
                      ]}
                      onPress={handleRequestStock}
                      disabled={requesting}
                    >
                      {requesting ? (
                        <ActivityIndicator color={theme.primary} />
                      ) : (
                        <>
                          <TrendingUp size={16} color={theme.primary} strokeWidth={2.5} />
                          <Text style={styles.requestBtnText}>
                            REQUEST {selected.requestedQty} BOTTLES
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )
                )}

                <TouchableOpacity
                  style={[
                    styles.saveBtn,
                    { flex: 1, marginTop: 0 },
                    saving && styles.btnDisabled,
                  ]}
                  onPress={handleSaveSettings}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.saveBtnText}>SAVE SETTINGS</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* BATCH CONFIRMATION MODAL */}
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
                <Text style={styles.sheetWineName}>Confirm Batch Replenishment</Text>
                <Text style={styles.sheetWineMeta}>
                  Requesting {itemsToRequest.length} wines (
                  {itemsToRequest.reduce((sum, item) => sum + item.requestedQty, 0)} total
                  bottles)
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
                  <View style={styles.confirmItemQty}>
                    <Text style={styles.confirmItemQtyText}>
                      +{item.requestedQty}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.confirmItemName} numberOfLines={1}>
                      {item.masterWine.name}
                    </Text>
                    <Text style={styles.confirmItemMeta}>
                      {[item.masterWine.vintage, item.masterWine.producer, item.masterWine.format]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.confirmItemStock}>
                      In Store: {item.stockCount}
                    </Text>
                    <Text style={styles.confirmItemTarget}>
                      Target: {item.setting?.safetyStock}
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
                <Text style={styles.saveBtnText}>SUBMIT TO WAREHOUSE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* SUCCESS CONFIRMATION MODAL */}
      <Modal visible={isSuccessVisible} animationType="fade" transparent>
        <View style={styles.successOverlay}>
          <View style={styles.successContainer}>
            <View style={styles.successIconContainer}>
              <CheckCircle2 size={48} color={theme.primary} strokeWidth={1.5} />
            </View>
            <Text style={styles.successTitle}>Replenishment Sent!</Text>
            <Text style={styles.successMessage}>
              Your stock request has been submitted to the central warehouse. You can
              track its pulling and delivery in Wine Requests.
            </Text>
            <TouchableOpacity
              style={[styles.successViewButton, { backgroundColor: theme.primary }]}
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
                style={[styles.successCloseButtonText, { color: theme.textSecondary }]}
              >
                CLOSE
              </Text>
            </TouchableOpacity>
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
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    backgroundColor: theme.card,
  },
  backBtn: { marginRight: 10 },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.primary + "10",
    borderWidth: 1,
    borderColor: theme.primary + "25",
  },
  viewModeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: theme.primary + "0C",
    borderWidth: 1,
    borderColor: theme.primary + "25",
    marginRight: 8,
  },
  viewModeBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.primary,
  },
  title: {
    fontSize: 20,
    fontWeight: "900",
    color: theme.text,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 12,
    color: theme.textSecondary,
    fontWeight: "600",
    marginTop: 1,
  },

  // KPI TILES HEADER
  kpiContainer: {
    backgroundColor: theme.card,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  kpiScrollContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  kpiCard: {
    backgroundColor: theme.background,
    borderRadius: 14,
    padding: 12,
    minWidth: 130,
    borderWidth: 1,
    borderColor: theme.border,
  },
  kpiCardActive: {
    borderColor: theme.primary,
    backgroundColor: theme.primary + "0A",
  },
  kpiCardAlert: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
  },
  kpiCardAlertActive: {
    borderColor: "#ea580c",
    backgroundColor: "#ffedd5",
  },
  kpiCardOptimalActive: {
    borderColor: "#10b981",
    backgroundColor: "#ecfdf5",
  },
  kpiCardOverstockActive: {
    borderColor: "#3b82f6",
    backgroundColor: "#eff6ff",
  },
  kpiCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  kpiCardLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: theme.textSecondary,
    letterSpacing: 0.5,
  },
  kpiCardValue: {
    fontSize: 20,
    fontWeight: "900",
    color: theme.text,
    lineHeight: 22,
  },
  kpiCardSub: {
    fontSize: 10,
    fontWeight: "600",
    color: theme.textSecondary,
    marginTop: 2,
  },

  // SEARCH AND TOOLBAR
  searchAndToolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 12,
    height: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: theme.text,
  },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
  },
  sortButtonActive: {
    borderColor: theme.primary,
    backgroundColor: theme.primary + "0A",
  },
  sortButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.textSecondary,
  },

  filterToggleButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
  },
  filterToggleButtonActive: {
    borderColor: theme.primary,
    backgroundColor: theme.primary + "0D",
  },
  filterToggleButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.textSecondary,
  },
  filterCountBadge: {
    backgroundColor: theme.primary,
    borderRadius: 9,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  filterCountBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
  },
  filtersHeaderBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 2,
  },
  filtersHeaderTitle: {
    fontSize: 10,
    fontWeight: "900",
    color: theme.textSecondary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  hideFiltersBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.primary,
  },
  activeFilterSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 6,
    gap: 6,
    flexWrap: "wrap",
  },
  activeFilterSummaryLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.textSecondary,
  },
  activeFilterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.primary + "12",
    borderColor: theme.primary + "30",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  activeFilterPillText: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.primary,
  },
  clearAllFiltersBtn: {
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  clearAllFiltersText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.textSecondary,
    textDecorationLine: "underline",
  },

  // FILTERS SECTION
  filtersSection: {
    paddingBottom: 8,
  },
  filterChipsRow: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 4,
    gap: 6,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
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
    fontSize: 12.5,
    fontWeight: "800",
    color: theme.textSecondary,
  },
  filterChipTextActive: {
    color: "#fff",
  },

  categoryChipsRow: {
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 8,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
  },
  categoryChipActive: {
    backgroundColor: theme.text,
    borderColor: theme.text,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.textSecondary,
  },
  categoryChipTextActive: {
    color: "#fff",
  },

  // LIST & EMPTY
  list: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 80,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.text,
    marginTop: 8,
  },
  emptyText: {
    fontSize: 13,
    color: theme.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
  resetFilterBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: theme.primary + "12",
  },
  resetFilterBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: theme.primary,
  },

  // COMPACT ROW STYLES (~70px height)
  compactRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.card,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: theme.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
  },
  rowStockoutHighlight: {
    borderColor: "#fecaca",
    backgroundColor: "#fffafa",
  },
  compactLeft: {
    flex: 1,
    paddingRight: 10,
  },
  compactTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  miniCatBadge: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  compactWineName: {
    fontSize: 13,
    fontWeight: "800",
    color: theme.text,
    letterSpacing: -0.1,
  },
  compactMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 3,
  },
  compactMetaText: {
    fontSize: 11,
    color: theme.textSecondary,
    fontWeight: "500",
    flexShrink: 1,
  },
  compactPriceText: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.primary,
  },
  compactRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginRight: 6,
  },
  compactStockPill: {
    flexDirection: "row",
    alignItems: "baseline",
    backgroundColor: theme.background,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  compactStockVal: {
    fontSize: 14,
    fontWeight: "900",
    color: theme.text,
  },
  compactStockTarget: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.textSecondary,
  },
  compactStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  compactStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  compactStatusText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  compactDeficitBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "#fff7ed",
    borderColor: "#ffedd5",
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  compactDeficitText: {
    fontSize: 9.5,
    fontWeight: "900",
    color: "#ea580c",
  },
  compactGlassBadge: {
    backgroundColor: "#3b82f612",
    borderColor: "#3b82f630",
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  compactGlassText: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#2563eb",
  },
  portionTagGlass: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fce7f3",
    borderColor: "#fbcfe8",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
    marginLeft: 4,
  },
  portionTagTextGlass: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#be185d",
  },
  portionTagCarafe: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#e0f2fe",
    borderColor: "#bae6fd",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
    marginLeft: 4,
  },
  portionTagTextCarafe: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#0284c7",
  },

  // DETAILED CARD STYLES
  detailedCard: {
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  wineName: {
    fontSize: 15,
    fontWeight: "800",
    color: theme.text,
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  wineMeta: {
    fontSize: 12,
    color: theme.textSecondary,
    fontWeight: "500",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sellingPrice: {
    fontSize: 13,
    fontWeight: "800",
    color: theme.primary,
    marginTop: 3,
    textAlign: "right",
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
  },
  indicatorBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  indicatorText: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  barContainer: {
    marginBottom: 8,
    marginTop: 2,
  },
  barStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 10,
  },
  stockHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stockPrimaryValue: {
    fontSize: 20,
    fontWeight: "900",
    color: theme.text,
    lineHeight: 22,
  },
  stockPrimaryLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: theme.textSecondary,
    letterSpacing: 0.5,
  },
  openGlassesBadge: {
    backgroundColor: "#3b82f612",
    borderColor: "#3b82f630",
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 4,
  },
  openGlassesText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#2563eb",
  },
  deficitBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fff7ed",
    paddingHorizontal: 8,
    paddingVertical: 4,
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
    height: 7,
    backgroundColor: "#f1f5f9",
    borderRadius: 4,
    position: "relative",
  },
  barFill: {
    height: "100%",
    borderRadius: 4,
  },
  parMarkerContainer: {
    position: "absolute",
    top: -11,
    width: 18,
    marginLeft: -9,
    alignItems: "center",
    zIndex: 10,
  },
  parMarkerArrow: {
    fontSize: 9,
    color: "#ea580c",
    lineHeight: 9,
    marginBottom: 1,
  },
  parMarkerLine: {
    width: 3,
    height: 10,
    backgroundColor: "#ea580c",
    borderRadius: 2,
    borderWidth: 1,
    borderColor: "#fff",
  },
  barLabelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
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
    marginTop: 6,
    marginBottom: 6,
  },
  requestedFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    padding: 8,
    borderRadius: 8,
  },
  requestedFooterText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // FLOATING BATCH BUTTON
  batchRequestContainer: {
    position: "absolute",
    bottom: 24,
    left: 16,
    right: 16,
    alignItems: "center",
  },
  batchRequestButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: theme.primary,
    height: 52,
    borderRadius: 26,
    paddingHorizontal: 20,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
    width: "100%",
    maxWidth: 480,
  },
  batchCountBadge: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  batchCountBadgeText: {
    fontSize: 11,
    fontWeight: "900",
    color: theme.primary,
  },
  batchRequestButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  // SORT MODAL
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sortModalSheet: {
    backgroundColor: theme.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
  },
  sortModalTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: theme.text,
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  sortOptionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: theme.background,
  },
  sortOptionSelected: {
    backgroundColor: theme.primary + "12",
    borderWidth: 1,
    borderColor: theme.primary + "30",
  },
  sortOptionText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.text,
  },

  // SETTINGS DRAWER SHEET
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: theme.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    maxHeight: "92%",
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.border,
    alignSelf: "center",
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  sheetWineName: {
    fontSize: 18,
    fontWeight: "900",
    color: theme.text,
    marginBottom: 2,
    letterSpacing: -0.4,
  },
  sheetWineMeta: {
    fontSize: 12,
    color: theme.textSecondary,
    fontWeight: "500",
  },
  closeBtn: { padding: 4 },
  sheetStockBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.background,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  sheetStockInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sheetStockVal: {
    fontSize: 26,
    fontWeight: "900",
    color: theme.text,
  },
  sheetStockLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: theme.textSecondary,
    letterSpacing: 0.5,
  },
  sheetStockSubLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.textSecondary,
  },

  settingsCard: {
    backgroundColor: theme.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 14,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  settingTextContainer: {
    flex: 1,
    paddingRight: 12,
  },
  divider: {
    height: 1,
    backgroundColor: theme.border,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: theme.textSecondary,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  fieldHint: {
    fontSize: 11,
    color: "#94a3b8",
    fontWeight: "500",
    lineHeight: 15,
    marginTop: 2,
  },
  portionToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  portionToggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    paddingRight: 12,
  },
  portionIconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  portionToggleTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.text,
  },
  portionToggleSub: {
    fontSize: 10,
    fontWeight: "500",
    color: theme.textSecondary,
    marginTop: 1,
  },
  stepperContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: "hidden",
  },
  stepperBtn: {
    width: 34,
    height: 38,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.background,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    height: 40,
    fontSize: 14,
    fontWeight: "800",
    color: theme.text,
    backgroundColor: theme.card,
  },
  inputStepper: {
    width: 50,
    textAlign: "center",
    borderWidth: 0,
    borderRadius: 0,
  },
  vatToggleContainer: {
    flexDirection: "row",
    backgroundColor: theme.primary + "12",
    borderRadius: 8,
    padding: 2,
  },
  vatPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  vatPillActive: {
    backgroundColor: theme.card,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  vatPillText: {
    fontSize: 9,
    fontWeight: "800",
    color: theme.primary + "80",
  },
  vatPillTextActive: {
    color: theme.primary,
  },

  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  priceRowTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  priceIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: theme.primary + "0E",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.primary + "1A",
  },
  priceRowLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: theme.text,
  },
  priceRowSubLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: theme.textSecondary,
    marginTop: 1,
  },
  priceInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    width: 130,
  },
  currencyPrefix: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.textSecondary,
    marginRight: 6,
  },
  inputPrice: {
    flex: 1,
    paddingHorizontal: 8,
    textAlign: "right",
  },

  categorySelectorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  catSelectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
  },

  formulaBox: {
    backgroundColor: theme.primary + "08",
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: theme.primary + "20",
  },
  formulaLabel: {
    fontSize: 9,
    fontWeight: "900",
    color: theme.primary,
    letterSpacing: 1,
    marginBottom: 4,
  },
  formulaText: {
    fontSize: 13,
    color: theme.text,
    fontWeight: "600",
    lineHeight: 18,
  },

  saveBtn: {
    backgroundColor: theme.primary,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    borderRadius: 14,
    marginTop: 18,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  requestBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: theme.primary,
    height: 50,
    borderRadius: 14,
    marginTop: 10,
  },
  requestBtnText: {
    color: theme.primary,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  btnDisabled: { opacity: 0.4 },

  // BATCH CONFIRM MODAL
  confirmItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  confirmItemQty: {
    backgroundColor: theme.primary + "12",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  confirmItemQtyText: {
    fontSize: 12,
    fontWeight: "900",
    color: theme.primary,
  },
  confirmItemName: { fontSize: 13, fontWeight: "700", color: theme.text },
  confirmItemMeta: { fontSize: 11, color: theme.textSecondary, marginTop: 1 },
  confirmItemStock: { fontSize: 11, color: theme.textSecondary, fontWeight: "600" },
  confirmItemTarget: { fontSize: 11, color: theme.primary, fontWeight: "700" },
  confirmActions: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  confirmCancelBtn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
  },
  confirmCancelBtnText: {
    color: theme.textSecondary,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },

  // SUCCESS OVERLAY
  successOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  successContainer: {
    backgroundColor: theme.card,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    width: "100%",
    maxWidth: 380,
  },
  successIconContainer: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.primary + "12",
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: theme.text,
    marginBottom: 6,
  },
  successMessage: {
    fontSize: 13,
    color: theme.textSecondary,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 18,
  },
  successViewButton: {
    width: "100%",
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  successViewButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  successCloseButton: { marginTop: 8, padding: 8 },
  successCloseButtonText: { fontSize: 13, fontWeight: "700" },

  // ─── STOCK SNAPSHOT STRIP ───────────────────────────────────────────
  stockStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.background,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  stockStripLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stockStripNum: {
    fontSize: 28,
    fontWeight: "900",
    color: theme.text,
    letterSpacing: -0.5,
  },
  stockStripLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: theme.textSecondary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  stockStripSub: {
    fontSize: 11,
    fontWeight: "500",
    color: theme.textSecondary,
    marginTop: 1,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  // ─── 2-COLUMN TARGET GRID ───────────────────────────────────────────
  targetGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  targetTile: {
    flex: 1,
    backgroundColor: theme.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 12,
  },
  targetTileLeft: {
    borderLeftWidth: 3,
    borderLeftColor: "#ea580c",
  },
  targetTileRight: {
    borderLeftWidth: 3,
    borderLeftColor: theme.primary,
  },
  targetTileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 2,
  },
  targetTileLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  targetTileHint: {
    fontSize: 10,
    color: theme.textSecondary,
    fontWeight: "500",
  },

  // ─── INLINE STATUS PILL ─────────────────────────────────────────────
  statusPill: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
  },

  // ─── SERVING MODE TOGGLE ────────────────────────────────────────────
  servingToggle: {
    flexDirection: "row",
    backgroundColor: theme.border + "50",
    borderRadius: 10,
    padding: 3,
    gap: 3,
  },
  servingToggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  servingToggleBtnActive: {
    backgroundColor: theme.card,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  servingToggleBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.textSecondary,
  },
  servingToggleBtnTextActive: {
    color: theme.primary,
    fontWeight: "800",
  },

  // ─── SIDE-BY-SIDE PRICING HALVES ────────────────────────────────────
  pricingHalfRow: {
    flexDirection: "row",
    gap: 10,
  },
  pricingHalf: {
    flex: 1,
    gap: 6,
  },
  pricingHalfHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 2,
  },
  pricingHalfLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
  },

  // ─── SHEET ACTION ROW ───────────────────────────────────────────────
  sheetActionRow: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 14,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    marginTop: 4,
  },

  // ─── ATELIER LUXURY CONTROLS ─────────────────────────────────────────
  compactTuneDial: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.primary + "0A",
    borderWidth: 1,
    borderColor: theme.primary + "20",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 6,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  compactStockUnset: {
    fontSize: 9.5,
    fontWeight: "700",
    color: "#b45309",
    fontStyle: "italic",
  },
  cellarGaugeFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: theme.border + "70",
  },
  cellarGaugeLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  cellarGaugeLabel: {
    fontSize: 9.5,
    fontWeight: "800",
    color: theme.textSecondary,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  cellarGaugeAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  cellarGaugeActionText: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.primary,
    letterSpacing: 0.2,
  },
  modalHeaderEyebrow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  modalHeaderEyebrowText: {
    fontSize: 10,
    fontWeight: "900",
    color: theme.primary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
});