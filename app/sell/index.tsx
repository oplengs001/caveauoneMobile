import BottlePickerModal, { BottleWithLocation } from "@/components/BottlePickerModal";
import CustomerPickerModal from "@/components/CustomerPickerModal";
import LabelScanModal from "@/components/LabelScanModal";
import VatBreakdownCard, { formatCurrency } from "@/components/VatBreakdownCard";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { Customer, InventoryBottle, MasterWine } from "@/types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  MapPin,
  Plus,
  Scan,
  Search,
  Tag,
  User,
  Wine,
  X,
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type SellStep = "search" | "portion" | "locate" | "verify" | "sell" | "success";

const VAT_RATE = 0.12;

export default function SellScreen() {
  const router = useRouter();
  const { wineId } = useLocalSearchParams();
  const { profile } = useAuth();
  const isStore = profile?.role === "store" || profile?.role === "store_manager" || profile?.role === "store_staff";
  const theme = isStore ? Colors.store : profile?.role === "admin" ? Colors.admin : Colors.warehouse;

  // Permissions
  const [permission, requestPermission] = useCameraPermissions();

  // State
  const [step, setStep] = useState<SellStep>("portion");
  const [searchQuery, setSearchQuery] = useState("");
  const [masterWines, setMasterWines] = useState<MasterWine[]>([]);
  const [selectedWine, setSelectedWine] = useState<MasterWine | null>(null);
  const [inStockWineIds, setInStockWineIds] = useState<Set<string>>(new Set());
  const [openBottlesMap, setOpenBottlesMap] = useState<Record<string, InventoryBottle>>({});

  const [bottlesList, setBottlesList] = useState<BottleWithLocation[]>([]);
  const [selectedBottleId, setSelectedBottleId] = useState<string | null>(null);
  const [openBottle, setOpenBottle] = useState<InventoryBottle | null>(null);
  const [saleType, setSaleType] = useState<"bottle" | "glass" | "karaf">("bottle");

  const [isFetchingLocations, setIsFetchingLocations] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parAlertInfo, setParAlertInfo] = useState<{
    wineName: string;
    requestedQty: number;
    stockCount: number;
  } | null>(null);

  // Verification UI
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);
  const [isPickerModalOpen, setIsPickerModalOpen] = useState(false);

  const [displayLimit, setDisplayLimit] = useState(20);

  // Sell Form
  const [salePrice, setSalePrice] = useState("");
  const [storeVatMode, setStoreVatMode] = useState<"included" | "excluded">("excluded");
  const [wineCategory, setWineCategory] = useState<"fast" | "fine" | "reserve" | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);

  useEffect(() => {
    fetchMasterWines();
  }, [profile?.locationId]);

  const fetchMasterWines = async () => {
    try {
      const winesData = await apiFetch("/wines");
      const winesList: MasterWine[] = Array.isArray(winesData)
        ? winesData
        : Array.isArray(winesData?.wines)
          ? winesData.wines
          : [];
      setMasterWines(winesList);

      if (profile?.locationId) {
        const bottlesData = await apiFetch(`/bottles?storeId=${profile.locationId}&status=received,shelved,open`);
        const bottlesList: InventoryBottle[] = Array.isArray(bottlesData)
          ? bottlesData
          : Array.isArray(bottlesData?.bottles)
            ? bottlesData.bottles
            : [];
        const inStockIds = new Set<string>();
        const openMap: Record<string, InventoryBottle> = {};

        bottlesList.forEach((b: any) => {
          const refId = b.masterWineId || b.masterWineRef?.id;
          if (refId) {
            inStockIds.add(refId);
            if (b.status === "open" && (b.glassesRemaining ?? 0) > 0) {
              openMap[refId] = b;
            }
          }
        });
        setInStockWineIds(inStockIds);
        setOpenBottlesMap(openMap);
      }
    } catch (err) {
      console.error("Error fetching master wines", err);
    }
  };

  useEffect(() => {
    if (wineId && masterWines.length > 0) {
      const w = masterWines.find(x => x.id === wineId);
      if (w && step === "search") {
        handleSelectWine(w);
      }
    }
  }, [wineId, masterWines]);

  const filteredWines = useMemo(() => {
    let available = masterWines;
    if (profile?.locationId && inStockWineIds.size > 0) {
      available = masterWines.filter(w => inStockWineIds.has(w.id));
    }

    if (!searchQuery) return available.slice(0, displayLimit);
    const q = searchQuery.toLowerCase();
    return available.filter(w =>
      w.name?.toLowerCase().includes(q) ||
      w.sku?.toLowerCase().includes(q) ||
      w.vintage?.toLowerCase().includes(q) ||
      w.producer?.toLowerCase().includes(q)
    ).slice(0, displayLimit);
  }, [searchQuery, masterWines, inStockWineIds, profile?.locationId, displayLimit]);

  useEffect(() => {
    setDisplayLimit(20); // Reset limit on search change
  }, [searchQuery]);

  const handleSelectWine = async (wine: MasterWine) => {
    setSelectedWine(wine);
    setSearchQuery("");
    setOpenBottle(null);

    // Fetch bottles for this wine at this store
    setIsFetchingLocations(true);
    try {
      const params = new URLSearchParams({
        masterWineId: wine.id,
        status: "received,shelved,open",
      });
      if (profile?.locationId) params.set("storeId", profile.locationId);

      const bottlesData = await apiFetch(`/bottles?${params}`);
      const bottles: InventoryBottle[] = bottlesData.bottles || bottlesData;

      const foundOpenBottle = bottles.find(
        (b) => b.status === "open" && (b.glassesRemaining ?? 0) > 0
      );
      setOpenBottle(foundOpenBottle || null);

      const locationsData = await apiFetch("/locations");
      const locs: any[] = locationsData.locations || locationsData;
      const locationMap: Record<string, string> = {};
      locs.forEach((l) => (locationMap[l.id] = l.name));

      const bottlePickerList: BottleWithLocation[] = bottles.map((b: any) => ({
        bottleId: b.id,
        locationName: b.locationId ? (locationMap[b.locationId] || "Assigned") : "Unassigned",
        locationId: b.locationId || "unassigned",
        status: b.status,
        glassesRemaining: b.glassesRemaining,
        readableId: b.bottleId || b.readableId,
      }));

      setBottlesList(bottlePickerList);

      if (profile?.locationId) {
        const settingsData = await apiFetch(`/stock-settings?storeId=${profile.locationId}&masterWineId=${wine.id}`);
        const settingsList: any[] = settingsData.settings || settingsData;
        if (settingsList.length > 0) {
          const setting = settingsList[0];
          setWineCategory(setting.wineCategory ?? null);
          if (setting.sellingPrice) setSalePrice(setting.sellingPrice.toString());
          if (setting.vatMode) setStoreVatMode(setting.vatMode);
        } else if (wine.price) {
          setSalePrice(wine.price.toString());
        }
      } else if (wine.price) {
        setSalePrice(wine.price.toString());
      }

      // For Glass or Karaf: skip locate & verify entirely!
      // Select open bottle if available, otherwise select first available bottle.
      if (saleType !== "bottle") {
        if (foundOpenBottle) {
          setSelectedBottleId(foundOpenBottle.id || foundOpenBottle.bottleId || null);
        } else if (bottles.length > 0) {
          setSelectedBottleId(bottles[0].id || (bottles[0] as any).bottleId || null);
        }
        setStep("sell");
      } else {
        setStep("locate");
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Could not load bottle locations.");
    } finally {
      setIsFetchingLocations(false);
    }
  };

  const handleSelectPortion = (type: "bottle" | "glass" | "karaf") => {
    setSaleType(type);
    setStep("search");
  };

  const handleQRScanned = ({ data }: { data: string }) => {
    if (!isCameraActive || step !== "verify") return;

    const isValid = bottlesList.some(b => b.bottleId === data);
    if (!isValid) {
      Alert.alert("Invalid Bottle", "This QR code does not belong to an available bottle of the selected wine in this store.");
      return;
    }

    setIsCameraActive(false);
    setSelectedBottleId(data);
    setStep("sell");
  };

  const handleBottleSelected = (bottleId: string) => {
    setSelectedBottleId(bottleId);
    setStep("sell");
  };

  const handleMarkAsSold = async () => {
    const numericPrice = parseFloat(salePrice);
    if (isNaN(numericPrice) || numericPrice <= 0) {
      setPriceError("Please enter a valid price");
      return;
    }

    let targetBottleId: string | null = selectedBottleId;
    if (saleType !== "bottle" && openBottle) {
      targetBottleId = openBottle.id || openBottle.bottleId || null;
    }
    if (!targetBottleId && bottlesList.length > 0) {
      targetBottleId = bottlesList[0].bottleId;
    }
    if (!targetBottleId) {
      Alert.alert("Error", "No bottle selected or available.");
      return;
    }

    setIsProcessing(true);
    try {
      const isIncluded = storeVatMode === "included";
      let netPrice = numericPrice;
      let vatAmount = numericPrice * VAT_RATE;
      let totalAmount = numericPrice + vatAmount;

      if (isIncluded) {
        netPrice = numericPrice / (1 + VAT_RATE);
        vatAmount = numericPrice - netPrice;
        totalAmount = numericPrice;
      }

      let glassCount = 1.0;
      let glassesDeducted = 6;
      if (saleType === "glass") {
        glassCount = 0.1667;
        glassesDeducted = 1;
      } else if (saleType === "karaf") {
        glassCount = 0.3333;
        glassesDeducted = 2;
      }

      // Create a sales record
      await apiFetch("/sales", {
        method: "POST",
        body: JSON.stringify({
          bottleId: targetBottleId,
          masterWineId: selectedWine?.id || null,
          wineName: selectedWine?.name,
          vintage: selectedWine?.vintage,
          producer: selectedWine?.producer,
          format: selectedWine?.format,
          storeId: profile?.locationId || null,
          soldById: profile?.id,
          soldByEmail: profile?.email,
          price: netPrice,
          vatAmount,
          totalAmount,
          vatMode: storeVatMode,
          customerId: selectedCustomer?.id || null,
          customerName: selectedCustomer?.name || null,
          wineCategory,
          masterWinePrice: selectedWine?.price || null,
          saleType,
          glassCount,
        }),
      });

      // Update bottle status and glasses remaining
      if (saleType === "bottle") {
        await apiFetch(`/bottles/${targetBottleId}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "consumed",
            glassesRemaining: 0,
            locationId: null,
          }),
        });
      } else {
        let currentGlasses = 6;
        if (openBottle && (openBottle.id === targetBottleId || openBottle.bottleId === targetBottleId)) {
          currentGlasses = openBottle.glassesRemaining ?? 6;
        } else {
          try {
            const b = await apiFetch(`/bottles/${targetBottleId}`);
            if (b && b.glassesRemaining !== undefined && b.glassesRemaining !== null) {
              currentGlasses = b.glassesRemaining;
            }
          } catch (e) {
            console.error("Could not fetch bottle for glasses update", e);
          }
        }

        const newGlassesRemaining = Math.max(0, currentGlasses - glassesDeducted);
        const newStatus = newGlassesRemaining === 0 ? "consumed" : "open";

        await apiFetch(`/bottles/${targetBottleId}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: newStatus,
            glassesRemaining: newGlassesRemaining,
            ...(newStatus === "consumed" ? { locationId: null } : {}),
          }),
        });
      }

      // PAR Alert logic
      if (isStore && profile?.locationId && selectedWine) {
        const storeId = profile.locationId;
        try {
          const settingsData = await apiFetch(`/stock-settings?storeId=${storeId}&masterWineId=${selectedWine.id}`);
          const settingsList: any[] = settingsData.settings || settingsData;

          if (settingsList.length > 0) {
            const setting = settingsList[0];
            if (
              !setting.discontinued &&
              setting.parLevel !== undefined &&
              setting.safetyStock !== undefined
            ) {
              const bottlesData = await apiFetch(`/bottles?storeId=${storeId}&masterWineId=${selectedWine.id}&status=received,shelved,open`);
              const fetchedBottles: any[] = bottlesData.bottles || bottlesData;

              const stockCount = fetchedBottles.reduce((acc, b) => {
                if (b.status === "open" && b.glassesRemaining != null) {
                  return acc + (b.glassesRemaining / 6);
                }
                return acc + 1;
              }, 0);

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
                    if (item.masterWineId === selectedWine.id) hasPending = true;
                  });
                });

                if (!hasPending) {
                  const requestedQty = Math.ceil(Math.max(0, setting.safetyStock - stockCount));
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
                            masterWineId: selectedWine.id,
                            wineName: selectedWine.name,
                            vintage: selectedWine.vintage || "",
                            sku: selectedWine.sku || "",
                            format: selectedWine.format || "",
                            producer: selectedWine.producer || "",
                            qty: requestedQty,
                            price: selectedWine.price || 0,
                            pulledQty: 0,
                          },
                        ],
                        totalAmount: (selectedWine.price || 0) * requestedQty,
                      }),
                    });

                    setParAlertInfo({
                      wineName: selectedWine.name,
                      requestedQty,
                      stockCount: Math.round(stockCount * 10) / 10,
                    });
                  }
                }
              }
            }
          }
        } catch (e) {
          console.error("Error checking PAR alert in sell screen:", e);
        }
      }

      await AsyncStorage.setItem("forceDashboardRefresh", "true");
      setStep("success");
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Could not mark bottle as sold");
    } finally {
      setIsProcessing(false);
    }
  };

  const groupedLocations = useMemo(() => {
    return bottlesList.reduce((acc, b) => {
      acc[b.locationName] = (acc[b.locationName] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [bottlesList]);

  // UI Components per step
  const renderSelectedWineSummary = () => {
    if (!selectedWine) return null;
    return (
      <View style={{
        flexDirection: "row",
        alignItems: "center",
        padding: 16,
        backgroundColor: theme.primary + "15",
        borderColor: theme.primary + "40",
        borderWidth: 1,
        borderRadius: 16,
        marginBottom: 24,
        gap: 16,
      }}>
        <View style={[styles.wineIconContainer, { backgroundColor: theme.primary + "20" }]}>
          <Wine size={20} color={theme.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.wineName, { color: theme.text }]} numberOfLines={1}>{selectedWine.name}</Text>
          <Text style={[styles.wineSub, { color: theme.textSecondary }]}>
            {selectedWine.vintage}
            {selectedWine.producer ? ` • ${selectedWine.producer}` : ""}
            {selectedWine.format ? ` • ${selectedWine.format}` : ""}
          </Text>
        </View>
      </View>
    );
  };
  const renderSearch = () => (
    <View style={styles.content}>
      <Text style={[styles.headerText, { color: theme.text }]}>Select Wine</Text>

      {/* Portion Indicator Badge */}
      <View style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 20,
        backgroundColor: theme.primary + "12",
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.primary + "30",
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ fontSize: 20 }}>
            {saleType === "glass" ? "🍷" : saleType === "karaf" ? "🫗" : "🍾"}
          </Text>
          <View>
            <Text style={{ fontSize: 10, fontWeight: "800", color: theme.primary, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Selling Portion
            </Text>
            <Text style={{ fontSize: 14, fontWeight: "700", color: theme.text }}>
              {saleType === "glass" ? "Glass (1/6 Bottle)" : saleType === "karaf" ? "Karaf (2/6 Bottle)" : "Whole Bottle"}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => setStep("portion")}
          style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.primary }}
        >
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#fff" }}>Change</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.searchBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Search size={20} color={theme.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Search by name, producer, SKU, or vintage..."
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
      <FlatList
        style={styles.listArea}
        data={filteredWines}
        keyExtractor={(w) => w.id}
        onEndReached={() => setDisplayLimit((prev) => prev + 20)}
        onEndReachedThreshold={0.5}
        renderItem={({ item: w }) => {
          const openBtl = openBottlesMap[w.id];
          return (
            <TouchableOpacity
              style={[styles.wineRow, { borderBottomColor: theme.border }]}
              onPress={() => handleSelectWine(w)}
            >
              <View style={styles.wineIconContainer}>
                <Wine size={20} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.wineName, { color: theme.text }]}>{w.name}</Text>
                <Text style={[styles.wineSub, { color: theme.textSecondary }]}>
                  {w.vintage}
                  {w.producer ? ` • ${w.producer}` : ""}
                  {w.format ? ` • ${w.format}` : ""}
                </Text>
                {openBtl && (
                  <View style={{ marginTop: 4, alignSelf: "flex-start", backgroundColor: "#3b82f615", borderColor: "#3b82f640", borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: "#2563eb" }}>
                      🍷 Open bottle ({openBtl.glassesRemaining ?? 6}/6 glasses left)
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );

  const renderPortion = () => (
    <View style={styles.content}>
      <Text style={[styles.headerText, { color: theme.text, marginBottom: 8 }]}>What are you selling?</Text>
      <Text style={[styles.subText, { color: theme.textSecondary, marginBottom: 24 }]}>
        Select the serving portion to begin.
      </Text>

      <View style={{ gap: 14, marginTop: 10 }}>
        <TouchableOpacity
          style={[styles.verifyOptionBtn, { backgroundColor: theme.card, borderColor: theme.border, padding: 18 }]}
          onPress={() => handleSelectPortion("bottle")}
        >
          <View style={[styles.verifyIconBox, { backgroundColor: theme.primary + "20", width: 50, height: 50, borderRadius: 25 }]}>
            <Text style={{ fontSize: 24 }}>🍾</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.verifyOptionTitle, { color: theme.text, fontSize: 17 }]}>Whole Bottle</Text>
            <Text style={[styles.verifyOptionDesc, { color: theme.textSecondary, fontSize: 13 }]}>Sell a full bottle (1.0 bottle)</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.verifyOptionBtn, { backgroundColor: theme.card, borderColor: theme.border, padding: 18 }]}
          onPress={() => handleSelectPortion("glass")}
        >
          <View style={[styles.verifyIconBox, { backgroundColor: theme.primary + "20", width: 50, height: 50, borderRadius: 25 }]}>
            <Text style={{ fontSize: 24 }}>🍷</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.verifyOptionTitle, { color: theme.text, fontSize: 17 }]}>Glass (1/6 Bottle)</Text>
            <Text style={[styles.verifyOptionDesc, { color: theme.textSecondary, fontSize: 13 }]}>
              Pour 1 glass (applies to 75cl bottles)
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.verifyOptionBtn, { backgroundColor: theme.card, borderColor: theme.border, padding: 18 }]}
          onPress={() => handleSelectPortion("karaf")}
        >
          <View style={[styles.verifyIconBox, { backgroundColor: theme.primary + "20", width: 50, height: 50, borderRadius: 25 }]}>
            <Text style={{ fontSize: 24 }}>🫗</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.verifyOptionTitle, { color: theme.text, fontSize: 17 }]}>Karaf (2/6 Bottle)</Text>
            <Text style={[styles.verifyOptionDesc, { color: theme.textSecondary, fontSize: 13 }]}>
              Pour 2 glasses / carafe (applies to 75cl bottles)
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderLocate = () => (
    <View style={styles.content}>
      <Text style={[styles.headerText, { color: theme.text, marginBottom: 24 }]}>Locate Bottles</Text>
      {renderSelectedWineSummary()}

      {isFetchingLocations ? (
        <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 40 }} />
      ) : bottlesList.length === 0 ? (
        <View style={styles.emptyState}>
          <AlertCircle size={48} color={theme.danger} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Out of Stock</Text>
          <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
            There are no available bottles for this wine in your store.
          </Text>
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.primary }]} onPress={() => setStep("search")}>
            <Text style={styles.primaryBtnText}>Back to Search</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <View style={[styles.locateCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.locateTitle, { color: theme.text }]}>Found {bottlesList.length} Bottle(s)</Text>
            <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 12 }} />
            {Object.entries(groupedLocations).map(([locName, count]) => (
              <View key={locName} style={styles.locRow}>
                <MapPin size={16} color={theme.primary} />
                <Text style={[styles.locName, { color: theme.text }]}>{locName}</Text>
                <View style={{ flex: 1 }} />
                <Text style={[styles.locCount, { color: theme.textSecondary }]}>{count} btl</Text>
              </View>
            ))}
          </View>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.primary }]} onPress={() => setStep("verify")}>
            <Text style={styles.primaryBtnText}>Proceed to Verify</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderVerify = () => {
    if (!permission) return null;
    if (!permission.granted) {
      return (
        <View style={[styles.content, { alignItems: "center", justifyContent: "center" }]}>
          <View style={[styles.wineIconContainer, { width: 80, height: 80, borderRadius: 40, backgroundColor: theme.primary + "1A", marginBottom: 24 }]}>
            <Camera size={40} color={theme.primary} />
          </View>
          <Text style={[styles.headerText, { color: theme.text, textAlign: "center", fontSize: 24 }]}>Camera Access Needed</Text>
          <Text style={[styles.subText, { color: theme.textSecondary, textAlign: "center", marginBottom: 32 }]}>
            We need camera access to scan QR codes and verify wine labels.
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
            onPress={async () => {
              if (permission && !permission.canAskAgain) {
                Alert.alert(
                  "Permission Denied",
                  "Please enable camera permissions in your device settings to continue.",
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Open Settings", onPress: () => Linking.openSettings() }
                  ]
                );
              } else {
                await requestPermission();
              }
            }}
          >
            <Text style={styles.primaryBtnText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.content}>
        <Text style={[styles.headerText, { color: theme.text, marginBottom: 24 }]}>Verify Bottle</Text>
        {renderSelectedWineSummary()}
        <Text style={[styles.subText, { color: theme.textSecondary, marginBottom: 16 }]}>
          You grabbed a bottle. How do you want to verify it?
        </Text>

        {isCameraActive ? (
          <View style={styles.qrCameraContainer}>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              onBarcodeScanned={handleQRScanned}
            />
            <TouchableOpacity
              style={styles.closeCameraBtn}
              onPress={() => setIsCameraActive(false)}
            >
              <X size={24} color="#fff" />
            </TouchableOpacity>
            <View style={styles.qrOverlay}>
              <View style={styles.qrTarget} />
              <Text style={styles.qrHint}>Scan QR Code on Bottle</Text>
            </View>
          </View>
        ) : (
          <View style={styles.verifyOptions}>
            <TouchableOpacity
              style={[styles.verifyOptionBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={() => setIsCameraActive(true)}
            >
              <View style={[styles.verifyIconBox, { backgroundColor: theme.primary + "20" }]}>
                <Scan size={24} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.verifyOptionTitle, { color: theme.text }]}>Scan QR Code</Text>
                <Text style={[styles.verifyOptionDesc, { color: theme.textSecondary }]}>Fastest method if bottle has our sticker.</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.verifyOptionBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={() => setIsLabelModalOpen(true)}
            >
              <View style={[styles.verifyIconBox, { backgroundColor: theme.primary + "20" }]}>
                <Camera size={24} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.verifyOptionTitle, { color: theme.text }]}>Scan Label (AI)</Text>
                <Text style={[styles.verifyOptionDesc, { color: theme.textSecondary }]}>Use AI to verify the physical wine label.</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.verifyOptionBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={() => {
                const uniqueLocs = new Set(bottlesList.map(b => b.locationName));
                if (uniqueLocs.size <= 1 && bottlesList.length > 0) {
                  handleBottleSelected(bottlesList[0].bottleId);
                } else if (uniqueLocs.size > 1) {
                  setIsPickerModalOpen(true);
                }
              }}
            >
              <View style={[styles.verifyIconBox, { backgroundColor: theme.primary + "20" }]}>
                <CheckCircle2 size={24} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.verifyOptionTitle, { color: theme.text }]}>No QR Code?</Text>
                <Text style={[styles.verifyOptionDesc, { color: theme.textSecondary }]}>Bypass scan and auto-select an available bottle.</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        <LabelScanModal
          visible={isLabelModalOpen}
          onClose={() => setIsLabelModalOpen(false)}
          onBottleSelected={handleBottleSelected}
          storeId={profile?.locationId}
          masterWineId={selectedWine?.id}
          masterWineName={selectedWine?.name}
          theme={theme}
        />

        <BottlePickerModal
          visible={isPickerModalOpen}
          onClose={() => setIsPickerModalOpen(false)}
          onBottleSelected={handleBottleSelected}
          bottles={bottlesList}
          title="Bottle Retrieved from?"
          theme={theme}
        />
      </View>
    );
  };

  const renderSell = () => (
    <ScrollView style={styles.content}>
      <Text style={[styles.headerText, { color: theme.text, marginBottom: 24 }]}>Finalize Sale</Text>
      {renderSelectedWineSummary()}

      {selectedWine?.format === "75cl" && (
        <View style={styles.sellSection}>
          <View style={styles.sellSectionHeader}>
            <Wine size={15} color={theme.primary} />
            <Text style={[styles.sellSectionTitle, { color: theme.text }]}>Serving Portion</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <TouchableOpacity
              onPress={() => setSaleType("bottle")}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: "center",
                borderWidth: 1.5,
                borderColor: saleType === "bottle" ? theme.primary : theme.border,
                backgroundColor: saleType === "bottle" ? theme.primary + "15" : theme.card,
              }}
            >
              <Text style={{ fontSize: 18 }}>🍾</Text>
              <Text style={{ fontSize: 13, fontWeight: "700", color: saleType === "bottle" ? theme.primary : theme.text, marginTop: 4 }}>
                Bottle
              </Text>
              <Text style={{ fontSize: 10, color: theme.textSecondary }}>1.0 bottle</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setSaleType("glass")}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: "center",
                borderWidth: 1.5,
                borderColor: saleType === "glass" ? theme.primary : theme.border,
                backgroundColor: saleType === "glass" ? theme.primary + "15" : theme.card,
              }}
            >
              <Text style={{ fontSize: 18 }}>🍷</Text>
              <Text style={{ fontSize: 13, fontWeight: "700", color: saleType === "glass" ? theme.primary : theme.text, marginTop: 4 }}>
                Glass
              </Text>
              <Text style={{ fontSize: 10, color: theme.textSecondary }}>1/6 bottle</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setSaleType("karaf")}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: "center",
                borderWidth: 1.5,
                borderColor: saleType === "karaf" ? theme.primary : theme.border,
                backgroundColor: saleType === "karaf" ? theme.primary + "15" : theme.card,
              }}
            >
              <Text style={{ fontSize: 18 }}>🫗</Text>
              <Text style={{ fontSize: 13, fontWeight: "700", color: saleType === "karaf" ? theme.primary : theme.text, marginTop: 4 }}>
                Karaf
              </Text>
              <Text style={{ fontSize: 10, color: theme.textSecondary }}>2/6 bottle</Text>
            </TouchableOpacity>
          </View>

          {saleType !== "bottle" && (
            <View style={{ marginTop: 12, padding: 12, backgroundColor: theme.primary + "10", borderRadius: 10, borderWidth: 1, borderColor: theme.primary + "30" }}>
              {openBottle ? (
                <Text style={{ fontSize: 12, color: theme.primary, fontWeight: "600" }}>
                  🍷 Pouring from open bottle ({openBottle.bottleId || openBottle.readableId} — {openBottle.glassesRemaining ?? 6} glasses remaining)
                </Text>
              ) : (
                <Text style={{ fontSize: 12, color: theme.primary, fontWeight: "600" }}>
                  🍾 Auto-selected bottle ({selectedBottleId ? (bottlesList.find(b => b.bottleId === selectedBottleId)?.readableId || selectedBottleId) : "initial bottle"}) to open for this pour.
                </Text>
              )}
            </View>
          )}
        </View>
      )}

      <View style={styles.sellSection}>
        <View style={styles.sellSectionHeader}>
          <Tag size={15} color={theme.primary} />
          <Text style={[styles.sellSectionTitle, { color: theme.text }]}>Sale Price</Text>
          <View style={{ flex: 1 }} />
          {wineCategory !== "fast" && (
            <View style={{ flexDirection: "row", backgroundColor: theme.primary + "1A", borderRadius: 8, padding: 2 }}>
              <TouchableOpacity
                onPress={() => setStoreVatMode("excluded")}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 6,
                  backgroundColor: storeVatMode === "excluded" ? theme.card : "transparent",
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
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: "800", color: storeVatMode === "included" ? theme.primary : theme.primary + "80" }}>INC VAT</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={[styles.priceInputWrapper, { backgroundColor: theme.card, borderColor: priceError ? theme.danger : theme.border }]}>
          <Text style={[styles.currencySymbol, { color: theme.textSecondary }]}>₱</Text>
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
        {priceError && <Text style={{ color: theme.danger, fontSize: 12, marginTop: 8 }}>{priceError}</Text>}
      </View>

      <VatBreakdownCard
        basePrice={salePrice}
        theme={theme}
        isFastMoving={wineCategory === "fast"}
        vatMode={storeVatMode}
      />

      <View style={styles.sellSection}>
        <View style={styles.sellSectionHeader}>
          <User size={15} color={theme.textSecondary} />
          <Text style={[styles.sellSectionTitle, { color: theme.text }]}>Customer (optional)</Text>
        </View>

        {selectedCustomer ? (
          <View style={[styles.buyerInput, { backgroundColor: theme.primary + "1A", borderColor: theme.primary + "40" }]}>
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
            style={[styles.buyerInput, { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            <Text style={{ fontSize: 15, color: theme.textSecondary, fontWeight: "600" }}>Select or add customer...</Text>
            <Plus size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: theme.primary, marginTop: 24, opacity: isProcessing ? 0.7 : 1 }]}
        onPress={handleMarkAsSold}
        disabled={isProcessing}
      >
        {isProcessing ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Mark as Sold</Text>}
      </TouchableOpacity>

      <CustomerPickerModal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        onSelectCustomer={(cust) => {
          setSelectedCustomer(cust);
          setIsCustomerModalOpen(false);
        }}
        storeId={profile?.locationId || ""}
        theme={theme}
      />
      <View style={{ height: 40 }} />
    </ScrollView>
  );

  const handleSellAnother = () => {
    setSelectedWine(null);
    setSelectedBottleId(null);
    setOpenBottle(null);
    setSaleType("bottle");
    setBottlesList([]);
    setSearchQuery("");
    setSalePrice("");
    setPriceError(null);
    setSelectedCustomer(null);
    setParAlertInfo(null);
    fetchMasterWines();
    setStep("search");
  };

  const renderSuccess = () => {
    const isIncluded = storeVatMode === "included";
    const numericBase = parseFloat(salePrice) || 0;
    const vatAmount = isIncluded ? numericBase - (numericBase / (1 + VAT_RATE)) : numericBase * VAT_RATE;
    const totalWithVat = isIncluded ? numericBase : numericBase + vatAmount;

    return (
      <View style={[styles.content, { alignItems: "center", justifyContent: "center" }]}>
        <CheckCircle2 size={80} color={theme.primary} />
        <Text style={[styles.headerText, { color: theme.text, marginTop: 24 }]}>
          {saleType === "glass" ? "Glass Sold! 🍷" : saleType === "karaf" ? "Karaf Sold! 🫗" : "Bottle Sold! 🍾"}
        </Text>
        <Text style={[styles.subText, { color: theme.textSecondary, textAlign: "center", marginBottom: 24 }]}>
          {saleType === "glass"
            ? "1 glass (1/6 bottle) has been recorded."
            : saleType === "karaf"
              ? "1 karaf (2/6 bottle) has been recorded."
              : "The bottle has been marked as sold."}
        </Text>

        {parAlertInfo && (
          <View style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "#fff7ed",
            borderColor: "#ea580c",
            borderWidth: 1.5,
            borderRadius: 16,
            padding: 14,
            marginBottom: 20,
            width: "100%",
            gap: 12,
          }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(234, 88, 12, 0.15)", alignItems: "center", justifyContent: "center" }}>
              <AlertCircle size={20} color="#ea580c" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: "900", color: "#c2410c", textTransform: "uppercase", letterSpacing: 0.5 }}>
                PAR Alert — Restock Requested
              </Text>
              <Text style={{ fontSize: 11, fontWeight: "600", color: "#9a3412", marginTop: 2 }}>
                Stock hit PAR level ({parAlertInfo.stockCount} btl left). Auto-requested {parAlertInfo.requestedQty} bottle(s) of {parAlertInfo.wineName} from warehouse.
              </Text>
            </View>
            <TouchableOpacity onPress={() => setParAlertInfo(null)} style={{ padding: 4 }}>
              <X size={18} color="#ea580c" />
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.successCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.wineName, { color: theme.text, textAlign: "center" }]}>{selectedWine?.name}</Text>
          <View style={{ flexDirection: "row", justifyContent: "center", marginTop: 6, gap: 6 }}>
            <View style={{ backgroundColor: theme.primary + "1A", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: theme.primary }}>
                {saleType === "glass" ? "🍷 Glass (1/6)" : saleType === "karaf" ? "🫗 Karaf (2/6)" : "🍾 Whole Bottle"}
              </Text>
            </View>
          </View>

          <View style={[styles.saleSummaryRow, { borderTopColor: theme.border }]}>
            <View style={styles.saleSummaryItem}>
              <Text style={[styles.saleSummaryLabel, { color: theme.textSecondary }]}>BASE</Text>
              <Text style={[styles.saleSummaryValue, { color: theme.text }]}>
                {formatCurrency(isIncluded ? numericBase / (1 + VAT_RATE) : numericBase)}
              </Text>
            </View>
            <View style={styles.saleSummaryItem}>
              <Text style={[styles.saleSummaryLabel, { color: theme.textSecondary }]}>VAT</Text>
              <Text style={[styles.saleSummaryValue, { color: theme.text }]}>{formatCurrency(vatAmount)}</Text>
            </View>
            <View style={styles.saleSummaryItem}>
              <Text style={[styles.saleSummaryLabel, { color: theme.textSecondary }]}>TOTAL</Text>
              <Text style={[styles.saleSummaryValue, { color: theme.primary }]}>{formatCurrency(totalWithVat)}</Text>
            </View>
          </View>
        </View>

        <View style={{ width: "100%", gap: 12, marginTop: 32 }}>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: theme.primary, width: "100%" }]}
            onPress={handleSellAnother}
          >
            <Text style={styles.primaryBtnText}>Sell Another Bottle</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, width: "100%" }]}
            onPress={() => router.replace("/(tabs)/home")}
          >
            <Text style={[styles.primaryBtnText, { color: theme.text }]}>Back to Dashboard</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        {step !== "success" && (
          <TouchableOpacity
            onPress={() => {
              if (step === "portion") router.back();
              else if (step === "search") setStep("portion");
              else if (step === "locate") setStep("search");
              else if (step === "verify") setStep("locate");
              else if (step === "sell") setStep(saleType !== "bottle" && openBottle ? "search" : "verify");
              else router.back();
            }}
            style={styles.backBtn}
          >
            <X size={24} color={theme.text} />
          </TouchableOpacity>
        )}
      </View>

      {step === "search" && renderSearch()}
      {step === "portion" && renderPortion()}
      {step === "locate" && renderLocate()}
      {step === "verify" && renderVerify()}
      {step === "sell" && renderSell()}
      {step === "success" && renderSuccess()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 8,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  headerText: {
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -1,
    marginBottom: 8,
  },
  subText: {
    fontSize: 16,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
  },
  listArea: {
    flex: 1,
  },
  wineRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    gap: 16,
  },
  wineIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  wineName: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 4,
  },
  wineSub: {
    fontSize: 14,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "800",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 15,
    textAlign: "center",
    marginBottom: 32,
  },
  primaryBtn: {
    width: "100%",
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  locateCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
  },
  locateTitle: {
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  locRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
  },
  locName: {
    fontSize: 16,
    fontWeight: "700",
  },
  locCount: {
    fontSize: 14,
    fontWeight: "600",
  },
  verifyOptions: {
    gap: 16,
  },
  verifyOptionBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    borderWidth: 1,
    borderRadius: 16,
    gap: 16,
  },
  verifyIconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  verifyOptionTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 4,
  },
  verifyOptionDesc: {
    fontSize: 14,
  },
  qrCameraContainer: {
    flex: 1,
    borderRadius: 24,
    overflow: "hidden",
    position: "relative",
  },
  closeCameraBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    zIndex: 10,
    padding: 12,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 24,
  },
  qrOverlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    pointerEvents: "none",
  },
  qrTarget: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: "#fff",
    borderRadius: 24,
  },
  qrHint: {
    color: "#fff",
    marginTop: 24,
    fontSize: 16,
    fontWeight: "700",
  },
  sellSection: {
    marginBottom: 24,
  },
  sellSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sellSectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  priceInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    height: 64,
    borderWidth: 1,
    borderRadius: 16,
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: "600",
    marginRight: 8,
  },
  priceInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: "900",
    height: "100%",
  },
  buyerInput: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    height: 64,
    borderWidth: 1,
    borderRadius: 16,
  },
  successCard: {
    width: "100%",
    padding: 24,
    borderWidth: 1,
    borderRadius: 24,
  },
  saleSummaryRow: {
    flexDirection: "row",
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
  },
  saleSummaryItem: {
    flex: 1,
    alignItems: "center",
  },
  saleSummaryLabel: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 4,
  },
  saleSummaryValue: {
    fontSize: 16,
    fontWeight: "800",
  },
});
