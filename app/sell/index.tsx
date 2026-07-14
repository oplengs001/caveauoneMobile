import React, { useState, useEffect, useMemo } from "react";
import {
  SafeAreaView,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import {
  Search,
  MapPin,
  Camera,
  Scan,
  Tag,
  User,
  Plus,
  X,
  CheckCircle2,
  AlertCircle,
  Wine,
} from "lucide-react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  collection,
  query,
  getDocs,
  where,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  addDoc,
  increment,
  getCountFromServer,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Colors } from "@/constants/theme";
import { MasterWine, InventoryBottle, Customer } from "@/types";
import BottlePickerModal, { BottleWithLocation } from "@/components/BottlePickerModal";
import LabelScanModal from "@/components/LabelScanModal";
import VatBreakdownCard, { formatCurrency } from "@/components/VatBreakdownCard";
import CustomerPickerModal from "@/components/CustomerPickerModal";
import AsyncStorage from "@react-native-async-storage/async-storage";

type SellStep = "search" | "locate" | "verify" | "sell" | "success";

const VAT_RATE = 0.12;

export default function SellScreen() {
  const router = useRouter();
  const { wineId } = useLocalSearchParams();
  const { profile } = useAuth();
  const theme = profile?.role === "store" ? Colors.store : profile?.role === "admin" ? Colors.admin : Colors.warehouse;

  // Permissions
  const [permission, requestPermission] = useCameraPermissions();

  // State
  const [step, setStep] = useState<SellStep>("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [masterWines, setMasterWines] = useState<MasterWine[]>([]);
  const [selectedWine, setSelectedWine] = useState<MasterWine | null>(null);
  const [inStockWineIds, setInStockWineIds] = useState<Set<string>>(new Set());
  
  const [bottlesList, setBottlesList] = useState<BottleWithLocation[]>([]);
  const [selectedBottleId, setSelectedBottleId] = useState<string | null>(null);
  
  const [isFetchingLocations, setIsFetchingLocations] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Verification UI
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);
  const [isPickerModalOpen, setIsPickerModalOpen] = useState(false);
  
  // Sell Form
  const [salePrice, setSalePrice] = useState("");
  const [storeVatMode, setStoreVatMode] = useState<"included" | "excluded">("excluded");
  const [isFastMoving, setIsFastMoving] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);

  useEffect(() => {
    fetchMasterWines();
  }, [profile?.locationId]);

  const fetchMasterWines = async () => {
    try {
      const snap = await getDocs(collection(db, "master_wines"));
      setMasterWines(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MasterWine)));

      if (profile?.locationId) {
        const bottlesSnap = await getDocs(
          query(
            collection(db, "inventory_bottles"),
            where("storeRef", "==", doc(db, "stores", profile.locationId)),
            where("status", "in", ["received", "shelved"])
          )
        );
        const inStockIds = new Set<string>();
        bottlesSnap.docs.forEach(d => {
          const ref = d.data().masterWineRef;
          if (ref) inStockIds.add(ref.id);
        });
        setInStockWineIds(inStockIds);
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
    if (profile?.locationId) {
      available = masterWines.filter(w => inStockWineIds.has(w.id));
    }
    
    if (!searchQuery) return available.slice(0, 10);
    const q = searchQuery.toLowerCase();
    return available.filter(w => 
      w.name?.toLowerCase().includes(q) || 
      w.sku?.toLowerCase().includes(q) ||
      w.vintage?.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [searchQuery, masterWines, inStockWineIds, profile?.locationId]);

  const handleSelectWine = async (wine: MasterWine) => {
    setSelectedWine(wine);
    setSearchQuery("");
    setStep("locate");
    
    // Fetch bottles for this wine at this store
    setIsFetchingLocations(true);
    try {
      const constraints = [
        where("masterWineRef", "==", doc(db, "master_wines", wine.id)),
        where("status", "in", ["received", "shelved"])
      ];
      if (profile?.locationId) {
        constraints.push(where("storeRef", "==", doc(db, "stores", profile.locationId)));
      }

      const q = query(collection(db, "inventory_bottles"), ...constraints);
      const snap = await getDocs(q);

      const bottles: BottleWithLocation[] = [];
      const locationCache: Record<string, string> = {};

      for (const d of snap.docs) {
        const data = d.data() as InventoryBottle;
        let locName = "Unassigned";
        if (data.locationRef) {
          if (locationCache[data.locationRef.id]) {
            locName = locationCache[data.locationRef.id];
          } else {
            const locSnap = await getDoc(data.locationRef);
            if (locSnap.exists()) {
              locName = locSnap.data().name;
              locationCache[data.locationRef.id] = locName;
            }
          }
        }
        bottles.push({
          bottleId: d.id,
          locationName: locName,
          locationId: data.locationRef?.id || "unassigned",
        });
      }
      
      setBottlesList(bottles);
      
      // Auto-skip to verification if bottles exist?
      // No, the plan says LOCATE is an explicit step to see where bottles are.

      // Also check store settings for fast moving and price
      if (profile?.locationId) {
        const settingsSnap = await getDocs(
          query(
            collection(db, "store_wine_settings"),
            where("storeId", "==", profile.locationId),
            where("masterWineId", "==", wine.id)
          )
        );
        if (!settingsSnap.empty) {
          const setting = settingsSnap.docs[0].data();
          setIsFastMoving(!!setting.isFastMoving);
          if (setting.sellingPrice) setSalePrice(setting.sellingPrice.toString());
          if (setting.vatMode) setStoreVatMode(setting.vatMode);
        } else {
          // fallback to master wine price
          if (wine.price) setSalePrice(wine.price.toString());
        }
      } else {
        if (wine.price) setSalePrice(wine.price.toString());
      }
      
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Could not load bottle locations.");
    } finally {
      setIsFetchingLocations(false);
    }
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
    if (!selectedBottleId) return;

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

      const bottleRef = doc(db, "inventory_bottles", selectedBottleId);

      // Log sale activity
      await addDoc(collection(db, "activity_logs"), {
        action: "bottle_sold",
        entity: "inventory_bottles",
        entityId: selectedBottleId,
        summary: `Sold bottle of ${selectedWine?.name}`,
        performedBy: profile?.email || "unknown",
        performedByRole: profile?.role || "unknown",
        source: profile?.role === "admin" ? "admin" : "warehouse",
        timestamp: serverTimestamp(),
        details: {
          price: netPrice,
          vatAmount,
          totalAmount,
          vatMode: storeVatMode,
          customerId: selectedCustomer?.id || null,
          customerName: selectedCustomer?.name || null,
          isFastMoving,
          masterWinePrice: selectedWine?.price || null,
        },
      });

      if (selectedCustomer?.id) {
        await updateDoc(doc(db, "customers", selectedCustomer.id), {
          totalSpend: increment(totalAmount),
          totalOrders: increment(1),
          updatedAt: serverTimestamp(),
        });
      }

      await updateDoc(bottleRef, {
        status: "consumed",
        soldAt: serverTimestamp(),
        locationRef: null,
        updatedAt: serverTimestamp(),
      });

      // PAR Alert logic
      if (profile?.role === "store" && profile?.locationId && selectedWine) {
        const storeId = profile.locationId;
        const settingsSnap = await getDocs(
          query(
            collection(db, "store_wine_settings"),
            where("storeId", "==", storeId),
            where("masterWineId", "==", selectedWine.id)
          )
        );

        if (!settingsSnap.empty) {
          const setting = settingsSnap.docs[0].data();
          if (
            !setting.discontinued &&
            setting.parLevel !== undefined &&
            setting.safetyStock !== undefined
          ) {
            const countSnap = await getCountFromServer(
              query(
                collection(db, "inventory_bottles"),
                where("storeRef", "==", doc(db, "stores", storeId)),
                where("masterWineRef", "==", doc(db, "master_wines", selectedWine.id)),
                where("status", "in", ["received", "shelved"])
              )
            );
            const stockCount = countSnap.data().count;

            if (stockCount <= setting.parLevel) {
              const pendingRequestsSnap = await getDocs(
                query(
                  collection(db, "wine_requests"),
                  where("storeId", "==", storeId),
                  where("status", "==", "pending")
                )
              );

              let hasPending = false;
              pendingRequestsSnap.docs.forEach((reqDoc) => {
                reqDoc.data().items?.forEach((item: any) => {
                  if (item.masterWineId === selectedWine.id) hasPending = true;
                });
              });

              if (!hasPending) {
                const requestedQty = Math.max(0, setting.safetyStock - stockCount);
                if (requestedQty > 0) {
                  await addDoc(collection(db, "wine_requests"), {
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
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                  });
                }
              }
            }
          }
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
      <Text style={[styles.headerText, { color: theme.text }]}>Sell a Bottle</Text>
      <Text style={[styles.subText, { color: theme.textSecondary, marginBottom: 24 }]}>
        Search for the wine you want to sell.
      </Text>
      <View style={[styles.searchBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Search size={20} color={theme.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Search by name, SKU, or vintage..."
          placeholderTextColor={theme.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoFocus
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <X size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
      <ScrollView style={styles.listArea}>
        {filteredWines.map((w) => (
          <TouchableOpacity
            key={w.id}
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
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
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
        <View style={styles.content}>
          <Text style={{ color: theme.text }}>Camera permission required.</Text>
          <TouchableOpacity onPress={requestPermission}><Text style={{ color: theme.primary }}>Grant Permission</Text></TouchableOpacity>
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
          title="Select Storage Unit"
          theme={theme}
        />
      </View>
    );
  };

  const renderSell = () => (
    <ScrollView style={styles.content}>
      <Text style={[styles.headerText, { color: theme.text, marginBottom: 24 }]}>Finalize Sale</Text>
      {renderSelectedWineSummary()}

      <View style={styles.sellSection}>
        <View style={styles.sellSectionHeader}>
          <Tag size={15} color={theme.primary} />
          <Text style={[styles.sellSectionTitle, { color: theme.text }]}>Sale Price</Text>
          <View style={{ flex: 1 }} />
          {!isFastMoving && (
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
        isFastMoving={isFastMoving}
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

  const renderSuccess = () => {
    const isIncluded = storeVatMode === "included";
    const numericBase = parseFloat(salePrice) || 0;
    const vatAmount = isIncluded ? numericBase - (numericBase / (1 + VAT_RATE)) : numericBase * VAT_RATE;
    const totalWithVat = isIncluded ? numericBase : numericBase + vatAmount;

    return (
      <View style={[styles.content, { alignItems: "center", justifyContent: "center" }]}>
        <CheckCircle2 size={80} color={theme.primary} />
        <Text style={[styles.headerText, { color: theme.text, marginTop: 24 }]}>Bottle Sold!</Text>
        <Text style={[styles.subText, { color: theme.textSecondary, textAlign: "center", marginBottom: 32 }]}>
          The bottle has been marked as sold and removed from active inventory.
        </Text>
        
        <View style={[styles.successCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.wineName, { color: theme.text, textAlign: "center" }]}>{selectedWine?.name}</Text>
          <Text style={[styles.wineSub, { color: theme.textSecondary, textAlign: "center", marginTop: 8 }]}>
            Bottle ID: {selectedBottleId?.slice(0, 8).toUpperCase()}
          </Text>
          
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

        <TouchableOpacity 
          style={[styles.primaryBtn, { backgroundColor: theme.primary, width: "100%", marginTop: 32 }]} 
          onPress={() => router.replace("/(tabs)/home")}
        >
          <Text style={styles.primaryBtnText}>Back to Dashboard</Text>
        </TouchableOpacity>
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
              if (step === "locate") setStep("search");
              else if (step === "verify") setStep("locate");
              else if (step === "sell") setStep("verify");
              else router.back();
            }}
            style={styles.backBtn}
          >
            <X size={24} color={theme.text} />
          </TouchableOpacity>
        )}
      </View>
      
      {step === "search" && renderSearch()}
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
