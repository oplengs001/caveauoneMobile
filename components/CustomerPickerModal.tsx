import { apiFetch } from "@/lib/api";
import {
  appendCustomerToCache,
  getCachedCustomers,
  getCachedProducers,
  setCachedCustomers,
  setCachedProducers,
} from "@/lib/customerCache";
import { Customer } from "@/types";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

interface CustomerPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeId?: string | null;
  theme?: any;
  onSelectCustomer: (customer: Customer | null) => void;
  selectedCustomerId?: string;
  useModal?: boolean;
}

export const PREDEFINED_COUNTRIES_REGIONS = [
  "France",
  "Bordeaux",
  "Burgundy (Red)",
  "Burgundy (White)",
  "Champagne",
  "Rhône Valley",
  "Loire Valley",
  "Alsace",
  "Italy",
  "Barolo / Piedmont",
  "Brunello / Tuscany",
  "Chianti Classico",
  "Spain",
  "Rioja",
  "Ribera del Duero",
  "United States",
  "Napa Valley",
  "Sonoma Coast",
  "Oregon",
  "Australia",
  "Barossa Valley",
  "Margaret River",
  "Germany",
  "Austria",
  "Portugal",
  "South Africa",
  "Chile",
  "Argentina",
  "New Zealand",
];

export const PREDEFINED_WINE_STYLES = [
  "Full-Bodied Red",
  "Medium-Bodied Red",
  "Light-Bodied Red",
  "Crisp & Dry White",
  "Oaky & Rich White",
  "Champagne / Sparkling",
  "Rosé Wine",
  "Sweet Wine",
  "Fortified / Port",
  "Natural / Biodynamic",
];

const MAROON = {
  primary: "#722F37",
  primaryDark: "#5B2228",
  ultraLight: "#fdf8f6",
  border: "#fed7aa",
  accentGold: "#b45309",
};

