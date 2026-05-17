import { Colors } from "@/constants/theme";
import { db } from "@/lib/firebase";
import { WineRequest } from "@/types";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Clock,
  Package,
  Wine,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function WineRequestDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = Colors.store;

  const [request, setRequest] = useState<WineRequest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRequest = async () => {
      try {
        const snap = await getDoc(doc(db, "wine_requests", id));
        if (snap.exists()) {
          setRequest({
            id: snap.id,
            ...snap.data(),
            createdAt: snap.data().createdAt?.toDate() || new Date(),
          } as WineRequest);
        }
      } catch (err) {
        console.error("Failed to fetch request:", err);
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchRequest();
  }, [id]);

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "pending":
        return { color: "#f59e0b", bg: "#fef3c7", icon: Clock, label: "Pending Review" };
      case "converted":
        return { color: "#10b981", bg: "#d1fae5", icon: CheckCircle2, label: "Authorized" };
      case "rejected":
        return { color: "#ef4444", bg: "#fee2e2", icon: Ban, label: "Rejected" };
      default:
        return { color: "#64748b", bg: "#f1f5f9", icon: Clock, label: status };
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!request) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.center}>
          <Package size={48} color={theme.border} strokeWidth={1} />
          <Text style={[styles.notFoundText, { color: theme.textSecondary }]}>Request not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusConfig = getStatusConfig(request.status);
  const StatusIcon = statusConfig.icon;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={theme.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.primary }]}>Request Details</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            REQ: {request.id.slice(0, 8).toUpperCase()}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Status Banner */}
        <View style={[styles.statusBanner, { backgroundColor: statusConfig.bg }]}>
          <StatusIcon size={20} color={statusConfig.color} strokeWidth={2.5} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusLabel, { color: statusConfig.color }]}>
              {statusConfig.label}
            </Text>
            <Text style={[styles.statusDate, { color: statusConfig.color + "AA" }]}>
              {request.createdAt.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </Text>
          </View>
        </View>

        {/* Items */}
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.sectionHeader}>
            <Wine size={16} color={theme.primary} />
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Requested Items ({request.items.length})
            </Text>
          </View>

          {request.items.map((wine, idx) => (
            <View
              key={idx}
              style={[
                styles.itemRow,
                idx < request.items.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border },
              ]}
            >
              {/* Qty pill */}
              <View style={[styles.qtyPill, { backgroundColor: theme.primary + "18" }]}>
                <Text style={[styles.qtyText, { color: theme.primary }]}>{wine.qty}x</Text>
              </View>

              {/* Wine info */}
              <View style={{ flex: 1 }}>
                <Text style={[styles.wineName, { color: theme.text }]}>{wine.wineName}</Text>
                <Text style={[styles.wineMeta, { color: theme.textSecondary }]}>
                  {[wine.vintage, wine.format].filter(Boolean).join(" · ")}
                </Text>
                {wine.sku && wine.sku !== "N/A" && (
                  <Text style={[styles.wineSku, { color: theme.textSecondary + "88" }]}>
                    SKU: {wine.sku}
                  </Text>
                )}
              </View>

              {/* Pulled qty indicator for converted requests */}
              {request.status === "converted" && wine.pulledQty !== undefined && (
                <View style={[styles.pulledBadge, { backgroundColor: "#10b98120" }]}>
                  <Text style={[styles.pulledText, { color: "#10b981" }]}>
                    {wine.pulledQty}/{wine.qty}
                  </Text>
                  <Text style={[styles.pulledLabel, { color: "#10b981" }]}>pulled</Text>
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Summary */}
        {request.totalAmount > 0 && (
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryKey, { color: theme.textSecondary }]}>Total Value</Text>
              <Text style={[styles.summaryValue, { color: theme.primary }]}>
                ₱{request.totalAmount.toLocaleString()}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryKey, { color: theme.textSecondary }]}>Total Bottles</Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>
                {request.items.reduce((sum, i) => sum + i.qty, 0)} btls
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16 },
  notFoundText: { fontSize: 15, fontWeight: "600" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 2,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 48,
    gap: 16,
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 20,
    padding: 20,
  },
  statusLabel: {
    fontSize: 15,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statusDate: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 3,
  },
  section: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  qtyPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  qtyText: {
    fontSize: 13,
    fontWeight: "900",
  },
  wineName: {
    fontSize: 14,
    fontWeight: "800",
  },
  wineMeta: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
  wineSku: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
  pulledBadge: {
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  pulledText: {
    fontSize: 13,
    fontWeight: "900",
  },
  pulledLabel: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  summaryKey: {
    fontSize: 13,
    fontWeight: "600",
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: "900",
  },
});
