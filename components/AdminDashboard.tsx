import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useResponsivePadding } from "@/hooks/useResponsivePadding";
import { apiFetch } from "@/lib/api";
import { clearToken } from "@/lib/auth";
import { getStores } from "@/lib/queries";
import { Delivery, PulloutRequest } from "@/types";
import { useFocusEffect, useRouter } from "expo-router";
import {
  AlertOctagon,
  AlertTriangle,
  Banknote,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  FlaskConical,
  Gem,
  Ghost,
  GlassWater,
  LayoutList,
  LogOut,
  Package,
  PackageCheck,
  RotateCcw,
  Search,
  Smile,
  Tag,
  Truck,
  Wine,
} from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";

interface StoreAlerts {
  storeId: string;
  storeName: string;
  stockout: number;
  parAlert: number;
  underSafety: number;
}

interface StoreSalesBreakdown {
  storeId: string;
  storeName: string;
  revenue: number;
  volume: number;
  count: number;
  percentage: number;
  types: { label: string; count: number; revenue: number }[];
  categories: { label: string; count: number; revenue: number }[];
}

interface TypeSalesBreakdown {
  type: "bottle" | "glass" | "carafe";
  label: string;
  count: number;
  revenue: number;
  volume: number;
  percentage: number;
  stores: { storeId: string; storeName: string; count: number; revenue: number }[];
}

interface CategorySalesBreakdown {
  categoryKey: string;
  label: string;
  badgeColor: string;
  count: number;
  revenue: number;
  volume: number;
  percentage: number;
  stores: { storeId: string; storeName: string; count: number; revenue: number }[];
}

const theme = Colors.admin;

function getCategoryIcon(key: string, color: string, size = 14) {
  switch (key) {
    case "fun":
      return <Smile size={size} color={color} strokeWidth={2.2} />;
    case "fine":
      return <Gem size={size} color={color} strokeWidth={2.2} />;
    case "reserve":
    case "reserved":
      return <Ghost size={size} color={color} strokeWidth={2.2} />;
    default:
      return <Wine size={size} color={color} strokeWidth={2.2} />;
  }
}

function getPortionIcon(type: string, color: string, size = 14) {
  switch (type) {
    case "glass":
      return <GlassWater size={size} color={color} strokeWidth={2.2} />;
    case "carafe":
      return <FlaskConical size={size} color={color} strokeWidth={2.2} />;
    default:
      return <Wine size={size} color={color} strokeWidth={2.2} />;
  }
}

