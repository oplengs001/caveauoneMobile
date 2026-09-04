import AdminDashboard from "@/components/AdminDashboard";
import StoreStaffPOSTerminal from "@/components/StoreStaffPOSTerminal";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { clearToken } from "@/lib/auth";
import { countBottlesForStoreDashboard, getStores } from "@/lib/queries";
import { Delivery, PulloutRequest, Store, WineRequest } from "@/types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useResponsivePadding } from "@/hooks/useResponsivePadding";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import {
  AlertOctagon,
  AlertTriangle,
  Banknote,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileDown,
  LayoutList,
  LogOut,
  MapPin,
  PackageCheck,
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
  const { width, height } = useWindowDimensions();
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
  const [refreshing, setRefreshing] = useState(false);
  const [salesPeriod, setSalesPeriod] = useState<"today" | "week" | "all">(
    "today",
  );
  const [loadingSales, setLoadingSales] = useState(false);
  const [salesDashboardMetrics, setSalesDashboardMetrics] = useState({
    soldCount: 0,
    totalRevenue: 0,
    activeBottles: 0,
    categoryCounts: { fun: 0, fine: 0, reserve: 0, standard: 0 },
    portionCounts: { bottle: 0, glass: 0, carafe: 0 },
    top5WinesByCategory: {
      fun: [] as Array<{ name: string; vintage?: string; volume: number; pctOfTotal: number }>,
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
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const isStoreUser = profile?.role === "store" || profile?.role === "store_manager" || profile?.role === "store_staff";

  useEffect(() => {
    if (!isStoreUser) {
      setInitialDataLoaded(true);
    } else if (!loadingMetrics && !loadingRequests && !loadingSales) {
      setInitialDataLoaded(true);
    }
  }, [isStoreUser, loadingMetrics, loadingRequests, loadingSales]);

  // --- Responsive Layout from Hook ---
  const { horizontalPadding, isLandscape, isTablet } = useResponsivePadding(20);

  const containerPadding = horizontalPadding * 2; // scrollContent padding

  const warehouseCardsPerRow = isLandscape || isTablet ? 4 : 2;
  const warehouseTotalGap = 12 * (warehouseCardsPerRow - 1);
  const storeTileWidth = (width - containerPadding - warehouseTotalGap) / warehouseCardsPerRow;

  // Store Operations: 2 tiles per row (2x2 grid)
  const storeOpGap = 12;
  const storeOpTileWidth = (width - containerPadding - storeOpGap) / 2;

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
      const catCounts = { fun: 0, fine: 0, reserve: 0, standard: 0 };
      const portionCounts = { bottle: 0, glass: 0, carafe: 0 };

      const wineAggByCategory: Record<string, Record<string, { id: string; name: string; vintage?: string; volume: number }>> = {
        fun: {},
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

        const rawCat = (item.wineCategory || item.masterWine?.wineCategory || "standard").toLowerCase();
        const cat = rawCat === "fast" ? "fun" : rawCat;
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
        fun: Array<{ name: string; vintage?: string; volume: number; pctOfTotal: number }>;
        fine: Array<{ name: string; vintage?: string; volume: number; pctOfTotal: number }>;
        reserve: Array<{ name: string; vintage?: string; volume: number; pctOfTotal: number }>;
        standard: Array<{ name: string; vintage?: string; volume: number; pctOfTotal: number }>;
      } = {
        fun: [],
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
      const isStoreRole = profile?.role === "store" || profile?.role === "store_manager" || profile?.role === "store_staff";
      if (isStoreRole) {
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
            const isStoreRole = profile?.role === "store" || profile?.role === "store_manager" || profile?.role === "store_staff";
            if (isStoreRole) {
              fetchMetrics();
              fetchOutboundRequests();
              fetchSalesMetrics();
              fetchTodayCloseStatus();
            }
          }
        });
      }
    }, [loading, profile, fetchMetrics, fetchOutboundRequests, fetchSalesMetrics, fetchTodayCloseStatus, onRefresh]),
  );

  useEffect(() => {
    if (!loading) {
      const isStoreRole = profile?.role === "store" || profile?.role === "store_manager" || profile?.role === "store_staff";
      if (isStoreRole) {
        fetchSalesMetrics();
        fetchTodayCloseStatus();
      }
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

  const activeAlerts: Array<{
    id: string;
    type: "stockout" | "parAlert" | "underSafety";
    wines: number;
    bottles: number;
    title: string;
    subtitle: string;
    badgeText: string;
    filter: string;
    icon: any;
    color: string;
    bgColor: string;
    borderColor: string;
  }> = [];

  if (dashboardMetrics.stockout.wines > 0) {
    activeAlerts.push({
      id: "stockout",
      type: "stockout",
      wines: dashboardMetrics.stockout.wines,
      bottles: dashboardMetrics.stockout.bottles,
      title: "Stockout Wines",
      subtitle: `${dashboardMetrics.stockout.wines} SKU${dashboardMetrics.stockout.wines === 1 ? "" : "s"} at zero stock`,
      badgeText: "STOCKOUT",
      filter: "stockout",
      icon: AlertOctagon,
      color: "#ef4444",
      bgColor: "rgba(239, 68, 68, 0.12)",
      borderColor: "rgba(239, 68, 68, 0.3)",
    });
  }

  if (dashboardMetrics.parAlert.wines > 0) {
    activeAlerts.push({
      id: "parAlert",
      type: "parAlert",
      wines: dashboardMetrics.parAlert.wines,
      bottles: dashboardMetrics.parAlert.bottles,
      title: "PAR Alert Wines",
      subtitle: `${dashboardMetrics.parAlert.wines} SKU${dashboardMetrics.parAlert.wines === 1 ? "" : "s"} below PAR level`,
      badgeText: "PAR ALERT",
      filter: "alerts",
      icon: AlertTriangle,
      color: "#f97316",
      bgColor: "rgba(249, 115, 22, 0.12)",
      borderColor: "rgba(249, 115, 22, 0.3)",
    });
  }

  if (dashboardMetrics.underSafety.wines > 0) {
    activeAlerts.push({
      id: "underSafety",
      type: "underSafety",
      wines: dashboardMetrics.underSafety.wines,
      bottles: dashboardMetrics.underSafety.bottles,
      title: "Under Safety",
      subtitle: `${dashboardMetrics.underSafety.wines} SKU${dashboardMetrics.underSafety.wines === 1 ? "" : "s"} near safety stock`,
      badgeText: "SAFETY",
      filter: "under_safety",
      icon: AlertTriangle,
      color: "#d97706",
      bgColor: "rgba(234, 179, 8, 0.15)",
      borderColor: "rgba(234, 179, 8, 0.3)",
    });
  }

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
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {isStore && (
                <TouchableOpacity
                  style={styles.topCornerPOSButton}
                  onPress={() => router.push({ pathname: "/pos" })}
                  activeOpacity={0.85}
                >
                  <Zap size={14} color="#ffffff" strokeWidth={2.6} />
                  <Text style={styles.topCornerPOSText}>POS Mode</Text>
                  <View style={styles.topCornerLiveDot} />
                </TouchableOpacity>
              )}
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
          <View style={styles.topRowContainer}>
            {/* Left Card: Sales Day Open (flex: 1) */}
            <TouchableOpacity
              style={[
                styles.dashboardTopCard,
                {
                  backgroundColor:
                    todayCloseStatus?.status === "submitted" || todayCloseStatus?.status === "acknowledged"
                      ? "#10b98110"
                      : "#f59e0b10",
                  borderColor:
                    todayCloseStatus?.status === "submitted" || todayCloseStatus?.status === "acknowledged"
                      ? "#10b98135"
                      : "#f59e0b35",
                },
              ]}
              onPress={() => router.push("/day-close")}
              activeOpacity={0.85}
            >
              {/* Row 1: Icon + Title on left, Status Badge on right */}
              <View style={styles.topCardRow1}>
                <View style={styles.topCardRow1Left}>
                  <View
                    style={[
                      styles.topCardIconCircle,
                      {
                        backgroundColor:
                          todayCloseStatus?.status === "submitted" || todayCloseStatus?.status === "acknowledged"
                            ? "#10b98122"
                            : "#f59e0b22",
                      },
                    ]}
                  >
                    <CalendarCheck
                      size={14}
                      color={
                        todayCloseStatus?.status === "submitted" || todayCloseStatus?.status === "acknowledged"
                          ? "#10b981"
                          : "#f59e0b"
                      }
                      strokeWidth={2.4}
                    />
                  </View>
                  <Text style={[styles.topCardTitle, { color: theme.text }]} numberOfLines={1}>
                    {todayCloseStatus?.status === "acknowledged"
                      ? "Day Closed"
                      : todayCloseStatus?.status === "submitted"
                        ? "Submitted"
                        : "Sales Day Open"}
                  </Text>
                </View>

                <View
                  style={[
                    styles.dayCloseBadgeSmall,
                    {
                      backgroundColor:
                        todayCloseStatus?.status === "submitted" || todayCloseStatus?.status === "acknowledged"
                          ? "rgba(16, 185, 129, 0.15)"
                          : "rgba(245, 158, 11, 0.15)",
                      borderColor:
                        todayCloseStatus?.status === "submitted" || todayCloseStatus?.status === "acknowledged"
                          ? "rgba(16, 185, 129, 0.3)"
                          : "rgba(245, 158, 11, 0.3)",
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.dayCloseLiveDot,
                      {
                        backgroundColor:
                          todayCloseStatus?.status === "submitted" || todayCloseStatus?.status === "acknowledged"
                            ? "#10b981"
                            : "#f59e0b",
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.topCardBadgeText,
                      {
                        color:
                          todayCloseStatus?.status === "submitted" || todayCloseStatus?.status === "acknowledged"
                            ? "#059669"
                            : "#d97706",
                      },
                    ]}
                  >
                    {todayCloseStatus?.status === "acknowledged"
                      ? "ACKNOWLEDGED"
                      : todayCloseStatus?.status === "submitted"
                        ? "SUBMITTED"
                        : "OPEN"}
                  </Text>
                </View>
              </View>

              {/* Row 2: Subtitle on left, Action on right */}
              <View style={styles.topCardRow2}>
                <Text style={[styles.topCardSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                  {todayCloseStatus?.status === "submitted" || todayCloseStatus?.status === "acknowledged"
                    ? `₱${todayCloseStatus.totalRevenue.toLocaleString()} · ${todayCloseStatus.totalBottlesSold} btl`
                    : "Tap to review & close"}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                  <Text
                    style={[
                      styles.topCardActionText,
                      {
                        color:
                          todayCloseStatus?.status === "submitted" || todayCloseStatus?.status === "acknowledged"
                            ? "#059669"
                            : "#d97706",
                      },
                    ]}
                  >
                    {todayCloseStatus?.status === "submitted" || todayCloseStatus?.status === "acknowledged"
                      ? "View"
                      : "Close"}
                  </Text>
                  <ChevronRight
                    size={13}
                    color={
                      todayCloseStatus?.status === "submitted" || todayCloseStatus?.status === "acknowledged"
                        ? "#059669"
                        : "#d97706"
                    }
                  />
                </View>
              </View>
            </TouchableOpacity>

            {/* Right Card: Inventory Alert (if active) or POS Mode (if no alerts) (flex: 1) */}
            {activeAlerts.length === 1 ? (
              <TouchableOpacity
                key={activeAlerts[0].id}
                style={[
                  styles.dashboardTopCard,
                  {
                    backgroundColor: theme.card,
                    borderColor: activeAlerts[0].borderColor,
                  },
                ]}
                onPress={() =>
                  router.push({
                    pathname: "/store-master-list",
                    params: { filter: activeAlerts[0].filter },
                  })
                }
                activeOpacity={0.85}
              >
                {/* Row 1 */}
                <View style={styles.topCardRow1}>
                  <View style={styles.topCardRow1Left}>
                    <View style={[styles.topCardIconCircle, { backgroundColor: activeAlerts[0].bgColor }]}>
                      {React.createElement(activeAlerts[0].icon, {
                        size: 14,
                        color: activeAlerts[0].color,
                        strokeWidth: 2.4,
                      })}
                    </View>
                    <Text style={[styles.topCardTitle, { color: theme.text }]} numberOfLines={1}>
                      {activeAlerts[0].title}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.deliveryStatusBadge,
                      {
                        backgroundColor: activeAlerts[0].bgColor,
                        borderColor: activeAlerts[0].borderColor,
                        paddingVertical: 1,
                        paddingHorizontal: 5,
                      },
                    ]}
                  >
                    <Text style={[styles.deliveryStatusBadgeText, { color: activeAlerts[0].color, fontSize: 9 }]}>
                      {activeAlerts[0].badgeText}
                    </Text>
                  </View>
                </View>

                {/* Row 2 */}
                <View style={styles.topCardRow2}>
                  <Text style={[styles.topCardSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                    {activeAlerts[0].subtitle}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                    <Text style={[styles.topCardActionText, { color: activeAlerts[0].color }]}>
                      {activeAlerts[0].bottles} btl
                    </Text>
                    <ChevronRight size={13} color={activeAlerts[0].color} />
                  </View>
                </View>
              </TouchableOpacity>
            ) : activeAlerts.length > 1 ? (
              <TouchableOpacity
                style={[
                  styles.dashboardTopCard,
                  {
                    backgroundColor: theme.card,
                    borderColor: "rgba(239, 68, 68, 0.3)",
                  },
                ]}
                onPress={() =>
                  router.push({
                    pathname: "/store-master-list",
                    params: { filter: "stockout" },
                  })
                }
                activeOpacity={0.85}
              >
                {/* Row 1 */}
                <View style={styles.topCardRow1}>
                  <View style={styles.topCardRow1Left}>
                    <View style={[styles.topCardIconCircle, { backgroundColor: "rgba(239, 68, 68, 0.12)" }]}>
                      <AlertOctagon size={14} color="#ef4444" strokeWidth={2.4} />
                    </View>
                    <Text style={[styles.topCardTitle, { color: theme.text }]} numberOfLines={1}>
                      Inventory Alerts
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.deliveryCountPill,
                      {
                        backgroundColor: "rgba(239, 68, 68, 0.15)",
                        paddingVertical: 1,
                        paddingHorizontal: 5,
                        borderRadius: 6,
                      },
                    ]}
                  >
                    <Text style={[styles.deliveryCountPillText, { color: "#ef4444", fontSize: 9 }]}>
                      {dashboardMetrics.stockout.wines + dashboardMetrics.parAlert.wines + dashboardMetrics.underSafety.wines} ALERTS
                    </Text>
                  </View>
                </View>

                {/* Row 2 */}
                <View style={styles.topCardRow2}>
                  <Text style={[styles.topCardSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                    {dashboardMetrics.stockout.wines > 0
                      ? `${dashboardMetrics.stockout.wines} Stockout · ${dashboardMetrics.parAlert.wines + dashboardMetrics.underSafety.wines} PAR`
                      : `${dashboardMetrics.parAlert.wines} PAR · ${dashboardMetrics.underSafety.wines} Safety`}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                    <Text style={[styles.topCardActionText, { color: "#ef4444" }]}>
                      {dashboardMetrics.stockout.bottles + dashboardMetrics.parAlert.bottles + dashboardMetrics.underSafety.bottles} btl
                    </Text>
                    <ChevronRight size={13} color="#ef4444" />
                  </View>
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.dashboardTopCard,
                  {
                    backgroundColor: theme.card,
                    borderColor: "rgba(16, 185, 129, 0.3)",
                  },
                ]}
                onPress={() => router.push("/store-master-list")}
                activeOpacity={0.85}
              >
                {/* Row 1 */}
                <View style={styles.topCardRow1}>
                  <View style={styles.topCardRow1Left}>
                    <View style={[styles.topCardIconCircle, { backgroundColor: "rgba(16, 185, 129, 0.12)" }]}>
                      <CheckCircle2 size={14} color="#10b981" strokeWidth={2.4} />
                    </View>
                    <Text style={[styles.topCardTitle, { color: theme.text }]} numberOfLines={1}>
                      Inventory Healthy
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.deliveryStatusBadge,
                      {
                        backgroundColor: "rgba(16, 185, 129, 0.12)",
                        borderColor: "rgba(16, 185, 129, 0.25)",
                        paddingVertical: 1,
                        paddingHorizontal: 5,
                      },
                    ]}
                  >
                    <Text style={[styles.deliveryStatusBadgeText, { color: "#059669", fontSize: 9 }]}>HEALTHY</Text>
                  </View>
                </View>

                {/* Row 2 */}
                <View style={styles.topCardRow2}>
                  <Text style={[styles.topCardSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                    All SKUs above PAR
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                    <Text style={[styles.topCardActionText, { color: "#059669" }]}>
                      View
                    </Text>
                    <ChevronRight size={13} color="#059669" />
                  </View>
                </View>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* If multiple alerts (> 1), show the breakdown row right below */}
        {isStore && activeAlerts.length > 1 && (
          <View style={[styles.metricsDashboard, { marginBottom: 16 }]}>
            <View style={styles.alertsGrid2Col}>
              {activeAlerts.map((alert) => {
                const AlertIcon = alert.icon;
                return (
                  <TouchableOpacity
                    key={alert.id}
                    style={[
                      styles.alertGridCard,
                      {
                        backgroundColor: theme.card,
                        borderColor: theme.border,
                      },
                    ]}
                    onPress={() =>
                      router.push({
                        pathname: "/store-master-list",
                        params: { filter: alert.filter },
                      })
                    }
                    activeOpacity={0.85}
                  >
                    {/* Row 1 */}
                    <View style={styles.topCardRow1}>
                      <View style={styles.topCardRow1Left}>
                        <View style={[styles.topCardIconCircle, { backgroundColor: alert.bgColor }]}>
                          <AlertIcon size={14} color={alert.color} strokeWidth={2.4} />
                        </View>
                        <Text style={[styles.topCardTitle, { color: theme.text }]} numberOfLines={1}>
                          {alert.title}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.deliveryStatusBadge,
                          {
                            backgroundColor: alert.bgColor,
                            borderColor: alert.borderColor,
                            paddingVertical: 1,
                            paddingHorizontal: 5,
                          },
                        ]}
                      >
                        <Text style={[styles.deliveryStatusBadgeText, { color: alert.color, fontSize: 9 }]}>
                          {alert.badgeText}
                        </Text>
                      </View>
                    </View>

                    {/* Row 2 */}
                    <View style={styles.topCardRow2}>
                      <Text style={[styles.topCardSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                        {alert.subtitle}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                        <Text style={[styles.topCardActionText, { color: alert.color }]}>
                          {alert.bottles} needed
                        </Text>
                        <ChevronRight size={13} color={alert.color} />
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {isStore && (hasPulloutTasks || hasDeliveries) && (
          <View style={isLandscape || isTablet ? styles.tasksRow : undefined}>
            {hasPulloutTasks && (
              <View style={[styles.metricsDashboard, isLandscape || isTablet ? styles.taskColumn : undefined]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={styles.metricsTitle}>Pullout Tasks</Text>
                    <View style={[styles.deliveryCountPill, { backgroundColor: "rgba(245, 158, 11, 0.15)" }]}>
                      <Text style={[styles.deliveryCountPillText, { color: "#d97706" }]}>
                        {pulloutTasks.length}
                      </Text>
                    </View>
                  </View>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 12, paddingRight: 8 }}
                >
                  {pulloutTasks.map((task) => (
                    <TouchableOpacity
                      key={task.id}
                      style={[
                        styles.deliveryCardCompact,
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
                      activeOpacity={0.85}
                    >
                      <View style={styles.deliveryLine1}>
                        <View style={styles.deliveryLine1Left}>
                          <View style={[styles.deliveryCardIconCircle, { backgroundColor: "#f59e0b18" }]}>
                            <ClipboardList size={14} color="#f59e0b" strokeWidth={2.4} />
                          </View>
                          <Text style={[styles.deliveryCardTitle, { color: theme.text }]} numberOfLines={1}>
                            Pull Stock
                          </Text>
                        </View>
                        <ChevronRight size={14} color="#94a3b8" />
                      </View>

                      <View style={styles.deliveryLine2}>
                        <Text style={[styles.deliveryCardSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                          REQ: {task.id.slice(0, 4).toUpperCase()} · {task.items.reduce((acc, i) => acc + (i.requestedQty || 0), 0)} btl
                        </Text>
                        <View style={[styles.deliveryStatusBadge, { backgroundColor: "rgba(245, 158, 11, 0.12)", borderColor: "rgba(245, 158, 11, 0.3)" }]}>
                          <Text style={[styles.deliveryStatusBadgeText, { color: "#d97706" }]}>PULLOUT</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {hasDeliveries && (
              <View style={[styles.metricsDashboard, isLandscape || isTablet ? styles.taskColumn : undefined]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={styles.metricsTitle}>Incoming Deliveries</Text>
                    <View style={styles.deliveryCountPill}>
                      <Text style={styles.deliveryCountPillText}>
                        {outboundRequests.length + incomingDeliveries.length}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.filterButton,
                      {
                        backgroundColor: theme.primary + "15",
                        borderColor: theme.primary + "30",
                        paddingVertical: 4,
                        paddingHorizontal: 8,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                      },
                    ]}
                    onPress={() => router.push("/delivery-logs")}
                    activeOpacity={0.8}
                  >
                    <PackageCheck size={12} color={theme.primary} strokeWidth={2.4} />
                    <Text style={[styles.filterButtonText, { color: theme.primary, fontSize: 11 }]}>
                      Intake Logs →
                    </Text>
                  </TouchableOpacity>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 12, paddingRight: 8 }}
                >
                  {outboundRequests.map((req) => {
                    const targetStoreName =
                      req.targetStoreId === "warehouse"
                        ? "Central Warehouse"
                        : locations[req.targetStoreId || ""] || "Warehouse";
                    const totalQty = req.items.reduce((acc, i) => acc + (i.qty || 0), 0);

                    return (
                      <TouchableOpacity
                        key={req.id}
                        style={[
                          styles.deliveryCardCompact,
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
                        activeOpacity={0.85}
                      >
                        <View style={styles.deliveryLine1}>
                          <View style={styles.deliveryLine1Left}>
                            <View style={[styles.deliveryCardIconCircle, { backgroundColor: theme.primary + "15" }]}>
                              <Truck size={14} color={theme.primary} strokeWidth={2.4} />
                            </View>
                            <Text style={[styles.deliveryCardTitle, { color: theme.text }]} numberOfLines={1}>
                              Transfer from {targetStoreName}
                            </Text>
                          </View>
                          <ChevronRight size={14} color="#94a3b8" />
                        </View>

                        <View style={styles.deliveryLine2}>
                          <Text style={[styles.deliveryCardSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                            REQ: {req.id.slice(0, 4).toUpperCase()} · {totalQty} {totalQty === 1 ? "bottle" : "bottles"}
                          </Text>
                          <View style={styles.deliveryStatusBadge}>
                            <Text style={styles.deliveryStatusBadgeText}>IN TRANSIT</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}

                  {incomingDeliveries.map((del) => (
                    <TouchableOpacity
                      key={del.id}
                      style={[
                        styles.deliveryCardCompact,
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
                      activeOpacity={0.85}
                    >
                      <View style={styles.deliveryLine1}>
                        <View style={styles.deliveryLine1Left}>
                          <View style={[styles.deliveryCardIconCircle, { backgroundColor: "#8b5cf618" }]}>
                            <Truck size={14} color="#8b5cf6" strokeWidth={2.4} />
                          </View>
                          <Text style={[styles.deliveryCardTitle, { color: theme.text }]} numberOfLines={1}>
                            Admin Delivery
                          </Text>
                        </View>
                        <ChevronRight size={14} color="#94a3b8" />
                      </View>

                      <View style={styles.deliveryLine2}>
                        <Text style={[styles.deliveryCardSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                          DEL: {del.id.slice(0, 4).toUpperCase()} · {del.totalBottles} {del.totalBottles === 1 ? "bottle" : "bottles"}
                        </Text>
                        <View style={[styles.deliveryStatusBadge, { backgroundColor: "#8b5cf618", borderColor: "#8b5cf640" }]}>
                          <Text style={[styles.deliveryStatusBadgeText, { color: "#a78bfa" }]}>DIRECT</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
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

            {/* Symmetrical 3-Card Sales Metric Row (2 Rows each to save space) */}
            {!isStoreStaff && (
              <View style={styles.symmetricalSalesRow}>
                {/* Card 1: Total Revenue (Clickable) */}
                <TouchableOpacity
                  style={[
                    styles.symmetricalCard,
                    { backgroundColor: theme.primary, borderColor: theme.primary },
                  ]}
                  onPress={() =>
                    router.push({
                      pathname: "/sales",
                      params: { period: salesPeriod },
                    })
                  }
                  activeOpacity={0.8}
                >
                  <View style={styles.symmetricalRow1}>
                    <View style={styles.symmetricalIconCircleSmall}>
                      <Banknote size={12} color="#ffffff" strokeWidth={2.4} />
                    </View>
                    <Text
                      style={styles.symmetricalCardValue}
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
                  </View>

                  <Text
                    style={styles.symmetricalCardSubtitle}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    Total Revenue · {salesPeriod === "today" ? "Today" : salesPeriod === "week" ? "This Week" : "All Time"}
                  </Text>
                </TouchableOpacity>

                {/* Card 2: Bottles Sold (Clickable) */}
                <TouchableOpacity
                  style={[
                    styles.symmetricalCard,
                    { backgroundColor: theme.secondary, borderColor: theme.secondary },
                  ]}
                  onPress={() =>
                    router.push({
                      pathname: "/sales",
                      params: { period: salesPeriod },
                    })
                  }
                  activeOpacity={0.8}
                >
                  <View style={styles.symmetricalRow1}>
                    <View style={styles.symmetricalIconCircleSmall}>
                      <Wine size={12} color="#ffffff" strokeWidth={2.4} />
                    </View>
                    <Text
                      style={styles.symmetricalCardValue}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {salesDashboardMetrics.soldCount % 1 === 0
                        ? salesDashboardMetrics.soldCount
                        : salesDashboardMetrics.soldCount.toFixed(1)}
                      <Text style={styles.symmetricalCardUnit}> btl</Text>
                    </Text>
                  </View>

                  <Text
                    style={styles.symmetricalCardSubtitle}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    Bottles Sold · {salesPeriod === "today" ? "Today" : salesPeriod === "week" ? "This Week" : "All Time"}
                  </Text>
                </TouchableOpacity>

                {/* Card 3: Active Inventory */}
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
                      <LayoutList size={12} color="#ffffff" strokeWidth={2.4} />
                    </View>
                    <Text
                      style={styles.symmetricalCardValue}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {salesDashboardMetrics.activeBottles}
                      <Text style={styles.symmetricalCardUnit}> btl</Text>
                    </Text>
                  </View>

                  <Text
                    style={styles.symmetricalCardSubtitle}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    In Stock · Boutique
                  </Text>
                </TouchableOpacity>
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
                      <Text style={{ fontSize: 10, fontWeight: "800", color: "#d97706" }}>🎉 FUN WINE</Text>
                      <Text style={{ fontSize: 18, fontWeight: "900", color: "#b45309", marginTop: 4 }}>
                        {salesDashboardMetrics.categoryCounts.fun % 1 === 0
                          ? `${salesDashboardMetrics.categoryCounts.fun} btl`
                          : `${salesDashboardMetrics.categoryCounts.fun.toFixed(2)} btl`}
                      </Text>
                      {salesDashboardMetrics.top5WinesByCategory.fun.length > 0 && (
                        <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: "#f59e0b30", paddingTop: 6, gap: 4 }}>
                          {salesDashboardMetrics.top5WinesByCategory.fun.map((w, idx) => (
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
                      <Text style={{ fontSize: 10, fontWeight: "800", color: "#4338ca" }}>👻 RESERVE</Text>
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

        {/* ── STORE QUICK ACTIONS (4-Tile Grid, 2 in a single row) ──── */}
        {isStore ? (
          <View style={styles.storeActionsSection}>
            <Text style={styles.metricsTitle}>Store Operations</Text>

            {/* 4-Tile Core Operations: 2 in a single row with icon beside title */}
            <View style={styles.storeTwoColGrid}>
              {/* Tile 1: Sell Glass or Bottle */}
              <TouchableOpacity
                style={[
                  styles.storeBigTile,
                  {
                    width: storeOpTileWidth,
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => router.push({ pathname: "/sell" })}
                activeOpacity={0.85}
              >
                <View style={styles.bigTileContentRow}>
                  <View style={[styles.bigTileIconCircle, { backgroundColor: "#10b98118" }]}>
                    <Banknote size={22} color="#059669" strokeWidth={2.2} />
                  </View>
                  <View style={styles.bigTileTextContainer}>
                    <Text style={[styles.bigTileTitle, { color: theme.text }]} numberOfLines={1}>Scan & Sell</Text>
                    <Text style={[styles.bigTileDesc, { color: theme.textSecondary }]} numberOfLines={1}>
                      Bottle & glass pours
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              {/* Tile 2: Wine Requests */}
              <TouchableOpacity
                style={[
                  styles.storeBigTile,
                  {
                    width: storeOpTileWidth,
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => router.push("/wine-requests")}
                activeOpacity={0.85}
              >
                <View style={styles.bigTileContentRow}>
                  <View style={[styles.bigTileIconCircle, { backgroundColor: Colors.store.primary + "18" }]}>
                    <ClipboardList size={22} color={Colors.store.primary} strokeWidth={2.2} />
                  </View>
                  <View style={styles.bigTileTextContainer}>
                    <Text style={[styles.bigTileTitle, { color: theme.text }]} numberOfLines={1}>Wine Requests</Text>
                    <Text style={[styles.bigTileDesc, { color: theme.textSecondary }]} numberOfLines={1}>
                      Order warehouse
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              {/* Tile 3: Stock Management */}
              <TouchableOpacity
                style={[
                  styles.storeBigTile,
                  {
                    width: storeOpTileWidth,
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => router.push("/store-master-list")}
                activeOpacity={0.85}
              >
                <View style={styles.bigTileContentRow}>
                  <View style={[styles.bigTileIconCircle, { backgroundColor: "#0f766e18" }]}>
                    <LayoutList size={22} color="#0f766e" strokeWidth={2.2} />
                  </View>
                  <View style={styles.bigTileTextContainer}>
                    <Text style={[styles.bigTileTitle, { color: theme.text }]} numberOfLines={1}>Stock & PAR</Text>
                    <Text style={[styles.bigTileDesc, { color: theme.textSecondary }]} numberOfLines={1}>
                      PAR & store stock
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              {/* Tile 4: Bottle Management / Lookup */}
              <TouchableOpacity
                style={[
                  styles.storeBigTile,
                  {
                    width: storeOpTileWidth,
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => router.push("/inventory")}
                activeOpacity={0.85}
              >
                <View style={styles.bigTileContentRow}>
                  <View style={[styles.bigTileIconCircle, { backgroundColor: "#6366f118" }]}>
                    <Search size={22} color="#4f46e5" strokeWidth={2.2} />
                  </View>
                  <View style={styles.bigTileTextContainer}>
                    <Text style={[styles.bigTileTitle, { color: theme.text }]} numberOfLines={1}>Bottle Lookup</Text>
                    <Text style={[styles.bigTileDesc, { color: theme.textSecondary }]} numberOfLines={1}>
                      SKU & bin lookup
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          /* ── WAREHOUSE QUICK ACTIONS (Hero Intake Card + Compact Grid) ─── */
          <View style={styles.storeActionsSection}>
            <Text style={[styles.metricsTitle, { color: theme.textSecondary }]}>Warehouse Operations</Text>

            {/* Prominent Onboarding Hero Action */}
            <TouchableOpacity
              style={[
                styles.heroActionCard,
                {
                  backgroundColor: theme.primary,
                  shadowColor: theme.primary,
                },
              ]}
              onPress={() => router.push("/onboarding")}
              activeOpacity={0.88}
            >
              <View style={styles.heroActionLeft}>
                <View style={styles.heroActionIconBadge}>
                  <FileDown size={20} color="#ffffff" strokeWidth={2.4} />
                </View>
                <View style={styles.heroActionTextContainer}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={styles.heroActionTitle}>Onboarding Tasks</Text>
                    <View style={styles.heroLiveBadge}>
                      <View style={styles.heroLiveDot} />
                      <Text style={styles.heroLiveBadgeText}>Inbound Intake</Text>
                    </View>
                  </View>
                  <Text style={styles.heroActionDesc} numberOfLines={1}>
                    Process deliveries & barcode scans
                  </Text>
                </View>
              </View>
              <View style={styles.heroActionArrow}>
                <ChevronRight size={16} color="#ffffff" strokeWidth={2.5} />
              </View>
            </TouchableOpacity>

            {/* 4-Tile Compact Grid for Core Warehouse Operations */}
            <View style={styles.storeGrid}>
              {/* Tile 1: QR Tagging */}
              <TouchableOpacity
                style={[
                  styles.storeGridTile,
                  {
                    width: storeTileWidth,
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => router.push("/bottle-tagging")}
                activeOpacity={0.85}
              >
                <View style={styles.tileHeaderRow}>
                  <View style={[styles.tileIconCircle, { backgroundColor: "#8b5cf618" }]}>
                    <QrCode size={18} color="#a78bfa" strokeWidth={2} />
                  </View>
                  <ChevronRight size={14} color="#94a3b8" />
                </View>
                <View style={styles.tileTextContainer}>
                  <Text style={[styles.tileTitle, { color: theme.text }]} numberOfLines={1}>
                    QR Tagging
                  </Text>
                  <Text style={[styles.tileDesc, { color: theme.textSecondary }]} numberOfLines={1}>
                    Scan & stick QR labels
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Tile 2: Bottle Tagging */}
              <TouchableOpacity
                style={[
                  styles.storeGridTile,
                  {
                    width: storeTileWidth,
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => router.push("/tagging")}
                activeOpacity={0.85}
              >
                <View style={styles.tileHeaderRow}>
                  <View style={[styles.tileIconCircle, { backgroundColor: "#0ea5e918" }]}>
                    <MapPin size={18} color="#38bdf8" strokeWidth={2} />
                  </View>
                  <ChevronRight size={14} color="#94a3b8" />
                </View>
                <View style={styles.tileTextContainer}>
                  <Text style={[styles.tileTitle, { color: theme.text }]} numberOfLines={1}>
                    Bottle Tagging
                  </Text>
                  <Text style={[styles.tileDesc, { color: theme.textSecondary }]} numberOfLines={1}>
                    Assign bottles to bins
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Tile 3: Pullout Tasks */}
              <TouchableOpacity
                style={[
                  styles.storeGridTile,
                  {
                    width: storeTileWidth,
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => router.push("/pullout")}
                activeOpacity={0.85}
              >
                <View style={styles.tileHeaderRow}>
                  <View style={[styles.tileIconCircle, { backgroundColor: "#f59e0b18" }]}>
                    <Truck size={18} color="#fbbf24" strokeWidth={2} />
                  </View>
                  <ChevronRight size={14} color="#94a3b8" />
                </View>
                <View style={styles.tileTextContainer}>
                  <Text style={[styles.tileTitle, { color: theme.text }]} numberOfLines={1}>
                    Pullout Tasks
                  </Text>
                  <Text style={[styles.tileDesc, { color: theme.textSecondary }]} numberOfLines={1}>
                    Fulfill store requests
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Tile 4: Bottle Lookup */}
              <TouchableOpacity
                style={[
                  styles.storeGridTile,
                  {
                    width: storeTileWidth,
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => router.push("/inventory")}
                activeOpacity={0.85}
              >
                <View style={styles.tileHeaderRow}>
                  <View style={[styles.tileIconCircle, { backgroundColor: "#10b98118" }]}>
                    <Search size={18} color="#34d399" strokeWidth={2} />
                  </View>
                  <ChevronRight size={14} color="#94a3b8" />
                </View>
                <View style={styles.tileTextContainer}>
                  <Text style={[styles.tileTitle, { color: theme.text }]} numberOfLines={1}>
                    Bottle Lookup
                  </Text>
                  <Text style={[styles.tileDesc, { color: theme.textSecondary }]} numberOfLines={1}>
                    SKU, bin & cellar lookup
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {isStore ? (
          <View style={styles.storeModeBadge}>
            <View style={styles.storeModeBadgeDot} />
            <Text style={styles.storeModeBadgeText}>
              Boutique Sommelier Mode · Authorized for sales, inventory & requisitions
            </Text>
          </View>
        ) : (
          <View
            style={[
              styles.storeModeBadge,
              {
                backgroundColor: theme.primary + "12",
                borderColor: theme.primary + "30",
              },
            ]}
          >
            <View
              style={[
                styles.storeModeBadgeDot,
                { backgroundColor: theme.primary },
              ]}
            />
            <Text
              style={[
                styles.storeModeBadgeText,
                { color: "#a5b4fc" },
              ]}
            >
              Warehouse Mode · Authorized for intake, tagging, binning & pullout fulfillment
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
    paddingVertical: 20,
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
  topCornerPOSButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Colors.store.primary,
    shadowColor: Colors.store.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  topCornerPOSText: {
    color: "#ffffff",
    fontSize: 12.5,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  topCornerLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#4ade80",
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
    marginBottom: 24,
    backgroundColor: "transparent",
  },
  metricsTitle: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 12,
    paddingHorizontal: 2,
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

  // Store Unified Compact Grid
  storeActionsSection: {
    marginBottom: 16,
  },
  heroActionCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.store.primary,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    shadowColor: Colors.store.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  heroActionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    marginRight: 12,
  },
  heroActionIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroActionTextContainer: {
    justifyContent: "center",
  },
  heroActionTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#ffffff",
  },
  heroLiveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(16, 185, 129, 0.25)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.5)",
  },
  heroLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#10b981",
  },
  heroLiveBadgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  heroActionDesc: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.85)",
    fontWeight: "500",
    marginTop: 1,
  },
  heroActionArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  storeTwoColGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  storeBigTile: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderWidth: 1.2,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 94,
  },
  bigTileContentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  bigTileIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  bigTileTextContainer: {
    justifyContent: "center",
  },
  bigTileTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 2,
    letterSpacing: -0.2,
  },
  bigTileDesc: {
    fontSize: 11.5,
    fontWeight: "500",
    color: "#64748b",
  },
  storeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  storeGridTile: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.2,
    borderColor: "#e2e8f0",
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
    color: "#0f172a",
    marginBottom: 1,
    textAlign: "center",
  },
  tileDesc: {
    fontSize: 10.5,
    fontWeight: "500",
    color: "#64748b",
    textAlign: "center",
  },

  // Store Front Mode Footer Badge
  storeModeBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Colors.store.primary + "0c",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.store.primary + "20",
    marginTop: 8,
  },
  storeModeBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.store.primary,
  },
  storeModeBadgeText: {
    color: Colors.store.primary,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },

  // Warehouse Button Container
  buttonContainer: {
    gap: 12,
  },
  actionButton: {
    borderRadius: 16,
    padding: 16,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  buttonTextContainer: {
    flex: 1,
  },
  buttonTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#ffffff",
    marginBottom: 2,
  },
  buttonDesc: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.75)",
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
  dayCloseBadgeSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 1.5,
    paddingHorizontal: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  topCardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
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
  topCardBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  topCardBody: {
    marginBottom: 8,
    alignItems: "center",
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
  topCardActionText: {
    fontSize: 10.5,
    fontWeight: "700",
  },
  dayCloseBanner: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.2,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  dayCloseBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    marginRight: 10,
  },
  dayCloseActionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 8,
    borderWidth: 1,
  },
  dayCloseActionText: {
    fontSize: 11,
    fontWeight: "800",
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
  alertsGrid2Col: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  alertsGrid3Col: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  alertGridCard: {
    flex: 1,
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
    minHeight: 62,
  },
  inventoryStatBanner: {
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
  inventoryStatTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  inventoryStatSub: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 1,
  },
  inventoryStatCount: {
    fontSize: 18,
    fontWeight: "900",
  },
  inventoryStatUnit: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 1,
  },
  dayCloseIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  dayCloseTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  dayCloseLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dayCloseSubtitle: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 1,
    fontWeight: "500",
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
    paddingLeft: 34,
  },
  deliveryCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  deliveryCardIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
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
  deliveryCardBody: {
    marginBottom: 10,
    alignItems: "center",
  },
  deliveryCardTitle: {
    fontSize: 13,
    fontWeight: "800",
    flex: 1,
  },
  deliveryCardSubtitle: {
    fontSize: 11,
    fontWeight: "600",
    flex: 1,
    marginRight: 6,
  },
  deliveryCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 1,
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
  deliveryCountPill: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  deliveryCountPillText: {
    color: "#059669",
    fontSize: 11,
    fontWeight: "800",
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
