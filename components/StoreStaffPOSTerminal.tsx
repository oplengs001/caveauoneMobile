import CustomerPickerModal from "@/components/CustomerPickerModal";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { clearToken } from "@/lib/auth";
import { AppUser, fetchStoreStaff } from "@/lib/queries/users";
import { Customer } from "@/types";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Stack, useRouter } from "expo-router";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Droplets,
  LogOut,
  Minus,
  Plus,
  RotateCcw,
  Scan,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Wine,
  X,
  Zap
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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

export interface FastWineItem {
  id: string;
  name: string;
  vintage?: string;
  producer?: string;
  format?: string;
  sku?: string;
  wineType?: string;
  price?: number;
  sellingPrice?: number | null;
  glassPrice?: number | null;
  carafePrice?: number | null;
  wineCategory?: "fast" | "fine" | "reserve" | "standard" | string | null;
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

export type PortionType = "glass" | "carafe" | "bottle";

export interface OrderItem {
  wine: FastWineItem;
  portion: PortionType;
  quantity: number;
  selectedLocationId?: string | null;
  selectedLocationName?: string;
}

const normalizeWineType = (rawType?: string | null): string => {
  if (!rawType) return "Red Wine";
  const t = rawType.toLowerCase();
  if (t.includes("sparkling") || t.includes("champagne") || t.includes("prosecco") || t.includes("cava")) {
    return "Sparkling";
  }
  if (t.includes("white")) {
    return "White Wine";
  }
  if (t.includes("rose") || t.includes("rosé")) {
    return "Rosé";
  }
  if (t.includes("sweet") || t.includes("dessert") || t.includes("fortified") || t.includes("port")) {
    return "Dessert & Fortified";
  }
  if (t.includes("red")) {
    return "Red Wine";
  }
  return rawType;
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

export const canAddPortion = (wine: FastWineItem, portion: PortionType, currentOrder: OrderItem[]): boolean => {
  const neededVolume = portion === "glass" ? (1 / 6) : portion === "carafe" ? (2 / 6) : 1;
  const remaining = getRemainingVolumeForWine(wine, currentOrder);
  return remaining >= (neededVolume - 0.001);
};

export default function StoreStaffPOSTerminal() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const { profile, refreshProfile } = useAuth();
  const isLandscape = width > height;
  const isTabletLandscape = isLandscape && width >= 680;
  const storeId = profile?.locationId || null;

  // Data States
  const [storeName, setStoreName] = useState<string>("Boutique Store");
  const [staffList, setStaffList] = useState<AppUser[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<AppUser | null>(null);
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

  // Customer / VIP Guest Attachment (for Fine Wine sales)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);

  // Post-dispense feedback
  const [successData, setSuccessData] = useState<{
    itemsCount: number;
    totalBottlesVolume: number;
    totalAmount: number;
    staffName: string;
    customerName?: string | null;
    timestamp: string;
  } | null>(null);

  const [parAlerts, setParAlerts] = useState<
    { wineName: string; stockCount: number; requestedQty: number }[]
  >([]);

  // Load staff, store name & inventory data
  const loadData = useCallback(async () => {
    try {
      if (storeId) {
        try {
          const storeData = await apiFetch(`/stores/${storeId}`);
          if (storeData?.name) setStoreName(storeData.name);
        } catch {
          // ignore error
        }
      }

      const staff = await fetchStoreStaff(storeId);
      setStaffList(staff);
      const activeUserInStaff: AppUser = staff.find((u) => u.id === profile?.id) || {
        id: profile?.id || "unknown",
        displayName: profile?.displayName || profile?.email?.split("@")[0] || "Staff Member",
        email: profile?.email || "",
        role: "store_staff",
        createdAt: new Date(),
      };
      setSelectedStaff(activeUserInStaff);

      const [winesData, settingsData, bottlesData, locationsData] = await Promise.all([
        apiFetch("/wines"),
        storeId ? apiFetch(`/stock-settings?storeId=${storeId}`) : Promise.resolve([]),
        storeId
          ? apiFetch(`/bottles?storeId=${storeId}&status=received,shelved,open`)
          : Promise.resolve([]),
        apiFetch("/locations").catch(() => []),
      ]);

      const locs: any[] = Array.isArray(locationsData)
        ? locationsData
        : Array.isArray(locationsData?.locations)
          ? locationsData.locations
          : [];
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

          return {
            id: mw.id,
            name: mw.name,
            vintage: mw.vintage,
            producer: mw.producer,
            format: mw.format,
            sku: mw.sku,
            wineType: normalizeWineType(mw.type),
            price: mw.price,
            sellingPrice: setting?.sellingPrice ?? null,
            glassPrice: setting?.glassPrice ?? null,
            carafePrice: setting?.carafePrice ?? setting?.karafPrice ?? null,
            wineCategory: setting?.wineCategory ?? mw.wineCategory ?? "standard",
            stockCount: wineBottles.length,
            availableBottleIds: wineBottles.map((b: any) => b.id),
            bottles: wineBottles,
            locationBreakdown: Array.from(locMapForWine.values()),
            openBottle: openB
              ? {
                id: openB.id,
                locationId: openB.locationId || null,
                locationName: openB.locationName || "Bar",
                glassesRemaining: openB.glassesRemaining ?? 6,
              }
              : null,
          };
        })
        .filter((w) => w.wineCategory !== "reserve");

      setWines(processedWines);
    } catch (error) {
      console.error("[StoreStaffPOSTerminal] Load error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [storeId, profile]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  // Filtered wines
  const filteredWines = useMemo(() => {
    let result = wines;

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
          (w.wineType && w.wineType.toLowerCase().includes(q))
      );
    }

    return [...result].sort((a, b) => {
      if (salesTypeMode === "glass") {
        if (a.openBottle && !b.openBottle) return -1;
        if (!a.openBottle && b.openBottle) return 1;
      }
      if (a.wineCategory === "fast" && b.wineCategory !== "fast") return -1;
      if (b.wineCategory === "fast" && a.wineCategory !== "fast") return 1;
      return a.name.localeCompare(b.name);
    });
  }, [wines, salesTypeMode, tierFilter, wineTypeFilter, searchQuery]);

  // Wine Category Tier Counts
  const tierCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0, fast: 0, fine: 0 };
    let base = wines;
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
      if (cat === "fast") counts.fast = (counts.fast || 0) + 1;
      else if (cat === "fine") counts.fine = (counts.fine || 0) + 1;
    });
    return counts;
  }, [wines, searchQuery]);

  // Wine Type Counts
  const wineTypeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    let base = wines;
    if (tierFilter !== "all") {
      base = base.filter((w) => (w.wineCategory || "standard") === tierFilter);
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
  }, [wines, tierFilter, searchQuery]);

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

    try {
      const staffToAttribute = selectedStaff || {
        id: profile?.id || "unknown",
        displayName: profile?.displayName || profile?.email?.split("@")[0] || "Staff",
        email: profile?.email,
      };

      for (const item of itemsToProcess) {
        const { wine, portion, quantity } = item;

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

            await apiFetch("/sales", {
              method: "POST",
              body: JSON.stringify({
                bottleId: targetBottleId || null,
                masterWineId: wine.id,
                wineName: wine.name,
                vintage: wine.vintage,
                producer: wine.producer,
                format: wine.format,
                storeId: storeId,
                soldById: staffToAttribute.id,
                soldByEmail: staffToAttribute.email,
                price: wine.price || 0,
                vatAmount: 0,
                totalAmount: wine.price || 0,
                vatMode: "included",
                customerId: selectedCustomer?.id || null,
                customerName: selectedCustomer?.name || null,
                wineCategory: wine.wineCategory,
                masterWinePrice: wine.price || null,
                saleType: portion,
                glassCount: 1.0,
              }),
            });

            if (targetBottleId) {
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

          for (let q = 0; q < quantity; q++) {
            await apiFetch("/sales", {
              method: "POST",
              body: JSON.stringify({
                bottleId: activeOpenBottleId || availableUnopenedIds[0] || null,
                masterWineId: wine.id,
                wineName: wine.name,
                vintage: wine.vintage,
                producer: wine.producer,
                format: wine.format,
                storeId: storeId,
                soldById: staffToAttribute.id,
                soldByEmail: staffToAttribute.email,
                price: wine.price || 0,
                vatAmount: 0,
                totalAmount: wine.price || 0,
                vatMode: "included",
                customerId: selectedCustomer?.id || null,
                customerName: selectedCustomer?.name || null,
                wineCategory: wine.wineCategory,
                masterWinePrice: wine.price || null,
                saleType: portion,
                glassCount,
              }),
            });
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
                  ...(isNowConsumed ? { locationId: null } : {}),
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

              await apiFetch(`/bottles/${nextBottleId}`, {
                method: "PATCH",
                body: JSON.stringify({
                  status: isNowConsumed ? "consumed" : "open",
                  glassesRemaining: remainingInThis,
                  ...(isNowConsumed ? { locationId: null } : {}),
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
        itemsCount: totalItems,
        totalBottlesVolume: Math.round(totalBottlesVolume * 100) / 100,
        totalAmount,
        staffName: staffToAttribute.displayName || staffToAttribute.email?.split("@")[0] || "Staff",
        customerName: selectedCustomer?.name || null,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });

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

  // Sommelier & Maroon Color Theme helper
  const getWineTypeTheme = (wineType?: string) => {
    const t = (wineType || "").toLowerCase();
    if (t.includes("white")) return { bg: "#fef3c7", accent: "#b45309", color: "#d97706", tag: "WHITE" };
    if (t.includes("sparkling")) return { bg: "#fef9c3", accent: "#a16207", color: "#ca8a04", tag: "SPARKLING" };
    if (t.includes("ros")) return { bg: "#ffe4e6", accent: "#be123c", color: "#f43f5e", tag: "ROSÉ" };
    if (t.includes("sweet") || t.includes("dessert")) return { bg: "#fae8ff", accent: "#7e22ce", color: "#a855f7", tag: "SWEET" };
    return { bg: "#fff1f2", accent: MAROON.primary, color: MAROON.primary, tag: "RED" };
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

      {/* Staff Selector - Display All Pill Buttons (Non-scrollable) */}
      <View style={styles.staffSection}>
        <Text style={styles.staffSectionLabel}>SERVED BY</Text>
        <View style={styles.staffPillsWrap}>
          {(staffList.length > 0 ? staffList : selectedStaff ? [selectedStaff] : []).map((st) => {
            const isSelected = selectedStaff?.id === st.id;
            const name = st.displayName || st.email?.split("@")[0] || "Staff";
            const initial = name[0].toUpperCase();

            return (
              <TouchableOpacity
                key={st.id}
                onPress={() => setSelectedStaff(st)}
                style={[
                  styles.staffPillBtn,
                  isSelected ? styles.staffPillBtnActive : styles.staffPillBtnInactive,
                ]}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.staffPillAvatar,
                    isSelected ? styles.staffPillAvatarActive : styles.staffPillAvatarInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.staffPillAvatarText,
                      isSelected ? styles.staffPillAvatarTextActive : styles.staffPillAvatarTextInactive,
                    ]}
                  >
                    {initial}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.staffPillText,
                    isSelected ? styles.staffPillTextActive : styles.staffPillTextInactive,
                  ]}
                  numberOfLines={1}
                >
                  {name}
                </Text>
                {isSelected && (
                  <View style={styles.staffPillCheckCircle}>
                    <Check size={11} color={MAROON.primary} strokeWidth={3.5} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
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
              const typeTheme = getWineTypeTheme(item.wine.wineType);
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
                  {selectedStaff?.displayName || profile?.email?.split("@")[0] || "Staff"} · On Duty
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

            <TouchableOpacity
              onPress={() => router.push({ pathname: "/sell" })}
              style={styles.portraitScanBtn}
            >
              <Scan size={16} color={MAROON.primary} strokeWidth={2.5} />
              <Text style={styles.portraitScanBtnText}>Scan</Text>
            </TouchableOpacity>

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

              <TouchableOpacity
                onPress={() => router.push({ pathname: "/sell" })}
                style={styles.dockIconBtn}
              >
                <Scan size={22} color="#64748b" strokeWidth={2} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.push("/sales")}
                style={styles.dockIconBtn}
              >
                <ShoppingBag size={22} color="#64748b" strokeWidth={2} />
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
                    By the Glass
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
                  <MaterialCommunityIcons
                    name="cup-water"
                    size={26}
                    color={salesTypeMode === "carafe" ? "#ffffff" : MAROON.primary}
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

            {isTabletLandscape && (
              <TouchableOpacity
                onPress={() => router.push({ pathname: "/sell" })}
                style={styles.filterBtn}
              >
                <SlidersHorizontal size={18} color={MAROON.primary} />
              </TouchableOpacity>
            )}
          </View>

          {/* ── WINE CATEGORY TIER FILTER (Fast vs Fine) ─── */}
          <View style={styles.tierFilterContainer}>
            {([
              { key: "all", label: "All Wines", icon: "view-grid-outline" as const },
              { key: "fast", label: "Fast Wine", icon: "lightning-bolt-outline" as const },
              { key: "fine", label: "Fine Wine", icon: "diamond-stone" as const },
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
                  <MaterialCommunityIcons
                    name={tier.icon}
                    size={16}
                    color={isActive ? "#ffffff" : MAROON.primary}
                  />
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



          {/* ── WINE TYPE CATEGORY PILLS (Full Width) ──────────────────────── */}
          <View style={styles.wineTypeFilterContainer}>
            {([
              { key: "all", label: "All", activeBg: MAROON.primary, activeText: "#ffffff", activeBorder: MAROON.primary },
              { key: "Red Wine", label: "Red", activeBg: "#4c0519", activeText: "#ffffff", activeBorder: "#9f1239" },
              { key: "White Wine", label: "White", activeBg: "#b45309", activeText: "#ffffff", activeBorder: "#d97706" },
              { key: "Sparkling", label: "Sparkling", activeBg: "#a16207", activeText: "#ffffff", activeBorder: "#ca8a04" },
              { key: "Rosé", label: "Rosé", activeBg: "#be123c", activeText: "#ffffff", activeBorder: "#f43f5e" },
              { key: "Dessert & Fortified", label: "Dessert", activeBg: "#7e22ce", activeText: "#ffffff", activeBorder: "#a855f7" },
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
                    isActive
                      ? { backgroundColor: pill.activeBg, borderColor: pill.activeBorder }
                      : styles.categoryPillInactive,
                  ]}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.categoryPillText,
                      isActive ? { color: pill.activeText, fontWeight: "900" } : {},
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
                  : "No inventory available in this category."}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredWines}
              keyExtractor={(item) => item.id}
              numColumns={isTabletLandscape ? 3 : 2}
              key={isTabletLandscape ? "grid-3-landscape" : "grid-2-portrait"}
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
              renderItem={({ item }) => {
                const typeTheme = getWineTypeTheme(item.wineType);

                // Responsive card width calculation
                const cols = isTabletLandscape ? 3 : 2;
                const catalogPad = 32; // 16px each side
                const dockW = isTabletLandscape ? 68 : 0;
                const panelW = isTabletLandscape
                  ? isSidebarCollapsed ? 52 : 360
                  : 0;
                const cardGap = 10;
                const totalGap = cardGap * (cols + 1);
                const cardSize = Math.floor((width - dockW - panelW - catalogPad - totalGap) / cols);

                const vintagePrefix = item.vintage ? `${item.vintage} ` : "";
                const fullWineTitle = `${vintagePrefix}${item.name}`;
                const canAdd = canAddPortion(item, salesTypeMode, currentOrder);
                const isOutOfStock = item.stockCount === 0;

                return (
                  <TouchableOpacity
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
                      <Text style={[styles.cardProducer, !canAdd && { color: "#94a3b8" }]} numberOfLines={1}>
                        {(item.producer || "Boutique Selection").toUpperCase()}
                      </Text>
                      <Text style={[styles.cardTitle, !canAdd && { color: "#94a3b8" }]} numberOfLines={3}>
                        {fullWineTitle}
                      </Text>
                    </View>
                  </TouchableOpacity>
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

      {/* ── Transaction Success Confirmation Dialog ─────────────────────────── */}
      <Modal
        visible={Boolean(successData)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setSuccessData(null)}
      >
        <View style={styles.successOverlay}>
          <BlurView
            intensity={20}
            tint="systemMaterialDark"
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.successCard}>
            <View style={styles.successIconCircle}>
              <CheckCircle2 size={44} color="#059669" strokeWidth={2.5} />
            </View>

            <Text style={styles.successTitle}>Sales Confirmed!</Text>
            <Text style={styles.successSub}>
              {successData?.itemsCount} item(s) dispensed and inventory deducted.
            </Text>

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

            <TouchableOpacity
              onPress={() => setSuccessData(null)}
              style={styles.successBtn}
              activeOpacity={0.85}
            >
              <Text style={styles.successBtnText}>Done / Next Service</Text>
            </TouchableOpacity>
          </View>
        </View>
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
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={styles.locationIconCircle}>
                      <MaterialCommunityIcons name="map-marker-radius-outline" size={22} color={MAROON.primary} />
                    </View>
                    <View>
                      <Text style={styles.locationModalTitle}>Confirm Wine Location</Text>
                      <Text style={styles.locationModalSub}>
                        {locationModalWine?.openBottle && (locationModalPortion === "glass" || locationModalPortion === "carafe") && (locationModalWine.openBottle.glassesRemaining ?? 0) > 0
                          ? "Pouring directly from active open bottle"
                          : (locationModalWine?.locationBreakdown?.length ?? 0) > 1
                            ? "Select storage location to pullout from"
                            : "Verify storage location for pullout"}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => setLocationModalWine(null)}
                    style={styles.locationCloseBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <MaterialCommunityIcons name="close" size={20} color="#64748b" />
                  </TouchableOpacity>
                </View>

                {/* Selected Wine Snapshot */}
                {locationModalWine && (() => {
                  const typeTheme = getWineTypeTheme(locationModalWine.wineType);
                  const unitPrice = getItemUnitPrice(locationModalWine, locationModalPortion);

                  return (
                    <View style={[styles.locationWineSnapshot, { backgroundColor: typeTheme.bg, borderColor: typeTheme.color }]}>
                      {/* Top Row: Producer & Price */}
                      <View style={styles.locationWineTopRow}>
                        <Text style={styles.locationWineProducer} numberOfLines={1}>
                          {(locationModalWine.producer || "Boutique Selection").toUpperCase()}
                        </Text>
                        <Text style={styles.locationPriceText}>
                          ₱{unitPrice.toLocaleString("en-PH")}
                        </Text>
                      </View>

                      {/* Wine Full Title (Regular Weight) */}
                      <Text style={styles.locationWineName} numberOfLines={2}>
                        {locationModalWine.vintage ? `${locationModalWine.vintage} ` : ""}
                        {locationModalWine.name}
                      </Text>
                    </View>
                  );
                })()}

                {/* Open Bottle Status Banner (For Glass Serves) */}
                {locationModalWine && locationModalPortion === "glass" && (() => {
                  const activeOpen = locationModalWine.openBottle;
                  const hasOpen = Boolean(activeOpen && (activeOpen.glassesRemaining ?? 0) > 0);

                  return (
                    <View
                      style={[
                        styles.openBottleBanner,
                        hasOpen ? styles.openBottleBannerHasOpen : styles.openBottleBannerNoOpen,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={hasOpen ? "bottle-wine-outline" : "package-variant-closed"}
                        size={22}
                        color={hasOpen ? "#059669" : "#b45309"}
                      />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.openBottleBannerTitle,
                            { color: hasOpen ? "#065f46" : "#92400e" },
                          ]}
                        >
                          {hasOpen
                            ? `Active Open Bottle (${activeOpen!.glassesRemaining} glass${activeOpen!.glassesRemaining !== 1 ? "es" : ""} remaining)`
                            : "No Open Bottle in Service"}
                        </Text>
                        <Text
                          style={[
                            styles.openBottleBannerSub,
                            { color: hasOpen ? "#047857" : "#b45309" },
                          ]}
                        >
                          {hasOpen
                            ? `Stored at: ${activeOpen!.locationName || "Bar"} · Pouring from open bottle first.`
                            : "A fresh sealed bottle will be opened from inventory (6 glasses total)."}
                        </Text>
                      </View>
                    </View>
                  );
                })()}

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
                          <View style={styles.singleLocationIconBox}>
                            <MaterialCommunityIcons name="bottle-wine-outline" size={24} color={MAROON.primary} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                              <Text style={styles.singleLocationBadgeLabel}>POURING FROM OPEN BOTTLE</Text>
                              <View style={styles.lockedBadge}>
                                <MaterialCommunityIcons name="lock-outline" size={10} color={MAROON.primary} />
                                <Text style={styles.lockedBadgeText}>Priority</Text>
                              </View>
                            </View>
                            <Text style={styles.singleLocationTitle}>{activeOpen!.locationName || "Bar / Service Area"}</Text>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
                              <MaterialCommunityIcons name="check-circle-outline" size={14} color="#059669" />
                              <Text style={styles.singleLocationStockText}>
                                {activeOpen!.glassesRemaining} glass{activeOpen!.glassesRemaining !== 1 ? "es" : ""} remaining to pour
                              </Text>
                            </View>
                          </View>
                        </View>
                      );
                    }

                    if (breakdown.length === 0) {
                      return (
                        <View style={styles.singleLocationCard}>
                          <View style={styles.singleLocationIconBox}>
                            <MaterialCommunityIcons name="map-marker-outline" size={24} color={MAROON.primary} />
                          </View>
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
                          <View style={styles.singleLocationIconBox}>
                            <MaterialCommunityIcons name="map-marker-radius-outline" size={24} color={MAROON.primary} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.singleLocationBadgeLabel}>PULLOUT LOCATION</Text>
                            <Text style={styles.singleLocationTitle}>{loc.locationName}</Text>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                              <MaterialCommunityIcons name="check-circle-outline" size={14} color="#059669" />
                              <Text style={styles.singleLocationStockText}>
                                {loc.count} bottle{loc.count !== 1 ? "s" : ""} available here
                              </Text>
                            </View>
                          </View>
                        </View>
                      );
                    }

                    // Multiple Locations - Compact 2-Column Grid
                    return (
                      <View style={{ gap: 8 }}>
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
                                    size={16}
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
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                      <MaterialCommunityIcons name="account-star-outline" size={15} color={MAROON.primary} />
                      <Text style={styles.fineWineCustomerTitle}>
                        {locationModalWine && locationModalWine.wineCategory === "fine" ? "VIP / CUSTOMER (FINE WINE)" : "CUSTOMER (OPTIONAL)"}
                      </Text>
                    </View>
                    {locationModalWine && locationModalWine.wineCategory === "fine" && (
                      <View style={styles.fineWinePill}>
                        <Text style={styles.fineWinePillText}>Fine Wine</Text>
                      </View>
                    )}
                  </View>

                  {selectedCustomer ? (
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
                  ) : (
                    <TouchableOpacity
                      onPress={() => setIsCustomerModalOpen(true)}
                      style={styles.addCustomerBtn}
                      activeOpacity={0.8}
                    >
                      <MaterialCommunityIcons name="account-plus-outline" size={15} color={MAROON.primary} />
                      <Text style={styles.addCustomerBtnText}>Attach Customer / VIP Guest...</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Modal Actions: Cancel, Add More (Queue), or Confirm Sale (Direct Checkout) */}
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
                        <Text style={styles.locationAddMoreBtnText}>Add More</Text>
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
                              Confirm Sale · ₱{directSaleTotal.toLocaleString("en-PH")}
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
  portraitScanBtn: {
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
  portraitScanBtnText: {
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
    fontWeight: "600",
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
  // Staff Selector Pills
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
  staffPillsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    width: "100%",
  },
  staffPillBtn: {
    flex: 1,
    minWidth: "47%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 8,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  staffPillBtnActive: {
    backgroundColor: MAROON.primary,
    borderColor: MAROON.primary,
    elevation: 3,
    shadowColor: MAROON.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  staffPillBtnInactive: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
  },
  staffPillAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  staffPillAvatarActive: {
    backgroundColor: "#ffffff",
  },
  staffPillAvatarInactive: {
    backgroundColor: MAROON.ultraLight,
  },
  staffPillAvatarText: {
    fontSize: 11,
    fontWeight: "900",
  },
  staffPillAvatarTextActive: {
    color: MAROON.primary,
  },
  staffPillAvatarTextInactive: {
    color: MAROON.primary,
  },
  staffPillText: {
    fontSize: 13,
    fontWeight: "700",
    flexShrink: 1,
  },
  staffPillTextActive: {
    color: "#ffffff",
    fontWeight: "900",
  },
  staffPillTextInactive: {
    color: "#3f3f46",
  },
  staffPillCheckCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
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
    maxWidth: 440,
    maxHeight: "85%",
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 20,
    elevation: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  locationModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  locationIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: MAROON.ultraLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: MAROON.border,
  },
  locationModalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#18181b",
  },
  locationModalSub: {
    fontSize: 11,
    fontWeight: "600",
    color: "#71717a",
    marginTop: 1,
  },
  locationCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  locationWineSnapshot: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    marginBottom: 14,
  },
  locationWineTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  locationWineProducer: {
    fontSize: 12,
    fontWeight: "900",
    color: "#09090b",
    letterSpacing: 0.8,
    flex: 1,
    marginRight: 8,
  },
  locationWineName: {
    fontSize: 16,
    fontWeight: "500",
    color: "#18181b",
    lineHeight: 22,
  },
  locationPriceText: {
    fontSize: 16,
    fontWeight: "900",
    color: "#09090b",
  },
  locationScrollList: {
    maxHeight: 220,
    marginVertical: 4,
  },
  locationListHeader: {
    fontSize: 10,
    fontWeight: "900",
    color: MAROON.medium,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  singleLocationCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: MAROON.ultraLight,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1.5,
    borderColor: MAROON.border,
    marginVertical: 4,
  },
  singleLocationIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: MAROON.border,
  },
  singleLocationBadgeLabel: {
    fontSize: 9,
    fontWeight: "900",
    color: MAROON.medium,
    letterSpacing: 0.8,
  },
  singleLocationTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: MAROON.primary,
    marginTop: 1,
  },
  singleLocationSub: {
    fontSize: 12,
    color: "#71717a",
    marginTop: 2,
  },
  singleLocationStockText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#059669",
  },
  lockedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: MAROON.ultraLight,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: MAROON.border,
  },
  lockedBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: MAROON.primary,
  },
  openBottleBadge: {
    backgroundColor: "#fef3c7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  openBottleBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#b45309",
  },
  locationGridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  locationGridTile: {
    width: "48.5%",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    justifyContent: "space-between",
  },
  locationGridTileSelected: {
    backgroundColor: MAROON.ultraLight,
    borderColor: MAROON.primary,
    elevation: 2,
    shadowColor: MAROON.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  locationGridTileTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  locationGridTileName: {
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    color: "#18181b",
  },
  locationGridTileNameSelected: {
    color: MAROON.primary,
  },
  locationGridRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  locationGridRadioSelected: {
    borderColor: MAROON.primary,
    backgroundColor: MAROON.primary,
  },
  locationGridTileBottom: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  locationGridStockText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
  },
  locationGridStockTextSelected: {
    color: MAROON.medium,
    fontWeight: "800",
  },
  locationModalFooter: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  fineWineCustomerSection: {
    backgroundColor: "#fdf8f6",
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
    marginBottom: 2,
    borderWidth: 1,
    borderColor: "#fed7aa",
  },
  fineWineCustomerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  fineWineCustomerTitle: {
    fontSize: 10,
    fontWeight: "900",
    color: MAROON.primary,
    letterSpacing: 0.6,
  },
  fineWinePill: {
    backgroundColor: "#ffedd5",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#fed7aa",
  },
  fineWinePillText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#c2410c",
  },
  addCustomerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderStyle: "dashed",
  },
  addCustomerBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: MAROON.primary,
  },
  selectedCustomerCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: MAROON.border,
  },
  selectedCustomerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  selectedCustomerName: {
    fontSize: 13,
    fontWeight: "800",
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
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  locationCancelBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#64748b",
  },
  locationAddMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: MAROON.ultraLight,
    borderWidth: 1.5,
    borderColor: MAROON.border,
  },
  locationAddMoreBtnText: {
    fontSize: 13,
    fontWeight: "900",
    color: MAROON.primary,
  },
  locationConfirmSaleBtn: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: MAROON.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: MAROON.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  locationConfirmSaleBtnText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#ffffff",
  },
  openBottleBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
  },
  openBottleBannerHasOpen: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
  },
  openBottleBannerNoOpen: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
  },
  openBottleDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginHorizontal: 2,
  },
  openBottleBannerTitle: {
    fontSize: 12,
    fontWeight: "800",
  },
  openBottleBannerSub: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 1,
  },
});
