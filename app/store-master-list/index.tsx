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
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Lock,
  Package,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Truck,
  X,
  Zap,
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
    requestedQty = setting.safetyStock - stockCount;
  } else if (stockCount < setting.safetyStock) {
    status = "under_safety";
    requestedQty = setting.safetyStock - stockCount;
  }

  // If there's a pending request, override requestedQty to 0 to prevent re-requesting.
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
  const [sheetSellingPrice, setSheetSellingPrice] = useState("");
  const [sheetDiscontinued, setSheetDiscontinued] = useState(false);
  const [sheetIsFastMoving, setSheetIsFastMoving] = useState(false);
  const [sheetIsReserve, setSheetIsReserve] = useState(false);
  const [saving, setSaving] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [isBatchConfirmVisible, setIsBatchConfirmVisible] = useState(false);
  const [batchRequesting, setBatchRequesting] = useState(false);
  const [isSuccessVisible, setIsSuccessVisible] = useState(false);

  const fetchData = useCallback(async () => {
    if (!storeId) return;
    try {
      const [bottlesSnap, settingsSnap] = await Promise.all([
        getDocs(
          query(
            collection(db, "inventory_bottles"),
            where("storeRef", "==", doc(db, "stores", storeId)),
          ),
        ),
        getDocs(
          query(
            collection(db, "store_wine_settings"),
            where("storeId", "==", storeId),
          ),
        ),
      ]);

      const wineRefMap = new Map<string, any>();
      const settingsMap = new Map<string, StoreWineSetting>();

      bottlesSnap.docs.forEach((d) => {
        const ref = d.data().masterWineRef;
        if (ref && !wineRefMap.has(ref.id)) {
          wineRefMap.set(ref.id, ref);
        }
      });

      settingsSnap.docs.forEach((d) => {
        const settingData = d.data();
        settingsMap.set(settingData.masterWineId, {
          id: d.id,
          ...settingData,
        } as StoreWineSetting);

        if (
          settingData.masterWineId &&
          !wineRefMap.has(settingData.masterWineId)
        ) {
          wineRefMap.set(
            settingData.masterWineId,
            doc(db, "master_wines", settingData.masterWineId),
          );
        }
      });

      const pendingRequestsSnap = await getDocs(
        query(
          collection(db, "wine_requests"),
          where("storeId", "==", storeId),
          where("status", "in", [
            "pending",
            "converted",
            "outbound",
            "receiving",
          ]),
        ),
      );
      const pendingWineRequestMap = new Map<
        string,
        { id: string; status: string }
      >();
      pendingRequestsSnap.docs.forEach((reqDoc) => {
        const request = reqDoc.data();
        request.items?.forEach((item: { masterWineId: string }) => {
          if (item.masterWineId) {
            pendingWineRequestMap.set(item.masterWineId, {
              id: reqDoc.id,
              status: request.status,
            });
          }
        });
      });

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
          const activeRequest = pendingWineRequestMap.get(wineId);

          const { status, requestedQty } = computeStatus(
            stockCount,
            setting,
            !!activeRequest,
          );

          return {
            masterWine,
            stockCount,
            setting,
            status,
            requestedQty,
            activeRequest,
          };
        }),
      );

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
    setSheetSellingPrice(entry.setting?.sellingPrice?.toString() ?? "");
    setSheetDiscontinued(entry.setting?.discontinued ?? false);
    setSheetIsFastMoving(entry.setting?.isFastMoving ?? false);
    setSheetIsReserve(entry.setting?.isReserve ?? false);
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
        isFastMoving: sheetIsFastMoving,
        isReserve: sheetIsReserve,
        sellingPrice: sheetSellingPrice ? parseFloat(sheetSellingPrice) : null,
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

      await addDoc(collection(db, "wine_requests"), {
        storeId,
        targetStoreId: "warehouse",
        createdBy: profile.email,
        requesterId: profile.id,
        status: "pending",
        items: requestItems,
        totalAmount,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
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
    if (filter === "alerts") return e.status === "par_alert";
    if (filter === "under_safety") return e.status === "under_safety";
    if (filter === "stockout") return e.status === "stockout";
    if (filter === "overstock") return e.status === "overstock";
    if (filter === "unset") return e.status === "unset";
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

    // Calculate Progress Bar Fills (cap at 100%)
    const safetyStock = item.setting?.safetyStock || 0;
    const parLevel = item.setting?.parLevel || 0;

    const fillPercentage =
      safetyStock > 0
        ? Math.min(100, (item.stockCount / safetyStock) * 100)
        : item.stockCount > 0
          ? 100
          : 0;

    // Determine where the PAR marker sits on the progress bar
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
        {/* Header Row: Title & Price */}
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

        {/* Tags Row */}
        {(item.setting?.isFastMoving || item.setting?.isReserve) && (
          <View style={styles.tagsRow}>
            {item.setting?.isFastMoving && (
              <View
                style={[styles.indicatorBadge, { backgroundColor: "#fef3c7" }]}
              >
                <Zap size={10} color="#d97706" strokeWidth={2.5} />
                <Text style={[styles.indicatorText, { color: "#d97706" }]}>
                  Fast Moving
                </Text>
              </View>
            )}
            {item.setting?.isReserve && (
              <View
                style={[styles.indicatorBadge, { backgroundColor: "#e0e7ff" }]}
              >
                <Lock size={10} color="#4338ca" strokeWidth={2.5} />
                <Text style={[styles.indicatorText, { color: "#4338ca" }]}>
                  Reserve
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Integrated Stats & Capacity Bar */}
        {isConfigured ? (
          <View style={styles.barContainer}>
            {/* Top Stats Row */}
            <View style={styles.barStatsRow}>
              <View style={styles.stockHeaderRow}>
                <Package size={16} color={theme.textSecondary} />
                <Text style={styles.stockPrimaryValue}>{item.stockCount}</Text>
                <Text style={styles.stockPrimaryLabel}>IN STOCK</Text>
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

            {/* Progress Bar Track */}
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  { width: `${fillPercentage}%`, backgroundColor: cfg.accent },
                ]}
              />
              {/* Par Level Visual Marker */}
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

            {/* Bottom Labels */}
            <View style={styles.barLabelsRow}>
              <Text style={styles.barLabelSecondary}>
                {parLevel > 0 ? `PAR: ${parLevel}` : ""}
              </Text>
              <Text style={styles.barLabel}>SAFETY TARGET: {safetyStock}</Text>
            </View>
          </View>
        ) : (
          /* Fallback for unconfigured wines */
          <View style={styles.unconfiguredStockRow}>
            <Package size={14} color={theme.textSecondary} />
            <Text style={styles.stockPrimaryValue}>{item.stockCount}</Text>
            <Text style={styles.stockPrimaryLabel}>IN STOCK (UNSET)</Text>
          </View>
        )}

        {/* Pending Request Override Footer */}
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

      {/* Header */}
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
                          ? "🟢 Overstock"
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

      {/* Batch Request Button */}
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

      {/* Success Modal */}
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

      {/* Batch Confirm Modal */}
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

              <Text style={[styles.fieldLabel, { marginTop: 20 }]}>
                SELLING PRICE
              </Text>
              <Text style={styles.fieldHint}>
                The retail price of this wine at this store.
              </Text>
              <TextInput
                style={styles.input}
                value={sheetSellingPrice}
                onChangeText={setSheetSellingPrice}
                keyboardType="decimal-pad"
                placeholder="e.g. 2500.00"
                placeholderTextColor="#94a3b8"
              />

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

              <View style={styles.switchSection}>
                <View style={styles.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>FAST MOVING</Text>
                    <Text style={styles.fieldHint}>
                      Identifies this wine as a high-turnover item.
                    </Text>
                  </View>
                  <Switch
                    value={sheetIsFastMoving}
                    onValueChange={setSheetIsFastMoving}
                    trackColor={{
                      false: "#e2e8f0",
                      true: theme.primary + "60",
                    }}
                    thumbColor={sheetIsFastMoving ? theme.primary : "#94a3b8"}
                  />
                </View>

                <View style={styles.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>RESERVE STOCK</Text>
                    <Text style={styles.fieldHint}>
                      Marks this as a special/private stock, not for regular
                      sale.
                    </Text>
                  </View>
                  <Switch
                    value={sheetIsReserve}
                    onValueChange={setSheetIsReserve}
                    trackColor={{
                      false: "#e2e8f0",
                      true: theme.primary + "60",
                    }}
                    thumbColor={sheetIsReserve ? theme.primary : "#94a3b8"}
                  />
                </View>
              </View>

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

  list: { paddingHorizontal: 16, paddingBottom: 100 },

  // --- New Card UI ---
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

  // Capacity Bar & Integrated Stats
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

  // Pending Request Footer inside Card
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

  // Empty State
  empty: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyText: { color: theme.textSecondary, fontWeight: "600", fontSize: 15 },

  // --- Modals & Sheets ---
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
  switchSection: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  switchRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
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
});
