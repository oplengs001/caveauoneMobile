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
  const [favoriteWineStyles, setFavoriteWineStyles] = useState<string[]>([]);
  const [wineStyleInput, setWineStyleInput] = useState("");

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
      setFavoriteWineStyles([]);
      setWineStyleInput("");
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
          favoriteWineStyle: favoriteWineStyles.length > 0 ? favoriteWineStyles.join(", ") : null,
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

  // Compact POS dimensions
  const cardMaxWidth = Math.min(width - 32, 460);
  const cardHeight = Math.min(height - 48, isLandscape ? 540 : 620);

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
      {/* ── Modal Header (Compact) ─────────────────────────── */}
      <View style={styles.modalHeader}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons
              name={activeTab === "add" ? "account-plus-outline" : "account-search-outline"}
              size={20}
              color={MAROON.primary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {activeTab === "add" ? "New VIP Customer" : "Select Customer"}
            </Text>
            <Text style={styles.modalSub} numberOfLines={1}>
              {activeTab === "add"
                ? "Fill in guest details & wine tastes"
                : "Attach customer profile to this order"}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={onClose}
          style={styles.closeBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialCommunityIcons name="close" size={18} color="#64748b" />
        </TouchableOpacity>
      </View>

      {/* ── Segmented Control (Compact Tabs) ───────────────── */}
      <View style={styles.tabSwitcher}>
        <TouchableOpacity
          onPress={() => setActiveTab("search")}
          style={[styles.tabBtn, activeTab === "search" && styles.tabBtnActive]}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="account-group-outline"
            size={16}
            color={activeTab === "search" ? MAROON.primary : "#64748b"}
          />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Text
              style={[
                styles.tabBtnText,
                activeTab === "search" && styles.tabBtnTextActive,
              ]}
            >
              Directory ({customers.length})
            </Text>
            {isRefreshing && (
              <ActivityIndicator size={11} color={MAROON.primary} />
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
            size={16}
            color={activeTab === "add" ? MAROON.primary : "#64748b"}
          />
          <Text
            style={[
              styles.tabBtnText,
              activeTab === "add" && styles.tabBtnTextActive,
            ]}
          >
            + New VIP
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Tab 1: Client Directory View ─────────────────────────────────────── */}
      {activeTab === "search" ? (
        <View style={{ flex: 1 }}>
          {/* Compact Search Box */}
          <View style={styles.searchBarWrapper}>
            <MaterialCommunityIcons name="magnify" size={18} color="#94a3b8" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search name, phone, email, style..."
              placeholderTextColor="#94a3b8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery("")}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialCommunityIcons name="close-circle" size={16} color="#94a3b8" />
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
              data={filteredCustomers}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 6 }}
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
                    activeOpacity={0.75}
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
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                          <Text style={styles.customerCardName} numberOfLines={1}>
                            {item.name}
                          </Text>
                          {item.totalOrders && item.totalOrders > 0 ? (
                            <View style={styles.ordersBadge}>
                              <Text style={styles.ordersBadgeText}>
                                {item.totalOrders} {item.totalOrders === 1 ? "order" : "orders"}
                              </Text>
                            </View>
                          ) : null}
                        </View>

                        {/* Contact info row */}
                        {(item.contactNo || item.email) ? (
                          <View style={styles.customerMetaRow}>
                            {item.contactNo ? (
                              <View style={styles.metaItem}>
                                <MaterialCommunityIcons name="phone-outline" size={11} color="#64748b" />
                                <Text style={styles.metaText} numberOfLines={1}>{item.contactNo}</Text>
                              </View>
                            ) : null}
                            {item.email ? (
                              <View style={styles.metaItem}>
                                <MaterialCommunityIcons name="email-outline" size={11} color="#64748b" />
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
                              item.favoriteWineStyle
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean)
                                .slice(0, 2)
                                .map((style, sIdx) => (
                                  <View key={`style-${sIdx}`} style={styles.stylePill}>
                                    <Text style={styles.stylePillText} numberOfLines={1}>
                                      🍷 {style}
                                    </Text>
                                  </View>
                                ))
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
                        <MaterialCommunityIcons name="check" size={11} color="#ffffff" />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <MaterialCommunityIcons name="account-question-outline" size={38} color="#94a3b8" />
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
                    <MaterialCommunityIcons name="account-plus" size={16} color="#ffffff" />
                    <Text style={styles.emptyAddBtnText}>
                      {`Add "${searchQuery || "New VIP Customer"}"`}
                    </Text>
                  </TouchableOpacity>
                </View>
              }
            />
          )}

          {/* Compact Footer Actions */}
          <View style={styles.modalFooter}>
            <TouchableOpacity onPress={onClose} style={styles.cancelBtn} activeOpacity={0.8}>
              <Text style={styles.cancelBtnText}>Close</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setActiveTab("add")}
              style={styles.primaryActionBtn}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="account-plus-outline" size={16} color="#ffffff" />
              <Text style={styles.primaryActionBtnText}>+ Add New VIP</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        /* ── Tab 2: Add New Customer Form (Compact Vertical Layout) ───── */
        <View style={{ flex: 1 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 20 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.formContainer}>
              {/* Section 1: Guest Information */}
              <Text style={styles.sectionHeader}>1. Guest Information</Text>

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
              <View style={{ flexDirection: "row", gap: 8 }}>
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
                  placeholder="Cellar preferences, special requests, vintage tastes..."
                  placeholderTextColor="#94a3b8"
                  value={newNotes}
                  onChangeText={setNewNotes}
                  multiline
                />
              </View>

              {/* Section 2: Wine Preferences */}
              <Text style={[styles.sectionHeader, { marginTop: 6 }]}>2. Wine Preferences</Text>

              {/* Wine Style Selector (Multi-select) */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>
                  FAVORITE WINE STYLES {favoriteWineStyles.length > 0 ? `(${favoriteWineStyles.length})` : ""}
                </Text>

                {/* Active Custom Wine Styles Tags */}
                {favoriteWineStyles.filter((s) => !PREDEFINED_WINE_STYLES.includes(s)).length > 0 && (
                  <View style={styles.activeTagsRow}>
                    {favoriteWineStyles
                      .filter((s) => !PREDEFINED_WINE_STYLES.includes(s))
                      .map((customStyle, cIdx) => (
                        <View key={cIdx} style={[styles.activeTagBadge, styles.wineStyleTagBadge]}>
                          <Text style={[styles.activeTagBadgeText, styles.wineStyleTagText]}>
                            {customStyle}
                          </Text>
                          <TouchableOpacity
                            onPress={() =>
                              setFavoriteWineStyles(
                                favoriteWineStyles.filter((s) => s !== customStyle)
                              )
                            }
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <MaterialCommunityIcons name="close" size={12} color={MAROON.primary} />
                          </TouchableOpacity>
                        </View>
                      ))}
                  </View>
                )}

                {/* Predefined Wine Styles quick chips (toggle multiple) */}
                <View style={styles.quickChipsWrapper}>
                  {PREDEFINED_WINE_STYLES.map((style, idx) => {
                    const isSelected = favoriteWineStyles.includes(style);
                    return (
                      <TouchableOpacity
                        key={idx}
                        onPress={() => {
                          if (isSelected) {
                            setFavoriteWineStyles(
                              favoriteWineStyles.filter((s) => s !== style)
                            );
                          } else {
                            setFavoriteWineStyles([...favoriteWineStyles, style]);
                          }
                        }}
                        style={[
                          styles.quickChip,
                          isSelected && styles.quickChipSelected,
                        ]}
                        activeOpacity={0.8}
                      >
                        {isSelected && (
                          <MaterialCommunityIcons
                            name="check"
                            size={11}
                            color={MAROON.primary}
                            style={{ marginRight: 2 }}
                          />
                        )}
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

                {/* Optional Custom Wine Style Input */}
                <View style={{ marginTop: 5 }}>
                  {wineStyleInput.trim().length > 0 &&
                    !favoriteWineStyles.includes(wineStyleInput.trim()) && (
                      <TouchableOpacity
                        style={styles.suggestionAddChip}
                        onPress={() => {
                          setFavoriteWineStyles([
                            ...favoriteWineStyles,
                            wineStyleInput.trim(),
                          ]);
                          setWineStyleInput("");
                        }}
                        activeOpacity={0.8}
                      >
                        <MaterialCommunityIcons name="plus" size={12} color="#ffffff" />
                        <Text style={styles.suggestionAddChipText} numberOfLines={1}>
                          {`Add "${wineStyleInput.trim()}"`}
                        </Text>
                      </TouchableOpacity>
                    )}
                  <TextInput
                    style={styles.textInput}
                    placeholder="Type custom style (optional)..."
                    placeholderTextColor="#94a3b8"
                    value={wineStyleInput}
                    onChangeText={setWineStyleInput}
                  />
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
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <MaterialCommunityIcons name="close" size={12} color="#b45309" />
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
                            <MaterialCommunityIcons name="plus" size={12} color="#ffffff" />
                            <Text style={styles.suggestionAddChipText} numberOfLines={1}>
                              {`Add "${regionInput.trim()}"`}
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
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <MaterialCommunityIcons name="close" size={12} color={MAROON.primary} />
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
                            <MaterialCommunityIcons name="plus" size={12} color="#ffffff" />
                            <Text style={styles.suggestionAddChipText} numberOfLines={1}>
                              {`Add "${producerInput.trim()}"`}
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
          </ScrollView>

          {/* Compact Form Footer Actions */}
          <View style={styles.modalFooter}>
            <TouchableOpacity
              onPress={() => setActiveTab("search")}
              style={styles.cancelBtn}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelBtnText}>Back</Text>
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
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <MaterialCommunityIcons name="check" size={16} color="#ffffff" />
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
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 14,
    elevation: 16,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingBottom: 2,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: MAROON.ultraLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: MAROON.border,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.2,
  },
  modalSub: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
    marginTop: 1,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },

  // Tab Switcher
  tabSwitcher: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderRadius: 10,
    padding: 2.5,
    marginBottom: 8,
    gap: 3,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    borderRadius: 8,
    gap: 5,
  },
  tabBtnActive: {
    backgroundColor: "#ffffff",
    elevation: 2,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  tabBtnText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#64748b",
  },
  tabBtnTextActive: {
    color: MAROON.primary,
    fontWeight: "900",
  },

  // Search Bar
  searchBarWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
    gap: 6,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: "600",
    color: "#0f172a",
    paddingVertical: 0,
  },

  // Customer Card
  customerCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
  },
  customerCardSelected: {
    borderColor: MAROON.primary,
    backgroundColor: "#fdf8f6",
  },
  customerCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 8,
    marginRight: 8,
  },
  customerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 8,
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
    fontSize: 13,
    fontWeight: "900",
    color: "#475569",
  },
  customerAvatarTextSelected: {
    color: "#ffffff",
  },
  customerCardName: {
    fontSize: 12.5,
    fontWeight: "900",
    color: "#0f172a",
  },
  ordersBadge: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  ordersBadgeText: {
    fontSize: 8.5,
    fontWeight: "800",
    color: "#64748b",
  },
  customerMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
    flexWrap: "wrap",
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2.5,
    maxWidth: 150,
  },
  metaText: {
    fontSize: 10.5,
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
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  stylePillText: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#c2410c",
  },
  regionPill: {
    backgroundColor: "#fef3c7",
    borderColor: "#fde68a",
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  regionPillText: {
    fontSize: 9.5,
    fontWeight: "700",
    color: "#b45309",
  },
  customerRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
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
    padding: 24,
  },
  centerText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    marginTop: 6,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#18181b",
    marginTop: 8,
  },
  emptySub: {
    fontSize: 11,
    color: "#64748b",
    textAlign: "center",
    marginTop: 3,
    marginBottom: 12,
    maxWidth: 280,
  },
  emptyAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: MAROON.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  emptyAddBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#ffffff",
  },

  // Form Styles (Compact Single-Column)
  formContainer: {
    flex: 1,
  },
  sectionHeader: {
    fontSize: 10.5,
    fontWeight: "700",
    color: MAROON.primary,
    letterSpacing: 0.4,
    marginBottom: 6,
    marginTop: 4,
    textTransform: "uppercase",
  },
  inputGroup: {
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 9.5,
    fontWeight: "600",
    color: "#64748b",
    letterSpacing: 0.3,
    marginBottom: 3,
  },
  textInput: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
    fontSize: 12.5,
    fontWeight: "400",
    color: "#0f172a",
  },
  textAreaInput: {
    height: 52,
    paddingTop: 6,
    paddingBottom: 6,
    textAlignVertical: "top",
  },
  quickChipsWrapper: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
  },
  quickChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: 7,
  },
  quickChipSelected: {
    backgroundColor: "#fdf8f6",
    borderColor: MAROON.primary,
  },
  quickChipText: {
    fontSize: 10.5,
    fontWeight: "500",
    color: "#64748b",
  },
  quickChipTextSelected: {
    color: MAROON.primary,
    fontWeight: "600",
  },
  activeTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginBottom: 4,
  },
  activeTagBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#fef3c7",
    borderColor: "#fde68a",
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  activeTagBadgeText: {
    fontSize: 10,
    fontWeight: "500",
    color: "#b45309",
  },
  wineStyleTagBadge: {
    backgroundColor: "#fdf8f6",
    borderColor: MAROON.border,
  },
  wineStyleTagText: {
    color: MAROON.primary,
    fontWeight: "500",
  },
  producerTagBadge: {
    backgroundColor: "#fdf8f6",
    borderColor: MAROON.border,
  },
  producerTagText: {
    color: MAROON.primary,
    fontWeight: "500",
  },
  // Suggestion Strips & Chips
  suggestionStrip: {
    marginBottom: 5,
    maxHeight: 34,
  },
  suggestionStripContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  suggestionAddChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: MAROON.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  suggestionAddChipText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#ffffff",
    maxWidth: 140,
  },
  suggestionChip: {
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  suggestionChipText: {
    fontSize: 10,
    fontWeight: "500",
    color: "#334155",
    maxWidth: 140,
  },
  suggestionRegionAddChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#b45309",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  suggestionRegionChip: {
    backgroundColor: "#fef3c7",
    borderWidth: 1,
    borderColor: "#fde68a",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  suggestionRegionChipText: {
    fontSize: 10,
    fontWeight: "500",
    color: "#92400e",
    maxWidth: 140,
  },

  // Modal Footer
  modalFooter: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    height: 38,
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#64748b",
  },
  primaryActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: MAROON.primary,
    height: 38,
  },
  primaryActionBtnDisabled: {
    backgroundColor: "#94a3b8",
  },
  primaryActionBtnText: {
    fontSize: 12.5,
    fontWeight: "900",
    color: "#ffffff",
  },
});
