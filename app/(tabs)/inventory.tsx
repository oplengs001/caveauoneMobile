import { 
  ChevronLeft, 
  Printer, 
  Check, 
  PackageOpen, 
  Search as SearchIcon,
  Filter,
  Box,
  LayoutGrid
} from 'lucide-react-native';
import { db } from "@/lib/firebase";
import { Stack } from "expo-router";
import { 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  limit, 
  startAfter, 
  where,
  QueryDocumentSnapshot,
  getDoc
} from "firebase/firestore";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { InventoryBottle, Location, MasterWine } from "../../types";
import { printLabels } from "../../utils/printLabels";

// A mapped type that includes the resolved master wine and location data
type BottleView = InventoryBottle & {
  masterWineData?: MasterWine;
  locationData?: Location;
};

const PAGE_SIZE = 10;

export default function InventoryScreen() {
  const [bottles, setBottles] = useState<BottleView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showUnshelvedOnly, setShowUnshelvedOnly] = useState(false);
  const router = useRouter();

  const [wineCache] = useState(new Map<string, MasterWine>());
  const [locationCache] = useState(new Map<string, Location>());

  const fetchInventory = async (isRefresh = false) => {
    if (loadingMore || (!hasMore && !isRefresh)) return;

    if (isRefresh) {
      setRefreshing(true);
      setHasMore(true);
    } else {
      if (bottles.length > 0) setLoadingMore(true);
      else setLoading(true);
    }

    try {
      const bottlesRef = collection(db, "inventory_bottles");
      let q;

      const baseQueries = [];
      if (showUnshelvedOnly) {
        baseQueries.push(where("status", "==", "received"));
      }

      if (searchQuery.trim()) {
        q = query(
          bottlesRef,
          ...baseQueries,
          where("sku", "==", searchQuery.trim()),
          limit(PAGE_SIZE)
        );
      } else {
        q = query(
          bottlesRef,
          ...baseQueries,
          orderBy("createdAt", "desc"),
          limit(PAGE_SIZE)
        );

        if (!isRefresh && lastDoc) {
          q = query(
            bottlesRef,
            ...baseQueries,
            orderBy("createdAt", "desc"),
            startAfter(lastDoc),
            limit(PAGE_SIZE)
          );
        }
      }

      const snap = await getDocs(q);

      const resolved = await Promise.all(snap.docs.map(async (docSnap) => {
        const data = docSnap.data();
        let masterWineData = wineCache.get(data.masterWineRef?.id);
        let locationData = locationCache.get(data.locationRef?.id);

        if (!masterWineData && data.masterWineRef) {
          const wSnap = await getDoc(data.masterWineRef);
          if (wSnap.exists()) {
            masterWineData = { id: wSnap.id, ...(wSnap.data() as object) } as MasterWine;
            wineCache.set(wSnap.id, masterWineData);
          }
        }

        if (!locationData && data.locationRef) {
          const lSnap = await getDoc(data.locationRef);
          if (lSnap.exists()) {
            locationData = { id: lSnap.id, ...(lSnap.data() as object) } as Location;
            locationCache.set(lSnap.id, locationData);
          }
        }

        return {
          id: docSnap.id,
          ...(data as object),
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          masterWineData,
          locationData,
        } as BottleView;
      }));

      if (isRefresh) {
        setBottles(resolved);
        setLastDoc(snap.docs[snap.docs.length - 1]);
        setHasMore(snap.docs.length === PAGE_SIZE);
      } else {
        setBottles(prev => [...prev, ...resolved]);
        if (snap.docs.length > 0) {
          setLastDoc(snap.docs[snap.docs.length - 1]);
        }
        setHasMore(snap.docs.length === PAGE_SIZE);
      }
    } catch (error) {
      console.error("Error fetching inventory: ", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchInventory(true);
    }, 500);
    return () => clearTimeout(delayDebounce);
  }, [searchQuery, showUnshelvedOnly]);

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
    if (next.size === 0) setIsSelectionMode(false);
  };

  const handleBatchPrint = async () => {
    const selectedBottles = bottles.filter(b => selectedIds.has(b.id));
    const labelsData = selectedBottles.map(b => ({
      bottleId: b.id,
      sku: b.sku,
      wineName: b.masterWineData?.name || "Unknown",
      vintage: b.masterWineData?.vintage || "N/V",
      dateAdded: b.createdAt.toLocaleDateString()
    }));

    try {
      await printLabels(labelsData);
      setSelectedIds(new Set());
      setIsSelectionMode(false);
    } catch (error) {
      console.error("Batch print error:", error);
    }
  };

  const onRefresh = useCallback(() => {
    fetchInventory(true);
  }, [searchQuery]);

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case "received":
        return { backgroundColor: "#fef3c7", color: "#92400e" };
      case "shelved":
        return { backgroundColor: "#d1fae5", color: "#065f46" };
      case "consumed":
        return { backgroundColor: "#dbeafe", color: "#1e40af" };
      case "damaged":
      case "lost":
        return { backgroundColor: "#fee2e2", color: "#991b1b" };
      default:
        return { backgroundColor: "#f3f4f6", color: "#4b5563" };
    }
  };

  const renderItem = ({ item }: { item: BottleView }) => {
    const badgeStyle = getStatusBadgeStyle(item.status);
    const isSelected = selectedIds.has(item.id);

    return (
      <TouchableOpacity
        style={[
          styles.itemContainer,
          isSelected && styles.itemSelected
        ]}
        onLongPress={() => {
          setIsSelectionMode(true);
          toggleSelection(item.id);
        }}
        onPress={() => {
          if (isSelectionMode) {
            toggleSelection(item.id);
          }
        }}
        activeOpacity={0.7}
      >
        <View style={styles.itemHeader}>
          <View style={styles.titleContainer}>
            {isSelectionMode && (
              <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                {isSelected && <Check size={12} color="#fff" strokeWidth={3} />}
              </View>
            )}
            <Text style={styles.itemTitle} numberOfLines={1}>
              {item.masterWineData?.name || "Unknown Wine"}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: badgeStyle.backgroundColor },
            ]}
          >
            <Text style={[styles.statusText, { color: badgeStyle.color }]}>
              {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
            </Text>
          </View>
        </View>
        <Text style={styles.itemSubtitle}>
          {item.masterWineData?.vintage || "N/V"} - {item.sku}
        </Text>
        <Text style={styles.itemLocation}>
          Location: {item.locationData?.name || "Not Shelved"}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => {
            if (isSelectionMode) {
              setIsSelectionMode(false);
              setSelectedIds(new Set());
            } else {
              router.back();
            }
          }} 
          style={styles.backButton}
        >
          <ChevronLeft size={28} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
        
        <Text style={styles.title} numberOfLines={1}>
          {isSelectionMode ? `${selectedIds.size} Selected` : "Inventory"}
        </Text>

        <View style={styles.headerActions}>
          {isSelectionMode ? (
            <TouchableOpacity 
              onPress={() => {
                setIsSelectionMode(false);
                setSelectedIds(new Set());
              }} 
              style={styles.cancelButton}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.headerActionChip, showUnshelvedOnly && styles.headerActionChipActive]}
                onPress={() => setShowUnshelvedOnly(!showUnshelvedOnly)}
                activeOpacity={0.7}
              >
                <PackageOpen
                  size={16}
                  color={showUnshelvedOnly ? "#000" : "#fff"}
                  strokeWidth={2.5}
                />
                <Text style={[styles.headerActionText, showUnshelvedOnly && styles.headerActionTextActive]}>
                  Unshelved
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.headerActionChip}
                onPress={() => setIsSelectionMode(true)}
                activeOpacity={0.7}
              >
                <Printer size={16} color="#6366f1" strokeWidth={2.5} />
                <Text style={styles.headerActionText}>Print</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
      
      <View style={styles.topControls}>
        <View style={styles.searchContainer}>
          <View style={styles.searchWrapper}>
            <SearchIcon size={20} color="#9ca3af" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search SKU..."
              placeholderTextColor="#9ca3af"
              value={searchQuery}
              onChangeText={setSearchQuery}
              clearButtonMode="while-editing"
            />
          </View>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#4f46e5" style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={bottles}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          onEndReached={() => fetchInventory(false)}
          onEndReachedThreshold={0.5}
          ListFooterComponent={() => (
            loadingMore ? (
              <ActivityIndicator size="small" color="#4f46e5" style={{ marginVertical: 20 }} />
            ) : null
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#4f46e5"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Box size={64} color="#334155" strokeWidth={1} />
              <Text style={styles.emptyText}>
                {searchQuery ? "No results found." : "No bottles found."}
              </Text>
            </View>
          }
        />
      )}

      {isSelectionMode && (
        <View style={styles.batchActionBar}>
          <View style={styles.batchInfo}>
            <Text style={styles.batchCount}>{selectedIds.size} labels selected</Text>
          </View>
          <TouchableOpacity
            style={[styles.printButton, selectedIds.size === 0 && styles.printButtonDisabled]}
            disabled={selectedIds.size === 0}
            onPress={handleBatchPrint}
          >
            <Printer size={20} color="#fff" strokeWidth={2.5} />
            <Text style={styles.printButtonText}>Print Batch</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 24,
    paddingBottom: 20,
  },
  backButton: {
    marginRight: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#fff",
    flex: 1,
    textTransform: 'uppercase',
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
  },
  headerActionChip: {
    flexDirection: "row",
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: "#1e293b",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
    gap: 6,
  },
  headerActionText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  headerActionTextActive: {
    color: "#000",
  },
  headerActionChipActive: {
    backgroundColor: "#f59e0b",
    borderColor: "#f59e0b",
  },
  cancelButton: {
    backgroundColor: "#334155",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  cancelText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  topControls: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  searchContainer: {
    marginBottom: 4,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: "#1e293b",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 16,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    color: "#ffffff",
    fontSize: 16,
    height: 60,
    fontWeight: "600",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 100,
  },
  itemContainer: {
    backgroundColor: "#1e293b",
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#334155",
  },
  itemSelected: {
    borderColor: "#f59e0b",
    backgroundColor: "#f59e0b10",
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#334155",
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxSelected: {
    backgroundColor: "#f59e0b",
    borderColor: "#f59e0b",
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  itemTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
    flex: 1,
  },
  itemSubtitle: {
    fontSize: 14,
    color: "#94a3b8",
    marginBottom: 6,
    fontWeight: '500',
  },
  itemLocation: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: 'uppercase',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
    gap: 16,
  },
  emptyText: {
    color: "#475569",
    textAlign: "center",
    fontSize: 16,
    fontWeight: '600',
  },
  batchActionBar: {
    position: "absolute",
    bottom: 32,
    left: 24,
    right: 24,
    backgroundColor: "#1e293b",
    padding: 16,
    borderRadius: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 1,
    borderColor: "#334155",
  },
  batchInfo: {
    flex: 1,
    paddingLeft: 8,
  },
  batchCount: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  printButton: {
    backgroundColor: "#f59e0b",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#f59e0b",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  printButtonDisabled: {
    backgroundColor: "#334155",
    opacity: 0.5,
    shadowOpacity: 0,
  },
  printButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111827",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 24,
    paddingBottom: 12,
  },
  backButton: {
    marginRight: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#fff",
    flex: 1,
    marginRight: 12,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
  },
  headerActionChip: {
    flexDirection: "row",
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#1f2937",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#374151",
    gap: 6,
  },
  headerActionText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  headerActionTextActive: {
    color: "#000",
  },
  headerActionChipActive: {
    backgroundColor: "#f59e0b",
    borderColor: "#f59e0b",
  },
  cancelButton: {
    backgroundColor: "#374151",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  cancelText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  topControls: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  searchContainer: {
    marginBottom: 8,
  },
  filterBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1f2937",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: "#374151",
  },
  filterChipActive: {
    backgroundColor: "#f59e0b",
    borderColor: "#f59e0b",
  },
  filterText: {
    color: "#9ca3af",
    fontSize: 14,
    fontWeight: "700",
  },
  filterTextActive: {
    color: "#000",
  },
  batchButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1f2937",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: "#374151",
  },
  batchButtonText: {
    color: "#3b82f6",
    fontSize: 14,
    fontWeight: "800",
  },
  searchInput: {
    backgroundColor: "#1f2937",
    color: "#ffffff",
    fontSize: 18,
    height: 60,
    paddingHorizontal: 16,
    borderRadius: 12,
    fontWeight: "600",
    borderWidth: 1,
    borderColor: "#374151",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  itemContainer: {
    backgroundColor: "#1f2937",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#374151",
  },
  itemSelected: {
    borderColor: "#f59e0b",
    backgroundColor: "#f59e0b10",
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxSelected: {
    backgroundColor: "#f59e0b",
    borderColor: "#f59e0b",
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  itemTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#ffffff",
    flex: 1,
    marginRight: 8,
  },
  itemSubtitle: {
    fontSize: 14,
    color: "#9ca3af",
    marginBottom: 4,
  },
  itemLocation: {
    fontSize: 14,
    color: "#9ca3af",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "500",
  },
  emptyText: {
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 40,
    fontSize: 16,
  },
  batchActionBar: {
    position: "absolute",
    bottom: 24,
    left: 24,
    right: 24,
    backgroundColor: "#1f2937",
    padding: 16,
    borderRadius: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
    borderWidth: 1,
    borderColor: "#374151",
  },
  batchInfo: {
    flex: 1,
  },
  batchCount: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  printButton: {
    backgroundColor: "#f59e0b",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  printButtonDisabled: {
    backgroundColor: "#374151",
    opacity: 0.5,
  },
  printButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
});
