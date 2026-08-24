import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { clearToken } from "@/lib/auth";
import { AppUser, fetchStoreStaff } from "@/lib/queries/users";
import { BlurView } from "expo-blur";
import { Stack, useRouter } from "expo-router";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Droplets,
  Info,
  LogOut,
  Minus,
  Plus,
  RotateCcw,
  Scan,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Wine,
  X,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";

export interface FastWineItem {
  id: string;
  name: string;
  vintage?: string;
  producer?: string;
  format?: string;
  sku?: string;
  wineType?: string;
  price?: number;
  sellingPrice?: number | null;
  glassPrice?: number | null;
  carafePrice?: number | null;
  wineCategory?: "fast" | "fine" | "reserve" | "standard" | string | null;
  stockCount: number;
  availableBottleIds: string[];
  openBottle?: {
    id: string;
    glassesRemaining: number;
  } | null;
}

export type PortionType = "glass" | "carafe" | "bottle";

export interface OrderItem {
  wine: FastWineItem;
  portion: PortionType;
  quantity: number;
}

const normalizeWineType = (rawType?: string | null): string => {
  if (!rawType) return "Red Wine";
  const t = rawType.toLowerCase();
  if (t.includes("sparkling") || t.includes("champagne") || t.includes("prosecco") || t.includes("cava")) {
    return "Sparkling";
  }
  if (t.includes("white")) {
    return "White Wine";
  }
  if (t.includes("rose") || t.includes("rosé")) {
    return "Rosé";
  }
  if (t.includes("sweet") || t.includes("dessert") || t.includes("fortified") || t.includes("port")) {
    return "Dessert & Fortified";
  }
  if (t.includes("red")) {
    return "Red Wine";
  }
  return rawType;
};

// Maroon color palette constants
const MAROON = {
  primary: "#4c0519", // Deep Burgundy / Maroon
  dark: "#380311", // Ultra dark wine
  medium: "#881337", // Rose maroon
  light: "#ffe4e6", // Pale rose background
  ultraLight: "#fff1f2",
  accentGold: "#a16207",
  border: "#fecdd3",
};

