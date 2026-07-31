import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { fetchStoreStaff, AppUser } from "@/lib/queries/users";
import { Stack, useRouter } from "expo-router";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  Grid,
  RotateCcw,
  Search,
  UserCheck,
  Wine,
  Zap,
} from "lucide-react-native";
import React, { useEffect, useState, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface FastWineItem {
  id: string;
  name: string;
  vintage?: string;
  producer?: string;
  format?: string;
  price?: number; // Base cost price
  sellingPrice?: number | null;
  glassPrice?: number | null;
  carafePrice?: number | null;
  wineCategory?: string | null;
  vatMode?: "included" | "excluded";
  stockCount: number;
  availableBottleIds: string[];
  openBottle?: {
    id: string;
    glassesRemaining: number;
  } | null;
}

type PortionType = "glass" | "carafe" | "bottle";

const VAT_RATE = 0.12;

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export default function POSScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const theme = profile?.role === "admin" ? Colors.admin : profile?.role === "store" ? Colors.store : Colors.warehouse;

  const storeId = profile?.locationId || null;

  // Data States
  const [staffList, setStaffList] = useState<AppUser[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<AppUser | null>(null);
  const [fastWines, setFastWines] = useState<FastWineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"fast" | "all">("fast");

  // Selection & Sale State
  const [activeWine, setActiveWine] = useState<FastWineItem | null>(null);
  const [activePortion, setActivePortion] = useState<PortionType>("glass");
  const [isProcessing, setIsProcessing] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [parAlertInfo, setParAlertInfo] = useState<{
    wineName: string;
    stockCount: number;
    requestedQty: number;
  } | null>(null);

  // Load staff & inventory data
  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Staff
      const staff = await fetchStoreStaff(storeId);
      setStaffList(staff);
      // Default to matching active profile user or first staff member
      const activeUserInStaff = staff.find((u) => u.id === profile?.id) || staff[0] || {
        id: profile?.id || "unknown",
        displayName: profile?.displayName || profile?.email?.split("@")[0] || "Staff",
        email: profile?.email,
      };
      setSelectedStaff(activeUserInStaff);

      // 2. Fetch Master Wines, Stock Settings, & Available Bottles
      const [winesData, settingsData, bottlesData] = await Promise.all([
        apiFetch("/wines"),
        storeId ? apiFetch(`/stock-settings?storeId=${storeId}`) : Promise.resolve([]),
        storeId ? apiFetch(`/bottles?storeId=${storeId}&status=received,shelved,open`) : Promise.resolve([]),
      ]);

      const allWines: any[] = Array.isArray(winesData) ? winesData : Array.isArray(winesData.wines) ? winesData.wines : [];
      const settingsList: any[] = Array.isArray(settingsData) ? settingsData : Array.isArray(settingsData.settings) ? settingsData.settings : [];
      const bottlesList: any[] = Array.isArray(bottlesData) ? bottlesData : Array.isArray(bottlesData.bottles) ? bottlesData.bottles : [];

      const settingsMap = new Map<string, any>();
      settingsList.forEach((s) => settingsMap.set(s.masterWineId, s));

      // Group bottles by masterWineId
      const bottlesByWine = new Map<string, any[]>();
      const openBottleByWine = new Map<string, any>();

      bottlesList.forEach((b) => {
        const wId = b.masterWineId || b.masterWineRef?.id;
        if (!wId) return;

        if (!bottlesByWine.has(wId)) bottlesByWine.set(wId, []);
        bottlesByWine.get(wId)!.push(b);

        if (b.status === "open" && (!openBottleByWine.has(wId) || (b.glassesRemaining ?? 0) > (openBottleByWine.get(wId)?.glassesRemaining ?? 0))) {
          openBottleByWine.set(wId, b);
        }
      });

      const fastWineItems: FastWineItem[] = allWines
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
            price: mw.price,
            sellingPrice: setting?.sellingPrice ?? null,
            glassPrice: setting?.glassPrice ?? null,
            carafePrice: setting?.carafePrice ?? setting?.karafPrice ?? null,
            wineCategory: setting?.wineCategory ?? null,
            vatMode: setting?.vatMode ?? "excluded",
            stockCount: wineBottles.length,
            availableBottleIds: wineBottles.map((b: any) => b.id),
            openBottle: openB ? { id: openB.id, glassesRemaining: openB.glassesRemaining ?? 6 } : null,
          };
        })
        .filter((w) => w.stockCount > 0);

      setFastWines(fastWineItems);
    } catch (error) {
      console.error("[POS Mode] Data load error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [storeId]);

  // Filtered wines
  const displayedWines = useMemo(() => {
    let result = fastWines;
    if (categoryFilter === "fast") {
      result = result.filter((w) => w.wineCategory === "fast");
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (w) =>
          w.name.toLowerCase().includes(q) ||
          (w.producer && w.producer.toLowerCase().includes(q)) ||
          (w.vintage && w.vintage.toLowerCase().includes(q))
      );
    }
    return result;
  }, [fastWines, categoryFilter, searchQuery]);

  // Calculate Price to Use for active selection
  const getPortionPrice = (wine: FastWineItem, portion: PortionType): number => {
    if (portion === "glass" && wine.glassPrice != null) return wine.glassPrice;
    if (portion === "carafe" && wine.carafePrice != null) return wine.carafePrice;
    if (portion === "bottle" && wine.sellingPrice != null) return wine.sellingPrice;
    return wine.sellingPrice || 0;
  };

  const handleSelectWinePortion = (wine: FastWineItem, portion: PortionType) => {
    setActiveWine(wine);
    setActivePortion(portion);
  };

  // Submit Sale
  const handleCompleteSale = async () => {
    if (!activeWine) return;
    if (activeWine.availableBottleIds.length === 0) {
      Alert.alert("Out of Stock", "No active bottles available for this wine.");
      return;
    }

    setIsProcessing(true);
    setSuccessToast(null);
    setParAlertInfo(null);

    try {
      const numericPrice = getPortionPrice(activeWine, activePortion);
      const isIncluded = activeWine.vatMode === "included";

      let netPrice = numericPrice;
      let vatAmount = numericPrice * VAT_RATE;
      let totalAmount = numericPrice + vatAmount;

      if (isIncluded) {
        netPrice = numericPrice / (1 + VAT_RATE);
        vatAmount = numericPrice - netPrice;
        totalAmount = numericPrice;
      }

      let glassCount = 1.0;
      let glassesDeducted = 6;
      if (activePortion === "glass") {
        glassCount = 0.1667;
        glassesDeducted = 1;
      } else if (activePortion === "carafe") {
        glassCount = 0.3333;
        glassesDeducted = 2;
      }

      // Target open bottle if available for glass/carafe, else first bottle
      let targetBottleId = activeWine.availableBottleIds[0];
      if (activePortion !== "bottle" && activeWine.openBottle) {
        targetBottleId = activeWine.openBottle.id;
      }

      // 1. Record Sale
      await apiFetch("/sales", {
        method: "POST",
        body: JSON.stringify({
          bottleId: targetBottleId,
          masterWineId: activeWine.id,
          wineName: activeWine.name,
          vintage: activeWine.vintage,
          producer: activeWine.producer,
          format: activeWine.format,
          storeId: storeId,
          soldById: selectedStaff?.id || profile?.id,
          soldByEmail: selectedStaff?.email || profile?.email,
          price: netPrice,
          vatAmount,
          totalAmount,
          vatMode: activeWine.vatMode,
          wineCategory: activeWine.wineCategory,
          masterWinePrice: activeWine.price || null,
          saleType: activePortion,
          glassCount,
        }),
      });

      // 2. Update Bottle Status / Glass Deduction
      if (activePortion === "bottle") {
        await apiFetch(`/bottles/${targetBottleId}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "consumed",
            glassesRemaining: 0,
            locationId: null,
          }),
        });
      } else {
        const currentGlasses = activeWine.openBottle?.glassesRemaining ?? 6;
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

      // 3. PAR Alert Check
      if (storeId) {
        try {
          const [settingsRes, countRes] = await Promise.all([
            apiFetch(`/stock-settings?storeId=${storeId}&masterWineId=${activeWine.id}`),
            apiFetch(`/bottles?storeId=${storeId}&masterWineId=${activeWine.id}&status=shelved,received&countOnly=true`),
          ]);
          const settingList: any[] = settingsRes.settings || settingsRes;
          const currentSetting = settingList[0];
          const stockCount = countRes.count ?? 0;

          if (currentSetting && currentSetting.parLevel > 0 && stockCount <= currentSetting.parLevel) {
            const requestedQty = Math.max(1, currentSetting.safetyStock - stockCount);
            await apiFetch("/wine-requests", {
              method: "POST",
              body: JSON.stringify({
                storeId,
                masterWineId: activeWine.id,
                requestedQty,
                urgency: "high",
                notes: `[POS AUTO-REQUEST] PAR alert trigger (${stockCount} left <= PAR ${currentSetting.parLevel})`,
              }),
            });
            setParAlertInfo({
              wineName: activeWine.name,
              stockCount,
              requestedQty,
            });
          }
        } catch (e) {
          console.error("[POS Mode] PAR Alert error:", e);
        }
      }

      // Success Feedback & Reset
      const portionText = activePortion === "glass" ? "Glass 🍷" : activePortion === "carafe" ? "Carafe 🫗" : "Bottle 🍾";
      const staffName = selectedStaff?.displayName || selectedStaff?.email?.split("@")[0] || "Staff";
      setSuccessToast(`${portionText} of ${activeWine.name} sold by ${staffName}!`);

      setActiveWine(null);
      await loadData();
    } catch (error: any) {
      console.error("[POS Mode] Sale error:", error);
      Alert.alert("Sale Failed", error.message || "Failed to process sale.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Top Header ─────────────────────────────────────────────────────── */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <ChevronLeft size={24} color={theme.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Zap size={18} color="#7c3aed" />
            <Text style={[styles.headerTitle, { color: theme.text }]}>POS Terminal</Text>
          </View>
          <Text style={{ fontSize: 11, fontWeight: "600", color: theme.textSecondary }}>
            Fast Wine Quick Sales
          </Text>
        </View>

        <TouchableOpacity onPress={() => loadData()} style={[styles.iconBtn, { backgroundColor: theme.primary + "15" }]}>
          <RotateCcw size={18} color={theme.primary} />
        </TouchableOpacity>
      </View>

      {/* ── Staff Selector Bar ──────────────────────────────────────────────── */}
      <View style={[styles.staffBar, { borderBottomColor: theme.border, backgroundColor: theme.card }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <UserCheck size={14} color={theme.primary} />
          <Text style={{ fontSize: 11, fontWeight: "800", color: theme.primary, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Staff Member:
          </Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {staffList.map((staff) => {
            const isSelected = selectedStaff?.id === staff.id;
            const name = staff.displayName || staff.email?.split("@")[0] || "Staff";
            return (
              <TouchableOpacity
                key={staff.id}
                onPress={() => setSelectedStaff(staff)}
                style={[
                  styles.staffChip,
                  {
                    backgroundColor: isSelected ? theme.primary : theme.background,
                    borderColor: isSelected ? theme.primary : theme.border,
                  },
                ]}
              >
                <View style={[styles.avatarDot, { backgroundColor: isSelected ? "#fff" : theme.primary }]} />
                <Text style={[styles.staffChipText, { color: isSelected ? "#fff" : theme.text }]}>{name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Category & Search Bar ────────────────────────────────────────────── */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={[styles.searchBox, { backgroundColor: theme.card, borderColor: theme.border, flex: 1 }]}>
            <Search size={16} color={theme.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search fast wine..."
              placeholderTextColor={theme.textSecondary + "80"}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          <View style={styles.tabContainer}>
            <TouchableOpacity
              onPress={() => setCategoryFilter("fast")}
              style={[styles.tabBtn, categoryFilter === "fast" && { backgroundColor: theme.primary }]}
            >
              <Zap size={12} color={categoryFilter === "fast" ? "#fff" : theme.textSecondary} />
              <Text style={[styles.tabBtnText, { color: categoryFilter === "fast" ? "#fff" : theme.textSecondary }]}>Fast</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setCategoryFilter("all")}
              style={[styles.tabBtn, categoryFilter === "all" && { backgroundColor: theme.primary }]}
            >
              <Wine size={12} color={categoryFilter === "all" ? "#fff" : theme.textSecondary} />
              <Text style={[styles.tabBtnText, { color: categoryFilter === "all" ? "#fff" : theme.textSecondary }]}>All</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Success Toast */}
        {successToast && (
          <View style={{ backgroundColor: "#dcfce7", borderColor: "#86efac", borderWidth: 1, padding: 10, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <CheckCircle2 size={16} color="#15803d" />
            <Text style={{ fontSize: 12, fontWeight: "700", color: "#15803d", flex: 1 }}>{successToast}</Text>
          </View>
        )}

        {/* PAR Alert Toast */}
        {parAlertInfo && (
          <View style={{ backgroundColor: "#fff7ed", borderColor: "#ea580c", borderWidth: 1.5, padding: 10, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <AlertCircle size={16} color="#ea580c" />
            <Text style={{ fontSize: 11, fontWeight: "600", color: "#9a3412", flex: 1 }}>
              PAR Alert — Auto-requested {parAlertInfo.requestedQty} btl of {parAlertInfo.wineName} ({parAlertInfo.stockCount} left).
            </Text>
          </View>
        )}
      </View>

      {/* ── Wine Card Grid ──────────────────────────────────────────────────── */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : displayedWines.length === 0 ? (
        <View style={styles.centerContainer}>
          <Zap size={48} color={theme.textSecondary + "40"} />
          <Text style={{ fontSize: 15, fontWeight: "700", color: theme.text, marginTop: 12 }}>
            No Fast Wines Found
          </Text>
          <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 4, textAlign: "center" }}>
            {categoryFilter === "fast" ? "No wines are categorized as 'fast' for this store." : "No wines match your search."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={displayedWines}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
          contentContainerStyle={{ paddingVertical: 12, gap: 12, paddingBottom: 120 }}
          renderItem={({ item }) => {
            const isWineSelected = activeWine?.id === item.id;
            return (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.card,
                    borderColor: isWineSelected ? theme.primary : theme.border,
                    borderWidth: isWineSelected ? 2 : 1,
                  },
                ]}
              >
                {/* Header Badge */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <View style={{ backgroundColor: theme.primary + "1A", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                    <Text style={{ fontSize: 10, fontWeight: "800", color: theme.primary }}>
                      {item.stockCount} in stock
                    </Text>
                  </View>
                  {item.openBottle && (
                    <View style={{ backgroundColor: "#f59e0b1A", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                      <Text style={{ fontSize: 9, fontWeight: "800", color: "#d97706" }}>
                        🍷 {item.openBottle.glassesRemaining}/6 open
                      </Text>
                    </View>
                  )}
                </View>

                {/* Wine Info */}
                <Text style={[styles.wineName, { color: theme.text }]} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={{ fontSize: 11, color: theme.textSecondary, marginBottom: 10 }}>
                  {item.vintage || "N/V"} {item.producer ? `• ${item.producer}` : ""}
                </Text>

                {/* Portion Action Buttons */}
                <View style={{ gap: 6 }}>
                  {/* Glass Option */}
                  <TouchableOpacity
                    onPress={() => handleSelectWinePortion(item, "glass")}
                    style={[
                      styles.portionBtn,
                      {
                        backgroundColor: isWineSelected && activePortion === "glass" ? theme.primary : theme.background,
                        borderColor: isWineSelected && activePortion === "glass" ? theme.primary : theme.border,
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 12 }}>🍷</Text>
                    <Text style={[styles.portionBtnLabel, { color: isWineSelected && activePortion === "glass" ? "#fff" : theme.text }]}>
                      Glass
                    </Text>
                    <Text style={[styles.portionBtnPrice, { color: isWineSelected && activePortion === "glass" ? "#fff" : theme.primary }]}>
                      {item.glassPrice != null ? formatCurrency(item.glassPrice) : "N/A"}
                    </Text>
                  </TouchableOpacity>

                  {/* Carafe Option */}
                  <TouchableOpacity
                    onPress={() => handleSelectWinePortion(item, "carafe")}
                    style={[
                      styles.portionBtn,
                      {
                        backgroundColor: isWineSelected && activePortion === "carafe" ? theme.primary : theme.background,
                        borderColor: isWineSelected && activePortion === "carafe" ? theme.primary : theme.border,
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 12 }}>🫗</Text>
                    <Text style={[styles.portionBtnLabel, { color: isWineSelected && activePortion === "carafe" ? "#fff" : theme.text }]}>
                      Carafe
                    </Text>
                    <Text style={[styles.portionBtnPrice, { color: isWineSelected && activePortion === "carafe" ? "#fff" : theme.primary }]}>
                      {item.carafePrice != null ? formatCurrency(item.carafePrice) : "N/A"}
                    </Text>
                  </TouchableOpacity>

                  {/* Bottle Option */}
                  <TouchableOpacity
                    onPress={() => handleSelectWinePortion(item, "bottle")}
                    style={[
                      styles.portionBtn,
                      {
                        backgroundColor: isWineSelected && activePortion === "bottle" ? theme.primary : theme.background,
                        borderColor: isWineSelected && activePortion === "bottle" ? theme.primary : theme.border,
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 12 }}>🍾</Text>
                    <Text style={[styles.portionBtnLabel, { color: isWineSelected && activePortion === "bottle" ? "#fff" : theme.text }]}>
                      Bottle
                    </Text>
                    <Text style={[styles.portionBtnPrice, { color: isWineSelected && activePortion === "bottle" ? "#fff" : theme.primary }]}>
                      {item.sellingPrice != null ? formatCurrency(item.sellingPrice) : "N/A"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* ── Active Selection Confirmation Bar ───────────────────────────────── */}
      {activeWine && (
        <View style={[styles.checkoutBar, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 10, fontWeight: "800", color: theme.primary, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Active Sale • {selectedStaff?.displayName || selectedStaff?.email?.split("@")[0] || "Staff"}
            </Text>
            <Text style={{ fontSize: 14, fontWeight: "700", color: theme.text }} numberOfLines={1}>
              {activeWine.name} ({activePortion === "glass" ? "🍷 Glass" : activePortion === "carafe" ? "🫗 Carafe" : "🍾 Bottle"})
            </Text>
            <Text style={{ fontSize: 16, fontWeight: "800", color: theme.primary, marginTop: 2 }}>
              Total: {formatCurrency(getPortionPrice(activeWine, activePortion))}
            </Text>
          </View>

          <TouchableOpacity
            onPress={handleCompleteSale}
            disabled={isProcessing}
            style={[styles.completeSaleBtn, { backgroundColor: theme.primary }]}
          >
            {isProcessing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={{ fontSize: 14, fontWeight: "800", color: "#fff" }}>COMPLETE SALE</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  staffBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  staffChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  avatarDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  staffChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#00000010",
    borderRadius: 12,
    padding: 3,
    gap: 3,
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    gap: 4,
  },
  tabBtnText: {
    fontSize: 11,
    fontWeight: "800",
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    flex: 1,
    borderRadius: 16,
    padding: 12,
  },
  wineName: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 17,
  },
  portionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
  },
  portionBtnLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
  },
  portionBtnPrice: {
    fontSize: 11,
    fontWeight: "800",
  },
  checkoutBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1.5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 10,
  },
  completeSaleBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
