import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
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
  LayoutList,
  LogOut,
  Package,
  PackageCheck,
  RotateCcw,
  Search,
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
  iconText: string;
  count: number;
  revenue: number;
  volume: number;
  percentage: number;
  stores: { storeId: string; storeName: string; count: number; revenue: number }[];
}

const theme = Colors.admin;

function formatCurrency(value: number) {
  return `₱${value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function AdminDashboard() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const { profile } = useAuth();
  const { notification } = usePushNotifications();

  const isLandscape = width > height;
  const isTablet = width >= 768 || (isLandscape && width >= 680);
  const cardsPerRow = isLandscape || isTablet ? 3 : 2;
  const containerPadding = isLandscape ? 48 : 40;
  const totalGap = 14 * (cardsPerRow - 1);
  const cardWidth = (width - containerPadding - totalGap) / cardsPerRow;

  const storeCardsPerRow = isLandscape || isTablet ? 5 : 2;
  const storeTotalGap = 12 * (storeCardsPerRow - 1);
  const storeTileWidth = (width - containerPadding - storeTotalGap) / storeCardsPerRow;

  const [salesPeriod, setSalesPeriod] = useState<"today" | "week" | "all">("today");
  const [breakdownMode, setBreakdownMode] = useState<"store" | "category" | "type">("store");
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

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
          iconText: string;
          count: number;
          revenue: number;
          volume: number;
          stores: Record<string, { storeId: string; storeName: string; count: number; revenue: number }>;
        }
      > = {
        fun: { label: "Fun Wine", badgeColor: "#f59e0b", iconText: "😁 FUN", count: 0, revenue: 0, volume: 0, stores: {} },
        fine: { label: "Fine Wine", badgeColor: "#ec4899", iconText: "💎 FINE", count: 0, revenue: 0, volume: 0, stores: {} },
        reserve: { label: "Reserve Collection", badgeColor: "#6366f1", iconText: "👻 RESERVE", count: 0, revenue: 0, volume: 0, stores: {} },
        other: { label: "Standard Catalog", badgeColor: "#64748b", iconText: "🍷 STANDARD", count: 0, revenue: 0, volume: 0, stores: {} },
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
        const cKey = (catRaw === "fun" || catRaw === "fast") ? "fun" : catRaw === "fine" ? "fine" : catRaw === "reserve" ? "reserve" : "other";

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
          iconText: val.iconText,
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
        contentContainerStyle={styles.scrollContent}
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
            <View style={styles.topCardBody}>
              <View style={styles.topCardTitleRow}>
                <View style={[styles.topCardIconCircle, { backgroundColor: theme.primary + "18" }]}>
                  <Banknote size={15} color={theme.primary} strokeWidth={2.4} />
                </View>
                <Text style={[styles.topCardTitle, { color: theme.text }]} numberOfLines={1}>
                  All-Store Sales
                </Text>
              </View>
              <Text style={[styles.topCardSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                {formatCurrency(salesMetrics.totalRevenue)} · {salesMetrics.totalItems} btl
              </Text>
            </View>

            <View style={[styles.topCardFooter, { borderTopColor: theme.border + "80" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <View style={[styles.liveDot, { backgroundColor: "#10b981" }]} />
                <Text style={[styles.topCardBadgeText, { color: "#059669" }]}>
                  {salesPeriod === "today" ? "TODAY" : salesPeriod === "week" ? "THIS WEEK" : "ALL TIME"}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Text style={[styles.topCardActionText, { color: theme.primary }]}>View Sales</Text>
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
            <View style={styles.topCardBody}>
              <View style={styles.topCardTitleRow}>
                <View
                  style={[
                    styles.topCardIconCircle,
                    { backgroundColor: totalDeficitWines > 0 ? "rgba(239, 68, 68, 0.12)" : "rgba(16, 185, 129, 0.12)" },
                  ]}
                >
                  {totalDeficitWines > 0 ? (
                    <AlertOctagon size={15} color="#ef4444" strokeWidth={2.4} />
                  ) : (
                    <CheckCircle2 size={15} color="#10b981" strokeWidth={2.4} />
                  )}
                </View>
                <Text style={[styles.topCardTitle, { color: theme.text }]} numberOfLines={1}>
                  {totalDeficitWines > 0 ? "Inventory Alerts" : "Inventory Healthy"}
                </Text>
              </View>
              <Text style={[styles.topCardSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                {totalDeficitWines > 0
                  ? `${totalAlertStores} store${totalAlertStores === 1 ? "" : "s"} · ${totalDeficitWines} deficit items`
                  : "All boutiques stocked & above PAR"}
              </Text>
            </View>

            <View style={[styles.topCardFooter, { borderTopColor: theme.border + "80" }]}>
              <View
                style={[
                  styles.deliveryStatusBadge,
                  {
                    backgroundColor: totalDeficitWines > 0 ? "rgba(239, 68, 68, 0.12)" : "rgba(16, 185, 129, 0.12)",
                    borderColor: totalDeficitWines > 0 ? "rgba(239, 68, 68, 0.25)" : "rgba(16, 185, 129, 0.25)",
                    paddingVertical: 2,
                    paddingHorizontal: 6,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.deliveryStatusBadgeText,
                    { color: totalDeficitWines > 0 ? "#ef4444" : "#059669", fontSize: 9.5 },
                  ]}
                >
                  {totalDeficitWines > 0 ? `${totalDeficitWines} ALERTS` : "HEALTHY"}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Text
                  style={[
                    styles.topCardActionText,
                    { color: totalDeficitWines > 0 ? "#ef4444" : "#059669" },
                  ]}
                >
                  {totalDeficitWines > 0 ? "Review Stock" : "View Stock"}
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

          <View style={styles.responsiveGrid}>
            {/* Card 1: Total Revenue */}
            <TouchableOpacity
              style={[styles.metricCard, { width: cardWidth, backgroundColor: theme.primary }]}
              onPress={() => router.push({ pathname: "/sales", params: { period: salesPeriod } })}
              activeOpacity={0.8}
            >
              <Banknote size={24} color="#ffffff" strokeWidth={2.4} />
              {loadingSales && !isFirstLoad && !refreshing ? (
                <ActivityIndicator color="#fff" size="small" style={{ marginVertical: 2 }} />
              ) : (
                <Text style={styles.metricCount} numberOfLines={1} adjustsFontSizeToFit>
                  {formatCurrency(salesMetrics.totalRevenue)}
                </Text>
              )}
              <Text style={styles.metricLabel}>Total Revenue</Text>
              <Text style={styles.metricSubLabel}>
                {salesPeriod === "today" ? "Today" : salesPeriod === "week" ? "This Week" : "All Time"}
              </Text>
            </TouchableOpacity>

            {/* Card 2: Bottles Sold */}
            <TouchableOpacity
              style={[styles.metricCard, { width: cardWidth, backgroundColor: theme.secondary }]}
              onPress={() => router.push({ pathname: "/sales", params: { period: salesPeriod } })}
              activeOpacity={0.8}
            >
              <Wine size={24} color="#ffffff" strokeWidth={2.4} />
              {loadingSales && !isFirstLoad && !refreshing ? (
                <ActivityIndicator color="#fff" size="small" style={{ marginVertical: 2 }} />
              ) : (
                <Text style={styles.metricCount}>{salesMetrics.totalItems}</Text>
              )}
              <Text style={styles.metricLabel}>Bottles Sold</Text>
              <Text style={styles.metricSubLabel}>
                {salesPeriod === "today" ? "Today" : salesPeriod === "week" ? "This Week" : "All Time"}
              </Text>
            </TouchableOpacity>

            {/* Card 3 (on tablet/landscape): Active Boutiques */}
            {isTablet && (
              <View style={[styles.metricCard, { width: cardWidth, backgroundColor: "#64748b" }]}>
                <Building2 size={24} color="#ffffff" strokeWidth={2.4} />
                <Text style={styles.metricCount}>{storeAlerts.length}</Text>
                <Text style={styles.metricLabel}>Boutique Stores</Text>
                <Text style={styles.metricSubLabel}>Network-wide</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Sales Breakdown & Insights (Compact Drilldown) ─────────────── */}
        <View style={styles.metricsDashboard}>
          <Text style={styles.metricsTitle}>Sales Breakdown & Insights</Text>

          <View style={styles.drilldownTabRow}>
            {[
              { id: "store", label: "By Store", icon: "🏢" },
              { id: "category", label: "By Category", icon: "🏷️" },
              { id: "type", label: "By Portion", icon: "🍷" },
            ].map((t) => (
              <TouchableOpacity
                key={t.id}
                onPress={() => {
                  setBreakdownMode(t.id as any);
                  setExpandedCardId(null);
                }}
                style={[
                  styles.drilldownTabBtn,
                  breakdownMode === t.id && styles.drilldownTabBtnActive,
                ]}
              >
                <Text
                  style={[
                    styles.drilldownTabText,
                    breakdownMode === t.id && styles.drilldownTabTextActive,
                  ]}
                >
                  {t.icon} {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Multi-Segmented Proportional Distribution Bar */}
          {(() => {
            const STORE_COLORS = ["#4f46e5", "#059669", "#d97706", "#ec4899", "#06b6d4", "#8b5cf6", "#64748b"];
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
                color: t.type === "bottle" ? "#4f46e5" : t.type === "glass" ? "#059669" : "#d97706",
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
                  const STORE_COLORS = ["#4f46e5", "#059669", "#d97706", "#ec4899", "#06b6d4", "#8b5cf6", "#64748b"];
                  const storeColor = STORE_COLORS[idx % STORE_COLORS.length];

                  return (
                    <View
                      key={item.storeId}
                      style={[styles.breakdownCard, { borderLeftWidth: 3.5, borderLeftColor: storeColor }]}
                    >
                      <View style={styles.breakdownHeader}>
                        <TouchableOpacity
                          style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}
                          onPress={() =>
                            router.push({
                              pathname: "/sales",
                              params: { storeId: item.storeId, storeName: item.storeName, period: salesPeriod },
                            })
                          }
                        >
                          <Building2 size={15} color={storeColor} />
                          <Text style={styles.breakdownName} numberOfLines={1}>
                            {item.storeName}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 2 }}
                          onPress={() => setExpandedCardId(isExpanded ? null : item.storeId)}
                        >
                          <Text style={styles.breakdownRevenue}>{formatCurrency(item.revenue)}</Text>
                          {isExpanded ? (
                            <ChevronUp size={15} color={theme.textSecondary} />
                          ) : (
                            <ChevronDown size={15} color={theme.textSecondary} />
                          )}
                        </TouchableOpacity>
                      </View>

                      <TouchableOpacity
                        style={styles.breakdownSubRow}
                        onPress={() => setExpandedCardId(isExpanded ? null : item.storeId)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.breakdownSubText}>
                          {item.volume} btl sold · {item.count} {item.count === 1 ? "sale" : "sales"}
                        </Text>
                        <View style={styles.sharePillContainer}>
                          {idx === 0 && item.percentage > 0 && (
                            <View style={[styles.rankBadge, { backgroundColor: storeColor + "1A", borderColor: storeColor + "40" }]}>
                              <Text style={[styles.rankBadgeText, { color: storeColor }]}>#1 LEADER</Text>
                            </View>
                          )}
                          <View style={[styles.ringPill, { borderColor: storeColor + "40", backgroundColor: storeColor + "0D" }]}>
                            <View style={[styles.ringDot, { backgroundColor: storeColor }]} />
                            <Text style={[styles.ringPillText, { color: storeColor }]}>{item.percentage}%</Text>
                          </View>
                        </View>
                      </TouchableOpacity>

                      {/* Expanded Store Details */}
                      {isExpanded && (
                        <View style={styles.expandedBox}>
                          <Text style={styles.expandedBoxTitle}>Portion Breakdown</Text>
                          <View style={{ gap: 4, marginTop: 4 }}>
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
                          <View style={{ gap: 4, marginTop: 4 }}>
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
                          >
                            <Text style={styles.viewStoreSalesText}>View Full Store Sales Report →</Text>
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
                    <View
                      key={item.categoryKey}
                      style={[styles.typeCard, { borderLeftWidth: 3.5, borderLeftColor: item.badgeColor }]}
                    >
                      <TouchableOpacity
                        style={styles.typeHeader}
                        onPress={() => setExpandedCardId(isExpanded ? null : item.categoryKey)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.typeBadge, { backgroundColor: item.badgeColor + "18" }]}>
                          <Text style={[styles.typeBadgeText, { color: item.badgeColor }]}>
                            {item.iconText}
                          </Text>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                          <Text style={styles.typeRevenue}>{formatCurrency(item.revenue)}</Text>
                          {isExpanded ? (
                            <ChevronUp size={15} color={theme.textSecondary} />
                          ) : (
                            <ChevronDown size={15} color={theme.textSecondary} />
                          )}
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={{ marginTop: 6, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}
                        onPress={() => setExpandedCardId(isExpanded ? null : item.categoryKey)}
                        activeOpacity={0.7}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.typeTitle}>{item.label}</Text>
                          <Text style={styles.typeDetail}>
                            {item.volume} btl sold ({item.count} {item.count === 1 ? "sale" : "sales"})
                          </Text>
                        </View>
                        <View style={styles.sharePillContainer}>
                          {idx === 0 && item.percentage > 0 && (
                            <View style={[styles.rankBadge, { backgroundColor: item.badgeColor + "1A", borderColor: item.badgeColor + "40" }]}>
                              <Text style={[styles.rankBadgeText, { color: item.badgeColor }]}>#1</Text>
                            </View>
                          )}
                          <View style={[styles.ringPill, { borderColor: item.badgeColor + "40", backgroundColor: item.badgeColor + "0D" }]}>
                            <View style={[styles.ringDot, { backgroundColor: item.badgeColor }]} />
                            <Text style={[styles.ringPillText, { color: item.badgeColor }]}>{item.percentage}%</Text>
                          </View>
                        </View>
                      </TouchableOpacity>

                      {/* Expanded Category Store Details */}
                      {isExpanded && (
                        <View style={styles.expandedBox}>
                          <Text style={styles.expandedBoxTitle}>Sales per Store</Text>
                          <View style={{ gap: 4, marginTop: 4 }}>
                            {item.stores.map((st, sIdx) => (
                              <TouchableOpacity
                                key={sIdx}
                                style={styles.expandedRow}
                                onPress={() =>
                                  router.push({
                                    pathname: "/sales",
                                    params: { storeId: st.storeId, storeName: st.storeName, period: salesPeriod },
                                  })
                                }
                              >
                                <Text style={styles.expandedLabel}>{st.storeName}</Text>
                                <Text style={styles.expandedVal}>
                                  {st.count} sold ({formatCurrency(st.revenue)}) →
                                </Text>
                              </TouchableOpacity>
                            ))}
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
                const bgBadgeColor = isBottle ? "#4f46e5" : isGlass ? "#059669" : "#d97706";
                const isExpanded = expandedCardId === item.type;

                return (
                  <View
                    key={item.type}
                    style={[styles.typeCard, { borderLeftWidth: 3.5, borderLeftColor: bgBadgeColor }]}
                  >
                    <TouchableOpacity
                      style={styles.typeHeader}
                      onPress={() => setExpandedCardId(isExpanded ? null : item.type)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.typeBadge, { backgroundColor: bgBadgeColor + "18" }]}>
                        <Text style={[styles.typeBadgeText, { color: bgBadgeColor }]}>
                          {isBottle ? "🍾 BOTTLE" : isGlass ? "🍷 GLASS" : "🫗 CARAFE"}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                        <Text style={styles.typeRevenue}>{formatCurrency(item.revenue)}</Text>
                        {isExpanded ? (
                          <ChevronUp size={15} color={theme.textSecondary} />
                        ) : (
                          <ChevronDown size={15} color={theme.textSecondary} />
                        )}
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{ marginTop: 6, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}
                      onPress={() => setExpandedCardId(isExpanded ? null : item.type)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.typeTitle}>{item.label}</Text>
                        <Text style={styles.typeDetail}>
                          {item.count} sold ({item.volume} btl equiv)
                        </Text>
                      </View>
                      <View style={styles.sharePillContainer}>
                        {idx === 0 && item.percentage > 0 && (
                          <View style={[styles.rankBadge, { backgroundColor: bgBadgeColor + "1A", borderColor: bgBadgeColor + "40" }]}>
                            <Text style={[styles.rankBadgeText, { color: bgBadgeColor }]}>#1 TOP</Text>
                          </View>
                        )}
                        <View style={[styles.ringPill, { borderColor: bgBadgeColor + "40", backgroundColor: bgBadgeColor + "0D" }]}>
                          <View style={[styles.ringDot, { backgroundColor: bgBadgeColor }]} />
                          <Text style={[styles.ringPillText, { color: bgBadgeColor }]}>{item.percentage}%</Text>
                        </View>
                      </View>
                    </TouchableOpacity>

                    {/* Expanded Portion Store Details */}
                    {isExpanded && (
                      <View style={styles.expandedBox}>
                        <Text style={styles.expandedBoxTitle}>Sales per Store</Text>
                        <View style={{ gap: 4, marginTop: 4 }}>
                          {item.stores.length === 0 ? (
                            <Text style={styles.expandedLabel}>No sales recorded</Text>
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
                    <View style={styles.topCardBody}>
                      <View style={styles.topCardTitleRow}>
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

                      <Text style={[styles.topCardSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                        {!hasAlert
                          ? "All wines in stock"
                          : `${sa.stockout} zero · ${sa.parAlert + sa.underSafety} below PAR`}
                      </Text>
                    </View>

                    <View style={[styles.deliveryCardFooter, { borderTopColor: theme.border + "80" }]}>
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
                            paddingVertical: 2,
                            paddingHorizontal: 6,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.deliveryStatusBadgeText,
                            { color: hasAlert ? (sa.stockout > 0 ? "#ef4444" : "#d97706") : "#059669" },
                          ]}
                        >
                          {hasAlert ? (sa.stockout > 0 ? "STOCKOUT" : "PAR ALERT") : "HEALTHY"}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: hasAlert ? "#ef4444" : "#059669" }}>
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
                        <View style={styles.topCardBody}>
                          <View style={styles.topCardTitleRow}>
                            <View style={[styles.topCardIconCircle, { backgroundColor: "#f59e0b18" }]}>
                              <ClipboardList size={15} color="#f59e0b" strokeWidth={2.4} />
                            </View>
                            <Text style={[styles.topCardTitle, { color: theme.text }]} numberOfLines={1}>
                              {storeMap[task.outBoundStoreId || ""] || "Store Transfer"}
                            </Text>
                          </View>
                          <Text style={[styles.topCardSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                            REQ: {task.id.slice(0, 6).toUpperCase()}
                          </Text>
                        </View>

                        <View style={[styles.deliveryCardFooter, { borderTopColor: theme.border + "80" }]}>
                          <View style={[styles.deliveryStatusBadge, { backgroundColor: "rgba(245, 158, 11, 0.12)", borderColor: "rgba(245, 158, 11, 0.3)" }]}>
                            <Text style={[styles.deliveryStatusBadgeText, { color: "#d97706" }]}>
                              {task.status === "in_progress" ? "IN PROGRESS" : "PENDING"}
                            </Text>
                          </View>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                            <View style={styles.deliveryQtyPill}>
                              <Package size={12} color="#d97706" strokeWidth={2.2} />
                              <Text style={[styles.deliveryQtyText, { color: theme.text }]}>
                                {task.items.reduce((acc, i) => acc + (i.requestedQty || 0), 0)} btl
                              </Text>
                            </View>
                            <ChevronRight size={13} color="#94a3b8" />
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
                        <View style={styles.topCardBody}>
                          <View style={styles.topCardTitleRow}>
                            <View style={[styles.topCardIconCircle, { backgroundColor: theme.primary + "18" }]}>
                              <Truck size={15} color={theme.primary} strokeWidth={2.4} />
                            </View>
                            <Text style={[styles.topCardTitle, { color: theme.text }]} numberOfLines={1}>
                              → {storeMap[del.storeId] || "Store Delivery"}
                            </Text>
                          </View>
                          <Text style={[styles.topCardSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                            DEL: {del.id.slice(0, 6).toUpperCase()}
                          </Text>
                        </View>

                        <View style={[styles.deliveryCardFooter, { borderTopColor: theme.border + "80" }]}>
                          <View style={styles.deliveryStatusBadge}>
                            <Text style={styles.deliveryStatusBadgeText}>
                              {del.status === "receiving" ? "RECEIVING" : "DISPATCHED"}
                            </Text>
                          </View>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                            <View style={styles.deliveryQtyPill}>
                              <Package size={12} color={theme.primary} strokeWidth={2.2} />
                              <Text style={[styles.deliveryQtyText, { color: theme.text }]}>
                                {del.totalBottles} btl
                              </Text>
                            </View>
                            <ChevronRight size={13} color="#94a3b8" />
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
    padding: 12,
    justifyContent: "space-between",
    minHeight: 90,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
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
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  topCardTitle: {
    fontSize: 13,
    fontWeight: "800",
    flexShrink: 1,
  },
  topCardSubtitle: {
    fontSize: 11,
    fontWeight: "500",
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
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  topCardActionText: {
    fontSize: 11,
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
  responsiveGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  metricCard: {
    height: 124,
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  metricCount: {
    fontSize: 22,
    fontWeight: "900",
    color: "#ffffff",
    marginTop: 4,
    marginBottom: 2,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    textAlign: "center",
    color: "rgba(255,255,255,0.88)",
  },
  metricSubLabel: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
  },
  drilldownTabRow: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    padding: 3,
    marginBottom: 10,
  },
  drilldownTabBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  drilldownTabBtnActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  drilldownTabText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
  },
  drilldownTabTextActive: {
    fontWeight: "800",
    color: theme.primary,
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
    height: 10,
    borderRadius: 5,
    flexDirection: "row",
    overflow: "hidden",
    backgroundColor: "#e2e8f0",
    gap: 2,
  },
  distSegment: {
    height: "100%",
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
    width: 8,
    height: 8,
    borderRadius: 4,
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
    gap: 6,
  },
  breakdownHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  breakdownName: {
    fontSize: 13.5,
    fontWeight: "700",
    color: theme.text,
  },
  breakdownRevenue: {
    fontSize: 13.5,
    fontWeight: "800",
    color: theme.primary,
  },
  breakdownSubRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  breakdownSubText: {
    fontSize: 11.5,
    color: theme.textSecondary,
    fontWeight: "500",
  },
  sharePillContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rankBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  rankBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  ringPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1.2,
  },
  ringDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  ringPillText: {
    fontSize: 10.5,
    fontWeight: "800",
  },
  expandedBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  expandedBoxTitle: {
    fontSize: 10.5,
    fontWeight: "800",
    color: theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  expandedRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 2,
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
  viewStoreSalesBtn: {
    marginTop: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: theme.primary + "12",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.primary + "30",
  },
  viewStoreSalesText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: theme.primary,
  },
  typeCard: {
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.2,
    borderColor: theme.border,
  },
  typeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  typeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  typeRevenue: {
    fontSize: 13.5,
    fontWeight: "800",
    color: theme.text,
  },
  typeTitle: {
    fontSize: 12.5,
    fontWeight: "700",
    color: theme.text,
  },
  typeDetail: {
    fontSize: 11.5,
    color: theme.textSecondary,
    marginTop: 1,
  },
  emptyBreakdownCard: {
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 14,
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
    width: 175,
    borderRadius: 14,
    borderWidth: 1.2,
    padding: 12,
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    minHeight: 90,
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
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  deliveryCardTitle: {
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 2,
  },
  deliveryCardSubtitle: {
    fontSize: 11,
    fontWeight: "500",
  },
  deliveryCardCompact: {
    width: 236,
    borderRadius: 14,
    borderWidth: 1.2,
    padding: 12,
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    minHeight: 90,
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
    minHeight: 96,
  },
  tileHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  },
  tileTitle: {
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 1,
  },
  tileDesc: {
    fontSize: 10.5,
    fontWeight: "500",
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
