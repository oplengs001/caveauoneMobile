import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Search, Plus, X, User, Check, Mail, Phone } from "lucide-react-native";
import { apiFetch } from "@/lib/api";
import { Customer } from "@/types";

interface CustomerPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeId: string;
  theme: any;
  onSelectCustomer: (customer: Customer | null) => void;
  selectedCustomerId?: string;
}

export const PREDEFINED_COUNTRIES_REGIONS = [
  "Germany",
  "Austria",
  "France",
  "Burgundy (White)",
  "Burgundy (Red)",
  "Côte de Nuits",
  "Côte de Beaune",
  "Chablis",
  "Côte Chalonnaise",
  "Mâconnais",
  "Bordeaux",
  "Rhône (North)",
  "Rhône (South)",
  "Loire",
  "Alsace",
  "Jura",
  "Italy",
  "Barolo",
  "Brunello di Montalcino",
  "Chianti Classico",
  "Spain",
  "Rioja",
  "Ribera del Duero",
  "Portugal",
  "Douro",
  "Dão",
  "Vinho Verde",
  "United States",
  "Napa Valley",
  "Sonoma Coast",
  "Russian River Valley",
  "Santa Rita Hills",
  "Willamette Valley (Oregon)",
  "Australia",
  "Barossa Valley",
  "Margaret River",
  "Yarra Valley",
  "McLaren Vale",
  "Hunter Valley",
  "Eden Valley",
  "Clare Valley",
  "Coonawarra",
  "Mornington Peninsula",
  "Adelaide Hills",
  "Tasmania",
  "Beechworth",
  "South Africa",
  "Stellenbosch",
  "Hemel-en-Aarde",
  "Swartland",
  "Chile",
  "Argentina",
];

export const PREDEFINED_WINE_STYLES = [
  "Red Wine",
  "White Wine",
  "Sparkling Wine",
  "Champagne",
  "Rosé Wine",
  "Dessert / Sweet Wine",
  "Fortified Wine",
  "Full-Bodied Red",
  "Medium-Bodied Red",
  "Light Red",
  "Crisp & Dry White",
  "Oaky & Rich White",
  "Natural / Organic / Biodynamic",
  "Skin Contact / Amber / Orange",
];

