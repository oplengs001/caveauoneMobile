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
import { collection, addDoc, getDocs, query, where, serverTimestamp, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Customer } from "@/types";

interface CustomerPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeId: string;
  theme: any;
  onSelectCustomer: (customer: Customer | null) => void;
  selectedCustomerId?: string;
}

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
  const [loading, setLoading] = useState(true);

  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newContact, setNewContact] = useState("");
  const [savingNew, setSavingNew] = useState(false);

  useEffect(() => {
    if (isOpen && storeId) {
      fetchCustomers();
      setIsAddingNew(false);
      setNewName("");
      setNewEmail("");
      setNewContact("");
      setSearchQuery("");
    }
  }, [isOpen, storeId]);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, "customers"),
        where("storeId", "==", storeId),
        orderBy("updatedAt", "desc")
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
      setCustomers(data);
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
        (c.contactNo && c.contactNo.toLowerCase().includes(lowerQ))
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
      const docRef = await addDoc(collection(db, "customers"), {
        name: newName.trim(),
        email: newEmail.trim() || null,
        contactNo: newContact.trim() || null,
        storeId,
        totalSpend: 0,
        totalOrders: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const newCustomer: Customer = {
        id: docRef.id,
        name: newName.trim(),
        email: newEmail.trim() || undefined,
        contactNo: newContact.trim() || undefined,
        storeId,
        totalSpend: 0,
        totalOrders: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      setCustomers([newCustomer, ...customers]);
      onSelectCustomer(newCustomer);
      onClose();
    } catch (err) {
      console.error("Failed to save customer", err);
      Alert.alert("Error", "Could not save customer.");
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
            <View style={styles.addForm}>
              <Text style={[styles.formLabel, { color: theme.textSecondary }]}>Name *</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                placeholder="Juan dela Cruz"
                placeholderTextColor={theme.textSecondary}
                value={newName}
                onChangeText={setNewName}
                autoCapitalize="words"
              />

              <Text style={[styles.formLabel, { color: theme.textSecondary }]}>Email (Optional)</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                placeholder="juan@example.com"
                placeholderTextColor={theme.textSecondary}
                value={newEmail}
                onChangeText={setNewEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={[styles.formLabel, { color: theme.textSecondary }]}>Contact No. (Optional)</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                placeholder="+63 912 345 6789"
                placeholderTextColor={theme.textSecondary}
                value={newContact}
                onChangeText={setNewContact}
                keyboardType="phone-pad"
              />

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
                        {(item.email || item.contactNo) && (
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
