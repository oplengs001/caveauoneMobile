import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { Stack, useRouter } from "expo-router";
import {
  AlertCircle,
  ArrowLeft,
  Banknote,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Plus,
  Trash2,
  Wine
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ─── Helpers ────────────────────────────────────────────────────────────────

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const parseDateStr = (str: string): Date => {
  if (!str) return new Date();
  const parts = str.split("-").map(Number);
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  return new Date();
};

const formatDateToStr = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// ─── Custom Calendar Component ───────────────────────────────────────────────

interface CustomCalendarProps {
  visible: boolean;
  selectedDate: string;
  onSelect: (date: string) => void;
  onClose: () => void;
  theme: typeof Colors.store;
  /** dates that are open/unclosed, shown with a warning dot */
  openDates?: string[];
}

function CustomCalendar({ visible, selectedDate, onSelect, onClose, theme, openDates = [] }: CustomCalendarProps) {
  const selected = parseDateStr(selectedDate);
  const today = new Date();

  const [viewYear, setViewYear] = useState(selected.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected.getMonth());

  // Sync view when selected date changes externally
  useEffect(() => {
    const d = parseDateStr(selectedDate);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }, [selectedDate]);

  const openDateSet = useMemo(() => new Set(openDates), [openDates]);

  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const cells: (number | null)[] = [
    ...Array(firstDayOfMonth).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  const isFuture = (day: number) => {
    const d = new Date(viewYear, viewMonth, day);
    d.setHours(23, 59, 59, 999);
    return d > today;
  };

  const isSelected = (day: number) => {
    return (
      selected.getFullYear() === viewYear &&
      selected.getMonth() === viewMonth &&
      selected.getDate() === day
    );
  };

  const isToday = (day: number) => {
    return (
      today.getFullYear() === viewYear &&
      today.getMonth() === viewMonth &&
      today.getDate() === day
    );
  };

  const isOpen = (day: number) => {
    const ds = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return openDateSet.has(ds);
  };

  // Derive text colors based on state — no opacity tricks
  const getDayColor = (day: number) => {
    const sel = isSelected(day);
    const tod = isToday(day);
    const fut = isFuture(day);
    if (sel) return "#ffffff";
    if (tod) return theme.primary;
    if (fut) return "#c4b5c0"; // muted mauve — readable but clearly disabled
    return "#1a1a1a"; // always dark on cream/white, regardless of theme.text
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={calStyles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          style={[calStyles.container, { backgroundColor: "#fdf8f4" }]}
        >
          {/* Burgundy header strip */}
          <View style={[calStyles.calHeaderStrip, { backgroundColor: theme.primary }]}>
            <TouchableOpacity style={calStyles.navBtn} onPress={prevMonth}>
              <ChevronLeft size={18} color="#ffffff" />
            </TouchableOpacity>
            <Text style={calStyles.monthLabel}>
              {MONTHS[viewMonth]} {viewYear}
            </Text>
            <TouchableOpacity style={calStyles.navBtn} onPress={nextMonth}>
              <ChevronRight size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Day labels */}
          <View style={[calStyles.dayRow, { backgroundColor: theme.primary + "18" }]}>
            {DAYS.map(d => (
              <Text key={d} style={[calStyles.dayLabel, { color: theme.primary }]}>{d}</Text>
            ))}
          </View>

          {/* Grid */}
          <View style={calStyles.grid}>
            {cells.map((day, idx) => {
              if (day === null) {
                return <View key={`empty-${idx}`} style={calStyles.cell} />;
              }
              const sel = isSelected(day);
              const tod = isToday(day);
              const fut = isFuture(day);
              const opn = isOpen(day);
              const textColor = getDayColor(day);
              return (
                <TouchableOpacity
                  key={day}
                  style={calStyles.cell}
                  disabled={fut}
                  onPress={() => {
                    onSelect(formatDateToStr(new Date(viewYear, viewMonth, day)));
                    onClose();
                  }}
                >
                  {/* Indicator layer — absolutely positioned behind text */}
                  {sel && (
                    <View style={[
                      calStyles.cellIndicator,
                      { backgroundColor: theme.primary, borderRadius: 10 },
                    ]} />
                  )}
                  {!sel && tod && (
                    <View style={[
                      calStyles.cellIndicator,
                      {
                        borderRadius: 10,
                        borderWidth: 1.5,
                        borderColor: theme.primary,
                        backgroundColor: theme.primary + "12",
                      },
                    ]} />
                  )}
                  <Text style={[
                    calStyles.dayNum,
                    { color: textColor },
                    tod && !sel && { fontWeight: "900" },
                    opn && !sel && { fontWeight: "800" },
                  ]}>
                    {day}
                  </Text>
                  {/* Unclosed dot */}
                  {opn && (
                    <View style={[
                      calStyles.openDot,
                      { backgroundColor: sel ? "#fde68a" : "#f59e0b" },
                    ]} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Legend */}
          {openDates.length > 0 && (
            <View style={calStyles.legend}>
              <View style={[calStyles.legendDot, { backgroundColor: "#f59e0b" }]} />
              <Text style={[calStyles.legendText, { color: "#92400e" }]}>Unclosed day</Text>
            </View>
          )}

          {/* Done */}
          <TouchableOpacity
            style={[calStyles.doneBtn, { backgroundColor: theme.primary }]}
            onPress={onClose}
          >
            <Text style={calStyles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const calStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  container: {
    width: "100%",
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 28,
    elevation: 14,
  },
  calHeaderStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: 0.3,
  },
  dayRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  dayLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  dayNum: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a1a1a", // explicit fallback — never inherit transparent/white
    zIndex: 1,
  },
  cellIndicator: {
    position: "absolute",
    // 80% of cell size, auto-centered by the parent's alignItems/justifyContent
    width: "82%",
    aspectRatio: 1,
  },
  openDot: {
    position: "absolute",
    bottom: 3,
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 16,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    fontWeight: "700",
  },
  doneBtn: {
    margin: 16,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  doneBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface UnclosedDay {
  date: string;
  salesCount: number;
  revenue: number;
}

interface FlaggedItemInput {
  masterWineId: string;
  wineName: string;
  systemVolume: number;
  discrepancyType: string; // "breakage" | "tasting" | "complimentary" | "missing" | "other"
  discrepancyUnits: number;
  notes: string;
}

const DISCREPANCY_TYPES = [
  { id: "breakage", label: "💥 Bottle Breakage" },
  { id: "tasting", label: "🍷 Tasting Pour" },
  { id: "complimentary", label: "🎁 Complimentary" },
  { id: "missing", label: "❓ Missing Stock" },
  { id: "other", label: "📝 Other Reason" },
];

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function DayCloseScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const theme = Colors.store;

  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  });

  const [showDatePicker, setShowDatePicker] = useState(false);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dayCloseData, setDayCloseData] = useState<any>(null);
  const [managerNotes, setManagerNotes] = useState("");

  // Unclosed days state
  const [unclosedDays, setUnclosedDays] = useState<UnclosedDay[]>([]);
  const [loadingUnclosed, setLoadingUnclosed] = useState(false);

  // Flagged items state
  const [hasDiscrepancyChoice, setHasDiscrepancyChoice] = useState<"no" | "yes">("no");
  const [flaggedItems, setFlaggedItems] = useState<FlaggedItemInput[]>([]);

  // Add Item Modal state
  const [isWineModalOpen, setIsWineModalOpen] = useState(false);
  const [masterWines, setMasterWines] = useState<any[]>([]);
  const [searchWine, setSearchWine] = useState("");
  const [loadingWines, setLoadingWines] = useState(false);

  // Selected wine for discrepancy form
  const [selectedWine, setSelectedWine] = useState<any>(null);
  const [discType, setDiscType] = useState<string>("breakage");
  const [discUnits, setDiscUnits] = useState<string>("1");
  const [itemNote, setItemNote] = useState<string>("");

  // Open Bottles Reconciliation state
  const [openBottles, setOpenBottles] = useState<any[]>([]);
  const [loadingOpenBottles, setLoadingOpenBottles] = useState(false);
  const [glassDiscardCounts, setGlassDiscardCounts] = useState<Record<string, number>>({});

  // Sales Drill-down Modal State
  const [showSalesModal, setShowSalesModal] = useState(false);
  const [salesDrillDown, setSalesDrillDown] = useState<any[]>([]);
  const [loadingSales, setLoadingSales] = useState(false);

  const isClosed = dayCloseData?.status === "submitted" || dayCloseData?.status === "acknowledged";

  // ── Fetch open bottles with remaining glasses ─────────────────────────────
  const fetchOpenBottles = useCallback(async () => {
    if (!profile?.locationId) return;
    setLoadingOpenBottles(true);
    try {
      const res = await apiFetch(`/bottles?storeId=${profile.locationId}&openGlassesOnly=true`);
      const list = Array.isArray(res) ? res : res.bottles || [];
      setOpenBottles(list);
      const counts: Record<string, number> = {};
      list.forEach((b: any) => {
        counts[b.id] = 0;
      });
      setGlassDiscardCounts(counts);
    } catch (err) {
      console.error("Error fetching open bottles:", err);
    } finally {
      setLoadingOpenBottles(false);
    }
  }, [profile?.locationId]);

  useEffect(() => {
    fetchOpenBottles();
  }, [fetchOpenBottles]);
  const fetchUnclosedDays = useCallback(async () => {
    if (!profile?.locationId) return;
    setLoadingUnclosed(true);
    try {
      const res = await apiFetch(`/day-close/open-sales?storeId=${profile.locationId}&days=30`);
      setUnclosedDays(res.openDates || []);
    } catch (err) {
      console.error("Error fetching unclosed days:", err);
    } finally {
      setLoadingUnclosed(false);
    }
  }, [profile?.locationId]);

  useEffect(() => {
    fetchUnclosedDays();
  }, [fetchUnclosedDays]);

  // ── Fetch Day Close record & metrics for selectedDateStr ─────────────────
  const fetchDayClose = useCallback(async () => {
    if (!profile?.locationId) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/day-close?storeId=${profile.locationId}&date=${selectedDateStr}`);
      const data = res.dayClose;
      setDayCloseData(data);

      if (data.managerNotes) {
        setManagerNotes(data.managerNotes);
      } else {
        setManagerNotes("");
      }

      if (data.hasDiscrepancy && Array.isArray(data.flaggedItems) && data.flaggedItems.length > 0) {
        setHasDiscrepancyChoice("yes");
        setFlaggedItems(
          data.flaggedItems.map((item: any) => ({
            masterWineId: item.masterWineId,
            wineName: item.wineName || item.masterWine?.name || "Wine",
            systemVolume: Number(item.systemVolume || 0),
            discrepancyType: item.discrepancyType || "other",
            discrepancyUnits: Number(item.discrepancyUnits || 0),
            notes: item.notes || "",
          }))
        );
      } else {
        setHasDiscrepancyChoice("no");
        setFlaggedItems([]);
      }
    } catch (err) {
      console.error("Error fetching day close:", err);
      Alert.alert("Error", "Failed to load day close information.");
    } finally {
      setLoading(false);
    }
  }, [profile?.locationId, selectedDateStr]);

  useEffect(() => {
    fetchDayClose();
  }, [fetchDayClose]);

  // ── Load Master Wines for picking ────────────────────────────────────────
  const loadMasterWines = async () => {
    if (masterWines.length > 0) {
      setIsWineModalOpen(true);
      return;
    }
    setLoadingWines(true);
    try {
      const data = await apiFetch(`/wines`);
      const list = Array.isArray(data) ? data : data.wines || [];
      setMasterWines(list);
      setIsWineModalOpen(true);
    } catch (err) {
      console.error("Error loading master wines:", err);
      Alert.alert("Error", "Failed to load wine list.");
    } finally {
      setLoadingWines(false);
    }
  };

  const handleDiscrepancyChoiceChange = (choice: "no" | "yes") => {
    if (choice === "no" && flaggedItems.length > 0) {
      Alert.alert(
        "Discard Flagged Items?",
        `Switching to 'No Discrepancies' will remove the ${flaggedItems.length} item(s) you have added.`,
        [
          { text: "Keep Items", style: "cancel" },
          {
            text: "Discard & Switch",
            style: "destructive",
            onPress: () => {
              setFlaggedItems([]);
              setHasDiscrepancyChoice("no");
            },
          },
        ]
      );
    } else {
      setHasDiscrepancyChoice(choice);
      if (choice === "no") {
        setFlaggedItems([]);
      }
    }
  };

  const handleCancelFlagging = () => {
    handleDiscrepancyChoiceChange("no");
  };

  const fetchSalesDrillDown = async () => {
    if (!profile?.locationId) return;
    setLoadingSales(true);
    setShowSalesModal(true);
    try {
      const fromISO = new Date(`${selectedDateStr}T00:00:00.000Z`).toISOString();
      const toISO = new Date(`${selectedDateStr}T23:59:59.999Z`).toISOString();
      const res = await apiFetch(`/sales?storeId=${profile.locationId}&from=${fromISO}&to=${toISO}&limit=200&includeVoided=true`);
      const list = Array.isArray(res) ? res : Array.isArray(res.sales) ? res.sales : [];
      setSalesDrillDown(list);
    } catch (err) {
      console.error("Error fetching sales drill down:", err);
      Alert.alert("Error", "Failed to load detailed sales.");
    } finally {
      setLoadingSales(false);
    }
  };

  const handleAddFlaggedItem = () => {
    if (!selectedWine) {
      Alert.alert("Required", "Please select a wine first.");
      return;
    }
    const units = parseFloat(discUnits);
    if (isNaN(units) || units <= 0) {
      Alert.alert("Invalid Quantity", "Please enter a valid bottle count.");
      return;
    }

    const newItem: FlaggedItemInput = {
      masterWineId: selectedWine.id,
      wineName: `${selectedWine.name} ${selectedWine.vintage || ""}`.trim(),
      systemVolume: 0,
      discrepancyType: discType,
      discrepancyUnits: units,
      notes: itemNote.trim(),
    };

    setFlaggedItems((prev) => [...prev, newItem]);

    // Reset form
    setSelectedWine(null);
    setDiscUnits("1");
    setItemNote("");
  };

  const handleRemoveFlaggedItem = (index: number) => {
    setFlaggedItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!profile?.locationId) return;

    if (hasDiscrepancyChoice === "yes" && flaggedItems.length === 0) {
      Alert.alert("Flagged Items Required", "You selected 'Flag Items' but haven't added any wine discrepancies yet.");
      return;
    }

    Alert.alert(
      "Confirm Day Close",
      `Are you sure you want to submit the Day Close for ${selectedDateStr}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Submit Close",
          style: "default",
          onPress: async () => {
            setSubmitting(true);
            try {
              const glassAdjustments = Object.entries(glassDiscardCounts)
                .filter(([_, count]) => count > 0)
                .map(([bottleId, count]) => {
                  const b = openBottles.find((item) => item.id === bottleId);
                  return {
                    bottleId,
                    glassesDiscarded: count,
                    wineName: b?.wineName || "Wine Bottle",
                  };
                });

              const payload = {
                storeId: profile.locationId,
                businessDate: selectedDateStr,
                managerNotes,
                flaggedItems: hasDiscrepancyChoice === "yes" ? flaggedItems : [],
                glassAdjustments,
                submittedById: profile.id,
                submittedByName: profile.displayName || profile.email?.split("@")[0] || "Store Manager",
              };

              await apiFetch("/day-close/submit", {
                method: "POST",
                body: JSON.stringify(payload),
              });

              Alert.alert(
                "Day Close Submitted! 🎉",
                "Today's sales snapshot and report have been recorded and sent to Admin for review.",
                [{ text: "OK", onPress: () => { fetchDayClose(); fetchUnclosedDays(); fetchOpenBottles(); } }]
              );
            } catch (err: any) {
              console.error("Submit day close failed:", err);
              Alert.alert("Error", err.message || "Failed to submit day close.");
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const filteredWines = masterWines.filter((w) => {
    const q = searchWine.toLowerCase();
    return (
      (w.name && w.name.toLowerCase().includes(q)) ||
      (w.producer && w.producer.toLowerCase().includes(q)) ||
      (w.vintage && w.vintage.toLowerCase().includes(q))
    );
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={[styles.header, { borderColor: theme.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>End-of-Day Close</Text>
          <Text style={styles.headerSubtitle}>Reconcile &amp; Snapshot Daily Sales</Text>
        </View>
        <CalendarCheck size={24} color={theme.primary} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* ── Unclosed Days Alert ─────────────────────────────────────────── */}
        {unclosedDays.length > 0 && (
          <View style={[styles.unclosedBanner, { borderColor: "#f59e0b60", backgroundColor: "#fef3c715" }]}>
            <View style={styles.unclosedHeader}>
              <AlertCircle size={18} color="#d97706" />
              <Text style={styles.unclosedTitle}>
                {unclosedDays.length} Unclosed {unclosedDays.length === 1 ? "Day" : "Days"} with Sales
              </Text>
              {loadingUnclosed && <ActivityIndicator size="small" color="#d97706" />}
            </View>
            <Text style={styles.unclosedSub}>These past dates had sales but were never closed. Tap to review.</Text>
            <View style={styles.unclosedList}>
              {unclosedDays.map((item) => (
                <TouchableOpacity
                  key={item.date}
                  style={[
                    styles.unclosedRow,
                    selectedDateStr === item.date && {
                      backgroundColor: theme.primary,
                      borderColor: theme.primary,
                    },
                  ]}
                  onPress={() => setSelectedDateStr(item.date)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[
                      styles.unclosedRowDate,
                      selectedDateStr === item.date && { color: "#ffffff" },
                    ]}>
                      {item.date}
                    </Text>
                    <Text style={[
                      styles.unclosedRowMeta,
                      selectedDateStr === item.date && { color: "#fde68a" },
                    ]}>
                      {item.salesCount} sale{item.salesCount !== 1 ? "s" : ""} •
                      {" "}₱{item.revenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </Text>
                  </View>
                  <ChevronRight
                    size={16}
                    color={selectedDateStr === item.date ? "#ffffff" : "#d97706"}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Date Selector ───────────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.dateRow}>
            <Calendar size={20} color={theme.primary} />
            <Text style={[styles.dateLabel, { color: theme.text }]}>Business Date:</Text>
            {Platform.OS === "web" ? (
              <input
                type="date"
                value={selectedDateStr}
                onChange={(e: any) => setSelectedDateStr(e.target.value)}
                style={{
                  flex: 1,
                  height: 38,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 10,
                  paddingLeft: 10,
                  paddingRight: 10,
                  fontSize: 14,
                  fontWeight: "700",
                  backgroundColor: "transparent",
                  color: theme.text,
                } as any}
              />
            ) : (
              <TouchableOpacity
                style={[styles.dateButton, { borderColor: theme.border }]}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={[styles.dateButtonText, { color: theme.text }]}>
                  {selectedDateStr}
                </Text>
                <View style={[styles.calIconBadge, { backgroundColor: theme.primary + "18" }]}>
                  <Calendar size={14} color={theme.primary} />
                </View>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.dateHelp}>Tap date to change. You can backfill past dates if needed.</Text>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={styles.loadingText}>Computing Day Sales Summary...</Text>
          </View>
        ) : (
          <>
            {/* Status Banner */}
            <View
              style={[
                styles.statusBanner,
                isClosed
                  ? { backgroundColor: "#10b98115", borderColor: "#10b98140" }
                  : { backgroundColor: "#f59e0b15", borderColor: "#f59e0b40" },
              ]}
            >
              {isClosed ? (
                <CheckCircle2 size={24} color="#10b981" />
              ) : (
                <Clock size={24} color="#f59e0b" />
              )}
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.statusTitle,
                    { color: isClosed ? "#059669" : "#d97706" },
                  ]}
                >
                  {dayCloseData?.status === "acknowledged"
                    ? "Day Close Acknowledged by Admin ✓"
                    : dayCloseData?.status === "submitted"
                      ? "Day Close Submitted to Admin ✓"
                      : "Day Close Still Open"}
                </Text>
                <Text style={styles.statusSubtitle}>
                  {isClosed
                    ? `Closed by ${dayCloseData?.submittedByName || "Store Manager"} on ${dayCloseData?.submittedAt
                      ? new Date(dayCloseData.submittedAt).toLocaleTimeString()
                      : "today"
                    }`
                    : "Review daily sales metrics below and submit when ready."}
                </Text>
              </View>
            </View>

            {/* Sales Summary Card */}
            <TouchableOpacity
              style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={fetchSalesDrillDown}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 0 }]}>Sales Snapshot ({selectedDateStr})</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: theme.primary }}>Drill Down</Text>
                  <ChevronRight size={14} color={theme.primary} />
                </View>
              </View>

              <View style={styles.metricsGrid}>
                {/* Total Revenue */}
                <View style={[styles.metricBox, { backgroundColor: theme.primary + "15" }]}>
                  <Banknote size={20} color={theme.primary} />
                  <Text style={[styles.metricValue, { color: theme.primary }]}>
                    ₱
                    {Number(dayCloseData?.totalRevenue || 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </Text>
                  <Text style={styles.metricLabel}>Total Revenue</Text>
                </View>

                {/* Total Bottles Sold */}
                <View style={[styles.metricBox, { backgroundColor: "#8b5cf615" }]}>
                  <Wine size={20} color="#8b5cf6" />
                  <Text style={[styles.metricValue, { color: "#8b5cf6" }]}>
                    {dayCloseData?.totalBottlesSold || 0} btl
                  </Text>
                  <Text style={styles.metricLabel}>Bottles Sold</Text>
                </View>

                {/* Sales Transactions */}
                <View style={[styles.metricBox, { backgroundColor: "#3b82f615" }]}>
                  <FileText size={20} color="#3b82f6" />
                  <Text style={[styles.metricValue, { color: "#3b82f6" }]}>
                    {dayCloseData?.totalSalesTxns || 0}
                  </Text>
                  <Text style={styles.metricLabel}>Transactions</Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* ── Open Bottle Glass Reconciliation Section ────────────────────── */}
            {!isClosed && (
              <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Wine size={18} color={theme.primary} />
                    <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 0 }]}>Open Bottle Reconciliation</Text>
                  </View>
                  {openBottles.length > 0 && (
                    <TouchableOpacity
                      style={[styles.discardAllHeaderBtn, { backgroundColor: theme.primary + "15", borderColor: theme.primary + "30" }]}
                      onPress={() => {
                        const counts: Record<string, number> = {};
                        openBottles.forEach((b) => {
                          counts[b.id] = b.glassesRemaining ?? 6;
                        });
                        setGlassDiscardCounts(counts);
                      }}
                    >
                      <Text style={[styles.discardAllHeaderText, { color: theme.primary }]}>Discard All ({openBottles.length})</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={styles.cardSubtitle}>
                  Adjust open bottles to discard remaining glasses poured at closing.
                </Text>

                {loadingOpenBottles ? (
                  <ActivityIndicator size="small" color={theme.primary} style={{ marginVertical: 12 }} />
                ) : openBottles.length === 0 ? (
                  <View style={{ paddingVertical: 12, alignItems: "center" }}>
                    <Text style={{ fontSize: 12, color: "#64748b", fontWeight: "600" }}>
                      ✓ No open bottles with remaining glasses at this store.
                    </Text>
                  </View>
                ) : (
                  <View style={{ gap: 10, marginTop: 8 }}>
                    {openBottles.map((b) => {
                      const maxGlasses = b.glassesRemaining ?? 6;
                      const discard = glassDiscardCounts[b.id] || 0;
                      const remainingAfter = maxGlasses - discard;

                      return (
                        <View key={b.id} style={styles.glassReconcileRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.glassWineName}>
                              {b.wineName || b.masterWine?.name || "Open Bottle"}
                            </Text>
                            <Text style={styles.glassMeta}>
                              ID: {b.bottleId || b.readableId || b.id.slice(0, 8)} • Currently: {maxGlasses} glass(es) left
                            </Text>
                            {discard > 0 && (
                              <Text style={styles.glassFeedback}>
                                Discarding {discard} → {remainingAfter} glass(es) remaining
                                {remainingAfter === 0 ? " (bottle marked consumed)" : ""}
                              </Text>
                            )}
                          </View>

                          <View style={{ alignItems: "flex-end", gap: 6 }}>
                            <View style={styles.stepperContainer}>
                              <TouchableOpacity
                                style={[styles.stepperBtn, discard <= 0 && { opacity: 0.4 }]}
                                disabled={discard <= 0}
                                onPress={() =>
                                  setGlassDiscardCounts((prev) => ({
                                    ...prev,
                                    [b.id]: Math.max(0, (prev[b.id] || 0) - 1),
                                  }))
                                }
                              >
                                <Text style={styles.stepperText}>-</Text>
                              </TouchableOpacity>

                              <Text style={styles.stepperValue}>{discard}</Text>

                              <TouchableOpacity
                                style={[styles.stepperBtn, discard >= maxGlasses && { opacity: 0.4 }]}
                                disabled={discard >= maxGlasses}
                                onPress={() =>
                                  setGlassDiscardCounts((prev) => ({
                                    ...prev,
                                    [b.id]: Math.min(maxGlasses, (prev[b.id] || 0) + 1),
                                  }))
                                }
                              >
                                <Text style={styles.stepperText}>+</Text>
                              </TouchableOpacity>
                            </View>

                            <TouchableOpacity
                              style={[
                                styles.discardAllChip,
                                discard === maxGlasses ? { backgroundColor: "#ef444415", borderColor: "#ef4444" } : { backgroundColor: "#f1f5f9" },
                              ]}
                              onPress={() =>
                                setGlassDiscardCounts((prev) => ({
                                  ...prev,
                                  [b.id]: discard === maxGlasses ? 0 : maxGlasses,
                                }))
                              }
                            >
                              <Text style={[styles.discardAllChipText, discard === maxGlasses && { color: "#dc2626" }]}>
                                {discard === maxGlasses ? "Reset" : "All"}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            {/* Discrepancy Reporting Section */}
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Inventory Discrepancies</Text>
              <Text style={styles.cardSubtitle}>
                Flag broken bottles, tasting pours, extra discarded glasses, or missing stock for this day.
              </Text>

              {!isClosed && (
                <View style={styles.choiceRow}>
                  <TouchableOpacity
                    style={[
                      styles.choiceButton,
                      hasDiscrepancyChoice === "no" && {
                        backgroundColor: theme.primary,
                        borderColor: theme.primary,
                      },
                    ]}
                    onPress={() => handleDiscrepancyChoiceChange("no")}
                  >
                    <Text
                      style={[
                        styles.choiceText,
                        hasDiscrepancyChoice === "no" && { color: "#ffffff" },
                      ]}
                    >
                      No Discrepancies
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.choiceButton,
                      hasDiscrepancyChoice === "yes" && {
                        backgroundColor: "#ef4444",
                        borderColor: "#ef4444",
                      },
                    ]}
                    onPress={() => handleDiscrepancyChoiceChange("yes")}
                  >
                    <Text
                      style={[
                        styles.choiceText,
                        hasDiscrepancyChoice === "yes" && { color: "#ffffff" },
                      ]}
                    >
                      ⚠️ Flag Items ({flaggedItems.length})
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Flagged Items List */}
              {flaggedItems.length > 0 && (
                <View style={{ gap: 10, marginTop: 12 }}>
                  {flaggedItems.map((item, idx) => (
                    <View key={idx} style={styles.flaggedItemCard}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.flaggedWineName}>{item.wineName}</Text>
                        <Text style={styles.flaggedReason}>
                          {item.discrepancyType.toUpperCase()} • {item.discrepancyUnits} bottle(s)
                        </Text>
                        {item.notes ? <Text style={styles.flaggedNotes}>"{item.notes}"</Text> : null}
                      </View>
                      {!isClosed && (
                        <TouchableOpacity onPress={() => handleRemoveFlaggedItem(idx)}>
                          <Trash2 size={18} color="#ef4444" />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              )}

              {/* Add Flagged Item Form (if choice is yes & not closed) */}
              {hasDiscrepancyChoice === "yes" && !isClosed && (
                <View style={styles.addItemForm}>
                  <Text style={styles.formSectionTitle}>Add Discrepancy Record</Text>

                  {/* Pick Wine Button */}
                  <TouchableOpacity style={styles.pickWineButton} onPress={loadMasterWines}>
                    <Wine size={18} color={theme.primary} />
                    <Text style={styles.pickWineText}>
                      {selectedWine ? `${selectedWine.name} (${selectedWine.vintage})` : "Select Wine from Catalog..."}
                    </Text>
                    {loadingWines ? <ActivityIndicator size="small" color={theme.primary} /> : <ChevronRight size={18} color="#94a3b8" />}
                  </TouchableOpacity>

                  {/* Discrepancy Type Selector */}
                  <Text style={styles.inputLabel}>Reason Category:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {DISCREPANCY_TYPES.map((t) => (
                      <TouchableOpacity
                        key={t.id}
                        style={[
                          styles.typeChip,
                          discType === t.id && { backgroundColor: theme.primary, borderColor: theme.primary },
                        ]}
                        onPress={() => setDiscType(t.id)}
                      >
                        <Text style={[styles.typeChipText, discType === t.id && { color: "#ffffff" }]}>
                          {t.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  {/* Units & Note */}
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                    <View style={{ width: 100 }}>
                      <Text style={styles.inputLabel}>Bottles:</Text>
                      <TextInput
                        style={styles.textInput}
                        value={discUnits}
                        onChangeText={setDiscUnits}
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputLabel}>Note / Reason:</Text>
                      <TextInput
                        style={styles.textInput}
                        value={itemNote}
                        onChangeText={setItemNote}
                        placeholder="e.g. Broken during shelf restock"
                        placeholderTextColor="#94a3b8"
                      />
                    </View>
                  </View>

                  <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                    <TouchableOpacity style={[styles.addButton, { flex: 1 }]} onPress={handleAddFlaggedItem}>
                      <Plus size={18} color="#ffffff" />
                      <Text style={styles.addButtonText}>Add Flagged Wine</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.addButton, { backgroundColor: "#f1f5f9", borderWidth: 1, borderColor: "#cbd5e1" }]}
                      onPress={handleCancelFlagging}
                    >
                      <Text style={{ color: "#64748b", fontSize: 13, fontWeight: "800" }}>Cancel Flagging</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* Manager Notes Card */}
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Manager General Notes</Text>
              <TextInput
                style={[
                  styles.textareaInput,
                  { color: theme.text, borderColor: theme.border },
                  isClosed && { backgroundColor: "#f8fafc" },
                ]}
                value={managerNotes}
                onChangeText={setManagerNotes}
                editable={!isClosed}
                multiline
                numberOfLines={3}
                placeholder="Optional notes for admin (e.g. busy evening, weather impact, promo running)..."
                placeholderTextColor="#94a3b8"
              />
            </View>

            {/* Submit Button */}
            {!isClosed && (
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: theme.primary }]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <CalendarCheck size={20} color="#ffffff" />
                    <Text style={styles.submitButtonText}>Submit End-of-Day Close</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>

      {/* Wine Picker Modal */}
      <Modal visible={isWineModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Select Master Wine</Text>
              <TouchableOpacity onPress={() => setIsWineModalOpen(false)}>
                <Text style={{ fontSize: 16, fontWeight: "800", color: "#94a3b8" }}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.searchInput, { color: theme.text, borderColor: theme.border }]}
              placeholder="Search wine name or producer..."
              placeholderTextColor="#94a3b8"
              value={searchWine}
              onChangeText={setSearchWine}
            />

            <FlatList
              data={filteredWines}
              keyExtractor={(w) => w.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.winePickerRow}
                  onPress={() => {
                    setSelectedWine(item);
                    setIsWineModalOpen(false);
                  }}
                >
                  <Wine size={20} color={theme.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.wineRowName, { color: theme.text }]}>{item.name}</Text>
                    <Text style={styles.wineRowSub}>
                      {item.producer} • {item.vintage || "NV"} • {item.format || "75cl"}
                    </Text>
                  </View>
                  <ChevronRight size={18} color="#94a3b8" />
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Sales Drill Down Modal */}
      <Modal visible={showSalesModal} animationType="slide" transparent onRequestClose={() => setShowSalesModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: theme.card, height: "80%" }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Sales Drill Down</Text>
                <Text style={{ fontSize: 12, color: "#64748b", fontWeight: "600" }}>
                  {selectedDateStr} • {salesDrillDown.length} transaction(s)
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowSalesModal(false)}>
                <Text style={{ fontSize: 18, fontWeight: "800", color: "#94a3b8" }}>✕</Text>
              </TouchableOpacity>
            </View>

            {loadingSales ? (
              <View style={{ padding: 40, alignItems: "center" }}>
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={{ marginTop: 12, color: "#64748b", fontSize: 13, fontWeight: "600" }}>Loading sales details...</Text>
              </View>
            ) : salesDrillDown.length === 0 ? (
              <View style={{ padding: 40, alignItems: "center" }}>
                <Wine size={32} color="#cbd5e1" />
                <Text style={{ marginTop: 12, color: "#64748b", fontSize: 14, fontWeight: "700" }}>No sales recorded on this date</Text>
              </View>
            ) : (
              <FlatList
                data={salesDrillDown}
                keyExtractor={(s) => s.id}
                contentContainerStyle={{ gap: 10, paddingBottom: 20 }}
                renderItem={({ item }) => (
                  <View style={[styles.saleDrillRow, item.isVoided && styles.saleDrillRowVoided]}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <Text style={[styles.saleDrillWineName, item.isVoided && styles.saleDrillWineNameVoided]}>
                          {item.wineName || item.masterWine?.name || "Wine Sale"}
                        </Text>
                        {item.isVoided && (
                          <View style={styles.voidTag}>
                            <Text style={styles.voidTagText}>VOIDED</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.saleDrillMeta}>
                        {(item.saleType || "bottle").toUpperCase()} • Sold by: {item.soldByEmail || item.soldBy || "Staff"}
                      </Text>
                      {item.isVoided ? (
                        <Text style={styles.saleDrillVoidReason}>
                          Voided: {item.voidReason || "Voided from POS"}{item.voidedByEmail ? ` • By: ${item.voidedByEmail}` : ""}
                        </Text>
                      ) : item.vatAmount ? (
                        <Text style={styles.saleDrillVat}>
                          Net: ₱{Number(item.price || 0).toFixed(2)} | VAT: ₱{Number(item.vatAmount || 0).toFixed(2)}
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[styles.saleDrillPrice, item.isVoided && styles.saleDrillPriceVoided]}>
                        ₱{Number(item.totalAmount || item.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                      <Text style={styles.saleDrillTime}>
                        {item.createdAt ? new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : ""}
                      </Text>
                    </View>
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Custom Themed Calendar */}
      <CustomCalendar
        visible={showDatePicker}
        selectedDate={selectedDateStr}
        onSelect={(ds) => setSelectedDateStr(ds)}
        onClose={() => setShowDatePicker(false)}
        theme={theme}
        openDates={unclosedDays.map((d) => d.date)}
      />
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "900",
  },
  headerSubtitle: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "600",
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 11,
    color: "#64748b",
    marginBottom: 12,
  },
  // ── Unclosed banner styles ──────────────────────────────────────────────
  unclosedBanner: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  unclosedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  unclosedTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "900",
    color: "#b45309",
  },
  unclosedSub: {
    fontSize: 11,
    color: "#92400e",
    fontWeight: "600",
  },
  unclosedList: {
    marginTop: 8,
    gap: 8,
  },
  unclosedRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#f59e0b",
    backgroundColor: "#fffbeb",
  },
  unclosedRowDate: {
    fontSize: 13,
    fontWeight: "900",
    color: "#b45309",
  },
  unclosedRowMeta: {
    fontSize: 11,
    fontWeight: "600",
    color: "#92400e",
    marginTop: 1,
  },
  // ── Date row ────────────────────────────────────
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dateLabel: {
    fontSize: 13,
    fontWeight: "800",
  },
  dateButton: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f8f6f0",
  },
  dateButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  calIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  dateHelp: {
    fontSize: 10,
    color: "#94a3b8",
    marginTop: 6,
  },
  // ── Loading ─────────────────────────────────────
  loadingContainer: {
    padding: 40,
    alignItems: "center",
  },
  loadingText: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "700",
    marginTop: 12,
  },
  // ── Status banner ───────────────────────────────
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: "900",
  },
  statusSubtitle: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
  },
  // ── Metrics ─────────────────────────────────────
  metricsGrid: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  metricBox: {
    flex: 1,
    padding: 12,
    borderRadius: 14,
    alignItems: "center",
  },
  metricValue: {
    fontSize: 15,
    fontWeight: "900",
    marginVertical: 4,
  },
  metricLabel: {
    fontSize: 10,
    color: "#64748b",
    fontWeight: "700",
    textTransform: "uppercase",
  },
  // ── Discrepancy ─────────────────────────────────
  choiceRow: {
    flexDirection: "row",
    gap: 10,
    marginVertical: 8,
  },
  choiceButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    backgroundColor: "#f8fafc",
  },
  choiceText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#64748b",
  },
  flaggedItemCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    padding: 12,
    borderRadius: 12,
    gap: 10,
  },
  flaggedWineName: {
    fontSize: 13,
    fontWeight: "900",
    color: "#991b1b",
  },
  flaggedReason: {
    fontSize: 10,
    fontWeight: "800",
    color: "#b91c1c",
    marginTop: 2,
  },
  flaggedNotes: {
    fontSize: 10,
    color: "#7f1d1d",
    fontStyle: "italic",
    marginTop: 2,
  },
  addItemForm: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    gap: 8,
  },
  formSectionTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#334155",
    textTransform: "uppercase",
  },
  pickWineButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    padding: 12,
    borderRadius: 12,
    gap: 10,
  },
  pickWineText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748b",
    marginTop: 4,
  },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
  },
  typeChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
  },
  textInput: {
    height: 38,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 10,
    fontSize: 13,
    color: "#0f172a",
    backgroundColor: "#ffffff",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4f46e5",
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
    marginTop: 8,
  },
  addButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  textareaInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    textAlignVertical: "top",
    minHeight: 80,
  },
  // ── Submit ──────────────────────────────────────
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 18,
    gap: 10,
    marginBottom: 24,
    shadowColor: "#4c0519",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  // ── Wine picker modal ───────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    height: "70%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "900",
  },
  searchInput: {
    height: 40,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 13,
    marginBottom: 12,
  },
  winePickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    gap: 12,
  },
  wineRowName: {
    fontSize: 14,
    fontWeight: "800",
  },
  wineRowSub: {
    fontSize: 11,
    color: "#64748b",
  },
  discardAllHeaderBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  discardAllHeaderText: {
    fontSize: 11,
    fontWeight: "800",
  },
  discardAllChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  discardAllChipText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#475569",
  },
  glassReconcileRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 10,
  },
  glassWineName: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
  },
  glassMeta: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "600",
    marginTop: 2,
  },
  glassFeedback: {
    fontSize: 11,
    color: "#b45309",
    fontWeight: "700",
    marginTop: 3,
  },
  stepperContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    overflow: "hidden",
  },
  stepperBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
  },
  stepperText: {
    fontSize: 16,
    fontWeight: "900",
    color: "#334155",
  },
  stepperValue: {
    width: 32,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
  },
  saleDrillRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  saleDrillWineName: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
  },
  saleDrillMeta: {
    fontSize: 10,
    color: "#64748b",
    fontWeight: "600",
    marginTop: 2,
  },
  saleDrillVat: {
    fontSize: 10,
    color: "#475569",
    marginTop: 2,
  },
  saleDrillPrice: {
    fontSize: 14,
    fontWeight: "900",
    color: "#4c0519",
  },
  saleDrillTime: {
    fontSize: 10,
    color: "#94a3b8",
    marginTop: 2,
  },
  saleDrillRowVoided: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  saleDrillWineNameVoided: {
    color: "#991b1b",
  },
  saleDrillPriceVoided: {
    textDecorationLine: "line-through",
    color: "#94a3b8",
  },
  saleDrillVoidReason: {
    fontSize: 10,
    color: "#dc2626",
    fontWeight: "700",
    marginTop: 2,
  },
  voidTag: {
    backgroundColor: "#fee2e2",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#fca5a5",
  },
  voidTagText: {
    color: "#991b1b",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
});
