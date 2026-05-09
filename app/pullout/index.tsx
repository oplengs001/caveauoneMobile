import { IconSymbol } from '@/components/ui/icon-symbol';
import { db } from "@/lib/firebase";
import { useRouter, Stack, useFocusEffect } from "expo-router";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  QueryDocumentSnapshot,
  startAfter,
  where
} from "firebase/firestore";
import React, { useCallback, useEffect, useState } from "react";
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
import { PulloutRequest } from "../../types";

const PAGE_SIZE = 10;

export default function PulloutRequestsScreen() {
  const [requests, setRequests] = useState<PulloutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [selectedTab, setSelectedTab] = useState<"pending" | "in_progress" | "completed">("pending");
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  const fetchRequests = async (status: string = selectedTab, isRefresh = false) => {
    if (loadingMore || (!hasMore && !isRefresh)) return;

    if (isRefresh) {
      setRefreshing(true);
      setHasMore(true);
    } else {
      if (requests.length > 0) setLoadingMore(true);
      else setLoading(true);
    }

    try {
      let q = query(
        collection(db, "pullout_requests"),
        where("status", "==", status),
        orderBy("createdAt", "desc"),
        limit(PAGE_SIZE)
      );

      if (!isRefresh && lastDoc) {
        q = query(
          collection(db, "pullout_requests"),
          where("status", "==", status),
          orderBy("createdAt", "desc"),
          startAfter(lastDoc),
          limit(PAGE_SIZE)
        );
      }

      const snap = await getDocs(q);
      const data = snap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as object),
      })) as PulloutRequest[];

      if (isRefresh) {
        setRequests(data);
        setLastDoc(snap.docs[snap.docs.length - 1]);
        setHasMore(snap.docs.length === PAGE_SIZE);
      } else {
        setRequests(prev => [...prev, ...data]);
        if (snap.docs.length > 0) {
          setLastDoc(snap.docs[snap.docs.length - 1]);
        }
        setHasMore(snap.docs.length === PAGE_SIZE);
      }
    } catch (error) {
      console.error("Error fetching pullout requests:", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchRequests(selectedTab, true);
    }, [selectedTab])
  );

  const onRefresh = useCallback(() => {
    fetchRequests(selectedTab, true);
  }, [selectedTab]);

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
          <View style={[
            styles.actionButton,
            { backgroundColor: item.status === 'in_progress' ? '#3b82f6' : item.status === 'completed' ? '#10b981' : '#f59e0b' }
          ]}>
            <Text style={styles.actionButtonText}>
              {item.status === 'in_progress' ? 'Continue Pulling' : item.status === 'completed' ? 'View Summary' : 'Start Pulling'}
            </Text>
            <IconSymbol name="chevron.right" size={16} color="#fff" />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const filteredRequests = requests;

  const renderTab = (tab: typeof selectedTab, label: string) => {
    const isActive = selectedTab === tab;
    return (
      <TouchableOpacity
        style={[styles.tab, isActive && styles.activeTab]}
        onPress={() => setSelectedTab(tab)}
      >
        <Text style={[styles.tabText, isActive && styles.activeTabText]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Pullout Tasks</Text>
      </View>

      <View style={styles.tabBar}>
        {renderTab("pending", "Pending")}
        {renderTab("in_progress", "In Progress")}
        {renderTab("completed", "Completed")}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#f59e0b" />
          <Text style={styles.loadingText}>Loading requests...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredRequests}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          onEndReached={() => fetchRequests(selectedTab, false)}
          onEndReachedThreshold={0.5}
          ListFooterComponent={() => (
            loadingMore ? (
              <ActivityIndicator size="small" color="#f59e0b" style={{ marginVertical: 20 }} />
            ) : null
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#f59e0b"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <IconSymbol name="tray.and.arrow.up.fill" size={64} color="#374151" />
              <Text style={styles.emptyText}>No {selectedTab.replace('_', ' ')} requests.</Text>
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
    paddingTop: 12,
    gap: 20,
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 24,
    marginBottom: 12,
    gap: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
    backgroundColor: "#1f2937",
    borderWidth: 1,
    borderColor: "#374151",
  },
  activeTab: {
    backgroundColor: "#f59e0b",
    borderColor: "#f59e0b",
  },
  tabText: {
    color: "#9ca3af",
    fontSize: 12,
    fontWeight: "800",
  },
  activeTabText: {
    color: "#fff",
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
    borderTopWidth: 1,
    borderTopColor: "#374151",
    paddingTop: 16,
    alignItems: "center",
  },
  actionButton: {
    backgroundColor: "#3b82f6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: "100%",
    gap: 8,
  },
  actionButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
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
