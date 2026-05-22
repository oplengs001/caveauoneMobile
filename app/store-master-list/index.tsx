import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { MasterWine, StockStatus, StoreWineSetting } from "@/types";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import {
  AlertTriangle,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  TrendingUp,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
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
  setting: StoreWineSetting | null;
  status: StockStatus;
  requestedQty: number;
}

function computeStatus(
  stockCount: number,
  setting: StoreWineSetting | null,
): { status: StockStatus; requestedQty: number } {
  if (!setting) return { status: "unset", requestedQty: 0 };
  if (setting.discontinued) return { status: "discontinued", requestedQty: 0 };
  if (stockCount === 0)
    return {
      status: "stockout",
      requestedQty: setting.safetyStock,
    };
  if (stockCount > setting.safetyStock)
    return { status: "overstock", requestedQty: 0 };
  if (stockCount <= setting.parLevel) {
    return {
      status: "par_alert",
      requestedQty: setting.safetyStock - stockCount,
    };
  }
  if (stockCount < setting.safetyStock) {
    return {
      status: "under_safety",
      requestedQty: setting.safetyStock - stockCount,
    };
  }
  return { status: "in_stock", requestedQty: 0 };
}

const STATUS_CONFIG: Record<
  StockStatus,
  { label: string; color: string; bg: string; accent: string }
