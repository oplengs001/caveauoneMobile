import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { calculateDashboardSalesMetrics } from "@/lib/utils/salesMath";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { collection, count, getAggregateFromServer, getDocs, orderBy, query, sum, where } from "firebase/firestore";
import {
  Banknote,
  Calendar,
  ChevronLeft,
  Package,
  Receipt,
  Sliders,
  TrendingUp,
} from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
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
  price: number; // Selling price (Base)
  masterWinePrice?: number; // Added to calculate profit (Cost)
  soldAt: {
    toDate: () => Date;
  };
  buyerName?: string;
}

type PeriodType = "all" | "today" | "week" | "month" | "lastMonth" | "custom";

const formatDate = (date: Date | undefined) => {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: true,
  }).format(date);
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
  const { profile } = useAuth();
  const theme = profile?.role === "store" ? Colors.store : Colors.warehouse;

  // Catch the period parameter passed from the HomeScreen
  const { period: passedPeriod } = useLocalSearchParams();

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFilterModalVisible, setFilterModalVisible] = useState(false);

  // Aggregate state
  const [aggregates, setAggregates] = useState({
    totalBaseSales: 0,
    totalGrossSales: 0,
    totalCost: 0,
    totalBottles: 0
  });

  // Initialize the state with the passed parameter, or default to "all"
  const [period, setPeriod] = useState<PeriodType>(
    (passedPeriod as PeriodType) || "all",
  );

  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const buildBaseQuery = useCallback(() => {
    let startDate: Date | null = null;
    let endDate: Date | null = null;
    const now = new Date();

    if (period === "today") {
      startDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      );
    } else if (period === "week") {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - startDate.getDay());
      startDate.setHours(0, 0, 0, 0);
    } else if (period === "month") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === "lastMonth") {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        0,
        23,
        59,
        59,
        999,
      );
    } else if (period === "custom") {
      startDate = customStart ? new Date(customStart) : null;
      if (startDate) startDate.setHours(0, 0, 0, 0);

      endDate = customEnd ? new Date(customEnd) : null;
      if (endDate) endDate.setHours(23, 59, 59, 999);
    }

    const baseConstraints = [where("storeId", "==", profile?.locationId)];
    let salesQuery;

    if (period === "all" || (!startDate && period === "custom")) {
      salesQuery = query(
        collection(db, "sales"),
        ...baseConstraints,
        orderBy("soldAt", "desc"),
      );
    } else if (startDate && endDate) {
      salesQuery = query(
        collection(db, "sales"),
        ...baseConstraints,
        where("soldAt", ">=", startDate),
        where("soldAt", "<=", endDate),
        orderBy("soldAt", "desc"),
      );
    } else {
      salesQuery = query(
        collection(db, "sales"),
        ...baseConstraints,
        where("soldAt", ">=", startDate),
        orderBy("soldAt", "desc"),
      );
    }
    return salesQuery;
  }, [period, customStart, customEnd, profile]);

  const fetchSales = async () => {
    if (!profile?.locationId) {
      setLoading(false);
      return;
    }
    if (period === "custom" && !customStart) return;

    setLoading(true);
    try {
      const baseQuery = buildBaseQuery();

      // Fetch Aggregates first
      const aggregateSnapshot = await getAggregateFromServer(baseQuery, {
        totalBaseSales: sum("price"),
        totalGrossSales: sum("totalAmount"),
        totalCost: sum("masterWinePrice"),
        totalBottles: count()
      });

      setAggregates({
        totalBaseSales: aggregateSnapshot.data().totalBaseSales || 0,
        totalGrossSales: aggregateSnapshot.data().totalGrossSales || 0,
        totalCost: aggregateSnapshot.data().totalCost || 0,
        totalBottles: aggregateSnapshot.data().totalBottles || 0
      });

      const querySnapshot = await getDocs(baseQuery);
      const salesData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Sale[];

      setSales(salesData);
    } catch (error) {
      console.error("Error fetching sales:", error);
    } finally {
      setLoading(false);
    }
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

  const renderDashboardSummary = () => (
    <View style={styles.summaryContainer}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>
        {getPeriodLabel()} Summary
      </Text>

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



      <Text
        style={[
          styles.sectionTitle,
          { color: theme.text, marginTop: 24, marginBottom: 8 },
        ]}
      >
        Recent Transactions
      </Text>
    </View>
  );

  const renderItem = ({ item }: { item: Sale }) => {
    const itemVat = item.price * 0.12;
    const itemTotal = item.price + itemVat;

    const cost = item.masterWinePrice || 0;
    const itemProfit = item.price - cost;
    const isProfitable = itemProfit >= 0;

    return (
      <View
        style={[
          styles.saleCard,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        <View style={styles.saleInfo}>
          <Text style={[styles.wineName, { color: theme.text }]}>
            {item.wineName} {item.vintage && `(${item.vintage})`}
          </Text>
          <Text style={[styles.wineDetails, { color: theme.textSecondary }]}>
            {item.producer} {item.format && `• ${item.format}`}
          </Text>

          <View style={styles.metaRow}>
            <Text style={[styles.bottleIdText, { color: theme.textSecondary }]}>
              ID: {item.bottleId}
            </Text>
            {cost > 0 && (
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
          <Text style={[styles.saleDate, { color: theme.textSecondary }]}>
            {formatDate(item.soldAt?.toDate())}
          </Text>
        </View>
        <View style={styles.priceContainer}>
          <Text style={[styles.price, { color: theme.primary }]}>
            {formatCurrency(itemTotal)}
          </Text>
          <Text style={[styles.vatText, { color: theme.textSecondary }]}>
            inc. VAT
          </Text>
        </View>
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
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <ChevronLeft size={24} color={theme.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Sales Report
        </Text>
        <TouchableOpacity
          style={styles.filterIcon}
          onPress={() => setFilterModalVisible(true)}
        >
          <Sliders size={24} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator color={theme.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={sales}
          ListHeaderComponent={sales.length > 0 ? renderDashboardSummary : null}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
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
                No sales recorded for this period.
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
});
