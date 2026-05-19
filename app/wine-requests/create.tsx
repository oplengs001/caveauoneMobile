import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { MasterWine } from "@/types";
import { Stack, useRouter } from "expo-router";
import {
  addDoc,
  collection,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import {
  ChevronLeft,
  Minus,
  Plus,
  Search,
  Send,
  ShoppingCart,
  Trash2,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const { height } = Dimensions.get("window");

export default function CreateWineRequest() {
  const router = useRouter();
  const { profile } = useAuth();
  const theme = Colors.store;
  [];

  const [searchQuery, setSearchQuery] = useState("");
  const [locations, setLocations] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [selectedLocationId, setSelectedLocationId] = useState<string>("all");
  const [masterWines, setMasterWines] = useState<
    (MasterWine & { stock: number; stockByLocation: Record<string, number> })[]
  >([]);
  const [fetchingWines, setFetchingWines] = useState(false);
  const [selectedItems, setSelectedItems] = useState<
    {
      wine: MasterWine & {
        stock: number;
        stockByLocation: Record<string, number>;
      };
      qty: number;
    }[]
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [groupedForUI, setGroupedForUI] = useState<
    Record<string, { items: typeof selectedItems; locationName: string }>
  >({});

  useEffect(() => {
    fetchWines();
  }, []);

  const fetchWines = async (isRefresh = false) => {
    if (!isRefresh) setFetchingWines(true);
    try {
      const [winesSnap, bottlesSnap, storesSnap] = await Promise.all([
        getDocs(collection(db, "master_wines")),
        getDocs(collection(db, "inventory_bottles")),
        getDocs(collection(db, "stores")),
      ]);

      const storesData = storesSnap.docs.map((d) => ({
        id: d.id,
        name: d.data().name,
      }));
      const bottlesData = bottlesSnap.docs.map((d) => d.data());

      const availableStores = storesData.filter(
        (s) => s.id !== profile?.locationId,
      );
      setLocations(availableStores);

      const winesWithStock = winesSnap.docs.map((doc) => {
        const wine = { id: doc.id, ...doc.data() } as MasterWine;

        let totalStock = 0;
        const stockByLoc: Record<string, number> = {};

        availableStores.forEach((store) => {
          stockByLoc[store.id] = 0;
        });

        bottlesData.forEach((b) => {
          if (
            b.masterWineRef?.id === doc.id &&
            (b.status === "received" || b.status === "shelved") &&
            b.storeRef?.id &&
            b.storeRef.id !== profile?.locationId
          ) {
            stockByLoc[b.storeRef.id] = (stockByLoc[b.storeRef.id] || 0) + 1;
            totalStock++;
          }
        });

        return { ...wine, stock: totalStock, stockByLocation: stockByLoc };
      });

      setMasterWines(winesWithStock);
    } catch (error) {
      console.error("Error fetching wines:", error);
    } finally {
      if (!isRefresh) setFetchingWines(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchWines(true);
    setRefreshing(false);
  };

  const filteredWines = masterWines.filter((w) => {
    const matchesSearch =
      w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.sku?.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (selectedLocationId === "all") {
      return true;
    } else {
      return w.stockByLocation[selectedLocationId] > 0;
    }
  });

  const addItem = (
    wine: MasterWine & {
      stock: number;
      stockByLocation: Record<string, number>;
    },
  ) => {
    const displayStock =
      selectedLocationId === "all"
        ? wine.stock
        : wine.stockByLocation[selectedLocationId] || 0;

    if (displayStock <= 0) {
      Alert.alert(
        "Out of Stock",
        "This wine is currently unavailable in the warehouse.",
      );
      return;
    }

    const existing = selectedItems.find((i) => i.wine.id === wine.id);
    if (existing) {
      if (existing.qty + 1 > displayStock) return;
      updateQty(wine.id, 1);
    } else {
      setSelectedItems([...selectedItems, { wine, qty: 1 }]);
    }
  };

  const updateQty = (wineId: string, delta: number) => {
    setSelectedItems((prev) =>
      prev.map((item) => {
        if (item.wine.id === wineId) {
          const newQty = Math.max(1, item.qty + delta);
          if (newQty > item.wine.stock) return item;
          return { ...item, qty: newQty };
        }
        return item;
      }),
    );
  };

  const removeItem = (wineId: string) => {
    setSelectedItems((prev) => prev.filter((i) => i.wine.id !== wineId));
  };

  const totalQty = selectedItems.reduce((acc, item) => acc + item.qty, 0);

  const groupItemsByFulfillment = (
    itemsToGroup: typeof selectedItems,
    allLocations: typeof locations,
  ) => {
    if (itemsToGroup.length === 0) return {};

    const itemAssignments: Map<string, string> = new Map(); // wine.id -> locationId
    const usedLocations: Set<string> = new Set();

    const sortedItems = [...itemsToGroup].sort((a, b) => {
      const aOptions = Object.keys(a.wine.stockByLocation).filter(
        (locId) => a.wine.stockByLocation[locId] >= a.qty,
      ).length;
      const bOptions = Object.keys(b.wine.stockByLocation).filter(
        (locId) => b.wine.stockByLocation[locId] >= b.qty,
      ).length;
      return aOptions - bOptions;
    });

    for (const item of sortedItems) {
      const potentialLocations = Object.keys(item.wine.stockByLocation).filter(
        (locId) => item.wine.stockByLocation[locId] >= item.qty,
      );

      if (potentialLocations.length === 0) {
        itemAssignments.set(item.wine.id, "unfulfillable");
        continue;
      }

      let assignedLocation: string | undefined;

      const preferredLocation = potentialLocations.find((loc) =>
        usedLocations.has(loc),
      );

      if (preferredLocation) {
        assignedLocation = preferredLocation;
      } else {
        assignedLocation = potentialLocations.reduce((best, current) => {
          return item.wine.stockByLocation[current] >
            item.wine.stockByLocation[best]
            ? current
            : best;
        });
      }

      itemAssignments.set(item.wine.id, assignedLocation);
      usedLocations.add(assignedLocation);
    }

    const grouped: Record<
      string,
      { items: typeof selectedItems; locationName: string }
    > = {};

    for (const item of itemsToGroup) {
      const locId = itemAssignments.get(item.wine.id);
      if (locId) {
        if (!grouped[locId]) {
          grouped[locId] = {
            items: [],
            locationName:
              locId === "unfulfillable"
                ? "Unfulfillable"
                : allLocations.find((l) => l.id === locId)?.name ||
                  "Unknown Location",
          };
        }
        grouped[locId].items.push(item);
      }
    }

    return grouped;
  };

  useEffect(() => {
    const groups = groupItemsByFulfillment(selectedItems, locations);
    setGroupedForUI(groups);
  }, [selectedItems, locations]);

  const createRequestObject = (
    items: typeof selectedItems,
    targetStoreId: string,
  ) => {
    return {
      storeId: profile?.locationId || "unknown_store",
      targetStoreId: targetStoreId,
      requesterId: profile?.id || "anonymous",
      createdBy: profile?.email || "unknown",
      status: "pending",
      items: items.map((item) => ({
        masterWineId: item.wine.id,
        wineName: item.wine.name,
        vintage: item.wine.vintage,
        format: item.wine.format,
        producer: item.wine.producer || "",
        sku: item.wine.sku || "N/A",
        price: item.wine.price || 0,
        qty: item.qty,
        pulledQty: 0,
      })),
      totalAmount: items.reduce(
        (sum, item) => sum + (item.wine.price || 0) * item.qty,
        0,
      ),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
  };

  const handleSubmit = async () => {
    if (selectedItems.length === 0) return;

    setSubmitting(true);
    try {
      const groups = groupItemsByFulfillment(selectedItems, locations);

      if (groups["unfulfillable"]) {
        Alert.alert(
          "Unfulfillable Items",
          "Some items cannot be fulfilled with the requested quantity from a single location. Please adjust quantities.",
          [{ text: "OK" }],
        );
        setSubmitting(false);
        return;
      }

      const requests = Object.entries(groups).map(([locationId, group]) => {
        return createRequestObject(group.items, locationId);
      });

      await Promise.all(
        requests.map((req) => addDoc(collection(db, "wine_requests"), req)),
      );

      Alert.alert(
        `Request${requests.length > 1 ? "s" : ""} Sent`,
        `Your ${requests.length} requisition${requests.length > 1 ? "s have" : " has"} been dispatched.`,
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderWineItem = ({
    item,
  }: {
    item: MasterWine & {
      stock: number;
      stockByLocation: Record<string, number>;
    };
  }) => {
    const displayStock =
      selectedLocationId === "all"
        ? item.stock
        : item.stockByLocation[selectedLocationId] || 0;
    const isOutOfStock = displayStock <= 0;
    const selectedCount =
      selectedItems.find((si) => si.wine.id === item.id)?.qty || 0;

    const locationsWithStock = Object.entries(item.stockByLocation)
      .filter(([, stock]) => stock > 0)
      .map(([locId]) => locations.find((l) => l.id === locId)?.name)
      .filter(Boolean) as string[];

    return (
      <TouchableOpacity
        style={[
          styles.wineCard,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
        onPress={() => addItem(item)}
        disabled={isOutOfStock}
      >
        <View style={styles.wineInfo}>
          <Text style={[styles.wineName, { color: theme.text }]}>
            {item.name}
          </Text>
          <Text
            style={[
              styles.wineSub,
              { color: theme.textSecondary, marginBottom: 6 },
            ]}
          >
            {item.vintage} • {item.producer} • {item.format}
          </Text>
          {selectedLocationId === "all" && locationsWithStock.length > 0 && (
            <View style={styles.locationInfo}>
              <Text
                style={[styles.locationText, { color: theme.textSecondary }]}
                numberOfLines={1}
              >
                Available at: {locationsWithStock.join(", ")}
              </Text>
            </View>
          )}
          <View style={styles.wineMeta}>
            <Text
              style={[
                styles.wineSub,
                { color: theme.textSecondary, fontSize: 11, fontWeight: "700" },
              ]}
            >
              SKU: {item.sku || "N/A"}
            </Text>
            <View
              style={[
                styles.stockBadge,
                {
                  backgroundColor: isOutOfStock
                    ? theme.danger + "15"
                    : theme.secondary + "15",
                },
              ]}
            >
              <Text
                style={[
                  styles.stockText,
                  { color: isOutOfStock ? theme.danger : theme.secondary },
                ]}
              >
                {displayStock} IN STOCK
              </Text>
            </View>
          </View>
        </View>
        <View
          style={[
            styles.addIcon,
            { backgroundColor: isOutOfStock ? theme.border : theme.primary },
          ]}
        >
          {selectedCount > 0 ? (
            <Text style={styles.countLabel}>{selectedCount}</Text>
          ) : (
            <Plus size={20} color="#fff" />
          )}
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
        <View>
          <Text style={[styles.title, { color: theme.primary }]}>
            Create Requisition
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Browse Inventory Stock
          </Text>
        </View>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.searchSection}>
        <View
          style={[
            styles.searchBar,
            { borderColor: theme.border, backgroundColor: theme.card },
          ]}
        >
          <Search size={20} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Find a wine..."
            placeholderTextColor={theme.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 12 }}
        >
          <TouchableOpacity
            style={[
              styles.pill,
              selectedLocationId === "all"
                ? { backgroundColor: theme.primary, borderColor: theme.primary }
                : { backgroundColor: theme.card, borderColor: theme.border },
            ]}
            onPress={() => setSelectedLocationId("all")}
          >
            <Text
              style={[
                styles.pillText,
                {
                  color:
                    selectedLocationId === "all" ? "#fff" : theme.textSecondary,
                },
              ]}
            >
              All Locations
            </Text>
          </TouchableOpacity>
          {locations.map((loc) => (
            <TouchableOpacity
              key={loc.id}
              style={[
                styles.pill,
                selectedLocationId === loc.id
                  ? {
                      backgroundColor: theme.primary,
                      borderColor: theme.primary,
                    }
                  : { backgroundColor: theme.card, borderColor: theme.border },
              ]}
              onPress={() => setSelectedLocationId(loc.id)}
            >
              <Text
                style={[
                  styles.pillText,
                  {
                    color:
                      selectedLocationId === loc.id
                        ? "#fff"
                        : theme.textSecondary,
                  },
                ]}
              >
                {loc.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {fetchingWines ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Syncing Vintages...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredWines}
          keyExtractor={(item) => item.id}
          renderItem={renderWineItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.primary}
            />
          }
        />
      )}

      {selectedItems.length > 0 && (
        <View
          style={[
            styles.summaryFooter,
            { backgroundColor: theme.card, borderTopColor: theme.border },
          ]}
        >
          <View style={styles.summaryTop}>
            <View style={styles.summaryLabelRow}>
              <ShoppingCart size={16} color={theme.primary} />
              <Text
                style={[styles.summaryLabel, { color: theme.textSecondary }]}
              >
                SELECTED ITEMS ({selectedItems.length})
              </Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedItems([])}>
              <Text
                style={{ color: theme.danger, fontWeight: "800", fontSize: 11 }}
              >
                CLEAR ALL
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            style={styles.cartItemsContainer}
            showsHorizontalScrollIndicator={false}
          >
            {Object.entries(groupedForUI).map(([locationId, group]) => (
              <View key={locationId} style={styles.cartGroup}>
                <Text
                  style={[
                    styles.cartGroupTitle,
                    {
                      color:
                        locationId === "unfulfillable"
                          ? theme.danger
                          : theme.secondary,
                    },
                  ]}
                >
                  FROM: {group.locationName.toUpperCase()}
                </Text>
                <View>
                  {group.items.map((item) => (
                    <View
                      key={item.wine.id}
                      style={[styles.cartItem, { borderColor: theme.border }]}
                    >
                      <Text
                        style={[styles.cartItemName, { color: theme.text }]}
                        numberOfLines={1}
                      >
                        {item.wine.name}
                      </Text>
                      <View style={styles.cartControls}>
                        <TouchableOpacity
                          onPress={() => updateQty(item.wine.id, -1)}
                          style={styles.miniBtn}
                        >
                          <Minus size={14} color={theme.primary} />
                        </TouchableOpacity>
                        <Text style={[styles.cartQty, { color: theme.text }]}>
                          {item.qty}
                        </Text>
                        <TouchableOpacity
                          onPress={() => updateQty(item.wine.id, 1)}
                          style={styles.miniBtn}
                        >
                          <Plus size={14} color={theme.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => removeItem(item.wine.id)}
                          style={[styles.miniBtn, { marginLeft: 4 }]}
                        >
                          <Trash2 size={14} color={theme.danger} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={[
              styles.submitButton,
              { backgroundColor: theme.primary },
              submitting && { opacity: 0.7 },
            ]}
            disabled={submitting}
            onPress={handleSubmit}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.submitText}>
                  SUBMIT TO ADMIN ({totalQty})
                </Text>
                <Send size={18} color="#fff" strokeWidth={2.5} />
              </>
            )}
          </TouchableOpacity>
        </View>
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
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
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
  searchSection: {
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontWeight: "700",
    fontSize: 13,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  listContent: {
    padding: 24,
    paddingTop: 0,
    paddingBottom: 200,
  },
  wineCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
  },
  wineInfo: {
    flex: 1,
  },
  wineName: {
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 6,
  },
  wineMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  wineSub: {
    fontSize: 12,
    fontWeight: "500",
  },
  locationInfo: {
    marginTop: 4,
    marginBottom: 8,
  },
  locationText: {
    fontSize: 11,
    fontWeight: "600",
    fontStyle: "italic",
  },
  stockBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  stockText: {
    fontSize: 9,
    fontWeight: "900",
  },
  addIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  countLabel: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 16,
  },
  summaryFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    borderTopWidth: 1,
    elevation: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
  },
  summaryTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  summaryLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  cartItemsContainer: {
    maxHeight: 150,
    marginBottom: 16,
  },
  cartGroup: {
    marginRight: 16,
    width: 280,
  },
  cartGroupTitle: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  cartItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 6,
    backgroundColor: "rgba(0,0,0,0.02)",
  },
  cartItemName: {
    fontSize: 11,
    fontWeight: "800",
    flex: 1,
    marginRight: 8,
  },
  cartControls: {
    flexDirection: "row",
    alignItems: "center",
  },
  miniBtn: {
    padding: 4,
  },
  cartQty: {
    fontSize: 13,
    fontWeight: "900",
  },
  submitButton: {
    height: 56,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  submitText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1,
  },
});
