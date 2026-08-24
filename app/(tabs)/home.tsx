import AdminDashboard from "@/components/AdminDashboard";
import StoreStaffPOSTerminal from "@/components/StoreStaffPOSTerminal";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { clearToken } from "@/lib/auth";
import { countBottlesForStoreDashboard, getStores } from "@/lib/queries";
import { Delivery, PulloutRequest, Store, WineRequest } from "@/types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import {
  AlertOctagon,
  AlertTriangle,
  Banknote,
  CalendarCheck,
  ChevronRight,
  ClipboardList,
  FileDown,
  LayoutList,
  LogOut,
  MapPin,
  QrCode,
  Search,
  Truck,
  Wine,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
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

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { profile, loading, refreshProfile } = useAuth();
  const [dashboardMetrics, setDashboardMetrics] = useState({
    stockout: { wines: 0, bottles: 0 },
    parAlert: { wines: 0, bottles: 0 },
    underSafety: { wines: 0, bottles: 0 },
  });
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [outboundRequests, setOutboundRequests] = useState<WineRequest[]>([]);
  const [pulloutTasks, setPulloutTasks] = useState<PulloutRequest[]>([]);
  const [incomingDeliveries, setIncomingDeliveries] = useState<Delivery[]>([]);
  const [locations, setLocations] = useState<Record<string, string>>({});
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [salesDashboardMetrics, setSalesDashboardMetrics] = useState({
    soldCount: 0,
    totalRevenue: 0,
    activeBottles: 0,
    categoryCounts: { fast: 0, fine: 0, reserve: 0, standard: 0 },
    portionCounts: { bottle: 0, glass: 0, carafe: 0 },
    top5WinesByCategory: {
      fast: [] as Array<{ name: string; vintage?: string; volume: number; pctOfTotal: number }>,
      fine: [] as Array<{ name: string; vintage?: string; volume: number; pctOfTotal: number }>,
      reserve: [] as Array<{ name: string; vintage?: string; volume: number; pctOfTotal: number }>,
      standard: [] as Array<{ name: string; vintage?: string; volume: number; pctOfTotal: number }>,
    },
    staffRankings: [] as Array<{
      id: string;
      name: string;
      email: string;
      volume: number;
      salesCount: number;
      rank: number;
      isMe: boolean;
    }>,
    myRankInfo: {
      rank: 0,
      totalStaff: 0,
      volume: 0,
    },
  });
  const [loadingSales, setLoadingSales] = useState(true);
  const [salesPeriod, setSalesPeriod] = useState<"today" | "week" | "all">(
    "today",
  );
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);

  useEffect(() => {
    if (!loadingMetrics && !loadingRequests && !loadingSales) {
      setInitialDataLoaded(true);
    }
  }, [loadingMetrics, loadingRequests, loadingSales]);

  // --- Calculate Responsive Layout ---
  const isTablet = width >= 768;
  const cardsPerRow = isTablet ? 3 : 2;
  const containerPadding = 48; // scrollContent padding (24 * 2)
  const totalGap = 16 * (cardsPerRow - 1);
  const cardWidth = (width - containerPadding - totalGap) / cardsPerRow;

  const metricsCache = useRef<{ data: any; storeId: string; fetchedAt: number } | null>(null);
  const METRICS_TTL_MS = 5 * 60 * 1000;

  const fetchMetrics = useCallback(async () => {
    const storeId = profile?.locationId;
    const isStoreUser = profile?.role === "store" || profile?.role === "store_manager" || profile?.role === "store_staff";
    if (!isStoreUser || profile?.role === "store_staff" || !storeId) {
      setLoadingMetrics(false);
      return;
    }

    if (!refreshing) {
      const cached = metricsCache.current;
      if (
        cached &&
        cached.storeId === storeId &&
        Date.now() - cached.fetchedAt < METRICS_TTL_MS
      ) {
        setDashboardMetrics(cached.data);
        setLoadingMetrics(false);
        return;
      }
    }

    try {
      setLoadingMetrics(true);
      const storageKey = `dashboard_metrics_${storeId}`;
      if (!refreshing && !metricsCache.current) {
        const raw = await AsyncStorage.getItem(storageKey);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Date.now() - parsed.ts < METRICS_TTL_MS) {
              setDashboardMetrics(parsed.data);
              setLoadingMetrics(false);
            }
          } catch (e) {
            console.warn("Invalid storage cache", e);
          }
        }
      }

      // Fetch ACTIVE pending requests to exclude wines already being re-ordered
      const [pendingData, settingsData] = await Promise.all([
        apiFetch(`/wine-requests?storeId=${storeId}&status=pending,approved,in_progress,receiving`),
        apiFetch(`/stock-settings?storeId=${storeId}&discontinued=false`),
      ]);

      const pendingWineIds = new Set<string>();
      const pendingRequests = pendingData.wineRequests || pendingData;
      pendingRequests.forEach((req: any) => {
        req.items?.forEach((item: { masterWineId: string }) => {
          if (item.masterWineId) pendingWineIds.add(item.masterWineId);
        });
      });

      const allSettings: any[] = settingsData.settings || settingsData;
      const metrics = {
        stockout: { wines: 0, bottles: 0 },
        parAlert: { wines: 0, bottles: 0 },
        underSafety: { wines: 0, bottles: 0 },
      };

      const validSettings = allSettings.filter(s => !pendingWineIds.has(s.masterWineId));
      const counts = await countBottlesForStoreDashboard(storeId, validSettings);

      validSettings.forEach((setting, index) => {
        const { parLevel = 0, safetyStock = 0 } = setting;
        const count = counts[index];

        if (count === 0) {
          metrics.stockout.wines++;
          metrics.stockout.bottles += safetyStock || parLevel;
        } else if (count < safetyStock) {
          metrics.underSafety.wines++;
          metrics.underSafety.bottles += safetyStock - count;
        } else if (parLevel > 0 && count <= parLevel) {
          metrics.parAlert.wines++;
          metrics.parAlert.bottles += parLevel - count;
        }
      });

      metricsCache.current = { data: metrics, storeId, fetchedAt: Date.now() };
      await AsyncStorage.setItem(storageKey, JSON.stringify({ data: metrics, ts: Date.now() }));
      setDashboardMetrics(metrics);
    } catch (err) {
      console.error("Failed to fetch dashboard metrics:", err);
    } finally {
      setLoadingMetrics(false);
    }
  }, [profile, refreshing]);

  const outboundCache = useRef<{ data: any; storeId: string; fetchedAt: number } | null>(null);
  const OUTBOUND_TTL_MS = 2 * 60 * 1000;

  const fetchOutboundRequests = useCallback(async () => {
    const isStoreUser = profile?.role === "store" || profile?.role === "store_manager" || profile?.role === "store_staff";
    if (!isStoreUser || profile?.role === "store_staff" || !profile?.locationId) {
      setLoadingRequests(false);
      return;
    }

    if (!refreshing) {
      const cached = outboundCache.current;
      if (
        cached &&
        cached.storeId === profile.locationId &&
        Date.now() - cached.fetchedAt < OUTBOUND_TTL_MS
      ) {
        setOutboundRequests(cached.data.requests);
        setIncomingDeliveries(cached.data.deliveries);
        setPulloutTasks(cached.data.pullouts);
        setLocations(cached.data.locMap);
        setLoadingRequests(false);
        return;
      }
    }

    try {
      setLoadingRequests(true);
      const [reqData, delData, pulloutData, storesData] = await Promise.all([
        apiFetch(`/wine-requests?storeId=${profile.locationId}&status=outbound,receiving`),
        apiFetch(`/deliveries?storeId=${profile.locationId}&status=dispatched,receiving`),
        apiFetch(`/pullout-requests?sourceStoreId=${profile.locationId}&status=pending,in_progress`),
        getStores(),
      ]);

      const requests: WineRequest[] = reqData.wineRequests || reqData;
      const deliveries: Delivery[] = delData.deliveries || delData;
      const pullouts: PulloutRequest[] = pulloutData.pulloutRequests || pulloutData;
      const stores: Store[] = storesData || [];

      const locMap: Record<string, string> = {};
      stores.forEach((s) => {
        locMap[s.id] = s.name;
      });

      outboundCache.current = {
        data: { requests, deliveries, pullouts, locMap },
        storeId: profile.locationId,
        fetchedAt: Date.now(),
      };

      setLocations(locMap);
      setOutboundRequests(requests);
      setIncomingDeliveries(deliveries);
      setPulloutTasks(pullouts);
    } catch (error) {
      console.error("Error fetching incoming requests/deliveries:", error);
    } finally {
      setLoadingRequests(false);
    }
  }, [profile, refreshing]);

  const fetchSalesMetrics = useCallback(async () => {
    const storeId = profile?.locationId;
    const isStoreUser = profile?.role === "store" || profile?.role === "store_manager" || profile?.role === "store_staff";
    if (!isStoreUser || !storeId) {
      setLoadingSales(false);
      return;
    }

    try {
      setLoadingSales(true);
      const bottlesData = await apiFetch(`/bottles?storeId=${storeId}&status=received,shelved&countOnly=true`);
      const activeBottles = bottlesData.count ?? 0;

      let startDate;
      if (salesPeriod === "today") {
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
      } else if (salesPeriod === "week") {
        startDate = new Date();
        startDate.setDate(startDate.getDate() - startDate.getDay());
        startDate.setHours(0, 0, 0, 0);
      } else {
        startDate = new Date(0); // for 'all'
      }

      const params = new URLSearchParams({
        storeId,
        from: startDate.toISOString(),
        to: new Date().toISOString(),
      });
      const data = await apiFetch(`/sales?${params}`);
      const salesList = Array.isArray(data) ? data : Array.isArray(data.sales) ? data.sales : [];

      const isStaffOnly = profile?.role === "store_staff";

      // For store_staff, filter sales to logged-in user only
      // For store / store_manager, use ALL store sales
      const salesToAnalyze = isStaffOnly
        ? salesList.filter(
          (s: any) =>
            s.soldById === profile.id ||
            (s.soldByEmail && profile.email && s.soldByEmail.toLowerCase() === profile.email.toLowerCase())
        )
        : salesList;

      let totalVolume = 0;
      let storeTotalRevenue = 0;
      const catCounts = { fast: 0, fine: 0, reserve: 0, standard: 0 };
      const portionCounts = { bottle: 0, glass: 0, carafe: 0 };

      const wineAggByCategory: Record<string, Record<string, { id: string; name: string; vintage?: string; volume: number }>> = {
        fast: {},
        fine: {},
        reserve: {},
        standard: {},
      };

      // Calculate gross revenue for entire store if store / store_manager
      if (!isStaffOnly) {
        salesList.forEach((s: any) => {
          const amt = Number(s.totalAmount || s.price || 0);
          storeTotalRevenue += amt;
        });
      }

      salesToAnalyze.forEach((item: any) => {
        const st = (item.saleType || "bottle").toLowerCase();
        let vol = 1;
        if (st === "glass") {
          vol = 1 / 6;
          portionCounts.glass += 1;
        } else if (st === "carafe") {
          vol = 2 / 6;
          portionCounts.carafe += 1;
        } else {
          vol = Number(item.quantity || 1);
          portionCounts.bottle += 1;
        }
        totalVolume += vol;

        const cat = (item.wineCategory || item.masterWine?.wineCategory || "standard").toLowerCase();
        const cKey = cat in catCounts ? cat : "standard";
        catCounts[cKey as keyof typeof catCounts] += vol;

        const wId = item.masterWineId || item.wineName || item.bottleId || "unknown";
        const wName = item.wineName || item.masterWine?.name || "Unknown Wine";
        const wVintage = item.vintage || item.masterWine?.vintage || "";

        if (!wineAggByCategory[cKey][wId]) {
          wineAggByCategory[cKey][wId] = {
            id: wId,
            name: wName,
            vintage: wVintage,
            volume: 0,
          };
        }
        wineAggByCategory[cKey][wId].volume += vol;
      });

      // Round category bottle volumes to 2 decimal places max
      Object.keys(catCounts).forEach((key) => {
        const k = key as keyof typeof catCounts;
        catCounts[k] = Math.round(catCounts[k] * 100) / 100;
      });

      // Extract Top 5 per category
      const top5ByCategory: {
        fast: Array<{ name: string; vintage?: string; volume: number; pctOfTotal: number }>;
        fine: Array<{ name: string; vintage?: string; volume: number; pctOfTotal: number }>;
        reserve: Array<{ name: string; vintage?: string; volume: number; pctOfTotal: number }>;
        standard: Array<{ name: string; vintage?: string; volume: number; pctOfTotal: number }>;
      } = {
        fast: [],
        fine: [],
        reserve: [],
        standard: [],
      };

      (Object.keys(wineAggByCategory) as Array<keyof typeof top5ByCategory>).forEach((cKey) => {
        const wines = Object.values(wineAggByCategory[cKey]);
        wines.forEach((w) => {
          w.volume = Math.round(w.volume * 100) / 100;
        });
        wines.sort((a, b) => b.volume - a.volume);

        top5ByCategory[cKey] = wines.slice(0, 5).map((w) => ({
          name: w.name,
          vintage: w.vintage,
          volume: w.volume,
          pctOfTotal: totalVolume > 0 ? Math.round((w.volume / totalVolume) * 1000) / 10 : 0,
        }));
      });

      // Calculate Staff Rankings across all store sales
      const staffMap: Record<string, { id: string; name: string; email: string; volume: number; salesCount: number }> = {};

      salesList.forEach((item: any) => {
        const stId = item.soldById || item.soldByEmail || item.soldByName || "unknown";
        const stName = item.soldByName || (item.soldByEmail ? item.soldByEmail.split("@")[0] : "Staff Member");
        const stEmail = item.soldByEmail || "";

        const st = (item.saleType || "bottle").toLowerCase();
        let vol = 1;
        if (st === "glass") vol = 1 / 6;
        else if (st === "carafe") vol = 2 / 6;
        else vol = Number(item.quantity || 1);

        if (!staffMap[stId]) {
          staffMap[stId] = {
            id: stId,
            name: stName,
            email: stEmail,
            volume: 0,
            salesCount: 0,
          };
        }
        staffMap[stId].volume += vol;
        staffMap[stId].salesCount += 1;
      });

      const sortedStaffList = Object.values(staffMap)
        .map((s) => ({
          ...s,
          volume: Math.round(s.volume * 100) / 100,
        }))
        .sort((a, b) => b.volume - a.volume);

      let myRankNum = 0;
      let myStaffVol = 0;

      const staffRankingsList = sortedStaffList.map((s, idx) => {
        const isMe = Boolean(
          (profile?.id && s.id === profile.id) ||
          (profile?.email && s.email && s.email.toLowerCase() === profile.email.toLowerCase())
        );
        if (isMe) {
          myRankNum = idx + 1;
          myStaffVol = s.volume;
        }
        return {
          ...s,
          rank: idx + 1,
          isMe,
        };
      });

      setSalesDashboardMetrics({
        soldCount: Math.round(totalVolume * 100) / 100,
        totalRevenue: isStaffOnly ? 0 : storeTotalRevenue,
        activeBottles,
        categoryCounts: catCounts,
        portionCounts: portionCounts,
        top5WinesByCategory: top5ByCategory,
        staffRankings: staffRankingsList,
        myRankInfo: {
          rank: myRankNum,
          totalStaff: staffRankingsList.length,
          volume: myStaffVol,
        },
      });
    } catch (err) {
      console.error("Failed to fetch sales metrics:", err);
    } finally {
      setLoadingSales(false);
    }
  }, [profile, salesPeriod]);

  const [todayCloseStatus, setTodayCloseStatus] = useState<{
    status: string;
    totalRevenue: number;
    totalBottlesSold: number;
  } | null>(null);

  const fetchTodayCloseStatus = useCallback(async () => {
    const isManager = profile?.role === "store_manager" || profile?.role === "store";
    if (!isManager || !profile?.locationId) return;
    try {
      const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
      const res = await apiFetch(`/day-close?storeId=${profile.locationId}&date=${todayStr}`);
      if (res?.dayClose) {
        setTodayCloseStatus({
          status: res.dayClose.status,
          totalRevenue: Number(res.dayClose.totalRevenue || 0),
          totalBottlesSold: Number(res.dayClose.totalBottlesSold || 0),
        });
      }
    } catch (err) {
      console.warn("Failed to fetch today close status", err);
    }
  }, [profile]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const isStoreUser = profile?.role === "store" || profile?.role === "store_manager" || profile?.role === "store_staff";
      if (isStoreUser) {
        const promises: Promise<any>[] = [fetchSalesMetrics(), fetchTodayCloseStatus()];
        if (profile?.role !== "store_staff") {
          promises.push(fetchMetrics(), fetchOutboundRequests());
        }
        await Promise.all(promises);
      }
    } catch (e) {
      console.error("Failed to refresh:", e);
    } finally {
      setRefreshing(false);
    }
  }, [profile, fetchMetrics, fetchOutboundRequests, fetchSalesMetrics, fetchTodayCloseStatus]);

  useFocusEffect(
    useCallback(() => {
      if (!loading) {
        AsyncStorage.getItem("forceDashboardRefresh").then((flag) => {
          if (flag === "true") {
            AsyncStorage.removeItem("forceDashboardRefresh");
            onRefresh();
          } else {
            fetchMetrics();
            fetchOutboundRequests();
            fetchSalesMetrics();
            fetchTodayCloseStatus();
          }
        });
      }
    }, [loading, profile, fetchMetrics, fetchOutboundRequests, fetchSalesMetrics, fetchTodayCloseStatus, onRefresh]),
  );

  useEffect(() => {
    if (!loading) {
      fetchSalesMetrics();
      fetchTodayCloseStatus();
    }
  }, [loading, profile, salesPeriod, fetchSalesMetrics, fetchTodayCloseStatus]);

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to exit the system?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Exit System",
        style: "destructive",
        onPress: async () => {
          try {
            await clearToken();
            await refreshProfile();
            router.replace("/login");
          } catch (error) {
            console.error("Sign out error:", error);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <View style={styles.logoBadge}>
          <Wine size={32} color="#ffffff" strokeWidth={2.5} />
        </View>
      </View>
    );
  }

  // Admin role gets its own dedicated dashboard
  if (profile?.role === "admin") {
    return <AdminDashboard />;
  }

  // Store Staff gets dedicated POS Terminal
  if (profile?.role === "store_staff") {
    return <StoreStaffPOSTerminal />;
  }

  const role = profile?.role || "warehouse";
  const isStore = role === "store" || role === "store_manager";
  const isStoreStaff = false;
  const theme = isStore ? Colors.store : Colors.warehouse;

  if (!initialDataLoaded) {
    return (
      <View
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center", backgroundColor: theme.background },
        ]}
      >
        <View style={[styles.logoBadge, { backgroundColor: theme.logoBg, borderRadius: isStore ? 20 : 10 }]}>
          <Wine size={32} color="#ffffff" strokeWidth={2.5} />
        </View>
        <ActivityIndicator color={theme.primary} style={{ marginTop: 24 }} size="large" />
      </View>
    );
  }

  const hasAlerts =
    !isStoreStaff &&
    (dashboardMetrics.stockout.wines > 0 ||
      dashboardMetrics.parAlert.wines > 0 ||
      dashboardMetrics.underSafety.wines > 0);
  const hasDeliveries =
    !isStoreStaff &&
    (outboundRequests.length > 0 || incomingDeliveries.length > 0);
  const hasPulloutTasks = !isStoreStaff && pulloutTasks.length > 0;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
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
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.logoContainer}>
              <View
                style={[
                  styles.logoBadge,
                  {
                    backgroundColor: theme.logoBg,
                    borderRadius: isStore ? 20 : 10,
                  },
                ]}
              >
                <Wine
                  size={24}
                  color={isStore ? "#fff" : "#fff"}
                  strokeWidth={2.5}
                />
              </View>
              <Text
                style={[
                  styles.title,
                  {
                    color: theme.text,
                    fontFamily: isStore ? "System" : undefined,
                    letterSpacing: isStore ? 2 : -1,
                  },
                ]}
              >
                {isStore ? "Caveau" : "CaveauOne"}
                {isStore && (
                  <Text style={{ color: theme.accent, fontWeight: "300" }}>
                    One
                  </Text>
                )}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.signOutButton,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
              onPress={handleSignOut}
            >
              <LogOut size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {isStore
              ? isStoreStaff
                ? "Boutique Sales Terminal (Staff)"
                : "Boutique Sommelier Terminal"
              : "Warehouse Management System"}
          </Text>
        </View>

        {isStore && (profile?.role === "store_manager" || profile?.role === "store") && (
          <TouchableOpacity
            style={{
              flexDirection: "row",
              alignItems: "center",
              padding: 14,
              borderRadius: 16,
              borderWidth: 1,
              marginBottom: 16,
              gap: 12,
              backgroundColor:
                todayCloseStatus?.status === "submitted" || todayCloseStatus?.status === "acknowledged"
                  ? "#10b98115"
                  : "#f59e0b15",
              borderColor:
                todayCloseStatus?.status === "submitted" || todayCloseStatus?.status === "acknowledged"
                  ? "#10b98140"
                  : "#f59e0b40",
            }}
            onPress={() => router.push("/day-close")}
          >
            <CalendarCheck
              size={24}
              color={
                todayCloseStatus?.status === "submitted" || todayCloseStatus?.status === "acknowledged"
                  ? "#10b981"
                  : "#f59e0b"
              }
            />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "900",
                  color:
                    todayCloseStatus?.status === "submitted" || todayCloseStatus?.status === "acknowledged"
                      ? "#059669"
                      : "#d97706",
                }}
              >
                {todayCloseStatus?.status === "acknowledged"
                  ? "Day Close Acknowledged ✓"
                  : todayCloseStatus?.status === "submitted"
                    ? "Today's Day Close Submitted ✓"
                    : "Today's Sales Day Is Still Open ⚠️"}
              </Text>
              <Text style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                {todayCloseStatus?.status === "submitted" || todayCloseStatus?.status === "acknowledged"
                  ? `₱${todayCloseStatus.totalRevenue.toLocaleString()} · ${todayCloseStatus.totalBottlesSold} btl sold`
                  : "Tap to review metrics, report discrepancies & close day →"}
              </Text>
            </View>
            <ChevronRight size={18} color="#94a3b8" />
          </TouchableOpacity>
        )}

        {isStore && hasAlerts && (
          <View style={styles.metricsDashboard}>
            <Text style={styles.metricsTitle}>Inventory Alerts</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.metricsGrid}
            >
              {dashboardMetrics.stockout.wines > 0 && (
                <TouchableOpacity
                  style={[styles.metricCard, { backgroundColor: "#ef4444" }]}
                  onPress={() =>
                    router.push({
                      pathname: "/store-master-list",
                      params: { filter: "stockout" },
                    })
                  }
                >
                  <AlertOctagon size={24} color="#ffffff" strokeWidth={2.5} />
                  <Text style={[styles.metricCount, { color: "#ffffff" }]}>
                    {dashboardMetrics.stockout.wines}
                  </Text>
                  <Text style={styles.metricLabel}>Stockout Wines</Text>
                  <Text style={styles.metricSubLabel}>
                    {dashboardMetrics.stockout.bottles} bottles needed
                  </Text>
                </TouchableOpacity>
              )}

              {dashboardMetrics.parAlert.wines > 0 && (
                <TouchableOpacity
                  style={[styles.metricCard, { backgroundColor: "#f97316" }]}
                  onPress={() =>
                    router.push({
                      pathname: "/store-master-list",
                      params: { filter: "alerts" },
                    })
                  }
                >
                  <AlertTriangle
                    size={24}
                    color="#ffffff"
                    strokeWidth={2.5}
                  />
                  <Text style={[styles.metricCount, { color: "#ffffff" }]}>
                    {dashboardMetrics.parAlert.wines}
                  </Text>
                  <Text style={styles.metricLabel}>PAR Alert Wines</Text>
                  <Text style={styles.metricSubLabel}>
                    {dashboardMetrics.parAlert.bottles} bottles needed
                  </Text>
                </TouchableOpacity>
              )}

              {dashboardMetrics.underSafety.wines > 0 && (
                <TouchableOpacity
                  style={[styles.metricCard, { backgroundColor: "#eab308" }]}
                  onPress={() =>
                    router.push({
                      pathname: "/store-master-list",
                      params: { filter: "under_safety" },
                    })
                  }
                >
                  <AlertTriangle
                    size={24}
                    color="#ffffff"
                    strokeWidth={2.5}
                  />
                  <Text style={[styles.metricCount, { color: "#ffffff" }]}>
                    {dashboardMetrics.underSafety.wines}
                  </Text>
                  <Text style={styles.metricLabel}>Under Safety</Text>
                  <Text style={styles.metricSubLabel}>
                    {dashboardMetrics.underSafety.bottles} bottles needed
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        )}

        {isStore && (hasPulloutTasks || hasDeliveries) && (
          <View style={isTablet ? styles.tasksRow : undefined}>
            {hasPulloutTasks && (
              <View style={[styles.metricsDashboard, isTablet ? styles.taskColumn : undefined]}>
                <Text style={styles.metricsTitle}>Pullout Tasks</Text>
                <View style={{ gap: 12 }}>
                  {pulloutTasks.map((task) => (
                    <TouchableOpacity
                      key={task.id}
                      style={[
                        styles.requestCard,
                        {
                          backgroundColor: theme.card,
                          borderColor: theme.border,
                        },
                      ]}
                      onPress={() =>
                        router.push({
                          pathname: "/pullout/[id]",
                          params: { id: task.id },
                        })
                      }
                    >
                      <View
                        style={[
                          styles.requestCardIcon,
                          { backgroundColor: "#f59e0b15" },
                        ]}
                      >
                        <ClipboardList size={20} color="#f59e0b" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.requestCardTitle, { color: theme.text }]}
                        >
                          Pull Stock for Another Store
                        </Text>
                        <Text style={styles.requestCardSubtitle}>
                          {task.items.reduce(
                            (acc, i) => acc + (i.requestedQty || 0),
                            0,
                          )}{" "}
                          items • REQ: {task.id.slice(0, 4).toUpperCase()}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {hasDeliveries && (
              <View style={[styles.metricsDashboard, isTablet ? styles.taskColumn : undefined]}>
                <Text style={styles.metricsTitle}>Incoming Deliveries</Text>
                <View style={{ gap: 12 }}>
                  {outboundRequests.map((req) => {
                    const targetStoreName =
                      req.targetStoreId === "warehouse"
                        ? "Central Warehouse"
                        : locations[req.targetStoreId || ""] || "Unknown Source";

                    return (
                      <TouchableOpacity
                        key={req.id}
                        style={[
                          styles.requestCard,
                          {
                            backgroundColor: theme.card,
                            borderColor: theme.border,
                          },
                        ]}
                        onPress={() =>
                          router.push({
                            pathname: "/wine-requests/[id]",
                            params: { id: req.id },
                          })
                        }
                      >
                        <View style={styles.requestCardIcon}>
                          <Truck size={20} color={theme.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.requestCardTitle,
                              { color: theme.text },
                            ]}
                          >
                            Transfer from {targetStoreName}
                          </Text>
                          <Text style={styles.requestCardSubtitle}>
                            {req.items.reduce((acc, i) => acc + (i.qty || 0), 0)}{" "}
                            items • REQ: {req.id.slice(0, 4).toUpperCase()}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}

                  {incomingDeliveries.map((del) => (
                    <TouchableOpacity
                      key={del.id}
                      style={[
                        styles.requestCard,
                        {
                          backgroundColor: theme.card,
                          borderColor: theme.border,
                        },
                      ]}
                      onPress={() =>
                        router.push({
                          pathname: "/deliveries/[id]",
                          params: { id: del.id },
                        })
                      }
                    >
                      <View style={styles.requestCardIcon}>
                        <Truck size={20} color="#8b5cf6" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.requestCardTitle, { color: theme.text }]}
                        >
                          Admin Delivery
                        </Text>
                        <Text style={styles.requestCardSubtitle}>
                          {del.totalBottles} items • DEL:{" "}
                          {del.id.slice(0, 4).toUpperCase()}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        {isStore && (
          <View style={styles.metricsDashboard}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <Text style={styles.metricsTitle}>Sales Dashboard</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  onPress={() => setSalesPeriod("today")}
                  style={[
                    styles.filterButton,
                    {
                      backgroundColor: theme.card,
                      borderColor: theme.border,
                    },
                    salesPeriod === "today" && {
                      backgroundColor: theme.primary,
                      borderColor: theme.primary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterButtonText,
                      { color: theme.textSecondary },
                      salesPeriod === "today" && { color: "#fff" },
                    ]}
                  >
                    Today
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setSalesPeriod("week")}
                  style={[
                    styles.filterButton,
                    {
                      backgroundColor: theme.card,
                      borderColor: theme.border,
                    },
                    salesPeriod === "week" && {
                      backgroundColor: theme.primary,
                      borderColor: theme.primary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterButtonText,
                      { color: theme.textSecondary },
                      salesPeriod === "week" && { color: "#fff" },
                    ]}
                  >
                    Week
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setSalesPeriod("all")}
                  style={[
                    styles.filterButton,
                    {
                      backgroundColor: theme.card,
                      borderColor: theme.border,
                    },
                    salesPeriod === "all" && {
                      backgroundColor: theme.primary,
                      borderColor: theme.primary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterButtonText,
                      { color: theme.textSecondary },
                      salesPeriod === "all" && { color: "#fff" },
                    ]}
                  >
                    All
                  </Text>
                </TouchableOpacity>
                <View style={{ width: 1, height: 16, backgroundColor: theme.border, marginHorizontal: 4 }} />
                <TouchableOpacity
                  onPress={() => router.push("/sales")}
                  style={[
                    styles.filterButton,
                    {
                      backgroundColor: theme.primary,
                      borderColor: theme.primary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterButtonText,
                      { color: "#fff", fontWeight: "900" },
                    ]}
                  >
                    View All →
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Replaced ScrollView with Responsive Grid for Non-Staff */}
            {!isStoreStaff && (
              <View style={styles.responsiveGrid}>
                {/* Card 1: Total Revenue (Clickable) */}
                <TouchableOpacity
                  style={[
                    styles.metricCard,
                    { width: cardWidth, backgroundColor: theme.primary },
                  ]}
                  onPress={() =>
                    router.push({
                      pathname: "/sales",
                      params: { period: salesPeriod },
                    })
                  }
                  activeOpacity={0.8}
                >
                  <Banknote size={24} color="#ffffff" strokeWidth={2.5} />
                  <Text
                    style={[styles.metricCount, { color: "#ffffff" }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    ₱
                    {salesDashboardMetrics.totalRevenue?.toLocaleString(
                      undefined,
                      {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      },
                    )}
                  </Text>
                  <Text style={styles.metricLabel}>Total Revenue</Text>
                  <Text style={styles.metricSubLabel}>
                    {salesPeriod === "today"
                      ? "Today"
                      : salesPeriod === "week"
                        ? "This Week"
                        : "All Time"}
                  </Text>
                </TouchableOpacity>

                {/* Card 2: Bottles Sold (Clickable) */}
                <TouchableOpacity
                  style={[
                    styles.metricCard,
                    { width: cardWidth, backgroundColor: theme.secondary },
                  ]}
                  onPress={() =>
                    router.push({
                      pathname: "/sales",
                      params: { period: salesPeriod },
                    })
                  }
                  activeOpacity={0.8}
                >
                  <Wine size={24} color="#ffffff" strokeWidth={2.5} />
                  <Text style={[styles.metricCount, { color: "#ffffff" }]}>
                    {salesDashboardMetrics.soldCount % 1 === 0 ? salesDashboardMetrics.soldCount : salesDashboardMetrics.soldCount.toFixed(2)}
                  </Text>
                  <Text style={styles.metricLabel}>Bottles Sold</Text>
                  <Text style={styles.metricSubLabel}>
                    {salesPeriod === "today"
                      ? "Today"
                      : salesPeriod === "week"
                        ? "This Week"
                        : "All Time"}
                  </Text>
                </TouchableOpacity>

                {/* Card 3: Active Inventory (Non-clickable as requested) */}
                <View
                  style={[
                    styles.metricCard,
                    {
                      width: isTablet ? cardWidth : "100%",
                      backgroundColor: "#64748b",
                    },
                  ]}
                >
                  <LayoutList size={24} color="#ffffff" strokeWidth={2.5} />
                  <Text style={[styles.metricCount, { color: "#ffffff" }]}>
                    {salesDashboardMetrics.activeBottles}
                  </Text>
                  <Text style={styles.metricLabel}>Active Inventory</Text>
                  <Text style={styles.metricSubLabel}>Current Stock</Text>
                </View>
              </View>
            )}

            {/* Main Dashboard Breakdowns for Store Staff */}
            {isStoreStaff && (
              <View style={{ marginTop: 12, gap: 16 }}>
                {/* Staff Leaderboard & My Rank Card */}
                <View style={{ backgroundColor: theme.card, borderRadius: 16, borderWidth: 1, borderColor: theme.border, padding: 14 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: theme.border, gap: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#f59e0b20", alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontSize: 18 }}>
                          {salesDashboardMetrics.myRankInfo.rank === 1 ? "🥇" : salesDashboardMetrics.myRankInfo.rank === 2 ? "🥈" : salesDashboardMetrics.myRankInfo.rank === 3 ? "🥉" : "🏆"}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "900", color: theme.text }}>
                          {salesDashboardMetrics.myRankInfo.rank === 1
                            ? "🥇 You're Rank #1 Staff Leader!"
                            : salesDashboardMetrics.myRankInfo.rank > 0
                              ? `🏆 You're Rank #${salesDashboardMetrics.myRankInfo.rank} of ${salesDashboardMetrics.myRankInfo.totalStaff} Staff`
                              : "Staff Sales Leaderboard"}
                        </Text>
                        <Text style={{ fontSize: 10, fontWeight: "600", color: theme.textSecondary, marginTop: 1 }}>
                          {salesDashboardMetrics.myRankInfo.volume} btl sold by your account
                        </Text>
                      </View>
                    </View>
                    <View style={{ backgroundColor: theme.primary + "15", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                      <Text style={{ fontSize: 10, fontWeight: "800", color: theme.primary }}>
                        {salesPeriod === "today" ? "Today" : salesPeriod === "week" ? "This Week" : "All Time"}
                      </Text>
                    </View>
                  </View>

                  {/* Staff Rankings List */}
                  {salesDashboardMetrics.staffRankings.length === 0 ? (
                    <Text style={{ fontSize: 11, color: theme.textSecondary, textAlign: "center", paddingVertical: 10 }}>
                      No staff sales recorded for this period.
                    </Text>
                  ) : (
                    <View style={{ gap: 6 }}>
                      {salesDashboardMetrics.staffRankings.map((staff) => (
                        <View
                          key={staff.id}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: 8,
                            borderRadius: 10,
                            backgroundColor: staff.isMe ? theme.primary + "15" : theme.background,
                            borderWidth: staff.isMe ? 1 : 0,
                            borderColor: staff.isMe ? theme.primary + "40" : "transparent",
                          }}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                            <View
                              style={{
                                width: 22,
                                height: 22,
                                borderRadius: 11,
                                backgroundColor: staff.rank === 1 ? "#f59e0b" : staff.rank === 2 ? "#94a3b8" : staff.rank === 3 ? "#d97706" : theme.border,
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Text style={{ fontSize: 10, fontWeight: "900", color: staff.rank <= 3 ? "#ffffff" : theme.textSecondary }}>
                                #{staff.rank}
                              </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 12, fontWeight: staff.isMe ? "900" : "700", color: theme.text }} numberOfLines={1}>
                                {staff.name} {staff.isMe ? "(You)" : ""}
                              </Text>
                              <Text style={{ fontSize: 9, color: theme.textSecondary }}>
                                {staff.salesCount} transaction{staff.salesCount !== 1 ? "s" : ""}
                              </Text>
                            </View>
                          </View>

                          <View style={{ alignItems: "flex-end" }}>
                            <Text style={{ fontSize: 13, fontWeight: "900", color: staff.isMe ? theme.primary : theme.text }}>
                              {staff.volume % 1 === 0 ? staff.volume : staff.volume.toFixed(2)} btl
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {/* Segregated by Wine Category (Glass Computation in Bottles) */}
                <View>
                  <Text style={{ fontSize: 12, fontWeight: "800", color: theme.text, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                    Wine Category (Top 5 Sellers)
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    <View style={{ flex: 1, minWidth: 140, backgroundColor: "#f59e0b15", borderColor: "#f59e0b40", borderWidth: 1, padding: 12, borderRadius: 12 }}>
                      <Text style={{ fontSize: 10, fontWeight: "800", color: "#d97706" }}>⚡ FAST MOVING</Text>
                      <Text style={{ fontSize: 18, fontWeight: "900", color: "#b45309", marginTop: 4 }}>
                        {salesDashboardMetrics.categoryCounts.fast % 1 === 0
                          ? `${salesDashboardMetrics.categoryCounts.fast} btl`
                          : `${salesDashboardMetrics.categoryCounts.fast.toFixed(2)} btl`}
                      </Text>
                      {salesDashboardMetrics.top5WinesByCategory.fast.length > 0 && (
                        <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: "#f59e0b30", paddingTop: 6, gap: 4 }}>
                          {salesDashboardMetrics.top5WinesByCategory.fast.map((w, idx) => (
                            <View key={idx} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                              <Text style={{ fontSize: 10, fontWeight: "700", color: "#b45309", flex: 1 }} numberOfLines={1}>
                                #{idx + 1} {w.name}
                              </Text>
                              <Text style={{ fontSize: 10, fontWeight: "800", color: "#d97706", marginLeft: 4 }}>
                                {w.volume} btl ({w.pctOfTotal}%)
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>

                    <View style={{ flex: 1, minWidth: 140, backgroundColor: "#ec489915", borderColor: "#ec489940", borderWidth: 1, padding: 12, borderRadius: 12 }}>
                      <Text style={{ fontSize: 10, fontWeight: "800", color: "#be185d" }}>⭐ FINE WINE</Text>
                      <Text style={{ fontSize: 18, fontWeight: "900", color: "#9d174d", marginTop: 4 }}>
                        {salesDashboardMetrics.categoryCounts.fine % 1 === 0
                          ? `${salesDashboardMetrics.categoryCounts.fine} btl`
                          : `${salesDashboardMetrics.categoryCounts.fine.toFixed(2)} btl`}
                      </Text>
                      {salesDashboardMetrics.top5WinesByCategory.fine.length > 0 && (
                        <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: "#ec489930", paddingTop: 6, gap: 4 }}>
                          {salesDashboardMetrics.top5WinesByCategory.fine.map((w, idx) => (
                            <View key={idx} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                              <Text style={{ fontSize: 10, fontWeight: "700", color: "#9d174d", flex: 1 }} numberOfLines={1}>
                                #{idx + 1} {w.name}
                              </Text>
                              <Text style={{ fontSize: 10, fontWeight: "800", color: "#be185d", marginLeft: 4 }}>
                                {w.volume} btl ({w.pctOfTotal}%)
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>

                    <View style={{ flex: 1, minWidth: 140, backgroundColor: "#6366f115", borderColor: "#6366f140", borderWidth: 1, padding: 12, borderRadius: 12 }}>
                      <Text style={{ fontSize: 10, fontWeight: "800", color: "#4338ca" }}>🔒 RESERVE</Text>
                      <Text style={{ fontSize: 18, fontWeight: "900", color: "#3730a3", marginTop: 4 }}>
                        {salesDashboardMetrics.categoryCounts.reserve % 1 === 0
                          ? `${salesDashboardMetrics.categoryCounts.reserve} btl`
                          : `${salesDashboardMetrics.categoryCounts.reserve.toFixed(2)} btl`}
                      </Text>
                      {salesDashboardMetrics.top5WinesByCategory.reserve.length > 0 && (
                        <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: "#6366f130", paddingTop: 6, gap: 4 }}>
                          {salesDashboardMetrics.top5WinesByCategory.reserve.map((w, idx) => (
                            <View key={idx} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                              <Text style={{ fontSize: 10, fontWeight: "700", color: "#3730a3", flex: 1 }} numberOfLines={1}>
                                #{idx + 1} {w.name}
                              </Text>
                              <Text style={{ fontSize: 10, fontWeight: "800", color: "#4338ca", marginLeft: 4 }}>
                                {w.volume} btl ({w.pctOfTotal}%)
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>

                    <View style={{ flex: 1, minWidth: 140, backgroundColor: "#64748b15", borderColor: "#64748b40", borderWidth: 1, padding: 12, borderRadius: 12 }}>
                      <Text style={{ fontSize: 10, fontWeight: "800", color: "#475569" }}>🍷 STANDARD</Text>
                      <Text style={{ fontSize: 18, fontWeight: "900", color: "#334155", marginTop: 4 }}>
                        {salesDashboardMetrics.categoryCounts.standard % 1 === 0
                          ? `${salesDashboardMetrics.categoryCounts.standard} btl`
                          : `${salesDashboardMetrics.categoryCounts.standard.toFixed(2)} btl`}
                      </Text>
                      {salesDashboardMetrics.top5WinesByCategory.standard.length > 0 && (
                        <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: "#64748b30", paddingTop: 6, gap: 4 }}>
                          {salesDashboardMetrics.top5WinesByCategory.standard.map((w, idx) => (
                            <View key={idx} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                              <Text style={{ fontSize: 10, fontWeight: "700", color: "#334155", flex: 1 }} numberOfLines={1}>
                                #{idx + 1} {w.name}
                              </Text>
                              <Text style={{ fontSize: 10, fontWeight: "800", color: "#475569", marginLeft: 4 }}>
                                {w.volume} btl ({w.pctOfTotal}%)
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  </View>
                </View>

                {/* Segregated by Sales Type / Portion */}
                <View>
                  <Text style={{ fontSize: 12, fontWeight: "800", color: theme.text, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                    Sales Type (Portion)
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    <View style={{ flex: 1, minWidth: 100, backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, padding: 12, borderRadius: 12 }}>
                      <Text style={{ fontSize: 10, fontWeight: "800", color: theme.primary }}>🍾 BOTTLE</Text>
                      <Text style={{ fontSize: 16, fontWeight: "900", color: theme.text, marginTop: 4 }}>
                        {salesDashboardMetrics.portionCounts.bottle} sold
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 100, backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, padding: 12, borderRadius: 12 }}>
                      <Text style={{ fontSize: 10, fontWeight: "800", color: "#059669" }}>🍷 GLASS (1/6)</Text>
                      <Text style={{ fontSize: 16, fontWeight: "900", color: theme.text, marginTop: 4 }}>
                        {salesDashboardMetrics.portionCounts.glass} sold
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 100, backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, padding: 12, borderRadius: 12 }}>
                      <Text style={{ fontSize: 10, fontWeight: "800", color: "#d97706" }}>🫗 CARAFE (2/6)</Text>
                      <Text style={{ fontSize: 16, fontWeight: "900", color: theme.text, marginTop: 4 }}>
                        {salesDashboardMetrics.portionCounts.carafe} sold
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

          </View>
        )}

        <View style={styles.buttonContainer}>
          {!isStore && (
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: "#4f46e5" }]}
              onPress={() => router.push("/onboarding")}
            >
              <View style={styles.buttonContent}>
                <FileDown size={42} color="#ffffff" strokeWidth={1.5} />
                <View style={styles.buttonTextContainer}>
                  <Text style={styles.buttonTitle}>Onboarding Tasks</Text>
                  <Text style={styles.buttonDesc}>
                    Process new wine deliveries
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}

          {isStore && !isStoreStaff && (
            <TouchableOpacity
              style={[
                styles.actionButton,
                {
                  backgroundColor: theme.primary,
                  borderRadius: 24,
                  padding: 32,
                },
              ]}
              onPress={() => router.push("/wine-requests")}
            >
              <View style={styles.buttonContent}>
                <ClipboardList size={32} color="#ffffff" strokeWidth={1.5} />
                <View style={styles.buttonTextContainer}>
                  <Text style={styles.buttonTitle}>
                    Wine Requests
                  </Text>
                  <Text style={styles.buttonDesc}>
                    Request stock from warehouse
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}

          {isStore && !isStoreStaff && (
            <TouchableOpacity
              style={[
                styles.actionButton,
                { backgroundColor: "#0f766e" },
              ]}
              onPress={() => router.push("/store-master-list")}
            >
              <View style={styles.buttonContent}>
                <LayoutList size={32} color="#ffffff" strokeWidth={1.5} />
                <View style={styles.buttonTextContainer}>
                  <Text style={styles.buttonTitle}>
                    Stock Management
                  </Text>
                  <Text style={styles.buttonDesc}>
                    PAR levels & stock management
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
          {!isStore && (
            <TouchableOpacity
              style={[
                styles.actionButton,
                {
                  backgroundColor: theme.primary,
                  borderRadius: 24,
                },
              ]}
              onPress={() => router.push("/bottle-tagging")}
            >
              <View style={styles.buttonContent}>
                <QrCode size={42} color="#ffffff" strokeWidth={1.5} />
                <View style={styles.buttonTextContainer}>
                  <Text style={styles.buttonTitle}>{"QR Tagging"}</Text>
                  <Text style={styles.buttonDesc}>
                    {"Scan and stick QR labels"}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
          {!isStore && (
            <TouchableOpacity
              style={[
                styles.actionButton,
                {
                  backgroundColor: isStore ? theme.secondary : theme.secondary,
                  borderRadius: isStore ? 24 : 24,
                },
              ]}
              onPress={() => router.push("/tagging")}
            >
              <View style={styles.buttonContent}>
                <MapPin size={42} color="#ffffff" strokeWidth={1.5} />
                <View style={styles.buttonTextContainer}>
                  <Text style={styles.buttonTitle}>{"Bottle Tagging"}</Text>
                  <Text style={styles.buttonDesc}>
                    {"Assign bottles to bin locations"}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
          {!isStore && (
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.accent }]}
              onPress={() => router.push("/pullout")}
            >
              <View style={styles.buttonContent}>
                <Truck size={42} color="#ffffff" strokeWidth={1.5} />
                <View style={styles.buttonTextContainer}>
                  <Text style={styles.buttonTitle}>Pullout Tasks</Text>
                  <Text style={styles.buttonDesc}>
                    Fulfill outbound requests
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}

          {(!isStore || !isStoreStaff) && (
            <TouchableOpacity
              style={[
                styles.actionButton,
                { backgroundColor: isStore ? theme.accent : theme.primary },
              ]}
              onPress={() => router.push("/inventory")}
            >
              <View style={styles.buttonContent}>
                <Search size={42} color="#ffffff" strokeWidth={1.5} />
                <View style={styles.buttonTextContainer}>
                  <Text style={styles.buttonTitle}>Bottle Management</Text>
                  <Text style={styles.buttonDesc}>
                    Search by SKU or Wine Name
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}

          {isStore && (
            <>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  { backgroundColor: "#10b981" },
                ]}
                onPress={() =>
                  router.push({ pathname: "/sell" })
                }
              >
                <View style={styles.buttonContent}>
                  <Banknote size={32} color="#ffffff" strokeWidth={1.5} />
                  <View style={styles.buttonTextContainer}>
                    <Text style={styles.buttonTitle}>
                      Sell Glass or Bottle
                    </Text>
                    <Text style={styles.buttonDesc}>
                      Scan a bottle to sell by glass or bottle
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionButton,
                  { backgroundColor: Colors.store.primary },
                ]}
                onPress={() =>
                  router.push({ pathname: "/pos" })
                }
              >
                <View style={styles.buttonContent}>
                  <Zap size={32} color="#ffffff" strokeWidth={1.5} />
                  <View style={styles.buttonTextContainer}>
                    <Text style={styles.buttonTitle}>
                      POS Mode
                    </Text>
                    <Text style={styles.buttonDesc}>
                      Fast wine quick sales & staff attribution
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            </>
          )}
        </View>

        {isStore && (
          <View
            style={{
              marginTop: 40,
              padding: 24,
              backgroundColor: theme.primary + "10",
              borderRadius: 24,
              borderStyle: "dashed",
              borderWidth: 1,
              borderColor: theme.primary + "30",
            }}
          >
            <Text
              style={{
                color: theme.primary,
                fontWeight: "900",
                fontSize: 12,
                letterSpacing: 1,
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Store Front Mode
            </Text>
            <Text
              style={{
                color: theme.textSecondary,
                fontSize: 14,
                fontStyle: "italic",
              }}
            >
              Authorized for inventory lookup, stock requisition, and sale
              fulfillment.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 60,
  },
  header: {
    marginTop: 40,
    marginBottom: 32,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  signOutButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  logoBadge: {
    width: 44,
    height: 44,
    backgroundColor: "#4f46e5",
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
    textTransform: "uppercase",
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
  },
  metricsDashboard: {
    marginBottom: 28,
    backgroundColor: "transparent",
  },
  metricsTitle: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  responsiveGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  metricsGrid: {
    flexDirection: "row",
    gap: 16,
  },
  metricCard: {
    width: 140,
    height: 140,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  metricCount: {
    fontSize: 28,
    fontWeight: "900",
    marginTop: 6,
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    textAlign: "center",
    color: "rgba(255,255,255,0.8)",
  },
  metricSubLabel: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
  },
  buttonContainer: {
    gap: 14,
  },
  actionButton: {
    borderRadius: 20,
    padding: 20,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  buttonTextContainer: {
    flex: 1,
  },
  buttonTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#ffffff",
    marginBottom: 2,
  },
  buttonDesc: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.7)",
    fontWeight: "500",
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  filterButtonText: {
    fontWeight: "700",
    fontSize: 12,
  },
  viewAllButton: {
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  viewAllButtonText: {
    fontWeight: "700",
    fontSize: 14,
  },
  allCaughtUpContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    gap: 12,
  },
  allCaughtUpText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#475569",
  },
  requestCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  requestCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.store.primary + "15",
  },
  requestCardTitle: {
    fontWeight: "700",
    fontSize: 13,
  },
  requestCardSubtitle: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
  },
  tasksRow: {
    flexDirection: "row",
    gap: 20,
    width: "100%",
    marginBottom: 32,
  },
  taskColumn: {
    flex: 1,
    marginBottom: 0,
  },
});
