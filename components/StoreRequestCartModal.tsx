import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  CheckCircle2,
  Circle,
  Minus,
  Plus,
  ShoppingCart,
  Trash2,
  TrendingDown,
  X,
  Zap,
} from "lucide-react-native";
import { Colors } from "@/constants/theme";
import { MasterWine, StoreWineSetting, StockStatus } from "@/types";

export interface WineEntry {
  masterWine: MasterWine;
  stockCount: number;
  fullBottlesCount: number;
  openGlassesCount: number;
  setting: StoreWineSetting | null;
  status: StockStatus;
  requestedQty: number;
  activeRequest?: { id: string; status: string };
}

export interface RequestCartItem {
  entry: WineEntry;
  qty: number;
  selected: boolean;
}

interface StoreRequestCartModalProps {
  visible: boolean;
  onClose: () => void;
  cart: Record<string, RequestCartItem>;
  onUpdateQty: (wineId: string, deltaOrValue: number, isAbsolute?: boolean) => void;
  onToggleSelect: (wineId: string) => void;
  onSelectAll: (select: boolean) => void;
  onRemoveItem: (wineId: string) => void;
  onClearCart: () => void;
  onAddAllDeficits?: () => void;
  availableDeficitCount?: number;
  onSubmit: () => Promise<void>;
  submitting: boolean;
  isLandscape?: boolean;
}

const theme = Colors.store;

function getProducerAllCaps(producer?: string | null): string {
  return producer?.trim() ? producer.trim().toUpperCase() : "UNKNOWN PRODUCER";
}

function getWineDetailsLine(wine: {
  vintage?: string | null;
  name?: string | null;
  format?: string | null;
}): string {
  const vintage = wine.vintage?.trim() ? wine.vintage.trim() : "NV";
  const name = wine.name?.trim() ? wine.name.trim() : "Unnamed Wine";
  const format = wine.format?.trim() ? wine.format.trim() : "75cl";

  return `${vintage} - ${name} - ${format}`;
}

