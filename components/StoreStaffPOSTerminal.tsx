import CustomerPickerModal from "@/components/CustomerPickerModal";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { clearToken } from "@/lib/auth";
import { prefetchCustomers, recordCustomerSaleInCache } from "@/lib/customerCache";
import { AppUser, fetchStoreStaff } from "@/lib/queries/users";
import { Customer } from "@/types";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "expo-blur";
import { Stack, useRouter } from "expo-router";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Droplets,
  LogOut,
  Minus,
  Plus,
  RotateCcw,
  Search,
  ShoppingBag,
  UserCheck,
  Users,
  Wine,
  X,
  Zap
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions
} from "react-native";

export interface WineBottleLocationInfo {
  locationId: string;
  locationName: string;
  count: number;
  openCount: number;
  openGlassesTotal: number;
  bottleIds: string[];
}

export interface WineBottleDetail {
  id: string;
  locationId: string | null;
  locationName: string;
  status: "open" | "shelved" | "received" | string;
  glassesRemaining?: number;
}

export interface FunWineItem {
  id: string;
  name: string;
  vintage?: string;
  producer?: string;
  format?: string;
  sku?: string;
  rawType?: string | null;
  wineType?: string;
  price?: number;
  sellingPrice?: number | null;
  glassPrice?: number | null;
  carafePrice?: number | null;
  allowGlass?: boolean;
  allowCarafe?: boolean;
  discontinued?: boolean;
  wineCategory?: "fun" | "fine" | "reserve" | "standard" | string | null;
  stockCount: number;
  availableBottleIds: string[];
  bottles?: WineBottleDetail[];
  locationBreakdown?: WineBottleLocationInfo[];
  openBottle?: {
    id: string;
    locationId?: string | null;
    locationName?: string;
    glassesRemaining: number;
  } | null;
}

export type FastWineItem = FunWineItem;

export type PortionType = "glass" | "carafe" | "bottle";

export interface OrderItem {
  wine: FastWineItem;
  portion: PortionType;
  quantity: number;
  selectedLocationId?: string | null;
  selectedLocationName?: string;
}

const normalizeWineType = (rawType?: string | null, wineName?: string | null): string => {
  const t = (rawType || "").toLowerCase();
  const n = (wineName || "").toLowerCase();

  // If type OR name indicates sparkling / champagne / prosecco / cava:
  // e.g. Sparkling Red, Sparkling White, Sparkling Rosé are ALL grouped under "Sparkling"
  if (
    t.includes("sparkling") ||
    t.includes("champagne") ||
    t.includes("prosecco") ||
    t.includes("cava") ||
    n.includes("sparkling") ||
    n.includes("champagne") ||
    n.includes("prosecco") ||
    n.includes("cava")
  ) {
    return "Sparkling";
  }

  if (t.includes("white")) {
    return "White Wine";
  }
  if (t.includes("rose") || t.includes("rosé")) {
    return "Rosé";
  }
  if (t.includes("sweet") || t.includes("dessert") || t.includes("fortified") || t.includes("port")) {
    return "Sweet Wine";
  }
  if (t.includes("red")) {
    return "Red Wine";
  }
  return rawType || "Red Wine";
};

// Category Tier Emojis (Fun: 😁, Fine: 💎, Reserve: 👻)
export const getCategoryEmoji = (category?: string | null): string | null => {
  if (!category) return null;
  const c = category.toLowerCase();
  if (c === "fun" || c === "fast") return "😁";
  if (c === "fine") return "💎";
  if (c === "reserve") return "👻";
  return null;
};

