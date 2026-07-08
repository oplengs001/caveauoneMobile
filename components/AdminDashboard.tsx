import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { auth, db } from "@/lib/firebase";
import { getSalesByPeriodAllStores, getStores } from "@/lib/queries";
import { Store, PulloutRequest, Delivery } from "@/types";
import { useFocusEffect, useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import {
  AlertOctagon,
  AlertTriangle,
  Banknote,
  Building2,
  ClipboardList,
  FileDown,
  LogOut,
  Search,
  Truck,
  Wine,
} from "lucide-react-native";
import React, { useCallback, useState } from "react";
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

  const [salesPeriod, setSalesPeriod] = useState<"today" | "week" | "all">("today");
  const [salesMetrics, setSalesMetrics] = useState({ totalRevenue: 0, totalItems: 0 });
  const [loadingSales, setLoadingSales] = useState(true);

  const [storeAlerts, setStoreAlerts] = useState<StoreAlerts[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(true);

  const [pulloutTasks, setPulloutTasks] = useState<PulloutRequest[]>([]);
  const [incomingDeliveries, setIncomingDeliveries] = useState<Delivery[]>([]);
  const [storeMap, setStoreMap] = useState<Record<string, string>>({});
  const [loadingTasks, setLoadingTasks] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

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
      const result = await getSalesByPeriodAllStores(startDate, new Date());
      setSalesMetrics(result);
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
          const storeRef = doc(db, "stores", store.id);
          const settingsSnap = await getDocs(
            query(
              collection(db, "store_wine_settings"),
              where("storeId", "==", store.id),
              where("discontinued", "==", false),
            )
          );

          let stockout = 0;
          let parAlert = 0;
          let underSafety = 0;

          await Promise.all(
            settingsSnap.docs.map(async (settingDoc) => {
              const setting = settingDoc.data();
              const { parLevel = 0, safetyStock = 0, masterWineId } = setting;

              const bottlesSnap = await getDocs(
                query(
                  collection(db, "inventory_bottles"),
                  where("storeRef", "==", storeRef),
                  where("masterWineRef", "==", doc(db, "master_wines", masterWineId)),
                  where("status", "in", ["received", "shelved"]),
                )
              );
              const count = bottlesSnap.size;

              if (count === 0) {
                stockout++;
              } else if (safetyStock > 0 && count < safetyStock) {
                underSafety++;
              } else if (parLevel > 0 && count <= parLevel) {
                parAlert++;
              }
            })
          );

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
      const [pulloutSnap, deliverySnap, allStores] = await Promise.all([
        getDocs(
          query(
            collection(db, "pullout_requests"),
            where("status", "in", ["pending", "in_progress"]),
          )
        ),
        getDocs(
          query(
            collection(db, "deliveries"),
            where("status", "in", ["dispatched", "receiving"]),
          )
        ),
        getStores(),
      ]);

      const locMap: Record<string, string> = {};
      allStores.forEach((s) => (locMap[s.id] = s.name));
      setStoreMap(locMap);

      setPulloutTasks(
        pulloutSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as PulloutRequest)
      );
      setIncomingDeliveries(
        deliverySnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Delivery)
      );
    } catch (e) {
      console.error("Admin: failed to fetch tasks", e);
    } finally {
      setLoadingTasks(false);
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([fetchSalesMetrics(), fetchStoreAlerts(), fetchTasks()]);
  }, [fetchSalesMetrics, fetchStoreAlerts, fetchTasks]);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

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
          await signOut(auth);
          router.replace("/login");
        },
      },
    ]);
  };

  const totalAlertStores = storeAlerts.filter(
    (s) => s.stockout + s.parAlert + s.underSafety > 0
  ).length;
  const allDataLoaded = !loadingSales && !loadingAlerts && !loadingTasks;

  if (!allDataLoaded && !refreshing) {
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
              <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>
                {formatCurrency(salesMetrics.totalRevenue)}
              </Text>
              <Text style={styles.metricLabel}>Total Revenue</Text>
            </TouchableOpacity>

            <View style={[styles.metricCard, { backgroundColor: theme.secondary, flex: 1 }]}>
              <Wine size={22} color="#fff" strokeWidth={2.5} />
              <Text style={styles.metricValue}>{salesMetrics.totalItems}</Text>
              <Text style={styles.metricLabel}>Bottles Sold</Text>
            </View>
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

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: "#0f766e" }]}
              onPress={() => router.push("/onboarding")}
            >
              <FileDown size={32} color="#fff" strokeWidth={1.5} />
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>Onboarding Tasks</Text>
                <Text style={styles.actionDesc}>Review & process new wine deliveries</Text>
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
});
