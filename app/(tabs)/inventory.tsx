import { IconSymbol } from "@/components/ui/icon-symbol";
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

  // Caches to avoid redundant lookups
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
                {isSelected && <IconSymbol name="checkmark" size={12} color="#fff" />}
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

  const filteredBottles = bottles;

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
          <IconSymbol name="chevron.left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>
          {isSelectionMode ? `${selectedIds.size} Selected` : "Inventory"}
        </Text>
        {isSelectionMode && (
          <TouchableOpacity 
            onPress={() => {
              setIsSelectionMode(false);
              setSelectedIds(new Set());
            }} 
            style={styles.cancelButton}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
      
      <View style={styles.topControls}>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search SKU..."
            placeholderTextColor="#9ca3af"
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
        </View>

        <View style={styles.filterBar}>
          <TouchableOpacity
            style={[styles.filterChip, showUnshelvedOnly && styles.filterChipActive]}
            onPress={() => setShowUnshelvedOnly(!showUnshelvedOnly)}
          >
            <IconSymbol
              name="tray.and.arrow.down"
              size={14}
              color={showUnshelvedOnly ? "#fff" : "#9ca3af"}
            />
            <Text style={[styles.filterText, showUnshelvedOnly && styles.filterTextActive]}>
              Unshelved Only
            </Text>
          </TouchableOpacity>

          {!isSelectionMode && bottles.length > 0 && (
            <TouchableOpacity
              style={styles.batchTrigger}
              onPress={() => setIsSelectionMode(true)}
            >
              <Text style={styles.batchTriggerText}>Select for Printing</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      {loading ? (
        <ActivityIndicator size="large" color="#ffffff" style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={filteredBottles}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          onEndReached={() => fetchInventory(false)}
          onEndReachedThreshold={0.5}
          ListFooterComponent={() => (
            loadingMore ? (
              <ActivityIndicator size="small" color="#ffffff" style={{ marginVertical: 20 }} />
            ) : null
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#ffffff"
            />
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {searchQuery ? "No results found." : "No bottles found."}
            </Text>
          }
        />
      )}

      {isSelectionMode && (
        <View style={styles.batchActionBar}>
          <View style={styles.batchInfo}>
            <Text style={styles.batchCount}>{selectedIds.size} labels to print</Text>
          </View>
          <TouchableOpacity
            style={[styles.printButton, selectedIds.size === 0 && styles.printButtonDisabled]}
            disabled={selectedIds.size === 0}
            onPress={handleBatchPrint}
          >
            <IconSymbol name="printer.fill" size={20} color="#fff" />
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
    fontSize: 28,
    fontWeight: "900",
    color: "#fff",
    flex: 1,
  },
  cancelButton: {
    paddingVertical: 6,
  },
  cancelText: {
    color: "#f59e0b",
    fontSize: 14,
    fontWeight: "700",
  },
  topControls: {
    paddingHorizontal: 16,
    gap: 12,
  },
  searchContainer: {
    flex: 1,
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: "#374151",
  },
  filterChipActive: {
    backgroundColor: "#f59e0b",
    borderColor: "#f59e0b",
  },
  filterText: {
    color: "#9ca3af",
    fontSize: 13,
    fontWeight: "600",
  },
  filterTextActive: {
    color: "#fff",
  },
  batchTrigger: {
    paddingVertical: 6,
  },
  batchTriggerText: {
    color: "#3b82f6",
    fontSize: 13,
    fontWeight: "700",
  },
  searchInput: {
    backgroundColor: "#1f2937",
    color: "#ffffff",
    fontSize: 16,
    padding: 12,
    borderRadius: 8,
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
