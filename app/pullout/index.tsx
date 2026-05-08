import { IconSymbol } from "@/components/ui/icon-symbol";
import { db } from "@/lib/firebase";
import { useRouter } from "expo-router";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { PulloutRequest } from "../../types";

export default function PulloutRequestsScreen() {
  const [requests, setRequests] = useState<PulloutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchRequests = async () => {
    setLoading(true);
    try {
      // Fetch only pending or in_progress requests for the warehouse
      const q = query(
        collection(db, "pullout_requests"),
        where("status", "in", ["pending", "in_progress"]),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      const data = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as PulloutRequest[];

      setRequests(data);
    } catch (error) {
      console.error("Error fetching pullout requests:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const renderItem = ({ item }: { item: PulloutRequest }) => {
    const totalRequested = item.items.reduce((sum, i) => sum + i.requestedQty, 0);
    const totalPulled = item.items.reduce((sum, i) => sum + i.pulledQty, 0);
    const progress = totalRequested > 0 ? (totalPulled / totalRequested) * 100 : 0;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/pullout/${item.id}`)}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.requestId}>REQ: {item.id.slice(0, 8).toUpperCase()}</Text>
          <View style={[
            styles.statusBadge,
            { backgroundColor: item.status === 'in_progress' ? '#3b82f6' : '#f59e0b' }
          ]}>
            <Text style={styles.statusText}>
              {item.status.replace('_', ' ').toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Pullout Progress</Text>
            <Text style={styles.progressValue}>{totalPulled} / {totalRequested} bottles</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
          </View>
        </View>

        <View style={styles.itemsSummary}>
          <Text style={styles.summaryTitle}>Items to pull:</Text>
          {item.items.map((i, index) => (
            <Text key={index} style={styles.summaryItem}>
              • {i.wineName} ({i.requestedQty} requested)
            </Text>
          ))}
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.footerAction}>Open to start pulling</Text>
          <IconSymbol name="chevron.right" size={16} color="#9ca3af" />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Pullout Tasks</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#f59e0b" />
          <Text style={styles.loadingText}>Loading requests...</Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <IconSymbol name="tray.and.arrow.up.fill" size={64} color="#374151" />
              <Text style={styles.emptyText}>No pending pullout requests.</Text>
            </View>
          }
          onRefresh={fetchRequests}
          refreshing={loading}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111827",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 24,
  },
  backButton: {
    marginRight: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#fff",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "#9ca3af",
    marginTop: 12,
  },
  listContent: {
    padding: 24,
    gap: 20,
  },
  card: {
    backgroundColor: "#1f2937",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#374151",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  requestId: {
    color: "#9ca3af",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
  },
  progressSection: {
    marginBottom: 20,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  progressLabel: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  progressValue: {
    color: "#f59e0b",
    fontSize: 14,
    fontWeight: "800",
  },
  progressBarBg: {
    height: 8,
    backgroundColor: "#374151",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#f59e0b",
  },
  itemsSummary: {
    backgroundColor: "#111827",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  summaryTitle: {
    color: "#9ca3af",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
  },
  summaryItem: {
    color: "#e5e7eb",
    fontSize: 14,
    marginBottom: 2,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#374151",
    paddingTop: 12,
  },
  footerAction: {
    color: "#3b82f6",
    fontSize: 14,
    fontWeight: "700",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 100,
  },
  emptyText: {
    color: "#4b5563",
    fontSize: 18,
    fontWeight: "600",
    marginTop: 20,
  },
});
