import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { apiFetch } from "@/lib/api";
import { clearToken } from "@/lib/auth";
import { getSalesByPeriodAllStores, getStores } from "@/lib/queries";
import { Delivery, PulloutRequest } from "@/types";
import { useFocusEffect, useRouter } from "expo-router";
import {
  AlertOctagon,
  AlertTriangle,
  Banknote,
  Building2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  LogOut,
  Search,
  Truck,
  Wine
} from "lucide-react-native";
import React, { useCallback, useState, useEffect } from "react";
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
  type: "bottle" | "glass" | "karaf";
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
  const { profile } = useAuth();
  const { notification } = usePushNotifications();

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

  // ── Sales metrics ──────────────────────────────────────────────────────────
  const fetchSalesMetrics = useCallback(async () => {
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

      const [data, allStores] = await Promise.all([
        apiFetch(`/sales?${params}`),
        getStores(),
      ]);

      const salesList: any[] = Array.isArray(data) ? data : Array.isArray(data.sales) ? data.sales : [];
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
        karaf: { label: "Karaf (2/6)", count: 0, revenue: 0, volume: 0, stores: {} },
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
        fast: { label: "Fast Moving", badgeColor: "#f59e0b", iconText: "⚡ FAST", count: 0, revenue: 0, volume: 0, stores: {} },
        fine: { label: "Fine Wine", badgeColor: "#ec4899", iconText: "⭐ FINE", count: 0, revenue: 0, volume: 0, stores: {} },
        reserve: { label: "Reserve Collection", badgeColor: "#6366f1", iconText: "🔒 RESERVE", count: 0, revenue: 0, volume: 0, stores: {} },
        other: { label: "Standard Catalog", badgeColor: "#64748b", iconText: "🍷 STANDARD", count: 0, revenue: 0, volume: 0, stores: {} },
      };

      salesList.forEach((item: any) => {
        const rev = Number(item.totalAmount || item.price || 0);
        totalRevenue += rev;

        const st = (item.saleType || "bottle").toLowerCase();
        let vol = 1;
        if (st === "glass") {
          vol = 1 / 6;
        } else if (st === "karaf") {
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

        const tKey = st === "glass" ? "glass" : st === "karaf" ? "karaf" : "bottle";
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
        const cKey = catRaw === "fast" ? "fast" : catRaw === "fine" ? "fine" : catRaw === "reserve" ? "reserve" : "other";

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
            label: tk === "glass" ? "Glass (1/6)" : tk === "karaf" ? "Karaf (2/6)" : "Full Bottle",
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
    }
  }, [salesPeriod]);

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

  if (isFirstLoad) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <View style={[styles.logoBadge]}>
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
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.logoRow}>
              <View style={styles.logoBadge}>
                <Wine size={22} color="#fff" strokeWidth={2.5} />
              </View>
              <View>
                <Text style={styles.title}>
                  CaveauOne<Text style={{ color: theme.secondary }}> Admin</Text>
                </Text>
                <View style={styles.rolePill}>
                  <Text style={styles.rolePillText}>ALL STORES OVERVIEW</Text>
                </View>
              </View>
            </View>
            <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
              <LogOut size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>Welcome, {profile?.email}</Text>
        </View>

        {/* ── Sales Summary ───────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>All-Store Sales</Text>
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
          </View>

          <View style={styles.metricsRow}>
            <TouchableOpacity
              style={[styles.metricCard, { backgroundColor: theme.primary, flex: 1 }]}
              onPress={() => router.push({ pathname: "/sales", params: { period: salesPeriod } })}
            >
              <Banknote size={22} color="#fff" strokeWidth={2.5} />
              {loadingSales && !isFirstLoad && !refreshing ? (
                <ActivityIndicator color="#fff" size="small" style={{ marginVertical: 2 }} />
              ) : (
                <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>
                  {formatCurrency(salesMetrics.totalRevenue)}
                </Text>
              )}
              <Text style={styles.metricLabel}>Total Revenue</Text>
            </TouchableOpacity>

            <View style={[styles.metricCard, { backgroundColor: theme.secondary, flex: 1 }]}>
              <Wine size={22} color="#fff" strokeWidth={2.5} />
              {loadingSales && !isFirstLoad && !refreshing ? (
                <ActivityIndicator color="#fff" size="small" style={{ marginVertical: 2 }} />
              ) : (
                <Text style={styles.metricValue}>{salesMetrics.totalItems}</Text>
              )}
              <Text style={styles.metricLabel}>Bottles Sold</Text>
            </View>
          </View>

          {/* ── Drilldown Mode Tabs & Content ────────────────────────────────── */}
          <View style={{ marginTop: 20 }}>
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

            {/* ── Multi-Segmented Proportional Distribution Bar ────────────── */}
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
              <ActivityIndicator color={theme.primary} style={{ marginVertical: 20 }} />
            ) : breakdownMode === "store" ? (
              /* STORE DRILLDOWN */
              storeSales.length === 0 ? (
                <View style={styles.emptyBreakdownCard}>
                  <Text style={styles.emptyBreakdownText}>No store sales recorded for this period</Text>
                </View>
              ) : (
                <View style={{ gap: 10, marginTop: 4 }}>
                  {storeSales.map((item, idx) => {
                    const isExpanded = expandedCardId === item.storeId;
                    const STORE_COLORS = ["#4f46e5", "#059669", "#d97706", "#ec4899", "#06b6d4", "#8b5cf6", "#64748b"];
                    const storeColor = STORE_COLORS[idx % STORE_COLORS.length];

                    return (
                      <View
                        key={item.storeId}
                        style={[styles.breakdownCard, { borderLeftWidth: 4, borderLeftColor: storeColor }]}
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
                            <Building2 size={16} color={storeColor} />
                            <Text style={styles.breakdownName} numberOfLines={1}>
                              {item.storeName}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2 }}
                            onPress={() => setExpandedCardId(isExpanded ? null : item.storeId)}
                          >
                            <Text style={styles.breakdownRevenue}>{formatCurrency(item.revenue)}</Text>
                            {isExpanded ? (
                              <ChevronUp size={16} color={theme.textSecondary} />
                            ) : (
                              <ChevronDown size={16} color={theme.textSecondary} />
                            )}
                          </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                          style={styles.breakdownSubRow}
                          onPress={() => setExpandedCardId(isExpanded ? null : item.storeId)}
                        >
                          <Text style={styles.breakdownSubText}>
                            {item.volume} bottles sold ({item.count} {item.count === 1 ? "sale" : "sales"})
                          </Text>
                          <View style={styles.sharePillContainer}>
                            {idx === 0 && item.percentage > 0 && (
                              <View style={[styles.rankBadge, { backgroundColor: storeColor + "1A", borderColor: storeColor + "40" }]}>
                                <Text style={[styles.rankBadgeText, { color: storeColor }]}>#1 LEADER</Text>
                              </View>
                            )}
                            <View style={[styles.ringPill, { borderColor: storeColor + "40", backgroundColor: storeColor + "0D" }]}>
                              <View style={[styles.ringDot, { backgroundColor: storeColor }]} />
                              <Text style={[styles.ringPillText, { color: storeColor }]}>{item.percentage}% share</Text>
                            </View>
                          </View>
                        </TouchableOpacity>

                        {/* Expanded Store Details */}
                        {isExpanded && (
                          <View style={styles.expandedBox}>
                            <Text style={styles.expandedBoxTitle}>Portion Breakdown:</Text>
                            <View style={{ gap: 6, marginTop: 4 }}>
                              {item.types.map((tp, tpIdx) => (
                                <View key={tpIdx} style={styles.expandedRow}>
                                  <Text style={styles.expandedLabel}>{tp.label}</Text>
                                  <Text style={styles.expandedVal}>
                                    {tp.count} sold ({formatCurrency(tp.revenue)})
                                  </Text>
                                </View>
                              ))}
                            </View>

                            <Text style={[styles.expandedBoxTitle, { marginTop: 10 }]}>Category Breakdown:</Text>
                            <View style={{ gap: 6, marginTop: 4 }}>
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
                <View style={styles.typeGrid}>
                  {categorySales.map((item, idx) => {
                    const isExpanded = expandedCardId === item.categoryKey;
                    return (
                      <View
                        key={item.categoryKey}
                        style={[styles.typeCard, { borderLeftWidth: 4, borderLeftColor: item.badgeColor }]}
                      >
                        <TouchableOpacity
                          style={styles.typeHeader}
                          onPress={() => setExpandedCardId(isExpanded ? null : item.categoryKey)}
                        >
                          <View style={[styles.typeBadge, { backgroundColor: item.badgeColor + "18" }]}>
                            <Text style={[styles.typeBadgeText, { color: item.badgeColor }]}>
                              {item.iconText}
                            </Text>
                          </View>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Text style={styles.typeRevenue}>{formatCurrency(item.revenue)}</Text>
                            {isExpanded ? (
                              <ChevronUp size={16} color={theme.textSecondary} />
                            ) : (
                              <ChevronDown size={16} color={theme.textSecondary} />
                            )}
                          </View>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={{ marginTop: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}
                          onPress={() => setExpandedCardId(isExpanded ? null : item.categoryKey)}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.typeTitle}>{item.label}</Text>
                            <Text style={styles.typeDetail}>
                              {item.volume} bottles sold ({item.count} {item.count === 1 ? "sale" : "sales"})
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
                              <Text style={[styles.ringPillText, { color: item.badgeColor }]}>{item.percentage}% share</Text>
                            </View>
                          </View>
                        </TouchableOpacity>

                        {/* Expanded Category Store Details */}
                        {isExpanded && (
                          <View style={styles.expandedBox}>
                            <Text style={styles.expandedBoxTitle}>Sales per Store:</Text>
                            <View style={{ gap: 6, marginTop: 4 }}>
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
              <View style={styles.typeGrid}>
                {typeSales.map((item, idx) => {
                  const isBottle = item.type === "bottle";
                  const isGlass = item.type === "glass";
                  const bgBadgeColor = isBottle ? "#4f46e5" : isGlass ? "#059669" : "#d97706";
                  const isExpanded = expandedCardId === item.type;

                  return (
                    <View
                      key={item.type}
                      style={[styles.typeCard, { borderLeftWidth: 4, borderLeftColor: bgBadgeColor }]}
                    >
                      <TouchableOpacity
                        style={styles.typeHeader}
                        onPress={() => setExpandedCardId(isExpanded ? null : item.type)}
                      >
                        <View style={[styles.typeBadge, { backgroundColor: bgBadgeColor + "18" }]}>
                          <Text style={[styles.typeBadgeText, { color: bgBadgeColor }]}>
                            {isBottle ? "🍾 BOTTLE" : isGlass ? "🍷 GLASS" : "🍶 KARAF"}
                          </Text>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text style={styles.typeRevenue}>{formatCurrency(item.revenue)}</Text>
                          {isExpanded ? (
                            <ChevronUp size={16} color={theme.textSecondary} />
                          ) : (
                            <ChevronDown size={16} color={theme.textSecondary} />
                          )}
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={{ marginTop: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}
                        onPress={() => setExpandedCardId(isExpanded ? null : item.type)}
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
                            <Text style={[styles.ringPillText, { color: bgBadgeColor }]}>{item.percentage}% share</Text>
                          </View>
                        </View>
                      </TouchableOpacity>

                      {/* Expanded Portion Store Details */}
                      {isExpanded && (
                        <View style={styles.expandedBox}>
                          <Text style={styles.expandedBoxTitle}>Sales per Store:</Text>
                          <View style={{ gap: 6, marginTop: 4 }}>
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
        </View>

        {/* ── Per-Store Inventory Alerts ──────────────────────────────────── */}
        {storeAlerts.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Inventory Alerts</Text>
              {totalAlertStores > 0 && (
                <View style={[styles.badge, { backgroundColor: theme.danger }]}>
                  <Text style={styles.badgeText}>{totalAlertStores} stores</Text>
                </View>
              )}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
              <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: 4 }}>
                {storeAlerts.map((sa) => {
                  const hasAlert = sa.stockout + sa.parAlert + sa.underSafety > 0;
                  return (
                    <View
                      key={sa.storeId}
                      style={[
                        styles.storeAlertCard,
                        !hasAlert && { opacity: 0.5 },
                      ]}
                    >
                      <View style={styles.storeAlertHeader}>
                        <Building2 size={14} color={theme.primary} />
                        <Text style={styles.storeAlertName} numberOfLines={1}>
                          {sa.storeName}
                        </Text>
                      </View>

                      {!hasAlert ? (
                        <Text style={[styles.storeAlertSub, { color: theme.accent }]}>
                          ✓ All Good
                        </Text>
                      ) : (
                        <View style={{ gap: 4, marginTop: 8 }}>
                          {sa.stockout > 0 && (
                            <View style={styles.alertRow}>
                              <AlertOctagon size={12} color="#ef4444" />
                              <Text style={[styles.alertRowText, { color: "#ef4444" }]}>
                                {sa.stockout} stockout
                              </Text>
                            </View>
                          )}
                          {sa.parAlert > 0 && (
                            <View style={styles.alertRow}>
                              <AlertTriangle size={12} color="#f97316" />
                              <Text style={[styles.alertRowText, { color: "#f97316" }]}>
                                {sa.parAlert} PAR alert
                              </Text>
                            </View>
                          )}
                          {sa.underSafety > 0 && (
                            <View style={styles.alertRow}>
                              <AlertTriangle size={12} color="#eab308" />
                              <Text style={[styles.alertRowText, { color: "#eab308" }]}>
                                {sa.underSafety} under safety
                              </Text>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        )}

        {/* ── Pullout Requests ────────────────────────────────────────────── */}
        {pulloutTasks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Active Pullout Requests</Text>
            <View style={{ gap: 10, marginTop: 12 }}>
              {pulloutTasks.map((task) => (
                <TouchableOpacity
                  key={task.id}
                  style={styles.taskCard}
                  onPress={() =>
                    router.push({ pathname: "/pullout/[id]", params: { id: task.id } })
                  }
                >
                  <View style={[styles.taskIcon, { backgroundColor: "#f59e0b20" }]}>
                    <ClipboardList size={18} color="#f59e0b" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.taskTitle}>
                      {storeMap[task.sourceStoreId || ""] || "Warehouse"} → {storeMap[task.outBoundStoreId || ""] || "Unknown"}
                    </Text>
                    <Text style={styles.taskSub}>
                      {task.items.reduce((a, i) => a + (i.requestedQty || 0), 0)} items • REQ: {task.id.slice(0, 6).toUpperCase()}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, task.status === "in_progress" ? { backgroundColor: "#f59e0b20" } : { backgroundColor: theme.border }]}>
                    <Text style={[styles.statusText, task.status === "in_progress" ? { color: "#f59e0b" } : { color: theme.textSecondary }]}>
                      {task.status === "in_progress" ? "IN PROGRESS" : "PENDING"}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Incoming Deliveries ─────────────────────────────────────────── */}
        {incomingDeliveries.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Incoming Deliveries</Text>
            <View style={{ gap: 10, marginTop: 12 }}>
              {incomingDeliveries.map((del) => (
                <TouchableOpacity
                  key={del.id}
                  style={styles.taskCard}
                  onPress={() =>
                    router.push({ pathname: "/deliveries/[id]", params: { id: del.id } })
                  }
                >
                  <View style={[styles.taskIcon, { backgroundColor: "#6366f120" }]}>
                    <Truck size={18} color={theme.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.taskTitle}>
                      → {storeMap[del.storeId] || "Unknown Store"}
                    </Text>
                    <Text style={styles.taskSub}>
                      {del.totalBottles} bottles • DEL: {del.id.slice(0, 6).toUpperCase()}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: "#6366f120" }]}>
                    <Text style={[styles.statusText, { color: theme.primary }]}>
                      {del.status === "receiving" ? "RECEIVING" : "DISPATCHED"}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Quick Actions ───────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={{ gap: 14, marginTop: 12 }}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: theme.accent }]}
              onPress={() => router.push({ pathname: "/tagging", params: { mode: "sell" } })}
            >
              <Banknote size={32} color="#fff" strokeWidth={1.5} />
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>Sell Bottle</Text>
                <Text style={styles.actionDesc}>Scan a bottle QR to process a sale</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: theme.primary }]}
              onPress={() => router.push("/inventory")}
            >
              <Search size={32} color="#fff" strokeWidth={1.5} />
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>Bottle Management</Text>
                <Text style={styles.actionDesc}>Search inventory across all stores</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Footer badge ────────────────────────────────────────────────── */}
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
    alignItems: "flex-start",
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.logoBg,
    alignItems: "center",
    justifyContent: "center",
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
    marginTop: 8,
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
  section: {
    marginBottom: 28,
    backgroundColor: theme.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.border,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionTitle: {
    color: theme.textSecondary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },
  periodRow: {
    flexDirection: "row",
    gap: 6,
  },
  periodBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: theme.border,
  },
  periodBtnText: {
    color: theme.textSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  metricsRow: {
    flexDirection: "row",
    gap: 12,
  },
  metricCard: {
    borderRadius: 16,
    padding: 16,
    gap: 6,
    alignItems: "flex-start",
  },
  metricValue: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  metricLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  storeAlertCard: {
    width: 150,
    backgroundColor: theme.background,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  storeAlertHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  storeAlertName: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
  storeAlertSub: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 8,
  },
  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  alertRowText: {
    fontSize: 11,
    fontWeight: "700",
  },
  taskCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.background,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  taskIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  taskTitle: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "700",
  },
  taskSub: {
    color: theme.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  statusPill: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderRadius: 20,
    padding: 20,
  },
  actionTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
  actionDesc: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    marginTop: 2,
  },
  footerBadge: {
    marginTop: 8,
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
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
  subSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.text,
    letterSpacing: 0.2,
  },
  breakdownCard: {
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 8,
  },
  breakdownHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  breakdownName: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.text,
  },
  breakdownRevenue: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.primary,
  },
  breakdownSubRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  breakdownSubText: {
    fontSize: 12,
    color: theme.textSecondary,
    fontWeight: "500",
  },
  breakdownPercentage: {
    fontSize: 12,
    color: theme.primary,
    fontWeight: "700",
  },
  progressBarBg: {
    height: 6,
    backgroundColor: "#e2e8f0",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: theme.primary,
    borderRadius: 3,
  },
  emptyBreakdownCard: {
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.border,
    marginTop: 8,
  },
  emptyBreakdownText: {
    fontSize: 13,
    color: theme.textSecondary,
    fontStyle: "italic",
  },
  typeGrid: {
    gap: 10,
    marginTop: 10,
  },
  typeCard: {
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  typeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  typeRevenue: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.text,
  },
  typeTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.text,
  },
  typeDetail: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 2,
  },
  typeProgressBarBg: {
    height: 5,
    backgroundColor: "#e2e8f0",
    borderRadius: 2.5,
    overflow: "hidden",
    marginTop: 10,
  },
  typeProgressBarFill: {
    height: "100%",
    borderRadius: 2.5,
  },
  drilldownTabRow: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderRadius: 14,
    padding: 3,
    marginBottom: 8,
  },
  drilldownTabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
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
  expandedBox: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  expandedBoxTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  expandedRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  expandedLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.text,
  },
  expandedVal: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.primary,
  },
  viewStoreSalesBtn: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: theme.primary + "12",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.primary + "30",
  },
  viewStoreSalesText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.primary,
  },
  distStripContainer: {
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    marginTop: 4,
    borderWidth: 1,
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
  sharePillContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rankBadge: {
    paddingHorizontal: 7,
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
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  ringDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  ringPillText: {
    fontSize: 11,
    fontWeight: "800",
  },
});