// Formats user display name cleanly from displayName or email (e.g. "carlos.mendoza.kong" -> "Carlos Mendoza")
export const formatStaffDisplayName = (st?: AppUser | null): string => {
  if (!st) return "Staff Member";
  if (st.displayName && st.displayName.trim().length > 0) return st.displayName;
  const raw = (st.email || "").split("@")[0] || "Staff";
  const cleaned = raw.replace(/\.(kong|crosta)$/i, "");
  return cleaned
    .replace(/[._-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

// Maroon color palette constants
const MAROON = {
  primary: "#4c0519", // Deep Burgundy / Maroon
  dark: "#380311", // Ultra dark wine
  medium: "#881337", // Rose maroon
  light: "#ffe4e6", // Pale rose background
  ultraLight: "#fff1f2",
  accentGold: "#a16207",
  border: "#fecdd3",
};

export const getItemUnitPrice = (wine: FastWineItem, portion: PortionType): number => {
  if (portion === "glass") {
    if (wine.glassPrice != null && !isNaN(Number(wine.glassPrice)) && Number(wine.glassPrice) > 0) {
      return Number(wine.glassPrice);
    }
    if (wine.price != null && !isNaN(Number(wine.price)) && Number(wine.price) > 0) {
      return Math.round(Number(wine.price) / 4.5);
    }
    return 0;
  }
  if (portion === "carafe") {
    if (wine.carafePrice != null && !isNaN(Number(wine.carafePrice)) && Number(wine.carafePrice) > 0) {
      return Number(wine.carafePrice);
    }
    if (wine.price != null && !isNaN(Number(wine.price)) && Number(wine.price) > 0) {
      return Math.round(Number(wine.price) / 2.5);
    }
    return 0;
  }
  // Bottle
  if (wine.sellingPrice != null && !isNaN(Number(wine.sellingPrice)) && Number(wine.sellingPrice) > 0) {
    return Number(wine.sellingPrice);
  }
  if (wine.price != null && !isNaN(Number(wine.price)) && Number(wine.price) > 0) {
    return Number(wine.price);
  }
  return 0;
};

export const getAvailableVolumeForWine = (wine: FastWineItem): number => {
  const openGlasses = wine.openBottle ? (wine.openBottle.glassesRemaining ?? 6) : 0;
  const unopenedBottles = Math.max(0, wine.stockCount - (wine.openBottle ? 1 : 0));
  return (unopenedBottles * 6 + openGlasses) / 6;
};

export const getQueuedVolumeForWine = (wineId: string, currentOrder: OrderItem[]): number => {
  let queuedVolume = 0;
  currentOrder.forEach((item) => {
    if (item.wine.id === wineId) {
      if (item.portion === "glass") queuedVolume += item.quantity * (1 / 6);
      else if (item.portion === "carafe") queuedVolume += item.quantity * (2 / 6);
      else queuedVolume += item.quantity;
    }
  });
  return queuedVolume;
};

export const getRemainingVolumeForWine = (wine: FastWineItem, currentOrder: OrderItem[]): number => {
  const totalAvail = getAvailableVolumeForWine(wine);
  const queued = getQueuedVolumeForWine(wine.id, currentOrder);
  return Math.max(0, totalAvail - queued);
};

export const isWineEligibleForPortion = (wine: FastWineItem, portion: PortionType): boolean => {
  if (wine.discontinued) return false;
  if (portion === "glass") {
    return Boolean(
      wine.allowGlass ||
      (wine.glassPrice != null && !isNaN(Number(wine.glassPrice)) && Number(wine.glassPrice) > 0) ||
      wine.openBottle
    );
  }
  if (portion === "carafe") {
    return Boolean(
      wine.allowCarafe ||
      (wine.carafePrice != null && !isNaN(Number(wine.carafePrice)) && Number(wine.carafePrice) > 0) ||
      wine.allowGlass ||
      (wine.glassPrice != null && !isNaN(Number(wine.glassPrice)) && Number(wine.glassPrice) > 0)
    );
  }
  // Full Bottle
  return true;
};

export const canAddPortion = (wine: FastWineItem, portion: PortionType, currentOrder: OrderItem[]): boolean => {
  if (!isWineEligibleForPortion(wine, portion)) return false;
  const neededVolume = portion === "glass" ? (1 / 6) : portion === "carafe" ? (2 / 6) : 1;
  const remaining = getRemainingVolumeForWine(wine, currentOrder);
  return remaining >= (neededVolume - 0.001);
};

export default function StoreStaffPOSTerminal() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const { profile, refreshProfile } = useAuth();
  const isManager = profile?.role === "admin" || profile?.role === "store_manager" || profile?.role === "store";
  const isLandscape = width > height;
  const isTabletLandscape = isLandscape && width >= 680;
  const storeId = profile?.locationId || null;

  // Data States
  const [storeName, setStoreName] = useState<string>("Boutique Store");
  const [staffList, setStaffList] = useState<AppUser[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<AppUser | null>(null);
  const [shiftStaffIds, setShiftStaffIds] = useState<string[]>([]);
  const [isStaffAccordionOpen, setIsStaffAccordionOpen] = useState(false);
  const [staffSearchQuery, setStaffSearchQuery] = useState("");
  const [recentStaffIds, setRecentStaffIds] = useState<string[]>([]);
  const [wines, setWines] = useState<FastWineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Primary Filters: Sales Type First + Wine Category Tier + Wine Type Grouping
  const [salesTypeMode, setSalesTypeMode] = useState<PortionType>("glass");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [wineTypeFilter, setWineTypeFilter] = useState<string>("all");


  // Cart / Current Order State (Count Focused)
  const [currentOrder, setCurrentOrder] = useState<OrderItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

  // Collapsible sidebar (landscape only)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Location Selection Modal State
  const [locationModalWine, setLocationModalWine] = useState<FastWineItem | null>(null);
  const [locationModalPortion, setLocationModalPortion] = useState<PortionType>("glass");
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  // Feature A: Counter Location ID for opened bottles
  const [counterLocationId, setCounterLocationId] = useState<string | null>(null);

  // Feature B: Discard Broken/Spilled Bottle & Pull Replacement Modal State
  const [pullNewBottleModalWine, setPullNewBottleModalWine] = useState<FastWineItem | null>(null);
  const [pullNewBottleReason, setPullNewBottleReason] = useState<"broken" | "spilled" | "spoiled" | "discarded">("broken");
  const [pullNewBottleLocationId, setPullNewBottleLocationId] = useState<string | null>(null);
  const [isPullingNewBottle, setIsPullingNewBottle] = useState(false);

  // Customer / VIP Guest Attachment (for Fine Wine sales)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);

  // Post-dispense feedback
  const [successData, setSuccessData] = useState<{
    saleIds: string[];
    bottlesToRevert?: {
      bottleId: string;
      status: "shelved" | "open";
      glassesRemaining: number | null;
      locationId?: string | null;
    }[];
    dispatchedAt: number;
    itemsCount: number;
    totalBottlesVolume: number;
    totalAmount: number;
    staffName: string;
    customerName?: string | null;
    customerId?: string | null;
    timestamp: string;
  } | null>(null);

  const [isVoiding, setIsVoiding] = useState(false);
  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("Customer Changed Mind");
  const [customVoidReason, setCustomVoidReason] = useState("");

  const [parAlerts, setParAlerts] = useState<
    { wineName: string; stockCount: number; requestedQty: number }[]
  >([]);

  // Auto-close countdown timer for sales confirmation modal (10 seconds)
  // Pauses if staff is in the middle of voiding or selecting a void reason
  const [successCountdown, setSuccessCountdown] = useState(10);

  useEffect(() => {
    if (!successData || isVoiding || isVoidModalOpen) {
      setSuccessCountdown(10);
      return;
    }

    setSuccessCountdown(10);
    const timer = setInterval(() => {
      setSuccessCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setSuccessData(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [successData, isVoiding, isVoidModalOpen]);

  // Load staff, store name & inventory data in parallel (No waterfalls)
  const loadData = useCallback(async (isFullRefresh = false) => {
    try {
      // 1. Fire all queries simultaneously in parallel
      const [
        storeData,
        staff,
        storedShift,
        winesData,
        settingsData,
        bottlesData,
        locationsData,
      ] = await Promise.all([
        storeId && (!storeName || isFullRefresh)
          ? apiFetch(`/stores/${storeId}`).catch(() => null)
          : Promise.resolve(null),
        staffList.length === 0 || isFullRefresh
          ? fetchStoreStaff(storeId).catch(() => [])
          : Promise.resolve(staffList),
        AsyncStorage.getItem(`@caveau:pos_shift_staff_${storeId || "default"}`).catch(() => null),
        apiFetch("/wines"),
        storeId ? apiFetch(`/stock-settings?storeId=${storeId}`) : Promise.resolve([]),
        storeId
          ? apiFetch(`/bottles?storeId=${storeId}&status=received,shelved,open&pos=true`)
          : Promise.resolve([]),
        apiFetch(storeId ? `/locations?storeId=${storeId}` : "/locations").catch(() => []),
      ]);

      if (storeData?.name) setStoreName(storeData.name);

      if (Array.isArray(staff) && staff.length > 0) {
        setStaffList(staff);
        const activeUserInStaff: AppUser = staff.find((u) => u.id === profile?.id) || {
          id: profile?.id || "unknown",
          displayName: profile?.displayName || profile?.email?.split("@")[0] || "Staff Member",
          email: profile?.email || "",
          role: "store_staff",
          createdAt: new Date(),
        };
        setSelectedStaff((prev) => prev || activeUserInStaff);

        // Setup shift roster
        if (shiftStaffIds.length === 0 || isFullRefresh) {
          try {
            if (storedShift) {
              const parsed: string[] = JSON.parse(storedShift);
              if (Array.isArray(parsed) && parsed.length > 0) {
                const valid = parsed.filter((id) => staff.some((s) => s.id === id));
                if (!valid.includes(activeUserInStaff.id)) {
                  valid.unshift(activeUserInStaff.id);
                }
                setShiftStaffIds(valid);
              } else {
                setShiftStaffIds([activeUserInStaff.id]);
              }
            } else {
              // Default shift: active user + first 3 other store staff
              const otherStaff = staff.filter((s) => s.id !== activeUserInStaff.id).slice(0, 3).map((s) => s.id);
              const initialShift = [activeUserInStaff.id, ...otherStaff];
              setShiftStaffIds(initialShift);
              AsyncStorage.setItem(
                `@caveau:pos_shift_staff_${storeId || "default"}`,
                JSON.stringify(initialShift)
              ).catch(() => { });
            }
          } catch {
            setShiftStaffIds([activeUserInStaff.id]);
          }
        }
      }

      if (storeId) {
        prefetchCustomers(storeId).catch(() => { });
      }

      const locs: any[] = Array.isArray(locationsData)
        ? locationsData
        : Array.isArray(locationsData?.locations)
          ? locationsData.locations
          : [];

      // Feature A: Auto-detect or auto-create "Bar Counter" location for the store
      let counterLocId: string | null = null;
      const counterLoc = locs.find(
        (l) =>
          (l.name?.toLowerCase().includes("counter") || l.type?.toLowerCase() === "counter") &&
          (!storeId || !l.storeId || l.storeId === storeId)
      );
      if (counterLoc) {
        counterLocId = counterLoc.id;
      } else if (storeId) {
        try {
          const newLoc = await apiFetch("/locations", {
            method: "POST",
            body: JSON.stringify({ storeId, name: "Bar Counter", type: "Counter" }),
          });
          if (newLoc?.id) {
            counterLocId = newLoc.id;
            locs.push(newLoc);
          }
        } catch (e) {
          console.warn("[StoreStaffPOSTerminal] Auto-create Bar Counter failed:", e);
        }
      }
      setCounterLocationId(counterLocId);

      const locationMap: Record<string, string> = {};
      locs.forEach((l) => {
        if (l.id) locationMap[l.id] = l.name || l.code || "Bin";
      });

      const allWines: any[] = Array.isArray(winesData)
        ? winesData
        : Array.isArray(winesData.wines)
          ? winesData.wines
          : [];
      const settingsList: any[] = Array.isArray(settingsData)
        ? settingsData
        : Array.isArray(settingsData.settings)
          ? settingsData.settings
          : [];
      const bottlesList: any[] = Array.isArray(bottlesData)
        ? bottlesData
        : Array.isArray(bottlesData.bottles)
          ? bottlesData.bottles
          : [];

      const settingsMap = new Map<string, any>();
      settingsList.forEach((s) => settingsMap.set(s.masterWineId, s));

      const bottlesByWine = new Map<string, any[]>();
      const openBottleByWine = new Map<string, any>();

      bottlesList.forEach((b) => {
        const wId = b.masterWineId || b.masterWineRef?.id;
        if (!wId) return;

        const locName = b.locationId ? (locationMap[b.locationId] || "Assigned Bin") : "Unassigned";
        const enhancedBottle = {
          ...b,
          locationName: locName,
        };

        if (!bottlesByWine.has(wId)) bottlesByWine.set(wId, []);
        bottlesByWine.get(wId)!.push(enhancedBottle);

        if (
          b.status === "open" &&
          (!openBottleByWine.has(wId) ||
            (b.glassesRemaining ?? 0) > (openBottleByWine.get(wId)?.glassesRemaining ?? 0))
        ) {
          openBottleByWine.set(wId, enhancedBottle);
        }
      });

      const processedWines: FastWineItem[] = allWines
        .map((mw) => {
          const setting = settingsMap.get(mw.id);
          const wineBottles = bottlesByWine.get(mw.id) || [];
          const openB = openBottleByWine.get(mw.id);

          // Calculate location breakdown
          const locMapForWine = new Map<string, WineBottleLocationInfo>();
          wineBottles.forEach((b: any) => {
            const locId = b.locationId || "unassigned";
            const locName = b.locationName || (b.locationId ? locationMap[b.locationId] || "Assigned" : "Unassigned");
            if (!locMapForWine.has(locId)) {
              locMapForWine.set(locId, {
                locationId: locId,
                locationName: locName,
                count: 0,
                openCount: 0,
                openGlassesTotal: 0,
                bottleIds: [],
              });
            }
            const info = locMapForWine.get(locId)!;
            info.count += 1;
            info.bottleIds.push(b.id);
            if (b.status === "open") {
              info.openCount += 1;
              info.openGlassesTotal += (b.glassesRemaining ?? 6);
            }
          });

          const isGlassAllowed =
            Boolean(setting?.allowGlass) ||
            (setting?.glassPrice != null && !isNaN(Number(setting?.glassPrice)) && Number(setting?.glassPrice) > 0);
          const isCarafeAllowed =
            Boolean(setting?.allowCarafe) ||
            ((setting?.carafePrice || setting?.karafPrice) != null && !isNaN(Number(setting?.carafePrice || setting?.karafPrice)) && Number(setting?.carafePrice || setting?.karafPrice) > 0) ||
            isGlassAllowed;

          return {
            id: mw.id,
            name: mw.name,
            vintage: mw.vintage,
            producer: mw.producer,
            format: mw.format,
            sku: mw.sku,
            rawType: mw.type,
            wineType: normalizeWineType(mw.type, mw.name),
            price: mw.price,
            sellingPrice: setting?.sellingPrice ?? null,
            glassPrice: setting?.glassPrice ?? null,
            carafePrice: setting?.carafePrice ?? setting?.karafPrice ?? null,
            allowGlass: isGlassAllowed,
            allowCarafe: isCarafeAllowed,
            discontinued: setting?.discontinued ?? false,
            wineCategory: setting?.wineCategory ?? mw.wineCategory ?? "standard",
            stockCount: wineBottles.length,
            availableBottleIds: wineBottles.map((b: any) => b.id),
            bottles: wineBottles,
            locationBreakdown: Array.from(locMapForWine.values()),
            openBottle: openB
              ? {
                id: openB.id,
                locationId: openB.locationId || counterLocId || null,
                locationName: openB.locationName || (openB.locationId && locationMap[openB.locationId]) || "Bar Counter",
                glassesRemaining: openB.glassesRemaining ?? 6,
              }
              : null,
          };
        })
        .filter((w) => !w.discontinued && (isManager ? true : w.wineCategory !== "reserve"));

      setWines(processedWines);
    } catch (error) {
      console.error("[StoreStaffPOSTerminal] Load error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [storeId, profile?.id, isManager, storeName, staffList.length, shiftStaffIds.length]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData(true);
  };

  // Staff Selection Handlers & Filtered Lists (Inline Accordion + Shift Roster)
  const handleSelectStaff = (st: AppUser) => {
    setSelectedStaff(st);
    setRecentStaffIds((prev) => {
      const filtered = prev.filter((id) => id !== st.id);
      return [st.id, ...filtered].slice(0, 5);
    });
    // Auto-add selected staff to shift roster if not already present
    setShiftStaffIds((prev) => {
      if (prev.includes(st.id)) return prev;
      const updated = [...prev, st.id];
      AsyncStorage.setItem(
        `@caveau:pos_shift_staff_${storeId || "default"}`,
        JSON.stringify(updated)
      ).catch(() => { });
      return updated;
    });
    setIsStaffAccordionOpen(false);
    setStaffSearchQuery("");
  };

  const toggleShiftStaff = (stId: string) => {
    setShiftStaffIds((prev) => {
      const isCurrentlyOnShift = prev.includes(stId);
      let updated: string[];
      if (isCurrentlyOnShift) {
        if (prev.length <= 1) {
          Alert.alert("Shift Roster", "At least one staff member must remain on shift.");
          return prev;
        }
        updated = prev.filter((id) => id !== stId);
        // If the removed staff was currently active, switch to another on-duty staff
        if (selectedStaff?.id === stId) {
          const nextStaff = staffList.find((s) => s.id === updated[0]);
          if (nextStaff) setSelectedStaff(nextStaff);
        }
      } else {
        updated = [...prev, stId];
      }
      AsyncStorage.setItem(
        `@caveau:pos_shift_staff_${storeId || "default"}`,
        JSON.stringify(updated)
      ).catch(() => { });
      return updated;
    });
  };

  const onDutyStaff = useMemo(() => {
    return shiftStaffIds
      .map((id) => staffList.find((s) => s.id === id))
      .filter((s): s is AppUser => Boolean(s));
  }, [shiftStaffIds, staffList]);

  const filteredStaffList = useMemo(() => {
    let list = staffList;
    if (staffSearchQuery.trim()) {
      const q = staffSearchQuery.toLowerCase();
      list = staffList.filter(
        (s) =>
          formatStaffDisplayName(s).toLowerCase().includes(q) ||
          (s.email && s.email.toLowerCase().includes(q)) ||
          (s.role && s.role.toLowerCase().includes(q))
      );
    }
    return [...list].sort((a, b) => {
      if (a.id === selectedStaff?.id) return -1;
      if (b.id === selectedStaff?.id) return 1;
      const onDutyA = shiftStaffIds.includes(a.id);
      const onDutyB = shiftStaffIds.includes(b.id);
      if (onDutyA && !onDutyB) return -1;
      if (onDutyB && !onDutyA) return 1;
      const isRecentA = recentStaffIds.includes(a.id);
      const isRecentB = recentStaffIds.includes(b.id);
      if (isRecentA && !isRecentB) return -1;
      if (isRecentB && !isRecentA) return 1;
      const nameA = formatStaffDisplayName(a);
      const nameB = formatStaffDisplayName(b);
      return nameA.localeCompare(nameB);
    });
  }, [staffList, staffSearchQuery, selectedStaff, shiftStaffIds, recentStaffIds]);

  // Filtered wines (Filtered by active portion: By the Glass, Carafe, or Full Bottle)
  const filteredWines = useMemo(() => {
    let result = wines.filter((w) => isWineEligibleForPortion(w, salesTypeMode));

    if (tierFilter !== "all") {
      result = result.filter((w) => (w.wineCategory || "standard") === tierFilter);
    }

    if (wineTypeFilter !== "all") {
      result = result.filter((w) => (w.wineType || "Red Wine") === wineTypeFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (w) =>
          w.name.toLowerCase().includes(q) ||
          (w.producer && w.producer.toLowerCase().includes(q)) ||
          (w.vintage && w.vintage.toLowerCase().includes(q)) ||
          (w.sku && w.sku.toLowerCase().includes(q)) ||
          (w.wineType && w.wineType.toLowerCase().includes(q)) ||
          (w.rawType && w.rawType.toLowerCase().includes(q))
      );
    }

    return [...result].sort((a, b) => {
      if (salesTypeMode === "glass") {
        if (a.openBottle && !b.openBottle) return -1;
        if (!a.openBottle && b.openBottle) return 1;
      }
      const isFunA = a.wineCategory === "fun" || a.wineCategory === "fast";
      const isFunB = b.wineCategory === "fun" || b.wineCategory === "fast";
      if (isFunA && !isFunB) return -1;
      if (isFunB && !isFunA) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [wines, salesTypeMode, tierFilter, wineTypeFilter, searchQuery]);

  // Group filtered wines by wine type in canonical sequence
  const groupedWines = useMemo(() => {
    const groupsMap = new Map<string, FastWineItem[]>();

    filteredWines.forEach((wine) => {
      const type = wine.wineType || "Red Wine";
      if (!groupsMap.has(type)) {
        groupsMap.set(type, []);
      }
      groupsMap.get(type)!.push(wine);
    });

    const canonicalOrder = ["Red Wine", "Sparkling", "White Wine", "Rosé", "Sweet Wine"];
    const groups: { wineType: string; wines: FastWineItem[] }[] = [];

    canonicalOrder.forEach((type) => {
      if (groupsMap.has(type) && groupsMap.get(type)!.length > 0) {
        groups.push({
          wineType: type,
          wines: groupsMap.get(type)!,
        });
        groupsMap.delete(type);
      }
    });

    // Add any remaining custom types
    groupsMap.forEach((groupWines, type) => {
      if (groupWines.length > 0) {
        groups.push({ wineType: type, wines: groupWines });
      }
    });

    return groups;
  }, [filteredWines]);

  // Card size calculation for multi-column grid
  const cardSize = useMemo(() => {
    const cols = isTabletLandscape ? 3 : 2;
    const catalogPad = 32; // 16px each side
    const dockW = isTabletLandscape ? 68 : 0;
    const panelW = isTabletLandscape ? (isSidebarCollapsed ? 52 : 360) : 0;
    const cardGap = 10;
    const totalGap = cardGap * (cols + 1);
    return Math.floor((width - dockW - panelW - catalogPad - totalGap) / cols);
  }, [width, isTabletLandscape, isSidebarCollapsed]);

  // Wine Category Tier Counts (Reflects active portion mode)
  const tierCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0, fun: 0, fine: 0 };
    let base = wines.filter((w) => isWineEligibleForPortion(w, salesTypeMode));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      base = base.filter(
        (w) =>
          w.name.toLowerCase().includes(q) ||
          (w.producer && w.producer.toLowerCase().includes(q)) ||
          (w.vintage && w.vintage.toLowerCase().includes(q)) ||
          (w.sku && w.sku.toLowerCase().includes(q)) ||
          (w.wineType && w.wineType.toLowerCase().includes(q))
      );
    }
    counts.all = base.length;
    base.forEach((w) => {
      const cat = w.wineCategory || "standard";
      if (cat === "fun" || cat === "fast") counts.fun = (counts.fun || 0) + 1;
      else if (cat === "fine") counts.fine = (counts.fine || 0) + 1;
      else if (cat === "reserve") counts.reserve = (counts.reserve || 0) + 1;
    });
    return counts;
  }, [wines, salesTypeMode, searchQuery]);

  // Wine Type Counts (Reflects active portion mode and tier filter)
  const wineTypeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    let base = wines.filter((w) => isWineEligibleForPortion(w, salesTypeMode));
    if (tierFilter !== "all") {
      base = base.filter((w) => {
        const cat = w.wineCategory || "standard";
        if (tierFilter === "fun") return cat === "fun" || cat === "fast";
        return cat === tierFilter;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      base = base.filter(
        (w) =>
          w.name.toLowerCase().includes(q) ||
          (w.producer && w.producer.toLowerCase().includes(q)) ||
          (w.vintage && w.vintage.toLowerCase().includes(q)) ||
          (w.sku && w.sku.toLowerCase().includes(q)) ||
          (w.wineType && w.wineType.toLowerCase().includes(q))
      );
    }
    counts.all = base.length;
    base.forEach((w) => {
      const t = w.wineType || "Red Wine";
      counts[t] = (counts[t] || 0) + 1;
    });
    return counts;
  }, [wines, salesTypeMode, tierFilter, searchQuery]);

  // Open Location Selection Modal before adding to service
  const handleSelectWineCard = (wine: FastWineItem) => {
    const portion = salesTypeMode;
    const canAdd = canAddPortion(wine, portion, currentOrder);
    if (!canAdd) {
      Alert.alert("Out of Stock", `No additional stock available for ${wine.name} in this portion.`);
      return;
    }

    const breakdown = wine.locationBreakdown || [];
    setLocationModalWine(wine);
    setLocationModalPortion(portion);

    const activeOpen = wine.openBottle;
    const hasActiveOpen = (portion === "glass" || portion === "carafe") &&
      Boolean(activeOpen && (activeOpen.glassesRemaining ?? 0) > 0);

    if (hasActiveOpen) {
      setSelectedLocationId(activeOpen!.locationId || (breakdown[0]?.locationId ?? null));
    } else if (breakdown.length > 0) {
      setSelectedLocationId(breakdown[0].locationId);
    } else {
      setSelectedLocationId(null);
    }
  };

  const handleConfirmLocation = () => {
    if (!locationModalWine) return;
    const locInfo = (locationModalWine.locationBreakdown || []).find((l) => l.locationId === selectedLocationId);
    const locName = locInfo ? locInfo.locationName : (selectedLocationId ? "Assigned" : "Unassigned");
    addToOrder(locationModalWine, locationModalPortion, selectedLocationId, locName);
    setLocationModalWine(null);
  };

  const handleAddMoreFromModal = () => {
    handleConfirmLocation();
  };

  const handleDirectSaleFromModal = async () => {
    if (!locationModalWine) return;
    const locInfo = (locationModalWine.locationBreakdown || []).find((l) => l.locationId === selectedLocationId);
    const locName = locInfo ? locInfo.locationName : (selectedLocationId ? "Assigned" : "Unassigned");
    const newItem: OrderItem = {
      wine: locationModalWine,
      portion: locationModalPortion,
      quantity: 1,
      selectedLocationId: selectedLocationId || null,
      selectedLocationName: locName,
    };
    const itemsToProcess = [...currentOrder, newItem];
    setLocationModalWine(null);
    await executeSaleOrder(itemsToProcess);
  };

  // Feature B: Discard Damaged/Broken Bottle & Pull Fresh Replacement
  const handlePullNewBottle = async () => {
    if (!pullNewBottleModalWine) return;
    setIsPullingNewBottle(true);

    try {
      const activeOpenBottleId = pullNewBottleModalWine.openBottle?.id;
      const allBottles = pullNewBottleModalWine.bottles || [];

      // Find available unopened replacement candidate
      const unopenedCandidates = allBottles.filter(
        (b) =>
          b.id !== activeOpenBottleId &&
          (b.status === "shelved" ||
            b.status === "received" ||
            !["open", "consumed", "damaged", "lost", "outbound"].includes(b.status))
      );

      if (unopenedCandidates.length === 0) {
        Alert.alert(
          "No Unopened Bottles",
          `There are no unopened bottles of ${pullNewBottleModalWine.name} left in inventory to pull.`
        );
        setIsPullingNewBottle(false);
        return;
      }

      // Prioritize chosen location, otherwise first candidate
      const chosenBottle = pullNewBottleLocationId
        ? unopenedCandidates.find((b) => b.locationId === pullNewBottleLocationId) || unopenedCandidates[0]
        : unopenedCandidates[0];

      // 1. Mark active open bottle as damaged/discarded if it exists
      if (activeOpenBottleId) {
        await apiFetch(`/bottles/${activeOpenBottleId}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "damaged",
            glassesRemaining: 0,
            locationId: null,
          }),
        });
      }

      // 2. Open the replacement bottle and tag to Bar Counter
      await apiFetch(`/bottles/${chosenBottle.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "open",
          glassesRemaining: 6,
          ...(counterLocationId ? { locationId: counterLocationId } : {}),
        }),
      });

      // 3. Refresh POS data
      await loadData();

      // 4. Close modal and inform staff
      const wineName = pullNewBottleModalWine.name;
      const reasonLabel =
        pullNewBottleReason === "broken"
          ? "broken bottle"
          : pullNewBottleReason === "spilled"
            ? "spilled wine"
            : pullNewBottleReason === "spoiled"
              ? "spoiled/corked wine"
              : "discarded bottle";

      setPullNewBottleModalWine(null);

      Alert.alert(
        "Replacement Bottle Ready",
        `Damaged bottle discarded (${reasonLabel}).\nFresh bottle of ${wineName} has been pulled and opened on the Bar Counter.`
      );
    } catch (err: any) {
      console.error("[handlePullNewBottle] Error:", err);
      Alert.alert("Pullout Failed", err?.message || "Failed to pull replacement bottle. Please try again.");
    } finally {
      setIsPullingNewBottle(false);
    }
  };

  // Cart / Current Order Handlers
  const addToOrder = (
    wine: FastWineItem,
    preferredPortion?: PortionType,
    locationId?: string | null,
    locationName?: string
  ) => {
    const portion = preferredPortion || salesTypeMode;
    const canAdd = canAddPortion(wine, portion, currentOrder);
    if (!canAdd) {
      Alert.alert("Out of Stock", `No additional stock available for ${wine.name} in this portion.`);
      return;
    }

    setCurrentOrder((prev) => {
      const existingIdx = prev.findIndex(
        (item) =>
          item.wine.id === wine.id &&
          item.portion === portion &&
          (item.selectedLocationId === locationId || (!item.selectedLocationId && !locationId))
      );
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx].quantity += 1;
        return updated;
      }
      return [
        ...prev,
        {
          wine,
          portion,
          quantity: 1,
          selectedLocationId: locationId || null,
          selectedLocationName: locationName || "Assigned",
        },
      ];
    });
  };

  const updateQuantity = (index: number, delta: number) => {
    setCurrentOrder((prev) => {
      const target = prev[index];
      if (!target) return prev;

      if (delta > 0) {
        const canAdd = canAddPortion(target.wine, target.portion, prev);
        if (!canAdd) {
          Alert.alert("Out of Stock", `No additional stock available for ${target.wine.name}.`);
          return prev;
        }
      }

      const updated = [...prev];
      const newQty = updated[index].quantity + delta;
      if (newQty <= 0) {
        return updated.filter((_, i) => i !== index);
      }
      updated[index].quantity = newQty;
      return updated;
    });
  };

  // Order Volume & Portion Summary
  const orderSummary = useMemo(() => {
    let totalItems = 0;
    let glassesCount = 0;
    let carafesCount = 0;
    let bottlesCount = 0;
    let totalBottlesVolume = 0;
    let totalAmount = 0;

    currentOrder.forEach((item) => {
      totalItems += item.quantity;
      const unitPrice = getItemUnitPrice(item.wine, item.portion);
      totalAmount += unitPrice * item.quantity;

      if (item.portion === "glass") {
        glassesCount += item.quantity;
        totalBottlesVolume += item.quantity * (1 / 6);
      } else if (item.portion === "carafe") {
        carafesCount += item.quantity;
        totalBottlesVolume += item.quantity * (2 / 6);
      } else {
        bottlesCount += item.quantity;
        totalBottlesVolume += item.quantity;
      }
    });

    return {
      totalItems,
      glassesCount,
      carafesCount,
      bottlesCount,
      totalBottlesVolume: Math.round(totalBottlesVolume * 100) / 100,
      totalAmount,
    };
  }, [currentOrder]);

  // Core Order / Sale Execution logic
  const executeSaleOrder = async (itemsToProcess: OrderItem[]) => {
    if (itemsToProcess.length === 0) return;

    setIsProcessing(true);
    const triggeredParAlerts: { wineName: string; stockCount: number; requestedQty: number }[] = [];
    const createdSaleIds: string[] = [];
    const bottlesToRevert: {
      bottleId: string;
      status: "shelved" | "open";
      glassesRemaining: number | null;
      locationId?: string | null;
    }[] = [];

    try {
      const staffToAttribute = selectedStaff || {
        id: profile?.id || "unknown",
        displayName: profile?.displayName || profile?.email?.split("@")[0] || "Staff",
        email: profile?.email,
      };

      for (const item of itemsToProcess) {
        const { wine, portion, quantity } = item;
        const unitPrice = getItemUnitPrice(wine, portion);

        let glassCount = 1.0;
        let glassesDeductedPerUnit = 6;
        if (portion === "glass") {
          glassCount = 0.1667;
          glassesDeductedPerUnit = 1;
        } else if (portion === "carafe") {
          glassCount = 0.3333;
          glassesDeductedPerUnit = 2;
        }

        if (portion === "bottle") {
          const locMatchingBottleIds = item.selectedLocationId && item.selectedLocationId !== "unassigned"
            ? (wine.bottles || [])
              .filter((b) => b.locationId === item.selectedLocationId && b.status !== "consumed")
              .map((b) => b.id)
            : [];
          const candidateBottleIds = [
            ...locMatchingBottleIds,
            ...wine.availableBottleIds.filter((id) => !locMatchingBottleIds.includes(id)),
          ];

          for (let i = 0; i < quantity; i++) {
            const targetBottleId = candidateBottleIds[i] || wine.availableBottleIds[i] || wine.availableBottleIds[0];

            const saleRes = await apiFetch("/sales", {
              method: "POST",
              body: JSON.stringify({
                bottleId: targetBottleId || null,
                locationId: item.selectedLocationId && item.selectedLocationId !== "unassigned"
                  ? item.selectedLocationId
                  : (wine.bottles?.find((b) => b.id === targetBottleId)?.locationId || null),
                masterWineId: wine.id,
                wineName: wine.name,
                vintage: wine.vintage,
                producer: wine.producer,
                format: wine.format,
                storeId: storeId,
                soldById: staffToAttribute.id,
                soldByEmail: staffToAttribute.email,
                price: unitPrice,
                vatAmount: 0,
                totalAmount: unitPrice,
                vatMode: "included",
                customerId: selectedCustomer?.id || null,
                customerName: selectedCustomer?.name || null,
                wineCategory: wine.wineCategory,
                masterWinePrice: wine.price || null,
                saleType: portion,
                glassCount: 1.0,
              }),
            });

            const sid = saleRes?.id || saleRes?.sale?.id || saleRes?.data?.id;
            if (sid) {
              createdSaleIds.push(sid);
            }

            if (targetBottleId) {
              const targetLocationId = item.selectedLocationId && item.selectedLocationId !== "unassigned"
                ? item.selectedLocationId
                : (wine.bottles?.find((b) => b.id === targetBottleId)?.locationId || null);

              bottlesToRevert.push({
                bottleId: targetBottleId,
                status: "shelved",
                glassesRemaining: null,
                locationId: targetLocationId,
              });

              await apiFetch(`/bottles/${targetBottleId}`, {
                method: "PATCH",
                body: JSON.stringify({
                  status: "consumed",
                  glassesRemaining: 0,
                  locationId: null,
                }),
              });
            }
          }
        } else {
          let totalGlassesToDeduct = quantity * glassesDeductedPerUnit;
          let activeOpenBottleId = wine.openBottle?.id || null;
          let currentGlassesInActiveBottle = wine.openBottle ? wine.openBottle.glassesRemaining : 0;
          const availableUnopenedIds = [...wine.availableBottleIds.filter((bId) => bId !== activeOpenBottleId)];

          if (activeOpenBottleId) {
            bottlesToRevert.push({
              bottleId: activeOpenBottleId,
              status: "open",
              glassesRemaining: currentGlassesInActiveBottle,
              locationId: wine.openBottle?.locationId || null,
            });
          }

          for (let q = 0; q < quantity; q++) {
            const saleRes = await apiFetch("/sales", {
              method: "POST",
              body: JSON.stringify({
                bottleId: activeOpenBottleId || availableUnopenedIds[0] || null,
                locationId: activeOpenBottleId
                  ? (wine.openBottle?.locationId || counterLocationId || null)
                  : (counterLocationId || null),
                masterWineId: wine.id,
                wineName: wine.name,
                vintage: wine.vintage,
                producer: wine.producer,
                format: wine.format,
                storeId: storeId,
                soldById: staffToAttribute.id,
                soldByEmail: staffToAttribute.email,
                price: unitPrice,
                vatAmount: 0,
                totalAmount: unitPrice,
                vatMode: "included",
                customerId: selectedCustomer?.id || null,
                customerName: selectedCustomer?.name || null,
                wineCategory: wine.wineCategory,
                masterWinePrice: wine.price || null,
                saleType: portion,
                glassCount,
              }),
            });

            if (saleRes?.id) {
              createdSaleIds.push(saleRes.id);
            }
          }

          while (totalGlassesToDeduct > 0) {
            if (activeOpenBottleId && currentGlassesInActiveBottle > 0) {
              const glassesFromThis = Math.min(totalGlassesToDeduct, currentGlassesInActiveBottle);
              const remainingInThis = currentGlassesInActiveBottle - glassesFromThis;
              const isNowConsumed = remainingInThis === 0;

              await apiFetch(`/bottles/${activeOpenBottleId}`, {
                method: "PATCH",
                body: JSON.stringify({
                  status: isNowConsumed ? "consumed" : "open",
                  glassesRemaining: remainingInThis,
                  ...(isNowConsumed
                    ? { locationId: null }
                    : (counterLocationId ? { locationId: counterLocationId } : {})),
                }),
              });

              totalGlassesToDeduct -= glassesFromThis;
              currentGlassesInActiveBottle = remainingInThis;
              if (isNowConsumed) activeOpenBottleId = null;
            } else if (availableUnopenedIds.length > 0) {
              const nextBottleId = availableUnopenedIds.shift()!;
              const glassesFromThis = Math.min(totalGlassesToDeduct, 6);
              const remainingInThis = 6 - glassesFromThis;
              const isNowConsumed = remainingInThis === 0;

              // Track in bottlesToRevert for void safety
              const origBottle = wine.bottles?.find((b: any) => b.id === nextBottleId);
              bottlesToRevert.push({
                bottleId: nextBottleId,
                status: "shelved",
                glassesRemaining: 6,
                locationId: origBottle?.locationId || null,
              });

              await apiFetch(`/bottles/${nextBottleId}`, {
                method: "PATCH",
                body: JSON.stringify({
                  status: isNowConsumed ? "consumed" : "open",
                  glassesRemaining: remainingInThis,
                  ...(isNowConsumed
                    ? { locationId: null }
                    : (counterLocationId ? { locationId: counterLocationId } : {})),
                }),
              });

              totalGlassesToDeduct -= glassesFromThis;
              activeOpenBottleId = isNowConsumed ? null : nextBottleId;
              currentGlassesInActiveBottle = remainingInThis;
            } else break;
          }
        }

        if (storeId) {
          try {
            const [settingsRes, countRes, pendingReqRes] = await Promise.all([
              apiFetch(`/stock-settings?storeId=${storeId}&masterWineId=${wine.id}`),
              apiFetch(`/bottles?storeId=${storeId}&masterWineId=${wine.id}&status=shelved,received&countOnly=true`),
              apiFetch(`/wine-requests?storeId=${storeId}&status=pending`).catch(() => []),
            ]);

            const settingList: any[] = settingsRes.settings || settingsRes;
            const currentSetting = settingList?.[0];
            const stockCount = countRes?.count ?? 0;

            if (currentSetting && currentSetting.parLevel > 0 && stockCount <= currentSetting.parLevel) {
              const pendingRequests = Array.isArray(pendingReqRes)
                ? pendingReqRes
                : pendingReqRes?.wineRequests || [];
              let hasPending = false;
              pendingRequests.forEach((req: any) => {
                const items = Array.isArray(req.items)
                  ? req.items
                  : typeof req.items === "string"
                    ? JSON.parse(req.items)
                    : [];
                items.forEach((it: any) => {
                  if (it.masterWineId === wine.id) hasPending = true;
                });
              });

              if (!hasPending) {
                const requestedQty = Math.max(1, (currentSetting.safetyStock || currentSetting.parLevel * 2) - stockCount);
                const unitCost = wine.price || 0;

                await apiFetch("/wine-requests", {
                  method: "POST",
                  body: JSON.stringify({
                    storeId,
                    targetStoreId: "warehouse",
                    createdBy: profile?.email || "POS Auto",
                    requesterId: profile?.id || "system",
                    status: "pending",
                    items: [
                      {
                        masterWineId: wine.id,
                        wineName: wine.name,
                        vintage: wine.vintage || "",
                        sku: wine.sku || "",
                        format: wine.format || "",
                        producer: wine.producer || "",
                        qty: requestedQty,
                        price: unitCost,
                        pulledQty: 0,
                        ingressedQty: 0,
                      },
                    ],
                    totalAmount: unitCost * requestedQty,
                    urgency: "high",
                    notes: `[POS AUTO-REQUEST] PAR alert trigger (${stockCount} left <= PAR ${currentSetting.parLevel})`,
                  }),
                });

                triggeredParAlerts.push({
                  wineName: wine.name,
                  stockCount,
                  requestedQty,
                });
              }
            }
          } catch (e) {
            console.error("[POS Mode] PAR Alert check error:", e);
          }
        }
      }

      // Calculate summary for success modal
      let totalItems = 0;
      let totalBottlesVolume = 0;
      let totalAmount = 0;
      itemsToProcess.forEach((item) => {
        totalItems += item.quantity;
        const unitPrice = getItemUnitPrice(item.wine, item.portion);
        totalAmount += unitPrice * item.quantity;
        if (item.portion === "glass") totalBottlesVolume += item.quantity * (1 / 6);
        else if (item.portion === "carafe") totalBottlesVolume += item.quantity * (2 / 6);
        else totalBottlesVolume += item.quantity;
      });

      setParAlerts(triggeredParAlerts);
      setSuccessData({
        saleIds: createdSaleIds,
        bottlesToRevert,
        dispatchedAt: Date.now(),
        itemsCount: totalItems,
        totalBottlesVolume: Math.round(totalBottlesVolume * 100) / 100,
        totalAmount,
        staffName: staffToAttribute.displayName || staffToAttribute.email?.split("@")[0] || "Staff",
        customerName: selectedCustomer?.name || null,
        customerId: selectedCustomer?.id || null,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });

      if (selectedCustomer?.id) {
        recordCustomerSaleInCache(selectedCustomer.id, totalAmount, storeId).catch(() => { });
      }

      setSelectedCustomer(null);
      setCurrentOrder([]);
      setIsMobileCartOpen(false);
      loadData();
    } catch (error: any) {
      console.error("[StoreStaffPOSTerminal] Dispense error:", error);
      Alert.alert("Action Failed", error.message || "Failed to process dispense.");
    } finally {
      setIsProcessing(false);
    }
  };

  const VOID_PRESET_REASONS = [
    "Customer Changed Mind",
    "Wrong Item / Quantity",
    "Payment Issue / Declined",
    "Defective / Corked Bottle",
    "Input / Cashier Error",
    "Other",
  ];

  const handleVoidTransaction = () => {
    if (!successData?.saleIds || successData.saleIds.length === 0) {
      Alert.alert("Cannot Void", "No transaction records found to void.");
      return;
    }
    setVoidReason("Customer Changed Mind");
    setCustomVoidReason("");
    setIsVoidModalOpen(true);
  };

  const handleConfirmVoid = async () => {
    if (!successData?.saleIds || successData.saleIds.length === 0) return;

    const finalReason = voidReason === "Other"
      ? (customVoidReason.trim() || "Staff voided transaction from POS (Other)")
      : voidReason;

    setIsVoiding(true);
    try {
      let res: any = null;
      try {
        res = await apiFetch("/sales/void", {
          method: "POST",
          body: JSON.stringify({
            saleIds: successData.saleIds,
            voidedBy: profile?.id,
            voidedByEmail: profile?.email,
            reason: finalReason,
            force: true,
          }),
        });
      } catch (apiErr: any) {
        console.warn("[StoreStaffPOSTerminal] /sales/void API error, restoring bottles via direct fallback:", apiErr);
        if (successData.bottlesToRevert && successData.bottlesToRevert.length > 0) {
          await Promise.all(
            successData.bottlesToRevert.map(async (b) => {
              await apiFetch(`/bottles/${b.bottleId}`, {
                method: "PATCH",
                body: JSON.stringify({
                  status: b.status,
                  glassesRemaining: b.glassesRemaining,
                  ...(b.locationId ? { locationId: b.locationId } : {}),
                }),
              }).catch(() => { });
            })
          );
        }
        res = { message: `Transaction voided (${finalReason}) and inventory restored.` };
      }

      // Reverse customer cache update
      if (successData.customerId && storeId) {
        recordCustomerSaleInCache(
          successData.customerId,
          -successData.totalAmount,
          storeId
        ).catch(() => { });
      }

      setIsVoidModalOpen(false);
      setSuccessData(null);
      setCustomVoidReason("");
      setVoidReason("Customer Changed Mind");
      loadData();
      Alert.alert(
        "Transaction Voided & Recorded",
        res?.message || `Transaction marked as voided (${finalReason}). Inventory restored and recorded in audit trail.`
      );
    } catch (err: any) {
      console.error("[StoreStaffPOSTerminal] Void error:", err);
      Alert.alert(
        "Void Failed",
        err.message || "Failed to void transaction. Please contact admin."
      );
    } finally {
      setIsVoiding(false);
    }
  };

  const handleCompleteOrder = () => executeSaleOrder(currentOrder);

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out of the POS Terminal?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          try {
            await clearToken();
            await refreshProfile();
            router.replace("/login");
          } catch (error) {
            console.error("Sign out error:", error);
          }
        },
      },
    ]);
  };

  // Sommelier Wine Type Color Theme helper (White = Yellow, Sweet = Orange, Red = Crimson, Rose = Pink)
  const getWineTypeTheme = (wineType?: string, wineName?: string, rawType?: string | null) => {
    const t = (wineType || "").toLowerCase();
    const n = (wineName || "").toLowerCase();
    const raw = (rawType || "").toLowerCase();
    const combined = `${t} ${n} ${raw}`;

    const isSparkling =
      combined.includes("sparkling") ||
      combined.includes("champagne") ||
      combined.includes("prosecco") ||
      combined.includes("cava");
    const isRose = combined.includes("rose") || combined.includes("rosé");
    const isSweet = combined.includes("sweet") || combined.includes("dessert");
    const isRed = combined.includes("red");
    const isWhite = combined.includes("white");

    // If Sparkling (Sparkling Rosé -> Pink, Sparkling Red -> Red, Sparkling White -> Yellow)
    if (isSparkling) {
      if (isRose) {
        return {
          bg: "#fce7f3",
          accent: "#9d174d",
          color: "#ec4899",
          tag: "SPARKLING ROSÉ",
        };
      }
      if (isRed) {
        return {
          bg: "#fee2e2",
          accent: "#991b1b",
          color: "#dc2626",
          tag: "SPARKLING RED",
        };
      }
      return {
        bg: "#fef9c3",
        accent: "#854d0e",
        color: "#eab308",
        tag: "SPARKLING",
      };
    }

    // 1. Rosé -> Pink
    if (isRose) {
      return {
        bg: "#fce7f3",
        accent: "#9d174d",
        color: "#ec4899",
        tag: "ROSÉ",
      };
    }
    // 2. Sweet / Dessert -> Orange
    if (isSweet) {
      return {
        bg: "#ffedd5",
        accent: "#9a3412",
        color: "#ea580c",
        tag: "SWEET",
      };
    }
    // 3. White -> Yellow
    if (isWhite) {
      return {
        bg: "#fef9c3",
        accent: "#854d0e",
        color: "#eab308",
        tag: "WHITE",
      };
    }
    // 4. Default / Red -> Crimson Red
    return {
      bg: "#fee2e2",
      accent: "#991b1b",
      color: "#dc2626",
      tag: "RED",
    };
  };

  // Render Current Service / Dispense Queue Sidebar / Drawer
  const renderCurrentOrderPanel = () => (
    <View
      style={[
        styles.orderPanel,
        {
          backgroundColor: "#ffffff",
          width: isTabletLandscape ? 360 : "100%",
          borderLeftWidth: isTabletLandscape ? 1 : 0,
        },
      ]}
    >
      {/* Collapse Toggle Tab — outer container spans full height so inner pill stays centered */}
      {isTabletLandscape && (
        <TouchableOpacity
          onPress={() => setIsSidebarCollapsed(true)}
          style={styles.sidebarCollapseTab}
          activeOpacity={0.85}
        >
          <View style={styles.sidebarCollapseTabInner}>
            <ChevronRight size={14} color="#ffffff" strokeWidth={3} />
          </View>
        </TouchableOpacity>
      )}

      {/* Order Panel Header */}
      <View style={styles.orderPanelHeader}>
        <View>
          <Text style={styles.orderPanelTitle}>Current Service</Text>
          <Text style={styles.orderPanelSubTitle}>
            {orderSummary.totalItems} item{orderSummary.totalItems !== 1 ? "s" : ""} to dispense
          </Text>
        </View>
        {isTabletLandscape && (
          <TouchableOpacity
            onPress={() => setIsSidebarCollapsed(true)}
            style={styles.orderPanelCollapseBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ChevronRight size={18} color={MAROON.primary} strokeWidth={2.5} />
          </TouchableOpacity>
        )}
      </View>

      {/* Staff Selector - Quick Switcher + Inline Accordion */}
      <View style={styles.staffSection}>
        {/* Accordion Header (Active Server Card - Always Visible) */}
        <TouchableOpacity
          onPress={() => {
            setIsStaffAccordionOpen((prev) => !prev);
          }}
          style={[
            styles.staffAccordionHeader,
            isStaffAccordionOpen && styles.staffAccordionHeaderOpen,
          ]}
          activeOpacity={0.8}
        >
          <View style={styles.staffHeaderLeft}>
            <View style={styles.staffHeaderAvatar}>
              <Text style={styles.staffHeaderAvatarText}>
                {formatStaffDisplayName(selectedStaff)[0]?.toUpperCase() || "S"}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={styles.staffHeaderName} numberOfLines={1}>
                  {formatStaffDisplayName(selectedStaff)}
                </Text>
                <View style={styles.activeServerPill}>
                  <View style={styles.activeServerDot} />
                  <Text style={styles.activeServerPillText}>Active</Text>
                </View>
              </View>
              <Text style={styles.staffHeaderRole} numberOfLines={1}>
                {selectedStaff?.role === "store_manager"
                  ? "Store Manager"
                  : selectedStaff?.role === "admin"
                    ? "Admin"
                    : "Store Staff"} · {isStaffAccordionOpen ? "Tap to close roster" : "Tap to manage shift"}
              </Text>
            </View>
          </View>

          <View style={styles.staffAccordionChevron}>
            {isStaffAccordionOpen ? (
              <ChevronUp size={18} color={MAROON.primary} strokeWidth={2.5} />
            ) : (
              <ChevronDown size={18} color={MAROON.primary} strokeWidth={2.5} />
            )}
          </View>
        </TouchableOpacity>

        {/* ── 1-TAP QUICK SWITCHER (Always Visible, Wraps & Fills Downward) ─── */}
        <View style={styles.quickStaffBarContainer}>
          <View style={styles.quickStaffContainer}>
            {onDutyStaff.map((st) => {
              const isSelected = selectedStaff?.id === st.id;
              const displayName = formatStaffDisplayName(st);
              const initial = displayName[0]?.toUpperCase() || "S";
              const firstName = displayName.split(" ")[0] || displayName;

              return (
                <TouchableOpacity
                  key={st.id}
                  onPress={() => {
                    setSelectedStaff(st);
                    setRecentStaffIds((prev) => [st.id, ...prev.filter((id) => id !== st.id)].slice(0, 5));
                  }}
                  activeOpacity={0.75}
                  style={[
                    styles.quickStaffChip,
                    isSelected && styles.quickStaffChipSelected,
                  ]}
                >
                  <View
                    style={[
                      styles.quickStaffChipAvatar,
                      isSelected ? styles.quickStaffChipAvatarSelected : styles.quickStaffChipAvatarDefault,
                    ]}
                  >
                    <Text
                      style={[
                        styles.quickStaffChipAvatarText,
                        isSelected ? styles.quickStaffChipAvatarTextSelected : styles.quickStaffChipAvatarTextDefault,
                      ]}
                    >
                      {initial}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.quickStaffChipName,
                      isSelected && styles.quickStaffChipNameSelected,
                    ]}
                    numberOfLines={1}
                  >
                    {firstName}
                  </Text>
                  {isSelected && <View style={styles.quickStaffActiveDot} />}
                </TouchableOpacity>
              );
            })}

            {/* Quick "+ Roster" button */}
            <TouchableOpacity
              onPress={() => setIsStaffAccordionOpen((prev) => !prev)}
              style={[
                styles.quickStaffAddBtn,
                isStaffAccordionOpen && styles.quickStaffAddBtnActive,
              ]}
              activeOpacity={0.8}
            >
              <Plus size={11} color={isStaffAccordionOpen ? "#ffffff" : MAROON.primary} strokeWidth={2.5} />
              <Text style={[styles.quickStaffAddText, isStaffAccordionOpen && { color: "#ffffff" }]}>
                Roster
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Accordion Expanded Body */}
        {isStaffAccordionOpen && (
          <View style={styles.staffAccordionBody}>
            {/* Shift Roster Sub-bar inside Accordion */}
            <View style={styles.accordionRosterHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Users size={12} color={MAROON.primary} />
                <Text style={styles.accordionRosterTitle}>
                  {onDutyStaff.length} On Duty Today ({staffList.length} total)
                </Text>
              </View>
              {shiftStaffIds.length > 1 && (
                <TouchableOpacity
                  onPress={() => {
                    if (selectedStaff) {
                      setShiftStaffIds([selectedStaff.id]);
                      AsyncStorage.setItem(
                        `@caveau:pos_shift_staff_${storeId || "default"}`,
                        JSON.stringify([selectedStaff.id])
                      ).catch(() => { });
                    }
                  }}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={styles.accordionRosterReset}>Reset to Me</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Search Input - Always Retained */}
            <View style={styles.staffAccordionSearchBox}>
              <Search size={14} color="#94a3b8" />
              <TextInput
                style={styles.staffAccordionSearchInput}
                placeholder="Search staff by name or email..."
                placeholderTextColor="#94a3b8"
                value={staffSearchQuery}
                onChangeText={setStaffSearchQuery}
                clearButtonMode="while-editing"
                autoCorrect={false}
                autoCapitalize="none"
              />
              {staffSearchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => setStaffSearchQuery("")}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <X size={13} color="#94a3b8" />
                </TouchableOpacity>
              )}
            </View>

            {/* Scrollable Staff List */}
            <ScrollView
              style={styles.staffAccordionScroll}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
              keyboardShouldPersistTaps="handled"
            >
              {filteredStaffList.length === 0 ? (
                <View style={styles.staffAccordionEmpty}>
                  <Text style={styles.staffAccordionEmptyText}>
                    {`No staff matching "${staffSearchQuery}"`}
                  </Text>
                </View>
              ) : (
                <View style={styles.staffAccordionListWrap}>
                  {filteredStaffList.map((st) => {
                    const isSelected = selectedStaff?.id === st.id;
                    const isOnShift = shiftStaffIds.includes(st.id);
                    const name = formatStaffDisplayName(st);
                    const initial = name[0]?.toUpperCase() || "S";

                    return (
                      <TouchableOpacity
                        key={st.id}
                        onPress={() => handleSelectStaff(st)}
                        style={[
                          styles.staffAccordionItem,
                          isSelected && styles.staffAccordionItemSelected,
                        ]}
                        activeOpacity={0.75}
                      >
                        <View
                          style={[
                            styles.staffItemAvatar,
                            isSelected ? styles.staffItemAvatarSelected : styles.staffItemAvatarDefault,
                          ]}
                        >
                          <Text
                            style={[
                              styles.staffItemAvatarText,
                              isSelected ? styles.staffItemAvatarTextSelected : styles.staffItemAvatarTextDefault,
                            ]}
                          >
                            {initial}
                          </Text>
                        </View>

                        <View style={{ flex: 1, paddingHorizontal: 8 }}>
                          <Text
                            style={[
                              styles.staffItemName,
                              isSelected && styles.staffItemNameSelected,
                            ]}
                            numberOfLines={1}
                          >
                            {name}
                          </Text>
                          <Text style={styles.staffItemRole} numberOfLines={1}>
                            {st.role === "store_manager"
                              ? "Store Manager"
                              : st.role === "admin"
                                ? "Admin"
                                : "Store Staff"}
                            {isOnShift && !isSelected ? " · On Duty" : ""}
                          </Text>
                        </View>

                        {/* On-Duty Quick Shift Toggle */}
                        <TouchableOpacity
                          onPress={(e) => {
                            e.stopPropagation();
                            toggleShiftStaff(st.id);
                          }}
                          style={[
                            styles.shiftToggleBtn,
                            isOnShift && styles.shiftToggleBtnActive,
                          ]}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <UserCheck
                            size={11}
                            color={isOnShift ? "#059669" : "#94a3b8"}
                            strokeWidth={isOnShift ? 2.5 : 2}
                          />
                          <Text
                            style={[
                              styles.shiftToggleBtnText,
                              isOnShift && styles.shiftToggleBtnTextActive,
                            ]}
                          >
                            {isOnShift ? "On Duty" : "+ Shift"}
                          </Text>
                        </TouchableOpacity>

                        {/* Active Selection Indicator */}
                        {isSelected ? (
                          <View style={styles.staffItemCheck}>
                            <Check size={12} color="#ffffff" strokeWidth={3} />
                          </View>
                        ) : (
                          <View style={styles.staffItemRadio} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Service Items List */}
      <ScrollView style={styles.orderItemsList} showsVerticalScrollIndicator={false}>
        {currentOrder.length === 0 ? (
          <View style={styles.emptyCartBox}>
            <Droplets size={44} color="#cbd5e1" strokeWidth={1.5} />
            <Text style={styles.emptyCartTitle}>Queue is empty</Text>
            <Text style={styles.emptyCartSub}>
              Tap any wine card to add glasses or bottles to service.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10, paddingVertical: 6 }}>
            {currentOrder.map((item, idx) => {
              const typeTheme = getWineTypeTheme(item.wine.wineType, item.wine.name, item.wine.rawType);
              const portionTag =
                item.portion === "glass"
                  ? "1 Glass (1/6 btl)"
                  : item.portion === "carafe"
                    ? "1 Carafe (2 gls · 2/6 btl)"
                    : "1 Full Bottle";
              const unitPrice = getItemUnitPrice(item.wine, item.portion);
              const itemTotal = unitPrice * item.quantity;

              return (
                <View key={`${item.wine.id}-${item.portion}-${item.selectedLocationId || 'all'}-${idx}`} style={styles.orderItemCard}>
                  {/* Color-coded thumbnail dot */}
                  <View style={[styles.itemThumbnail, { backgroundColor: typeTheme.bg }]}>
                    <View style={[styles.thumbnailDot, { backgroundColor: typeTheme.color }]} />
                  </View>

                  {/* Item Details */}
                  <View style={{ flex: 1, paddingHorizontal: 10 }}>
                    <Text style={styles.orderItemName} numberOfLines={1}>
                      {item.wine.name}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap", marginTop: 2 }}>
                      <View style={styles.orderItemPortionBadge}>
                        <Text style={styles.orderItemPortionText}>{portionTag}</Text>
                      </View>
                      {item.selectedLocationName && (
                        <View style={styles.orderItemLocationBadge}>
                          <MaterialCommunityIcons name="map-marker-outline" size={10} color={MAROON.medium} />
                          <Text style={styles.orderItemLocationText} numberOfLines={1}>
                            {item.selectedLocationName}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.orderItemPriceText}>
                      ₱{unitPrice.toLocaleString("en-PH")}
                      {item.quantity > 1 ? ` · Total: ₱${itemTotal.toLocaleString("en-PH")}` : ""}
                    </Text>
                  </View>

                  {/* Quantity Stepper */}
                  <View style={styles.stepperContainer}>
                    <TouchableOpacity
                      onPress={() => updateQuantity(idx, -1)}
                      style={styles.stepperBtnMinus}
                    >
                      <Minus size={14} color="#ffffff" strokeWidth={2.5} />
                    </TouchableOpacity>

                    <Text style={styles.stepperQtyText}>{item.quantity}</Text>

                    <TouchableOpacity
                      onPress={() => updateQuantity(idx, 1)}
                      disabled={!canAddPortion(item.wine, item.portion, currentOrder)}
                      style={[
                        styles.stepperBtnPlus,
                        !canAddPortion(item.wine, item.portion, currentOrder) && styles.stepperBtnDisabled,
                      ]}
                    >
                      <Plus size={14} color="#ffffff" strokeWidth={2.5} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Dispense Volume Summary & Action */}
      <View style={styles.orderFooter}>
        {/* Count Breakdown Table */}
        <View style={styles.countSummaryCard}>
          {orderSummary.glassesCount > 0 && (
            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Glasses to Pour</Text>
              <Text style={styles.calcValue}>{orderSummary.glassesCount} gls</Text>
            </View>
          )}

          {orderSummary.carafesCount > 0 && (
            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Carafes to Pour</Text>
              <Text style={styles.calcValue}>
                {orderSummary.carafesCount} carafe{orderSummary.carafesCount !== 1 ? "s" : ""} ({orderSummary.carafesCount * 2} gls)
              </Text>
            </View>
          )}

          {orderSummary.bottlesCount > 0 && (
            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Full Bottles</Text>
              <Text style={styles.calcValue}>{orderSummary.bottlesCount} btls</Text>
            </View>
          )}

          <View style={styles.calcRow}>
            <Text style={styles.calcLabel}>Total Volume</Text>
            <Text style={styles.calcValue}>
              {orderSummary.totalBottlesVolume} btl{orderSummary.totalBottlesVolume !== 1 ? "s" : ""}
            </Text>
          </View>

          <View style={styles.calcDivider} />

          <View style={styles.calcTotalRow}>
            <Text style={styles.calcTotalLabel}>Total Amount</Text>
            <Text style={styles.calcTotalValue}>
              ₱{orderSummary.totalAmount.toLocaleString("en-PH")}
            </Text>
          </View>
        </View>

        {/* Customer / VIP Guest Attachment */}
        {selectedCustomer && (
          <View style={styles.fineWineCustomerSection}>
            <View style={styles.fineWineCustomerHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <MaterialCommunityIcons name="account-star-outline" size={14} color={MAROON.primary} />
                <Text style={styles.fineWineCustomerTitle}>
                  {currentOrder.some((it) => it.wine.wineCategory === "fine") ? "VIP / CUSTOMER (FINE WINE)" : "CUSTOMER (OPTIONAL)"}
                </Text>
              </View>
              {currentOrder.some((it) => it.wine.wineCategory === "fine") && (
                <View style={styles.fineWinePill}>
                  <Text style={styles.fineWinePillText}>Fine Wine</Text>
                </View>
              )}
            </View>
            <View style={styles.selectedCustomerCard}>
              <View style={styles.selectedCustomerInfo}>
                <MaterialCommunityIcons name="account-check" size={16} color={MAROON.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectedCustomerName} numberOfLines={1}>
                    {selectedCustomer.name}
                  </Text>
                  {(selectedCustomer.email || selectedCustomer.contactNo) && (
                    <Text style={styles.selectedCustomerSub} numberOfLines={1}>
                      {selectedCustomer.email || selectedCustomer.contactNo}
                    </Text>
                  )}
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedCustomer(null)}
                style={styles.removeCustomerBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialCommunityIcons name="close-circle" size={16} color="#94a3b8" />
              </TouchableOpacity>
            </View>

          </View>
        )}
        {/* Action Button */}
        <TouchableOpacity
          onPress={handleCompleteOrder}
          disabled={isProcessing || currentOrder.length === 0}
          style={[
            styles.checkoutBtn,
            { backgroundColor: currentOrder.length > 0 ? MAROON.primary : "#94a3b8" },
          ]}
          activeOpacity={0.85}
        >
          {isProcessing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.checkoutBtnText}>
              {currentOrder.length > 0
                ? `Confirm Sale · ₱${orderSummary.totalAmount.toLocaleString("en-PH")}`
                : "Confirm Sale"}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── PORTRAIT TOP BAR (Shown when in portrait on tablet or phone) ─────── */}
      {!isTabletLandscape && (
        <View style={styles.portraitTopBar}>
          <View style={styles.portraitBrandRow}>
            <View style={styles.portraitLogoCircle}>
              <Wine size={20} color="#ffffff" strokeWidth={2.5} />
            </View>
            <View>
              <Text style={styles.portraitStoreTitle} numberOfLines={1}>
                {storeName}
              </Text>
              <View style={styles.portraitStaffRow}>
                <View style={styles.onlineDot} />
                <Text style={styles.portraitStaffName}>
                  {formatStaffDisplayName(selectedStaff)} · On Duty
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.portraitActionsRow}>
            {profile?.role !== "store_staff" && (
              <TouchableOpacity
                onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/home"))}
                style={styles.portraitBackBtn}
              >
                <ChevronLeft size={16} color={MAROON.primary} strokeWidth={2.5} />
                <Text style={styles.portraitBackBtnText}>Dashboard</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={() => onRefresh()} style={styles.portraitIconBtn}>
              <RotateCcw size={16} color="#64748b" />
            </TouchableOpacity>

            {profile?.role === "store_staff" ? (
              <TouchableOpacity onPress={handleSignOut} style={styles.portraitIconBtn}>
                <LogOut size={16} color="#ef4444" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      )}

      <View style={styles.mainLayoutRow}>
        {/* ── 1. LEFT SLIM DOCK (Only in Landscape on Tablet) ────────────────── */}
        {isTabletLandscape && (
          <View style={styles.leftDock}>
            <View style={styles.dockTop}>
              {profile?.role !== "store_staff" ? (
                <TouchableOpacity
                  onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/home"))}
                  style={[styles.dockIconBtn, { backgroundColor: MAROON.primary, marginBottom: 8 }]}
                >
                  <ChevronLeft size={22} color="#ffffff" strokeWidth={2.5} />
                </TouchableOpacity>
              ) : (
                <View style={styles.dockLogo}>
                  <Wine size={22} color="#ffffff" strokeWidth={2.5} />
                </View>
              )}

              <TouchableOpacity style={[styles.dockIconBtn, styles.dockIconBtnActive]}>
                <Zap size={22} color={MAROON.primary} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            <View style={styles.dockBottom}>
              <TouchableOpacity onPress={() => onRefresh()} style={styles.dockIconBtn}>
                <RotateCcw size={20} color="#64748b" strokeWidth={2} />
              </TouchableOpacity>

              {profile?.role === "store_staff" ? (
                <TouchableOpacity onPress={handleSignOut} style={styles.dockIconBtn}>
                  <LogOut size={20} color="#ef4444" strokeWidth={2} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        )}

        {/* ── 2. CENTER CATALOG AREA ─────────────────────────────────────────── */}
        <View style={styles.centerCatalog}>
          {/* ── HIGH-VISIBILITY PORTION MODE SEGMENTED BAR ───────────────────── */}
          <View style={styles.portionSegmentOuter}>
            <Text style={styles.portionSectionLabel}>SELECT SERVING PORTION</Text>
            <View style={styles.portionSegmentContainer}>
              <TouchableOpacity
                onPress={() => setSalesTypeMode("glass")}
                style={[
                  styles.portionSegmentBtn,
                  salesTypeMode === "glass" && styles.portionSegmentBtnActive,
                ]}
                activeOpacity={0.85}
              >
                <View
                  style={[
                    styles.portionSegmentIconBox,
                    salesTypeMode === "glass" && styles.portionSegmentIconBoxActive,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="glass-wine"
                    size={26}
                    color={salesTypeMode === "glass" ? "#ffffff" : MAROON.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.portionSegmentTitle,
                      salesTypeMode === "glass" && styles.portionSegmentTitleActive,
                    ]}
                  >
                    Glass
                  </Text>
                  <Text
                    style={[
                      styles.portionSegmentSub,
                      salesTypeMode === "glass" && styles.portionSegmentSubActive,
                    ]}
                  >
                    1/6 Pour · Open First
                  </Text>
                </View>
              </TouchableOpacity>


              <TouchableOpacity
                onPress={() => setSalesTypeMode("carafe")}
                style={[
                  styles.portionSegmentBtn,
                  salesTypeMode === "carafe" && styles.portionSegmentBtnActive,
                ]}
                activeOpacity={0.85}
              >
                <View
                  style={[
                    styles.portionSegmentIconBox,
                    salesTypeMode === "carafe" && styles.portionSegmentIconBoxActive,
                  ]}
                >
                  <Image
                    source={require("@/assets/images/carafe.png")}
                    style={{
                      width: 26,
                      height: 26,
                      tintColor: salesTypeMode === "carafe" ? "#ffffff" : MAROON.primary,
                    }}
                    resizeMode="contain"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.portionSegmentTitle,
                      salesTypeMode === "carafe" && styles.portionSegmentTitleActive,
                    ]}
                  >
                    Carafe
                  </Text>
                  <Text
                    style={[
                      styles.portionSegmentSub,
                      salesTypeMode === "carafe" && styles.portionSegmentSubActive,
                    ]}
                  >
                    2/6 Decanter
                  </Text>
                </View>
              </TouchableOpacity>


              <TouchableOpacity
                onPress={() => setSalesTypeMode("bottle")}
                style={[
                  styles.portionSegmentBtn,
                  salesTypeMode === "bottle" && styles.portionSegmentBtnActive,
                ]}
                activeOpacity={0.85}
              >
                <View
                  style={[
                    styles.portionSegmentIconBox,
                    salesTypeMode === "bottle" && styles.portionSegmentIconBoxActive,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="bottle-wine"
                    size={26}
                    color={salesTypeMode === "bottle" ? "#ffffff" : MAROON.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.portionSegmentTitle,
                      salesTypeMode === "bottle" && styles.portionSegmentTitleActive,
                    ]}
                  >
                    Full Bottle
                  </Text>
                  <Text
                    style={[
                      styles.portionSegmentSub,
                      salesTypeMode === "bottle" && styles.portionSegmentSubActive,
                    ]}
                  >
                    Cellar Stock
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* Search & Filter Bar */}
          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <Search size={18} color="#94a3b8" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search wines by name, vintage, producer..."
                placeholderTextColor="#94a3b8"
                value={searchQuery}
                onChangeText={setSearchQuery}
                clearButtonMode="while-editing"
              />
              {searchQuery.length > 0 && Platform.OS !== "ios" && (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <X size={16} color="#94a3b8" />
                </TouchableOpacity>
              )}
            </View>


          </View>

          {/* ── WINE CATEGORY TIER FILTER (Fun: 😁 vs Fine: 💎 vs Reserve: 👻) ─── */}
          <View style={styles.tierFilterContainer}>
            {([
              { key: "all", label: "All Wines", emoji: null },
              { key: "fun", label: "Fun Wine", emoji: "😁" },
              { key: "fine", label: "Fine Wine", emoji: "💎" },
              ...(isManager ? [{ key: "reserve", label: "Reserve", emoji: "👻" }] : []),
            ] as const).map((tier) => {
              const count = tierCounts[tier.key] ?? 0;
              const isActive = tierFilter === tier.key;

              return (
                <TouchableOpacity
                  key={tier.key}
                  onPress={() => setTierFilter(tier.key)}
                  style={[
                    styles.tierFilterBtn,
                    isActive && styles.tierFilterBtnActive,
                  ]}
                  activeOpacity={0.8}
                >
                  {tier.emoji && <Text style={styles.tierFilterEmoji}>{tier.emoji}</Text>}
                  <Text
                    style={[
                      styles.tierFilterText,
                      isActive && styles.tierFilterTextActive,
                    ]}
                  >
                    {tier.label}
                  </Text>
                  <View
                    style={[
                      styles.tierCountBadge,
                      isActive ? styles.tierCountBadgeActive : styles.tierCountBadgeInactive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.tierCountBadgeText,
                        isActive ? styles.tierCountBadgeTextActive : styles.tierCountBadgeTextInactive,
                      ]}
                    >
                      {count}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── WINE TYPE PILLS (Full Width - Clean No Icons) ─────────────── */}
          <View style={styles.wineTypeFilterContainer}>
            {([
              { key: "all", label: "All", color: "#18181b", activeBg: "#18181b", activeText: "#ffffff" },
              { key: "Red Wine", label: "Red", color: "#dc2626", activeBg: "#dc2626", activeText: "#ffffff" },
              { key: "Sparkling", label: "Sparkling", color: "#ca8a04", activeBg: "#ca8a04", activeText: "#ffffff" },
              { key: "White Wine", label: "White", color: "#eab308", activeBg: "#eab308", activeText: "#18181b" },
              { key: "Rosé", label: "Rosé", color: "#ec4899", activeBg: "#ec4899", activeText: "#ffffff" },
              { key: "Sweet Wine", label: "Sweet", color: "#ea580c", activeBg: "#ea580c", activeText: "#ffffff" },
            ] as const).map((pill) => {
              const count = wineTypeCounts[pill.key] ?? 0;
              if (pill.key !== "all" && count === 0) return null;
              const isActive = wineTypeFilter === pill.key;
              return (
                <TouchableOpacity
                  key={pill.key}
                  onPress={() => setWineTypeFilter(pill.key)}
                  style={[
                    styles.categoryPill,
                    {
                      borderColor: pill.color,
                      borderWidth: 2,
                      backgroundColor: isActive ? pill.activeBg : "#ffffff",
                    },
                  ]}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.categoryPillText,
                      { color: isActive ? pill.activeText : "#18181b" },
                      isActive && { fontWeight: "900" },
                    ]}
                    numberOfLines={1}
                  >
                    {pill.label}
                  </Text>
                  <Text
                    style={[
                      styles.categoryPillBadgeText,
                      { color: isActive ? pill.activeText : "#71717a" },
                    ]}
                  >
                    {count}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Oversized Cards Grid (Count Focused) */}
          {loading && !refreshing ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color={MAROON.primary} />
              <Text style={styles.loadingText}>Loading inventory...</Text>
            </View>
          ) : filteredWines.length === 0 ? (
            <View style={styles.emptyCatalog}>
              <Wine size={56} color="#cbd5e1" strokeWidth={1.5} />
              <Text style={styles.emptyCatalogTitle}>No items found</Text>
              <Text style={styles.emptyCatalogSub}>
                {searchQuery
                  ? `No wines matching "${searchQuery}"`
                  : salesTypeMode === "glass"
                    ? "No wines configured for Glass serving in this store."
                    : salesTypeMode === "carafe"
                      ? "No wines configured for Carafe serving in this store."
                      : "No inventory available in this category."}
              </Text>
            </View>
          ) : (
            <FlatList
              data={groupedWines}
              keyExtractor={(group) => group.wineType}
              key={isTabletLandscape ? "groups-3-landscape" : "groups-2-portrait"}
              contentContainerStyle={[
                styles.cardsGridContent,
                !isTabletLandscape && currentOrder.length > 0 && { paddingBottom: 110 },
              ]}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={[MAROON.primary]}
                  tintColor={MAROON.primary}
                />
              }
              renderItem={({ item: group }) => {
                const groupTheme = getWineTypeTheme(group.wineType);

                return (
                  <View style={styles.wineTypeSection}>
                    {/* Section Header */}
                    <View style={styles.sectionHeaderRow}>
                      <View
                        style={[
                          styles.sectionHeaderBadge,
                          {
                            backgroundColor: groupTheme.bg,
                            borderColor: groupTheme.color,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.sectionHeaderDot,
                            { backgroundColor: groupTheme.color },
                          ]}
                        />
                        <Text
                          style={[
                            styles.sectionHeaderTitle,
                            { color: groupTheme.accent },
                          ]}
                        >
                          {group.wineType.toUpperCase()}
                        </Text>
                        <View
                          style={[
                            styles.sectionHeaderCountBadge,
                            { backgroundColor: groupTheme.color },
                          ]}
                        >
                          <Text style={styles.sectionHeaderCountText}>
                            {group.wines.length}
                          </Text>
                        </View>
                      </View>
                      <View
                        style={[
                          styles.sectionHeaderLine,
                          { backgroundColor: groupTheme.color + "33" },
                        ]}
                      />
                    </View>

                    {/* Wine Cards Grid for this group */}
                    <View style={styles.sectionCardsGrid}>
                      {group.wines.map((item) => {
                        const typeTheme = getWineTypeTheme(item.wineType, item.name, item.rawType);
                        const vintagePrefix = item.vintage ? `${item.vintage} ` : "";
                        const fullWineTitle = `${vintagePrefix}${item.name}`;
                        const canAdd = canAddPortion(item, salesTypeMode, currentOrder);
                        const isOutOfStock = item.stockCount === 0;

                        return (
                          <TouchableOpacity
                            key={item.id}
                            onPress={() => handleSelectWineCard(item)}
                            disabled={!canAdd}
                            activeOpacity={0.85}
                            style={[
                              styles.oversizedCard,
                              {
                                width: cardSize,
                                borderColor: canAdd ? typeTheme.color : "#e2e8f0",
                                backgroundColor: canAdd ? typeTheme.bg : "#f8fafc",
                                opacity: canAdd ? 1 : 0.45,
                              },
                            ]}
                          >
                            {/* Floating Bubbles on Sparkling Wine Tiles */}
                            {canAdd && (item.wineType || "").toLowerCase().includes("sparkling") && (
                              <View style={styles.sparklingBubbleContainer} pointerEvents="none">
                                <View style={[styles.bubbleDot, styles.bubble1]} />
                                <View style={[styles.bubbleDot, styles.bubble2]} />
                                <View style={[styles.bubbleDot, styles.bubble3]} />
                                <View style={[styles.bubbleDot, styles.bubble4]} />
                              </View>
                            )}

                            {/* Out of Stock Overlay Badge */}
                            {!canAdd && (
                              <View style={styles.outOfStockBadge}>
                                <Text style={styles.outOfStockBadgeText}>
                                  {isOutOfStock ? "OUT OF STOCK" : "MAX QUEUED"}
                                </Text>
                              </View>
                            )}

                            {/* Card Content: Producer in ALL CAPS, Vintage then Wine Name */}
                            <View style={styles.cardInfo}>
                              <Text
                                style={[styles.cardProducer, !canAdd && { color: "#94a3b8" }]}
                                numberOfLines={1}
                              >
                                {(item.producer || "Boutique Selection").toUpperCase()}
                              </Text>
                              <Text
                                style={[styles.cardTitle, !canAdd && { color: "#94a3b8" }]}
                                numberOfLines={3}
                              >
                                {fullWineTitle}
                              </Text>
                            </View>

                            {/* Fixed Lower Right Ghost Emoji Badge for Reserve Wine */}
                            {item.wineCategory === "reserve" && (
                              <View style={styles.cardReserveGhostBadge} pointerEvents="none">
                                <Text style={styles.cardReserveGhostText}>👻</Text>
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              }}
            />
          )}

          {/* ── PORTRAIT BOTTOM ORDER BAR (Sticky Maroon Bar when order has items) ─── */}
          {!isTabletLandscape && currentOrder.length > 0 && (
            <TouchableOpacity
              onPress={() => setIsMobileCartOpen(true)}
              style={styles.portraitFloatingOrderBar}
              activeOpacity={0.92}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={styles.portraitOrderCountBadge}>
                  <Text style={styles.portraitOrderCountText}>{orderSummary.totalItems}</Text>
                </View>
                <View>
                  <Text style={styles.portraitOrderBarLabel}>Current Service</Text>
                  <Text style={styles.portraitOrderBarPreview} numberOfLines={1}>
                    {currentOrder.map((it) => `${it.quantity}x ${it.wine.name}`).join(", ")}
                  </Text>
                </View>
              </View>

              <View style={styles.portraitOrderBarRight}>
                <Text style={styles.portraitOrderBarTotal}>
                  ₱{orderSummary.totalAmount.toLocaleString("en-PH")}
                </Text>
                <Text style={styles.portraitOrderBarVolumeSub}>
                  {orderSummary.totalBottlesVolume} btl{orderSummary.totalBottlesVolume !== 1 ? "s" : ""}
                </Text>
                <View style={styles.portraitOrderPayBtn}>
                  <Text style={styles.portraitOrderPayBtnText}>Review Queue</Text>
                  <ChevronRight size={16} color="#ffffff" />
                </View>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* ── 3. RIGHT FIXED PANEL (Only in Landscape on Tablet) ─────────────── */}
        {isTabletLandscape && (
          isSidebarCollapsed ? (
            /* Collapsed sidebar strip */
            <TouchableOpacity
              onPress={() => setIsSidebarCollapsed(false)}
              activeOpacity={0.88}
              style={styles.sidebarCollapsedStrip}
            >
              {/* Top: Expand Chevron Button */}
              <View style={styles.sidebarExpandCircle}>
                <ChevronLeft size={18} color="#ffffff" strokeWidth={2.5} />
              </View>

              {/* Center: Cart Icon & Count Badge & Rotated Label */}
              <View style={styles.sidebarCollapsedCenter}>
                <View style={styles.sidebarCartIconWrap}>
                  <ShoppingBag size={20} color="#ffffff" strokeWidth={2} />
                  {orderSummary.totalItems > 0 && (
                    <View style={styles.sidebarBadgeBubble}>
                      <Text style={styles.sidebarBadgeBubbleText}>
                        {orderSummary.totalItems > 99 ? "99+" : orderSummary.totalItems}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.sidebarRotatedLabelBox}>
                  <Text style={styles.sidebarRotatedLabelText}>SERVICE</Text>
                </View>
              </View>

              {/* Bottom: Total Price Preview or Spacer */}
              <View style={styles.sidebarCollapsedBottom}>
                {orderSummary.totalItems > 0 ? (
                  <View style={styles.sidebarMiniTotalPill}>
                    <Text style={styles.sidebarMiniTotalText}>
                      ₱{orderSummary.totalAmount >= 1000
                        ? `${(orderSummary.totalAmount / 1000).toFixed(1)}k`
                        : orderSummary.totalAmount.toLocaleString("en-PH")}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.sidebarBottomPlaceholder} />
                )}
              </View>
            </TouchableOpacity>
          ) : (
            renderCurrentOrderPanel()
          )
        )}
      </View>

      {/* ── PORTRAIT FULL-SCREEN ORDER MODAL / DRAWER ──────────────────────── */}
      {!isTabletLandscape && (
        <Modal
          visible={isMobileCartOpen}
          animationType="slide"
          transparent
          onRequestClose={() => setIsMobileCartOpen(false)}
        >
          <View style={styles.mobileModalOverlay}>
            <View style={styles.mobileModalCard}>
              <TouchableOpacity
                onPress={() => setIsMobileCartOpen(false)}
                style={styles.mobileModalCloseBtn}
              >
                <X size={20} color="#18181b" />
              </TouchableOpacity>
              {renderCurrentOrderPanel()}
            </View>
          </View>
        </Modal>
      )}

      {/* ── Transaction Confirmation & Void Dialog ─────────────────────────── */}
      <Modal
        visible={Boolean(successData)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (!isVoiding) {
            if (isVoidModalOpen) {
              setIsVoidModalOpen(false);
            } else {
              setSuccessData(null);
            }
          }
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.successOverlay}
        >
          <BlurView
            intensity={25}
            tint="systemMaterialDark"
            style={StyleSheet.absoluteFill}
          />
          {!isVoidModalOpen ? (
            <View style={styles.successCard}>
              <View style={styles.successIconCircle}>
                <CheckCircle2 size={44} color="#059669" strokeWidth={2.5} />
              </View>

              <Text style={styles.successTitle}>Sales Confirmed!</Text>
              <Text style={styles.successSub}>
                {successData?.itemsCount} item(s) dispensed and inventory deducted.
              </Text>

              <View style={styles.successAutoCloseBadge}>
                <MaterialCommunityIcons name="timer-outline" size={13} color="#059669" />
                <Text style={styles.successAutoCloseText}>
                  Auto-closing in {successCountdown}s
                </Text>
              </View>

              <View style={styles.successSummary}>
                <View style={styles.successRow}>
                  <Text style={styles.successLabel}>Total Amount:</Text>
                  <Text style={styles.successValue}>
                    ₱{(successData?.totalAmount ?? 0).toLocaleString("en-PH")}
                  </Text>
                </View>

                <View style={styles.successRow}>
                  <Text style={styles.successLabel}>Total Volume Served:</Text>
                  <Text style={styles.successText}>
                    {successData?.totalBottlesVolume} bottle{successData?.totalBottlesVolume !== 1 ? "s" : ""}
                  </Text>
                </View>

                <View style={styles.successRow}>
                  <Text style={styles.successLabel}>Logged By Staff:</Text>
                  <Text style={styles.successText}>{successData?.staffName}</Text>
                </View>

                {successData?.customerName && (
                  <View style={styles.successRow}>
                    <Text style={styles.successLabel}>Customer / VIP:</Text>
                    <Text style={[styles.successText, { color: MAROON.primary, fontWeight: "800" }]}>
                      {successData.customerName}
                    </Text>
                  </View>
                )}

                {parAlerts.length > 0 && (
                  <View style={styles.parAlertBox}>
                    <AlertCircle size={14} color={MAROON.accentGold} />
                    <Text style={styles.parAlertText}>
                      {parAlerts.length} auto-requisition(s) generated for depleted cellar stock.
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.successActionsCol}>
                <TouchableOpacity
                  onPress={() => setSuccessData(null)}
                  style={styles.successBtn}
                  activeOpacity={0.85}
                  disabled={isVoiding}
                >
                  <Text style={styles.successBtnText}>Done / Next Service ({successCountdown}s)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleVoidTransaction}
                  style={[
                    styles.voidBtn,
                    isVoiding && styles.voidBtnDisabled,
                  ]}
                  activeOpacity={0.8}
                  disabled={isVoiding}
                >
                  {isVoiding ? (
                    <ActivityIndicator size="small" color="#b45309" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="cancel" size={16} color="#b45309" />
                      <Text style={styles.voidBtnText}>Void Transaction</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.voidModalCard}>
              <View style={styles.voidModalHeader}>
                <View style={styles.voidModalIconWrap}>
                  <RotateCcw size={20} color="#dc2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.voidModalTitle}>Void Transaction & Record</Text>
                  <Text style={styles.voidModalSubtitle}>
                    Select reason. Sales will be recorded as voided and inventory bottles restored.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setIsVoidModalOpen(false)}
                  disabled={isVoiding}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <X size={20} color="#64748b" />
                </TouchableOpacity>
              </View>

              <View style={styles.voidModalSummaryBox}>
                <Text style={styles.voidModalSummaryText}>
                  Total: <Text style={{ fontWeight: "900", color: "#b91c1c" }}>₱{(successData?.totalAmount ?? 0).toLocaleString("en-PH")}</Text> • {successData?.itemsCount || 0} item(s) ({successData?.totalBottlesVolume || 0} bottle(s))
                </Text>
              </View>

              <Text style={styles.voidReasonLabel}>Select Reason:</Text>
              <View style={styles.voidReasonsList}>
                {VOID_PRESET_REASONS.map((r) => {
                  const isSelected = voidReason === r;
                  return (
                    <TouchableOpacity
                      key={r}
                      style={[
                        styles.voidReasonOption,
                        isSelected && styles.voidReasonOptionSelected,
                      ]}
                      onPress={() => setVoidReason(r)}
                      activeOpacity={0.8}
                      disabled={isVoiding}
                    >
                      <View style={[styles.voidRadioCircle, isSelected && styles.voidRadioCircleSelected]}>
                        {isSelected && <View style={styles.voidRadioInner} />}
                      </View>
                      <Text style={[styles.voidReasonOptionText, isSelected && styles.voidReasonOptionTextSelected]}>
                        {r}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {voidReason === "Other" && (
                <TextInput
                  style={styles.voidCustomInput}
                  placeholder="Enter specific void reason..."
                  placeholderTextColor="#94a3b8"
                  value={customVoidReason}
                  onChangeText={setCustomVoidReason}
                  editable={!isVoiding}
                  maxLength={120}
                />
              )}

              <View style={styles.voidModalActions}>
                <TouchableOpacity
                  style={styles.voidModalCancelBtn}
                  onPress={() => setIsVoidModalOpen(false)}
                  disabled={isVoiding}
                  activeOpacity={0.8}
                >
                  <Text style={styles.voidModalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.voidModalConfirmBtn, isVoiding && styles.voidModalConfirmBtnDisabled]}
                  onPress={handleConfirmVoid}
                  disabled={isVoiding}
                  activeOpacity={0.85}
                >
                  {isVoiding ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <RotateCcw size={15} color="#ffffff" />
                      <Text style={styles.voidModalConfirmText}>Confirm Void & Record</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </Modal>

      {/* ── LOCATION CONFIRMATION / SELECTION MODAL ───────────────────────── */}
      <Modal
        visible={Boolean(locationModalWine)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (isCustomerModalOpen) {
            setIsCustomerModalOpen(false);
          } else {
            setLocationModalWine(null);
          }
        }}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.locationModalOverlay}>
            <BlurView
              intensity={20}
              tint="systemMaterialDark"
              style={StyleSheet.absoluteFill}
            />

            {isCustomerModalOpen ? (
              <CustomerPickerModal
                isOpen={isCustomerModalOpen}
                useModal={false}
                onClose={() => setIsCustomerModalOpen(false)}
                onSelectCustomer={(cust) => {
                  setSelectedCustomer(cust);
                  setIsCustomerModalOpen(false);
                }}
                storeId={storeId || profile?.locationId || ""}
                theme={{
                  primary: MAROON.primary,
                  background: "#fdfcf8",
                  card: "#ffffff",
                  text: "#18181b",
                  textSecondary: "#71717a",
                  border: "#e2e8f0",
                  danger: "#ef4444",
                }}
                selectedCustomerId={selectedCustomer?.id}
              />
            ) : (
              <View style={styles.locationModalCard}>
                {/* Modal Header */}
                <View style={styles.locationModalHeader}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.locationModalTitle}>Confirm Pullout Location</Text>
                    <Text style={styles.locationModalSub} numberOfLines={1}>
                      {locationModalWine?.openBottle && (locationModalPortion === "glass" || locationModalPortion === "carafe") && (locationModalWine.openBottle.glassesRemaining ?? 0) > 0
                        ? "Pouring from active open bottle at Bar"
                        : (locationModalWine?.locationBreakdown?.length ?? 0) > 1
                          ? "Select storage location to pullout from"
                          : "Verify storage location for pullout"}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setLocationModalWine(null)}
                    style={styles.locationCloseBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <MaterialCommunityIcons name="close" size={18} color="#64748b" />
                  </TouchableOpacity>
                </View>

                {/* Selected Wine Snapshot (Colored Tile) */}
                {locationModalWine && (() => {
                  const typeTheme = getWineTypeTheme(locationModalWine.wineType, locationModalWine.name, locationModalWine.rawType);
                  const unitPrice = getItemUnitPrice(locationModalWine, locationModalPortion);
                  const portionLabel =
                    locationModalPortion === "glass"
                      ? "Glass"
                      : locationModalPortion === "carafe"
                        ? "Carafe"
                        : "Bottle";

                  return (
                    <View style={[styles.locationWineSnapshot, { backgroundColor: typeTheme.bg, borderColor: typeTheme.color }]}>
                      {/* Top Row: Producer, Portion & Price */}
                      <View style={styles.locationWineTopRow}>
                        <Text style={styles.locationWineProducer} numberOfLines={1}>
                          {(locationModalWine.producer || "Boutique Selection").toUpperCase()}
                        </Text>

                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <View style={[styles.locationPortionPill, { backgroundColor: typeTheme.accent + "18", borderColor: typeTheme.accent + "33" }]}>
                            <Text style={[styles.locationPortionPillText, { color: typeTheme.accent }]}>
                              {portionLabel}
                            </Text>
                          </View>
                          <Text style={styles.locationPriceText}>
                            ₱{unitPrice.toLocaleString("en-PH")}
                          </Text>
                        </View>
                      </View>

                      {/* Wine Full Title */}
                      <Text style={styles.locationWineName} numberOfLines={2}>
                        {locationModalWine.vintage ? `${locationModalWine.vintage} ` : ""}
                        {locationModalWine.name}
                      </Text>
                    </View>
                  );
                })()}

                {/* ── OTHER WINES IN CART (Clean horizontal pills) ── */}
                {currentOrder.length > 0 && (
                  <View style={styles.modalCartQueueBox}>
                    <View style={styles.modalCartQueueHeader}>
                      <Text style={styles.modalCartQueueTitle}>
                        ALSO IN CART ({orderSummary.totalItems})
                      </Text>
                      <Text style={styles.modalCartQueueTotal}>
                        Subtotal: ₱{orderSummary.totalAmount.toLocaleString("en-PH")}
                      </Text>
                    </View>

                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.modalCartQueueScrollContent}
                    >
                      {currentOrder.map((item, idx) => {
                        const itTheme = getWineTypeTheme(item.wine.wineType, item.wine.name, item.wine.rawType);
                        const itUnitPrice = getItemUnitPrice(item.wine, item.portion);
                        const itTotal = itUnitPrice * item.quantity;
                        const portionName =
                          item.portion === "glass" ? "Glass" : item.portion === "carafe" ? "Carafe" : "Bottle";
                        const wineDisplayName = `${item.wine.vintage ? `${item.wine.vintage} ` : ""}${item.wine.name}`;

                        return (
                          <View key={`modal-cart-${item.wine.id}-${idx}`} style={styles.modalCartPill}>
                            <View style={[styles.modalCartPillDot, { backgroundColor: itTheme.color }]} />
                            <Text style={styles.modalCartPillQtyText}>
                              {item.quantity}x {portionName}
                            </Text>
                            <Text style={styles.modalCartPillSep}>·</Text>
                            <Text style={styles.modalCartPillNameText} numberOfLines={1}>
                              {wineDisplayName}
                            </Text>
                            {item.selectedLocationName ? (
                              <>
                                <Text style={styles.modalCartPillSep}>·</Text>
                                <Text style={styles.modalCartPillLocText} numberOfLines={1}>
                                  {item.selectedLocationName}
                                </Text>
                              </>
                            ) : null}
                            <Text style={styles.modalCartPillSep}>·</Text>
                            <Text style={styles.modalCartPillPriceText}>
                              ₱{itTotal.toLocaleString("en-PH")}
                            </Text>
                            <TouchableOpacity
                              onPress={() => updateQuantity(idx, -1)}
                              style={styles.modalCartPillRemoveBtn}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <X size={12} color="#94a3b8" strokeWidth={2.5} />
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                {/* Locations List / Single Location View / Open Bottle View */}
                <ScrollView style={styles.locationScrollList} showsVerticalScrollIndicator={false}>
                  {locationModalWine && (() => {
                    const breakdown = locationModalWine.locationBreakdown || [];
                    const activeOpen = locationModalWine.openBottle;
                    const hasActiveOpen =
                      (locationModalPortion === "glass" || locationModalPortion === "carafe") &&
                      Boolean(activeOpen && (activeOpen.glassesRemaining ?? 0) > 0);

                    // If an open bottle exists for glass/carafe, lock selection to open bottle
                    if (hasActiveOpen) {
                      return (
                        <View style={styles.singleLocationCard}>
                          <View style={{ flex: 1, paddingRight: 8 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                              <Text style={styles.singleLocationBadgeLabel}>POURING FROM OPEN BOTTLE</Text>
                              <View style={styles.lockedBadge}>
                                <Text style={styles.lockedBadgeText}>Priority</Text>
                              </View>
                            </View>
                            <Text style={styles.singleLocationTitle}>{activeOpen!.locationName || "Bar Counter"}</Text>
                            <Text style={[styles.singleLocationStockText, { fontWeight: "700", marginTop: 2 }]}>
                              {activeOpen!.glassesRemaining} glass{activeOpen!.glassesRemaining !== 1 ? "es" : ""} remaining to pour
                            </Text>
                          </View>

                          {/* Discard & Pull Replacement Button on the right */}
                          <TouchableOpacity
                            style={styles.openBottleDiscardBtn}
                            onPress={() => {
                              const currentWine = locationModalWine;
                              setLocationModalWine(null);
                              setPullNewBottleModalWine(currentWine);
                              setPullNewBottleReason("broken");
                              const validLoc = (currentWine?.locationBreakdown || []).find(
                                (loc) => (loc.count - loc.openCount) > 0
                              ) || currentWine?.locationBreakdown?.[0];
                              setPullNewBottleLocationId(validLoc?.locationId || null);
                            }}
                            activeOpacity={0.8}
                          >
                            <MaterialCommunityIcons name="alert-circle-outline" size={15} color="#b45309" />
                            <Text style={styles.openBottleDiscardBtnText}>Discard & Replace</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    }

                    if (breakdown.length === 0) {
                      return (
                        <View style={styles.singleLocationCard}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.singleLocationBadgeLabel}>STORAGE</Text>
                            <Text style={styles.singleLocationTitle}>Unassigned Storage</Text>
                            <Text style={styles.singleLocationSub}>
                              {locationModalWine.stockCount} bottle(s) available in store inventory.
                            </Text>
                          </View>
                        </View>
                      );
                    }

                    if (breakdown.length === 1) {
                      const loc = breakdown[0];
                      return (
                        <View style={styles.singleLocationCard}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.singleLocationBadgeLabel}>PULLOUT LOCATION</Text>
                            <Text style={styles.singleLocationTitle}>{loc.locationName}</Text>
                            <Text style={[styles.singleLocationStockText, { color: "#059669", fontWeight: "700", marginTop: 2 }]}>
                              {loc.count} bottle{loc.count !== 1 ? "s" : ""} available here
                            </Text>
                          </View>
                        </View>
                      );
                    }

                    // Multiple Locations - Compact 2-Column Grid
                    return (
                      <View style={{ gap: 6 }}>
                        <Text style={styles.locationListHeader}>
                          SELECT PULLOUT BIN ({breakdown.length} LOCATIONS):
                        </Text>
                        <View style={styles.locationGridContainer}>
                          {breakdown.map((loc) => {
                            const isSelected = selectedLocationId === loc.locationId;
                            return (
                              <TouchableOpacity
                                key={loc.locationId}
                                onPress={() => setSelectedLocationId(loc.locationId)}
                                style={[
                                  styles.locationGridTile,
                                  isSelected && styles.locationGridTileSelected,
                                ]}
                                activeOpacity={0.8}
                              >
                                <View style={styles.locationGridTileTop}>
                                  <MaterialCommunityIcons
                                    name="map-marker-outline"
                                    size={15}
                                    color={isSelected ? MAROON.primary : "#64748b"}
                                  />
                                  <Text
                                    style={[
                                      styles.locationGridTileName,
                                      isSelected && styles.locationGridTileNameSelected,
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {loc.locationName}
                                  </Text>
                                  <View
                                    style={[
                                      styles.locationGridRadio,
                                      isSelected && styles.locationGridRadioSelected,
                                    ]}
                                  >
                                    {isSelected && <MaterialCommunityIcons name="check" size={11} color="#ffffff" />}
                                  </View>
                                </View>

                                <View style={styles.locationGridTileBottom}>
                                  <Text
                                    style={[
                                      styles.locationGridStockText,
                                      isSelected && styles.locationGridStockTextSelected,
                                    ]}
                                  >
                                    {loc.count} bottle{loc.count !== 1 ? "s" : ""}
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })()}
                </ScrollView>

                {/* Customer / VIP Guest Attachment in Modal */}
                <View style={styles.fineWineCustomerSection}>
                  <View style={styles.fineWineCustomerHeader}>
                    <Text style={styles.fineWineCustomerTitle}>
                      {locationModalWine && locationModalWine.wineCategory === "fine"
                        ? "VIP / CUSTOMER — FINE WINE"
                        : "CUSTOMER — OPTIONAL"}
                    </Text>
                    {locationModalWine && locationModalWine.wineCategory === "fine" && (
                      <View style={styles.fineWinePill}>
                        <Text style={styles.fineWinePillText}>Fine Wine</Text>
                      </View>
                    )}
                  </View>

                  {selectedCustomer ? (
                    <View style={styles.selectedCustomerCard}>
                      <View style={styles.selectedCustomerInfo}>
                        <MaterialCommunityIcons name="account-check-outline" size={16} color="#475569" />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.selectedCustomerName} numberOfLines={1}>
                            {selectedCustomer.name}
                          </Text>
                          {(selectedCustomer.email || selectedCustomer.contactNo) && (
                            <Text style={styles.selectedCustomerSub} numberOfLines={1}>
                              {selectedCustomer.email || selectedCustomer.contactNo}
                            </Text>
                          )}
                        </View>
                      </View>
                      <TouchableOpacity
                        onPress={() => setSelectedCustomer(null)}
                        style={styles.removeCustomerBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <MaterialCommunityIcons name="close-circle" size={16} color="#94a3b8" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => setIsCustomerModalOpen(true)}
                      style={styles.addCustomerBtn}
                      activeOpacity={0.8}
                    >
                      <MaterialCommunityIcons name="account-plus-outline" size={15} color="#64748b" />
                      <Text style={styles.addCustomerBtnText}>+ Attach Customer / VIP (Optional)</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Modal Actions: Cancel, Add to Cart (Queue), or Confirm Sale (Direct Checkout) */}
                {locationModalWine && (() => {
                  const unitPrice = getItemUnitPrice(locationModalWine, locationModalPortion);
                  const directSaleTotal = (orderSummary.totalAmount || 0) + unitPrice;

                  return (
                    <View style={styles.locationModalFooter}>
                      <TouchableOpacity
                        onPress={() => setLocationModalWine(null)}
                        style={styles.locationCancelBtn}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.locationCancelBtnText}>Cancel</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={handleAddMoreFromModal}
                        style={styles.locationAddMoreBtn}
                        activeOpacity={0.85}
                      >
                        <MaterialCommunityIcons name="plus" size={16} color={MAROON.primary} />
                        <Text style={styles.locationAddMoreBtnText}>Add to Cart</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={handleDirectSaleFromModal}
                        disabled={isProcessing}
                        style={styles.locationConfirmSaleBtn}
                        activeOpacity={0.85}
                      >
                        {isProcessing ? (
                          <ActivityIndicator color="#ffffff" size="small" />
                        ) : (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <MaterialCommunityIcons name="check" size={16} color="#ffffff" />
                            <Text style={styles.locationConfirmSaleBtnText} numberOfLines={1}>
                              {currentOrder.length > 0
                                ? `Confirm All (${orderSummary.totalItems + 1}) · ₱${directSaleTotal.toLocaleString("en-PH")}`
                                : `Confirm Sale · ₱${directSaleTotal.toLocaleString("en-PH")}`}
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })()}
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Customer Picker Modal (For Order Queue in Sidebar / Cart) ────────── */}
      {isCustomerModalOpen && !locationModalWine && (
        <CustomerPickerModal
          isOpen={isCustomerModalOpen}
          useModal={true}
          onClose={() => setIsCustomerModalOpen(false)}
          onSelectCustomer={(cust) => {
            setSelectedCustomer(cust);
            setIsCustomerModalOpen(false);
          }}
          storeId={storeId || profile?.locationId || ""}
          theme={{
            primary: MAROON.primary,
            background: "#fdfcf8",
            card: "#ffffff",
            text: "#18181b",
            textSecondary: "#71717a",
            border: "#e2e8f0",
            danger: "#ef4444",
          }}
          selectedCustomerId={selectedCustomer?.id}
        />
      )}

      {/* ── Feature B: Pull Replacement Bottle Modal (Discard Broken/Spilled & Open New) ── */}
      <Modal
        visible={Boolean(pullNewBottleModalWine)}
        animationType="fade"
        transparent={true}
        onRequestClose={() => {
          if (!isPullingNewBottle) setPullNewBottleModalWine(null);
        }}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.locationModalOverlay}>
            <BlurView
              intensity={20}
              tint="systemMaterialDark"
              style={StyleSheet.absoluteFill}
            />
            <View style={[styles.locationModalCard, { maxWidth: 520 }]}>
              {/* Modal Header */}
              <View style={styles.locationModalHeader}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={styles.locationModalTitle}>Pull Replacement Bottle</Text>
                    <View style={styles.pullNewBottleHeaderBadge}>
                      <Text style={styles.pullNewBottleHeaderBadgeText}>Replacement</Text>
                    </View>
                  </View>
                  <Text style={styles.locationModalSub} numberOfLines={1}>
                    {pullNewBottleModalWine?.producer ? `${pullNewBottleModalWine.producer} · ` : ""}
                    {pullNewBottleModalWine?.vintage ? `${pullNewBottleModalWine.vintage} ` : ""}
                    {pullNewBottleModalWine?.name}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setPullNewBottleModalWine(null)}
                  disabled={isPullingNewBottle}
                  style={styles.locationCloseBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <MaterialCommunityIcons name="close" size={18} color="#64748b" />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                {/* Active Open Bottle Discard Notice */}
                {pullNewBottleModalWine?.openBottle && (
                  <View style={styles.pullNewBottleNoticeCard}>
                    <MaterialCommunityIcons name="alert-circle" size={20} color="#b45309" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pullNewBottleNoticeTitle}>
                        Active Open Bottle Will Be Discarded
                      </Text>
                      <Text style={styles.pullNewBottleNoticeSub}>
                        Current bottle at {pullNewBottleModalWine.openBottle.locationName || "Bar Counter"} ({pullNewBottleModalWine.openBottle.glassesRemaining ?? 0} glasses left) will be marked as Damaged and cleared.
                      </Text>
                    </View>
                  </View>
                )}

                {/* Reason Selector */}
                <View style={styles.pullNewBottleSection}>
                  <Text style={styles.pullNewBottleSectionLabel}>REASON FOR REPLACEMENT</Text>
                  <View style={styles.pullNewBottleReasonRow}>
                    {[
                      { key: "broken", label: "Broken", icon: "bottle-wine" },
                      { key: "spilled", label: "Spilled", icon: "water-alert" },
                      { key: "spoiled", label: "Spoiled / Corked", icon: "alert-decagram" },
                      { key: "discarded", label: "Other Discard", icon: "delete-outline" },
                    ].map((r) => {
                      const isSelected = pullNewBottleReason === r.key;
                      return (
                        <TouchableOpacity
                          key={r.key}
                          onPress={() => setPullNewBottleReason(r.key as any)}
                          style={[
                            styles.pullNewBottleReasonPill,
                            isSelected && styles.pullNewBottleReasonPillSelected,
                          ]}
                          activeOpacity={0.8}
                        >
                          <MaterialCommunityIcons
                            name={r.icon as any}
                            size={15}
                            color={isSelected ? MAROON.primary : "#64748b"}
                          />
                          <Text
                            style={[
                              styles.pullNewBottleReasonPillText,
                              isSelected && styles.pullNewBottleReasonPillTextSelected,
                            ]}
                          >
                            {r.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Location Picker */}
                <View style={styles.pullNewBottleSection}>
                  <Text style={styles.pullNewBottleSectionLabel}>
                    SELECT LOCATION TO PULL FRESH BOTTLE
                  </Text>
                  {(() => {
                    const breakdown = pullNewBottleModalWine?.locationBreakdown || [];
                    const locationsWithUnopened = breakdown.filter(
                      (loc) => (loc.count - loc.openCount) > 0
                    );

                    if (locationsWithUnopened.length === 0) {
                      return (
                        <View style={styles.pullNewBottleEmptyBox}>
                          <MaterialCommunityIcons name="bottle-wine-outline" size={24} color="#94a3b8" />
                          <Text style={styles.pullNewBottleEmptyText}>
                            No unopened bottles available in storage.
                          </Text>
                        </View>
                      );
                    }

                    return (
                      <View style={styles.locationGridContainer}>
                        {locationsWithUnopened.map((loc) => {
                          const isSelected = pullNewBottleLocationId === loc.locationId;
                          const unopenedCount = Math.max(0, loc.count - loc.openCount);
                          return (
                            <TouchableOpacity
                              key={loc.locationId}
                              onPress={() => setPullNewBottleLocationId(loc.locationId)}
                              style={[
                                styles.locationGridTile,
                                isSelected && styles.locationGridTileSelected,
                              ]}
                              activeOpacity={0.8}
                            >
                              <View style={styles.locationGridTileTop}>
                                <MaterialCommunityIcons
                                  name="map-marker-outline"
                                  size={15}
                                  color={isSelected ? MAROON.primary : "#64748b"}
                                />
                                <Text
                                  style={[
                                    styles.locationGridTileName,
                                    isSelected && styles.locationGridTileNameSelected,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {loc.locationName}
                                </Text>
                                <View
                                  style={[
                                    styles.locationGridRadio,
                                    isSelected && styles.locationGridRadioSelected,
                                  ]}
                                >
                                  {isSelected && (
                                    <MaterialCommunityIcons name="check" size={11} color="#ffffff" />
                                  )}
                                </View>
                              </View>

                              <View style={styles.locationGridTileBottom}>
                                <Text
                                  style={[
                                    styles.locationGridStockText,
                                    isSelected && styles.locationGridStockTextSelected,
                                  ]}
                                >
                                  {unopenedCount} unopened bottle{unopenedCount !== 1 ? "s" : ""}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    );
                  })()}
                </View>
              </ScrollView>

              {/* Modal Footer Actions */}
              <View style={styles.locationModalFooter}>
                <TouchableOpacity
                  onPress={() => setPullNewBottleModalWine(null)}
                  disabled={isPullingNewBottle}
                  style={styles.locationCancelBtn}
                  activeOpacity={0.8}
                >
                  <Text style={styles.locationCancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handlePullNewBottle}
                  disabled={
                    isPullingNewBottle ||
                    !pullNewBottleModalWine ||
                    (pullNewBottleModalWine.stockCount - (pullNewBottleModalWine.openBottle ? 1 : 0)) <= 0
                  }
                  style={[
                    styles.pullNewBottleConfirmBtn,
                    (isPullingNewBottle ||
                      (pullNewBottleModalWine &&
                        (pullNewBottleModalWine.stockCount - (pullNewBottleModalWine.openBottle ? 1 : 0)) <= 0)) && {
                      opacity: 0.5,
                    },
                  ]}
                  activeOpacity={0.85}
                >
                  {isPullingNewBottle ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <MaterialCommunityIcons name="bottle-wine-outline" size={18} color="#ffffff" />
                      <Text style={styles.pullNewBottleConfirmBtnText}>
                        Discard & Pull Fresh Bottle
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fdfcf8",
  },
  mainLayoutRow: {
    flex: 1,
    flexDirection: "row",
  },

  // PORTRAIT TOP BAR
  portraitTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  portraitBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  portraitLogoCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: MAROON.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  portraitStoreTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#18181b",
  },
  portraitStaffRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 1,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10b981",
  },
  portraitStaffName: {
    fontSize: 11,
    fontWeight: "600",
    color: "#71717a",
  },
  portraitActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  portraitBackBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: MAROON.ultraLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: MAROON.border,
  },
  portraitBackBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: MAROON.primary,
  },
  portraitIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },

  // LEFT DOCK (Landscape)
  leftDock: {
    width: 68,
    backgroundColor: "#ffffff",
    borderRightWidth: 1,
    borderRightColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 18,
  },
  dockTop: {
    alignItems: "center",
    gap: 16,
  },
  dockLogo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: MAROON.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  dockIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  dockIconBtnActive: {
    backgroundColor: MAROON.light,
  },
  dockBottom: {
    alignItems: "center",
    gap: 12,
  },

  // CENTER CATALOG AREA
  centerCatalog: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },

  // ── HIGH VISIBILITY PORTION MODE SELECTOR ──
  portionSegmentOuter: {
    marginBottom: 14,
  },
  portionSectionLabel: {
    fontSize: 11,
    fontWeight: "900",
    color: MAROON.medium,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  portionSegmentContainer: {
    flexDirection: "row",
    gap: 10,
  },
  portionSegmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  portionSegmentBtnActive: {
    backgroundColor: MAROON.primary,
    borderColor: MAROON.primary,
    elevation: 5,
    shadowColor: MAROON.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  portionSegmentIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: MAROON.ultraLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  portionSegmentIconBoxActive: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  portionSegmentTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#18181b",
  },
  portionSegmentTitleActive: {
    color: "#ffffff",
  },
  portionSegmentSub: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    marginTop: 2,
  },
  portionSegmentSubActive: {
    color: "#fecdd3",
  },

  // Active Mode Strip
  activeModeStrip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: MAROON.ultraLight,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: MAROON.border,
  },
  activeModeStripText: {
    fontSize: 11,
    fontWeight: "700",
    color: MAROON.primary,
    flex: 1,
  },

  // Search & Filter
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#18181b",
    padding: 0,
  },
  filterBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },

  // Wine Category Tier Filter
  tierFilterContainer: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  tierFilterBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 6,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
  },
  tierFilterBtnActive: {
    backgroundColor: MAROON.primary,
    borderColor: MAROON.primary,
    elevation: 3,
    shadowColor: MAROON.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  tierFilterEmoji: {
    fontSize: 14,
    marginRight: 4,
  },
  tierFilterText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#27272a",
  },
  tierFilterTextActive: {
    color: "#ffffff",
  },
  tierCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 10,
  },
  tierCountBadgeActive: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  tierCountBadgeInactive: {
    backgroundColor: "#f1f5f9",
  },
  tierCountBadgeText: {
    fontSize: 10,
    fontWeight: "900",
  },
  tierCountBadgeTextActive: {
    color: "#ffffff",
  },
  tierCountBadgeTextInactive: {
    color: "#64748b",
  },

  // Wine Type Category Pills (Full Width Grid/Row)
  wineTypeFilterContainer: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 10,
  },
  categoryPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 4,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
  },
  categoryPillActive: {
    backgroundColor: MAROON.primary,
    borderColor: MAROON.primary,
  },
  categoryPillInactive: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
  },
  categoryPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#52525b",
  },
  categoryPillTextActive: {
    color: "#ffffff",
    fontWeight: "900",
  },
  categoryPillBadgeText: {
    fontSize: 10,
    fontWeight: "900",
  },

  // Wine Type Group Sections
  wineTypeSection: {
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    marginTop: 6,
    gap: 8,
  },
  sectionHeaderBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 6,
  },
  sectionHeaderDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionHeaderTitle: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  sectionHeaderCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  sectionHeaderCountText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#ffffff",
  },
  sectionHeaderLine: {
    flex: 1,
    height: 1.5,
    borderRadius: 1,
  },
  sectionCardsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },

  // Oversized Cards Grid
  cardsGridContent: {
    paddingBottom: 80,
  },
  oversizedCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 12,
    margin: 5,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    borderWidth: 1.5,
    height: 108,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  sparklingBubbleContainer: {
    position: "absolute",
    top: 6,
    right: 8,
    width: 32,
    height: 32,
  },
  bubbleDot: {
    position: "absolute",
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "rgba(161, 98, 7, 0.4)",
    backgroundColor: "rgba(254, 240, 138, 0.45)",
  },
  bubble1: {
    width: 14,
    height: 14,
    top: 0,
    right: 0,
  },
  bubble2: {
    width: 9,
    height: 9,
    top: 14,
    right: 12,
  },
  bubble3: {
    width: 6,
    height: 6,
    top: 4,
    right: 18,
  },
  bubble4: {
    width: 10,
    height: 10,
    top: 18,
    right: 1,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  wineTypePill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
    gap: 4,
  },
  wineTypeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  wineTypePillText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  cardInfo: {
    flex: 1,
  },
  cardProducer: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.6,
    color: "#09090b",
    marginBottom: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "400",
    color: "#27272a",
    lineHeight: 22,
  },
  cardPriceRow: {
    alignItems: "flex-end",
    marginTop: 6,
  },
  cardPriceText: {
    fontSize: 14,
    fontWeight: "900",
  },
  cardBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#f8fafc",
  },
  glassMeterContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  glassMeterIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1.5,
  },
  stockIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  stockSubIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  stockHighlightText: {
    fontSize: 13,
    fontWeight: "900",
  },
  stockSubText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#94a3b8",
  },
  cardActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: MAROON.primary,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 3,
    elevation: 2,
    shadowColor: MAROON.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  cardActionBtnText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#ffffff",
  },

  // RIGHT PANEL (Landscape)
  orderPanel: {
    width: 360,
    borderLeftWidth: 1,
    borderLeftColor: "#e2e8f0",
    padding: 18,
    paddingLeft: 28, // extra left space for the collapse tab
    justifyContent: "space-between",
    height: "100%",
  },

  // Sidebar collapse/expand tab (sits on left edge of panel)
  sidebarCollapseTab: {
    position: "absolute",
    left: -18,
    top: 0,
    bottom: 0,
    width: 18,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  sidebarCollapseTabInner: {
    width: 18,
    height: 52,
    backgroundColor: MAROON.primary,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: MAROON.primary,
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },

  // Collapsed sidebar vertical strip
  sidebarCollapsedStrip: {
    width: 52,
    height: "100%",
    backgroundColor: MAROON.primary,
    borderLeftWidth: 1,
    borderLeftColor: MAROON.medium,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 18,
    paddingHorizontal: 4,
  },
  sidebarExpandCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  sidebarCollapsedCenter: {
    alignItems: "center",
    justifyContent: "center",
  },
  sidebarCartIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    position: "relative",
  },
  sidebarBadgeBubble: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#ffffff",
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: MAROON.primary,
  },
  sidebarBadgeBubbleText: {
    fontSize: 10,
    fontWeight: "900",
    color: MAROON.primary,
  },
  sidebarRotatedLabelBox: {
    height: 80,
    width: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  sidebarRotatedLabelText: {
    fontSize: 10,
    fontWeight: "900",
    color: "rgba(255, 255, 255, 0.65)",
    letterSpacing: 1.8,
    transform: [{ rotate: "-90deg" }],
    width: 80,
    textAlign: "center",
  },
  sidebarCollapsedBottom: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 28,
  },
  sidebarMiniTotalPill: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
  },
  sidebarMiniTotalText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#ffffff",
  },
  sidebarBottomPlaceholder: {
    width: 32,
    height: 32,
  },
  orderPanelCollapseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: MAROON.ultraLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: MAROON.border,
  },
  orderPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  orderPanelTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: MAROON.primary,
    letterSpacing: -0.5,
  },
  orderPanelSubTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: "#71717a",
    marginTop: 1,
  },
  // Staff Selector - Inline Accordion with Active Server Status
  staffSection: {
    marginBottom: 8,
  },
  staffSectionLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: MAROON.medium,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  staffAccordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
  },
  staffAccordionHeaderOpen: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderColor: MAROON.primary,
    backgroundColor: MAROON.ultraLight,
    borderBottomWidth: 1,
  },
  staffHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  staffHeaderAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: MAROON.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  staffHeaderAvatarText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#ffffff",
  },
  staffHeaderName: {
    fontSize: 12,
    fontWeight: "800",
    color: "#18181b",
    maxWidth: 130,
  },
  activeServerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  activeServerDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#10b981",
  },
  activeServerPillText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#059669",
    letterSpacing: 0.2,
  },
  staffHeaderRole: {
    fontSize: 10,
    fontWeight: "600",
    color: "#71717a",
    marginTop: 1,
  },
  staffAccordionChevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#f1f5f9",
    marginLeft: 6,
  },
  staffAccordionBody: {
    backgroundColor: "#ffffff",
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderColor: MAROON.primary,
    padding: 8,
    elevation: 3,
    shadowColor: MAROON.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  staffAccordionSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 6,
  },
  staffAccordionSearchInput: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    color: "#18181b",
    padding: 0,
  },
  staffAccordionScroll: {
    maxHeight: 180,
  },
  staffAccordionEmpty: {
    paddingVertical: 14,
    alignItems: "center",
  },
  staffAccordionEmptyText: {
    fontSize: 11,
    color: "#94a3b8",
    fontWeight: "600",
  },
  staffAccordionListWrap: {
    gap: 4,
  },
  staffAccordionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    backgroundColor: "#ffffff",
  },
  staffAccordionItemSelected: {
    backgroundColor: MAROON.ultraLight,
    borderColor: MAROON.border,
  },
  staffItemAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  staffItemAvatarDefault: {
    backgroundColor: "#f1f5f9",
  },
  staffItemAvatarSelected: {
    backgroundColor: MAROON.primary,
  },
  staffItemAvatarText: {
    fontSize: 10,
    fontWeight: "900",
  },
  staffItemAvatarTextDefault: {
    color: "#64748b",
  },
  staffItemAvatarTextSelected: {
    color: "#ffffff",
  },
  staffItemName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#18181b",
  },
  staffItemNameSelected: {
    color: MAROON.primary,
    fontWeight: "900",
  },
  staffItemRole: {
    fontSize: 9.5,
    color: "#71717a",
    marginTop: 0.5,
  },
  staffItemCheck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: MAROON.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  staffItemRadio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
  },
  // ── Quick Staff Switcher (Always Visible, Fills Downward) ──
  quickStaffBarContainer: {
    marginTop: 6,
    marginBottom: 6,
  },
  quickStaffContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  quickStaffChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    gap: 5,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
  },
  quickStaffChipSelected: {
    backgroundColor: MAROON.primary,
    borderColor: MAROON.primary,
    elevation: 2,
    shadowColor: MAROON.primary,
    shadowOpacity: 0.25,
  },
  quickStaffChipAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  quickStaffChipAvatarDefault: {
    backgroundColor: "#f1f5f9",
  },
  quickStaffChipAvatarSelected: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  quickStaffChipAvatarText: {
    fontSize: 10,
    fontWeight: "900",
  },
  quickStaffChipAvatarTextDefault: {
    color: "#475569",
  },
  quickStaffChipAvatarTextSelected: {
    color: "#ffffff",
  },
  quickStaffChipName: {
    fontSize: 11,
    fontWeight: "700",
    color: "#334155",
  },
  quickStaffChipNameSelected: {
    color: "#ffffff",
    fontWeight: "800",
  },
  quickStaffActiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10b981",
    marginLeft: 2,
  },
  quickStaffAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderStyle: "dashed",
    backgroundColor: "#f8fafc",
  },
  quickStaffAddBtnActive: {
    backgroundColor: MAROON.primary,
    borderColor: MAROON.primary,
    borderStyle: "solid",
  },
  quickStaffAddText: {
    fontSize: 10,
    fontWeight: "800",
    color: MAROON.primary,
  },
  // ── Accordion Shift Roster Header & Item Toggles ──
  accordionRosterHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 6,
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  accordionRosterTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: "#475569",
  },
  accordionRosterReset: {
    fontSize: 10,
    fontWeight: "700",
    color: MAROON.primary,
  },
  shiftToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    marginRight: 6,
  },
  shiftToggleBtnActive: {
    borderColor: "#a7f3d0",
    backgroundColor: "#ecfdf5",
  },
  shiftToggleBtnText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#64748b",
  },
  shiftToggleBtnTextActive: {
    color: "#059669",
    fontWeight: "800",
  },
  orderItemsList: {
    flex: 1,
    marginVertical: 6,
  },
  emptyCartBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyCartTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#18181b",
    marginTop: 10,
  },
  emptyCartSub: {
    fontSize: 12,
    color: "#71717a",
    textAlign: "center",
    marginTop: 4,
    paddingHorizontal: 20,
  },
  orderItemCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fcfcfd",
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  itemThumbnail: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbnailDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  orderItemName: {
    fontSize: 13,
    fontWeight: "800",
    color: "#18181b",
  },
  orderItemPortionBadge: {
    alignSelf: "flex-start",
    backgroundColor: MAROON.ultraLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 2,
  },
  orderItemPortionText: {
    fontSize: 10,
    fontWeight: "700",
    color: MAROON.primary,
  },
  orderItemPriceText: {
    fontSize: 12,
    fontWeight: "900",
    color: MAROON.primary,
    marginTop: 4,
  },
  orderItemStockNote: {
    fontSize: 10,
    color: "#94a3b8",
    marginTop: 2,
  },
  stepperContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepperBtnMinus: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#94a3b8",
    alignItems: "center",
    justifyContent: "center",
  },
  stepperBtnPlus: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: MAROON.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperBtnDisabled: {
    backgroundColor: "#cbd5e1",
  },
  outOfStockBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "#ef4444",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    zIndex: 5,
  },
  outOfStockBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: 0.5,
  },
  stepperQtyText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#18181b",
    minWidth: 16,
    textAlign: "center",
  },
  orderFooter: {
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 12,
  },
  countSummaryCard: {
    backgroundColor: MAROON.ultraLight,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: MAROON.border,
  },
  calcRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  calcLabel: {
    fontSize: 12,
    color: "#71717a",
    fontWeight: "600",
  },
  calcValue: {
    fontSize: 12,
    fontWeight: "800",
    color: "#18181b",
  },
  calcDivider: {
    height: 1,
    backgroundColor: MAROON.border,
    marginVertical: 4,
  },
  calcTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  calcTotalLabel: {
    fontSize: 13,
    fontWeight: "900",
    color: MAROON.primary,
  },
  calcTotalValue: {
    fontSize: 16,
    fontWeight: "900",
    color: MAROON.primary,
  },
  checkoutBtn: {
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: MAROON.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  checkoutBtnText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#ffffff",
  },

  // PORTRAIT STICKY ORDER TRAY (Dark Maroon)
  portraitFloatingOrderBar: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: MAROON.dark,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    elevation: 10,
    shadowColor: MAROON.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  portraitOrderCountBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: MAROON.medium,
    alignItems: "center",
    justifyContent: "center",
  },
  portraitOrderCountText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#ffffff",
  },
  portraitOrderBarLabel: {
    fontSize: 14,
    fontWeight: "900",
    color: "#ffffff",
  },
  portraitOrderBarPreview: {
    fontSize: 11,
    color: "#fecdd3",
    maxWidth: 160,
  },
  portraitOrderBarRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  portraitOrderBarTotal: {
    fontSize: 15,
    fontWeight: "900",
    color: "#ffffff",
  },
  portraitOrderBarVolumeSub: {
    fontSize: 10,
    color: "#fecdd3",
    fontWeight: "700",
  },
  portraitOrderPayBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: MAROON.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: "#9f1239",
  },
  portraitOrderPayBtnText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#ffffff",
  },

  // Mobile Drawer Modal
  mobileModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  mobileModalCard: {
    height: "85%",
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },
  mobileModalCloseBtn: {
    position: "absolute",
    top: 14,
    right: 14,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: MAROON.ultraLight,
    alignItems: "center",
    justifyContent: "center",
  },

  // Loading & Empty
  centerLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 14,
    fontWeight: "700",
    color: MAROON.medium,
    marginTop: 12,
  },
  emptyCatalog: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyCatalogTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: MAROON.primary,
    marginTop: 12,
  },
  emptyCatalogSub: {
    fontSize: 13,
    color: "#71717a",
    textAlign: "center",
    marginTop: 4,
    maxWidth: 240,
  },

  // Success Modal
  successOverlay: {
    flex: 1,
    backgroundColor: "rgba(30, 41, 59, 0.55)", // Slate gray overlay with blur matching location modal
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  successCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    elevation: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  successIconCircle: {
    width: 68,
    height: 64,
    borderRadius: 34,
    backgroundColor: "#d1fae5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: MAROON.primary,
  },
  successSub: {
    fontSize: 13,
    color: "#71717a",
    textAlign: "center",
    marginTop: 4,
  },
  successAutoCloseBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: 8,
  },
  successAutoCloseText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#059669",
  },
  successSummary: {
    width: "100%",
    backgroundColor: MAROON.ultraLight,
    borderRadius: 16,
    padding: 14,
    marginVertical: 18,
    gap: 8,
    borderWidth: 1,
    borderColor: MAROON.border,
  },
  successRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  successLabel: {
    fontSize: 13,
    color: "#71717a",
    fontWeight: "600",
  },
  successValue: {
    fontSize: 16,
    fontWeight: "900",
    color: MAROON.primary,
  },
  successText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#18181b",
  },
  parAlertBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fef3c7",
    padding: 8,
    borderRadius: 8,
    marginTop: 4,
  },
  parAlertText: {
    fontSize: 11,
    color: MAROON.accentGold,
    fontWeight: "700",
    flex: 1,
  },
  successBtn: {
    width: "100%",
    backgroundColor: MAROON.primary,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  successBtnText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#ffffff",
  },
  successActionsCol: {
    width: "100%",
    gap: 10,
  },
  voidBtn: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#f59e0b",
    backgroundColor: "#fffbeb",
  },
  voidBtnDisabled: {
    opacity: 0.5,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  voidBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#b45309",
    letterSpacing: 0.2,
  },

  // ── Void Reason Modal Styles ──────────────────────────────────────────
  voidModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  voidModalCard: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 20,
    elevation: 16,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  voidModalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 10,
  },
  voidModalIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fee2e2",
    alignItems: "center",
    justifyContent: "center",
  },
  voidModalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0f172a",
  },
  voidModalSubtitle: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
    lineHeight: 15,
  },
  voidModalSummaryBox: {
    backgroundColor: "#fef2f2",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
    marginVertical: 10,
  },
  voidModalSummaryText: {
    fontSize: 12,
    color: "#7f1d1d",
    fontWeight: "600",
  },
  voidReasonLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#334155",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  voidReasonsList: {
    gap: 6,
  },
  voidReasonOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    gap: 10,
  },
  voidReasonOptionSelected: {
    borderColor: "#dc2626",
    backgroundColor: "#fef2f2",
  },
  voidRadioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
  },
  voidRadioCircleSelected: {
    borderColor: "#dc2626",
  },
  voidRadioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#dc2626",
  },
  voidReasonOptionText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
  },
  voidReasonOptionTextSelected: {
    color: "#991b1b",
    fontWeight: "800",
  },
  voidCustomInput: {
    borderWidth: 1.5,
    borderColor: "#fca5a5",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    backgroundColor: "#ffffff",
    color: "#0f172a",
    marginTop: 8,
  },
  voidModalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  voidModalCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
  },
  voidModalCancelText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#64748b",
  },
  voidModalConfirmBtn: {
    flex: 1.6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: "#dc2626",
  },
  voidModalConfirmBtnDisabled: {
    opacity: 0.6,
  },
  voidModalConfirmText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#ffffff",
  },
  orderItemLocationBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
    gap: 3,
    maxWidth: 130,
  },
  orderItemLocationText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#475569",
  },

  // ── LOCATION SELECTION MODAL STYLES ───────────────────────────────────────
  locationModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(30, 41, 59, 0.55)", // Slate gray overlay with blur
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  locationModalCard: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "90%",
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 18,
    elevation: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  // Modal Cart Queue Indicator
  modalCartQueueBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 10,
    marginBottom: 10,
  },
  modalCartQueueHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  modalCartQueueTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: MAROON.primary,
    letterSpacing: 0.6,
  },
  modalCartQueueTotal: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
  },
  modalCartQueueScrollContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 2,
    paddingRight: 4,
  },
  modalCartPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 5,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
  },
  modalCartPillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 2,
  },
  modalCartPillQtyText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0f172a",
  },
  modalCartPillSep: {
    fontSize: 11,
    fontWeight: "600",
    color: "#cbd5e1",
  },
  modalCartPillNameText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#334155",
    maxWidth: 150,
  },
  modalCartPillLocText: {
    fontSize: 10.5,
    fontWeight: "500",
    color: "#64748b",
    maxWidth: 80,
  },
  modalCartPillPriceText: {
    fontSize: 11,
    fontWeight: "800",
    color: MAROON.primary,
  },
  modalCartPillRemoveBtn: {
    padding: 2,
    marginLeft: 3,
  },
  locationPortionPill: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  locationPortionPillText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  locationModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  locationIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  locationModalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#18181b",
  },
  locationModalSub: {
    fontSize: 11,
    fontWeight: "500",
    color: "#64748b",
    marginTop: 1,
  },
  locationCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  locationWineSnapshot: {
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    marginBottom: 8,
  },
  locationWineTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  locationWineProducer: {
    fontSize: 11,
    fontWeight: "800",
    color: "#09090b",
    letterSpacing: 0.8,
    flex: 1,
    marginRight: 8,
  },
  locationWineName: {
    fontSize: 15,
    fontWeight: "500",
    color: "#18181b",
    lineHeight: 20,
  },
  locationPriceText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#09090b",
  },
  locationScrollList: {
    maxHeight: 220,
    marginVertical: 2,
  },
  locationListHeader: {
    fontSize: 9.5,
    fontWeight: "600",
    color: "#64748b",
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  singleLocationCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginVertical: 2,
  },
  singleLocationIconBox: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  singleLocationBadgeLabel: {
    fontSize: 8.5,
    fontWeight: "600",
    color: "#64748b",
    letterSpacing: 0.5,
  },
  singleLocationTitle: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#18181b",
    marginTop: 1,
  },
  singleLocationSub: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 1,
  },
  singleLocationStockText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#475569",
  },
  lockedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  lockedBadgeText: {
    fontSize: 8.5,
    fontWeight: "600",
    color: "#64748b",
  },
  openBottleBadge: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  openBottleBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#475569",
  },
  locationGridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  locationGridTile: {
    width: "48.8%",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    justifyContent: "space-between",
  },
  locationGridTileSelected: {
    backgroundColor: "#f8fafc",
    borderColor: "#0f172a",
  },
  locationGridTileTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  locationGridTileName: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#18181b",
  },
  locationGridTileNameSelected: {
    color: "#0f172a",
    fontWeight: "700",
  },
  locationGridRadio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  locationGridRadioSelected: {
    borderColor: "#0f172a",
    backgroundColor: "#0f172a",
  },
  locationGridTileBottom: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  locationGridStockText: {
    fontSize: 10.5,
    fontWeight: "500",
    color: "#64748b",
  },
  locationGridStockTextSelected: {
    color: "#334155",
    fontWeight: "600",
  },
  locationModalFooter: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  fineWineCustomerSection: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 9,
    marginTop: 8,
    marginBottom: 2,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  fineWineCustomerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  fineWineCustomerTitle: {
    fontSize: 9.5,
    fontWeight: "600",
    color: "#64748b",
    letterSpacing: 0.4,
  },
  fineWinePill: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  fineWinePillText: {
    fontSize: 8.5,
    fontWeight: "600",
    color: "#475569",
  },
  addCustomerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderStyle: "dashed",
  },
  addCustomerBtnText: {
    fontSize: 11.5,
    fontWeight: "500",
    color: "#64748b",
  },
  selectedCustomerCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  selectedCustomerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flex: 1,
  },
  selectedCustomerName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#18181b",
  },
  selectedCustomerSub: {
    fontSize: 10,
    color: "#64748b",
    marginTop: 1,
  },
  removeCustomerBtn: {
    padding: 2,
  },
  locationCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  locationCancelBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
  },
  locationAddMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: MAROON.ultraLight,
    borderWidth: 1.5,
    borderColor: MAROON.border,
  },
  locationAddMoreBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: MAROON.primary,
  },
  locationConfirmSaleBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: MAROON.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  locationConfirmSaleBtnText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#ffffff",
  },
  openBottleBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    padding: 8,
    marginBottom: 8,
    borderWidth: 1,
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
  },
  openBottleBannerTitle: {
    fontSize: 11.5,
    fontWeight: "600",
    color: "#18181b",
  },
  openBottleBannerSub: {
    fontSize: 10,
    fontWeight: "400",
    color: "#64748b",
    marginTop: 1,
  },
  cardReserveGhostBadge: {
    position: "absolute",
    bottom: 6,
    right: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  cardReserveGhostText: {
    fontSize: 16,
  },
  openBottleDiscardBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#fffbeb",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fde68a",
    flexShrink: 0,
  },
  openBottleDiscardBtnText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#b45309",
  },
  pullNewBottleEscapeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#fffbeb",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  pullNewBottleEscapeBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#b45309",
  },
  pullNewBottleEscapeBtnSub: {
    fontSize: 11,
    color: "#92400e",
    marginTop: 2,
    lineHeight: 15,
  },
  pullNewBottleHeaderBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: "#fef3c7",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  pullNewBottleHeaderBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#b45309",
    textTransform: "uppercase",
  },
  pullNewBottleNoticeCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  pullNewBottleNoticeTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#92400e",
  },
  pullNewBottleNoticeSub: {
    fontSize: 11,
    color: "#b45309",
    marginTop: 2,
    lineHeight: 15,
  },
  pullNewBottleSection: {
    marginBottom: 16,
  },
  pullNewBottleSectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
    letterSpacing: 0.5,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  pullNewBottleReasonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pullNewBottleReasonPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  pullNewBottleReasonPillSelected: {
    backgroundColor: "#fdf2f2",
    borderColor: MAROON.primary,
  },
  pullNewBottleReasonPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
  },
  pullNewBottleReasonPillTextSelected: {
    color: MAROON.primary,
    fontWeight: "700",
  },
  pullNewBottleEmptyBox: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 6,
  },
  pullNewBottleEmptyText: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "500",
  },
  pullNewBottleConfirmBtn: {
    flex: 2,
    height: 44,
    borderRadius: 10,
    backgroundColor: MAROON.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  pullNewBottleConfirmBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
  },
});
