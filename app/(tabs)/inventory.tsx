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
  Box,
  Building2,
  Calendar,
  Check,
  ChevronLeft,
  Globe,
  Layers,
  PackageOpen,
  Search as SearchIcon,
  Tag,
} from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  SectionList,
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showUnshelvedOnly, setShowUnshelvedOnly] = useState(false);
  const router = useRouter();
  const [sections, setSections] = useState<
    { title: string; masterWineData?: MasterWine; data: BottleView[] }[]
  >([]);

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

      // Boutique Scoping: If store user, only show their node's inventory
      if (isStore && profile?.locationId) {
        baseQueries.push(
          where("storeRef", "==", doc(db, "stores", profile.locationId)),
        );
      }

      if (searchQuery.trim()) {
        q = query(
          bottlesRef,
          ...baseQueries,
          where("sku", "==", searchQuery.trim()),
          limit(PAGE_SIZE),
        );
      } else {
        q = query(
          bottlesRef,
          ...baseQueries,
          orderBy("createdAt", "desc"),
          limit(PAGE_SIZE),
        );

        if (!isRefresh && lastDoc) {
          q = query(
            bottlesRef,
            ...baseQueries,
            orderBy("createdAt", "desc"),
            startAfter(lastDoc),
            limit(PAGE_SIZE),
          );
        }
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
  }, [searchQuery, showUnshelvedOnly]);

  useEffect(() => {
    const grouped = bottles.reduce(
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

    const sortedGroups = Object.values(grouped).sort((a, b) =>
      a.title.localeCompare(b.title),
    );
    setSections(sortedGroups);
  }, [bottles]);

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

  const renderSectionHeader = ({
    section,
  }: {
    section: { title: string; data: BottleView[] };
  }) => (
    <View style={styles.sectionHeaderContainer}>
      <Tag size={16} color={theme.textSecondary} />
      <Text
        style={[styles.sectionHeaderText, { color: theme.text }]}
        numberOfLines={1}
      >
        {section.title}
      </Text>
      <View style={styles.sectionHeaderBadge}>
        <Text style={styles.sectionHeaderBadgeText}>{section.data.length}</Text>
      </View>
    </View>
  );
  const renderItem = ({ item }: { item: BottleView }) => (
    <TouchableOpacity
      style={[
        styles.itemContainer,
        { backgroundColor: theme.card, borderColor: theme.border },
        selectedIds.has(item.id) && [
          styles.itemSelected,
          { borderColor: theme.accent },
        ],
      ]}
      onPress={() => (isSelectionMode ? toggleSelection(item.id) : null)}
      onLongPress={() => {
        if (!isSelectionMode) setIsSelectionMode(true);
        toggleSelection(item.id);
      }}
    >
      <View style={styles.itemHeader}>
        <View style={styles.titleContainer}>
          {isSelectionMode && (
            <View
              style={[
                styles.checkbox,
                selectedIds.has(item.id) && [
                  styles.checkboxSelected,
                  { backgroundColor: theme.accent, borderColor: theme.accent },
                ],
              ]}
            >
              {selectedIds.has(item.id) && (
                <Check size={14} color="#fff" strokeWidth={3} />
              )}
            </View>
          )}
          <Text style={[styles.itemTitle, { color: theme.text }]}>
            {item.masterWineData?.name || "Loading..."}
          </Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor:
                item.status === "received" || item.status === "incoming"
                  ? theme.accent + "20"
                  : item.status === "shelved"
                    ? theme.secondary + "20"
                    : theme.danger + "20",
            },
          ]}
        >
          <Text
            style={[
              styles.statusText,
              {
                color:
                  item.status === "received" || item.status === "incoming"
                    ? theme.accent
                    : item.status === "shelved"
                      ? theme.secondary
                      : theme.danger,
              },
            ]}
          >
            {item.status}
          </Text>
        </View>
      </View>

      <View style={styles.detailsGrid}>
        <View style={styles.detailItem}>
          <Calendar size={14} color={theme.textSecondary} />
          <Text style={[styles.detailText, { color: theme.textSecondary }]}>
            {item.masterWineData?.vintage || "N/A"}
          </Text>
        </View>
        <View style={styles.detailItem}>
          <Layers size={14} color={theme.textSecondary} />
          <Text style={[styles.detailText, { color: theme.textSecondary }]}>
            {item.masterWineData?.format || "N/A"}
          </Text>
        </View>
        <View style={[styles.detailItem, { flexBasis: "100%" }]}>
          <Building2 size={14} color={theme.textSecondary} />
          <Text
            style={[styles.detailText, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {item.masterWineData?.producer || "N/A"}
          </Text>
        </View>
        <View style={[styles.detailItem, { flexBasis: "100%" }]}>
          <Globe size={14} color={theme.textSecondary} />
          <Text
            style={[styles.detailText, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {item.masterWineData?.region || "Unknown Origin"}
          </Text>
        </View>
      </View>

      <View style={styles.itemFooter}>
        <Text style={[styles.itemSku, { color: theme.textSecondary }]}>
          SKU: {item.sku}
        </Text>
        <Text
          style={[
            styles.itemLocation,
            { color: item.locationData ? theme.secondary : theme.accent },
          ]}
        >
          {item.locationData ? `📍 ${item.locationData.name}` : "📦 Unshelved"}
        </Text>
      </View>
    </TouchableOpacity>
  );

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
          <ChevronLeft size={28} color={theme.primary} strokeWidth={2.5} />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.primary }]}>
            {isSelectionMode ? `${selectedIds.size} Selected` : "Inventory"}
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {isStore ? "Boutique View" : "Warehouse View"}
          </Text>
        </View>
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
                style={[
                  styles.headerActionChip,
                  showUnshelvedOnly && styles.headerActionChipActive,
                ]}
                onPress={() => setShowUnshelvedOnly(!showUnshelvedOnly)}
                activeOpacity={0.7}
              >
                <PackageOpen
                  size={16}
                  color={showUnshelvedOnly ? "#000" : "#fff"}
                  strokeWidth={2.5}
                />
                <Text
                  style={[
                    styles.headerActionText,
                    showUnshelvedOnly && styles.headerActionTextActive,
                  ]}
                >
                  Unshelved
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      <View style={styles.topControls}>
        <View
          style={[styles.searchContainer, { marginBottom: isStore ? 16 : 4 }]}
        >
          <View
            style={[
              styles.searchWrapper,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
                borderRadius: isStore ? 16 : 16,
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
        <SectionList
          sections={sections}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          keyExtractor={(item) => item.id}
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
  detailsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 16,
    marginBottom: 8,
    marginHorizontal: -4,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexBasis: "50%",
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  detailText: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  itemFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderColor: "#334155",
    paddingTop: 12,
    marginTop: 4,
  },
  itemSku: {
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  sectionHeaderContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 20,
    gap: 12,
  },
  sectionHeaderText: {
    fontSize: 14,
    fontWeight: "800",
    flex: 1,
  },
  sectionHeaderBadge: {
    backgroundColor: "#334155",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  sectionHeaderBadgeText: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "700",
  },
  itemLocation: {
    fontSize: 13,
    fontWeight: "600",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
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
});
