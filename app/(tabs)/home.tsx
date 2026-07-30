import AdminDashboard from "@/components/AdminDashboard";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { clearToken } from "@/lib/auth";
import { countBottlesForStoreDashboard, getSalesByPeriod, getStores } from "@/lib/queries";
import { Delivery, PulloutRequest, WineRequest } from "@/types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import {
  AlertOctagon,
  AlertTriangle,
  Banknote,
  ClipboardList,
  FileDown,
  LayoutList,
  LogOut,
  MapPin,
  QrCode,
  Search,
  Truck,
  Wine,
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
    if (profile?.role !== "store" || !storeId) {
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
    if (profile?.role !== "store" || !profile.locationId) {
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

      const locMap: Record<string, string> = {};
      storesData.forEach((d) => (locMap[d.id] = d.name));

      const requests = (reqData.wineRequests || reqData) as WineRequest[];
      const deliveries = (delData.deliveries || delData) as Delivery[];
      const pullouts = (pulloutData.pulloutRequests || pulloutData) as PulloutRequest[];

      outboundCache.current = {
        data: { requests, deliveries, pullouts, locMap },
        storeId: profile.locationId,
        fetchedAt: Date.now()
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
    if (profile?.role !== "store" || !storeId) {
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

      const salesResult = await getSalesByPeriod(storeId, startDate, new Date());
      setSalesDashboardMetrics({
        soldCount: salesResult.totalItems,
        totalRevenue: salesResult.totalRevenue,
        activeBottles,
      });
    } catch (err) {
      console.error("Failed to fetch sales metrics:", err);
    } finally {
      setLoadingSales(false);
    }
  }, [profile, salesPeriod]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (profile?.role === "store") {
        await Promise.all([
          fetchMetrics(),
          fetchOutboundRequests(),
          fetchSalesMetrics(),
        ]);
      }
    } catch (e) {
      console.error("Failed to refresh:", e);
    } finally {
      setRefreshing(false);
    }
  }, [profile, fetchMetrics, fetchOutboundRequests, fetchSalesMetrics]);

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
          }
        });
      }
    }, [loading, profile, fetchMetrics, fetchOutboundRequests, onRefresh]),
  );

  useEffect(() => {
    if (!loading) {
      fetchSalesMetrics();
    }
  }, [loading, profile, salesPeriod, fetchSalesMetrics]);

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

  const role = profile?.role || "warehouse";
  const theme = role === "store" ? Colors.store : Colors.warehouse;
  const isStore = role === "store";

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
    dashboardMetrics.stockout.wines > 0 ||
    dashboardMetrics.parAlert.wines > 0 ||
    dashboardMetrics.underSafety.wines > 0;
  const hasDeliveries =
    outboundRequests.length > 0 || incomingDeliveries.length > 0;
  const hasPulloutTasks = pulloutTasks.length > 0;

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
              ? "Boutique Sommelier Terminal"
              : "Warehouse Management System"}
          </Text>
        </View>

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

            {/* Replaced ScrollView with Responsive Grid */}
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

          {isStore && (
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

          {isStore && (
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

          {isStore && (
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
                    Sell Bottle
                  </Text>
                  <Text style={styles.buttonDesc}>
                    Scan a bottle to mark it as sold
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
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
