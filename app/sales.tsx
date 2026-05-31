import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { Stack, useRouter } from "expo-router";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import {
  Calendar,
  ChevronLeft,
  Package,
  Receipt,
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
  price: number;
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

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFilterModalVisible, setFilterModalVisible] = useState(false);
  const [period, setPeriod] = useState<PeriodType>("all");

  // Custom date states (YYYY-MM-DD format strings for input)
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  useEffect(() => {
    const fetchSales = async () => {
      if (!profile?.locationId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
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
          ); // Last day of last month
        } else if (period === "custom") {
          startDate = customStart ? new Date(customStart) : null;
          if (startDate) startDate.setHours(0, 0, 0, 0);

          endDate = customEnd ? new Date(customEnd) : null;
          if (endDate) endDate.setHours(23, 59, 59, 999);
        }

        // Build composite queries safely
        let salesQuery;
        const baseConstraints = [where("storeId", "==", profile.locationId)];

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
          // Just startDate (Today, Week, Month, or Custom with no end date)
          salesQuery = query(
            collection(db, "sales"),
            ...baseConstraints,
            where("soldAt", ">=", startDate),
            orderBy("soldAt", "desc"),
          );
        }

        const querySnapshot = await getDocs(salesQuery);
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

    // Prevent fetching custom without at least a start date
    if (period === "custom" && !customStart) return;

    fetchSales();
  }, [profile, period, customStart, customEnd]);

  // Derived Statistics for Dashboard
  const totalBaseSales = sales.reduce((sum, sale) => sum + sale.price, 0);
  const vatAmount = totalBaseSales * 0.12;
  const grossSales = totalBaseSales + vatAmount;
  const totalBottles = sales.length;

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

      <View style={styles.metricsRow}>
        <View
          style={[
            styles.metricCard,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <TrendingUp
            size={20}
            color={theme.primary}
            style={styles.metricIcon}
          />
          <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>
            Gross Total
          </Text>
          <Text style={[styles.metricValue, { color: theme.text }]}>
            {formatCurrency(grossSales)}
          </Text>
        </View>

        <View
          style={[
            styles.metricCard,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <Package size={20} color={theme.primary} style={styles.metricIcon} />
          <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>
            Bottles Sold
          </Text>
          <Text style={[styles.metricValue, { color: theme.text }]}>
            {totalBottles}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.breakdownCard,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        <View style={styles.breakdownRow}>
          <Text style={[styles.breakdownLabel, { color: theme.textSecondary }]}>
            Subtotal
          </Text>
          <Text style={[styles.breakdownValue, { color: theme.text }]}>
            {formatCurrency(totalBaseSales)}
          </Text>
        </View>
        <View style={styles.breakdownRow}>
          <Text style={[styles.breakdownLabel, { color: theme.textSecondary }]}>
            VAT (12%)
          </Text>
          <Text style={[styles.breakdownValue, { color: theme.text }]}>
            + {formatCurrency(vatAmount)}
          </Text>
        </View>
        <View
          style={[styles.breakdownDivider, { backgroundColor: theme.border }]}
        />
        <View style={styles.breakdownRow}>
          <Text
            style={[
              styles.breakdownLabel,
              { color: theme.text, fontWeight: "bold" },
            ]}
          >
            Total Revenue
          </Text>
          <Text
            style={[
              styles.breakdownValue,
              { color: theme.primary, fontWeight: "bold", fontSize: 16 },
            ]}
          >
            {formatCurrency(grossSales)}
          </Text>
        </View>
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
          <Text style={[styles.bottleIdText, { color: theme.textSecondary }]}>
            ID: {item.bottleId}
          </Text>
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
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  metricIcon: { marginBottom: 8 },
  metricLabel: { fontSize: 13, marginBottom: 4 },
  metricValue: { fontSize: 18, fontWeight: "bold" },
  breakdownCard: { padding: 16, borderRadius: 16, borderWidth: 1 },
  breakdownRow: {
    flexDirection: "row",
    justifyContext: "space-between",
    paddingVertical: 4,
    justifyContent: "space-between",
  },
  breakdownLabel: { fontSize: 14 },
  breakdownValue: { fontSize: 14 },
  breakdownDivider: { height: 1, marginVertical: 12 },

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
  bottleIdText: { fontSize: 12 },
  buyerName: { fontSize: 13, marginTop: 4 },
  saleDate: { fontSize: 12, marginTop: 6 },
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
