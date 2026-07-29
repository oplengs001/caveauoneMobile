import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { Stack, useRouter } from "expo-router";
import {
  ArrowUpDown,
  BottleWine,
  Box,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  Filter,
  Globe,
  Grape,
  Hash,
  MapPin,
  Scan,
  Search as SearchIcon,
  Wine as WineIcon,
  X,
} from "lucide-react-native";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
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

type BottleView = InventoryBottle & {
  masterWineData?: MasterWine;
  locationData?: Location;
};

const PAGE_SIZE = 100;

// ─── Expandable Wine Card ──────────────────────────────────────────────────────

const WineCard = memo(function WineCard({
  item,
  theme,
}: {
  item: { title: string; masterWineData?: MasterWine; data: BottleView[] };
  theme: any;
}) {
  const { masterWineData, data: bottles } = item;
  const stockCount = bottles.length;
  const [expanded, setExpanded] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const heightAnim = useRef(new Animated.Value(0)).current;

  if (!masterWineData) return null;

  const locationCounts = bottles.reduce(
    (acc, bottle) => {
      const locName = bottle.locationData?.name || "Unassigned";
      acc[locName] = (acc[locName] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const toggleExpand = () => {
    const toValue = expanded ? 0 : 1;
    Animated.parallel([
      Animated.spring(rotateAnim, {
        toValue,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }),
      Animated.spring(heightAnim, {
        toValue,
        useNativeDriver: false,
        tension: 60,
        friction: 12,
      }),
    ]).start();
    setExpanded(!expanded);
  };

  const chevronRotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  const maxHeight = heightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, bottles.length * 52 + 24],
  });

  return (
    <View
      style={[
        styles.itemContainer,
        {
          backgroundColor: theme.card,
          borderColor: expanded ? theme.primary + "60" : theme.border,
        },
      ]}
    >
      {/* ── Card Header (always visible) ── */}
      <TouchableOpacity
        onPress={toggleExpand}
        activeOpacity={0.85}
        style={styles.cardTouchable}
      >
        <View style={styles.cardBody}>
          {/* Stock count pill */}
          <View
            style={[
              styles.stockPill,
              {
                backgroundColor: theme.primary + "18",
                borderColor: theme.primary + "40",
              },
            ]}
          >
            <Text style={[styles.stockCount, { color: theme.primary }]}>
              {stockCount}
            </Text>
            <Text style={[styles.stockLabel, { color: theme.primary + "90" }]}>
              bottles
            </Text>
          </View>

          {/* Wine info */}
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
                <Calendar size={12} color={theme.textSecondary} />
                <Text style={[styles.detailText, { color: theme.text }]}>
                  {masterWineData.vintage || "N/A"}
                </Text>
              </View>
              <View style={styles.detailItem}>
                <BottleWine size={12} color={theme.textSecondary} />
                <Text style={[styles.detailText, { color: theme.text }]}>
                  {masterWineData.format || "N/A"}
                </Text>
              </View>
              <View style={styles.detailItem}>
                <WineIcon size={12} color={theme.textSecondary} />
                <Text style={[styles.detailText, { color: theme.text }]}>
                  {masterWineData.type || "N/A"}
                </Text>
              </View>
              <View style={styles.detailItem}>
                <Grape size={12} color={theme.textSecondary} />
                <Text
                  style={[styles.detailText, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {masterWineData.grapeVariety || "N/A"}
                </Text>
              </View>
              <View style={styles.detailItem}>
                <Globe size={12} color={theme.textSecondary} />
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

            {/* Location pills */}
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

          {/* Expand toggle icon */}
          <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
            <ChevronDown size={20} color={theme.textSecondary} />
          </Animated.View>
        </View>
      </TouchableOpacity>

      {/* ── Expandable Bottle List ── */}
      <Animated.View style={[styles.bottleListWrapper, { maxHeight }]}>
        <View
          style={[styles.bottleDivider, { borderTopColor: theme.border }]}
        />
        <View style={styles.bottleListHeader}>
          <Hash size={12} color={theme.textSecondary} />
          <Text
            style={[styles.bottleListTitle, { color: theme.textSecondary }]}
          >
            Individual Bottles
          </Text>
        </View>
        {bottles.map((bottle, index) => (
          <View
            key={bottle.id}
            style={[
              styles.bottleRow,
              index < bottles.length - 1 && {
                borderBottomWidth: 1,
                borderBottomColor: theme.border + "60",
              },
            ]}
          >
            {/* Index number */}
            <View
              style={[
                styles.bottleIndex,
                { backgroundColor: theme.border + "40" },
              ]}
            >
              <Text
                style={[styles.bottleIndexText, { color: theme.textSecondary }]}
              >
                {index + 1}
              </Text>
            </View>

            {/* Bottle ID */}
            <Text
              style={[styles.bottleId, { color: theme.text }]}
              numberOfLines={1}
            >
              {bottle.id}
            </Text>

            {/* Location badge */}
            {bottle.locationData?.name && (
              <View
                style={[
                  styles.bottleLocationBadge,
                  { backgroundColor: theme.primary + "10" },
                ]}
              >
                <MapPin size={10} color={theme.primary} />
                <Text
                  style={[styles.bottleLocationText, { color: theme.primary }]}
                >
                  {bottle.locationData.name}
                </Text>
              </View>
            )}
          </View>
        ))}
      </Animated.View>
    </View>
  );
}, (prevProps, nextProps) => {
  return prevProps.item.data.length === nextProps.item.data.length &&
    prevProps.item.masterWineData?.id === nextProps.item.masterWineData?.id &&
    prevProps.theme === nextProps.theme;
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function InventoryScreen() {
  const { profile } = useAuth();
  const theme = profile?.role === "store" ? Colors.store : Colors.warehouse;
  const isStore = profile?.role === "store";

  const [bottles, setBottles] = useState<BottleView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const [sections, setSections] = useState<
    { title: string; masterWineData?: MasterWine; data: BottleView[] }[]
  >([]);

  // Filtering & Sorting
  const [sortBy, setSortBy] = useState<
    "name_asc" | "name_desc" | "stock_desc" | "stock_asc"
  >("name_asc");
  const [filterType, setFilterType] = useState<string | null>(null);

  // Modals
  const [isSortModalOpen, setIsSortModalOpen] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isWineFilterModalOpen, setIsWineFilterModalOpen] = useState(false);

  // Wine Dropdown Filter Data
  const [masterWinesList, setMasterWinesList] = useState<MasterWine[]>([]);
  const [selectedWineFilter, setSelectedWineFilter] =
    useState<MasterWine | null>(null);
  const [wineSearchTerm, setWineSearchTerm] = useState("");

  const [wineCache] = useState(new Map<string, MasterWine>());
  const [locationCache] = useState(new Map<string, Location>());

  // Refs for consistent fetch state across re-renders
  const isFetchingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const lastDocRef = useRef<any>(null);
  const searchQueryRef = useRef(searchQuery);
  const selectedWineFilterRef = useRef(selectedWineFilter);

  // Keep refs in sync
  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  useEffect(() => {
    selectedWineFilterRef.current = selectedWineFilter;
  }, [selectedWineFilter]);

  // Load master wines for the searchable dropdown filter
  useEffect(() => {
    const fetchMasterWines = async () => {
      try {
        const data = await apiFetch("/wines");
        const wines: MasterWine[] = data.wines || data;
        setMasterWinesList(wines);
      } catch (err) {
        console.error("Failed to fetch master wines:", err);
      }
    };
    fetchMasterWines();
  }, []);

  // Filter master wines based on modal search term
  const filteredMasterWines = useMemo(() => {
    const q = wineSearchTerm.toLowerCase();
    return masterWinesList
      .filter(
        (w) =>
          w.name?.toLowerCase().includes(q) ||
          w.producer?.toLowerCase().includes(q) ||
          w.sku?.toLowerCase().includes(q),
      )
      .slice(0, 30); // limit for UI performance
  }, [masterWinesList, wineSearchTerm]);

  const fetchInventory = useCallback(
    async (isRefresh = false) => {
      if (isFetchingRef.current) return;
      if (!isRefresh && !hasMoreRef.current) return;

      isFetchingRef.current = true;

      if (isRefresh) {
        lastDocRef.current = null;
        hasMoreRef.current = true;
        if (bottles.length === 0) setLoading(true);
        else setRefreshing(true);
        setBottles([]);
      } else {
        setLoadingMore(true);
      }

      try {
        const params = new URLSearchParams({
          status: "received,shelved,damaged,lost",
        });

        if (isStore && profile?.locationId) {
          params.set("storeId", profile.locationId);
        }

        if (selectedWineFilterRef.current) {
          params.set("masterWineId", selectedWineFilterRef.current.id);
        }

        const [bottlesData, winesData, locationsData] = await Promise.all([
          apiFetch(`/bottles?${params}`),
          apiFetch("/wines"),
          apiFetch("/locations"),
        ]);

        const rawBottles: InventoryBottle[] = bottlesData.bottles || bottlesData;
        const winesList: MasterWine[] = winesData.wines || winesData;
        const locationsList: Location[] = locationsData.locations || locationsData;

        const wineMap = new Map<string, MasterWine>();
        winesList.forEach((w) => wineMap.set(w.id, w));

        const locationMap = new Map<string, Location>();
        locationsList.forEach((l) => locationMap.set(l.id, l));

        const resolved: BottleView[] = rawBottles.map((b: any) => {
          const masterWineId = b.masterWineId || b.masterWineRef?.id;
          const locationId = b.locationId || b.locationRef?.id;
          return {
            ...b,
            masterWineData: masterWineId ? wineMap.get(masterWineId) : undefined,
            locationData: locationId ? locationMap.get(locationId) : undefined,
          };
        });

        setBottles(resolved);
        setHasMore(false);
      } catch (error) {
        console.error("Error fetching inventory:", error);
      } finally {
        isFetchingRef.current = false;
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [isStore, profile?.locationId],
  );

  // Initial load
  useEffect(() => {
    fetchInventory(true);
  }, [fetchInventory]);

  // Re-fetch on Text Search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchInventory(true);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, fetchInventory]);

  // Re-fetch on Wine Dropdown Filter Selection
  useEffect(() => {
    fetchInventory(true);
  }, [selectedWineFilter, fetchInventory]);

  const onRefresh = useCallback(() => {
    fetchInventory(true);
  }, [fetchInventory]);

  useEffect(() => {
    const filteredBottles = filterType
      ? bottles.filter((b) => b.masterWineData?.type === filterType)
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

    if (sortBy === "name_asc")
      groupsArray.sort((a, b) => a.title.localeCompare(b.title));
    else if (sortBy === "name_desc")
      groupsArray.sort((a, b) => b.title.localeCompare(a.title));
    else if (sortBy === "stock_desc")
      groupsArray.sort((a, b) => b.data.length - a.data.length);
    else if (sortBy === "stock_asc")
      groupsArray.sort((a, b) => a.data.length - b.data.length);

    setSections(groupsArray);
  }, [bottles, sortBy, filterType]);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Header ── */}
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
            Bottle Management
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {isStore ? "Boutique View" : "Warehouse View"}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[
              styles.headerActionChip,
              { backgroundColor: theme.primary, borderColor: theme.primary },
            ]}
            onPress={() =>
              router.push({ pathname: "/tagging", params: { mode: "tagging" } })
            }
            activeOpacity={0.7}
          >
            <Scan size={16} color="#fff" strokeWidth={2.5} />
            <Text style={[styles.headerActionText, { color: "#fff" }]}>
              Scan to Update
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Search + Controls ── */}
      <View style={styles.topControls}>
        <View
          style={[
            styles.searchWrapper,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <SearchIcon
            size={18}
            color={theme.textSecondary}
            style={styles.searchIcon}
          />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search by SKU, wine name, or producer…"
            placeholderTextColor={theme.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
        </View>

        {/* New Wine Filter Dropdown Trigger */}
        <TouchableOpacity
          style={[
            styles.wineFilterBtn,
            {
              backgroundColor: selectedWineFilter
                ? theme.primary + "10"
                : theme.card,
              borderColor: selectedWineFilter ? theme.primary : theme.border,
            },
          ]}
          onPress={() => setIsWineFilterModalOpen(true)}
          activeOpacity={0.7}
        >
          <WineIcon
            size={16}
            color={selectedWineFilter ? theme.primary : theme.textSecondary}
          />
          <Text
            style={[
              styles.wineFilterBtnText,
              { color: selectedWineFilter ? theme.primary : theme.text },
            ]}
            numberOfLines={1}
          >
            {selectedWineFilter
              ? selectedWineFilter.name
              : "Filter by specific wine..."}
          </Text>
          {selectedWineFilter ? (
            <TouchableOpacity
              onPress={() => setSelectedWineFilter(null)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={16} color={theme.primary} />
            </TouchableOpacity>
          ) : (
            <ChevronDown size={16} color={theme.textSecondary} />
          )}
        </TouchableOpacity>

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
            <ArrowUpDown size={15} color={theme.textSecondary} />
            <Text style={[styles.filterSortText, { color: theme.text }]}>
              Sort By
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterSortBtn,
              {
                backgroundColor: filterType ? theme.primary + "20" : theme.card,
                borderColor: filterType ? theme.primary : theme.border,
              },
            ]}
            onPress={() => setIsFilterModalOpen(true)}
          >
            <Filter
              size={15}
              color={filterType ? theme.primary : theme.textSecondary}
            />
            <Text
              style={[
                styles.filterSortText,
                { color: filterType ? theme.primary : theme.text },
              ]}
            >
              {filterType ?? "Filters"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── List ── */}
      {loading ? (
        <ActivityIndicator
          size="large"
          color={theme.primary}
          style={{ flex: 1 }}
        />
      ) : (
        <FlatList
          data={sections}
          renderItem={({ item }) => <WineCard item={item} theme={theme} />}
          keyExtractor={(item) => item.masterWineData?.id || item.title}
          contentContainerStyle={styles.listContent}
          onEndReached={() => fetchInventory(false)}
          onEndReachedThreshold={0.5}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          ListFooterComponent={() => (
            <View style={{ height: 60, justifyContent: 'center', alignItems: 'center' }}>
              {loadingMore && <ActivityIndicator size="small" color={theme.primary} />}
            </View>
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Box size={64} color={theme.border} strokeWidth={1} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                {searchQuery || selectedWineFilter
                  ? "No results found."
                  : "No bottles found."}
              </Text>
            </View>
          }
        />
      )}

      {/* ── Sort Modal ── */}
      <Modal visible={isSortModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                Sort Inventory
              </Text>
              <TouchableOpacity onPress={() => setIsSortModalOpen(false)}>
                <X size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            {[
              { id: "name_asc", label: "Name (A → Z)" },
              { id: "name_desc", label: "Name (Z → A)" },
              { id: "stock_desc", label: "Highest Stock First" },
              { id: "stock_asc", label: "Lowest Stock First" },
            ].map((option) => (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.modalOption,
                  { borderColor: theme.border },
                  sortBy === option.id && {
                    borderColor: theme.primary,
                    backgroundColor: theme.primary + "10",
                  },
                ]}
                onPress={() => {
                  setSortBy(option.id as any);
                  setIsSortModalOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.modalOptionText,
                    { color: theme.text },
                    sortBy === option.id && { color: theme.primary },
                  ]}
                >
                  {option.label}
                </Text>
                {sortBy === option.id && (
                  <Check size={20} color={theme.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* ── Filter Modal ── */}
      <Modal visible={isFilterModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                Filter by Type
              </Text>
              <TouchableOpacity onPress={() => setIsFilterModalOpen(false)}>
                <X size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {[
                null,
                "Red Wine",
                "White wine",
                "Sweet Wine",
                "Sparkling wine",
                "Rose wine",
              ].map((type) => (
                <TouchableOpacity
                  key={type ?? "__all__"}
                  style={[
                    styles.modalOption,
                    { borderColor: theme.border },
                    filterType === type && {
                      borderColor: theme.primary,
                      backgroundColor: theme.primary + "10",
                    },
                  ]}
                  onPress={() => {
                    setFilterType(type);
                    setIsFilterModalOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.modalOptionText,
                      { color: theme.text },
                      filterType === type && { color: theme.primary },
                    ]}
                  >
                    {type ?? "All Types"}
                  </Text>
                  {filterType === type && (
                    <Check size={20} color={theme.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Wine Search Filter Modal ── */}
      <Modal visible={isWineFilterModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.card, height: "80%" },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                Select Wine
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setIsWineFilterModalOpen(false);
                  setWineSearchTerm("");
                }}
              >
                <X size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Modal Search Input */}
            <View
              style={[
                styles.searchWrapper,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                  marginBottom: 16,
                },
              ]}
            >
              <SearchIcon
                size={18}
                color={theme.textSecondary}
                style={styles.searchIcon}
              />
              <TextInput
                style={[styles.searchInput, { color: theme.text }]}
                placeholder="Search catalog..."
                placeholderTextColor={theme.textSecondary}
                value={wineSearchTerm}
                onChangeText={setWineSearchTerm}
                autoFocus
                clearButtonMode="while-editing"
              />
            </View>

            {/* Catalog List */}
            <FlatList
              data={filteredMasterWines}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.modalOption,
                    { borderColor: theme.border, paddingVertical: 10 },
                    selectedWineFilter?.id === item.id && {
                      borderColor: theme.primary,
                      backgroundColor: theme.primary + "10",
                    },
                  ]}
                  onPress={() => {
                    setSelectedWineFilter(item);
                    setIsWineFilterModalOpen(false);
                    setWineSearchTerm("");
                  }}
                >
                  <View
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        backgroundColor:
                          selectedWineFilter?.id === item.id
                            ? theme.primary + "20"
                            : theme.background,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <WineIcon
                        size={20}
                        color={
                          selectedWineFilter?.id === item.id
                            ? theme.primary
                            : theme.textSecondary
                        }
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.modalOptionText, { color: theme.text }]}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                      <Text
                        style={{
                          fontSize: 12,
                          color: theme.textSecondary,
                          marginTop: 2,
                          fontWeight: "500",
                        }}
                        numberOfLines={1}
                      >
                        {[item.vintage, item.producer, item.format]
                          .filter(Boolean)
                          .join(" • ")}
                      </Text>
                    </View>
                  </View>
                  {selectedWineFilter?.id === item.id && (
                    <Check size={20} color={theme.primary} />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={{ padding: 20, alignItems: "center" }}>
                  <Text style={{ color: theme.textSecondary, fontSize: 14 }}>
                    No wines found in catalog.
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 24,
    paddingBottom: 20,
  },
  backButton: { marginRight: 12 },
  title: {
    fontSize: 22,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginTop: 2,
  },
  headerActions: { flexDirection: "row", alignItems: "center" },
  headerActionChip: {
    flexDirection: "row",
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    gap: 6,
  },
  headerActionText: { fontSize: 12, fontWeight: "800" },

  // Search + Controls
  topControls: { paddingHorizontal: 20, paddingBottom: 8 },
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 52,
  },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, fontSize: 15, fontWeight: "600" },

  // Wine Dropdown Specific
  wineFilterBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 52,
    marginBottom: 12,
    gap: 10,
  },
  wineFilterBtnText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },

  filterSortRow: { flexDirection: "row", gap: 10 },
  filterSortBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    gap: 7,
  },
  filterSortText: { fontSize: 13, fontWeight: "600" },

  // List
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100 },

  // Card
  itemContainer: {
    borderRadius: 20,
    marginBottom: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardTouchable: {},
  cardBody: {
    flexDirection: "row",
    padding: 16,
    gap: 14,
    alignItems: "center",
  },

  // Stock pill
  stockPill: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    width: 72,
  },
  stockCount: { fontSize: 34, fontWeight: "900", letterSpacing: -1.5 },
  stockLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    marginTop: -2,
  },

  // Wine info
  wineInfo: { flex: 1 },
  wineName: { fontSize: 15, fontWeight: "800", marginBottom: 2 },
  wineProducer: { fontSize: 12, fontWeight: "600", marginBottom: 10 },

  detailsGrid: { flexDirection: "row", flexWrap: "wrap" },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexBasis: "50%",
    marginBottom: 7,
  },
  detailText: { fontSize: 12, fontWeight: "600", flex: 1 },

  // Location pills
  locationsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  locationPill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingRight: 8,
    paddingVertical: 3,
    paddingLeft: 3,
  },
  locationCountBadge: {
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginRight: 5,
    minWidth: 18,
    alignItems: "center",
  },
  locationCountText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  locationNameText: { fontSize: 11, fontWeight: "700" },

  // Expandable bottle list
  bottleListWrapper: { overflow: "hidden" },
  bottleDivider: { borderTopWidth: 1, marginHorizontal: 16 },
  bottleListHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  bottleListTitle: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  bottleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  bottleIndex: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  bottleIndexText: { fontSize: 11, fontWeight: "700" },
  bottleId: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  bottleLocationBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  bottleLocationText: { fontSize: 11, fontWeight: "700" },

  // Empty state
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 80,
    gap: 16,
  },
  emptyText: { textAlign: "center", fontSize: 15, fontWeight: "600" },

  // Modals
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
  modalTitle: { fontSize: 20, fontWeight: "900" },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  modalOptionText: { fontSize: 15, fontWeight: "700" },
});