export default function StoreRequestCartModal({
  visible,
  onClose,
  cart,
  onUpdateQty,
  onToggleSelect,
  onSelectAll,
  onRemoveItem,
  onClearCart,
  onAddAllDeficits,
  availableDeficitCount = 0,
  onSubmit,
  submitting,
  isLandscape = false,
}: StoreRequestCartModalProps) {
  const items = Object.values(cart);
  const selectedItems = items.filter((item) => item.selected);
  const selectedBottles = selectedItems.reduce((sum, item) => sum + item.qty, 0);
  const allSelected = items.length > 0 && selectedItems.length === items.length;

  const totalAmount = selectedItems.reduce(
    (sum, item) => sum + (item.entry.masterWine.price || 0) * item.qty,
    0
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.overlay,
          isLandscape && { justifyContent: "center", alignItems: "center", padding: 16 },
        ]}
      >
        <View
          style={[
            styles.sheet,
            { maxHeight: isLandscape ? "92%" : "88%" },
            isLandscape && { maxWidth: 680, width: "100%", borderRadius: 20, alignSelf: "center" },
          ]}
        >
          {!isLandscape && <View style={styles.sheetHandle} />}

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <View style={styles.titleRow}>
                <ShoppingCart size={20} color={theme.primary} />
                <Text style={styles.title}>Wine Request Cart</Text>
              </View>
              <Text style={styles.subtitle}>
                {selectedItems.length} of {items.length} wines selected ({selectedBottles} bottles)
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={22} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Toolbar */}
          {items.length > 0 && (
            <View style={styles.toolbar}>
              <TouchableOpacity
                style={styles.toolbarBtn}
                onPress={() => onSelectAll(!allSelected)}
              >
                {allSelected ? (
                  <CheckCircle2 size={16} color={theme.primary} />
                ) : (
                  <Circle size={16} color={theme.textSecondary} />
                )}
                <Text style={styles.toolbarBtnText}>
                  {allSelected ? "Deselect All" : "Select All"}
                </Text>
              </TouchableOpacity>

              {availableDeficitCount > 0 && onAddAllDeficits && (
                <TouchableOpacity
                  style={[styles.toolbarBtn, styles.toolbarBtnHighlight]}
                  onPress={onAddAllDeficits}
                >
                  <Zap size={14} color="#ea580c" />
                  <Text style={[styles.toolbarBtnText, { color: "#ea580c" }]}>
                    Add Deficits ({availableDeficitCount})
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.toolbarBtn, { marginLeft: "auto" }]}
                onPress={onClearCart}
              >
                <Trash2 size={14} color="#ef4444" />
                <Text style={[styles.toolbarBtnText, { color: "#ef4444" }]}>Clear</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Items List / Empty State */}
          {items.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <ShoppingCart size={36} color={theme.textSecondary} />
              </View>
              <Text style={styles.emptyTitle}>Your request cart is empty</Text>
              <Text style={styles.emptySubtitle}>
                Add wines from your store list to group and request them together.
              </Text>

              {availableDeficitCount > 0 && onAddAllDeficits && (
                <TouchableOpacity
                  style={styles.emptyDeficitBtn}
                  onPress={onAddAllDeficits}
                >
                  <Zap size={16} color="#fff" />
                  <Text style={styles.emptyDeficitBtnText}>
                    Stage All {availableDeficitCount} Deficit Wines
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item) => item.entry.masterWine.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4 }}
              renderItem={({ item }) => {
                const wine = item.entry.masterWine;
                const price = wine.price || 0;
                const deficit = item.entry.requestedQty;

                return (
                  <View
                    style={[
                      styles.cartRow,
                      item.selected && styles.cartRowSelected,
                    ]}
                  >
                    {/* Selection Checkbox */}
                    <TouchableOpacity
                      onPress={() => onToggleSelect(wine.id)}
                      style={styles.checkboxTouch}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      {item.selected ? (
                        <CheckCircle2 size={24} color={theme.primary} />
                      ) : (
                        <Circle size={24} color="#cbd5e1" />
                      )}
                    </TouchableOpacity>

                    {/* Wine Info */}
                    <View style={{ flex: 1, paddingHorizontal: 8 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        {item.entry.setting?.wineCategory === "fun" && (
                          <Text style={styles.catEmojiText}>😁</Text>
                        )}
                        {item.entry.setting?.wineCategory === "fine" && (
                          <Text style={styles.catEmojiText}>💎</Text>
                        )}
                        {item.entry.setting?.wineCategory === "reserve" && (
                          <Text style={styles.catEmojiText}>👻</Text>
                        )}
                        <Text style={styles.wineProducer} numberOfLines={1}>
                          {getProducerAllCaps(wine.producer)}
                        </Text>
                      </View>
                      <Text style={styles.wineName} numberOfLines={2}>
                        {getWineDetailsLine(wine)}
                      </Text>
                      {wine.sku ? (
                        <Text style={styles.wineMeta}>SKU: {wine.sku}</Text>
                      ) : null}

                      <View style={styles.stockStatusRow}>
                        <Text style={styles.stockLabel}>
                          Store: {item.entry.stockCount} / Target:{" "}
                          {item.entry.setting?.safetyStock ?? 0}
                        </Text>
                        {deficit > 0 && (
                          <View style={styles.deficitBadge}>
                            <TrendingDown size={11} color="#ea580c" />
                            <Text style={styles.deficitBadgeText}>Need -{deficit}</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Stepper & Line Total */}
                    <View style={styles.rightControls}>
                      <View style={styles.stepperWrap}>
                        <TouchableOpacity
                          style={styles.stepperBtn}
                          onPress={() => onUpdateQty(wine.id, -1)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Minus size={16} color={theme.text} strokeWidth={2.5} />
                        </TouchableOpacity>
                        <TextInput
                          style={styles.stepperInput}
                          value={String(item.qty)}
                          keyboardType="number-pad"
                          selectTextOnFocus
                          onChangeText={(text) => {
                            const val = parseInt(text.replace(/[^0-9]/g, ""), 10);
                            onUpdateQty(wine.id, isNaN(val) ? 1 : Math.max(1, val), true);
                          }}
                        />
                        <TouchableOpacity
                          style={styles.stepperBtn}
                          onPress={() => onUpdateQty(wine.id, 1)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Plus size={16} color={theme.text} strokeWidth={2.5} />
                        </TouchableOpacity>
                      </View>

                      {price > 0 && (
                        <Text style={styles.linePrice}>
                          ₱{(price * item.qty).toLocaleString()}
                        </Text>
                      )}

                      {/* Remove Button */}
                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => onRemoveItem(wine.id)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Trash2 size={18} color="#94a3b8" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }}
            />
          )}

          {/* Footer Actions */}
          {items.length > 0 && (
            <View style={styles.footer}>
              <View style={styles.footerSummaryRow}>
                <Text style={styles.footerSummaryText}>
                  Selected: <Text style={styles.boldText}>{selectedItems.length}</Text> of{" "}
                  {items.length} wines ·{" "}
                  <Text style={styles.boldText}>{selectedBottles} bottles</Text>
                </Text>
                {totalAmount > 0 && (
                  <Text style={styles.footerTotalAmount}>
                    Est. ₱{totalAmount.toLocaleString()}
                  </Text>
                )}
              </View>

              <View style={styles.footerActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={onClose}
                  disabled={submitting}
                >
                  <Text style={styles.cancelBtnText}>KEEP BROWSING</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    (selectedItems.length === 0 || submitting) && styles.btnDisabled,
                  ]}
                  onPress={onSubmit}
                  disabled={selectedItems.length === 0 || submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.submitBtnText}>
                      SUBMIT REQUEST ({selectedBottles} BOTTLES)
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: theme.card || "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    width: "100%",
    overflow: "hidden",
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#cbd5e1",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.text || "#0f172a",
  },
  subtitle: {
    fontSize: 12,
    color: theme.textSecondary || "#64748b",
    marginTop: 3,
  },
  closeBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    gap: 10,
  },
  toolbarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    minHeight: 40,
  },
  toolbarBtnHighlight: {
    borderColor: "#fdba74",
    backgroundColor: "#fff7ed",
  },
  toolbarBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: theme.text || "#1e293b",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.text || "#0f172a",
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: theme.textSecondary || "#64748b",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 20,
  },
  emptyDeficitBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ea580c",
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 16,
    shadowColor: "#ea580c",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  emptyDeficitBtnText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 15,
  },
  cartRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#f1f5f9",
    marginVertical: 5,
  },
  cartRowSelected: {
    borderColor: "#fed7aa",
    backgroundColor: "#fffdfa",
  },
  checkboxTouch: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  wineProducer: {
    fontSize: 11,
    fontWeight: "900",
    color: theme.primary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  catEmojiText: {
    fontSize: 12,
    opacity: 0.85,
  },
  wineName: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.text || "#0f172a",
    marginTop: 2,
    lineHeight: 17,
  },
  wineMeta: {
    fontSize: 10,
    color: "#94a3b8",
    marginTop: 2,
    fontWeight: "600",
  },
  stockStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  stockLabel: {
    fontSize: 11,
    color: "#64748b",
  },
  deficitBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: "#ffedd5",
  },
  deficitBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#ea580c",
  },
  rightControls: {
    alignItems: "flex-end",
    gap: 6,
  },
  stepperWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
    height: 42,
  },
  stepperBtn: {
    width: 40,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
  },
  stepperInput: {
    width: 46,
    height: 42,
    paddingVertical: 0,
    fontSize: 16,
    fontWeight: "900",
    color: theme.text || "#0f172a",
    textAlign: "center",
  },
  linePrice: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
  },
  deleteBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 26,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    backgroundColor: "#ffffff",
    gap: 14,
  },
  footerSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerSummaryText: {
    fontSize: 13.5,
    color: "#64748b",
  },
  boldText: {
    fontWeight: "800",
    color: theme.text || "#0f172a",
  },
  footerTotalAmount: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.primary,
  },
  footerActions: {
    flexDirection: "row",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#64748b",
  },
  submitBtn: {
    flex: 2,
    height: 54,
    borderRadius: 16,
    backgroundColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: 0.5,
  },
  btnDisabled: {
    opacity: 0.45,
  },
});
