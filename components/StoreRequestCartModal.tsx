import { Colors } from "@/constants/theme";
import { MasterWine, StockStatus, StoreWineSetting } from "@/types";
import {
  CheckCircle2,
  Circle,
  DollarSign,
  Minus,
  Plus,
  ShoppingCart,
  Trash2,
  TrendingDown,
  X,
  Zap,
} from "lucide-react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

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
  showAmounts?: boolean;
  onToggleShowAmounts?: () => void;
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
  showAmounts: externalShowAmounts,
  onToggleShowAmounts,
}: StoreRequestCartModalProps) {
  const [internalShowAmounts, setInternalShowAmounts] = useState(false);
  const showAmounts = externalShowAmounts !== undefined ? externalShowAmounts : internalShowAmounts;

  const handleToggleAmounts = () => {
    if (onToggleShowAmounts) {
      onToggleShowAmounts();
    } else {
      setInternalShowAmounts((prev) => !prev);
    }
  };

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
            { maxHeight: isLandscape ? "94%" : "90%" },
            isLandscape && { maxWidth: 700, width: "100%", borderRadius: 20, alignSelf: "center" },
          ]}
        >
          {!isLandscape && <View style={styles.sheetHandle} />}

          {/* Compact Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <View style={styles.titleRow}>
                <ShoppingCart size={17} color={theme.primary} />
                <Text style={styles.title}>Wine Request Cart</Text>
                {items.length > 0 && (
                  <View style={styles.headerCountBadge}>
                    <Text style={styles.headerCountBadgeText}>{items.length}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.subtitle}>
                {selectedItems.length} of {items.length} wines selected ({selectedBottles}{" "}
                {selectedBottles === 1 ? "bottle" : "bottles"})
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <X size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Compact Toolbar */}
          {items.length > 0 && (
            <View style={styles.toolbar}>
              <TouchableOpacity
                style={[styles.toolbarBtn, allSelected && styles.toolbarBtnActive]}
                onPress={() => onSelectAll(!allSelected)}
              >
                {allSelected ? (
                  <CheckCircle2 size={13} color={theme.primary} />
                ) : (
                  <Circle size={13} color={theme.textSecondary} />
                )}
                <Text style={[styles.toolbarBtnText, allSelected && { color: theme.primary }]}>
                  {allSelected ? "Deselect All" : "Select All"}
                </Text>
              </TouchableOpacity>

              {availableDeficitCount > 0 && onAddAllDeficits && (
                <TouchableOpacity
                  style={[styles.toolbarBtn, styles.toolbarBtnHighlight]}
                  onPress={onAddAllDeficits}
                >
                  <Zap size={12} color={theme.primary} />
                  <Text style={[styles.toolbarBtnText, { color: theme.primary }]}>
                    + Deficits ({availableDeficitCount})
                  </Text>
                </TouchableOpacity>
              )}

              {/* Toggle Price / Amount */}
              <TouchableOpacity
                style={[styles.toolbarBtn, showAmounts && styles.toolbarBtnActive]}
                onPress={handleToggleAmounts}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <DollarSign
                  size={12}
                  color={showAmounts ? theme.primary : theme.textSecondary}
                  strokeWidth={2.4}
                />
                <Text style={[styles.toolbarBtnText, showAmounts && { color: theme.primary }]}>
                  {showAmounts ? "Amounts" : "Hidden"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.toolbarBtn, styles.toolbarBtnClear]}
                onPress={onClearCart}
              >
                <Trash2 size={12} color={theme.danger} />
                <Text style={[styles.toolbarBtnText, { color: theme.danger }]}>Clear</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Items List / Empty State */}
          {items.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <ShoppingCart size={28} color={theme.textSecondary} />
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
                  <Zap size={14} color="#fff" />
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
              contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12, paddingTop: 4 }}
              renderItem={({ item }) => {
                const wine = item.entry.masterWine;
                const price = wine.price || 0;
                const deficit = item.entry.requestedQty;
                const category = item.entry.setting?.wineCategory || wine.wineCategory;

                return (
                  <View
                    style={[
                      styles.cartRow,
                      item.selected && styles.cartRowSelected,
                    ]}
                  >
                    {/* Compact Selection Checkbox */}
                    <TouchableOpacity
                      onPress={() => onToggleSelect(wine.id)}
                      style={styles.checkboxTouch}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      {item.selected ? (
                        <CheckCircle2 size={20} color={theme.primary} />
                      ) : (
                        <Circle size={20} color="#cbd5e1" />
                      )}
                    </TouchableOpacity>

                    {/* Wine Info */}
                    <View style={styles.wineInfoCol}>
                      {/* Producer & Category */}
                      <View style={styles.producerRow}>
                        {category ? (
                          <View style={styles.catPill}>
                            <Text style={styles.catPillText}>
                              {category === "fun"
                                ? "FUN"
                                : category === "fine"
                                  ? "FINE"
                                  : "RESERVE"}
                            </Text>
                          </View>
                        ) : null}
                        <Text style={styles.wineProducer} numberOfLines={1}>
                          {getProducerAllCaps(wine.producer)}
                        </Text>
                      </View>

                      {/* Wine Details */}
                      <Text style={styles.wineName} numberOfLines={1}>
                        {getWineDetailsLine(wine)}
                      </Text>

                      {/* Unified Compact Meta Strip */}
                      <View style={styles.stockStatusRow}>
                        <Text style={styles.stockLabel}>
                          {item.entry.stockCount}/{item.entry.setting?.safetyStock ?? 0} tgt
                        </Text>
                        {deficit > 0 && (
                          <View style={styles.deficitBadge}>
                            <TrendingDown size={9} color={theme.danger} strokeWidth={2.5} />
                            <Text style={styles.deficitBadgeText}>-{deficit} def</Text>
                          </View>
                        )}
                        {wine.sku ? (
                          <Text style={styles.wineMeta} numberOfLines={1}>
                            · SKU: {wine.sku}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    {/* Stepper, Price & Quick Delete */}
                    <View style={styles.rightControls}>
                      <View style={styles.priceRow}>
                        {showAmounts && price > 0 && (
                          <Text style={styles.linePrice}>
                            ₱{(price * item.qty).toLocaleString()}
                          </Text>
                        )}
                        <TouchableOpacity
                          style={styles.deleteBtn}
                          onPress={() => onRemoveItem(wine.id)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Trash2 size={13} color="#94a3b8" />
                        </TouchableOpacity>
                      </View>

                      {/* Compact Stepper */}
                      <View style={styles.stepperWrap}>
                        <TouchableOpacity
                          style={styles.stepperBtn}
                          onPress={() => {
                            if (item.qty <= 1) {
                              onRemoveItem(wine.id);
                            } else {
                              onUpdateQty(wine.id, -1);
                            }
                          }}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          {item.qty <= 1 ? (
                            <Trash2 size={12} color={theme.danger} />
                          ) : (
                            <Minus size={12} color={theme.text} strokeWidth={2.5} />
                          )}
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
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Plus size={12} color={theme.text} strokeWidth={2.5} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              }}
            />
          )}

          {/* Compact Footer Actions */}
          {items.length > 0 && (
            <View style={styles.footer}>
              <View style={styles.footerSummaryRow}>
                <View>
                  <Text style={styles.footerSummaryLabel}>TOTAL SELECTED</Text>
                  <Text style={styles.footerSummaryBottles}>
                    {selectedBottles} {selectedBottles === 1 ? "bottle" : "bottles"}{" "}
                    <Text style={styles.footerSummaryWines}>({selectedItems.length} wines)</Text>
                  </Text>
                </View>
                {showAmounts && totalAmount > 0 && (
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.footerSummaryLabel}>EST. AMOUNT</Text>
                    <Text style={styles.footerTotalAmount}>
                      ₱{totalAmount.toLocaleString()}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.footerActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={onClose}
                  disabled={submitting}
                >
                  <Text style={styles.cancelBtnText}>Back</Text>
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
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.submitBtnText}>
                      SUBMIT ({selectedBottles} BOTTLES)
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
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: theme.card || "#ffffff",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    width: "100%",
    overflow: "hidden",
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: "#cbd5e1",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 8,
    marginBottom: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.text,
    letterSpacing: -0.2,
  },
  headerCountBadge: {
    backgroundColor: theme.primary + "14",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  headerCountBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.primary,
  },
  subtitle: {
    fontSize: 11,
    color: theme.textSecondary,
    fontWeight: "600",
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.background,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: theme.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    gap: 8,
  },
  toolbarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    height: 30,
  },
  toolbarBtnActive: {
    borderColor: theme.primary + "30",
    backgroundColor: theme.primary + "0A",
  },
  toolbarBtnInactive: {
    borderColor: theme.border,
    backgroundColor: theme.background,
  },
  toolbarBtnHighlight: {
    borderColor: theme.primary + "30",
    backgroundColor: theme.primary + "0C",
  },
  toolbarBtnClear: {
    marginLeft: "auto",
    borderColor: theme.danger + "25",
    backgroundColor: theme.danger + "08",
  },
  toolbarBtnText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: theme.textSecondary,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 36,
    paddingHorizontal: 20,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.background,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: theme.text,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    color: theme.textSecondary,
    textAlign: "center",
    lineHeight: 16,
    marginBottom: 16,
  },
  emptyDeficitBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.primary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  emptyDeficitBtnText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 13,
  },
  cartRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    marginVertical: 3,
  },
  cartRowSelected: {
    borderColor: theme.primary + "35",
    backgroundColor: theme.primary + "05",
  },
  checkboxTouch: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 2,
  },
  wineInfoCol: {
    flex: 1,
    paddingHorizontal: 6,
    justifyContent: "center",
  },
  producerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 1,
  },
  catPill: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: theme.accent + "18",
    borderWidth: 1,
    borderColor: theme.accent + "30",
  },
  catPillText: {
    fontSize: 8.5,
    fontWeight: "900",
    color: theme.accent,
    letterSpacing: 0.4,
  },
  wineProducer: {
    fontSize: 10.5,
    fontWeight: "900",
    color: theme.primary,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  wineName: {
    fontSize: 12.5,
    fontWeight: "700",
    color: theme.text,
    lineHeight: 16,
  },
  stockStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
    flexWrap: "wrap",
  },
  stockLabel: {
    fontSize: 10.5,
    fontWeight: "600",
    color: theme.textSecondary,
  },
  wineMeta: {
    fontSize: 10,
    color: theme.textSecondary,
    fontWeight: "600",
  },
  deficitBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    backgroundColor: theme.danger + "10",
    borderColor: theme.danger + "25",
    borderWidth: 1,
  },
  deficitBadgeText: {
    fontSize: 9.5,
    fontWeight: "900",
    color: theme.danger,
  },
  rightControls: {
    alignItems: "flex-end",
    gap: 4,
    marginLeft: 6,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  linePrice: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.primary,
  },
  deleteBtn: {
    padding: 3,
  },
  stepperWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: "hidden",
    height: 30,
  },
  stepperBtn: {
    width: 26,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.card,
  },
  stepperInput: {
    width: 32,
    height: 30,
    paddingVertical: 0,
    paddingHorizontal: 0,
    fontSize: 13,
    fontWeight: "900",
    color: theme.text,
    textAlign: "center",
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 22 : 14,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.card,
    gap: 10,
  },
  footerSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerSummaryLabel: {
    fontSize: 9.5,
    fontWeight: "800",
    color: theme.textSecondary,
    letterSpacing: 0.5,
  },
  footerSummaryBottles: {
    fontSize: 13,
    fontWeight: "900",
    color: theme.text,
    marginTop: 1,
  },
  footerSummaryWines: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.textSecondary,
  },
  footerTotalAmount: {
    fontSize: 14,
    fontWeight: "900",
    color: theme.primary,
    marginTop: 1,
  },
  footerActions: {
    flexDirection: "row",
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    height: 42,
    borderRadius: 11,
    backgroundColor: theme.background,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: theme.textSecondary,
  },
  submitBtn: {
    flex: 2,
    height: 42,
    borderRadius: 11,
    backgroundColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: 0.3,
  },
  btnDisabled: {
    opacity: 0.45,
  },
});