export default function CustomerPickerModal({
  isOpen,
  onClose,
  storeId,
  theme,
  onSelectCustomer,
  selectedCustomerId,
}: CustomerPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [availableProducers, setAvailableProducers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [isAddingNew, setIsAddingNew] = useState(false);
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

  useEffect(() => {
    if (isOpen && storeId) {
      fetchCustomers();
      fetchMasterProducers();
      setIsAddingNew(false);
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
  }, [isOpen, storeId]);

  const fetchMasterProducers = async () => {
    try {
      const data = await apiFetch("/producers").catch(() => apiFetch("/wines"));
      let uniqueProducers: string[] = [];
      if (Array.isArray(data)) {
        if (data.length > 0 && typeof data[0] === "string") {
          uniqueProducers = data;
        } else {
          uniqueProducers = Array.from(
            new Set(data.map((w: any) => w.producer).filter((p: any) => p && typeof p === "string" && p.trim().length > 0))
          ) as string[];
        }
      } else if (data?.masterWines) {
        uniqueProducers = Array.from(
          new Set(data.masterWines.map((w: any) => w.producer).filter((p: any) => p && typeof p === "string" && p.trim().length > 0))
        ) as string[];
      }
      setAvailableProducers(uniqueProducers.sort());
    } catch (e) {
      console.error("Failed to fetch master wine producers", e);
    }
  };

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/customers?storeId=${storeId}`);
      const list: Customer[] = Array.isArray(data) ? data : (data.customers || []);
      setCustomers(list);
    } catch (err) {
      console.error("Failed to fetch customers", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return customers;
    const lowerQ = searchQuery.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(lowerQ) ||
        (c.email && c.email.toLowerCase().includes(lowerQ)) ||
        (c.contactNo && c.contactNo.toLowerCase().includes(lowerQ)) ||
        (c.notes && c.notes.toLowerCase().includes(lowerQ))
    );
  }, [customers, searchQuery]);

  const handleSaveNew = async () => {
    const trimmedName = newName.trim();
    if (!trimmedName) {
      Alert.alert("Required", "Please enter a customer name.");
      return;
    }

    // Check duplicates
    const duplicate = customers.find(c => c.name.toLowerCase() === trimmedName.toLowerCase());
    
    if (duplicate) {
      Alert.alert(
        "Duplicate Name",
        `A customer named "${trimmedName}" already exists. Do you want to proceed and create a new record anyway (e.g. you could add a suffix like _1)?`,
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
          storeId,
          totalSpend: 0,
          totalOrders: 0,
        }),
      });

      onSelectCustomer(newCustomer as Customer);
      onClose();
    } catch (err) {
      console.error("Error creating customer", err);
      Alert.alert("Error", "Failed to save customer.");
    } finally {
      setSavingNew(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal visible={isOpen} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.modalContent, { backgroundColor: theme.background }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Select Customer</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={24} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          {!isAddingNew && (
            <View style={[styles.searchContainer, { borderBottomColor: theme.border }]}>
              <View style={[styles.searchInputWrapper, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Search size={18} color={theme.textSecondary} />
                <TextInput
                  style={[styles.searchInput, { color: theme.text }]}
                  placeholder="Search by name, email, or contact..."
                  placeholderTextColor={theme.textSecondary}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="words"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery("")}>
                    <X size={16} color={theme.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* List or Add New */}
          {isAddingNew ? (
            <FlatList
              data={[1]}
              keyExtractor={() => "form"}
              renderItem={() => (
                <View style={styles.addForm}>
                  <Text style={[styles.formLabel, { color: theme.textSecondary }]}>Customer Name *</Text>
                  <TextInput
                    style={[styles.formInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                    placeholder="Juan dela Cruz"
                    placeholderTextColor={theme.textSecondary}
                    value={newName}
                    onChangeText={setNewName}
                    autoCapitalize="words"
                  />

                  {/* 2 Columns: Email & Contact */}
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.formLabel, { color: theme.textSecondary, marginTop: 0 }]}>Email</Text>
                      <TextInput
                        style={[styles.formInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                        placeholder="juan@example.com"
                        placeholderTextColor={theme.textSecondary}
                        value={newEmail}
                        onChangeText={setNewEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.formLabel, { color: theme.textSecondary, marginTop: 0 }]}>Contact No.</Text>
                      <TextInput
                        style={[styles.formInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                        placeholder="+63 912 345 6789"
                        placeholderTextColor={theme.textSecondary}
                        value={newContact}
                        onChangeText={setNewContact}
                        keyboardType="phone-pad"
                      />
                    </View>
                  </View>

                  {/* Taste Preferences Header */}
                  <View style={{ marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: theme.border }}>
                    <Text style={{ fontSize: 13, fontWeight: "800", color: theme.primary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
                      Taste Preferences
                    </Text>

                    {/* Favourite Producers (up to 10) */}
                    <View style={{ marginBottom: 16 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <Text style={[styles.formLabel, { color: theme.textSecondary, marginTop: 0, marginBottom: 0 }]}>
                          Favourite Producers ({favoriteProducers.length}/10)
                        </Text>
                      </View>
                      {favoriteProducers.length > 0 && (
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                          {favoriteProducers.map((prod, pIdx) => (
                            <TouchableOpacity
                              key={pIdx}
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                                backgroundColor: theme.primary + "1A",
                                borderColor: theme.primary + "40",
                                borderWidth: 1,
                                paddingHorizontal: 10,
                                paddingVertical: 5,
                                borderRadius: 14,
                              }}
                              onPress={() => setFavoriteProducers(favoriteProducers.filter((_, i) => i !== pIdx))}
                            >
                              <Text style={{ fontSize: 12, fontWeight: "700", color: theme.primary }}>{prod}</Text>
                              <X size={14} color={theme.primary} />
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                      {favoriteProducers.length < 10 && (
                        <View style={{ position: "relative" }}>
                          <TextInput
                            style={[styles.formInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                            placeholder="Type producer e.g. Domaine Leflaive..."
                            placeholderTextColor={theme.textSecondary}
                            value={producerInput}
                            onChangeText={setProducerInput}
                          />
                          {producerInput.trim().length > 0 && (
                            <View style={{ backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 12, marginTop: 4, padding: 4, zIndex: 10 }}>
                              {availableProducers
                                .filter((p) => p.toLowerCase().includes(producerInput.toLowerCase()) && !favoriteProducers.includes(p))
                                .slice(0, 5)
                                .map((p, idx) => (
                                  <TouchableOpacity
                                    key={idx}
                                    style={{ padding: 10, borderBottomWidth: idx < 4 ? 1 : 0, borderBottomColor: theme.border }}
                                    onPress={() => {
                                      setFavoriteProducers([...favoriteProducers, p]);
                                      setProducerInput("");
                                    }}
                                  >
                                    <Text style={{ fontSize: 13, fontWeight: "600", color: theme.text }}>{p}</Text>
                                  </TouchableOpacity>
                                ))}
                              {!favoriteProducers.includes(producerInput.trim()) && (
                                <TouchableOpacity
                                  style={{ padding: 10, backgroundColor: theme.primary + "12", borderRadius: 8, marginTop: 4 }}
                                  onPress={() => {
                                    setFavoriteProducers([...favoriteProducers, producerInput.trim()]);
                                    setProducerInput("");
                                  }}
                                >
                                  <Text style={{ fontSize: 13, fontWeight: "700", color: theme.primary }}>
                                    + Add "{producerInput.trim()}"
                                  </Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          )}
                        </View>
                      )}
                    </View>

                    {/* Favourite Country / Region (up to 10) */}
                    <View style={{ marginBottom: 16 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <Text style={[styles.formLabel, { color: theme.textSecondary, marginTop: 0, marginBottom: 0 }]}>
                          Favourite Country / Region ({favoriteRegions.length}/10)
                        </Text>
                      </View>
                      {favoriteRegions.length > 0 && (
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                          {favoriteRegions.map((reg, rIdx) => (
                            <TouchableOpacity
                              key={rIdx}
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                                backgroundColor: "#f59e0b1A",
                                borderColor: "#f59e0b40",
                                borderWidth: 1,
                                paddingHorizontal: 10,
                                paddingVertical: 5,
                                borderRadius: 14,
                              }}
                              onPress={() => setFavoriteRegions(favoriteRegions.filter((_, i) => i !== rIdx))}
                            >
                              <Text style={{ fontSize: 12, fontWeight: "700", color: "#d97706" }}>{reg}</Text>
                              <X size={14} color="#d97706" />
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                      {favoriteRegions.length < 10 && (
                        <View style={{ position: "relative" }}>
                          <TextInput
                            style={[styles.formInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                            placeholder="Search region e.g. Bordeaux, Napa Valley..."
                            placeholderTextColor={theme.textSecondary}
                            value={regionInput}
                            onChangeText={setRegionInput}
                          />
                          {regionInput.trim().length > 0 && (
                            <View style={{ backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 12, marginTop: 4, padding: 4, zIndex: 10 }}>
                              {PREDEFINED_COUNTRIES_REGIONS
                                .filter((r) => r.toLowerCase().includes(regionInput.toLowerCase()) && !favoriteRegions.includes(r))
                                .slice(0, 5)
                                .map((r, idx) => (
                                  <TouchableOpacity
                                    key={idx}
                                    style={{ padding: 10, borderBottomWidth: idx < 4 ? 1 : 0, borderBottomColor: theme.border }}
                                    onPress={() => {
                                      setFavoriteRegions([...favoriteRegions, r]);
                                      setRegionInput("");
                                    }}
                                  >
                                    <Text style={{ fontSize: 13, fontWeight: "600", color: theme.text }}>{r}</Text>
                                  </TouchableOpacity>
                                ))}
                              {!favoriteRegions.includes(regionInput.trim()) && (
                                <TouchableOpacity
                                  style={{ padding: 10, backgroundColor: "#f59e0b12", borderRadius: 8, marginTop: 4 }}
                                  onPress={() => {
                                    setFavoriteRegions([...favoriteRegions, regionInput.trim()]);
                                    setRegionInput("");
                                  }}
                                >
                                  <Text style={{ fontSize: 13, fontWeight: "700", color: "#d97706" }}>
                                    + Add "{regionInput.trim()}"
                                  </Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          )}
                        </View>
                      )}
                    </View>

                    {/* Favorite Wine Style */}
                    <View style={{ marginBottom: 16 }}>
                      <Text style={[styles.formLabel, { color: theme.textSecondary, marginTop: 0 }]}>Favorite Wine Style</Text>
                      <TextInput
                        style={[styles.formInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                        placeholder="Select or type style e.g. Full-Bodied Red..."
                        placeholderTextColor={theme.textSecondary}
                        value={favoriteWineStyle}
                        onChangeText={setFavoriteWineStyle}
                      />
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                        {PREDEFINED_WINE_STYLES.slice(0, 6).map((st, idx) => (
                          <TouchableOpacity
                            key={idx}
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                              borderRadius: 12,
                              borderWidth: 1,
                              borderColor: favoriteWineStyle === st ? theme.primary : theme.border,
                              backgroundColor: favoriteWineStyle === st ? theme.primary + "1A" : theme.card,
                            }}
                            onPress={() => setFavoriteWineStyle(favoriteWineStyle === st ? "" : st)}
                          >
                            <Text style={{ fontSize: 11, fontWeight: "700", color: favoriteWineStyle === st ? theme.primary : theme.textSecondary }}>
                              {st}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>

                  {/* Notes Section (Full Width below preferences) */}
                  <View style={{ marginTop: 12, paddingTop: 16, borderTopWidth: 1, borderTopColor: theme.border }}>
                    <Text style={[styles.formLabel, { color: theme.textSecondary, marginTop: 0 }]}>Notes (Optional)</Text>
                    <TextInput
                      style={[
                        styles.formInput,
                        { backgroundColor: theme.card, color: theme.text, borderColor: theme.border, height: 80, paddingTop: 12, textAlignVertical: "top" }
                      ]}
                      placeholder="Any special requests or details..."
                      placeholderTextColor={theme.textSecondary}
                      value={newNotes}
                      onChangeText={setNewNotes}
                      multiline
                    />
                  </View>

                  <View style={styles.formActions}>
                    <TouchableOpacity
                      style={[styles.btnCancel, { backgroundColor: theme.card }]}
                      onPress={() => setIsAddingNew(false)}
                    >
                      <Text style={[styles.btnCancelText, { color: theme.textSecondary }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btnSave, { backgroundColor: theme.primary }]}
                      onPress={handleSaveNew}
                      disabled={savingNew}
                    >
                      {savingNew ? (
                        <ActivityIndicator size="small" color="#FFF" />
                      ) : (
                        <Text style={styles.btnSaveText}>Save & Select</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
          ) : (
            <FlatList
              data={filteredCustomers}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const isSelected = selectedCustomerId === item.id;
                return (
                  <TouchableOpacity
                    style={[
                      styles.customerCard,
                      { backgroundColor: theme.card, borderColor: isSelected ? theme.primary : theme.border },
                    ]}
                    onPress={() => {
                      onSelectCustomer(item);
                      onClose();
                    }}
                  >
                    <View style={styles.customerHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.customerName, { color: theme.text }]}>{item.name}</Text>
                        {(item.email || item.contactNo || item.favoriteWineStyle || (item.favoriteProducers && item.favoriteProducers.length > 0) || (item.favoriteRegions && item.favoriteRegions.length > 0)) && (
                          <View style={styles.customerMeta}>
                            {item.email && (
                              <View style={styles.metaRow}>
                                <Mail size={12} color={theme.textSecondary} />
                                <Text style={[styles.metaText, { color: theme.textSecondary }]}>{item.email}</Text>
                              </View>
                            )}
                            {item.contactNo && (
                              <View style={styles.metaRow}>
                                <Phone size={12} color={theme.textSecondary} />
                                <Text style={[styles.metaText, { color: theme.textSecondary }]}>{item.contactNo}</Text>
                              </View>
                            )}
                            {item.favoriteWineStyle && (
                              <View style={{ marginTop: 4, alignSelf: "flex-start", backgroundColor: theme.primary + "15", borderColor: theme.primary + "30", borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                                <Text style={{ fontSize: 11, fontWeight: "700", color: theme.primary }}>
                                  🍷 {item.favoriteWineStyle}
                                </Text>
                              </View>
                            )}
                            {item.favoriteProducers && item.favoriteProducers.length > 0 && (
                              <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 4 }} numberOfLines={1}>
                                ⭐ Producers: {item.favoriteProducers.join(", ")}
                              </Text>
                            )}
                            {item.favoriteRegions && item.favoriteRegions.length > 0 && (
                              <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 2 }} numberOfLines={1}>
                                📍 Regions: {item.favoriteRegions.join(", ")}
                              </Text>
                            )}
                          </View>
                        )}
                      </View>
                      {isSelected ? (
                        <View style={[styles.checkCircle, { backgroundColor: theme.primary }]}>
                          <Check size={14} color="#FFF" />
                        </View>
                      ) : (
                        <View style={styles.statsBadge}>
                          <Text style={styles.statsText}>{item.totalOrders || 0} orders</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  {loading ? (
                    <ActivityIndicator size="large" color={theme.primary} />
                  ) : (
                    <>
                      <User size={48} color={theme.textSecondary} style={{ opacity: 0.5, marginBottom: 16 }} />
                      <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                        {searchQuery ? "No matching customers found." : "No customers yet."}
                      </Text>
                      <TouchableOpacity
                        style={[styles.addInlineBtn, { backgroundColor: theme.primary + "1A" }]}
                        onPress={() => setIsAddingNew(true)}
                      >
                        <Plus size={16} color={theme.primary} />
                        <Text style={[styles.addInlineText, { color: theme.primary }]}>Add "{searchQuery || "New Customer"}"</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              }
            />
          )}

          {/* Footer Add Button */}
          {!isAddingNew && (
            <View style={[styles.footer, { borderTopColor: theme.border }]}>
              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: theme.primary }]}
                onPress={() => setIsAddingNew(true)}
              >
                <Plus size={20} color="#FFF" />
                <Text style={styles.addBtnText}>Add New Customer</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    height: "85%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    flexDirection: "column",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  closeBtn: {
    padding: 4,
  },
  searchContainer: {
    padding: 16,
    borderBottomWidth: 1,
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  customerCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  customerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  customerName: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 4,
  },
  customerMeta: {
    gap: 2,
    marginTop: 4,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    fontWeight: "500",
  },
  statsBadge: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statsText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748b",
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 16,
  },
  addInlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  addInlineText: {
    fontSize: 14,
    fontWeight: "700",
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
  },
  addBtnText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "800",
  },
  addForm: {
    padding: 20,
    flex: 1,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 16,
  },
  formInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 50,
    fontSize: 15,
    fontWeight: "600",
  },
  formActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 32,
  },
  btnCancel: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnCancelText: {
    fontSize: 15,
    fontWeight: "700",
  },
  btnSave: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSaveText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
