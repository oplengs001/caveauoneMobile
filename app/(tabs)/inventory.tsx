import { db } from "@/lib/firebase";
import { Stack } from "expo-router";
import { collection, getDocs } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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

export default function InventoryScreen() {
  const [bottles, setBottles] = useState<BottleView[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchInventory = async () => {
    setLoading(true);
    try {
      // Fetch all physical bottles
      const bottlesSnap = await getDocs(collection(db, "inventory_bottles"));

      // Fetch the catalogs to map the DocumentReferences into readable names
      const [winesSnap, locationsSnap] = await Promise.all([
        getDocs(collection(db, "master_wines")),
        getDocs(collection(db, "locations")),
      ]);

      const winesMap = new Map(
        winesSnap.docs.map((doc) => [
          doc.id,
          { id: doc.id, ...doc.data() } as MasterWine,
        ]),
      );
      const locationsMap = new Map(
        locationsSnap.docs.map((doc) => [
          doc.id,
          { id: doc.id, ...doc.data() } as Location,
        ]),
      );

      const resolvedBottles: BottleView[] = bottlesSnap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Handle Firestore timestamps
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          // Resolve references
          masterWineData: data.masterWineRef
            ? winesMap.get(data.masterWineRef.id)
            : undefined,
          locationData: data.locationRef
            ? locationsMap.get(data.locationRef.id)
            : undefined,
        } as BottleView;
      });

      // Sort by newest first
      resolvedBottles.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );

      setBottles(resolvedBottles);
    } catch (error) {
      console.error("Error fetching inventory: ", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

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
          {item.masterWineData?.vintage || "N/V"} - {item.failSafeCode}
        </Text>
        <Text style={styles.itemLocation}>
          Location: {item.locationData?.name || "Not Shelved"}
        </Text>
      </View>
    );
  };

  const filteredBottles = bottles.filter((bottle) => {
    if (!searchQuery) {
      return true;
    }
    const lowercasedQuery = searchQuery.toLowerCase();
    const wineName = bottle.masterWineData?.name?.toLowerCase() || "";
    const vintage = bottle.masterWineData?.vintage?.toLowerCase() || "";
    const failSafeCode = bottle.failSafeCode?.toLowerCase() || "";

    return (
      wineName.includes(lowercasedQuery) ||
      vintage.includes(lowercasedQuery) ||
      failSafeCode.includes(lowercasedQuery)
    );
  });

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
