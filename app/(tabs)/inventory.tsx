import { db } from "@/lib/firebase";
import { Stack } from "expo-router";
import {
  QueryDocumentSnapshot,
  collection,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where
} from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { InventoryBottle, Location, MasterWine } from "../../types";

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

      if (searchQuery.trim()) {
        // Simple SKU search if searching
        q = query(
          bottlesRef,
          where("sku", "==", searchQuery.trim()),
          limit(PAGE_SIZE)
        );
      } else {
        q = query(
          bottlesRef,
          orderBy("createdAt", "desc"),
          limit(PAGE_SIZE)
        );

        if (!isRefresh && lastDoc) {
          q = query(
            bottlesRef,
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
  }, [searchQuery]);

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
    return (
      <View style={styles.itemContainer}>
        <View style={styles.itemHeader}>
          <Text style={styles.itemTitle} numberOfLines={1}>
            {item.masterWineData?.name || "Unknown Wine"}
          </Text>
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
      </View>
    );
  };

  const filteredBottles = bottles;

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: "Inventory" }} />
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by wine, vintage, or code..."
          placeholderTextColor="#9ca3af"
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,

    backgroundColor: "#111827",
  },
  searchContainer: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
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
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
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
});