export default function CustomerPickerModal({
  isOpen,
  onClose,
  storeId,
  theme,
  onSelectCustomer,
  selectedCustomerId,
  useModal = true,
}: CustomerPickerModalProps) {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const [activeTab, setActiveTab] = useState<"search" | "add">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [availableProducers, setAvailableProducers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Form State
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newContact, setNewContact] = useState("");
  const [newNotes, setNewNotes] = useState("");

  // Favorites state
  const [favoriteProducers, setFavoriteProducers] = useState<string[]>([]);
  const [producerInput, setProducerInput] = useState("");
  const [favoriteRegions, setFavoriteRegions] = useState<string[]>([]);
  const [regionInput, setRegionInput] = useState("");
  const [favoriteWineStyle, setFavoriteWineStyle] = useState("");

  const [savingNew, setSavingNew] = useState(false);

  // Pre-warm state from cache as soon as modal is mounted
  useEffect(() => {
    getCachedCustomers(storeId).then((cached) => {
      if (cached?.data && cached.data.length > 0) {
        setCustomers(cached.data);
        setLoading(false);
      }
    });
    getCachedProducers().then((cached) => {
      if (cached?.data && cached.data.length > 0) {
        setAvailableProducers(cached.data);
      }
    });
  }, [storeId]);

  const fetchMasterProducers = useCallback(async () => {
    try {
      // 1. Check cache first
      const cached = await getCachedProducers();
      if (cached) {
        setAvailableProducers(cached.data);
        if (!cached.isStale) return; // Cache is fresh
      }

      // 2. Fetch fresh in background
      const data = await apiFetch("/producers").catch(() => apiFetch("/wines"));
      let uniqueProducers: string[] = [];
      if (Array.isArray(data)) {
        if (data.length > 0 && typeof data[0] === "string") {
          uniqueProducers = data;
        } else {
          uniqueProducers = Array.from(
            new Set(
              data
                .map((w: any) => w.producer)
                .filter((p: any) => p && typeof p === "string" && p.trim().length > 0)
            )
          ) as string[];
        }
      } else if (data?.masterWines) {
        uniqueProducers = Array.from(
          new Set(
            data.masterWines
              .map((w: any) => w.producer)
              .filter((p: any) => p && typeof p === "string" && p.trim().length > 0)
          )
        ) as string[];
      }
      const sorted = uniqueProducers.sort();
      setAvailableProducers(sorted);
      await setCachedProducers(sorted);
    } catch (e) {
      console.error("[CustomerPickerModal] Failed to fetch master wine producers", e);
    }
  }, []);

  const fetchCustomers = useCallback(
    async (forceRefresh = false) => {
      let hasCachedData = false;

      // 1. Check cache first if not forcing refresh
      if (!forceRefresh) {
        const cached = await getCachedCustomers(storeId);
        if (cached) {
          setCustomers(cached.data);
          setLoading(false);
          hasCachedData = true;
          if (!cached.isStale) {
            return; // Cache is fresh (< 5 mins), return instantly!
          }
          // Cache is stale: background revalidation
          setIsRefreshing(true);
        }
      }

      if (!hasCachedData) {
        setLoading(true);
      } else {
        setIsRefreshing(true);
      }

      try {
        const url = storeId ? `/customers?storeId=${storeId}` : `/customers`;
        const data = await apiFetch(url);
        const list: Customer[] = Array.isArray(data) ? data : data.customers || [];
        setCustomers(list);
        await setCachedCustomers(list, storeId);
      } catch (err) {
        console.error("[CustomerPickerModal] Failed to fetch customers", err);
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [storeId]
  );

  useEffect(() => {
    if (isOpen) {
      fetchCustomers();
      fetchMasterProducers();
      setActiveTab("search");
      setNewName("");
      setNewEmail("");
      setNewContact("");
      setNewNotes("");
      setFavoriteProducers([]);
      setProducerInput("");
      setFavoriteRegions([]);
      setRegionInput("");
      setFavoriteWineStyle("");
      setSearchQuery("");
    }
  }, [isOpen, storeId, fetchCustomers, fetchMasterProducers]);

  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return customers;
    const lowerQ = searchQuery.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(lowerQ) ||
        (c.email && c.email.toLowerCase().includes(lowerQ)) ||
        (c.contactNo && c.contactNo.toLowerCase().includes(lowerQ)) ||
        (c.notes && c.notes.toLowerCase().includes(lowerQ)) ||
        (c.favoriteWineStyle && c.favoriteWineStyle.toLowerCase().includes(lowerQ))
    );
  }, [customers, searchQuery]);

  const handleSaveNew = async () => {
    const trimmedName = newName.trim();
    if (!trimmedName) {
      Alert.alert("Required Field", "Please enter the customer name.");
      return;
    }

    const duplicate = customers.find(
      (c) => c.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (duplicate) {
      Alert.alert(
        "Duplicate Name",
        `A customer named "${trimmedName}" already exists. Do you want to proceed and create a new record anyway?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Proceed", onPress: proceedSaveNew },
        ]
      );
    } else {
      await proceedSaveNew();
    }
  };

  const proceedSaveNew = async () => {
    setSavingNew(true);
    try {
      const newCustomer = await apiFetch("/customers", {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          email: newEmail.trim() || null,
          contactNo: newContact.trim() || null,
          favoriteProducers: favoriteProducers.slice(0, 10),
          favoriteRegions: favoriteRegions.slice(0, 10),
          favoriteWineStyle: favoriteWineStyle.trim() || null,
          notes: newNotes.trim() || null,
          storeId: storeId || null,
          totalSpend: 0,
          totalOrders: 0,
        }),
      });

      const savedCustomer = newCustomer as Customer;
      await appendCustomerToCache(savedCustomer, storeId);
      setCustomers((prev) => [
        savedCustomer,
        ...prev.filter((c) => c.id !== savedCustomer.id),
      ]);
      onSelectCustomer(savedCustomer);
      onClose();
    } catch (err: any) {
      console.error("[CustomerPickerModal] Error creating customer", err);
      Alert.alert("Error", err.message || "Failed to save customer.");
    } finally {
      setSavingNew(false);
    }
  };

  if (!isOpen) return null;

  // Large POS dimensions
  const cardMaxWidth = isLandscape ? Math.min(width * 0.94, 980) : Math.min(width * 0.94, 580);
  const cardHeight = isLandscape ? Math.min(height * 0.92, 680) : Math.min(height * 0.90, 760);

  const cardContent = (
    <View
      style={[
        styles.modalCard,
        {
          maxWidth: cardMaxWidth,
          height: cardHeight,
        },
      ]}
    >
      {/* ── Modal Header (Large POS Touch Targets) ─────────────────────────── */}
      <View style={styles.modalHeader}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons
              name={activeTab === "add" ? "account-plus-outline" : "account-search-outline"}
              size={26}
              color={MAROON.primary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalTitle}>
              {activeTab === "add" ? "Add VIP Customer" : "Select Customer / VIP"}
            </Text>
            <Text style={styles.modalSub} numberOfLines={1}>
              {activeTab === "add"
                ? "Enter guest credentials and taste preferences"
                : "Attach customer or VIP guest profile to this transaction"}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={onClose}
          style={styles.closeBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <MaterialCommunityIcons name="close" size={22} color="#64748b" />
        </TouchableOpacity>
      </View>

      {/* ── Segmented Control (Large Tabs for Fast Switching) ───────────────── */}
      <View style={styles.tabSwitcher}>
        <TouchableOpacity
          onPress={() => setActiveTab("search")}
          style={[styles.tabBtn, activeTab === "search" && styles.tabBtnActive]}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="account-group-outline"
            size={18}
            color={activeTab === "search" ? MAROON.primary : "#64748b"}
          />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text
              style={[
                styles.tabBtnText,
                activeTab === "search" && { color: MAROON.primary, fontWeight: "900" },
              ]}
            >
              Client Directory ({customers.length})
            </Text>
            {isRefreshing && (
              <ActivityIndicator size={12} color={MAROON.primary} />
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab("add")}
          style={[styles.tabBtn, activeTab === "add" && styles.tabBtnActive]}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="account-plus-outline"
            size={18}
            color={activeTab === "add" ? MAROON.primary : "#64748b"}
          />
          <Text
            style={[
              styles.tabBtnText,
              activeTab === "add" && { color: MAROON.primary, fontWeight: "900" },
            ]}
          >
            + New VIP Profile
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Tab 1: Client Directory View ─────────────────────────────────────── */}
      {activeTab === "search" ? (
        <View style={{ flex: 1 }}>
          {/* Large POS Search Box */}
          <View style={styles.searchBarWrapper}>
            <MaterialCommunityIcons name="magnify" size={22} color="#94a3b8" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name, phone, email, or favorite wine style..."
              placeholderTextColor="#94a3b8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery("")}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialCommunityIcons name="close-circle" size={20} color="#94a3b8" />
              </TouchableOpacity>
            )}
          </View>

          {/* List Area */}
          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={MAROON.primary} />
              <Text style={styles.centerText}>Loading guest directory...</Text>
            </View>
          ) : (
            <FlatList
              key={isLandscape ? "grid-2" : "list-1"}
              data={filteredCustomers}
              numColumns={isLandscape ? 2 : 1}
              columnWrapperStyle={isLandscape ? styles.columnWrapper : undefined}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 8, paddingBottom: 8 }}
              style={{ flex: 1 }}
              refreshing={isRefreshing}
              onRefresh={() => fetchCustomers(true)}
              renderItem={({ item }) => {
                const isSelected = selectedCustomerId === item.id;
                const initial = (item.name || "C").trim().charAt(0).toUpperCase();

                return (
                  <TouchableOpacity
                    onPress={() => {
                      onSelectCustomer(item);
                      onClose();
                    }}
                    style={[
                      styles.customerCard,
                      isSelected && styles.customerCardSelected,
                    ]}
                    activeOpacity={0.85}
                  >
                    <View style={styles.customerCardLeft}>
                      <View
                        style={[
                          styles.customerAvatar,
                          isSelected && styles.customerAvatarSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.customerAvatarText,
                            isSelected && styles.customerAvatarTextSelected,
                          ]}
                        >
                          {initial}
                        </Text>
                      </View>

                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text style={styles.customerCardName} numberOfLines={1}>
                            {item.name}
                          </Text>
                          {item.totalOrders && item.totalOrders > 0 ? (
                            <View style={styles.ordersBadge}>
                              <Text style={styles.ordersBadgeText}>
                                {item.totalOrders} order{item.totalOrders !== 1 ? "s" : ""}
                              </Text>
                            </View>
                          ) : null}
                        </View>

                        {/* Contact info row */}
                        {(item.contactNo || item.email) ? (
                          <View style={styles.customerMetaRow}>
                            {item.contactNo ? (
                              <View style={styles.metaItem}>
                                <MaterialCommunityIcons name="phone-outline" size={12} color="#64748b" />
                                <Text style={styles.metaText} numberOfLines={1}>{item.contactNo}</Text>
                              </View>
                            ) : null}
                            {item.email ? (
                              <View style={styles.metaItem}>
                                <MaterialCommunityIcons name="email-outline" size={12} color="#64748b" />
                                <Text style={styles.metaText} numberOfLines={1}>
                                  {item.email}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        ) : null}

                        {/* Wine Style & Region badges */}
                        {(item.favoriteWineStyle || (item.favoriteRegions && item.favoriteRegions.length > 0)) && (
                          <View style={styles.preferencesRow}>
                            {item.favoriteWineStyle ? (
                              <View style={styles.stylePill}>
                                <Text style={styles.stylePillText} numberOfLines={1}>
                                  🍷 {item.favoriteWineStyle}
                                </Text>
                              </View>
                            ) : null}
                            {item.favoriteRegions && item.favoriteRegions.slice(0, 2).map((reg, rIdx) => (
                              <View key={rIdx} style={styles.regionPill}>
                                <Text style={styles.regionPillText} numberOfLines={1}>
                                  📍 {reg}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    </View>

                    <View
                      style={[
                        styles.customerRadio,
                        isSelected && styles.customerRadioSelected,
                      ]}
                    >
                      {isSelected && (
                        <MaterialCommunityIcons name="check" size={12} color="#ffffff" />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <MaterialCommunityIcons name="account-question-outline" size={48} color="#94a3b8" />
                  <Text style={styles.emptyTitle}>
                    {searchQuery ? "No matching guests found" : "No customers in store directory"}
                  </Text>
                  <Text style={styles.emptySub}>
                    {searchQuery
                      ? `No customer matches "${searchQuery}". Create a new profile below.`
                      : "Start building your customer relationship directory."}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setNewName(searchQuery);
                      setActiveTab("add");
                    }}
                    style={styles.emptyAddBtn}
                    activeOpacity={0.85}
                  >
                    <MaterialCommunityIcons name="account-plus" size={18} color="#ffffff" />
                    <Text style={styles.emptyAddBtnText}>
                      {`Add "${searchQuery || "New VIP Customer"}"`}
                    </Text>
                  </TouchableOpacity>
                </View>
              }
            />
          )}

          {/* Large POS Footer Actions */}
          <View style={styles.modalFooter}>
            <TouchableOpacity onPress={onClose} style={styles.cancelBtn} activeOpacity={0.8}>
              <Text style={styles.cancelBtnText}>Close</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setActiveTab("add")}
              style={styles.primaryActionBtn}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="account-plus-outline" size={18} color="#ffffff" />
              <Text style={styles.primaryActionBtnText}>+ Add New VIP</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        /* ── Tab 2: Add New Customer Form (Spacious 2-Column POS Layout) ───── */
        <View style={{ flex: 1 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 60 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[isLandscape ? styles.formLandscapeRow : styles.formPortraitCol]}>
              {/* Column 1: Guest Information */}
              <View style={[isLandscape ? styles.formLandscapeCol : styles.formColFull]}>
                <Text style={styles.sectionHeader}>1. GUEST INFORMATION</Text>

                {/* Name */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>FULL NAME *</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Atty. Alexander Cruz"
                    placeholderTextColor="#94a3b8"
                    value={newName}
                    onChangeText={setNewName}
                    autoCapitalize="words"
                  />
                </View>

                {/* Contact & Email */}
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>CONTACT NO.</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="+63 917 123 4567"
                      placeholderTextColor="#94a3b8"
                      value={newContact}
                      onChangeText={setNewContact}
                      keyboardType="phone-pad"
                    />
                  </View>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>EMAIL (OPTIONAL)</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="client@mail.com"
                      placeholderTextColor="#94a3b8"
                      value={newEmail}
                      onChangeText={setNewEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                </View>

                {/* Notes */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>VIP NOTES / SOMMELIER MEMO</Text>
                  <TextInput
                    style={[styles.textInput, styles.textAreaInput]}
                    placeholder="Cellar preferences, special requests, vintage preferences..."
                    placeholderTextColor="#94a3b8"
                    value={newNotes}
                    onChangeText={setNewNotes}
                    multiline
                  />
                </View>
              </View>

              {/* Column 2: Wine Preferences */}
              <View style={[isLandscape ? styles.formLandscapeCol : styles.formColFull]}>
                <Text style={styles.sectionHeader}>2. WINE PREFERENCES</Text>

                {/* Wine Style Selector */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>FAVORITE WINE STYLE</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Select or enter wine style..."
                    placeholderTextColor="#94a3b8"
                    value={favoriteWineStyle}
                    onChangeText={setFavoriteWineStyle}
                  />
                  <View style={styles.quickChipsWrapper}>
                    {PREDEFINED_WINE_STYLES.map((style, idx) => {
                      const isSelected = favoriteWineStyle === style;
                      return (
                        <TouchableOpacity
                          key={idx}
                          onPress={() => {
                            setFavoriteWineStyle(isSelected ? "" : style);
                          }}
                          style={[
                            styles.quickChip,
                            isSelected && styles.quickChipSelected,
                          ]}
                          activeOpacity={0.8}
                        >
                          <Text
                            style={[
                              styles.quickChipText,
                              isSelected && styles.quickChipTextSelected,
                            ]}
                          >
                            {style}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Favorite Regions */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>
                    FAVORITE REGIONS ({favoriteRegions.length}/10)
                  </Text>
                  {favoriteRegions.length > 0 && (
                    <View style={styles.activeTagsRow}>
                      {favoriteRegions.map((reg, idx) => (
                        <View key={idx} style={styles.activeTagBadge}>
                          <Text style={styles.activeTagBadgeText}>{reg}</Text>
                          <TouchableOpacity
                            onPress={() =>
                              setFavoriteRegions(favoriteRegions.filter((_, i) => i !== idx))
                            }
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <MaterialCommunityIcons name="close" size={13} color="#b45309" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}

                  {favoriteRegions.length < 10 && (
                    <View>
                      {regionInput.trim().length > 0 && (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          keyboardShouldPersistTaps="handled"
                          style={styles.suggestionStrip}
                          contentContainerStyle={styles.suggestionStripContent}
                        >
                          {!favoriteRegions.includes(regionInput.trim()) && (
                            <TouchableOpacity
                              style={styles.suggestionRegionAddChip}
                              onPress={() => {
                                setFavoriteRegions([...favoriteRegions, regionInput.trim()]);
                                setRegionInput("");
                              }}
                              activeOpacity={0.8}
                            >
                              <MaterialCommunityIcons name="plus" size={13} color="#ffffff" />
                              <Text style={styles.suggestionAddChipText} numberOfLines={1}>
                                Add "{regionInput.trim()}"
                              </Text>
                            </TouchableOpacity>
                          )}
                          {PREDEFINED_COUNTRIES_REGIONS.filter(
                            (r) =>
                              r.toLowerCase().includes(regionInput.toLowerCase()) &&
                              !favoriteRegions.includes(r)
                          )
                            .slice(0, 8)
                            .map((r, idx) => (
                              <TouchableOpacity
                                key={idx}
                                style={styles.suggestionRegionChip}
                                onPress={() => {
                                  setFavoriteRegions([...favoriteRegions, r]);
                                  setRegionInput("");
                                }}
                                activeOpacity={0.8}
                              >
                                <Text style={styles.suggestionRegionChipText} numberOfLines={1}>
                                  {r}
                                </Text>
                              </TouchableOpacity>
                            ))}
                        </ScrollView>
                      )}
                      <TextInput
                        style={styles.textInput}
                        placeholder="Type region e.g. Bordeaux, Napa..."
                        placeholderTextColor="#94a3b8"
                        value={regionInput}
                        onChangeText={setRegionInput}
                      />
                    </View>
                  )}
                </View>

                {/* Favorite Producers */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>
                    FAVORITE PRODUCERS ({favoriteProducers.length}/10)
                  </Text>
                  {favoriteProducers.length > 0 && (
                    <View style={styles.activeTagsRow}>
                      {favoriteProducers.map((prod, idx) => (
                        <View key={idx} style={[styles.activeTagBadge, styles.producerTagBadge]}>
                          <Text style={[styles.activeTagBadgeText, styles.producerTagText]}>
                            {prod}
                          </Text>
                          <TouchableOpacity
                            onPress={() =>
                              setFavoriteProducers(favoriteProducers.filter((_, i) => i !== idx))
                            }
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <MaterialCommunityIcons name="close" size={13} color={MAROON.primary} />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}

                  {favoriteProducers.length < 10 && (
                    <View>
                      {producerInput.trim().length > 0 && (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          keyboardShouldPersistTaps="handled"
                          style={styles.suggestionStrip}
                          contentContainerStyle={styles.suggestionStripContent}
                        >
                          {!favoriteProducers.includes(producerInput.trim()) && (
                            <TouchableOpacity
                              style={styles.suggestionAddChip}
                              onPress={() => {
                                setFavoriteProducers([...favoriteProducers, producerInput.trim()]);
                                setProducerInput("");
                              }}
                              activeOpacity={0.8}
                            >
                              <MaterialCommunityIcons name="plus" size={13} color="#ffffff" />
                              <Text style={styles.suggestionAddChipText} numberOfLines={1}>
                                Add "{producerInput.trim()}"
                              </Text>
                            </TouchableOpacity>
                          )}
                          {availableProducers
                            .filter(
                              (p) =>
                                p.toLowerCase().includes(producerInput.toLowerCase()) &&
                                !favoriteProducers.includes(p)
                            )
                            .slice(0, 10)
                            .map((p, idx) => (
                              <TouchableOpacity
                                key={idx}
                                style={styles.suggestionChip}
                                onPress={() => {
                                  setFavoriteProducers([...favoriteProducers, p]);
                                  setProducerInput("");
                                }}
                                activeOpacity={0.8}
                              >
                                <Text style={styles.suggestionChipText} numberOfLines={1}>
                                  {p}
                                </Text>
                              </TouchableOpacity>
                            ))}
                        </ScrollView>
                      )}
                      <TextInput
                        style={styles.textInput}
                        placeholder="Type producer name..."
                        placeholderTextColor="#94a3b8"
                        value={producerInput}
                        onChangeText={setProducerInput}
                      />
                    </View>
                  )}
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Large POS Form Footer Actions */}
          <View style={styles.modalFooter}>
            <TouchableOpacity
              onPress={() => setActiveTab("search")}
              style={styles.cancelBtn}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelBtnText}>Back to List</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSaveNew}
              disabled={savingNew || !newName.trim()}
              style={[
                styles.primaryActionBtn,
                (!newName.trim() || savingNew) && styles.primaryActionBtnDisabled,
              ]}
              activeOpacity={0.85}
            >
              {savingNew ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <MaterialCommunityIcons name="check" size={18} color="#ffffff" />
                  <Text style={styles.primaryActionBtnText}>Save & Attach VIP</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  // If useModal is false, return the card directly (for embedding inside existing modal overlays)
  if (useModal === false) {
    return cardContent;
  }

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.modalOverlay}>
          <BlurView
            intensity={25}
            tint="systemMaterialDark"
            style={StyleSheet.absoluteFill}
          />
          {cardContent}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(30, 41, 59, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 16,
    elevation: 16,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: MAROON.ultraLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: MAROON.border,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#18181b",
  },
  modalSub: {
    fontSize: 11,
    fontWeight: "600",
    color: "#71717a",
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },

  // Tab Switcher
  tabSwitcher: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    padding: 3,
    marginBottom: 10,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
    borderRadius: 9,
    gap: 6,
  },
  tabBtnActive: {
    backgroundColor: "#ffffff",
    elevation: 2,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
  },

  // Search Bar
  searchBarWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1.2,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#0f172a",
  },

  // Customer Card & Grid
  columnWrapper: {
    gap: 8,
  },
  customerCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderWidth: 1.2,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  customerCardSelected: {
    borderColor: MAROON.primary,
    backgroundColor: "#fdf8f6",
  },
  customerCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
    marginRight: 8,
  },
  customerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  customerAvatarSelected: {
    backgroundColor: MAROON.primary,
    borderColor: MAROON.primary,
  },
  customerAvatarText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#475569",
  },
  customerAvatarTextSelected: {
    color: "#ffffff",
  },
  customerCardName: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0f172a",
  },
  ordersBadge: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  ordersBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#64748b",
  },
  customerMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
    flexWrap: "wrap",
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    maxWidth: 160,
  },
  metaText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
  },
  preferencesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
    flexWrap: "wrap",
  },
  stylePill: {
    backgroundColor: "#ffedd5",
    borderColor: "#fed7aa",
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  stylePillText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#c2410c",
  },
  regionPill: {
    backgroundColor: "#fef3c7",
    borderColor: "#fde68a",
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  regionPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#b45309",
  },
  customerRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  customerRadioSelected: {
    backgroundColor: MAROON.primary,
    borderColor: MAROON.primary,
  },

  // Loading & Empty States
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
  },
  centerText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
    marginTop: 8,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#18181b",
    marginTop: 10,
  },
  emptySub: {
    fontSize: 12,
    color: "#64748b",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 16,
    maxWidth: 320,
  },
  emptyAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: MAROON.primary,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
  },
  emptyAddBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#ffffff",
  },

  // Form Styles (Landscape & Portrait Responsive)
  formLandscapeRow: {
    flexDirection: "row",
    gap: 20,
  },
  formPortraitCol: {
    flexDirection: "column",
    gap: 8,
  },
  formLandscapeCol: {
    flex: 1,
  },
  formColFull: {
    width: "100%",
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "900",
    color: MAROON.primary,
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 4,
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#475569",
    letterSpacing: 0.6,
    marginBottom: 5,
  },
  textInput: {
    backgroundColor: "#f8fafc",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 44,
    fontSize: 13,
    fontWeight: "600",
    color: "#0f172a",
  },
  textAreaInput: {
    height: 64,
    paddingTop: 10,
    textAlignVertical: "top",
  },
  quickChipsWrapper: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  quickChip: {
    backgroundColor: "#f1f5f9",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  quickChipSelected: {
    backgroundColor: "#fdf8f6",
    borderColor: MAROON.border,
  },
  quickChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
  },
  quickChipTextSelected: {
    color: MAROON.primary,
    fontWeight: "800",
  },
  activeTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 6,
  },
  activeTagBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fef3c7",
    borderColor: "#fde68a",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  activeTagBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#b45309",
  },
  producerTagBadge: {
    backgroundColor: "#fdf8f6",
    borderColor: MAROON.border,
  },
  producerTagText: {
    color: MAROON.primary,
  },
  // Suggestion Strips & Chips
  suggestionStrip: {
    marginBottom: 6,
    maxHeight: 38,
  },
  suggestionStripContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  suggestionAddChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: MAROON.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  suggestionAddChipText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#ffffff",
    maxWidth: 160,
  },
  suggestionChip: {
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  suggestionChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#334155",
    maxWidth: 160,
  },
  suggestionRegionAddChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#b45309",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  suggestionRegionChip: {
    backgroundColor: "#fef3c7",
    borderWidth: 1,
    borderColor: "#fde68a",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  suggestionRegionChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#92400e",
    maxWidth: 160,
  },

  // Modal Footer
  modalFooter: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#64748b",
  },
  primaryActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: MAROON.primary,
  },
  primaryActionBtnDisabled: {
    backgroundColor: "#94a3b8",
  },
  primaryActionBtnText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#ffffff",
  },
});
