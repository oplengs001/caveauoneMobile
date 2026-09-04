import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { calculateDashboardSalesMetrics } from "@/lib/utils/salesMath";
import { useResponsivePadding } from "@/hooks/useResponsivePadding";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  Banknote,
  Calendar,
  ChevronLeft,
  Package,
  Receipt,
  RotateCcw,
  Sliders,
  TrendingUp,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface Sale {
  id: string;
  wineName: string;
  producer?: string;
  vintage?: string;
  format?: string;
  bottleId: string;
  readableId?: string;
  price: number; // Selling price (Base)
  totalAmount?: number;
  masterWinePrice?: number; // Added to calculate profit (Cost)
  saleType?: string;
  masterWine?: {
    price?: number;
  };
  soldAt: {
    toDate: () => Date;
  };
  buyerName?: string;
  isVoided?: boolean;
  voidedAt?: Date;
  voidedBy?: string;
  voidedByEmail?: string;
  voidReason?: string;
}

type PeriodType = "all" | "today" | "week" | "month" | "lastMonth" | "custom";

const formatDate = (date: Date | undefined) => {
  if (!date || isNaN(date.getTime())) return "N/A";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    }).format(date);
  } catch (e) {
    return "N/A";
  }
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export default function SalesScreen() {
  const router = useRouter();
  const { horizontalPadding } = useResponsivePadding(16);
  const { profile } = useAuth();
  const theme = profile?.role === "admin" ? Colors.admin : profile?.role === "store" ? Colors.store : Colors.warehouse;

  // Catch the period and store parameters
  const { period: passedPeriod, storeId: passedStoreId, storeName: passedStoreName } = useLocalSearchParams<{
    period?: string;
    storeId?: string;
    storeName?: string;
  }>();

  const activeStoreId = (passedStoreId as string) || profile?.locationId || null;
  const activeStoreName = (passedStoreName as string) || null;

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [cacheToast, setCacheToast] = useState<string | null>(null);
  const [isFilterModalVisible, setFilterModalVisible] = useState(false);

  // Aggregate state
  const [aggregates, setAggregates] = useState({
    totalBaseSales: 0,
    totalGrossSales: 0,
    totalCost: 0,
    totalBottles: 0,
    totalVoidedCount: 0,
    totalVoidedAmount: 0,
    categoryCounts: { fun: 0, fine: 0, reserve: 0, standard: 0 },
    portionCounts: { bottle: 0, glass: 0, carafe: 0 },
  });

  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "voided">("all");

  // Initialize the state with the passed parameter, or default to "all"
  const [period, setPeriod] = useState<PeriodType>(
    (passedPeriod as PeriodType) || "all",
  );

  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const fetchSales = async (forceNoCache = false) => {
    if (period === "custom" && !customStart) return;

    if (forceNoCache) {
      setIsClearingCache(true);
    } else {
      setLoading(true);
    }

    try {
      let startDate: Date | null = null;
      let endDate: Date | null = null;
      const now = new Date();

      if (period === "today") {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (period === "week") {
        startDate = new Date();
        startDate.setDate(startDate.getDate() - startDate.getDay());
        startDate.setHours(0, 0, 0, 0);
      } else if (period === "month") {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (period === "lastMonth") {
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      } else if (period === "custom") {
        startDate = customStart ? new Date(customStart) : null;
        if (startDate) startDate.setHours(0, 0, 0, 0);
        endDate = customEnd ? new Date(customEnd) : null;
        if (endDate) endDate.setHours(23, 59, 59, 999);
      }

      const params = new URLSearchParams();
      if (activeStoreId) params.set("storeId", activeStoreId);
      params.set("includeVoided", "true");
      if (startDate) params.set("from", startDate.toISOString());
      if (endDate) params.set("to", endDate.toISOString());
      if (forceNoCache) params.set("_t", Date.now().toString());

      const data = await apiFetch(`/sales?${params}`);
      const rawList = Array.isArray(data) ? data : Array.isArray(data.sales) ? data.sales : [];
      let salesData: Sale[] = rawList.map((s: any) => {
        const rawDate = s.soldAt || s.createdAt || s.created_at || s.date;
        const d = rawDate ? new Date(rawDate) : new Date();
        const validDate = isNaN(d.getTime()) ? new Date() : d;
        const rId = s.readableId || (s.bottleId && s.bottleId.startsWith("WB-") ? s.bottleId : null) || s.bottle?.readableId || s.bottleId;
        return {
          ...s,
          readableId: rId,
          soldAt: {
            toDate: () => validDate,
          },
          isVoided: Boolean(s.isVoided),
          voidedAt: s.voidedAt ? new Date(s.voidedAt) : undefined,
          voidedBy: s.voidedBy || undefined,
          voidedByEmail: s.voidedByEmail || (s.soldByEmail && s.soldByEmail.includes("@") ? s.soldByEmail : undefined),
          voidReason: s.voidReason || undefined,
        };
      });

      const isStaffUser = profile?.role === "store_staff";
      if (isStaffUser && profile) {
        salesData = salesData.filter(
          (s: any) =>
            s.soldById === profile.id ||
            (s.soldByEmail && profile.email && s.soldByEmail.toLowerCase() === profile.email.toLowerCase())
        );
      }

      const activeSales = salesData.filter((s) => !s.isVoided);
      const voidedSales = salesData.filter((s) => s.isVoided);

      const totalBase = activeSales.reduce((sum, s: any) => sum + Number(s.price || 0), 0);
      const totalGross = activeSales.reduce((sum, s: any) => sum + Number(s.totalAmount || s.price || 0), 0);

      let totalCost = 0;
      let totalVolume = 0;
      const catCounts = { fun: 0, fine: 0, reserve: 0, standard: 0 };
      const portionCounts = { bottle: 0, glass: 0, carafe: 0 };

      activeSales.forEach((s: any) => {
        const rawCost = Number(s.masterWinePrice || s.masterWine?.price || 0);
        const st = (s.saleType || "bottle").toLowerCase();
        if (st === "glass") {
          totalCost += rawCost / 6;
          totalVolume += 1 / 6;
          portionCounts.glass += 1;
        } else if (st === "carafe") {
          totalCost += (rawCost * 2) / 6;
          totalVolume += 2 / 6;
          portionCounts.carafe += 1;
        } else {
          totalCost += rawCost;
          totalVolume += Number(s.quantity || 1);
          portionCounts.bottle += 1;
        }

        const rawCat = (s.wineCategory || s.masterWine?.wineCategory || "standard").toLowerCase();
        const cat = rawCat === "fast" ? "fun" : rawCat;
        if (cat in catCounts) {
          catCounts[cat as keyof typeof catCounts] += 1;
        } else {
          catCounts.standard += 1;
        }
      });
      const roundedBottles = Math.round(totalVolume * 100) / 100;

      const voidedAmount = voidedSales.reduce((sum, s: any) => sum + Number(s.totalAmount || s.price || 0), 0);

      setAggregates({
        totalBaseSales: totalBase,
        totalGrossSales: totalGross,
        totalCost: totalCost,
        totalBottles: roundedBottles,
        totalVoidedCount: voidedSales.length,
        totalVoidedAmount: voidedAmount,
        categoryCounts: catCounts,
        portionCounts: portionCounts,
      });

      setSales(salesData);
    } catch (error) {
      console.error("Error fetching sales:", error);
    } finally {
      setLoading(false);
      setIsClearingCache(false);
    }
  };

  const handleClearCache = async () => {
    setCacheToast(null);
    await fetchSales(true);
    setCacheToast("Cache cleared! Fresh sales loaded.");
    setTimeout(() => setCacheToast(null), 3000);
  };

  useEffect(() => {
    fetchSales();
  }, [profile, period, customStart, customEnd]);

  // Calculations
  const totalBaseSales = aggregates.totalBaseSales;
  const grossSales = aggregates.totalGrossSales;
  const totalBottles = aggregates.totalBottles;
  const totalCost = aggregates.totalCost;

  const { netProfit, vatAmount } = calculateDashboardSalesMetrics(totalBaseSales, grossSales, totalCost);

  const getPeriodLabel = () => {
    if (period === "lastMonth") return "Last Month's";
    if (period === "custom") return "Custom Range";
    return period.charAt(0).toUpperCase() + period.slice(1);
  };

  const isStaffUser = profile?.role === "store_staff";

  const displayedSales = React.useMemo(() => {
    if (statusFilter === "completed") return sales.filter((s) => !s.isVoided);
    if (statusFilter === "voided") return sales.filter((s) => s.isVoided);
    return sales;
  }, [sales, statusFilter]);

  const renderDashboardSummary = () => (
    <View style={styles.summaryContainer}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>
        {getPeriodLabel()} Summary {isStaffUser ? "(My Sales)" : ""}
      </Text>

      {isStaffUser ? (
        <>
          {/* Staff Summary Card */}
          <View style={[styles.metricCard, { backgroundColor: theme.primary + "15", borderColor: theme.primary + "30", marginBottom: 16, padding: 16 }]}>
            <Package size={24} color={theme.primary} style={styles.metricIcon} />
            <Text style={[styles.metricLabel, { color: theme.primary, fontWeight: "800", letterSpacing: 0.5 }]}>
              MY BOTTLES SOLD
            </Text>
            <Text style={[styles.metricValue, { color: theme.primary, fontSize: 32, marginVertical: 4 }]}>
              {totalBottles}
            </Text>
            <Text style={[styles.metricSubText, { color: theme.textSecondary }]}>
              {sales.filter((s) => !s.isVoided).length} completed transaction(s) by {profile?.displayName || profile?.email?.split("@")[0] || "Logged-in Account"}
            </Text>
          </View>
        </>
      ) : (
        <>
          {/* Row 1: Revenue Cards */}
          <View style={styles.metricsRow}>
            {/* Gross Revenue */}
            <View
              style={[
                styles.metricCard,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              <TrendingUp size={20} color={theme.primary} style={styles.metricIcon} />
              <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>
                Gross Rev
              </Text>
              <Text style={[styles.metricValue, { color: theme.text }]} numberOfLines={1} adjustsFontSizeToFit>
                {formatCurrency(grossSales)}
              </Text>
              <Text style={[styles.metricSubText, { color: theme.textSecondary }]}>
                Inc. 12% VAT
              </Text>
            </View>

            {/* Net Revenue */}
            <View
              style={[
                styles.metricCard,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              <Receipt size={20} color={theme.primary} style={styles.metricIcon} />
              <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>
                Net Revenue
              </Text>
              <Text style={[styles.metricValue, { color: theme.text }]} numberOfLines={1} adjustsFontSizeToFit>
                {formatCurrency(totalBaseSales)}
              </Text>
              <Text style={[styles.metricSubText, { color: theme.textSecondary }]}>
                + {formatCurrency(vatAmount)} VAT
              </Text>
            </View>

            {/* Bottles Sold */}
            <View
              style={[
                styles.metricCard,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              <Package size={20} color={theme.primary} style={styles.metricIcon} />
              <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>
                Bottles
              </Text>
              <Text style={[styles.metricValue, { color: "#f59e0b" }]} numberOfLines={1} adjustsFontSizeToFit>
                {totalBottles}
              </Text>
              <Text style={[styles.metricSubText, { color: theme.textSecondary }]}>
                Total Sold
              </Text>
            </View>
          </View>

          {/* Row 2: Profit Card (Full Width) */}
          <View
            style={[
              styles.metricCard,
              {
                backgroundColor: netProfit >= 0 ? (Colors.store.success + "15" || "#10b98115") : (Colors.store.danger + "15" || "#ef444415"),
                borderColor: netProfit >= 0 ? (Colors.store.success + "40" || "#10b98140") : (Colors.store.danger + "40" || "#ef444440"),
                marginBottom: 12,
              },
            ]}
          >
            <Banknote size={24} color={netProfit >= 0 ? (Colors.store.success || "#10b981") : (Colors.store.danger || "#ef4444")} style={styles.metricIcon} />
            <Text
              style={[
                styles.metricLabel,
                { color: theme.textSecondary, marginBottom: 8 },
              ]}
            >
              Net Profit
            </Text>
            <Text
              style={[
                styles.metricValue,
                {
                  color:
                    netProfit >= 0
                      ? Colors.store.success || "#10b981"
                      : Colors.store.danger || "#ef4444",
                  fontSize: 32,
                },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {netProfit >= 0 ? "+" : ""}
              {formatCurrency(netProfit)}
            </Text>
            <Text style={[styles.metricSubText, { color: theme.textSecondary, marginTop: 8 }]}>
              Total Purchase Cost: {formatCurrency(totalCost)}
            </Text>
          </View>
        </>
      )}

      {/* Voided Transactions Audit Alert Banner */}
      {aggregates.totalVoidedCount > 0 && (
        <View style={styles.voidAlertBanner}>
          <View style={styles.voidAlertIconCircle}>
            <RotateCcw size={16} color="#dc2626" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.voidAlertTitle}>
              {aggregates.totalVoidedCount} Voided Transaction{aggregates.totalVoidedCount > 1 ? "s" : ""} Recorded
            </Text>
            <Text style={styles.voidAlertSub}>
              ₱{aggregates.totalVoidedAmount.toLocaleString("en-PH", { minimumFractionDigits: 2 })} reversed to stock & logged in audit trail
            </Text>
          </View>
        </View>
      )}

      {/* Transaction Status Filter Tabs */}
      <View style={styles.statusTabContainer}>
        {(
          [
            { id: "all", label: `All (${sales.length})` },
            { id: "completed", label: `Completed (${sales.filter((s) => !s.isVoided).length})` },
            { id: "voided", label: `Voided (${aggregates.totalVoidedCount})` },
          ] as const
        ).map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[
              styles.statusTabBtn,
              { borderColor: theme.border },
              statusFilter === tab.id && {
                backgroundColor: tab.id === "voided" ? "#fee2e2" : theme.primary + "18",
                borderColor: tab.id === "voided" ? "#ef4444" : theme.primary,
              },
            ]}
            onPress={() => setStatusFilter(tab.id)}
          >
            <Text
              style={[
                styles.statusTabText,
                { color: theme.textSecondary },
                statusFilter === tab.id && {
                  color: tab.id === "voided" ? "#dc2626" : theme.primary,
                  fontWeight: "bold",
                },
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text
        style={[
          styles.sectionTitle,
          { color: theme.text, marginTop: 18, marginBottom: 8 },
        ]}
      >
        Recent Transactions {statusFilter !== "all" ? `(${statusFilter.toUpperCase()})` : ""}
      </Text>
    </View>
  );

  const renderItem = ({ item }: { item: Sale }) => {
    const price = Number(item.price || 0);
    const itemTotal = Number(item.totalAmount || price * 1.12);

    const rawCost = Number(item.masterWinePrice || item.masterWine?.price || 0);
    const saleType = (item.saleType || "bottle").toLowerCase();
    const cost = saleType === "glass" ? rawCost / 6 : saleType === "carafe" ? (rawCost * 2) / 6 : rawCost;

    const itemProfit = price - cost;
    const isProfitable = itemProfit >= 0;

    return (
      <View
        style={[
          styles.saleCard,
          {
            backgroundColor: item.isVoided ? "#fef2f2" : theme.card,
            borderColor: item.isVoided ? "#fecaca" : theme.border,
          },
        ]}
      >
        <View style={styles.saleInfo}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
            <Text
              style={[
                styles.wineName,
                {
                  color: item.isVoided ? "#6b7280" : theme.text,
                  textDecorationLine: item.isVoided ? "line-through" : "none",
                },
              ]}
            >
              {item.wineName} {item.vintage && `(${item.vintage})`}
            </Text>
            {item.isVoided && (
              <View style={styles.voidBadge}>
                <RotateCcw size={10} color="#dc2626" />
                <Text style={styles.voidBadgeText}>VOIDED</Text>
              </View>
            )}
          </View>

          <Text style={[styles.wineDetails, { color: theme.textSecondary }]}>
            {item.producer} {item.format && `• ${item.format}`}
          </Text>

          <View style={styles.metaRow}>
            <Text style={[styles.bottleIdText, { color: theme.textSecondary }]}>
              ID: {item.readableId || item.bottleId}
            </Text>
            {!isStaffUser && cost > 0 && !item.isVoided && (
              <View
                style={[
                  styles.profitBadge,
                  { backgroundColor: isProfitable ? "#10b98115" : "#ef444415" },
                ]}
              >
                <Text
                  style={[
                    styles.profitText,
                    { color: isProfitable ? "#10b981" : "#ef4444" },
                  ]}
                >
                  {isProfitable ? "+" : ""}
                  {formatCurrency(itemProfit)}
                </Text>
              </View>
            )}
          </View>

          {item.buyerName && (
            <Text style={[styles.buyerName, { color: theme.textSecondary }]}>
              Buyer: {item.buyerName}
            </Text>
          )}

          {item.isVoided ? (
            <View style={{ marginTop: 4 }}>
              {item.voidReason && (
                <Text style={{ fontSize: 11, fontWeight: "700", color: "#dc2626" }}>
                  Reason: {item.voidReason}
                </Text>
              )}
              <Text style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>
                Voided on {formatDate(item.voidedAt || item.soldAt?.toDate())}
                {item.voidedByEmail ? ` by ${item.voidedByEmail}` : ""}
              </Text>
            </View>
          ) : (
            <Text style={[styles.saleDate, { color: theme.textSecondary }]}>
              {formatDate(item.soldAt?.toDate())}
            </Text>
          )}
        </View>

        {isStaffUser ? (
          <View style={styles.priceContainer}>
            <View
              style={{
                backgroundColor: item.isVoided ? "#fee2e2" : theme.primary + "15",
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 8,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "800",
                  color: item.isVoided ? "#dc2626" : theme.primary,
                }}
              >
                {saleType === "glass" ? "🍷 Glass" : saleType === "carafe" ? "🫗 Carafe" : "🍾 Bottle"}
              </Text>
            </View>
            {item.isVoided && (
              <Text style={{ fontSize: 10, fontWeight: "700", color: "#dc2626", marginTop: 4 }}>
                Voided
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.priceContainer}>
            <Text
              style={[
                styles.price,
                {
                  color: item.isVoided ? "#9ca3af" : theme.primary,
                  textDecorationLine: item.isVoided ? "line-through" : "none",
                },
              ]}
            >
              {formatCurrency(itemTotal)}
            </Text>
            <Text
              style={[
                styles.vatText,
                {
                  color: item.isVoided ? "#dc2626" : theme.textSecondary,
                  fontWeight: item.isVoided ? "700" : "400",
                },
              ]}
            >
              {item.isVoided ? "Reversed" : "inc. VAT"}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const handlePeriodSelect = (selectedPeriod: PeriodType) => {
    if (selectedPeriod !== "custom") {
      setPeriod(selectedPeriod);
      setFilterModalVisible(false);
    } else {
      setPeriod("custom");
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { borderBottomColor: theme.border, paddingHorizontal: horizontalPadding }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <ChevronLeft size={24} color={theme.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
          {activeStoreName ? `${activeStoreName} Sales` : "Sales Report"}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TouchableOpacity
            style={[styles.filterIcon, { backgroundColor: theme.primary + "15", paddingHorizontal: 10, borderRadius: 10, height: 38, flexDirection: "row", alignItems: "center", gap: 4 }]}
            onPress={handleClearCache}
            disabled={isClearingCache}
          >
            <RotateCcw size={16} color={theme.primary} />
            <Text style={{ fontSize: 11, fontWeight: "700", color: theme.primary }}>
              {isClearingCache ? "Clearing..." : "Clear Cache"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.filterIcon}
            onPress={() => setFilterModalVisible(true)}
          >
            <Sliders size={22} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {cacheToast && (
        <View style={{ backgroundColor: "#dcfce7", borderColor: "#86efac", borderWidth: 1, padding: 10, marginHorizontal: horizontalPadding, marginTop: 8, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <RotateCcw size={14} color="#15803d" />
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#15803d" }}>{cacheToast}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator color={theme.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={displayedSales}
          ListHeaderComponent={sales.length > 0 ? renderDashboardSummary : null}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContainer, { paddingHorizontal: horizontalPadding }]}
          showsVerticalScrollIndicator={false}
          initialNumToRender={20}
          maxToRenderPerBatch={10}
          windowSize={5}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Receipt
                size={48}
                color={theme.textSecondary}
                style={{ marginBottom: 16, opacity: 0.5 }}
              />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                {statusFilter === "voided"
                  ? "No voided transactions recorded for this period."
                  : statusFilter === "completed"
                  ? "No completed sales recorded for this period."
                  : "No sales recorded for this period."}
              </Text>
            </View>
          }
        />
      )}

      {/* Advanced Filters Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isFilterModalVisible}
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setFilterModalVisible(false)}
        >
          <View
            style={[styles.modalContent, { backgroundColor: theme.card }]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Filter Sales Report
            </Text>

            {/* Quick Presets */}
            <View style={styles.presetGrid}>
              {(
                [
                  { id: "all", label: "All Time" },
                  { id: "today", label: "Today" },
                  { id: "week", label: "This Week" },
                  { id: "month", label: "This Month" },
                  { id: "lastMonth", label: "Last Month" },
                  { id: "custom", label: "Custom Range" },
                ] as const
              ).map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.filterOption,
                    period === p.id && { backgroundColor: theme.primary },
                  ]}
                  onPress={() => handlePeriodSelect(p.id)}
                >
                  <Text
                    style={[
                      styles.filterOptionText,
                      { color: theme.text },
                      period === p.id && { color: "#fff", fontWeight: "bold" },
                    ]}
                  >
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Custom Inputs Panel */}
            {period === "custom" && (
              <View style={styles.customDateContainer}>
                <View style={styles.inputWrapper}>
                  <Calendar
                    size={16}
                    color={theme.textSecondary}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[
                      styles.dateInput,
                      { color: theme.text, borderColor: theme.border },
                    ]}
                    placeholder="Start: YYYY-MM-DD"
                    placeholderTextColor={theme.textSecondary}
                    value={customStart}
                    onChangeText={setCustomStart}
                  />
                </View>
                <View style={styles.inputWrapper}>
                  <Calendar
                    size={16}
                    color={theme.textSecondary}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[
                      styles.dateInput,
                      { color: theme.text, borderColor: theme.border },
                    ]}
                    placeholder="End: YYYY-MM-DD"
                    placeholderTextColor={theme.textSecondary}
                    value={customEnd}
                    onChangeText={setCustomEnd}
                  />
                </View>

                <TouchableOpacity
                  style={[
                    styles.applyButton,
                    { backgroundColor: theme.primary },
                  ]}
                  onPress={() => setFilterModalVisible(false)}
                >
                  <Text style={styles.applyButtonText}>Apply Custom Range</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: { padding: 8, marginLeft: -8 },
  headerTitle: { fontSize: 18, fontWeight: "600" },
  filterIcon: { padding: 8, marginRight: -8 },
  listContainer: { padding: 16, paddingBottom: 40 },

  // Dashboard Styles
  summaryContainer: { marginBottom: 8 },
  sectionTitle: { fontSize: 17, fontWeight: "bold", marginBottom: 12 },
  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 12,
  },
  metricCard: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  metricIcon: { marginBottom: 6 },
  metricLabel: {
    fontSize: 10,
    marginBottom: 6,
    textTransform: "uppercase",
    fontWeight: "bold",
    letterSpacing: 0.5,
    textAlign: "center"
  },
  metricValue: {
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.5,
    textAlign: "center"
  },
  metricSubText: {
    fontSize: 10,
    marginTop: 6,
    textAlign: "center"
  },

  // List Item Styles
  saleCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  saleInfo: { flex: 1, paddingRight: 12 },
  wineName: { fontSize: 15, fontWeight: "600", marginBottom: 2 },
  wineDetails: { fontSize: 13, marginBottom: 4 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  bottleIdText: { fontSize: 12 },
  profitBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  profitText: { fontSize: 10, fontWeight: "bold" },
  buyerName: { fontSize: 13, marginTop: 6 },
  saleDate: { fontSize: 12, marginTop: 4 },
  priceContainer: { alignItems: "flex-end" },
  price: { fontSize: 16, fontWeight: "bold" },
  vatText: { fontSize: 11, marginTop: 2 },

  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 60,
  },
  emptyText: { fontSize: 15 },

  // Modal & Grid Layout Styles
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalContent: {
    margin: 20,
    borderRadius: 24,
    padding: 20,
    width: "85%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  presetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
  },
  filterOption: {
    width: "48%",
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "#f1f5f9",
  },
  filterOptionText: { fontSize: 14, fontWeight: "500" },

  // Custom Date Input Block
  customDateContainer: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 16,
    width: "100%",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    position: "relative",
  },
  inputIcon: { position: "absolute", left: 12, zIndex: 1 },
  dateInput: {
    width: "100%",
    height: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: 38,
    paddingRight: 12,
    fontSize: 14,
  },
  applyButton: {
    width: "100%",
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 6,
  },
  applyButtonText: { color: "#fff", fontSize: 15, fontWeight: "bold" },

  // Void & Status Styles
  voidAlertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderWidth: 1,
    padding: 12,
    borderRadius: 14,
    marginBottom: 14,
  },
  voidAlertIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#fee2e2",
    alignItems: "center",
    justifyContent: "center",
  },
  voidAlertTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#991b1b",
  },
  voidAlertSub: {
    fontSize: 11,
    color: "#b91c1c",
    marginTop: 1,
  },
  statusTabContainer: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  statusTabBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  statusTabText: {
    fontSize: 11,
    fontWeight: "600",
  },
  voidBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  voidBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#fee2e2",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: "#fca5a5",
  },
  voidBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#dc2626",
    letterSpacing: 0.5,
  },
});
