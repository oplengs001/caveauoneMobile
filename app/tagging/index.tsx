import BottlePickerModal, { BottleWithLocation } from "@/components/BottlePickerModal";
import LabelScanModal from "@/components/LabelScanModal";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertTriangle,
  Box,
  Camera,
  CheckCircle2,
  ChevronLeft,
  Map,
  Plus,
  RefreshCw,
  Save,
  ScanQrCode,
  Search,
  Tag,
  User,
  Wine,
  X,
  Zap
} from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import CustomerPickerModal from "../../components/CustomerPickerModal";
import { Customer, InventoryBottle, Location, MasterWine } from "../../types";

type TaggingState = "entry" | "scanning_qr" | "displaying" | "updating" | "success";

const STORAGE_CATEGORIES = [
  { label: "Locker", prefix: "L", icon: "🔒", major: "Locker", minor: "Box" },
  { label: "Room", prefix: "R", icon: "🚪", major: "Room", minor: "Shelf" },
  { label: "Fridge", prefix: "F", icon: "❄️", major: "Fridge", minor: "Slot" },
  { label: "Shelf", prefix: "S", icon: "📚", major: "Shelf", minor: "Pos" },
  { label: "Custom", prefix: "X", icon: "➕", major: "ID", minor: "Sub" },
];

const VAT_RATE = 0.12;