> = {
  in_stock: {
    label: "In Stock",
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
    color: "#166534",
    bg: "#dcfce7",
    accent: "#22c55e",
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
  const { profile } = useAuth();
  const router = useRouter();
  const storeId = profile?.locationId ?? "";

  const [entries, setEntries] = useState<WineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { filter: initialFilter } = useLocalSearchParams<{
    filter:
      | "all"
      | "alerts"
      | "under_safety"
      | "stockout"
      | "overstock"
      | "unset";
  }>();
  const [filter, setFilter] = useState<
    "all" | "alerts" | "under_safety" | "stockout" | "overstock" | "unset"
  >(initialFilter || "all");

  // Adjustment sheet
  const [selected, setSelected] = useState<WineEntry | null>(null);
  const [sheetPar, setSheetPar] = useState("");
  const [sheetSafety, setSheetSafety] = useState("");
  const [sheetDiscontinued, setSheetDiscontinued] = useState(false);
  const [saving, setSaving] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const fetchData = useCallback(async () => {
    if (!storeId) return;
    try {
      // 1. Fetch all master wines that have ever been at this store
      const bottlesSnap = await getDocs(
        query(
          collection(db, "inventory_bottles"),
          where("storeRef", "==", doc(db, "stores", storeId)),
        ),
      );

      // Build unique masterWineRef map
      const wineRefMap = new Map<string, any>();
      bottlesSnap.docs.forEach((d) => {
        const ref = d.data().masterWineRef;
        if (ref && !wineRefMap.has(ref.id)) wineRefMap.set(ref.id, ref);
      });

      // 2. Fetch settings
      const settingsSnap = await getDocs(
        query(
          collection(db, "store_wine_settings"),
          where("storeId", "==", storeId),
        ),
      );
      const settingsMap = new Map<string, StoreWineSetting>();
      settingsSnap.docs.forEach((d) =>
        settingsMap.set(d.data().masterWineId, {
          id: d.id,
          ...d.data(),
        } as StoreWineSetting),
      );

      // 3. For each wine, count active bottles & fetch wine doc
      const results: WineEntry[] = await Promise.all(
        Array.from(wineRefMap.entries()).map(async ([wineId, wineRef]) => {
          const [wineSnap, countSnap] = await Promise.all([
            getDoc(wineRef),
            getCountFromServer(
              query(
                collection(db, "inventory_bottles"),
                where("storeRef", "==", doc(db, "stores", storeId)),
                where("masterWineRef", "==", wineRef),
                where("status", "in", ["received", "shelved"]),
              ),
            ),
          ]);

          const masterWine: MasterWine = wineSnap.exists()
            ? ({
                id: wineSnap.id,
                ...(wineSnap.data() as object),
              } as MasterWine)
            : { id: wineId, name: "Unknown Wine", vintage: "", price: 0 };

          const stockCount = countSnap.data().count;
          const setting = settingsMap.get(wineId) ?? null;
          const { status, requestedQty } = computeStatus(stockCount, setting);

          return { masterWine, stockCount, setting, status, requestedQty };
        }),
      );

      // Sort: alerts first, then stockouts, then in_stock, then overstock, discontinued last
      const order: StockStatus[] = [
        "stockout",
        "par_alert",
        "under_safety",
        "in_stock",
        "overstock",
        "unset",
        "discontinued",
      ];
      results.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
      setEntries(results);
    } catch (err) {
      console.error("MasterList fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [storeId]);

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
    setSheetDiscontinued(entry.setting?.discontinued ?? false);
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
      const docId = `${storeId}_${selected.masterWine.id}`;
      await setDoc(doc(db, "store_wine_settings", docId), {
        storeId,
        masterWineId: selected.masterWine.id,
        parLevel: par,
        safetyStock: safety,
        discontinued: sheetDiscontinued,
        updatedAt: serverTimestamp(),
        createdAt: selected.setting?.createdAt ?? serverTimestamp(),
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
              await addDoc(collection(db, "wine_requests"), {
                storeId,
                createdBy: profile.email,
                status: "pending",
                items: [
                  {
                    masterWineId: selected.masterWine.id,
                    wineName: selected.masterWine.name,
                    vintage: selected.masterWine.vintage,
                    sku: selected.masterWine.sku ?? "",
                    qty,
                    price: selected.masterWine.price,
                  },
                ],
                totalAmount: selected.masterWine.price * qty,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
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

  const filtered = entries.filter((e) => {
    if (filter === "alerts") return e.status === "par_alert";
    if (filter === "under_safety") return e.status === "under_safety";
    if (filter === "stockout") return e.status === "stockout";
    if (filter === "overstock") return e.status === "overstock";
    if (filter === "unset") return e.status === "unset";
    return true;
  });

  const alertCount = entries.filter(
    (e) => e.status === "par_alert" || e.status === "stockout",
  ).length;

  const renderItem = ({ item }: { item: WineEntry }) => {
    const cfg = STATUS_CONFIG[item.status];
    return (
      <TouchableOpacity
        style={[
          styles.card,
          { borderLeftWidth: 4, borderLeftColor: cfg.accent },
        ]}
        onPress={() => openSheet(item)}
        activeOpacity={0.8}
      >
        <View style={styles.cardBody}>
          {/* Left: Big stock count */}
          <View style={[styles.stockCircle, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.stockCircleCount, { color: cfg.color }]}>
              {item.stockCount}
            </Text>
            <Text style={[styles.stockCircleLabel, { color: cfg.color }]}>
              in store
            </Text>
          </View>

          {/* Right: Wine info + inline metrics */}
          <View style={styles.cardInfo}>
            <View style={styles.cardInfoTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.wineName} numberOfLines={2}>
                  {item.masterWine.name}
                </Text>
                <Text style={styles.wineMeta}>
                  {item.masterWine.vintage}
                  {item.masterWine.producer
                    ? ` · ${item.masterWine.producer}`
                    : ""}
                  {item.masterWine.format ? ` · ${item.masterWine.format}` : ""}
                </Text>
              </View>
              <ChevronRight size={18} color="#94a3b8" />
            </View>

            {/* Compact inline metrics row */}
            <View style={styles.inlineMetrics}>
              <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                <Text style={[styles.statusText, { color: cfg.color }]}>
                  {cfg.label}
                </Text>
              </View>
              {item.setting && (
                <>
                  <Text style={styles.inlineMetricText}>
                    PAR{" "}
                    <Text style={styles.inlineMetricVal}>
                      {item.setting.parLevel}
                    </Text>
                  </Text>
                  <Text style={[styles.inlineMetricDot]}>·</Text>
                  <Text style={styles.inlineMetricText}>
                    Safety{" "}
                    <Text style={styles.inlineMetricVal}>
                      {item.setting.safetyStock}
                    </Text>
                  </Text>
                </>
              )}
              {item.requestedQty > 0 && (
                <>
                  <Text style={styles.inlineMetricDot}>·</Text>
                  <Text
                    style={[styles.inlineMetricText, { color: cfg.accent }]}
                  >
                    Need{" "}
                    <Text style={{ fontWeight: "900" }}>
                      +{item.requestedQty}
                    </Text>
                  </Text>
                </>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={28} color={theme.primary} strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Master List</Text>
          <Text style={styles.subtitle}>{entries.length} wines tracked</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
          <RefreshCw size={20} color={theme.primary} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      {/* Alert Banner */}
      {alertCount > 0 && (
        <View style={styles.alertBanner}>
          <AlertTriangle size={16} color="#92400e" />
          <Text style={styles.alertBannerText}>
            {alertCount} wine{alertCount > 1 ? "s" : ""} require attention
          </Text>
        </View>
      )}

      {/* Filter Chips */}
      <View style={styles.filterRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {(
            [
              "all",
              "alerts",
              "under_safety",
              "stockout",
              "overstock",
              "unset",
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
                  : f === "alerts"
                    ? "⚠ PAR Alerts"
                    : f === "under_safety"
                      ? "🛡 Under Safety"
                      : f === "stockout"
                        ? "🔴 Stockout"
                        : f === "overstock"
                          ? "🔵 Overstock"
                          : "⚪️ Unset"}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* List */}
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
              <Text style={styles.emptyText}>No wines found.</Text>
            </View>
          }
        />
      )}

      {/* Adjustment Sheet */}
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

            {/* Current Stock */}
            <View style={styles.stockRow}>
              <View style={styles.stockPill}>
                <Text style={styles.stockCount}>
                  {selected?.stockCount ?? 0}
                </Text>
                <Text style={styles.stockLabel}>bottles in store</Text>
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
              {/* PAR Level */}
              <Text style={styles.fieldLabel}>PAR LEVEL</Text>
              <Text style={styles.fieldHint}>
                When stock reaches this number, a reorder is triggered.
              </Text>
              <TextInput
                style={styles.input}
                value={sheetPar}
                onChangeText={setSheetPar}
                keyboardType="number-pad"
                placeholder="e.g. 6"
                placeholderTextColor="#94a3b8"
              />

              {/* Safety Stock */}
              <Text style={[styles.fieldLabel, { marginTop: 20 }]}>
                SAFETY STOCK
              </Text>
              <Text style={styles.fieldHint}>
                Target quantity to restore when reordering.
              </Text>
              <TextInput
                style={styles.input}
                value={sheetSafety}
                onChangeText={setSheetSafety}
                keyboardType="number-pad"
                placeholder="e.g. 24"
                placeholderTextColor="#94a3b8"
              />

              {/* Formula preview */}
              {sheetPar && sheetSafety && (
                <View style={styles.formulaBox}>
                  <Text style={styles.formulaLabel}>REQUEST FORMULA</Text>
                  <Text style={styles.formulaText}>
                    Safety Stock ({sheetSafety}) − Current (
                    {selected?.stockCount ?? 0}) ={" "}
                    <Text style={{ color: theme.primary, fontWeight: "900" }}>
                      {Math.max(
                        0,
                        parseInt(sheetSafety, 10) - (selected?.stockCount ?? 0),
                      )}{" "}
                      bottles
                    </Text>
                  </Text>
                </View>
              )}

              {/* Discontinued */}
              <View style={styles.discontinuedRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>DISCONTINUED</Text>
                  <Text style={styles.fieldHint}>
                    No alerts or requests will be generated.
                  </Text>
                </View>
                <Switch
                  value={sheetDiscontinued}
                  onValueChange={setSheetDiscontinued}
                  trackColor={{ false: "#e2e8f0", true: theme.primary + "60" }}
                  thumbColor={sheetDiscontinued ? theme.primary : "#94a3b8"}
                />
              </View>

              {/* Actions */}
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

              {selected && selected.requestedQty > 0 && !sheetDiscontinued && (
                <TouchableOpacity
                  style={[styles.requestBtn, requesting && styles.btnDisabled]}
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
              )}

              <View style={{ height: 40 }} />
            </ScrollView>
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
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  card: {
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    overflow: "hidden",
  },
  cardBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  stockCircle: {
    width: 68,
    height: 68,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  stockCircleCount: {
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -1,
  },
  stockCircleLabel: {
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    opacity: 0.7,
    marginTop: -1,
  },
  cardInfo: {
    flex: 1,
    gap: 8,
  },
  cardInfoTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  wineName: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.text,
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  wineMeta: { fontSize: 11, color: theme.textSecondary, fontWeight: "500" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  inlineMetrics: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  inlineMetricText: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.textSecondary,
  },
  inlineMetricVal: {
    fontWeight: "900",
    color: theme.text,
  },
  inlineMetricDot: {
    fontSize: 11,
    color: theme.border,
    fontWeight: "800",
  },
  empty: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyText: { color: theme.textSecondary, fontWeight: "600", fontSize: 15 },

  // Sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: theme.card,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 28,
    maxHeight: "90%",
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
    marginBottom: 20,
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
    marginBottom: 24,
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
    marginBottom: 10,
    lineHeight: 17,
  },
  input: {
    borderWidth: 1.5,
    borderColor: theme.border,
    borderRadius: 14,
    paddingHorizontal: 18,
    height: 56,
    fontSize: 18,
    fontWeight: "800",
    color: theme.text,
    backgroundColor: theme.background,
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
  discontinuedRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  saveBtn: {
    backgroundColor: theme.primary,
    height: 58,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
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
    letterSpacing: 0.5,
  },
  btnDisabled: { opacity: 0.4 },
});