export default function StoreStaffPOSTerminal() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const { profile, refreshProfile } = useAuth();
  const theme = Colors.store;

  const isLandscape = width > height;
  const isTabletLandscape = isLandscape && width >= 900;
  const storeId = profile?.locationId || null;

  // Data States
  const [storeName, setStoreName] = useState<string>("Boutique Store");
  const [staffList, setStaffList] = useState<AppUser[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<AppUser | null>(null);
  const [wines, setWines] = useState<FastWineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Primary Filters: Sales Type First + Wine Type Grouping
  const [salesTypeMode, setSalesTypeMode] = useState<PortionType>("glass");
  const [wineTypeFilter, setWineTypeFilter] = useState<string>("all");
  const [isStaffPickerOpen, setIsStaffPickerOpen] = useState(false);

  // Portion-picker gate modal — shown on every fresh mount
  const [showPortionModal, setShowPortionModal] = useState(true);

  const selectPortion = (portion: PortionType) => {
    setSalesTypeMode(portion);
    setShowPortionModal(false);
  };

  // Cart / Current Order State (Count Focused)
  const [currentOrder, setCurrentOrder] = useState<OrderItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

  // Post-dispense feedback
  const [successData, setSuccessData] = useState<{
    itemsCount: number;
    totalBottlesVolume: number;
    staffName: string;
    timestamp: string;
  } | null>(null);

  const [parAlerts, setParAlerts] = useState<
    Array<{ wineName: string; stockCount: number; requestedQty: number }>
  >([]);

  // Load staff, store name & inventory data
  const loadData = useCallback(async () => {
    try {
      if (storeId) {
        try {
          const storeData = await apiFetch(`/stores/${storeId}`);
          if (storeData?.name) setStoreName(storeData.name);
        } catch {
          // ignore error
        }
      }

      const staff = await fetchStoreStaff(storeId);
      setStaffList(staff);
      const activeUserInStaff: AppUser = staff.find((u) => u.id === profile?.id) || {
        id: profile?.id || "unknown",
        displayName: profile?.displayName || profile?.email?.split("@")[0] || "Staff Member",
        email: profile?.email || "",
        role: "store_staff",
        createdAt: new Date(),
      };
      setSelectedStaff(activeUserInStaff);

      const [winesData, settingsData, bottlesData] = await Promise.all([
        apiFetch("/wines"),
        storeId ? apiFetch(`/stock-settings?storeId=${storeId}`) : Promise.resolve([]),
        storeId
          ? apiFetch(`/bottles?storeId=${storeId}&status=received,shelved,open`)
          : Promise.resolve([]),
      ]);

      const allWines: any[] = Array.isArray(winesData)
        ? winesData
        : Array.isArray(winesData.wines)
          ? winesData.wines
          : [];
      const settingsList: any[] = Array.isArray(settingsData)
        ? settingsData
        : Array.isArray(settingsData.settings)
          ? settingsData.settings
          : [];
      const bottlesList: any[] = Array.isArray(bottlesData)
        ? bottlesData
        : Array.isArray(bottlesData.bottles)
          ? bottlesData.bottles
          : [];

      const settingsMap = new Map<string, any>();
      settingsList.forEach((s) => settingsMap.set(s.masterWineId, s));

      const bottlesByWine = new Map<string, any[]>();
      const openBottleByWine = new Map<string, any>();

      bottlesList.forEach((b) => {
        const wId = b.masterWineId || b.masterWineRef?.id;
        if (!wId) return;

        if (!bottlesByWine.has(wId)) bottlesByWine.set(wId, []);
        bottlesByWine.get(wId)!.push(b);

        if (
          b.status === "open" &&
          (!openBottleByWine.has(wId) ||
            (b.glassesRemaining ?? 0) > (openBottleByWine.get(wId)?.glassesRemaining ?? 0))
        ) {
          openBottleByWine.set(wId, b);
        }
      });

      const processedWines: FastWineItem[] = allWines
        .map((mw) => {
          const setting = settingsMap.get(mw.id);
          const wineBottles = bottlesByWine.get(mw.id) || [];
          const openB = openBottleByWine.get(mw.id);

          return {
            id: mw.id,
            name: mw.name,
            vintage: mw.vintage,
            producer: mw.producer,
            format: mw.format,
            sku: mw.sku,
            wineType: normalizeWineType(mw.type),
            price: mw.price,
            sellingPrice: setting?.sellingPrice ?? null,
            glassPrice: setting?.glassPrice ?? null,
            carafePrice: setting?.carafePrice ?? setting?.karafPrice ?? null,
            wineCategory: setting?.wineCategory ?? mw.wineCategory ?? "standard",
            stockCount: wineBottles.length,
            availableBottleIds: wineBottles.map((b: any) => b.id),
            openBottle: openB
              ? { id: openB.id, glassesRemaining: openB.glassesRemaining ?? 6 }
              : null,
          };
        })
        .filter((w) => w.stockCount > 0);

      setWines(processedWines);
    } catch (error) {
      console.error("[StoreStaffPOSTerminal] Load error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [storeId, profile]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  // Filtered wines
  const filteredWines = useMemo(() => {
    let result = wines;

    if (wineTypeFilter !== "all") {
      result = result.filter((w) => (w.wineType || "Red Wine") === wineTypeFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (w) =>
          w.name.toLowerCase().includes(q) ||
          (w.producer && w.producer.toLowerCase().includes(q)) ||
          (w.vintage && w.vintage.toLowerCase().includes(q)) ||
          (w.sku && w.sku.toLowerCase().includes(q)) ||
          (w.wineType && w.wineType.toLowerCase().includes(q))
      );
    }

    return [...result].sort((a, b) => {
      if (salesTypeMode === "glass") {
        if (a.openBottle && !b.openBottle) return -1;
        if (!a.openBottle && b.openBottle) return 1;
      }
      if (a.wineCategory === "fast" && b.wineCategory !== "fast") return -1;
      if (b.wineCategory === "fast" && a.wineCategory !== "fast") return 1;
      return a.name.localeCompare(b.name);
    });
  }, [wines, salesTypeMode, wineTypeFilter, searchQuery]);

  // Wine Type Counts
  const wineTypeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    let base = wines;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      base = base.filter((w) => w.name.toLowerCase().includes(q) || (w.producer && w.producer.toLowerCase().includes(q)));
    }
    counts.all = base.length;
    base.forEach((w) => {
      const t = w.wineType || "Red Wine";
      counts[t] = (counts[t] || 0) + 1;
    });
    return counts;
  }, [wines, searchQuery]);

  // Cart / Current Order Handlers
  const addToOrder = (wine: FastWineItem, preferredPortion?: PortionType) => {
    const portion = preferredPortion || salesTypeMode;

    setCurrentOrder((prev) => {
      const existingIdx = prev.findIndex(
        (item) => item.wine.id === wine.id && item.portion === portion
      );
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx].quantity += 1;
        return updated;
      }
      return [...prev, { wine, portion, quantity: 1 }];
    });
  };

  const updateQuantity = (index: number, delta: number) => {
    setCurrentOrder((prev) => {
      const updated = [...prev];
      const newQty = updated[index].quantity + delta;
      if (newQty <= 0) {
        return updated.filter((_, i) => i !== index);
      }
      updated[index].quantity = newQty;
      return updated;
    });
  };

  // Order Volume & Portion Summary (Counts only)
  const orderSummary = useMemo(() => {
    let totalItems = 0;
    let glassesCount = 0;
    let carafesCount = 0;
    let bottlesCount = 0;
    let totalBottlesVolume = 0;

    currentOrder.forEach((item) => {
      totalItems += item.quantity;
      if (item.portion === "glass") {
        glassesCount += item.quantity;
        totalBottlesVolume += item.quantity * (1 / 6);
      } else if (item.portion === "carafe") {
        carafesCount += item.quantity;
        totalBottlesVolume += item.quantity * (2 / 6);
      } else {
        bottlesCount += item.quantity;
        totalBottlesVolume += item.quantity;
      }
    });

    return {
      totalItems,
      glassesCount,
      carafesCount,
      bottlesCount,
      totalBottlesVolume: Math.round(totalBottlesVolume * 100) / 100,
    };
  }, [currentOrder]);

  // Submit Batch Order / Dispense Log
  const handleCompleteOrder = async () => {
    if (currentOrder.length === 0) return;

    setIsProcessing(true);
    const triggeredParAlerts: Array<{ wineName: string; stockCount: number; requestedQty: number }> = [];

    try {
      const staffToAttribute = selectedStaff || {
        id: profile?.id || "unknown",
        displayName: profile?.displayName || profile?.email?.split("@")[0] || "Staff",
        email: profile?.email,
      };

      for (const item of currentOrder) {
        const { wine, portion, quantity } = item;

        let glassCount = 1.0;
        let glassesDeducted = 6;
        if (portion === "glass") {
          glassCount = 0.1667;
          glassesDeducted = 1;
        } else if (portion === "carafe") {
          glassCount = 0.3333;
          glassesDeducted = 2;
        }

        for (let i = 0; i < quantity; i++) {
          let targetBottleId = wine.availableBottleIds[0];
          if (portion !== "bottle" && wine.openBottle) {
            targetBottleId = wine.openBottle.id;
          }

          // 1. Record Dispense/Sale
          await apiFetch("/sales", {
            method: "POST",
            body: JSON.stringify({
              bottleId: targetBottleId,
              masterWineId: wine.id,
              wineName: wine.name,
              vintage: wine.vintage,
              producer: wine.producer,
              format: wine.format,
              storeId: storeId,
              soldById: staffToAttribute.id,
              soldByEmail: staffToAttribute.email,
              price: wine.price || 0,
              vatAmount: 0,
              totalAmount: wine.price || 0,
              vatMode: "included",
              wineCategory: wine.wineCategory,
              masterWinePrice: wine.price || null,
              saleType: portion,
              glassCount,
            }),
          });

          // 2. Update Bottle Status & Glasses Remaining
          if (portion === "bottle") {
            await apiFetch(`/bottles/${targetBottleId}`, {
              method: "PATCH",
              body: JSON.stringify({
                status: "consumed",
                glassesRemaining: 0,
                locationId: null,
              }),
            });
          } else {
            const currentGlasses = wine.openBottle?.glassesRemaining ?? 6;
            const newGlassesRemaining = Math.max(0, currentGlasses - glassesDeducted);
            const newStatus = newGlassesRemaining === 0 ? "consumed" : "open";

            await apiFetch(`/bottles/${targetBottleId}`, {
              method: "PATCH",
              body: JSON.stringify({
                status: newStatus,
                glassesRemaining: newGlassesRemaining,
                ...(newStatus === "consumed" ? { locationId: null } : {}),
              }),
            });
          }
        }

        // 3. PAR Check
        if (storeId) {
          try {
            const [settingsRes, countRes, pendingReqRes] = await Promise.all([
              apiFetch(`/stock-settings?storeId=${storeId}&masterWineId=${wine.id}`),
              apiFetch(
                `/bottles?storeId=${storeId}&masterWineId=${wine.id}&status=shelved,received&countOnly=true`
              ),
              apiFetch(`/wine-requests?storeId=${storeId}&status=pending`).catch(() => []),
            ]);

            const settingList: any[] = settingsRes.settings || settingsRes;
            const currentSetting = settingList[0];
            const stockCount = countRes.count ?? 0;

            if (currentSetting && currentSetting.parLevel > 0 && stockCount <= currentSetting.parLevel) {
              const pendingRequests = Array.isArray(pendingReqRes)
                ? pendingReqRes
                : pendingReqRes?.wineRequests || [];
              let hasPending = false;
              pendingRequests.forEach((req: any) => {
                const items = Array.isArray(req.items)
                  ? req.items
                  : typeof req.items === "string"
                    ? JSON.parse(req.items)
                    : [];
                items.forEach((it: any) => {
                  if (it.masterWineId === wine.id) hasPending = true;
                });
              });

              if (!hasPending) {
                const requestedQty = Math.max(1, currentSetting.safetyStock - stockCount);
                const unitCost = wine.price || 0;

                await apiFetch("/wine-requests", {
                  method: "POST",
                  body: JSON.stringify({
                    storeId,
                    targetStoreId: "warehouse",
                    createdBy: profile?.email || "POS Auto",
                    requesterId: profile?.id || "system",
                    status: "pending",
                    items: [
                      {
                        masterWineId: wine.id,
                        wineName: wine.name,
                        vintage: wine.vintage || "",
                        sku: wine.sku || "",
                        format: wine.format || "",
                        producer: wine.producer || "",
                        qty: requestedQty,
                        price: unitCost,
                        pulledQty: 0,
                        ingressedQty: 0,
                      },
                    ],
                    totalAmount: unitCost * requestedQty,
                    urgency: "high",
                    notes: `[POS AUTO-REQUEST] PAR alert trigger (${stockCount} left <= PAR ${currentSetting.parLevel})`,
                  }),
                });

                triggeredParAlerts.push({
                  wineName: wine.name,
                  stockCount,
                  requestedQty,
                });
              }
            }
          } catch (e) {
            console.error("[POS Mode] PAR Alert check error:", e);
          }
        }
      }

      setParAlerts(triggeredParAlerts);
      setSuccessData({
        itemsCount: orderSummary.totalItems,
        totalBottlesVolume: orderSummary.totalBottlesVolume,
        staffName: staffToAttribute.displayName || staffToAttribute.email?.split("@")[0] || "Staff",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });

      setCurrentOrder([]);
      setIsMobileCartOpen(false);
      loadData();
    } catch (error: any) {
      console.error("[StoreStaffPOSTerminal] Dispense error:", error);
      Alert.alert("Action Failed", error.message || "Failed to process dispense.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out of the POS Terminal?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
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

  // Sommelier & Maroon Color Theme helper
  const getWineTypeTheme = (wineType?: string) => {
    const t = (wineType || "").toLowerCase();
    if (t.includes("white")) return { bg: "#fef3c7", accent: "#b45309", color: "#d97706", tag: "WHITE" };
    if (t.includes("sparkling")) return { bg: "#fef9c3", accent: "#a16207", color: "#ca8a04", tag: "SPARKLING" };
    if (t.includes("ros")) return { bg: "#ffe4e6", accent: "#be123c", color: "#f43f5e", tag: "ROSÉ" };
    if (t.includes("sweet") || t.includes("dessert")) return { bg: "#fae8ff", accent: "#7e22ce", color: "#a855f7", tag: "SWEET" };
    return { bg: "#fff1f2", accent: MAROON.primary, color: MAROON.primary, tag: "RED" };
  };

  // Render Current Service / Dispense Queue Sidebar / Drawer
  const renderCurrentOrderPanel = () => (
    <View style={[styles.orderPanel, { backgroundColor: "#ffffff" }]}>
      {/* Order Panel Header */}
      <View style={styles.orderPanelHeader}>
        <View>
          <Text style={styles.orderPanelTitle}>Current Service</Text>
          <Text style={styles.orderPanelSubTitle}>
            {orderSummary.totalItems} item{orderSummary.totalItems !== 1 ? "s" : ""} to dispense
          </Text>
        </View>

        {/* Staff Attribution Pill */}
        <TouchableOpacity
          onPress={() => setIsStaffPickerOpen(!isStaffPickerOpen)}
          style={styles.staffHeaderChip}
        >
          <View style={styles.staffAvatarCircle}>
            <Text style={styles.staffAvatarInitial}>
              {(selectedStaff?.displayName || profile?.email || "S")[0].toUpperCase()}
            </Text>
          </View>
          <Text style={styles.staffHeaderName} numberOfLines={1}>
            {selectedStaff?.displayName || profile?.email?.split("@")[0] || "Staff"}
          </Text>
          <ChevronDown size={14} color="#64748b" />
        </TouchableOpacity>
      </View>

      {/* Staff Picker Dropdown */}
      {isStaffPickerOpen && (
        <View style={styles.staffDropdownMenu}>
          {staffList.map((st) => (
            <TouchableOpacity
              key={st.id}
              onPress={() => {
                setSelectedStaff(st);
                setIsStaffPickerOpen(false);
              }}
              style={[
                styles.staffDropdownOption,
                selectedStaff?.id === st.id && { backgroundColor: MAROON.ultraLight },
              ]}
            >
              <Text
                style={[
                  styles.staffDropdownOptionText,
                  selectedStaff?.id === st.id && { fontWeight: "900", color: MAROON.primary },
                ]}
              >
                {st.displayName || st.email?.split("@")[0] || "Staff"}
              </Text>
              {selectedStaff?.id === st.id && <Check size={14} color={MAROON.primary} />}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Service Items List */}
      <ScrollView style={styles.orderItemsList} showsVerticalScrollIndicator={false}>
        {currentOrder.length === 0 ? (
          <View style={styles.emptyCartBox}>
            <Droplets size={44} color="#cbd5e1" strokeWidth={1.5} />
            <Text style={styles.emptyCartTitle}>Queue is empty</Text>
            <Text style={styles.emptyCartSub}>
              Tap the + button on any wine card to add glasses or bottles to service.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10, paddingVertical: 6 }}>
            {currentOrder.map((item, idx) => {
              const typeTheme = getWineTypeTheme(item.wine.wineType);
              const portionTag =
                item.portion === "glass" ? "1 Glass (1/6)" : item.portion === "carafe" ? "1 Carafe (2/6)" : "1 Bottle";

              return (
                <View key={`${item.wine.id}-${item.portion}-${idx}`} style={styles.orderItemCard}>
                  {/* Color-coded thumbnail dot */}
                  <View style={[styles.itemThumbnail, { backgroundColor: typeTheme.bg }]}>
                    <View style={[styles.thumbnailDot, { backgroundColor: typeTheme.color }]} />
                  </View>

                  {/* Item Details */}
                  <View style={{ flex: 1, paddingHorizontal: 10 }}>
                    <Text style={styles.orderItemName} numberOfLines={1}>
                      {item.wine.name}
                    </Text>
                    <View style={styles.orderItemPortionBadge}>
                      <Text style={styles.orderItemPortionText}>{portionTag}</Text>
                    </View>
                    <Text style={styles.orderItemStockNote}>
                      {item.wine.stockCount} btls available in cellar
                    </Text>
                  </View>

                  {/* Quantity Stepper */}
                  <View style={styles.stepperContainer}>
                    <TouchableOpacity
                      onPress={() => updateQuantity(idx, -1)}
                      style={styles.stepperBtnMinus}
                    >
                      <Minus size={14} color="#ffffff" strokeWidth={2.5} />
                    </TouchableOpacity>

                    <Text style={styles.stepperQtyText}>{item.quantity}</Text>

                    <TouchableOpacity
                      onPress={() => updateQuantity(idx, 1)}
                      style={styles.stepperBtnPlus}
                    >
                      <Plus size={14} color="#ffffff" strokeWidth={2.5} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Dispense Volume Summary & Action */}
      <View style={styles.orderFooter}>
        {/* Count Breakdown Table */}
        <View style={styles.countSummaryCard}>
          <View style={styles.calcRow}>
            <Text style={styles.calcLabel}>Glasses to Pour</Text>
            <Text style={styles.calcValue}>{orderSummary.glassesCount} gls</Text>
          </View>

          {orderSummary.carafesCount > 0 && (
            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Carafes to Pour</Text>
              <Text style={styles.calcValue}>{orderSummary.carafesCount} carafes</Text>
            </View>
          )}

          <View style={styles.calcRow}>
            <Text style={styles.calcLabel}>Full Bottles</Text>
            <Text style={styles.calcValue}>{orderSummary.bottlesCount} btls</Text>
          </View>

          <View style={styles.calcDivider} />

          <View style={styles.calcTotalRow}>
            <Text style={styles.calcTotalLabel}>Total Volume</Text>
            <Text style={styles.calcTotalValue}>
              {orderSummary.totalBottlesVolume} btl{orderSummary.totalBottlesVolume !== 1 ? "s" : ""}
            </Text>
          </View>
        </View>

        {/* Action Button */}
        <TouchableOpacity
          onPress={handleCompleteOrder}
          disabled={isProcessing || currentOrder.length === 0}
          style={[
            styles.checkoutBtn,
            { backgroundColor: currentOrder.length > 0 ? MAROON.primary : "#94a3b8" },
          ]}
          activeOpacity={0.85}
        >
          {isProcessing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.checkoutBtnText}>
              {currentOrder.length > 0
                ? `Confirm Dispense (${orderSummary.totalItems} Items)`
                : "Confirm Dispense"}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── PORTRAIT TOP BAR (Shown when in portrait on tablet or phone) ─────── */}
      {!isTabletLandscape && (
        <View style={styles.portraitTopBar}>
          <View style={styles.portraitBrandRow}>
            <View style={styles.portraitLogoCircle}>
              <Wine size={20} color="#ffffff" strokeWidth={2.5} />
            </View>
            <View>
              <Text style={styles.portraitStoreTitle} numberOfLines={1}>
                {storeName}
              </Text>
              <View style={styles.portraitStaffRow}>
                <View style={styles.onlineDot} />
                <Text style={styles.portraitStaffName}>
                  {selectedStaff?.displayName || profile?.email?.split("@")[0] || "Staff"} · On Duty
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.portraitActionsRow}>
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/sell" })}
              style={styles.portraitScanBtn}
            >
              <Scan size={16} color={MAROON.primary} strokeWidth={2.5} />
              <Text style={styles.portraitScanBtnText}>Scan</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => onRefresh()} style={styles.portraitIconBtn}>
              <RotateCcw size={16} color="#64748b" />
            </TouchableOpacity>

            <TouchableOpacity onPress={handleSignOut} style={styles.portraitIconBtn}>
              <LogOut size={16} color="#ef4444" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.mainLayoutRow}>
        {/* ── 1. LEFT SLIM DOCK (Only in Landscape on Tablet) ────────────────── */}
        {isTabletLandscape && (
          <View style={styles.leftDock}>
            <View style={styles.dockTop}>
              <View style={styles.dockLogo}>
                <Wine size={22} color="#ffffff" strokeWidth={2.5} />
              </View>

              <TouchableOpacity style={[styles.dockIconBtn, styles.dockIconBtnActive]}>
                <Zap size={22} color={MAROON.primary} strokeWidth={2.5} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.push({ pathname: "/sell" })}
                style={styles.dockIconBtn}
              >
                <Scan size={22} color="#64748b" strokeWidth={2} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.push("/sales")}
                style={styles.dockIconBtn}
              >
                <ShoppingBag size={22} color="#64748b" strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <View style={styles.dockBottom}>
              <TouchableOpacity onPress={() => onRefresh()} style={styles.dockIconBtn}>
                <RotateCcw size={20} color="#64748b" strokeWidth={2} />
              </TouchableOpacity>

              <TouchableOpacity onPress={handleSignOut} style={styles.dockIconBtn}>
                <LogOut size={20} color="#ef4444" strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── 2. CENTER CATALOG AREA ─────────────────────────────────────────── */}
        <View style={styles.centerCatalog}>
          {/* ── HIGH-VISIBILITY PORTION MODE SEGMENTED BAR ───────────────────── */}
          <View style={styles.portionSegmentOuter}>
            <Text style={styles.portionSectionLabel}>SELECT SERVING PORTION</Text>
            <View style={styles.portionSegmentContainer}>
              <TouchableOpacity
                onPress={() => setSalesTypeMode("glass")}
                style={[
                  styles.portionSegmentBtn,
                  salesTypeMode === "glass" && styles.portionSegmentBtnActive,
                ]}
                activeOpacity={0.85}
              >
                <Text style={styles.portionSegmentIcon}>🍷</Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.portionSegmentTitle,
                      salesTypeMode === "glass" && styles.portionSegmentTitleActive,
                    ]}
                  >
                    By the Glass
                  </Text>
                  <Text
                    style={[
                      styles.portionSegmentSub,
                      salesTypeMode === "glass" && styles.portionSegmentSubActive,
                    ]}
                  >
                    1/6 Pour · Open First
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setSalesTypeMode("bottle")}
                style={[
                  styles.portionSegmentBtn,
                  salesTypeMode === "bottle" && styles.portionSegmentBtnActive,
                ]}
                activeOpacity={0.85}
              >
                <Text style={styles.portionSegmentIcon}>🍾</Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.portionSegmentTitle,
                      salesTypeMode === "bottle" && styles.portionSegmentTitleActive,
                    ]}
                  >
                    Full Bottle
                  </Text>
                  <Text
                    style={[
                      styles.portionSegmentSub,
                      salesTypeMode === "bottle" && styles.portionSegmentSubActive,
                    ]}
                  >
                    Cellar Stock
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setSalesTypeMode("carafe")}
                style={[
                  styles.portionSegmentBtn,
                  salesTypeMode === "carafe" && styles.portionSegmentBtnActive,
                ]}
                activeOpacity={0.85}
              >
                <Text style={styles.portionSegmentIcon}>🫗</Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.portionSegmentTitle,
                      salesTypeMode === "carafe" && styles.portionSegmentTitleActive,
                    ]}
                  >
                    Carafe
                  </Text>
                  <Text
                    style={[
                      styles.portionSegmentSub,
                      salesTypeMode === "carafe" && styles.portionSegmentSubActive,
                    ]}
                  >
                    2/6 Decanter
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* Active Mode Explanation Strip */}
          <View style={styles.activeModeStrip}>
            <Info size={14} color={MAROON.primary} />
            <Text style={styles.activeModeStripText}>
              {salesTypeMode === "glass"
                ? "Glass Pour Mode Active: Tapping '+ Glass' pours 1/6 btl (open bottles prioritized first)."
                : salesTypeMode === "carafe"
                  ? "Carafe Mode Active: Tapping '+ Carafe' pours 2/6 btl into a serving decanter."
                  : "Full Bottle Mode Active: Tapping '+ Bottle' dispenses 1 sealed bottle from cellar inventory."}
            </Text>
          </View>

          {/* Search & Filter Bar */}
          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <Search size={18} color="#94a3b8" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search wines by name, vintage, producer..."
                placeholderTextColor="#94a3b8"
                value={searchQuery}
                onChangeText={setSearchQuery}
                clearButtonMode="while-editing"
              />
              {searchQuery.length > 0 && Platform.OS !== "ios" && (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <X size={16} color="#94a3b8" />
                </TouchableOpacity>
              )}
            </View>

            {isTabletLandscape && (
              <TouchableOpacity
                onPress={() => router.push({ pathname: "/sell" })}
                style={styles.filterBtn}
              >
                <SlidersHorizontal size={18} color={MAROON.primary} />
              </TouchableOpacity>
            )}
          </View>



          {/* ── WINE TYPE CATEGORY PILLS ──────────────────────────────────── */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryPillsScroll}
            style={{ marginHorizontal: -16, marginBottom: 10, height: 44, flexGrow: 0, flexShrink: 0 }}
          >
            {([
              { key: "all", label: "All Wines", emoji: "🍷", activeBg: MAROON.primary, activeText: "#ffffff", activeBorder: MAROON.primary },
              { key: "Red Wine", label: "Red", emoji: "🍷", activeBg: "#4c0519", activeText: "#ffffff", activeBorder: "#9f1239" },
              { key: "White Wine", label: "White", emoji: "🥂", activeBg: "#b45309", activeText: "#ffffff", activeBorder: "#d97706" },
              { key: "Sparkling", label: "Sparkling", emoji: "🍾", activeBg: "#a16207", activeText: "#ffffff", activeBorder: "#ca8a04" },
              { key: "Rosé", label: "Rosé", emoji: "🌸", activeBg: "#be123c", activeText: "#ffffff", activeBorder: "#f43f5e" },
              { key: "Dessert & Fortified", label: "Dessert", emoji: "✨", activeBg: "#7e22ce", activeText: "#ffffff", activeBorder: "#a855f7" },
            ] as const).map((pill) => {
              const count = wineTypeCounts[pill.key] ?? 0;
              if (pill.key !== "all" && count === 0) return null;
              const isActive = wineTypeFilter === pill.key;
              return (
                <TouchableOpacity
                  key={pill.key}
                  onPress={() => setWineTypeFilter(pill.key)}
                  style={[
                    styles.categoryPill,
                    isActive
                      ? { backgroundColor: pill.activeBg, borderColor: pill.activeBorder }
                      : styles.categoryPillInactive,
                  ]}
                  activeOpacity={0.8}
                >
                  <Text style={styles.categoryPillEmoji}>{pill.emoji}</Text>
                  <Text
                    style={[
                      styles.categoryPillText,
                      isActive ? { color: pill.activeText, fontWeight: "900" } : {},
                    ]}
                  >
                    {pill.label}
                  </Text>
                  <View
                    style={[
                      styles.categoryPillBadge,
                      { backgroundColor: isActive ? "rgba(255,255,255,0.25)" : MAROON.ultraLight },
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryPillBadgeText,
                        { color: isActive ? "#ffffff" : MAROON.primary },
                      ]}
                    >
                      {count}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Oversized Cards Grid (Count Focused) */}
          {loading && !refreshing ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color={MAROON.primary} />
              <Text style={styles.loadingText}>Loading inventory...</Text>
            </View>
          ) : filteredWines.length === 0 ? (
            <View style={styles.emptyCatalog}>
              <Wine size={56} color="#cbd5e1" strokeWidth={1.5} />
              <Text style={styles.emptyCatalogTitle}>No items found</Text>
              <Text style={styles.emptyCatalogSub}>
                {searchQuery
                  ? `No wines matching "${searchQuery}"`
                  : "No inventory available in this category."}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredWines}
              keyExtractor={(item) => item.id}
              numColumns={isTabletLandscape ? 3 : 2}
              key={isTabletLandscape ? "grid-3-landscape" : "grid-2-portrait"}
              contentContainerStyle={[
                styles.cardsGridContent,
                !isTabletLandscape && currentOrder.length > 0 && { paddingBottom: 110 },
              ]}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={[MAROON.primary]}
                  tintColor={MAROON.primary}
                />
              }
              renderItem={({ item }) => {
                const typeTheme = getWineTypeTheme(item.wineType);
                const hasOpen = Boolean(item.openBottle);
                const openGlasses = item.openBottle?.glassesRemaining ?? 0;
                const isLow = item.stockCount <= 3;

                const portionActionLabel =
                  salesTypeMode === "glass"
                    ? "Glass"
                    : salesTypeMode === "carafe"
                      ? "Carafe"
                      : "Bottle";

                // Fixed square card size
                const cols = isTabletLandscape ? 3 : 2;
                const catalogPad = 32; // 16px each side
                const dockW = isTabletLandscape ? 68 : 0;
                const panelW = isTabletLandscape ? 360 : 0;
                const cardGap = 10;
                const totalGap = cardGap * (cols + 1);
                const cardSize = Math.floor((width - dockW - panelW - catalogPad - totalGap) / cols);

                return (
                  <View style={[styles.oversizedCard, { width: cardSize }]}>
                    {/* Top Visual Box */}
                    <View style={[styles.cardVisualBox, { backgroundColor: typeTheme.bg }]}>
                      {/* Open Bottle Pill */}
                      {hasOpen && salesTypeMode === "glass" ? (
                        <View style={styles.openBottleGlowPill}>
                          <Text style={styles.openBottleGlowText}>
                            🍾 {openGlasses}/6 gls open
                          </Text>
                        </View>
                      ) : (
                        <View style={[styles.wineTypeBadge, { backgroundColor: "#ffffff" }]}>
                          <Text style={[styles.wineTypeBadgeText, { color: typeTheme.accent }]}>
                            {typeTheme.tag}
                          </Text>
                        </View>
                      )}

                      {/* Vintage Badge */}
                      {item.vintage ? (
                        <View style={styles.vintagePill}>
                          <Text style={styles.vintagePillText}>{item.vintage}</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Card Content */}
                    <View style={styles.cardInfo}>
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {item.name}
                      </Text>
                      <Text style={styles.cardProducer} numberOfLines={1}>
                        {item.producer || "Boutique Selection"} · {item.format || "75cl"}
                      </Text>
                    </View>

                    {/* Card Bottom: Stock Count Badge + Explicit Action Button */}
                    <View style={styles.cardBottomRow}>
                      <View style={{ flex: 1, paddingRight: 6 }}>
                        {salesTypeMode === "glass" ? (
                          hasOpen ? (
                            <View>
                              <Text style={[styles.stockHighlightText, { color: MAROON.primary }]}>
                                {openGlasses} gls left
                              </Text>
                              <Text style={styles.stockSubText}>
                                {item.stockCount} btls in cellar
                              </Text>
                            </View>
                          ) : (
                            <View>
                              <Text style={[styles.stockHighlightText, { color: isLow ? MAROON.accentGold : "#18181b" }]}>
                                {item.stockCount} btls
                              </Text>
                              <Text style={styles.stockSubText}>
                                6 glasses / bottle
                              </Text>
                            </View>
                          )
                        ) : salesTypeMode === "carafe" ? (
                          <View>
                            <Text style={[styles.stockHighlightText, { color: isLow ? MAROON.accentGold : "#18181b" }]}>
                              {item.stockCount} btls
                            </Text>
                            <Text style={styles.stockSubText}>
                              3 carafes / bottle
                            </Text>
                          </View>
                        ) : (
                          <View>
                            <Text style={[styles.stockHighlightText, { color: isLow ? MAROON.accentGold : "#18181b" }]}>
                              {item.stockCount} btls
                            </Text>
                            <Text style={styles.stockSubText}>
                              {isLow ? "⚠️ Low stock" : "available"}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Explicit Action Button with Portion Label */}
                      <TouchableOpacity
                        onPress={() => addToOrder(item)}
                        style={styles.cardActionBtn}
                        activeOpacity={0.8}
                      >
                        <Plus size={15} color="#ffffff" strokeWidth={3} />
                        <Text style={styles.cardActionBtnText}>{portionActionLabel}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }}
            />
          )}

          {/* ── PORTRAIT BOTTOM ORDER BAR (Sticky Maroon Bar when order has items) ─── */}
          {!isTabletLandscape && currentOrder.length > 0 && (
            <TouchableOpacity
              onPress={() => setIsMobileCartOpen(true)}
              style={styles.portraitFloatingOrderBar}
              activeOpacity={0.92}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={styles.portraitOrderCountBadge}>
                  <Text style={styles.portraitOrderCountText}>{orderSummary.totalItems}</Text>
                </View>
                <View>
                  <Text style={styles.portraitOrderBarLabel}>Current Service</Text>
                  <Text style={styles.portraitOrderBarPreview} numberOfLines={1}>
                    {currentOrder.map((it) => `${it.quantity}x ${it.wine.name}`).join(", ")}
                  </Text>
                </View>
              </View>

              <View style={styles.portraitOrderBarRight}>
                <Text style={styles.portraitOrderBarTotal}>
                  {orderSummary.totalBottlesVolume} btl{orderSummary.totalBottlesVolume !== 1 ? "s" : ""}
                </Text>
                <View style={styles.portraitOrderPayBtn}>
                  <Text style={styles.portraitOrderPayBtnText}>Review Queue</Text>
                  <ChevronRight size={16} color="#ffffff" />
                </View>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* ── 3. RIGHT FIXED PANEL (Only in Landscape on Tablet) ─────────────── */}
        {isTabletLandscape && renderCurrentOrderPanel()}
      </View>

      {/* ── PORTRAIT FULL-SCREEN ORDER MODAL / DRAWER ──────────────────────── */}
      {!isTabletLandscape && (
        <Modal
          visible={isMobileCartOpen}
          animationType="slide"
          transparent
          onRequestClose={() => setIsMobileCartOpen(false)}
        >
          <View style={styles.mobileModalOverlay}>
            <View style={styles.mobileModalCard}>
              <TouchableOpacity
                onPress={() => setIsMobileCartOpen(false)}
                style={styles.mobileModalCloseBtn}
              >
                <X size={20} color="#18181b" />
              </TouchableOpacity>
              {renderCurrentOrderPanel()}
            </View>
          </View>
        </Modal>
      )}

      {/* ── Transaction Success Confirmation Dialog ─────────────────────────── */}
      <Modal
        visible={Boolean(successData)}
        transparent
        animationType="fade"
        onRequestClose={() => setSuccessData(null)}
      >
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            <View style={styles.successIconCircle}>
              <CheckCircle2 size={44} color="#059669" strokeWidth={2.5} />
            </View>

            <Text style={styles.successTitle}>Service Logged!</Text>
            <Text style={styles.successSub}>
              {successData?.itemsCount} item(s) dispensed and inventory deducted.
            </Text>

            <View style={styles.successSummary}>
              <View style={styles.successRow}>
                <Text style={styles.successLabel}>Total Volume Served:</Text>
                <Text style={styles.successValue}>
                  {successData?.totalBottlesVolume} bottle{successData?.totalBottlesVolume !== 1 ? "s" : ""}
                </Text>
              </View>

              <View style={styles.successRow}>
                <Text style={styles.successLabel}>Logged By Staff:</Text>
                <Text style={styles.successText}>{successData?.staffName}</Text>
              </View>

              {parAlerts.length > 0 && (
                <View style={styles.parAlertBox}>
                  <AlertCircle size={14} color={MAROON.accentGold} />
                  <Text style={styles.parAlertText}>
                    {parAlerts.length} auto-requisition(s) generated for depleted cellar stock.
                  </Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              onPress={() => setSuccessData(null)}
              style={styles.successBtn}
              activeOpacity={0.85}
            >
              <Text style={styles.successBtnText}>Done / Next Service</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* ── PORTION-PICKER GATE MODAL ────────────────────────────────────────── */}
      <Modal
        visible={showPortionModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => { }}
      >
        <View style={styles.gateOverlay}>
          <BlurView intensity={80} tint="systemMaterialDark" style={StyleSheet.absoluteFill} />

          {/* Card */}
          <View style={styles.gateCard}>
            {/* Header */}
            <View style={styles.gateCardHeader}>
              <View style={styles.gateLogoCircle}>
                <Wine size={26} color="#ffffff" strokeWidth={2.5} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.gateTitle}>How are you serving?</Text>
                <Text style={styles.gateSub}>
                  Choose the serving portion to start this service session
                </Text>
              </View>
            </View>

            {/* Store Info Strip */}
            <View style={styles.gateStoreStrip}>
              <View style={styles.onlineDot} />
              <Text style={styles.gateStoreText}>
                {storeName} · {selectedStaff?.displayName || profile?.email?.split("@")[0] || "Staff"} on duty
              </Text>
            </View>

            {/* Portion Options */}
            <View style={styles.gateOptions}>
              {/* Glass */}
              <TouchableOpacity
                onPress={() => selectPortion("glass")}
                style={styles.gateOptionCard}
                activeOpacity={0.82}
              >
                <View style={[styles.gateOptionIconBox, { backgroundColor: "#fff1f2" }]}>
                  <Text style={styles.gateOptionEmoji}>🍷</Text>
                </View>
                <View style={styles.gateOptionBody}>
                  <Text style={styles.gateOptionTitle}>By the Glass</Text>
                  <Text style={styles.gateOptionDesc}>1/6 of a bottle per serve · Open bottles prioritised</Text>
                </View>
                <View style={[styles.gateOptionChevron, { backgroundColor: MAROON.ultraLight }]}>
                  <ChevronRight size={18} color={MAROON.primary} strokeWidth={2.5} />
                </View>
              </TouchableOpacity>

              {/* Carafe */}
              <TouchableOpacity
                onPress={() => selectPortion("carafe")}
                style={styles.gateOptionCard}
                activeOpacity={0.82}
              >
                <View style={[styles.gateOptionIconBox, { backgroundColor: "#fef3c7" }]}>
                  <Text style={styles.gateOptionEmoji}>🫗</Text>
                </View>
                <View style={styles.gateOptionBody}>
                  <Text style={styles.gateOptionTitle}>Carafe</Text>
                  <Text style={styles.gateOptionDesc}>2/6 of a bottle per serve · Decanter pouring</Text>
                </View>
                <View style={[styles.gateOptionChevron, { backgroundColor: "#fffbeb" }]}>
                  <ChevronRight size={18} color="#b45309" strokeWidth={2.5} />
                </View>
              </TouchableOpacity>

              {/* Bottle */}
              <TouchableOpacity
                onPress={() => selectPortion("bottle")}
                style={styles.gateOptionCard}
                activeOpacity={0.82}
              >
                <View style={[styles.gateOptionIconBox, { backgroundColor: "#f0fdf4" }]}>
                  <Text style={styles.gateOptionEmoji}>🍾</Text>
                </View>
                <View style={styles.gateOptionBody}>
                  <Text style={styles.gateOptionTitle}>Full Bottle</Text>
                  <Text style={styles.gateOptionDesc}>Sealed bottle from cellar · Full bottle dispense</Text>
                </View>
                <View style={[styles.gateOptionChevron, { backgroundColor: "#f0fdf4" }]}>
                  <ChevronRight size={18} color="#16a34a" strokeWidth={2.5} />
                </View>
              </TouchableOpacity>
            </View>

            {/* Footer note */}
            <View style={styles.gateFooterNote}>
              <Info size={12} color="#94a3b8" />
              <Text style={styles.gateFooterNoteText}>
                You can switch the serving mode at any time from the portion selector in the terminal.
              </Text>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fdfcf8",
  },
  mainLayoutRow: {
    flex: 1,
    flexDirection: "row",
  },

  // PORTRAIT TOP BAR
  portraitTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  portraitBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  portraitLogoCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: MAROON.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  portraitStoreTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#18181b",
  },
  portraitStaffRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 1,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10b981",
  },
  portraitStaffName: {
    fontSize: 11,
    fontWeight: "600",
    color: "#71717a",
  },
  portraitActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  portraitScanBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: MAROON.ultraLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: MAROON.border,
  },
  portraitScanBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: MAROON.primary,
  },
  portraitIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },

  // LEFT DOCK (Landscape)
  leftDock: {
    width: 68,
    backgroundColor: "#ffffff",
    borderRightWidth: 1,
    borderRightColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 18,
  },
  dockTop: {
    alignItems: "center",
    gap: 16,
  },
  dockLogo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: MAROON.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  dockIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  dockIconBtnActive: {
    backgroundColor: MAROON.light,
  },
  dockBottom: {
    alignItems: "center",
    gap: 12,
  },

  // CENTER CATALOG AREA
  centerCatalog: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },

  // ── HIGH VISIBILITY PORTION MODE SELECTOR ──
  portionSegmentOuter: {
    marginBottom: 10,
  },
  portionSectionLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: MAROON.medium,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  portionSegmentContainer: {
    flexDirection: "row",
    gap: 8,
  },
  portionSegmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  portionSegmentBtnActive: {
    backgroundColor: MAROON.primary,
    borderColor: MAROON.primary,
    elevation: 4,
    shadowColor: MAROON.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  portionSegmentIcon: {
    fontSize: 22,
  },
  portionSegmentTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#18181b",
  },
  portionSegmentTitleActive: {
    color: "#ffffff",
  },
  portionSegmentSub: {
    fontSize: 10,
    fontWeight: "600",
    color: "#64748b",
    marginTop: 1,
  },
  portionSegmentSubActive: {
    color: "#fecdd3",
  },

  // Active Mode Strip
  activeModeStrip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: MAROON.ultraLight,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: MAROON.border,
  },
  activeModeStripText: {
    fontSize: 11,
    fontWeight: "700",
    color: MAROON.primary,
    flex: 1,
  },

  // Search & Filter
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#18181b",
    padding: 0,
  },
  filterBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },

  // Category Pills
  categoryPillsScroll: {
    gap: 8,
    paddingBottom: 2,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  categoryPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    gap: 5,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  categoryPillActive: {
    backgroundColor: MAROON.primary,
    borderColor: MAROON.primary,
  },
  categoryPillInactive: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
  },
  categoryPillEmoji: {
    fontSize: 13,
  },
  categoryPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#52525b",
  },
  categoryPillTextActive: {
    color: "#ffffff",
    fontWeight: "900",
  },
  categoryPillBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryPillBadgeText: {
    fontSize: 10,
    fontWeight: "900",
  },

  // Oversized Cards Grid
  cardsGridContent: {
    paddingBottom: 80,
  },
  oversizedCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 10,
    margin: 5,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  cardVisualBox: {
    height: 90,
    borderRadius: 10,
    position: "relative",
    marginBottom: 10,
  },
  openBottleGlowPill: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: MAROON.primary,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  openBottleGlowText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#ffffff",
  },
  wineTypeBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  wineTypeBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  vintagePill: {
    position: "absolute",
    bottom: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  vintagePillText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#ffffff",
  },
  cardInfo: {
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#18181b",
    lineHeight: 18,
  },
  cardProducer: {
    fontSize: 11,
    fontWeight: "600",
    color: "#71717a",
    marginTop: 2,
  },
  cardBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
  },
  stockHighlightText: {
    fontSize: 14,
    fontWeight: "900",
  },
  stockSubText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#94a3b8",
    marginTop: 1,
  },
  cardActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: MAROON.primary,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    gap: 3,
    elevation: 2,
    shadowColor: MAROON.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  cardActionBtnText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#ffffff",
  },

  // RIGHT PANEL (Landscape)
  orderPanel: {
    width: 360,
    borderLeftWidth: 1,
    borderLeftColor: "#e2e8f0",
    padding: 18,
    justifyContent: "space-between",
    height: "100%",
  },
  orderPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  orderPanelTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: MAROON.primary,
    letterSpacing: -0.5,
  },
  orderPanelSubTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: "#71717a",
    marginTop: 1,
  },
  staffHeaderChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: MAROON.ultraLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    maxWidth: 150,
    borderWidth: 1,
    borderColor: MAROON.border,
  },
  staffAvatarCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: MAROON.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  staffAvatarInitial: {
    fontSize: 11,
    fontWeight: "900",
    color: "#ffffff",
  },
  staffHeaderName: {
    fontSize: 12,
    fontWeight: "700",
    color: MAROON.primary,
  },
  staffDropdownMenu: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: MAROON.border,
    padding: 6,
    marginBottom: 10,
    elevation: 4,
    shadowColor: MAROON.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  staffDropdownOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  staffDropdownOptionText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#52525b",
  },
  orderItemsList: {
    flex: 1,
    marginVertical: 6,
  },
  emptyCartBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyCartTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#18181b",
    marginTop: 10,
  },
  emptyCartSub: {
    fontSize: 12,
    color: "#71717a",
    textAlign: "center",
    marginTop: 4,
    paddingHorizontal: 20,
  },
  orderItemCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fcfcfd",
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  itemThumbnail: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbnailDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  orderItemName: {
    fontSize: 13,
    fontWeight: "800",
    color: "#18181b",
  },
  orderItemPortionBadge: {
    alignSelf: "flex-start",
    backgroundColor: MAROON.ultraLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 2,
  },
  orderItemPortionText: {
    fontSize: 10,
    fontWeight: "700",
    color: MAROON.primary,
  },
  orderItemStockNote: {
    fontSize: 10,
    color: "#94a3b8",
    marginTop: 2,
  },
  stepperContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepperBtnMinus: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#94a3b8",
    alignItems: "center",
    justifyContent: "center",
  },
  stepperBtnPlus: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: MAROON.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperQtyText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#18181b",
    minWidth: 16,
    textAlign: "center",
  },
  orderFooter: {
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 12,
  },
  countSummaryCard: {
    backgroundColor: MAROON.ultraLight,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: MAROON.border,
  },
  calcRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  calcLabel: {
    fontSize: 12,
    color: "#71717a",
    fontWeight: "600",
  },
  calcValue: {
    fontSize: 12,
    fontWeight: "800",
    color: "#18181b",
  },
  calcDivider: {
    height: 1,
    backgroundColor: MAROON.border,
    marginVertical: 4,
  },
  calcTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  calcTotalLabel: {
    fontSize: 13,
    fontWeight: "900",
    color: MAROON.primary,
  },
  calcTotalValue: {
    fontSize: 16,
    fontWeight: "900",
    color: MAROON.primary,
  },
  checkoutBtn: {
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: MAROON.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  checkoutBtnText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#ffffff",
  },

  // PORTRAIT STICKY ORDER TRAY (Dark Maroon)
  portraitFloatingOrderBar: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: MAROON.dark,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    elevation: 10,
    shadowColor: MAROON.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  portraitOrderCountBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: MAROON.medium,
    alignItems: "center",
    justifyContent: "center",
  },
  portraitOrderCountText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#ffffff",
  },
  portraitOrderBarLabel: {
    fontSize: 14,
    fontWeight: "900",
    color: "#ffffff",
  },
  portraitOrderBarPreview: {
    fontSize: 11,
    color: "#fecdd3",
    maxWidth: 160,
  },
  portraitOrderBarRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  portraitOrderBarTotal: {
    fontSize: 15,
    fontWeight: "900",
    color: "#ffffff",
  },
  portraitOrderPayBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: MAROON.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: "#9f1239",
  },
  portraitOrderPayBtnText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#ffffff",
  },

  // Mobile Drawer Modal
  mobileModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  mobileModalCard: {
    height: "85%",
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },
  mobileModalCloseBtn: {
    position: "absolute",
    top: 14,
    right: 14,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: MAROON.ultraLight,
    alignItems: "center",
    justifyContent: "center",
  },

  // Loading & Empty
  centerLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 14,
    fontWeight: "700",
    color: MAROON.medium,
    marginTop: 12,
  },
  emptyCatalog: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyCatalogTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: MAROON.primary,
    marginTop: 12,
  },
  emptyCatalogSub: {
    fontSize: 13,
    color: "#71717a",
    textAlign: "center",
    marginTop: 4,
    maxWidth: 240,
  },

  // Success Modal
  successOverlay: {
    flex: 1,
    backgroundColor: "rgba(56, 3, 17, 0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  successCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    elevation: 8,
    shadowColor: MAROON.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  successIconCircle: {
    width: 68,
    height: 64,
    borderRadius: 34,
    backgroundColor: "#d1fae5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: MAROON.primary,
  },
  successSub: {
    fontSize: 13,
    color: "#71717a",
    textAlign: "center",
    marginTop: 4,
  },
  successSummary: {
    width: "100%",
    backgroundColor: MAROON.ultraLight,
    borderRadius: 16,
    padding: 14,
    marginVertical: 18,
    gap: 8,
    borderWidth: 1,
    borderColor: MAROON.border,
  },
  successRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  successLabel: {
    fontSize: 13,
    color: "#71717a",
    fontWeight: "600",
  },
  successValue: {
    fontSize: 16,
    fontWeight: "900",
    color: MAROON.primary,
  },
  successText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#18181b",
  },
  parAlertBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fef3c7",
    padding: 8,
    borderRadius: 8,
    marginTop: 4,
  },
  parAlertText: {
    fontSize: 11,
    color: MAROON.accentGold,
    fontWeight: "700",
    flex: 1,
  },
  successBtn: {
    width: "100%",
    backgroundColor: MAROON.primary,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  successBtnText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#ffffff",
  },

  // ── PORTION GATE MODAL ──────────────────────────────────────────────────────
  gateOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  gateCard: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: "#ffffff",
    borderRadius: 28,
    padding: 22,
    elevation: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.35,
    shadowRadius: 28,
  },
  gateCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 12,
  },
  gateLogoCircle: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: MAROON.primary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  gateTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#18181b",
    letterSpacing: -0.4,
  },
  gateSub: {
    fontSize: 12,
    fontWeight: "600",
    color: "#71717a",
    marginTop: 2,
  },
  gateStoreStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: MAROON.ultraLight,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: MAROON.border,
  },
  gateStoreText: {
    fontSize: 12,
    fontWeight: "700",
    color: MAROON.primary,
  },
  gateOptions: {
    gap: 10,
    marginBottom: 16,
  },
  gateOptionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fafafa",
    borderRadius: 18,
    padding: 14,
    gap: 12,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
  },
  gateOptionIconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  gateOptionEmoji: {
    fontSize: 26,
  },
  gateOptionBody: {
    flex: 1,
  },
  gateOptionTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#18181b",
  },
  gateOptionDesc: {
    fontSize: 11,
    fontWeight: "600",
    color: "#71717a",
    marginTop: 2,
    lineHeight: 15,
  },
  gateOptionChevron: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  gateFooterNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingTop: 4,
  },
  gateFooterNoteText: {
    fontSize: 11,
    color: "#94a3b8",
    fontWeight: "600",
    flex: 1,
    lineHeight: 15,
  },
});
