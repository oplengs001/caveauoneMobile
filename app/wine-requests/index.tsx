import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { WineRequest } from "@/types";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import {
  ArrowRight,
  Ban,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Package,
  Plus,
} from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function WineRequestsIndex() {
  const router = useRouter();
  const { profile } = useAuth();
  const theme = Colors.store;

  const [requests, setRequests] = useState<WineRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRequests = async () => {
    if (!profile?.email) return;

    try {
      const q = query(
        collection(db, "wine_requests"),
        where("storeEmail", "==", profile.email),
        orderBy("createdAt", "desc"),
      );
      const snap = await getDocs(q);
      const data = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
      })) as WineRequest[];

      setRequests(data);
    } catch (error) {
      console.error("Error fetching requests:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchRequests();
    }, [profile?.email]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchRequests();
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "pending":
        return {
          color: "#f59e0b",
          bg: "#f59e0b15",
          icon: Clock,
          label: "PENDING",
        };
      case "converted":
        return {
          color: "#10b981",
          bg: "#10b98115",
          icon: CheckCircle2,
          label: "AUTHORIZED",
        };
      case "rejected":
        return {
          color: "#ef4444",
          bg: "#ef444415",
          icon: Ban,
          label: "REJECTED",
        };
      default:
        return {
          color: "#64748b",
          bg: "#64748b15",
          icon: Clock,
          label: status.toUpperCase(),
        };
    }
  };

  const renderItem = ({ item }: { item: WineRequest }) => {
    const status = getStatusStyle(item.status);
    const StatusIcon = status.icon;

    return (
      <TouchableOpacity
        style={[
          styles.card,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
        onPress={() => router.push({ pathname: '/wine-requests/[id]', params: { id: item.id } })}
      >
        <View style={styles.cardHeader}>
          <View style={styles.dateRow}>
            <Calendar size={14} color={theme.textSecondary} />
            <Text style={[styles.dateText, { color: theme.textSecondary }]}>
              {item.createdAt.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
            <StatusIcon size={12} color={status.color} strokeWidth={2.5} />
            <Text style={[styles.statusText, { color: status.color }]}>
              {status.label}
            </Text>
          </View>
        </View>

        <View style={styles.itemsContainer}>
          {item.items.map((wine, idx) => (
            <View key={idx} style={styles.wineRow}>
              <View
                style={[
                  styles.qtyBadge,
                  { backgroundColor: theme.primary + "10" },
                ]}
              >
                <Text style={[styles.qtyText, { color: theme.primary }]}>
                  {wine.qty}x
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.wineName, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {wine.wineName}
                </Text>
                <Text style={[styles.wineMeta, { color: theme.textSecondary }]}>
                  {wine.vintage}
                  {wine.format && ` • ${wine.format}`}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
          <Text style={[styles.idText, { color: theme.textSecondary }]}>
            REQ: {item.id.slice(0, 8).toUpperCase()}
          </Text>
          <View style={styles.viewDetails}>
            <Text style={[styles.detailsLabel, { color: theme.primary }]}>
              Details
            </Text>
            <ArrowRight size={14} color={theme.primary} strokeWidth={2.5} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <ChevronLeft size={28} color={theme.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.primary }]}>
            Wine Requests
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Sommelier Requisitions
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: theme.primary }]}
          onPress={() => router.push("/wine-requests/create")}
        >
          <Plus size={24} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Package size={64} color={theme.border} strokeWidth={1} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No requests found
              </Text>
              <TouchableOpacity
                style={[styles.emptyBtn, { borderColor: theme.primary }]}
                onPress={() => router.push("/wine-requests/create")}
              >
                <Text style={[styles.emptyBtnText, { color: theme.primary }]}>
                  Create First Request
                </Text>
              </TouchableOpacity>
            </View>
          }
        />
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
    padding: 24,
    paddingTop: 8,
    gap: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  listContent: {
    padding: 24,
    paddingTop: 0,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dateText: {
    fontSize: 12,
    fontWeight: "700",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  itemsContainer: {
    gap: 10,
    marginBottom: 20,
  },
  wineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  qtyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  qtyText: {
    fontSize: 12,
    fontWeight: "900",
  },
  wineName: {
    fontSize: 14,
    fontWeight: "700",
  },
  wineMeta: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 16,
    borderTopWidth: 1,
  },
  idText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  viewDetails: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  detailsLabel: {
    fontSize: 12,
    fontWeight: "800",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 100,
    gap: 20,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
  },
  emptyBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  emptyBtnText: {
    fontWeight: "800",
    fontSize: 14,
  },
});