function formatCurrency(value: number) {
  return `₱${value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function AdminDashboard() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { profile } = useAuth();
  const { notification } = usePushNotifications();

  const { horizontalPadding, isLandscape, isTablet } = useResponsivePadding(20);
  const containerPadding = horizontalPadding * 2;

  const storeCardsPerRow = isLandscape || isTablet ? 5 : 2;
  const storeTotalGap = 12 * (storeCardsPerRow - 1);
  const storeTileWidth = (width - containerPadding - storeTotalGap) / storeCardsPerRow;

  const [salesPeriod, setSalesPeriod] = useState<"today" | "week" | "all">("today");
  const [breakdownMode, setBreakdownMode] = useState<"store" | "category" | "type">("store");
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const [salesMetrics, setSalesMetrics] = useState({ totalRevenue: 0, totalItems: 0 });
  const [storeSales, setStoreSales] = useState<StoreSalesBreakdown[]>([]);
  const [categorySales, setCategorySales] = useState<CategorySalesBreakdown[]>([]);
  const [typeSales, setTypeSales] = useState<TypeSalesBreakdown[]>([]);
  const [loadingSales, setLoadingSales] = useState(true);

  const [storeAlerts, setStoreAlerts] = useState<StoreAlerts[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(true);

  const [pulloutTasks, setPulloutTasks] = useState<PulloutRequest[]>([]);
  const [incomingDeliveries, setIncomingDeliveries] = useState<Delivery[]>([]);
  const [storeMap, setStoreMap] = useState<Record<string, string>>({});
  const [loadingTasks, setLoadingTasks] = useState(true);

  const [refreshing, setRefreshing] = useState(false);
  const [isFirstLoad, setIsFirstLoad] = useState(true);

  const [cacheToast, setCacheToast] = useState<string | null>(null);
  const [isClearingCache, setIsClearingCache] = useState(false);

  // ── Sales metrics ──────────────────────────────────────────────────────────
  const fetchSalesMetrics = useCallback(async (forceNoCache = false) => {
    if (forceNoCache) setIsClearingCache(true);
    setLoadingSales(true);
    try {
      let startDate: Date;
      if (salesPeriod === "today") {
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
      } else if (salesPeriod === "week") {
        startDate = new Date();
        startDate.setDate(startDate.getDate() - startDate.getDay());
        startDate.setHours(0, 0, 0, 0);
      } else {
        startDate = new Date(0);
      }

      const params = new URLSearchParams({
        from: startDate.toISOString(),
        to: new Date().toISOString(),
      });
      if (forceNoCache) params.set("_t", Date.now().toString());

      const [data, allStores] = await Promise.all([
        apiFetch(`/sales?${params}`),
        getStores(),
      ]);

      let salesList: any[] = Array.isArray(data) ? data : Array.isArray(data.sales) ? data.sales : [];
      if (profile?.role === "store_staff" && profile) {
        salesList = salesList.filter(
          (item: any) =>
            item.soldById === profile.id ||
            (item.soldByEmail && profile.email && item.soldByEmail.toLowerCase() === profile.email.toLowerCase())
        );
      }
      let totalRevenue = 0;
      let totalVolume = 0;

      const storeNameMap: Record<string, string> = {};
      allStores.forEach((s) => {
        storeNameMap[s.id] = s.name;
      });

      const storeAgg: Record<
        string,
        {
          storeName: string;
          revenue: number;
          volume: number;
          count: number;
          typeCounts: Record<string, { count: number; revenue: number }>;
          catCounts: Record<string, { count: number; revenue: number }>;
        }
      > = {};

      const typeAgg: Record<
        string,
        {
          label: string;
          count: number;
          revenue: number;
          volume: number;
          stores: Record<string, { storeId: string; storeName: string; count: number; revenue: number }>;
        }
      > = {
        bottle: { label: "Full Bottle", count: 0, revenue: 0, volume: 0, stores: {} },
        glass: { label: "Glass (1/6)", count: 0, revenue: 0, volume: 0, stores: {} },
        carafe: { label: "Carafe (2/6)", count: 0, revenue: 0, volume: 0, stores: {} },
      };

      const categoryAgg: Record<
        string,
        {
          label: string;
          badgeColor: string;
          count: number;
          revenue: number;
          volume: number;
          stores: Record<string, { storeId: string; storeName: string; count: number; revenue: number }>;
        }
      > = {
        fun: { label: "Fun Wine", badgeColor: "#f59e0b", count: 0, revenue: 0, volume: 0, stores: {} },
        fine: { label: "Fine Wine", badgeColor: "#ec4899", count: 0, revenue: 0, volume: 0, stores: {} },
        reserve: { label: "Reserve Collection", badgeColor: "#6366f1", count: 0, revenue: 0, volume: 0, stores: {} },
        other: { label: "Standard Catalog", badgeColor: "#64748b", count: 0, revenue: 0, volume: 0, stores: {} },
      };

      salesList.forEach((item: any) => {
        const rev = Number(item.totalAmount || item.price || 0);
        totalRevenue += rev;

        const st = (item.saleType || "bottle").toLowerCase();
        let vol = 1;
        if (st === "glass") {
          vol = 1 / 6;
        } else if (st === "carafe") {
          vol = 2 / 6;
        } else {
          vol = Number(item.quantity || 1);
        }
        totalVolume += vol;

        const sId = item.storeId || item.store?.id || "unknown";
        const sName = item.store?.name || storeNameMap[sId] || "Boutique Store";

        // Store grouping
        if (!storeAgg[sId]) {
          storeAgg[sId] = {
            storeName: sName,
            revenue: 0,
            volume: 0,
            count: 0,
            typeCounts: {},
            catCounts: {},
          };
        }
        storeAgg[sId].revenue += rev;
        storeAgg[sId].volume += vol;
        storeAgg[sId].count += 1;

        const tKey = st === "glass" ? "glass" : st === "carafe" ? "carafe" : "bottle";
        if (!storeAgg[sId].typeCounts[tKey]) {
          storeAgg[sId].typeCounts[tKey] = { count: 0, revenue: 0 };
        }
        storeAgg[sId].typeCounts[tKey].count += 1;
        storeAgg[sId].typeCounts[tKey].revenue += rev;

        // Type grouping
        typeAgg[tKey].count += 1;
        typeAgg[tKey].revenue += rev;
        typeAgg[tKey].volume += vol;
        if (!typeAgg[tKey].stores[sId]) {
          typeAgg[tKey].stores[sId] = { storeId: sId, storeName: sName, count: 0, revenue: 0 };
        }
        typeAgg[tKey].stores[sId].count += 1;
        typeAgg[tKey].stores[sId].revenue += rev;

        // Wine Category grouping
        const catRaw = (item.masterWine?.wineCategory || item.wineCategory || "other").toLowerCase();
        const cKey = (catRaw === "fun" || catRaw === "fast") ? "fun" : catRaw === "fine" ? "fine" : (catRaw === "reserve" || catRaw === "reserved") ? "reserve" : "other";

        if (!storeAgg[sId].catCounts[cKey]) {
          storeAgg[sId].catCounts[cKey] = { count: 0, revenue: 0 };
        }
        storeAgg[sId].catCounts[cKey].count += 1;
        storeAgg[sId].catCounts[cKey].revenue += rev;

        categoryAgg[cKey].count += 1;
        categoryAgg[cKey].revenue += rev;
        categoryAgg[cKey].volume += vol;
        if (!categoryAgg[cKey].stores[sId]) {
          categoryAgg[cKey].stores[sId] = { storeId: sId, storeName: sName, count: 0, revenue: 0 };
        }
        categoryAgg[cKey].stores[sId].count += 1;
        categoryAgg[cKey].stores[sId].revenue += rev;
      });

      const roundedTotalVolume = Math.round(totalVolume * 100) / 100;

      const storeList: StoreSalesBreakdown[] = Object.entries(storeAgg)
        .map(([sId, val]) => ({
          storeId: sId,
          storeName: val.storeName,
          revenue: val.revenue,
          volume: Math.round(val.volume * 100) / 100,
          count: val.count,
          percentage: totalRevenue > 0 ? Math.round((val.revenue / totalRevenue) * 100) : 0,
          types: Object.entries(val.typeCounts).map(([tk, tv]) => ({
            label: tk === "glass" ? "Glass (1/6)" : tk === "carafe" ? "Carafe (2/6)" : "Full Bottle",
            count: tv.count,
            revenue: tv.revenue,
          })),
          categories: Object.entries(val.catCounts).map(([ck, cv]) => ({
            label: categoryAgg[ck]?.label || "Standard Catalog",
            count: cv.count,
            revenue: cv.revenue,
          })),
        }))
        .sort((a, b) => b.revenue - a.revenue);

      const categoryList: CategorySalesBreakdown[] = Object.entries(categoryAgg)
        .map(([cKey, val]) => ({
          categoryKey: cKey,
          label: val.label,
          badgeColor: val.badgeColor,
          count: val.count,
          revenue: val.revenue,
          volume: Math.round(val.volume * 100) / 100,
          percentage: totalRevenue > 0 ? Math.round((val.revenue / totalRevenue) * 100) : 0,
          stores: Object.values(val.stores).sort((a, b) => b.revenue - a.revenue),
        }))
        .filter((item) => item.count > 0 || item.revenue > 0)
        .sort((a, b) => b.revenue - a.revenue);

      const typeList: TypeSalesBreakdown[] = Object.entries(typeAgg).map(([key, val]) => ({
        type: key as any,
        label: val.label,
        count: val.count,
        revenue: val.revenue,
        volume: Math.round(val.volume * 100) / 100,
        percentage: totalRevenue > 0 ? Math.round((val.revenue / totalRevenue) * 100) : 0,
        stores: Object.values(val.stores).sort((a, b) => b.revenue - a.revenue),
      }));

      setSalesMetrics({
        totalRevenue: Number(data.totalRevenue ?? totalRevenue),
        totalItems: roundedTotalVolume,
      });
      setStoreSales(storeList);
      setCategorySales(categoryList);
      setTypeSales(typeList);
    } catch (e) {
      console.error("Admin: failed to fetch sales metrics", e);
    } finally {
      setLoadingSales(false);
      setIsClearingCache(false);
    }
  }, [salesPeriod]);

  const handleClearCache = async () => {
    setCacheToast(null);
    await fetchSalesMetrics(true);
    setCacheToast("Cache cleared! Sales metrics updated.");
    setTimeout(() => setCacheToast(null), 3000);
  };

  // ── Per-store inventory alerts ──────────────────────────────────────────────
  const fetchStoreAlerts = useCallback(async () => {
    setLoadingAlerts(true);
    try {
      const allStores = await getStores();
      const boutiqueStores = allStores.filter(
        (s) => s.type?.toLowerCase() !== "warehouse"
      );

      const alertsList: StoreAlerts[] = await Promise.all(
        boutiqueStores.map(async (store) => {
          const settingsData = await apiFetch(`/stock-settings?storeId=${store.id}`);
          const settingsList: any[] = settingsData.settings || settingsData;
          const activeSettings = settingsList.filter((s: any) => !s.discontinued);

          const bottlesData = await apiFetch(`/bottles?storeId=${store.id}&status=received,shelved`);
          const bottlesList: any[] = bottlesData.bottles || bottlesData;

          const countsByWine: Record<string, number> = {};
          bottlesList.forEach((b) => {
            const wId = b.masterWineId || b.masterWineRef?.id;
            if (wId) countsByWine[wId] = (countsByWine[wId] || 0) + 1;
          });

          let stockout = 0;
          let parAlert = 0;
          let underSafety = 0;

          activeSettings.forEach((setting: any) => {
            const { parLevel = 0, safetyStock = 0, masterWineId } = setting;
            const count = countsByWine[masterWineId] || 0;

            if (count === 0) {
              stockout++;
            } else if (safetyStock > 0 && count < safetyStock) {
              underSafety++;
            } else if (parLevel > 0 && count <= parLevel) {
              parAlert++;
            }
          });

          return {
            storeId: store.id,
            storeName: store.name,
            stockout,
            parAlert,
            underSafety,
          };
        })
      );

      setStoreAlerts(alertsList);
    } catch (e) {
      console.error("Admin: failed to fetch store alerts", e);
    } finally {
      setLoadingAlerts(false);
    }
  }, []);

  // ── All-store pullout/delivery tasks ───────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    setLoadingTasks(true);
    try {
      const [pulloutsData, deliveriesData, allStores] = await Promise.all([
        apiFetch("/pullout-requests?status=pending,in_progress"),
        apiFetch("/deliveries?status=dispatched,receiving"),
        getStores(),
      ]);

      const locMap: Record<string, string> = {};
      allStores.forEach((s) => (locMap[s.id] = s.name));
      setStoreMap(locMap);

      setPulloutTasks((pulloutsData.pulloutRequests || pulloutsData) as PulloutRequest[]);
      setIncomingDeliveries((deliveriesData.deliveries || deliveriesData) as Delivery[]);
    } catch (e) {
      console.error("Admin: failed to fetch tasks", e);
    } finally {
      setLoadingTasks(false);
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([fetchSalesMetrics(), fetchStoreAlerts(), fetchTasks()]);
    setIsFirstLoad(false);
  }, [fetchSalesMetrics, fetchStoreAlerts, fetchTasks]);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  useEffect(() => {
    if (notification) {
      loadAll();
    }
  }, [notification, loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to exit the system?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Exit System",
        style: "destructive",
        onPress: async () => {
          await clearToken();
          router.replace("/login");
        },
      },
    ]);
  };

  const totalAlertStores = storeAlerts.filter(
    (s) => s.stockout + s.parAlert + s.underSafety > 0
  ).length;

  const totalStockouts = storeAlerts.reduce((acc, s) => acc + s.stockout, 0);
  const totalParAlerts = storeAlerts.reduce((acc, s) => acc + s.parAlert, 0);
  const totalUnderSafety = storeAlerts.reduce((acc, s) => acc + s.underSafety, 0);
  const totalDeficitWines = totalStockouts + totalParAlerts + totalUnderSafety;

  if (isFirstLoad) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <View style={styles.logoBadge}>
          <Wine size={32} color="#ffffff" strokeWidth={2.5} />
        </View>
        <ActivityIndicator color={theme.primary} style={{ marginTop: 24 }} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: horizontalPadding },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.primary]}
            tintColor={theme.primary}
          />
        }
      >
        {/* ── Header (Matching home.tsx) ─────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.logoRow}>
              <View style={styles.logoBadge}>
                <Wine size={22} color="#fff" strokeWidth={2.5} />
              </View>
              <View>
                <Text style={styles.title}>
                  CaveauOne<Text style={{ color: theme.secondary, fontWeight: "400" }}> Admin</Text>
                </Text>
                <View style={styles.rolePill}>
                  <Text style={styles.rolePillText}>ALL STORES OVERVIEW</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={styles.signOutButton}
              onPress={handleSignOut}
              activeOpacity={0.8}
            >
              <LogOut size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>Welcome, {profile?.email}</Text>
        </View>

        {/* ── Top Executive Overview (2-Card Row matching home.tsx) ──────── */}
        <View style={styles.topRowContainer}>
          {/* Left Card: All-Store Sales Revenue */}
          <TouchableOpacity
            style={[
              styles.dashboardTopCard,
              {
                backgroundColor: theme.card,
                borderColor: theme.primary + "35",
              },
            ]}
            onPress={() => router.push({ pathname: "/sales", params: { period: salesPeriod } })}
            activeOpacity={0.85}
          >
            {/* Row 1 */}
            <View style={styles.topCardRow1}>
              <View style={styles.topCardRow1Left}>
                <View style={[styles.topCardIconCircle, { backgroundColor: theme.primary + "18" }]}>
                  <Banknote size={14} color={theme.primary} strokeWidth={2.4} />
                </View>
                <Text style={[styles.topCardTitle, { color: theme.text }]} numberOfLines={1}>
                  All-Store Sales
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <View style={[styles.liveDot, { backgroundColor: "#10b981" }]} />
                <Text style={[styles.topCardBadgeText, { color: "#059669" }]}>
                  {salesPeriod === "today" ? "TODAY" : salesPeriod === "week" ? "THIS WEEK" : "ALL TIME"}
                </Text>
              </View>
            </View>

            {/* Row 2 */}
            <View style={styles.topCardRow2}>
              <Text style={[styles.topCardSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                {formatCurrency(salesMetrics.totalRevenue)} · {salesMetrics.totalItems} btl
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                <Text style={[styles.topCardActionText, { color: theme.primary }]}>View</Text>
                <ChevronRight size={13} color={theme.primary} />
              </View>
            </View>
          </TouchableOpacity>

          {/* Right Card: Boutique Inventory Health */}
          <TouchableOpacity
            style={[
              styles.dashboardTopCard,
              {
                backgroundColor: theme.card,
                borderColor: totalDeficitWines > 0 ? "rgba(239, 68, 68, 0.35)" : "rgba(16, 185, 129, 0.35)",
              },
            ]}
            onPress={() => router.push("/store-master-list")}
            activeOpacity={0.85}
          >
            {/* Row 1 */}
            <View style={styles.topCardRow1}>
              <View style={styles.topCardRow1Left}>
                <View
                  style={[
                    styles.topCardIconCircle,
                    { backgroundColor: totalDeficitWines > 0 ? "rgba(239, 68, 68, 0.12)" : "rgba(16, 185, 129, 0.12)" },
                  ]}
                >
                  {totalDeficitWines > 0 ? (
                    <AlertOctagon size={14} color="#ef4444" strokeWidth={2.4} />
                  ) : (
                    <CheckCircle2 size={14} color="#10b981" strokeWidth={2.4} />
                  )}
                </View>
                <Text style={[styles.topCardTitle, { color: theme.text }]} numberOfLines={1}>
                  {totalDeficitWines > 0 ? "Inventory Alerts" : "Inventory Healthy"}
                </Text>
              </View>
              <View
                style={[
                  styles.deliveryStatusBadge,
                  {
                    backgroundColor: totalDeficitWines > 0 ? "rgba(239, 68, 68, 0.12)" : "rgba(16, 185, 129, 0.12)",
                    borderColor: totalDeficitWines > 0 ? "rgba(239, 68, 68, 0.25)" : "rgba(16, 185, 129, 0.25)",
                    paddingVertical: 1,
                    paddingHorizontal: 5,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.deliveryStatusBadgeText,
                    { color: totalDeficitWines > 0 ? "#ef4444" : "#059669", fontSize: 9 },
                  ]}
                >
                  {totalDeficitWines > 0 ? `${totalDeficitWines} ALERTS` : "HEALTHY"}
                </Text>
              </View>
            </View>

            {/* Row 2 */}
            <View style={styles.topCardRow2}>
              <Text style={[styles.topCardSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                {totalDeficitWines > 0
                  ? `${totalAlertStores} store${totalAlertStores === 1 ? "" : "s"} · ${totalDeficitWines} items`
                  : "All boutiques stocked"}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                <Text
                  style={[
                    styles.topCardActionText,
                    { color: totalDeficitWines > 0 ? "#ef4444" : "#059669" },
                  ]}
                >
                  {totalDeficitWines > 0 ? "Review" : "View"}
                </Text>
                <ChevronRight size={13} color={totalDeficitWines > 0 ? "#ef4444" : "#059669"} />
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* ── Sales Performance Grid (Compact cards matching home.tsx) ──── */}
        <View style={styles.metricsDashboard}>
          <View style={styles.metricsHeaderRow}>
            <Text style={styles.metricsTitle}>Sales Performance</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <TouchableOpacity
                style={styles.cacheClearBtn}
                onPress={handleClearCache}
                disabled={isClearingCache}
                activeOpacity={0.75}
              >
                <RotateCcw size={11} color={theme.primary} />
                <Text style={styles.cacheClearText}>
                  {isClearingCache ? "..." : "Refresh"}
                </Text>
              </TouchableOpacity>

              <View style={styles.periodRow}>
                {(["today", "week", "all"] as const).map((p) => (
                  <TouchableOpacity
                    key={p}
                    onPress={() => setSalesPeriod(p)}
                    style={[
                      styles.periodBtn,
                      salesPeriod === p && { backgroundColor: theme.primary },
                    ]}
                  >
                    <Text
                      style={[
                        styles.periodBtnText,
                        salesPeriod === p && { color: "#fff" },
                      ]}
                    >
                      {p === "today" ? "Today" : p === "week" ? "Week" : "All"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                onPress={() => router.push({ pathname: "/sales", params: { period: salesPeriod } })}
                style={styles.viewAllBtn}
                activeOpacity={0.8}
              >
                <Text style={styles.viewAllBtnText}>View All →</Text>
              </TouchableOpacity>
            </View>
          </View>

          {cacheToast && (
            <View style={styles.toastBanner}>
              <RotateCcw size={12} color="#15803d" />
              <Text style={styles.toastText}>{cacheToast}</Text>
            </View>
          )}

          <View style={styles.symmetricalSalesRow}>
            {/* Card 1: Total Revenue */}
            <TouchableOpacity
              style={[
                styles.symmetricalCard,
                { backgroundColor: theme.primary, borderColor: theme.primary },
              ]}
              onPress={() => router.push({ pathname: "/sales", params: { period: salesPeriod } })}
              activeOpacity={0.8}
            >
              <View style={styles.symmetricalRow1}>
                <View style={styles.symmetricalIconCircleSmall}>
                  <Banknote size={12} color="#ffffff" strokeWidth={2.4} />
                </View>
                {loadingSales && !isFirstLoad && !refreshing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.symmetricalCardValue} numberOfLines={1} adjustsFontSizeToFit>
                    ₱{salesMetrics.totalRevenue?.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </Text>
                )}
              </View>
              <Text style={styles.symmetricalCardSubtitle} numberOfLines={1} adjustsFontSizeToFit>
                Total Revenue · {salesPeriod === "today" ? "Today" : salesPeriod === "week" ? "This Week" : "All Time"}
              </Text>
            </TouchableOpacity>

            {/* Card 2: Bottles Sold */}
            <TouchableOpacity
              style={[
                styles.symmetricalCard,
                { backgroundColor: theme.secondary, borderColor: theme.secondary },
              ]}
              onPress={() => router.push({ pathname: "/sales", params: { period: salesPeriod } })}
              activeOpacity={0.8}
            >
              <View style={styles.symmetricalRow1}>
                <View style={styles.symmetricalIconCircleSmall}>
                  <Wine size={12} color="#ffffff" strokeWidth={2.4} />
                </View>
                {loadingSales && !isFirstLoad && !refreshing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.symmetricalCardValue} numberOfLines={1} adjustsFontSizeToFit>
                    {salesMetrics.totalItems % 1 === 0 ? salesMetrics.totalItems : salesMetrics.totalItems.toFixed(1)}
                    <Text style={styles.symmetricalCardUnit}> btl</Text>
                  </Text>
                )}
              </View>
              <Text style={styles.symmetricalCardSubtitle} numberOfLines={1} adjustsFontSizeToFit>
                Bottles Sold · {salesPeriod === "today" ? "Today" : salesPeriod === "week" ? "This Week" : "All Time"}
              </Text>
            </TouchableOpacity>

            {/* Card 3: Active Boutiques */}
            <TouchableOpacity
              style={[
                styles.symmetricalCard,
                { backgroundColor: "#64748b", borderColor: "#64748b" },
              ]}
              onPress={() => router.push("/store-master-list")}
              activeOpacity={0.8}
            >
              <View style={styles.symmetricalRow1}>
                <View style={styles.symmetricalIconCircleSmall}>
                  <Building2 size={12} color="#ffffff" strokeWidth={2.4} />
                </View>
                <Text style={styles.symmetricalCardValue} numberOfLines={1} adjustsFontSizeToFit>
                  {storeAlerts.length}
                  <Text style={styles.symmetricalCardUnit}> stores</Text>
                </Text>
              </View>
              <Text style={styles.symmetricalCardSubtitle} numberOfLines={1} adjustsFontSizeToFit>
                Boutiques · Network
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Sales Breakdown & Insights (Compact Drilldown) ─────────────── */}
        <View style={styles.metricsDashboard}>
          <TouchableOpacity
            style={styles.metricsHeaderRow}
            onPress={() => setShowBreakdown((prev) => !prev)}
            activeOpacity={0.7}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={styles.metricsTitle}>Sales Breakdown & Insights</Text>
            </View>
            <View style={styles.headerActionLink}>
              <Text style={styles.headerActionLinkText}>
                {showBreakdown ? "Hide" : "Show Breakdown"}
              </Text>
              {showBreakdown ? (
                <ChevronUp size={13} color={theme.primary} strokeWidth={2.4} />
              ) : (
                <ChevronDown size={13} color={theme.primary} strokeWidth={2.4} />
              )}
            </View>
          </TouchableOpacity>

          {showBreakdown && (
            <>
              <View style={styles.drilldownTabRow}>
                {[
                  { id: "store", label: "By Store", icon: (color: string) => <Building2 size={13} color={color} strokeWidth={2.2} /> },
                  { id: "category", label: "By Category", icon: (color: string) => <Tag size={13} color={color} strokeWidth={2.2} /> },
                  { id: "type", label: "By Portion", icon: (color: string) => <Wine size={13} color={color} strokeWidth={2.2} /> },
                ].map((t) => {
                  const isActive = breakdownMode === t.id;
                  const iconColor = isActive ? "#ffffff" : theme.textSecondary;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      onPress={() => {
                        setBreakdownMode(t.id as any);
                        setExpandedCardId(null);
                      }}
                      style={[
                        styles.drilldownTabBtn,
                        isActive && styles.drilldownTabBtnActive,
                      ]}
                      activeOpacity={0.8}
                    >
                      {t.icon(iconColor)}
                      <Text
                        style={[
                          styles.drilldownTabText,
                          isActive && styles.drilldownTabTextActive,
                        ]}
                      >
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Multi-Segmented Proportional Distribution Bar */}
              {(() => {
                const STORE_COLORS = [
                  theme.primary,
                  theme.accent,
                  theme.secondary,
                  "#ec4899",
                  "#06b6d4",
                  "#8b5cf6",
                  "#64748b",
                ];
                let currentList: { label: string; percentage: number; color: string }[] = [];
                if (breakdownMode === "store") {
                  currentList = storeSales.map((s, idx) => ({
                    label: s.storeName,
                    percentage: s.percentage,
                    color: STORE_COLORS[idx % STORE_COLORS.length],
                  }));
                } else if (breakdownMode === "category") {
                  currentList = categorySales.map((c) => ({
                    label: c.label,
                    percentage: c.percentage,
                    color: c.badgeColor,
                  }));
                } else {
                  currentList = typeSales.map((t) => ({
                    label: t.label,
                    percentage: t.percentage,
                    color: t.type === "bottle" ? theme.primary : t.type === "glass" ? theme.accent : theme.secondary,
                  }));
                }

                const hasData = currentList.some((i) => i.percentage > 0);
                if (!hasData) return null;

                return (
                  <View style={styles.distStripContainer}>
                    <View style={styles.distStripBar}>
                      {currentList.map((item, idx) => {
                        if (item.percentage <= 0) return null;
                        return (
                          <View
                            key={idx}
                            style={[
                              styles.distSegment,
                              {
                                width: `${Math.max(item.percentage, 4)}%`,
                                backgroundColor: item.color,
                              },
                            ]}
                          />
                        );
                      })}
                    </View>

                    {/* Distribution Legend */}
                    <View style={styles.distLegendRow}>
                      {currentList.map((item, idx) => {
                        if (item.percentage <= 0) return null;
                        return (
                          <View key={idx} style={styles.distLegendItem}>
                            <View style={[styles.distLegendDot, { backgroundColor: item.color }]} />
                            <Text style={styles.distLegendText} numberOfLines={1}>
                              {item.label} <Text style={{ fontWeight: "800", color: theme.text }}>({item.percentage}%)</Text>
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })()}

              {/* Drilldown Content */}
              {loadingSales && !isFirstLoad && !refreshing ? (
                <ActivityIndicator color={theme.primary} style={{ marginVertical: 16 }} />
              ) : breakdownMode === "store" ? (
                /* STORE DRILLDOWN */
                storeSales.length === 0 ? (
                  <View style={styles.emptyBreakdownCard}>
                    <Text style={styles.emptyBreakdownText}>No store sales recorded for this period</Text>
                  </View>
                ) : (
                  <View style={{ gap: 8, marginTop: 4 }}>
                    {storeSales.map((item, idx) => {
                      const isExpanded = expandedCardId === item.storeId;
                      const STORE_COLORS = [
                        theme.primary,
                        theme.accent,
                        theme.secondary,
                        "#ec4899",
                        "#06b6d4",
                        "#8b5cf6",
                        "#64748b",
                      ];
                      const storeColor = STORE_COLORS[idx % STORE_COLORS.length];

                      return (
                        <View key={item.storeId} style={styles.breakdownCard}>
                          <TouchableOpacity
                            style={styles.breakdownCardLine1}
                            onPress={() => setExpandedCardId(isExpanded ? null : item.storeId)}
                            activeOpacity={0.7}
                          >
                            <View style={styles.breakdownCardLine1Left}>
                              <View style={[styles.breakdownIconCircle, { backgroundColor: storeColor + "18" }]}>
                                <Building2 size={14} color={storeColor} strokeWidth={2.2} />
                              </View>
                              <Text style={styles.breakdownTitle} numberOfLines={1}>
                                {item.storeName}
                              </Text>
                            </View>
                            <View style={styles.breakdownCardLine1Right}>
                              <Text style={styles.breakdownRevenue}>{formatCurrency(item.revenue)}</Text>
                              {isExpanded ? (
                                <ChevronUp size={14} color={theme.textSecondary} />
                              ) : (
                                <ChevronDown size={14} color={theme.textSecondary} />
                              )}
                            </View>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.breakdownCardLine2}
                            onPress={() => setExpandedCardId(isExpanded ? null : item.storeId)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.breakdownSubtitle} numberOfLines={1}>
                              {item.volume} btl sold · {item.count} {item.count === 1 ? "sale" : "sales"}
                            </Text>
                            <View style={[styles.breakdownShareBadge, { backgroundColor: storeColor + "15", borderColor: storeColor + "30" }]}>
                              {idx === 0 && item.percentage > 0 && (
                                <Text style={[styles.breakdownRankText, { color: storeColor }]}>#1 · </Text>
                              )}
                              <Text style={[styles.breakdownShareText, { color: storeColor }]}>{item.percentage}% share</Text>
                            </View>
                          </TouchableOpacity>

                          {isExpanded && (
                            <View style={styles.expandedBox}>
                              <Text style={styles.expandedBoxTitle}>Portion Breakdown</Text>
                              <View style={styles.expandedList}>
                                {item.types.map((tp, tpIdx) => (
                                  <View key={tpIdx} style={styles.expandedRow}>
                                    <Text style={styles.expandedLabel}>{tp.label}</Text>
                                    <Text style={styles.expandedVal}>
                                      {tp.count} sold ({formatCurrency(tp.revenue)})
                                    </Text>
                                  </View>
                                ))}
                              </View>

                              <Text style={[styles.expandedBoxTitle, { marginTop: 10 }]}>Category Breakdown</Text>
                              <View style={styles.expandedList}>
                                {item.categories.map((cat, catIdx) => (
                                  <View key={catIdx} style={styles.expandedRow}>
                                    <Text style={styles.expandedLabel}>{cat.label}</Text>
                                    <Text style={styles.expandedVal}>
                                      {cat.count} sold ({formatCurrency(cat.revenue)})
                                    </Text>
                                  </View>
                                ))}
                              </View>

                              <TouchableOpacity
                                style={styles.viewStoreSalesBtn}
                                onPress={() =>
                                  router.push({
                                    pathname: "/sales",
                                    params: { storeId: item.storeId, storeName: item.storeName, period: salesPeriod },
                                  })
                                }
                                activeOpacity={0.8}
                              >
                                <Text style={styles.viewStoreSalesText}>View Store Sales Report →</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )
              ) : breakdownMode === "category" ? (
                /* CATEGORY DRILLDOWN */
                categorySales.length === 0 ? (
                  <View style={styles.emptyBreakdownCard}>
                    <Text style={styles.emptyBreakdownText}>No category sales recorded for this period</Text>
                  </View>
                ) : (
                  <View style={{ gap: 8, marginTop: 4 }}>
                    {categorySales.map((item, idx) => {
                      const isExpanded = expandedCardId === item.categoryKey;
                      return (
                        <View key={item.categoryKey} style={styles.breakdownCard}>
                          <TouchableOpacity
                            style={styles.breakdownCardLine1}
                            onPress={() => setExpandedCardId(isExpanded ? null : item.categoryKey)}
                            activeOpacity={0.7}
                          >
                            <View style={styles.breakdownCardLine1Left}>
                              <View style={[styles.breakdownIconCircle, { backgroundColor: item.badgeColor + "18" }]}>
                                {getCategoryIcon(item.categoryKey, item.badgeColor, 14)}
                              </View>
                              <Text style={styles.breakdownTitle} numberOfLines={1}>
                                {item.label}
                              </Text>
                            </View>
                            <View style={styles.breakdownCardLine1Right}>
                              <Text style={styles.breakdownRevenue}>{formatCurrency(item.revenue)}</Text>
                              {isExpanded ? (
                                <ChevronUp size={14} color={theme.textSecondary} />
                              ) : (
                                <ChevronDown size={14} color={theme.textSecondary} />
                              )}
                            </View>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.breakdownCardLine2}
                            onPress={() => setExpandedCardId(isExpanded ? null : item.categoryKey)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.breakdownSubtitle} numberOfLines={1}>
                              {item.volume} btl sold · {item.count} {item.count === 1 ? "sale" : "sales"}
                            </Text>
                            <View style={[styles.breakdownShareBadge, { backgroundColor: item.badgeColor + "15", borderColor: item.badgeColor + "30" }]}>
                              {idx === 0 && item.percentage > 0 && (
                                <Text style={[styles.breakdownRankText, { color: item.badgeColor }]}>#1 · </Text>
                              )}
                              <Text style={[styles.breakdownShareText, { color: item.badgeColor }]}>{item.percentage}% share</Text>
                            </View>
                          </TouchableOpacity>

                          {isExpanded && (
                            <View style={styles.expandedBox}>
                              <Text style={styles.expandedBoxTitle}>Store Distribution</Text>
                              <View style={styles.expandedList}>
                                {item.stores.length === 0 ? (
                                  <Text style={styles.expandedEmptyText}>No store sales recorded</Text>
                                ) : (
                                  item.stores.map((st, sIdx) => (
                                    <TouchableOpacity
                                      key={sIdx}
                                      style={styles.expandedRow}
                                      onPress={() =>
                                        router.push({
                                          pathname: "/sales",
                                          params: { storeId: st.storeId, storeName: st.storeName, period: salesPeriod },
                                        })
                                      }
                                      activeOpacity={0.7}
                                    >
                                      <Text style={styles.expandedLabel}>{st.storeName}</Text>
                                      <Text style={styles.expandedVal}>
                                        {st.count} sold ({formatCurrency(st.revenue)}) →
                                      </Text>
                                    </TouchableOpacity>
                                  ))
                                )}
                              </View>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )
              ) : (
                /* PORTION DRILLDOWN */
                <View style={{ gap: 8, marginTop: 4 }}>
                  {typeSales.map((item, idx) => {
                    const isBottle = item.type === "bottle";
                    const isGlass = item.type === "glass";
                    const portionColor = isBottle ? theme.primary : isGlass ? theme.accent : theme.secondary;
                    const isExpanded = expandedCardId === item.type;

                    return (
                      <View key={item.type} style={styles.breakdownCard}>
                        <TouchableOpacity
                          style={styles.breakdownCardLine1}
                          onPress={() => setExpandedCardId(isExpanded ? null : item.type)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.breakdownCardLine1Left}>
                            <View style={[styles.breakdownIconCircle, { backgroundColor: portionColor + "18" }]}>
                              {getPortionIcon(item.type, portionColor, 14)}
                            </View>
                            <Text style={styles.breakdownTitle} numberOfLines={1}>
                              {item.label}
                            </Text>
                          </View>
                          <View style={styles.breakdownCardLine1Right}>
                            <Text style={styles.breakdownRevenue}>{formatCurrency(item.revenue)}</Text>
                            {isExpanded ? (
                              <ChevronUp size={14} color={theme.textSecondary} />
                            ) : (
                              <ChevronDown size={14} color={theme.textSecondary} />
                            )}
                          </View>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.breakdownCardLine2}
                          onPress={() => setExpandedCardId(isExpanded ? null : item.type)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.breakdownSubtitle} numberOfLines={1}>
                            {item.count} sold ({item.volume} btl equiv)
                          </Text>
                          <View style={[styles.breakdownShareBadge, { backgroundColor: portionColor + "15", borderColor: portionColor + "30" }]}>
                            {idx === 0 && item.percentage > 0 && (
                              <Text style={[styles.breakdownRankText, { color: portionColor }]}>#1 · </Text>
                            )}
                            <Text style={[styles.breakdownShareText, { color: portionColor }]}>{item.percentage}% share</Text>
                          </View>
                        </TouchableOpacity>

                        {isExpanded && (
                          <View style={styles.expandedBox}>
                            <Text style={styles.expandedBoxTitle}>Store Distribution</Text>
                            <View style={styles.expandedList}>
                              {item.stores.length === 0 ? (
                                <Text style={styles.expandedEmptyText}>No sales recorded</Text>
                              ) : (
                                item.stores.map((st, sIdx) => (
                                  <TouchableOpacity
                                    key={sIdx}
                                    style={styles.expandedRow}
                                    onPress={() =>
                                      router.push({
                                        pathname: "/sales",
                                        params: { storeId: st.storeId, storeName: st.storeName, period: salesPeriod },
                                      })
                                    }
                                    activeOpacity={0.7}
                                  >
                                    <Text style={styles.expandedLabel}>{st.storeName}</Text>
                                    <Text style={styles.expandedVal}>
                                      {st.count} sold ({formatCurrency(st.revenue)}) →
                                    </Text>
                                  </TouchableOpacity>
                                ))
                              )}
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </View>

        {/* ── Per-Store Inventory Alerts (Compact Grid / Horizontal) ─────── */}
        {storeAlerts.length > 0 && (
          <View style={styles.metricsDashboard}>
            <View style={styles.metricsHeaderRow}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={styles.metricsTitle}>Boutique Inventory Health</Text>
                {totalAlertStores > 0 && (
                  <View style={[styles.deliveryCountPill, { backgroundColor: "rgba(239, 68, 68, 0.15)" }]}>
                    <Text style={[styles.deliveryCountPillText, { color: "#ef4444" }]}>
                      {totalAlertStores} STORES
                    </Text>
                  </View>
                )}
              </View>

              <TouchableOpacity
                onPress={() => router.push("/store-master-list")}
                style={styles.headerActionLink}
                activeOpacity={0.8}
              >
                <Text style={styles.headerActionLinkText}>Store Master List →</Text>
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 4 }}>
              {storeAlerts.map((sa) => {
                const hasAlert = sa.stockout + sa.parAlert + sa.underSafety > 0;
                const deficitTotal = sa.stockout + sa.parAlert + sa.underSafety;
                return (
                  <TouchableOpacity
                    key={sa.storeId}
                    style={[
                      styles.storeAlertCompactCard,
                      {
                        backgroundColor: theme.card,
                        borderColor: hasAlert
                          ? sa.stockout > 0 ? "rgba(239, 68, 68, 0.35)" : "rgba(249, 115, 22, 0.35)"
                          : theme.border,
                      },
                    ]}
                    onPress={() => router.push({ pathname: "/store-master-list", params: { storeId: sa.storeId } })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.deliveryLine1}>
                      <View style={styles.deliveryLine1Left}>
                        <View
                          style={[
                            styles.topCardIconCircle,
                            {
                              backgroundColor: hasAlert
                                ? sa.stockout > 0 ? "rgba(239, 68, 68, 0.12)" : "rgba(249, 115, 22, 0.12)"
                                : "rgba(16, 185, 129, 0.12)",
                            },
                          ]}
                        >
                          {hasAlert ? (
                            sa.stockout > 0 ? (
                              <AlertOctagon size={14} color="#ef4444" strokeWidth={2.4} />
                            ) : (
                              <AlertTriangle size={14} color="#f97316" strokeWidth={2.4} />
                            )
                          ) : (
                            <CheckCircle2 size={14} color="#10b981" strokeWidth={2.4} />
                          )}
                        </View>
                        <Text style={[styles.topCardTitle, { color: theme.text }]} numberOfLines={1}>
                          {sa.storeName}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.deliveryStatusBadge,
                          {
                            backgroundColor: hasAlert
                              ? sa.stockout > 0 ? "rgba(239, 68, 68, 0.12)" : "rgba(249, 115, 22, 0.12)"
                              : "rgba(16, 185, 129, 0.12)",
                            borderColor: hasAlert
                              ? sa.stockout > 0 ? "rgba(239, 68, 68, 0.25)" : "rgba(249, 115, 22, 0.25)"
                              : "rgba(16, 185, 129, 0.25)",
                            paddingVertical: 1,
                            paddingHorizontal: 5,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.deliveryStatusBadgeText,
                            { color: hasAlert ? (sa.stockout > 0 ? "#ef4444" : "#d97706") : "#059669", fontSize: 9 },
                          ]}
                        >
                          {hasAlert ? (sa.stockout > 0 ? "STOCKOUT" : "PAR ALERT") : "HEALTHY"}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.deliveryLine2}>
                      <Text style={[styles.topCardSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                        {!hasAlert
                          ? "All wines in stock"
                          : `${sa.stockout} zero · ${sa.parAlert + sa.underSafety} below PAR`}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                        <Text style={{ fontSize: 10.5, fontWeight: "700", color: hasAlert ? "#ef4444" : "#059669" }}>
                          {hasAlert ? `${deficitTotal} items` : "OK"}
                        </Text>
                        <ChevronRight size={13} color="#94a3b8" />
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── Operational Tasks: Pullouts & Deliveries (Side-by-side on tablet) ── */}
        {(pulloutTasks.length > 0 || incomingDeliveries.length > 0) && (
          <View style={isLandscape || isTablet ? styles.tasksRow : undefined}>
            {pulloutTasks.length > 0 && (
              <View style={[styles.metricsDashboard, isLandscape || isTablet ? styles.taskColumn : undefined]}>
                <View style={styles.metricsHeaderRow}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={styles.metricsTitle}>Pullout Requests</Text>
                    <View style={[styles.deliveryCountPill, { backgroundColor: "rgba(245, 158, 11, 0.15)" }]}>
                      <Text style={[styles.deliveryCountPillText, { color: "#d97706" }]}>
                        {pulloutTasks.length}
                      </Text>
                    </View>
                  </View>
                </View>

                {pulloutTasks.length === 1 ? (
                  <TouchableOpacity
                    key={pulloutTasks[0].id}
                    style={[styles.alertBannerCardFull, { backgroundColor: theme.card, borderColor: theme.border }]}
                    onPress={() => router.push({ pathname: "/pullout/[id]", params: { id: pulloutTasks[0].id } })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.alertBannerLeft}>
                      <View style={[styles.deliveryCardIconCircle, { backgroundColor: "#f59e0b18" }]}>
                        <ClipboardList size={18} color="#f59e0b" strokeWidth={2.2} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 }}>
                          <Text style={[styles.deliveryCardTitle, { color: theme.text, marginBottom: 0 }]}>
                            {storeMap[pulloutTasks[0].sourceStoreId || ""] || "Warehouse"} → {storeMap[pulloutTasks[0].outBoundStoreId || ""] || "Unknown"}
                          </Text>
                          <View style={[styles.deliveryStatusBadge, { backgroundColor: "rgba(245, 158, 11, 0.12)", borderColor: "rgba(245, 158, 11, 0.3)" }]}>
                            <Text style={[styles.deliveryStatusBadgeText, { color: "#d97706" }]}>
                              {pulloutTasks[0].status === "in_progress" ? "IN PROGRESS" : "PENDING"}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.deliveryCardSubtitle, { color: theme.textSecondary }]}>
                          REQ: {pulloutTasks[0].id.slice(0, 6).toUpperCase()} · Outbound
                        </Text>
                      </View>
                    </View>

                    <View style={styles.alertBannerRight}>
                      <View style={styles.deliveryQtyPill}>
                        <Package size={12} color="#d97706" strokeWidth={2.2} />
                        <Text style={[styles.deliveryQtyText, { color: theme.text }]}>
                          {pulloutTasks[0].items.reduce((acc, i) => acc + (i.requestedQty || 0), 0)} bottles
                        </Text>
                      </View>
                      <ChevronRight size={16} color="#94a3b8" />
                    </View>
                  </TouchableOpacity>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 8 }}>
                    {pulloutTasks.map((task) => (
                      <TouchableOpacity
                        key={task.id}
                        style={[styles.deliveryCardCompact, { backgroundColor: theme.card, borderColor: theme.border }]}
                        onPress={() => router.push({ pathname: "/pullout/[id]", params: { id: task.id } })}
                        activeOpacity={0.85}
                      >
                        <View style={styles.deliveryLine1}>
                          <View style={styles.deliveryLine1Left}>
                            <View style={[styles.deliveryCardIconCircle, { backgroundColor: "#f59e0b18" }]}>
                              <ClipboardList size={14} color="#f59e0b" strokeWidth={2.4} />
                            </View>
                            <Text style={[styles.deliveryCardTitle, { color: theme.text }]} numberOfLines={1}>
                              {storeMap[task.outBoundStoreId || ""] || "Store Transfer"}
                            </Text>
                          </View>
                          <ChevronRight size={14} color="#94a3b8" />
                        </View>

                        <View style={styles.deliveryLine2}>
                          <Text style={[styles.deliveryCardSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                            REQ: {task.id.slice(0, 6).toUpperCase()} · {task.items.reduce((acc, i) => acc + (i.requestedQty || 0), 0)} btl
                          </Text>
                          <View style={[styles.deliveryStatusBadge, { backgroundColor: "rgba(245, 158, 11, 0.12)", borderColor: "rgba(245, 158, 11, 0.3)" }]}>
                            <Text style={[styles.deliveryStatusBadgeText, { color: "#d97706" }]}>
                              {task.status === "in_progress" ? "IN PROGRESS" : "PENDING"}
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}

            {incomingDeliveries.length > 0 && (
              <View style={[styles.metricsDashboard, isLandscape || isTablet ? styles.taskColumn : undefined]}>
                <View style={styles.metricsHeaderRow}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={styles.metricsTitle}>Active Deliveries</Text>
                    <View style={styles.deliveryCountPill}>
                      <Text style={styles.deliveryCountPillText}>{incomingDeliveries.length}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.headerActionLink}
                    onPress={() => router.push("/delivery-logs")}
                    activeOpacity={0.8}
                  >
                    <PackageCheck size={12} color={theme.primary} strokeWidth={2.4} />
                    <Text style={styles.headerActionLinkText}>Intake Logs →</Text>
                  </TouchableOpacity>
                </View>

                {incomingDeliveries.length === 1 ? (
                  <TouchableOpacity
                    key={incomingDeliveries[0].id}
                    style={[styles.alertBannerCardFull, { backgroundColor: theme.card, borderColor: theme.border }]}
                    onPress={() => router.push({ pathname: "/deliveries/[id]", params: { id: incomingDeliveries[0].id } })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.alertBannerLeft}>
                      <View style={[styles.deliveryCardIconCircle, { backgroundColor: theme.primary + "18" }]}>
                        <Truck size={18} color={theme.primary} strokeWidth={2.2} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 }}>
                          <Text style={[styles.deliveryCardTitle, { color: theme.text, marginBottom: 0 }]}>
                            → {storeMap[incomingDeliveries[0].storeId] || "Store Delivery"}
                          </Text>
                          <View style={styles.deliveryStatusBadge}>
                            <Text style={styles.deliveryStatusBadgeText}>
                              {incomingDeliveries[0].status === "receiving" ? "RECEIVING" : "DISPATCHED"}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.deliveryCardSubtitle, { color: theme.textSecondary }]}>
                          DEL: {incomingDeliveries[0].id.slice(0, 6).toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.alertBannerRight}>
                      <View style={styles.deliveryQtyPill}>
                        <Package size={12} color={theme.primary} strokeWidth={2.2} />
                        <Text style={[styles.deliveryQtyText, { color: theme.text }]}>
                          {incomingDeliveries[0].totalBottles} bottles
                        </Text>
                      </View>
                      <ChevronRight size={16} color="#94a3b8" />
                    </View>
                  </TouchableOpacity>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 8 }}>
                    {incomingDeliveries.map((del) => (
                      <TouchableOpacity
                        key={del.id}
                        style={[styles.deliveryCardCompact, { backgroundColor: theme.card, borderColor: theme.border }]}
                        onPress={() => router.push({ pathname: "/deliveries/[id]", params: { id: del.id } })}
                        activeOpacity={0.85}
                      >
                        <View style={styles.deliveryLine1}>
                          <View style={styles.deliveryLine1Left}>
                            <View style={[styles.deliveryCardIconCircle, { backgroundColor: theme.primary + "18" }]}>
                              <Truck size={14} color={theme.primary} strokeWidth={2.4} />
                            </View>
                            <Text style={[styles.deliveryCardTitle, { color: theme.text }]} numberOfLines={1}>
                              → {storeMap[del.storeId] || "Store Delivery"}
                            </Text>
                          </View>
                          <ChevronRight size={14} color="#94a3b8" />
                        </View>

                        <View style={styles.deliveryLine2}>
                          <Text style={[styles.deliveryCardSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                            DEL: {del.id.slice(0, 6).toUpperCase()} · {del.totalBottles} btl
                          </Text>
                          <View style={styles.deliveryStatusBadge}>
                            <Text style={styles.deliveryStatusBadgeText}>
                              {del.status === "receiving" ? "RECEIVING" : "DISPATCHED"}
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}
          </View>
        )}

        {/* ── Admin Operations (Compact 5-Tile Grid matching home.tsx) ───── */}
        <View style={styles.metricsDashboard}>
          <Text style={styles.metricsTitle}>Admin Operations</Text>

          <ScrollView
            horizontal={!isLandscape && !isTablet}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={
              isLandscape || isTablet
                ? styles.storeGrid
                : { gap: 10, paddingRight: 4 }
            }
          >
            {/* Tile 1: Scan & Sell */}
            <TouchableOpacity
              style={[
                styles.storeGridTile,
                {
                  width: isLandscape || isTablet ? storeTileWidth : 140,
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                },
              ]}
              onPress={() => router.push({ pathname: "/sell" })}
              activeOpacity={0.85}
            >
              <View style={styles.tileHeaderRow}>
                <View style={[styles.tileIconCircle, { backgroundColor: "#10b98115" }]}>
                  <Banknote size={18} color="#059669" strokeWidth={2} />
                </View>
                <ChevronRight size={14} color="#94a3b8" />
              </View>
              <View style={styles.tileTextContainer}>
                <Text style={[styles.tileTitle, { color: theme.text }]} numberOfLines={1}>Scan & Sell</Text>
                <Text style={[styles.tileDesc, { color: theme.textSecondary }]} numberOfLines={1}>
                  Bottle & pours
                </Text>
              </View>
            </TouchableOpacity>

            {/* Tile 2: Wine Requests */}
            <TouchableOpacity
              style={[
                styles.storeGridTile,
                {
                  width: isLandscape || isTablet ? storeTileWidth : 140,
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                },
              ]}
              onPress={() => router.push("/wine-requests")}
              activeOpacity={0.85}
            >
              <View style={styles.tileHeaderRow}>
                <View style={[styles.tileIconCircle, { backgroundColor: theme.primary + "15" }]}>
                  <ClipboardList size={18} color={theme.primary} strokeWidth={2} />
                </View>
                <ChevronRight size={14} color="#94a3b8" />
              </View>
              <View style={styles.tileTextContainer}>
                <Text style={[styles.tileTitle, { color: theme.text }]} numberOfLines={1}>Wine Requests</Text>
                <Text style={[styles.tileDesc, { color: theme.textSecondary }]} numberOfLines={1}>
                  All store orders
                </Text>
              </View>
            </TouchableOpacity>

            {/* Tile 3: Store Stock & PAR */}
            <TouchableOpacity
              style={[
                styles.storeGridTile,
                {
                  width: isLandscape || isTablet ? storeTileWidth : 140,
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                },
              ]}
              onPress={() => router.push("/store-master-list")}
              activeOpacity={0.85}
            >
              <View style={styles.tileHeaderRow}>
                <View style={[styles.tileIconCircle, { backgroundColor: "#0f766e15" }]}>
                  <LayoutList size={18} color="#0f766e" strokeWidth={2} />
                </View>
                <ChevronRight size={14} color="#94a3b8" />
              </View>
              <View style={styles.tileTextContainer}>
                <Text style={[styles.tileTitle, { color: theme.text }]} numberOfLines={1}>Stock & PAR</Text>
                <Text style={[styles.tileDesc, { color: theme.textSecondary }]} numberOfLines={1}>
                  PAR & cellar stock
                </Text>
              </View>
            </TouchableOpacity>

            {/* Tile 4: Bottle Lookup */}
            <TouchableOpacity
              style={[
                styles.storeGridTile,
                {
                  width: isLandscape || isTablet ? storeTileWidth : 140,
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                },
              ]}
              onPress={() => router.push("/inventory")}
              activeOpacity={0.85}
            >
              <View style={styles.tileHeaderRow}>
                <View style={[styles.tileIconCircle, { backgroundColor: "#6366f115" }]}>
                  <Search size={18} color="#4f46e5" strokeWidth={2} />
                </View>
                <ChevronRight size={14} color="#94a3b8" />
              </View>
              <View style={styles.tileTextContainer}>
                <Text style={[styles.tileTitle, { color: theme.text }]} numberOfLines={1}>Bottle Lookup</Text>
                <Text style={[styles.tileDesc, { color: theme.textSecondary }]} numberOfLines={1}>
                  SKU & bin lookup
                </Text>
              </View>
            </TouchableOpacity>

            {/* Tile 5: Intake Logs */}
            <TouchableOpacity
              style={[
                styles.storeGridTile,
                {
                  width: isLandscape || isTablet ? storeTileWidth : 140,
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                },
              ]}
              onPress={() => router.push("/delivery-logs")}
              activeOpacity={0.85}
            >
              <View style={styles.tileHeaderRow}>
                <View style={[styles.tileIconCircle, { backgroundColor: "#05966915" }]}>
                  <PackageCheck size={18} color="#059669" strokeWidth={2} />
                </View>
                <ChevronRight size={14} color="#94a3b8" />
              </View>
              <View style={styles.tileTextContainer}>
                <Text style={[styles.tileTitle, { color: theme.text }]} numberOfLines={1}>Intake Logs</Text>
                <Text style={[styles.tileDesc, { color: theme.textSecondary }]} numberOfLines={1}>
                  Arrivals & history
                </Text>
              </View>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* ── Footer Badge ────────────────────────────────────────────────── */}
        <View style={styles.footerBadge}>
          <Text style={styles.footerText}>Admin Mode · Full System Access</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 60,
  },
  header: {
    marginTop: 20,
    marginBottom: 20,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: theme.logoBg,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: theme.text,
    letterSpacing: -0.5,
  },
  rolePill: {
    marginTop: 4,
    backgroundColor: theme.primary + "20",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  rolePillText: {
    color: theme.primary,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  subtitle: {
    color: theme.textSecondary,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
  },
  signOutButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  topRowContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
    width: "100%",
  },
  dashboardTopCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.2,
    paddingVertical: 10,
    paddingHorizontal: 12,
    justifyContent: "center",
    minHeight: 62,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  topCardRow1: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    marginBottom: 5,
  },
  topCardRow1Left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  topCardRow2: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    paddingLeft: 30,
  },
  topCardBody: {
    marginBottom: 8,
  },
  topCardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 4,
  },
  topCardIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  topCardTitle: {
    fontSize: 12.5,
    fontWeight: "800",
    flex: 1,
  },
  topCardSubtitle: {
    fontSize: 10.5,
    fontWeight: "500",
    flex: 1,
    marginRight: 4,
  },
  topCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 1,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  topCardBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  topCardActionText: {
    fontSize: 10.5,
    fontWeight: "700",
  },
  metricsDashboard: {
    marginBottom: 20,
  },
  metricsHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  metricsTitle: {
    color: "#475569",
    fontSize: 11,
    paddingBottom: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    paddingHorizontal: 2,
  },
  cacheClearBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: theme.primary + "12",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  cacheClearText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.primary,
  },
  periodRow: {
    flexDirection: "row",
    gap: 4,
  },
  periodBtn: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
  },
  periodBtnText: {
    color: theme.textSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  viewAllBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: theme.primary,
  },
  viewAllBtnText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  toastBanner: {
    backgroundColor: "#dcfce7",
    borderColor: "#86efac",
    borderWidth: 1,
    padding: 8,
    marginBottom: 12,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  toastText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#15803d",
  },
  symmetricalSalesRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  symmetricalCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.2,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 58,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  symmetricalRow1: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginBottom: 2,
    width: "100%",
  },
  symmetricalIconCircleSmall: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  symmetricalCardValue: {
    fontSize: 14.5,
    fontWeight: "900",
    letterSpacing: -0.3,
    color: "#ffffff",
    textAlign: "center",
  },
  symmetricalCardUnit: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255, 255, 255, 0.85)",
  },
  symmetricalCardSubtitle: {
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 0.2,
    color: "rgba(255, 255, 255, 0.85)",
    textAlign: "center",
  },
  drilldownTabRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 12,
    padding: 3,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 4,
  },
  drilldownTabBtn: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: 7,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    gap: 6,
  },
  drilldownTabBtnActive: {
    backgroundColor: theme.primary,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 3,
  },
  drilldownTabText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.textSecondary,
  },
  drilldownTabTextActive: {
    fontWeight: "800",
    color: "#ffffff",
  },
  distStripContainer: {
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1.2,
    borderColor: theme.border,
  },
  distStripBar: {
    height: 8,
    borderRadius: 4,
    flexDirection: "row",
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    gap: 2,
  },
  distSegment: {
    height: "100%",
    borderRadius: 2,
  },
  distLegendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 10,
  },
  distLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  distLegendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  distLegendText: {
    fontSize: 11,
    color: theme.textSecondary,
    fontWeight: "500",
  },
  breakdownCard: {
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.2,
    borderColor: theme.border,
    gap: 8,
  },
  breakdownCardLine1: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  breakdownCardLine1Left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    flex: 1,
    marginRight: 8,
  },
  breakdownIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  breakdownTitle: {
    fontSize: 13.5,
    fontWeight: "700",
    color: theme.text,
    flexShrink: 1,
  },
  breakdownCardLine1Right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  breakdownRevenue: {
    fontSize: 13.5,
    fontWeight: "800",
    color: theme.text,
  },
  breakdownCardLine2: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 37,
  },
  breakdownSubtitle: {
    fontSize: 11.5,
    color: theme.textSecondary,
    fontWeight: "500",
    flexShrink: 1,
    marginRight: 8,
  },
  breakdownShareBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  breakdownRankText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  breakdownShareText: {
    fontSize: 10,
    fontWeight: "700",
  },
  expandedBox: {
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingLeft: 37,
  },
  expandedBoxTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  expandedList: {
    gap: 4,
  },
  expandedRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  expandedLabel: {
    fontSize: 11.5,
    fontWeight: "600",
    color: theme.text,
  },
  expandedVal: {
    fontSize: 11.5,
    fontWeight: "700",
    color: theme.primary,
  },
  expandedEmptyText: {
    fontSize: 11,
    color: theme.textSecondary,
    fontStyle: "italic",
    paddingVertical: 4,
  },
  viewStoreSalesBtn: {
    marginTop: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: theme.primary + "18",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.primary + "35",
  },
  viewStoreSalesText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: theme.primary,
  },
  emptyBreakdownCard: {
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    borderWidth: 1.2,
    borderColor: theme.border,
    marginTop: 4,
  },
  emptyBreakdownText: {
    fontSize: 12,
    color: theme.textSecondary,
    fontStyle: "italic",
  },
  headerActionLink: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerActionLinkText: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.primary,
  },
  storeAlertCompactCard: {
    width: 220,
    borderRadius: 14,
    borderWidth: 1.2,
    paddingVertical: 10,
    paddingHorizontal: 12,
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    minHeight: 58,
  },
  deliveryLine1: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 5,
  },
  deliveryLine1Left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  deliveryLine2: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 30,
  },
  tasksRow: {
    flexDirection: "row",
    gap: 16,
    width: "100%",
    marginBottom: 20,
  },
  taskColumn: {
    flex: 1,
    marginBottom: 0,
  },
  deliveryCountPill: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  deliveryCountPillText: {
    color: "#059669",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  alertBannerCardFull: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  alertBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    marginRight: 10,
  },
  alertBannerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  deliveryCardIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  deliveryCardTitle: {
    fontSize: 12.5,
    fontWeight: "800",
    flex: 1,
  },
  deliveryCardSubtitle: {
    fontSize: 10.5,
    fontWeight: "500",
    flex: 1,
    marginRight: 4,
  },
  deliveryCardCompact: {
    width: 275,
    borderRadius: 14,
    borderWidth: 1.2,
    paddingVertical: 10,
    paddingHorizontal: 12,
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    minHeight: 58,
  },
  deliveryCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 1,
  },
  deliveryStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  deliveryStatusBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#059669",
    letterSpacing: 0.4,
  },
  deliveryQtyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  deliveryQtyText: {
    fontSize: 11.5,
    fontWeight: "700",
  },
  storeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  storeGridTile: {
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 96,
  },
  tileHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 8,
  },
  tileIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  tileTextContainer: {
    marginTop: 2,
    alignItems: "center",
  },
  tileTitle: {
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 1,
    textAlign: "center",
  },
  tileDesc: {
    fontSize: 10.5,
    fontWeight: "500",
    textAlign: "center",
  },
  footerBadge: {
    marginTop: 8,
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.primary + "40",
    backgroundColor: theme.primary + "08",
  },
  footerText: {
    color: theme.primary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
});