import VatBreakdownCard, { formatCurrency } from "../../components/VatBreakdownCard";

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function TaggingScreen() {
  const { profile } = useAuth();
  const isStoreUser = profile?.role === "store" || profile?.role === "store_manager" || profile?.role === "store_staff";
  const theme = isStoreUser ? Colors.store : profile?.role === "admin" ? Colors.admin : Colors.warehouse;
  const isStore = isStoreUser || profile?.role === "admin";

  const {
    bottleId: initialBottleId,
    bottleIds: bulkBottleIdsParam,
    mode,
    source,
    fromRequestId,
    fromOnboardingId,
    wineName,
    wineVintage,
    wineProducer,
    wineFormat,
  } = useLocalSearchParams<{
    bottleId?: string;
    bottleIds?: string;
    mode?: "sell";
    source?: string;
    fromRequestId?: string;
    fromOnboardingId?: string;
    wineName?: string;
    wineVintage?: string;
    wineProducer?: string;
    wineFormat?: string;
  }>();

  // Parse bulk bottle IDs if provided
  const bulkBottleIds = bulkBottleIdsParam
    ? bulkBottleIdsParam.split(",").filter(Boolean)
    : null;
  const isBulkMode = bulkBottleIds && bulkBottleIds.length > 1;

  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<TaggingState>(
    isBulkMode || initialBottleId ? "displaying" : "entry",
  );

  // Entry States
  const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);
  const [isBottlePickerModalOpen, setIsBottlePickerModalOpen] = useState(false);
  const [selectedWineForPicker, setSelectedWineForPicker] = useState<MasterWine | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [masterWines, setMasterWines] = useState<MasterWine[]>([]);
  const [availableMasterWineIds, setAvailableMasterWineIds] = useState<Set<string>>(new Set());
  const [bottlesList, setBottlesList] = useState<BottleWithLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [bottle, setBottle] = useState<InventoryBottle | null>(null);
  const [wine, setWine] = useState<MasterWine | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    null,
  );
  const [isIncoming, setIsIncoming] = useState(false);
  const [successAction, setSuccessAction] = useState<
    "sold" | "received" | "tagged" | null
  >(null);

  // Fast-moving flag — drives whether we pre-populate the price
  const [wineCategory, setWineCategory] = useState<"fast" | "fine" | "reserve" | null>(null);
  const [storeVatMode, setStoreVatMode] = useState<"excluded" | "included">("excluded");

  // Add Location Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newCat, setNewCat] = useState(STORAGE_CATEGORIES[0]);
  const [newMajor, setNewMajor] = useState("");
  const [newMinor, setNewMinor] = useState("");
  const [newCapacity, setNewCapacity] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);

  // Sell Bottle state
  const [salePrice, setSalePrice] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);

  const [locationInputMode, setLocationInputMode] = useState<"browse" | "scan">(
    "browse",
  );

  const isPrompting = useRef(false);
  const lastInvalidScanTime = useRef<number>(0);

  // Snackbar State
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const snackbarOpacity = useRef(new Animated.Value(0)).current;
  const snackbarTranslateY = useRef(new Animated.Value(-50)).current;

  const showSnackbar = (message: string) => {
    setSnackbarMessage(message);
    Animated.parallel([
      Animated.timing(snackbarOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(snackbarTranslateY, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(snackbarOpacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(snackbarTranslateY, {
            toValue: -50,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start(() => setSnackbarMessage(null));
      }, 10000);
    });
  };

  const isProcessing = useRef(false);
  const router = useRouter();

  useEffect(() => {
    const fetchMasterWines = async () => {
      try {
        const [winesData, bottlesData] = await Promise.all([
          apiFetch("/wines"),
          apiFetch(
            `/bottles?status=received,shelved${profile?.locationId ? `&storeId=${profile.locationId}` : ""}`
          ),
        ]);
        const winesList: MasterWine[] = winesData.wines || winesData;
        const bottlesList: InventoryBottle[] = bottlesData.bottles || bottlesData;
        setMasterWines(winesList);

        const ids = new Set<string>();
        bottlesList.forEach((b: any) => {
          const refId = b.masterWineId || b.masterWineRef?.id;
          if (refId) ids.add(refId);
        });
        setAvailableMasterWineIds(ids);
      } catch (err) { }
    };
    fetchMasterWines();
    fetchLocations();
    fetchStoreVatMode();
    if (initialBottleId && mode !== "sell") {
      loadBottleData(initialBottleId as string);
    }
  }, [initialBottleId, profile?.locationId, profile?.role]);

  const fetchStoreVatMode = async (overrideStoreId?: string) => {
    const storeId = overrideStoreId || profile?.locationId;
    if (!storeId) return;
    try {
      const storesData = await apiFetch("/stores");
      const storesList: any[] = storesData.stores || storesData;
      const store = storesList.find((s) => s.id === storeId);
      if (store) {
        if (store.vatMode === "included") {
          setStoreVatMode("included");
        } else {
          setStoreVatMode("excluded");
        }
      }
    } catch (e) {
      console.error("Error fetching vatMode:", e);
    }
  };

  // ── Fetch store_wine_settings when wine is loaded in sell mode ─────────────
  // Only pre-populate price if the wine is marked as fast-moving.
  useEffect(() => {
    if (mode !== "sell" || !wine) return;
    // For admin: use the bottle's store; for store user: use profile.locationId
    const effectiveStoreId = profile?.role === "admin"
      ? (bottle as any)?.storeRef?.id
      : profile?.locationId;
    if (!effectiveStoreId) return;

    const checkFastMoving = async () => {
      try {
        const settingsData = await apiFetch(`/stock-settings?storeId=${effectiveStoreId}&masterWineId=${wine.id}`);
        const settingsList: any[] = settingsData.settings || settingsData;

        if (settingsList.length > 0) {
          const setting = settingsList[0];
          const cat = setting.wineCategory ?? null;
          setWineCategory(cat);

          if (setting.sellingPrice) {
            setSalePrice(String(setting.sellingPrice));
          } else {
            setSalePrice("");
          }

          if (setting.vatMode) {
            setStoreVatMode(setting.vatMode);
          }
        } else {
          setSalePrice("");
        }
      } catch (err) {
        setSalePrice("");
      }
    };

    checkFastMoving();
  }, [wine, bottle, mode, profile?.locationId, profile?.role]);


  const handleSelectWine = async (wineId: string) => {
    try {
      const params = new URLSearchParams({
        masterWineId: wineId,
        status: "received,shelved",
      });
      if (profile?.locationId) params.set("storeId", profile.locationId);

      const [bottlesData, locationsData] = await Promise.all([
        apiFetch(`/bottles?${params}`),
        apiFetch("/locations"),
      ]);

      const rawBottles: InventoryBottle[] = bottlesData.bottles || bottlesData;
      const locationsList: Location[] = locationsData.locations || locationsData;
      const locationMap: Record<string, string> = {};
      locationsList.forEach((l) => (locationMap[l.id] = l.name));

      const bottles: BottleWithLocation[] = rawBottles.map((b: any) => ({
        bottleId: b.id,
        locationName: b.locationId ? (locationMap[b.locationId] || "Unassigned") : "Unassigned",
        locationId: b.locationId || "unassigned",
      }));

      setBottlesList(bottles);
      if (bottles.length === 1) {
        loadBottleData(bottles[0].bottleId);
      } else {
        const selectedWine = masterWines.find((w) => w.id === wineId) || null;
        setSelectedWineForPicker(selectedWine);
        setIsBottlePickerModalOpen(true);
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Could not load bottles.");
    }
  };

  const filteredWines = masterWines
    .filter(
      (w) =>
        availableMasterWineIds.has(w.id) &&
        (
          w.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          w.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          w.vintage?.toLowerCase().includes(searchQuery.toLowerCase())
        )
    )
    .slice(0, 10);

  const fetchLocations = async (targetStoreId?: string) => {
    const storeId = targetStoreId || profile?.locationId;
    try {
      const url = storeId ? `/locations?storeId=${storeId}` : "/locations";
      const data = await apiFetch(url);
      const locs: Location[] = data.locations || data;
      setLocations(locs);
    } catch (error) {
      console.error("Error fetching locations:", error);
    }
  };

  const loadBottleData = async (bottleId: string) => {
    if (loading || isProcessing.current) return;
    isProcessing.current = true;
    setLoading(true);

    try {
      const bottleData: InventoryBottle = await apiFetch(`/bottles/${bottleId}`);
      setBottle(bottleData);

      const bottleStoreId = bottleData.storeId || (bottleData as any).storeRef?.id;
      fetchLocations(bottleStoreId || profile?.locationId);

      if (profile?.role === "admin" && mode === "sell" && bottleStoreId) {
        fetchStoreVatMode(bottleStoreId);
      }

      if (
        isStore &&
        profile?.role !== "admin" &&
        profile?.locationId &&
        bottleStoreId !== profile.locationId
      ) {
        setIsIncoming(true);
      } else {
        setIsIncoming(false);
      }

      const masterWineId = bottleData.masterWineId || (bottleData as any).masterWineRef?.id;
      if (masterWineId) {
        const wineData = await apiFetch(`/wines/${masterWineId}`);
        setWine(wineData as MasterWine);
      }

      setSelectedLocationId(bottleData.locationId || null);
      setState("displaying");
    } catch (error) {
      console.error("Error fetching bottle details:", error);
      Alert.alert("Error", "Failed to retrieve bottle data.");
      isProcessing.current = false;
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLocation = async () => {
    if (!profile?.locationId || !newMajor) return;
    setSavingLocation(true);
    const generatedCode = newMinor
      ? `${newCat.prefix}${newMajor.toUpperCase()}-${newMinor}`
      : `${newCat.prefix}${newMajor.toUpperCase()}`;

    try {
      const docRef = await apiFetch("/locations", {
        method: "POST",
        body: JSON.stringify({
          name: generatedCode,
          type: newCat.label,
          storeId: profile.locationId,
          majorId: newMajor.toUpperCase(),
          minorId: newMinor,
          prefix: newCat.prefix,
          capacity: newCapacity ? parseInt(newCapacity, 10) : null,
        }),
      });

      Alert.alert("Success", "New storage location created.");
      await fetchLocations();
      setSelectedLocationId(docRef.id || docRef);
      setIsAddModalOpen(false);
      setNewMajor("");
      setNewMinor("");
      setNewCapacity("");
    } catch (error) {
      console.error("Error creating location:", error);
      Alert.alert("Error", "Failed to create storage location.");
    } finally {
      setSavingLocation(false);
    }
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (state !== "entry" && state !== "scanning_qr") return;
    loadBottleData(data);
  };

  const handleConfirmTagging = async (overrideLocationId?: string | any) => {
    const locId =
      typeof overrideLocationId === "string"
        ? overrideLocationId
        : selectedLocationId;
    if (!locId) return;
    if (!isBulkMode && !bottle) return;
    setState("updating");
    try {
      if (isBulkMode && bulkBottleIds) {
        await Promise.all(
          bulkBottleIds.map((bid) =>
            apiFetch(`/bottles/${bid}`, {
              method: "PATCH",
              body: JSON.stringify({
                locationId: locId,
                status: "shelved",
              }),
            })
          ),
        );
      } else {
        await apiFetch(`/bottles/${bottle!.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            locationId: locId,
            status: "shelved",
          }),
        });
      }
      await AsyncStorage.setItem("forceDashboardRefresh", "true");
      setSuccessAction("tagged");
      setState("success");
    } catch (error) {
      console.error("Error updating bottle:", error);
      Alert.alert("Error", "Failed to finalize shelving.");
      setState("displaying");
    }
  };

  const handleReceiveStock = async () => {
    if (!bottle || !profile?.locationId) return;
    setState("updating");
    try {
      await apiFetch(`/bottles/${bottle.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          storeId: profile.locationId,
          locationId: null,
          status: "shelved",
        }),
      });
      await AsyncStorage.setItem("forceDashboardRefresh", "true");
      setSuccessAction("received");
      setState("success");
    } catch (error) {
      console.error("Error receiving stock:", error);
      Alert.alert("Error", "Failed to update bottle location.");
      setState("displaying");
    }
  };

  const handleMarkAsSold = async () => {
    if (!bottle || !salePrice) {
      setPriceError("Please enter a sale price.");
      return;
    }

    if (bottle.status === "consumed") {
      Alert.alert(
        "Already Sold",
        "This bottle has already been marked as sold.",
      );
      return;
    }

    const numericPrice = parseFloat(salePrice);
    if (isNaN(numericPrice)) {
      setPriceError("Invalid price format.");
      return;
    }

    if (wine?.price !== undefined && numericPrice < wine.price) {
      setPriceError("Sale price cannot be lower than the unit cost.");
      return;
    }

    setPriceError(null);
    setState("updating");
    try {
      let netPrice = numericPrice;
      let vatAmount = numericPrice * VAT_RATE;
      let totalAmount = numericPrice + vatAmount;

      if (storeVatMode === "included") {
        netPrice = numericPrice / (1 + VAT_RATE);
        vatAmount = numericPrice - netPrice;
        totalAmount = numericPrice;
      }

      const bottleStoreId = bottle.storeId || (bottle as any)?.storeRef?.id || (bottle as any)?.store?.id;
      const effectiveSaleStoreId = profile?.locationId || bottleStoreId;

      await apiFetch("/sales", {
        method: "POST",
        body: JSON.stringify({
          bottleId: bottle.id,
          masterWineId: wine?.id || null,
          wineName: wine?.name,
          vintage: wine?.vintage,
          producer: wine?.producer,
          format: wine?.format,
          storeId: effectiveSaleStoreId,
          soldById: profile?.id,
          soldByEmail: profile?.email,
          price: netPrice,
          vatAmount,
          totalAmount,
          vatMode: storeVatMode,
          customerId: selectedCustomer?.id || null,
          customerName: selectedCustomer?.name || null,
          wineCategory,
          masterWinePrice: wine?.price || null,
        }),
      });

      await apiFetch(`/bottles/${bottle.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "consumed",
          locationId: null,
        }),
      });

      // Auto-request restock if PAR level reached (store users only, not admin)
      const masterWineId = wine?.id || bottle.masterWineId;
      if (isStoreUser && profile?.locationId && masterWineId && wine) {
        const storeId = profile.locationId;
        try {
          const settingsData = await apiFetch(`/stock-settings?storeId=${storeId}&masterWineId=${masterWineId}`);
          const settingsList: any[] = settingsData.settings || settingsData;

          if (settingsList.length > 0) {
            const setting = settingsList[0];
            if (
              !setting.discontinued &&
              setting.parLevel !== undefined &&
              setting.safetyStock !== undefined
            ) {
              const bottlesData = await apiFetch(`/bottles?storeId=${storeId}&masterWineId=${masterWineId}&status=received,shelved`);
              const bottlesList: any[] = bottlesData.bottles || bottlesData;
              const stockCount = bottlesList.length;

              if (stockCount <= setting.parLevel) {
                const requestsData = await apiFetch(`/wine-requests?storeId=${storeId}&status=pending`);
                const pendingRequests: any[] = Array.isArray(requestsData)
                  ? requestsData
                  : requestsData.wineRequests || [];

                let hasPending = false;
                pendingRequests.forEach((req: any) => {
                  const items = Array.isArray(req.items)
                    ? req.items
                    : typeof req.items === "string"
                      ? JSON.parse(req.items)
                      : [];
                  items.forEach((item: any) => {
                    if (item.masterWineId === masterWineId) hasPending = true;
                  });
                });

                if (!hasPending) {
                  const requestedQty = Math.max(
                    0,
                    setting.safetyStock - stockCount,
                  );
                  if (requestedQty > 0) {
                    await apiFetch("/wine-requests", {
                      method: "POST",
                      body: JSON.stringify({
                        storeId,
                        targetStoreId: "warehouse",
                        createdBy: profile.email || "System",
                        requesterId: profile.id || "system",
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
                            price: wine.price || 0,
                            pulledQty: 0,
                          },
                        ],
                        totalAmount: (wine.price || 0) * requestedQty,
                      }),
                    });
                    showSnackbar(
                      `Par level reached! Automatically requested ${requestedQty} bottle${requestedQty > 1 ? "s" : ""} for restock.`,
                    );
                  }
                }
              }
            }
          }
        } catch (e) {
          console.error("Error checking PAR alert:", e);
        }
      }

      await AsyncStorage.setItem("forceDashboardRefresh", "true");
      setSuccessAction("sold");
      setState("success");
    } catch (error) {
      console.error("Error marking as sold:", error);
      Alert.alert("Error", "Failed to update status.");
      setState("displaying");
    }
  };

  const resetSellState = () => {
    isProcessing.current = false;
    setState("entry");
    setBottle(null);
    setWine(null);
    setSelectedLocationId(null);
    setIsIncoming(false);
    setSuccessAction(null);
    setSalePrice("");
    setSelectedCustomer(null);
    setIsCustomerModalOpen(false);
    setPriceError(null);

  };

  // ── Derived VAT values ─────────────────────────────────────────────────────
  const numericBase = parseFloat(salePrice) || 0;
  const isIncluded = storeVatMode === "included";
  const vatAmount = isIncluded ? numericBase - (numericBase / (1 + VAT_RATE)) : numericBase * VAT_RATE;
  const totalWithVat = isIncluded ? numericBase : numericBase + vatAmount;

  // Group locations for Browse mode
  const groupedLocations = locations.reduce(
    (acc, loc) => {
      if (!acc[loc.type]) acc[loc.type] = [];
      acc[loc.type].push(loc);
      return acc;
    },
    {} as Record<string, Location[]>,
  );
  const sortedLocationTypes = Object.keys(groupedLocations).sort();

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Camera size={80} color="#334155" strokeWidth={1} />
        <Text style={styles.permissionText}>
          Camera access is required to scan bottle QR codes.
        </Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={requestPermission}
        >
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Success ── */}
      {state === "success" && (
        <View style={styles.successContainer}>
          <View style={styles.successCircle}>
            <CheckCircle2 size={80} color="#10b981" strokeWidth={3} />
          </View>
          <Text style={styles.successTitle}>
            {successAction === "sold"
              ? "Bottle Sold!"
              : successAction === "received"
                ? "Bottle Received!"
                : isBulkMode
                  ? `${bulkBottleIds!.length} Bottles Tagged!`
                  : "Location Tagged!"}
          </Text>
          <Text style={styles.successDesc}>
            {successAction === "sold"
              ? "The bottle has been marked as sold and removed from active inventory."
              : successAction === "received"
                ? "The bottle has been successfully added to your store's inventory."
                : isBulkMode
                  ? `All ${bulkBottleIds!.length} bottles have been assigned to the same storage location.`
                  : "The bottle has been assigned to its new storage location."}
          </Text>

          <View
            style={[
              styles.successCard,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <Text
              style={[
                styles.wineName,
                { color: theme.text, textAlign: "center" },
              ]}
            >
              {isBulkMode ? wineName : wine?.name}
            </Text>
            <Text
              style={[
                styles.wineVintage,
                {
                  color: theme.textSecondary,
                  textAlign: "center",
                  marginTop: 8,
                },
              ]}
            >
              {isBulkMode
                ? [wineVintage, wineProducer, wineFormat]
                  .filter(Boolean)
                  .join(" • ")
                : `${wine?.vintage} • ${wine?.producer} • ${wine?.format}`}
            </Text>
            {successAction === "sold" && numericBase > 0 && (
              <View
                style={[
                  styles.saleSummaryRow,
                  { borderTopColor: theme.border },
                ]}
              >
                <View style={styles.saleSummaryItem}>
                  <Text
                    style={[
                      styles.saleSummaryLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    BASE
                  </Text>
                  <Text
                    style={[styles.saleSummaryValue, { color: theme.text }]}
                  >
                    {formatCurrency(numericBase)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.saleSummaryDivider,
                    { backgroundColor: theme.border },
                  ]}
                />
                <View style={styles.saleSummaryItem}>
                  <Text
                    style={[
                      styles.saleSummaryLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    VAT 12%
                  </Text>
                  <Text
                    style={[
                      styles.saleSummaryValue,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {formatCurrency(vatAmount)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.saleSummaryDivider,
                    { backgroundColor: theme.border },
                  ]}
                />
                <View style={styles.saleSummaryItem}>
                  <Text
                    style={[styles.saleSummaryLabel, { color: theme.primary }]}
                  >
                    TOTAL
                  </Text>
                  <Text
                    style={[styles.saleSummaryValue, { color: theme.primary }]}
                  >
                    {formatCurrency(totalWithVat)}
                  </Text>
                </View>
              </View>
            )}

            {successAction === "tagged" && selectedLocationId && (
              <View
                style={[
                  styles.saleSummaryRow,
                  { borderTopColor: theme.border, marginTop: 16 },
                ]}
              >
                <View style={styles.saleSummaryItem}>
                  <Text
                    style={[
                      styles.saleSummaryLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    STORAGE LOCATION
                  </Text>
                  <Text
                    style={[styles.saleSummaryValue, { color: theme.primary }]}
                  >
                    {locations.find((l) => l.id === selectedLocationId)?.name ||
                      selectedLocationId}
                  </Text>
                </View>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={[
              styles.mainButton,
              { backgroundColor: theme.primary, marginTop: 40 },
            ]}
            onPress={() => {
              if (source === "wine-request" && fromRequestId) {
                router.replace({
                  pathname: `/wine-requests/${fromRequestId}` as any,
                  params: { openScanner: "true" },
                });
              } else if (source === "onboarding" && fromOnboardingId) {
                router.replace({
                  pathname: `/onboarding/${fromOnboardingId}` as any,
                  params: { openScanner: "true" },
                });
              } else {
                resetSellState();
              }
            }}
          >
            <ScanQrCode size={24} color="#fff" />
            <Text style={styles.mainButtonText}>Scan Another Bottle</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => {
              if (source === "wine-request" && fromRequestId) {
                router.replace(`/wine-requests/${fromRequestId}` as any);
              } else if (source === "onboarding" && fromOnboardingId) {
                router.replace(`/onboarding/${fromOnboardingId}` as any);
              } else {
                router.back();
              }
            }}
          >
            <Text style={styles.secondaryButtonText}>Finish & Return</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Entry Options ── */}
      {state === "entry" && (
        <View style={{ flex: 1, padding: 24 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 24 }}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center", marginRight: 12 }}
            >
              <ChevronLeft size={22} color={theme.text} strokeWidth={2.5} />
            </TouchableOpacity>
            <View>
              <Text style={{ fontSize: 26, fontWeight: "900", color: theme.text }}>Move or Tag</Text>
              <Text style={{ fontSize: 14, color: theme.textSecondary }}>Find the bottle you want to move.</Text>
            </View>
          </View>

          <View style={{ gap: 16, marginBottom: 32 }}>
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", padding: 20, borderWidth: 1, borderColor: theme.border, borderRadius: 16, backgroundColor: theme.card }}
              onPress={() => setState("scanning_qr")}
            >
              <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: theme.primary + "20", alignItems: "center", justifyContent: "center" }}>
                <ScanQrCode size={24} color={theme.primary} />
              </View>
              <View style={{ flex: 1, marginLeft: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: "800", color: theme.text }}>Scan QR Code</Text>
                <Text style={{ fontSize: 14, color: theme.textSecondary }}>Fastest if bottle has sticker.</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", padding: 20, borderWidth: 1, borderColor: theme.border, borderRadius: 16, backgroundColor: theme.card }}
              onPress={() => setIsLabelModalOpen(true)}
            >
              <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: theme.primary + "20", alignItems: "center", justifyContent: "center" }}>
                <Camera size={24} color={theme.primary} />
              </View>
              <View style={{ flex: 1, marginLeft: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: "800", color: theme.text }}>Scan Label (AI)</Text>
                <Text style={{ fontSize: 14, color: theme.textSecondary }}>Verify physical wine label.</Text>
              </View>
            </TouchableOpacity>
          </View>

          <Text style={{ fontSize: 14, fontWeight: "800", color: theme.textSecondary, marginBottom: 12, textTransform: "uppercase" }}>Search Wine</Text>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card, marginBottom: 16 }}>
            <Search size={20} color={theme.textSecondary} />
            <TextInput
              style={{ flex: 1, fontSize: 16, marginLeft: 12, color: theme.text }}
              placeholder="Search by name, SKU..."
              placeholderTextColor={theme.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <X size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView style={{ flex: 1 }}>
            {filteredWines.map((w) => (
              <TouchableOpacity
                key={w.id}
                style={{ flexDirection: "row", alignItems: "center", paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: theme.border }}
                onPress={() => handleSelectWine(w.id)}
              >
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(0,0,0,0.05)", alignItems: "center", justifyContent: "center" }}>
                  <Wine size={20} color={theme.primary} />
                </View>
                <View style={{ flex: 1, marginLeft: 16 }}>
                  <Text style={{ fontSize: 16, fontWeight: "800", color: theme.text }}>{w.name}</Text>
                  <Text style={{ fontSize: 14, color: theme.textSecondary }}>{w.vintage} • {w.producer}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <LabelScanModal
            visible={isLabelModalOpen}
            onClose={() => setIsLabelModalOpen(false)}
            onBottleSelected={(id) => loadBottleData(id)}
            theme={theme}
          />
          <BottlePickerModal
            visible={isBottlePickerModalOpen}
            onClose={() => setIsBottlePickerModalOpen(false)}
            onBottleSelected={(id) => {
              setIsBottlePickerModalOpen(false);
              loadBottleData(id);
            }}
            bottles={bottlesList}
            theme={theme}
            wineName={selectedWineForPicker?.name}
            wineVintage={selectedWineForPicker?.vintage}
            wineProducer={selectedWineForPicker?.producer}
          />
        </View>
      )}

      {/* ── QR Scanner ── */}
      {state === "scanning_qr" && (
        <View style={styles.scannerContainer}>
          <CameraView
            style={styles.camera}
            facing="back"
            onBarcodeScanned={handleBarcodeScanned}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          >
            <View style={styles.overlay}>
              <View style={styles.scanTargetContainer}>
                <View style={styles.scanTarget} />
                <View style={[styles.corner, styles.topLeft]} />
                <View style={[styles.corner, styles.topRight]} />
                <View style={[styles.corner, styles.bottomLeft]} />
                <View style={[styles.corner, styles.bottomRight]} />
                <ScanQrCode
                  size={40}
                  color="rgba(16, 185, 129, 0.5)"
                  style={styles.centerIcon}
                />
              </View>
              <Text style={styles.instructionText}>
                CENTER QR CODE IN FRAME
              </Text>
              <TouchableOpacity
                onPress={() => setState("entry")}
                style={styles.closeButton}
              >
                <X size={28} color="#fff" />
              </TouchableOpacity>
            </View>
          </CameraView>
        </View>
      )}

      {/* ── Displaying / Updating ── */}
      {(state === "displaying" || state === "updating") && (
        <View
          style={[
            styles.detailsContainer,
            { backgroundColor: theme.background },
          ]}
        >
          {/* Header */}
          <View
            style={[
              styles.header,
              {
                borderBottomColor: theme.border,
                borderBottomWidth: isStore ? 1 : 0,
              },
            ]}
          >
            <TouchableOpacity
              onPress={() => {
                isProcessing.current = false;
                setState("entry");
              }}
              style={[
                styles.backButton,
                {
                  backgroundColor: isStore ? theme.card : "transparent",
                  padding: isStore ? 10 : 0,
                  borderRadius: 12,
                  borderWidth: isStore ? 1 : 0,
                  borderColor: theme.border,
                },
              ]}
            >
              <RefreshCw
                size={20}
                color={isStore ? theme.primary : "#fff"}
                strokeWidth={2.5}
              />
              <Text
                style={[
                  styles.backText,
                  { color: isStore ? theme.primary : "#fff" },
                ]}
              >
                RESCAN
              </Text>
            </TouchableOpacity>
            <Text style={[styles.title, { color: theme.text }]}>
              {mode === "sell" ? "Sell Bottle" : "Tag Location"}
            </Text>
          </View>

          {/* Wine info card */}
          <View
            style={[
              styles.card,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <Box size={14} color={theme.secondary} />
              <Text style={[styles.skuLabel, { color: theme.textSecondary }]}>
                {isBulkMode
                  ? `BULK TAGGING (${bulkBottleIds?.length} BOTTLES)`
                  : `BOTTLE ID: ${bottle?.id.toUpperCase()}`}
              </Text>
              {wineCategory === "fast" && mode === "sell" && (
                <View
                  style={[
                    styles.fastMovingChip,
                    { backgroundColor: "#f59e0b18", borderColor: "#f59e0b40" },
                  ]}
                >
                  <Zap size={10} color="#f59e0b" />
                  <Text style={styles.fastMovingChipText}>FAST MOVING</Text>
                </View>
              )}
            </View>
            <Text
              style={[
                styles.wineName,
                { color: theme.text, paddingRight: mode === "sell" ? 80 : 0 },
              ]}
            >
              {isBulkMode ? wineName : wine?.name || "Processing..."}
            </Text>
            <View
              style={[
                styles.wineMetaRow,
                { paddingRight: mode === "sell" ? 80 : 0 },
              ]}
            >
              <Text
                style={[styles.wineVintage, { color: theme.textSecondary }]}
              >
                {isBulkMode ? wineVintage : wine?.vintage}
              </Text>
              <View
                style={[styles.metaDot, { backgroundColor: theme.border }]}
              />
              <Text
                style={[styles.wineProducer, { color: theme.textSecondary }]}
              >
                {isBulkMode ? wineProducer : (wine?.producer || "Independent Producer")}
              </Text>
              {(isBulkMode ? wineFormat : wine?.format) && (
                <>
                  <View
                    style={[styles.metaDot, { backgroundColor: theme.border }]}
                  />
                  <Text
                    style={[styles.wineFormat, { color: theme.textSecondary }]}
                  >
                    {isBulkMode ? wineFormat : wine?.format}
                  </Text>
                </>
              )}
            </View>

            {/* Positioned at the bottom right */}
            {/* FEATURE TOGGLE: Hide unit cost for now */}
            {false && mode === "sell" && wine?.price ? (
              <View
                style={[
                  styles.refPriceChip,
                  {
                    position: "absolute",
                    right: 16,
                    bottom: 16,
                    backgroundColor: theme.primary + "15",
                    borderColor: theme.primary + "40",
                    marginLeft: 0, // Reset from style definition
                  },
                ]}
              ></View>
            ) : null}
          </View>

          {/* ── Status-based content ── */}
          {bottle?.status === "consumed" ? (
            <View style={styles.incomingWarningContainer}>
              <AlertTriangle size={48} color="#f59e0b" strokeWidth={1.5} />
              <Text style={styles.incomingWarningTitle}>
                Bottle Already {mode === "sell" ? "Sold" : "Consumed"}
              </Text>
              <Text style={styles.incomingWarningText}>
                This bottle is already marked as 'consumed' and cannot be
                processed again.
              </Text>
              <TouchableOpacity
                style={[
                  styles.onboardingButton,
                  { backgroundColor: theme.primary },
                ]}
                onPress={resetSellState}
              >
                <Text style={styles.onboardingButtonText}>
                  SCAN ANOTHER BOTTLE
                </Text>
              </TouchableOpacity>
            </View>
          ) : bottle?.status === "incoming" ? (
            <View style={styles.incomingWarningContainer}>
              <AlertTriangle size={48} color="#f59e0b" strokeWidth={1.5} />
              <Text style={styles.incomingWarningTitle}>
                Verification Required
              </Text>
              <Text style={styles.incomingWarningText}>
                This bottle is currently marked as incoming. You need to verify
                the sticker first before it can be tagged.
              </Text>
              <TouchableOpacity
                style={[
                  styles.onboardingButton,
                  { backgroundColor: theme.primary },
                ]}
                onPress={() =>
                  isStore
                    ? ((isProcessing.current = false),
                      setState("entry"),
                      setIsIncoming(false))
                    : router.push("/onboarding")
                }
              >
                <Text style={styles.onboardingButtonText}>
                  {isStore ? "RESCAN BOTTLE" : "VIEW ONBOARDING TASKS"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : isStore && isIncoming && bottle?.status !== "outbound" ? (
            <View style={styles.incomingWarningContainer}>
              <AlertTriangle size={48} color="#f59e0b" strokeWidth={1.5} />
              <Text style={styles.incomingWarningTitle}>Transfer Required</Text>
              <Text style={styles.incomingWarningText}>
                This bottle must be dispatched from its current location before
                it can be received here.
              </Text>
              <TouchableOpacity
                style={[
                  styles.onboardingButton,
                  { backgroundColor: theme.primary },
                ]}
                onPress={() => {
                  isProcessing.current = false;
                  setState("entry");
                  setIsIncoming(false);
                }}
              >
                <Text style={styles.onboardingButtonText}>RESCAN BOTTLE</Text>
              </TouchableOpacity>
            </View>
          ) : isIncoming ? (
            <View style={{ flex: 1, justifyContent: "center" }}>
              <View
                style={[
                  styles.infoBanner,
                  {
                    flexDirection: "column",
                    alignItems: "center",
                    backgroundColor: "rgba(16, 185, 129, 0.05)",
                    borderColor: "rgba(16, 185, 129, 0.2)",
                    padding: 32,
                    borderRadius: 24,
                  },
                ]}
              >
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    backgroundColor: "rgba(16, 185, 129, 0.1)",
                    justifyContent: "center",
                    alignItems: "center",
                    marginBottom: 16,
                  }}
                >
                  <CheckCircle2 size={32} color="#10b981" />
                </View>
                <Text
                  style={[
                    styles.infoBannerTitle,
                    { color: "#10b981", fontSize: 20, textAlign: "center" },
                  ]}
                >
                  Ready to Receive
                </Text>
                <Text
                  style={[
                    styles.infoBannerText,
                    { textAlign: "center", fontSize: 15, marginTop: 8 },
                  ]}
                >
                  This bottle is inbound and ready. Tap the receive button below
                  to finalize its transfer into your store inventory.
                </Text>
              </View>
            </View>
          ) : mode === "sell" ? (
            /* ── Sell mode ── */
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ paddingBottom: 160 }}>
                {/* Price input section */}
                <View style={styles.sellSection}>
                  <View style={styles.sellSectionHeader}>
                    <Tag size={15} color={theme.primary} />
                    <Text
                      style={[styles.sellSectionTitle, { color: theme.text }]}
                    >
                      Sale Price
                    </Text>
                    <View style={{ flex: 1 }} />
                    {wineCategory === "fast" ? (
                      <Text
                        style={[styles.autoFilledHint, { color: "#f59e0b" }]}
                      >
                        ✦ Auto-filled
                      </Text>
                    ) : (
                      <View style={{ flexDirection: "row", backgroundColor: theme.primary + "1A", borderRadius: 8, padding: 2 }}>
                        <TouchableOpacity
                          onPress={() => setStoreVatMode("excluded")}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: 6,
                            backgroundColor: storeVatMode === "excluded" ? theme.card : "transparent",
                            shadowColor: storeVatMode === "excluded" ? "#000" : "transparent",
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: 0.1,
                            shadowRadius: 1,
                            elevation: storeVatMode === "excluded" ? 1 : 0,
                          }}
                        >
                          <Text style={{ fontSize: 10, fontWeight: "800", color: storeVatMode === "excluded" ? theme.primary : theme.primary + "80" }}>EX VAT</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setStoreVatMode("included")}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: 6,
                            backgroundColor: storeVatMode === "included" ? theme.card : "transparent",
                            shadowColor: storeVatMode === "included" ? "#000" : "transparent",
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: 0.1,
                            shadowRadius: 1,
                            elevation: storeVatMode === "included" ? 1 : 0,
                          }}
                        >
                          <Text style={{ fontSize: 10, fontWeight: "800", color: storeVatMode === "included" ? theme.primary : theme.primary + "80" }}>INC VAT</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                  <View
                    style={[
                      styles.priceInputWrapper,
                      {
                        backgroundColor: theme.card,
                        borderColor: priceError
                          ? "#ef4444"
                          : salePrice
                            ? theme.primary + "60"
                            : theme.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.currencySymbol,
                        { color: theme.textSecondary },
                      ]}
                    >
                      ₱
                    </Text>
                    <TextInput
                      style={[styles.priceInput, { color: theme.text }]}
                      placeholder="0.00"
                      placeholderTextColor={theme.textSecondary}
                      keyboardType="decimal-pad"
                      value={salePrice}
                      onChangeText={(text) => {
                        setSalePrice(text);
                        if (priceError) setPriceError(null);
                      }}
                    />
                  </View>
                  {priceError ? (
                    <Text style={{ color: "#ef4444", fontSize: 12, fontWeight: "600", marginTop: 8, paddingHorizontal: 4 }}>
                      {priceError}
                    </Text>
                  ) : wineCategory !== "fast" ? (
                    <Text
                      style={[styles.priceHint, { color: theme.textSecondary }]}
                    >
                      {storeVatMode === "included" ? "Enter the gross price. VAT will be extracted automatically." : "Enter the agreed sale price for this bottle."}
                    </Text>
                  ) : null}
                </View>

                {/* VAT Breakdown Card */}
                <VatBreakdownCard
                  basePrice={salePrice}
                  theme={theme}
                  isFastMoving={wineCategory === "fast"}
                  vatMode={storeVatMode}
                />

                {/* Customer */}
                <View style={styles.sellSection}>
                  <View style={styles.sellSectionHeader}>
                    <User size={15} color={theme.textSecondary} />
                    <Text
                      style={[styles.sellSectionTitle, { color: theme.text }]}
                    >
                      Customer
                      <Text
                        style={[
                          styles.optionalLabel,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {" "}
                        (optional)
                      </Text>
                    </Text>
                  </View>

                  {selectedCustomer ? (
                    <View
                      style={[
                        styles.buyerInput,
                        {
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          backgroundColor: theme.primary + "1A",
                          borderColor: theme.primary + "40",
                        },
                      ]}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", flex: 1, gap: 10 }}>
                        <User size={16} color={theme.primary} />
                        <Text style={{ fontSize: 16, fontWeight: "700", color: theme.primary }} numberOfLines={1}>
                          {selectedCustomer.name}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => setSelectedCustomer(null)} style={{ padding: 4 }}>
                        <X size={20} color={theme.primary} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => setIsCustomerModalOpen(true)}
                      style={[
                        styles.buyerInput,
                        {
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          backgroundColor: theme.card,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <Text style={{ fontSize: 15, color: theme.textSecondary, fontWeight: "600" }}>
                        Select or add customer...
                      </Text>
                      <Plus size={20} color={theme.textSecondary} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </ScrollView>
          ) : (
            /* ── Tag location mode ── */
            <>
              {isStore && (
                <View
                  style={[
                    styles.infoBanner,
                    {
                      backgroundColor: "rgba(99, 102, 241, 0.05)",
                      borderColor: "rgba(99, 102, 241, 0.2)",
                    },
                  ]}
                >
                  <Wine size={24} color="#6366f1" />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.infoBannerTitle, { color: "#6366f1" }]}
                    >
                      Store Actions
                    </Text>
                    <Text style={styles.infoBannerText}>
                      This item is active in your inventory. Select a physical
                      bin below.
                    </Text>
                  </View>
                </View>
              )}
              <View style={styles.sectionHeader}>
                <View
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Map size={18} color="#64748b" />
                  <Text style={styles.sectionTitle}>Storage Location</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setIsAddModalOpen(true)}
                  style={[
                    styles.addLocationButton,
                    { borderColor: theme.border },
                  ]}
                >
                  <Plus size={14} color={theme.primary} strokeWidth={3} />
                  <Text
                    style={[styles.addLocationText, { color: theme.primary }]}
                  >
                    NEW
                  </Text>
                </TouchableOpacity>
              </View>

              <View
                style={[
                  styles.locationToggleContainer,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.locationToggleTab,
                    locationInputMode === "browse" && {
                      backgroundColor: theme.primary,
                    },
                  ]}
                  onPress={() => setLocationInputMode("browse")}
                >
                  <Search
                    size={14}
                    color={
                      locationInputMode === "browse"
                        ? "#fff"
                        : theme.textSecondary
                    }
                  />
                  <Text
                    style={[
                      styles.locationToggleText,
                      {
                        color:
                          locationInputMode === "browse"
                            ? "#fff"
                            : theme.textSecondary,
                      },
                    ]}
                  >
                    Browse
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.locationToggleTab,
                    locationInputMode === "scan" && {
                      backgroundColor: theme.primary,
                    },
                  ]}
                  onPress={() => setLocationInputMode("scan")}
                >
                  <ScanQrCode
                    size={14}
                    color={
                      locationInputMode === "scan"
                        ? "#fff"
                        : theme.textSecondary
                    }
                  />
                  <Text
                    style={[
                      styles.locationToggleText,
                      {
                        color:
                          locationInputMode === "scan"
                            ? "#fff"
                            : theme.textSecondary,
                      },
                    ]}
                  >
                    Scan QR
                  </Text>
                </TouchableOpacity>
              </View>

              {locationInputMode === "scan" ? (
                <View style={styles.scanLocationContainer}>
                  <CameraView
                    style={styles.scanLocationCamera}
                    facing="back"
                    onBarcodeScanned={({ data }) => {
                      if (isPrompting.current) return;
                      const found = locations.find((l) => l.id === data);
                      if (found) {
                        if (selectedLocationId === data) return;
                        isPrompting.current = true;
                        Alert.alert(
                          "Confirm Location",
                          `Set location to ${found.name} (${found.type})?`,
                          [
                            {
                              text: "Cancel",
                              style: "cancel",
                              onPress: () => {
                                isPrompting.current = false;
                              },
                            },
                            {
                              text: "Confirm",
                              onPress: () => {
                                setSelectedLocationId(data);
                                showSnackbar(`Location ${found.name} selected`);
                                isPrompting.current = false;
                                handleConfirmTagging(data);
                              },
                            },
                          ],
                          {
                            onDismiss: () => {
                              isPrompting.current = false;
                            },
                          },
                        );
                      } else {
                        const now = Date.now();
                        if (now - lastInvalidScanTime.current > 2000) {
                          lastInvalidScanTime.current = now;
                          showSnackbar("Location not found");
                        }
                      }
                    }}
                  />
                  <Text
                    style={[
                      styles.scanLocationHint,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Scan a unit's QR code to set location
                  </Text>
                </View>
              ) : (
                <ScrollView
                  contentContainerStyle={styles.locationList}
                  showsVerticalScrollIndicator={false}
                >
                  {locations.length === 0 ? (
                    <View style={styles.emptyContainer}>
                      <AlertTriangle size={48} color="#334155" />
                      <Text style={styles.emptyText}>
                        No storage locations configured.
                      </Text>
                    </View>
                  ) : (
                    sortedLocationTypes.map((type) => (
                      <View key={type} style={styles.locationGroup}>
                        <Text
                          style={[
                            styles.locationGroupTitle,
                            { color: theme.text },
                          ]}
                        >
                          {type}s{" "}
                          <Text style={styles.locationGroupCount}>
                            ({groupedLocations[type].length})
                          </Text>
                        </Text>
                        <View style={styles.locationGroupGrid}>
                          {groupedLocations[type].map((item) => (
                            <TouchableOpacity
                              key={item.id}
                              style={[
                                styles.locationItem,
                                {
                                  backgroundColor: theme.card,
                                  borderColor: theme.border,
                                  width: "48%",
                                  flex: 0,
                                  marginBottom: 0,
                                },
                                selectedLocationId === item.id && [
                                  styles.locationItemSelected,
                                  {
                                    backgroundColor: theme.accent,
                                    borderColor: theme.accent,
                                  },
                                ],
                              ]}
                              onPress={() => setSelectedLocationId(item.id)}
                            >
                              <View
                                style={[
                                  styles.locationIconContainer,
                                  {
                                    backgroundColor:
                                      selectedLocationId === item.id
                                        ? "rgba(255,255,255,0.2)"
                                        : theme.background,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.locationPrefix,
                                    {
                                      color:
                                        selectedLocationId === item.id
                                          ? "#fff"
                                          : theme.primary,
                                    },
                                  ]}
                                >
                                  {(item as any).prefix ||
                                    (item.type === "Locker"
                                      ? "L"
                                      : item.type.charAt(0))}
                                </Text>
                              </View>
                              <Text
                                style={[
                                  styles.locationName,
                                  { color: theme.text },
                                  selectedLocationId === item.id &&
                                  styles.locationNameSelected,
                                ]}
                              >
                                {item.name}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    ))
                  )}
                </ScrollView>
              )}
            </>
          )}

          {/* ── Footer ── */}
          <View style={[styles.footer, { backgroundColor: theme.background }]}>
            {bottle?.status !== "incoming" &&
              bottle?.status !== "consumed" &&
              !(isStore && isIncoming && bottle?.status !== "outbound") && (
                <>
                  {mode === "sell" ? (
                    isStore && (
                      <>
                        {/* Inline price summary strip above button */}
                        {numericBase > 0 && (
                          <View
                            style={[
                              styles.footerPriceSummary,
                              {
                                backgroundColor: theme.card,
                                borderColor: theme.border,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.footerPriceLabel,
                                { color: theme.textSecondary },
                              ]}
                            >
                              Total incl. VAT
                            </Text>
                            <Text
                              style={[
                                styles.footerPriceValue,
                                { color: theme.primary },
                              ]}
                            >
                              {formatCurrency(totalWithVat)}
                            </Text>
                          </View>
                        )}
                        <TouchableOpacity
                          style={[
                            styles.confirmButton,
                            { backgroundColor: theme.primary },
                            state === "updating" && styles.buttonDisabled,
                          ]}
                          onPress={handleMarkAsSold}
                          disabled={state === "updating"}
                        >
                          {state === "updating" ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <>
                              <Wine size={24} color="#fff" strokeWidth={2.5} />
                              <Text style={styles.confirmButtonText}>
                                Mark as Sold
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </>
                    )
                  ) : isIncoming ? (
                    <TouchableOpacity
                      style={[
                        styles.confirmButton,
                        { backgroundColor: "#059669" },
                        state === "updating" && styles.buttonDisabled,
                      ]}
                      onPress={handleReceiveStock}
                      disabled={state === "updating"}
                    >
                      {state === "updating" ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <CheckCircle2
                            size={24}
                            color="#fff"
                            strokeWidth={2.5}
                          />
                          <Text style={styles.confirmButtonText}>
                            RECEIVE INTO STORE
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.confirmButton,
                        {
                          backgroundColor: isStore
                            ? theme.secondary
                            : "#10b981",
                        },
                        (!selectedLocationId || state === "updating") &&
                        styles.buttonDisabled,
                      ]}
                      onPress={handleConfirmTagging}
                      disabled={!selectedLocationId || state === "updating"}
                    >
                      {state === "updating" ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <CheckCircle2
                            size={24}
                            color="#fff"
                            strokeWidth={2.5}
                          />
                          <Text style={styles.confirmButtonText}>
                            {isStore ? "UPDATE LOCATION" : "FINALIZE SHELVING"}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </>
              )}
          </View>
        </View>
      )}

      {/* ── Add Location Modal ── */}
      <Modal
        visible={isAddModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsAddModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  Add Storage Unit
                </Text>
                <Text style={styles.modalSubtitle}>
                  Create a new bin for this store
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsAddModalOpen(false)}
                style={styles.modalClose}
              >
                <X size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalForm}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.modalLabel}>CATEGORY</Text>
              <View style={styles.catGrid}>
                {STORAGE_CATEGORIES.map((c) => (
                  <TouchableOpacity
                    key={c.label}
                    onPress={() => setNewCat(c)}
                    style={[
                      styles.catItem,
                      { borderColor: theme.border },
                      newCat.label === c.label && {
                        borderColor: theme.primary,
                        backgroundColor: theme.background,
                      },
                    ]}
                  >
                    <Text style={styles.catIcon}>{c.icon}</Text>
                    <Text
                      style={[
                        styles.catLabel,
                        newCat.label === c.label && { color: theme.primary },
                      ]}
                    >
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.inputRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>
                    {newCat.major.toUpperCase()}
                  </Text>
                  <TextInput
                    style={[
                      styles.modalInput,
                      { color: theme.text, borderColor: theme.border },
                    ]}
                    placeholder="e.g. D18"
                    placeholderTextColor="#475569"
                    value={newMajor}
                    onChangeText={setNewMajor}
                    autoCapitalize="characters"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>
                    {newCat.minor.toUpperCase()}
                  </Text>
                  <TextInput
                    style={[
                      styles.modalInput,
                      { color: theme.text, borderColor: theme.border },
                    ]}
                    placeholder="e.g. 20"
                    placeholderTextColor="#475569"
                    value={newMinor}
                    onChangeText={setNewMinor}
                  />
                </View>
              </View>

              <Text style={styles.modalLabel}>UNIT CAPACITY</Text>
              <TextInput
                style={[
                  styles.modalInput,
                  { color: theme.text, borderColor: theme.border },
                ]}
                placeholder="Bottles..."
                placeholderTextColor="#475569"
                keyboardType="numeric"
                value={newCapacity}
                onChangeText={setNewCapacity}
              />

              <View style={styles.previewContainer}>
                <Text style={styles.previewLabel}>GENERATED CODE</Text>
                <Text style={[styles.previewCode, { color: theme.primary }]}>
                  {newCat.prefix}
                  {newMajor.toUpperCase()}
                  {newMinor || "--"}
                </Text>
              </View>

              <TouchableOpacity
                onPress={handleCreateLocation}
                disabled={savingLocation || !newMajor}
                style={[
                  styles.saveButton,
                  { backgroundColor: theme.primary },
                  (!newMajor || savingLocation) && styles.buttonDisabled,
                ]}
              >
                {savingLocation ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Save size={20} color="#fff" strokeWidth={2.5} />
                    <Text style={styles.saveButtonText}>SAVE LOCATION</Text>
                  </>
                )}
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Snackbar ── */}
      {snackbarMessage && (
        <Animated.View
          style={[
            styles.snackbar,
            {
              opacity: snackbarOpacity,
              transform: [{ translateY: snackbarTranslateY }],
            },
          ]}
        >
          <AlertTriangle size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.snackbarText}>{snackbarMessage}</Text>
        </Animated.View>
      )}

      <CustomerPickerModal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        storeId={profile?.locationId || bottle?.storeId || (bottle as any)?.storeRef?.id || ""}
        theme={theme}
        onSelectCustomer={setSelectedCustomer}
        selectedCustomerId={selectedCustomer?.id}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    backgroundColor: "#0f172a",
  },
  permissionText: {
    color: "#94a3b8",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 24,
    lineHeight: 24,
    marginBottom: 40,
  },
  permissionButton: {
    backgroundColor: "#4f46e5",
    paddingVertical: 18,
    paddingHorizontal: 40,
    borderRadius: 20,
    shadowColor: "#4f46e5",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  permissionButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  scannerContainer: { flex: 1 },
  camera: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  scanTargetContainer: {
    width: 260,
    height: 260,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  scanTarget: {
    width: 260,
    height: 260,
    backgroundColor: "rgba(16, 185, 129, 0.05)",
    borderRadius: 32,
  },
  centerIcon: { position: "absolute" },
  corner: {
    position: "absolute",
    width: 40,
    height: 40,
    borderColor: "#10b981",
    borderWidth: 4,
  },
  topLeft: {
    top: -2,
    left: -2,
    borderBottomWidth: 0,
    borderRightWidth: 0,
    borderTopLeftRadius: 32,
  },
  topRight: {
    top: -2,
    right: -2,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderTopRightRadius: 32,
  },
  bottomLeft: {
    bottom: -2,
    left: -2,
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomLeftRadius: 32,
  },
  bottomRight: {
    bottom: -2,
    right: -2,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderBottomRightRadius: 32,
  },
  instructionText: {
    color: "#fff",
    marginTop: 40,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  closeButton: {
    position: "absolute",
    top: 60,
    left: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  detailsContainer: { flex: 1, padding: 24 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 24 },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e293b",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginRight: 16,
    borderWidth: 1,
    borderColor: "#334155",
    gap: 8,
  },
  backText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  title: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: -0.5,
  },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#334155",
  },
  skuLabel: {
    color: "#10b981",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  wineName: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  wineMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  wineVintage: { fontSize: 14, fontWeight: "800" },
  metaDot: { width: 4, height: 4, borderRadius: 2 },
  wineProducer: { fontSize: 13, fontWeight: "600" },
  wineFormat: { fontSize: 13, fontWeight: "700" },
  fastMovingChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    marginLeft: "auto",
  },
  fastMovingChipText: {
    color: "#f59e0b",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  refPriceChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    marginLeft: "auto",
  },
  refPriceChipText: {
    fontSize: 10,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },

  // Sell mode
  sellSection: { marginBottom: 20 },
  sellSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sellSectionTitle: { fontSize: 14, fontWeight: "800" },
  autoFilledHint: { fontSize: 11, fontWeight: "700", marginLeft: "auto" },
  optionalLabel: { fontSize: 13, fontWeight: "600" },
  priceInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 18,
    height: 64,
  },
  currencySymbol: { fontSize: 22, fontWeight: "900", marginRight: 8 },
  priceInput: { flex: 1, fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  priceHint: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 8,
    paddingHorizontal: 4,
  },
  buyerInput: {
    height: 56,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 18,
    fontSize: 15,
    fontWeight: "700",
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  sectionTitle: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  addLocationButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  addLocationText: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  locationList: { paddingBottom: 120 },
  locationRow: { justifyContent: "space-between", gap: 12 },
  locationItem: {
    backgroundColor: "#1e293b",
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
    flex: 1,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#334155",
    gap: 10,
  },
  locationItemSelected: {
    borderColor: "#4f46e5",
    shadowColor: "#4f46e5",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  locationName: {
    color: "#94a3b8",
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: -1,
  },
  locationNameSelected: { color: "#fff" },
  locationIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  locationPrefix: { fontSize: 20, fontWeight: "900" },
  locationType: {
    color: "#475569",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  emptyContainer: { alignItems: "center", paddingVertical: 60, gap: 16 },
  emptyText: {
    color: "#475569",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },

  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: 28,
  },
  footerPriceSummary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  footerPriceLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  footerPriceValue: { fontSize: 20, fontWeight: "900", letterSpacing: -0.5 },
  confirmButton: {
    height: 68,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  confirmButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  buttonDisabled: { opacity: 0.3 },

  // Success
  successContainer: {
    flex: 1,
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  successCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 40,
  },
  successTitle: {
    color: "#94a3b8",
    fontSize: 32,
    fontWeight: "900",
    marginBottom: 12,
    textAlign: "center",
  },
  successDesc: {
    color: "#94a3b8",
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
    fontWeight: "500",
    marginBottom: 32,
  },
  successCard: {
    width: "100%",
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
  },
  saleSummaryRow: {
    flexDirection: "row",
    width: "100%",
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    justifyContent: "space-around",
  },
  saleSummaryItem: { alignItems: "center", gap: 4 },
  saleSummaryLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  saleSummaryValue: { fontSize: 14, fontWeight: "800" },
  saleSummaryDivider: { width: 1, height: "100%" },
  mainButton: {
    width: "100%",
    flexDirection: "row",
    paddingHorizontal: 30,
    paddingVertical: 20,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  mainButtonText: { color: "#fff", fontSize: 18, fontWeight: "900" },
  secondaryButton: {
    width: "100%",
    padding: 20,
    marginTop: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: { color: "#64748b", fontSize: 16, fontWeight: "800" },

  // Warnings
  incomingWarningContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(245, 158, 11, 0.05)",
    borderRadius: 32,
    padding: 32,
    marginTop: 8,
    borderWidth: 2,
    borderColor: "#f59e0b",
    borderStyle: "dashed",
    gap: 16,
  },
  incomingWarningTitle: {
    color: "#f59e0b",
    fontSize: 22,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: -0.5,
  },
  incomingWarningText: {
    color: "#94a3b8",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 24,
    maxWidth: "80%",
  },
  onboardingButton: {
    marginTop: 24,
    paddingHorizontal: 32,
    paddingVertical: 18,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  onboardingButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 16,
    marginBottom: 24,
  },
  infoBannerTitle: {
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  infoBannerText: {
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },

  // Add location modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 32,
    minHeight: "60%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 32,
  },
  modalTitle: { fontSize: 24, fontWeight: "900", letterSpacing: -0.5 },
  modalSubtitle: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
  },
  modalClose: { padding: 8 },
  modalForm: { flex: 1 },
  modalLabel: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  catGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 24,
  },
  catItem: {
    flex: 1,
    minWidth: "30%",
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 6,
  },
  catIcon: { fontSize: 20 },
  catLabel: {
    fontSize: 9,
    fontWeight: "900",
    color: "#64748b",
    textTransform: "uppercase",
  },
  inputRow: { flexDirection: "row", gap: 16, marginBottom: 24 },
  modalInput: {
    height: 60,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 20,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 24,
  },
  previewContainer: {
    backgroundColor: "#0f172a",
    padding: 24,
    borderRadius: 24,
    alignItems: "center",
    marginBottom: 32,
  },
  previewLabel: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 8,
  },
  previewCode: { fontSize: 32, fontWeight: "900", letterSpacing: -1 },
  saveButton: {
    height: 64,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 1,
  },

  // Snackbar
  snackbar: {
    position: "absolute",
    top: 60,
    left: 20,
    right: 20,
    backgroundColor: "#f97316",
    padding: 16,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
    zIndex: 999,
  },
  snackbarText: { color: "#fff", fontSize: 14, fontWeight: "600", flex: 1 },

  // Scan & Grouped locations
  locationToggleContainer: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  locationToggleTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderRadius: 8,
  },
  locationToggleText: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  scanLocationContainer: {
    alignItems: "center",
    marginTop: 8,
    paddingBottom: 160,
  },
  scanLocationCamera: {
    width: "100%",
    height: 450,
    borderRadius: 24,
    overflow: "hidden",
    marginBottom: 16,
  },
  scanLocationHint: {
    fontSize: 14,
    fontWeight: "600",
  },
  locationGroup: {
    marginBottom: 24,
  },
  locationGroupTitle: {
    fontSize: 16,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  locationGroupCount: {
    color: "#94a3b8",
    fontSize: 14,
  },
  locationGroupGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
  },
});
