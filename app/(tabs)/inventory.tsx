import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { Stack, useRouter } from "expo-router";
import {
  QueryDocumentSnapshot,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from "firebase/firestore";
import {
  ArrowUpDown,
  Box,
  Calendar,
  Check,
  ChevronLeft,
  Filter,
  Globe,
  Layers,
  Scan,
  Search as SearchIcon,
  Tag,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
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
  const { profile } = useAuth();
  const theme = profile?.role === "store" ? Colors.store : Colors.warehouse;
  const isStore = profile?.role === "store";

  const [bottles, setBottles] = useState<BottleView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const [sections, setSections] = useState<
    { title: string; masterWineData?: MasterWine; data: BottleView[] }[]
  >([]);

  const [sortBy, setSortBy] = useState<"name_asc" | "name_desc" | "stock_desc" | "stock_asc">("name_asc");
  const [filterType, setFilterType] = useState<string | null>(null);
  const [isSortModalOpen, setIsSortModalOpen] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

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
      const baseQueries = [];

      // Boutique Scoping: If store user, only show their node's inventory
      if (isStore && profile?.locationId) {
        baseQueries.push(
          where("storeRef", "==", doc(db, "stores", profile.locationId)),
        );
      }

      const isSearching = searchQuery.trim().length > 0;
      const fetchLimit = isSearching ? 200 : PAGE_SIZE;

      let q = query(
        bottlesRef,
        ...baseQueries,
        orderBy("createdAt", "desc"),
        limit(fetchLimit),
      );

      if (!isRefresh && lastDoc && !isSearching) {
        q = query(
          bottlesRef,
          ...baseQueries,
          orderBy("createdAt", "desc"),
          startAfter(lastDoc),
          limit(PAGE_SIZE),
        );
      }

      const snap = await getDocs(q);

      const resolved = await Promise.all(
        snap.docs.map(async (docSnap) => {
          const data = docSnap.data();
          let masterWineData = wineCache.get(data.masterWineRef?.id);
          let locationData = locationCache.get(data.locationRef?.id);

          if (!masterWineData && data.masterWineRef) {
            const wSnap = await getDoc(data.masterWineRef);
            if (wSnap.exists()) {
              masterWineData = {
                id: wSnap.id,
                ...(wSnap.data() as object),
              } as MasterWine;
              wineCache.set(wSnap.id, masterWineData);
            }
          }

          if (!locationData && data.locationRef) {
            const lSnap = await getDoc(data.locationRef);
            if (lSnap.exists()) {
              locationData = {
                id: lSnap.id,
                ...(lSnap.data() as object),
              } as Location;
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
        }),
      );

      if (isSearching) {
        const queryLower = searchQuery.toLowerCase();
        resolved.filter((b) => {
          return (
            b.sku?.toLowerCase().includes(queryLower) ||
            b.masterWineData?.name?.toLowerCase().includes(queryLower) ||
            b.masterWineData?.producer?.toLowerCase().includes(queryLower)
          );
        });
      }

      if (isRefresh) {
        setBottles(resolved);
        setLastDoc(snap.docs[snap.docs.length - 1]);
        setHasMore(snap.docs.length === PAGE_SIZE);
      } else {
        setBottles((prev) => [...prev, ...resolved]);
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

  useEffect(() => {
    // 1. Filter by wine type
    const filteredBottles = filterType
      ? bottles.filter(b => b.masterWineData?.type === filterType)
      : bottles;

    const grouped = filteredBottles.reduce(
      (
        acc,
        bottle,
      ): Record<
        string,
        { title: string; masterWineData?: MasterWine; data: BottleView[] }
      > => {
        const wineId = bottle.masterWineRef?.id || "unknown";
        if (!acc[wineId]) {
          acc[wineId] = {
            title: bottle.masterWineData?.name || "Unknown Wine",
            masterWineData: bottle.masterWineData,
            data: [],
          };
        }
        acc[wineId].data.push(bottle);
        return acc;
      },
      {},
    );

    const groupsArray = Object.values(grouped);

    // 2. Sort
    if (sortBy === "name_asc") {
      groupsArray.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === "name_desc") {
      groupsArray.sort((a, b) => b.title.localeCompare(a.title));
    } else if (sortBy === "stock_desc") {
      groupsArray.sort((a, b) => b.data.length - a.data.length);
    } else if (sortBy === "stock_asc") {
      groupsArray.sort((a, b) => a.data.length - b.data.length);
    }

    setSections(groupsArray);
  }, [bottles, sortBy, filterType]);

  const onRefresh = useCallback(() => {
    fetchInventory(true);
  }, [searchQuery]);

  const renderItem = ({
    item,
  }: {
    item: { title: string; masterWineData?: MasterWine; data: BottleView[] };
  }) => {
    const { masterWineData, data: bottles } = item;
    const stockCount = bottles.length;

    if (!masterWineData) {
      return null; // Or a placeholder
    }

    const locationCounts = bottles.reduce(
      (acc, bottle) => {
        const locName = bottle.locationData?.name || "Unassigned";
        acc[locName] = (acc[locName] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return (
      <View
        style={[
          styles.itemContainer,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        <View style={styles.cardBody}>
          <View style={styles.stockInfo}>
            <Text style={[styles.stockCount, { color: theme.text }]}>
              {stockCount}
            </Text>
            <Text style={[styles.stockLabel, { color: theme.textSecondary }]}>
              in stock
            </Text>
          </View>
          <View style={styles.wineInfo}>
            <Text style={[styles.wineName, { color: theme.text }]}>
              {masterWineData.name}
            </Text>
            <Text
              style={[styles.wineProducer, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              {masterWineData.producer || "Unknown Producer"}
            </Text>

            <View style={styles.detailsGrid}>
              <View style={styles.detailItem}>
                <Calendar size={14} color={theme.textSecondary} />
                <Text style={[styles.detailText, { color: theme.text }]}>
                  {masterWineData.vintage || "N/A"}
                </Text>
              </View>
              <View style={styles.detailItem}>
                <Layers size={14} color={theme.textSecondary} />
                <Text style={[styles.detailText, { color: theme.text }]}>
                  {masterWineData.format || "N/A"}
                </Text>
              </View>
              <View style={styles.detailItem}>
                <Tag size={14} color={theme.textSecondary} />
                <Text style={[styles.detailText, { color: theme.text }]}>
                  {masterWineData.type || "N/A"}
                </Text>
              </View>
              <View style={styles.detailItem}>
                <Globe size={14} color={theme.textSecondary} />
                <Text
                  style={[styles.detailText, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {[(masterWineData as any).country, masterWineData.region]
                    .filter(Boolean)
                    .join(", ") || "N/A"}
                </Text>
              </View>
            </View>

            {Object.keys(locationCounts).length > 0 && (
              <View style={styles.locationsContainer}>
                {Object.entries(locationCounts).map(([locName, count]) => (
                  <View
                    key={locName}
                    style={[
                      styles.locationPill,
                      { backgroundColor: theme.primary + "15" },
                    ]}
                  >
                    <View
                      style={[
                        styles.locationCountBadge,
                        { backgroundColor: theme.primary },
                      ]}
                    >
                      <Text style={styles.locationCountText}>{count}</Text>
                    </View>
                    <Text
                      style={[
                        styles.locationNameText,
                        { color: theme.primary },
                      ]}
                    >
                      {locName}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View
        style={[
          styles.header,
          {
            borderBottomWidth: isStore ? 1 : 0,
            borderBottomColor: theme.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <ChevronLeft size={28} color={theme.primary} strokeWidth={2.5} />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.primary }]}>
            Inventory
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {isStore ? "Boutique View" : "Warehouse View"}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[
                styles.headerActionChip,
                { backgroundColor: theme.primary, borderColor: theme.primary },
              ]}
              onPress={() => router.push("/tagging")}
              activeOpacity={0.7}
            >
              <Scan size={16} color="#fff" strokeWidth={2.5} />
              <Text style={[styles.headerActionText, { color: "#fff" }]}>
                Scan to Update
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.topControls}>
        <View style={styles.searchContainer}>
          <View
            style={[
              styles.searchWrapper,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
                borderRadius: 16,
              },
            ]}
          >
            <SearchIcon
              size={20}
              color={theme.textSecondary}
              style={styles.searchIcon}
            />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Omni Search (SKU, Wine, Producer)..."
              placeholderTextColor="#9ca3af"
              value={searchQuery}
              onChangeText={setSearchQuery}
              clearButtonMode="while-editing"
            />
          </View>
        </View>

        <View
          style={[styles.filterSortRow, { marginBottom: isStore ? 16 : 4 }]}
        >
          <TouchableOpacity
            style={[
              styles.filterSortBtn,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
            onPress={() => setIsSortModalOpen(true)}
          >
            <ArrowUpDown size={16} color={theme.textSecondary} />
            <Text style={[styles.filterSortText, { color: theme.text }]}>
              Sort By
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterSortBtn,
              { backgroundColor: filterType ? theme.primary + '20' : theme.card, borderColor: filterType ? theme.primary : theme.border },
            ]}
            onPress={() => setIsFilterModalOpen(true)}
          >
            <Filter size={16} color={filterType ? theme.primary : theme.textSecondary} />
            <Text style={[styles.filterSortText, { color: filterType ? theme.primary : theme.text }]}>
              {filterType ? filterType : "Filters"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#4f46e5" style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={sections}
          renderItem={renderItem}
          keyExtractor={(item) => item.masterWineData?.id || item.title}
          contentContainerStyle={styles.listContent}
          onEndReached={() => fetchInventory(false)}
          onEndReachedThreshold={0.5}
          ListFooterComponent={() =>
            loadingMore ? (
              <ActivityIndicator
                size="small"
                color="#4f46e5"
                style={{ marginVertical: 20 }}
              />
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#4f46e5"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Box size={64} color={theme.border} strokeWidth={1} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                {searchQuery ? "No results found." : "No bottles found."}
              </Text>
            </View>
          }
        />
      )}

      {/* Sort Modal */}
      <Modal visible={isSortModalOpen} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Sort Inventory</Text>
              <TouchableOpacity onPress={() => setIsSortModalOpen(false)}>
                <X size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            {[
              { id: "name_asc", label: "Name (A to Z)" },
              { id: "name_desc", label: "Name (Z to A)" },
              { id: "stock_desc", label: "Highest Stock First" },
              { id: "stock_asc", label: "Lowest Stock First" },
            ].map((option) => (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.modalOption,
                  { borderColor: theme.border },
                  sortBy === option.id && { borderColor: theme.primary, backgroundColor: theme.primary + '10' }
                ]}
                onPress={() => { setSortBy(option.id as any); setIsSortModalOpen(false); }}
              >
                <Text style={[styles.modalOptionText, { color: theme.text }, sortBy === option.id && { color: theme.primary }]}>
                  {option.label}
                </Text>
                {sortBy === option.id && <Check size={20} color={theme.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Filter Modal */}
      <Modal visible={isFilterModalOpen} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Filter by Type</Text>
              <TouchableOpacity onPress={() => setIsFilterModalOpen(false)}>
                <X size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                style={[
                  styles.modalOption,
                  { borderColor: theme.border },
                  filterType === null && { borderColor: theme.primary, backgroundColor: theme.primary + '10' }
                ]}
                onPress={() => { setFilterType(null); setIsFilterModalOpen(false); }}
              >
                <Text style={[styles.modalOptionText, { color: theme.text }, filterType === null && { color: theme.primary }]}>
                  All Types
                </Text>
                {filterType === null && <Check size={20} color={theme.primary} />}
              </TouchableOpacity>

              {["Red Wine", "White wine", "Sweet Wine", "Sparkling wine", "Rose wine"].map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.modalOption,
                    { borderColor: theme.border },
                    filterType === type && { borderColor: theme.primary, backgroundColor: theme.primary + '10' }
                  ]}
                  onPress={() => { setFilterType(type); setIsFilterModalOpen(false); }}
                >
                  <Text style={[styles.modalOptionText, { color: theme.text }, filterType === type && { color: theme.primary }]}>
                    {type}
                  </Text>
                  {filterType === type && <Check size={20} color={theme.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    textTransform: "uppercase",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.5,
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
  topControls: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  searchContainer: {
    marginBottom: 4,
  },
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
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
  filterSortRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  filterSortBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  filterSortText: {
    fontSize: 14,
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
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#334155",
    overflow: "hidden",
  },
  cardBody: {
    flexDirection: "row",
    padding: 16,
    gap: 16,
    alignItems: "center",
  },
  stockInfo: {
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    width: 90,
  },
  stockCount: {
    fontSize: 42,
    fontWeight: "900",
    letterSpacing: -2,
  },
  stockLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    marginTop: -4,
  },
  wineInfo: {
    flex: 1,
  },
  wineName: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 2,
  },
  wineProducer: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 12,
  },
  detailsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexBasis: "50%",
    marginBottom: 8,
  },
  detailText: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  locationsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  locationPill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingRight: 10,
    paddingVertical: 4,
    paddingLeft: 4,
  },
  locationCountBadge: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 6,
    minWidth: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  locationCountText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  locationNameText: {
    fontSize: 12,
    fontWeight: "700",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 80,
    gap: 16,
  },
  emptyText: {
    color: "#475569",
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    minHeight: "40%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "900",
  },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  modalOptionText: {
    fontSize: 16,
    fontWeight: "700",
  },
});
