import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { Stack, useRouter } from "expo-router";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { ChevronLeft, Sliders } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
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

const formatDate = (date: Date | undefined) => {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
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
  const [period, setPeriod] = useState<"all" | "today" | "week" | "month">(
    "all",
  );

  useEffect(() => {
    const fetchSales = async () => {
      if (!profile?.locationId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        let startDate;
        const now = new Date();

        if (period === "today") {
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        } else if (period === "week") {
          startDate = new Date();
          startDate.setDate(startDate.getDate() - startDate.getDay());
          startDate.setHours(0, 0, 0, 0);
        } else if (period === "month") {
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        }

        const salesQuery =
          period === "all"
            ? query(
                collection(db, "sales"),
                where("storeId", "==", profile.locationId),
                orderBy("soldAt", "desc"),
              )
            : query(
                collection(db, "sales"),
                where("storeId", "==", profile.locationId),
                where("soldAt", ">=", startDate),
                orderBy("soldAt", "desc"),
              );

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

    fetchSales();
  }, [profile, period]);

  const renderItem = ({ item }: { item: Sale }) => (
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
          Bottle ID: {item.bottleId}
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
      <Text style={[styles.price, { color: theme.primary }]}>
        {formatCurrency(item.price)}
      </Text>
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
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
        <ActivityIndicator
          style={{ marginTop: 20 }}
          color={theme.primary}
          size="large"
        />
      ) : (
        <FlatList
          data={sales}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No sales recorded for this period.
              </Text>
            </View>
          }
        />
      )}

      <Modal
        animationType="slide"
        transparent={true}
        visible={isFilterModalVisible}
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Filter Sales
            </Text>
            {(["all", "today", "week", "month"] as const).map((p) => (
              <TouchableOpacity
                key={p}
                style={[
                  styles.filterOption,
                  period === p && { backgroundColor: theme.primary },
                ]}
                onPress={() => {
                  setPeriod(p);
                  setFilterModalVisible(false);
                }}
              >
                <Text
                  style={[
                    styles.filterOptionText,
                    { color: theme.text },
                    period === p && { color: "#fff" },
                  ]}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 20, fontWeight: "bold" },
  filterIcon: { padding: 8 },
  listContainer: { padding: 16 },
  saleCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  saleInfo: { flex: 1 },
  wineName: { fontSize: 16, fontWeight: "bold" },
  buyerName: { fontSize: 14, marginTop: 4 },
  saleDate: { fontSize: 12, marginTop: 4 },
  price: { fontSize: 18, fontWeight: "bold" },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 50,
  },
  emptyText: {
    fontSize: 16,
  },
  wineDetails: {
    fontSize: 13,
    color: "#64748b", // theme.textSecondary or a slightly lighter shade
    marginTop: 2,
  },
  bottleIdText: {
    fontSize: 11,
    color: "#94a3b8", // a lighter theme.textSecondary
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalContent: {
    margin: 20,
    borderRadius: 20,
    padding: 35,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: "80%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
  },
  filterOption: {
    width: "100%",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 10,
  },
  filterOptionText: {
    fontSize: 18,
  },
});
