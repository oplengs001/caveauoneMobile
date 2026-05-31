import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  AlertTriangle,
  Box,
  Camera,
  CheckCircle2,
  Map,
  Plus,
  Receipt,
  RefreshCw,
  Save,
  ScanQrCode,
  Tag,
  User,
  Wine,
  X,
  Zap,
} from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { InventoryBottle, Location, MasterWine } from "../../types";

type TaggingState = "scanning" | "displaying" | "updating" | "success";

const STORAGE_CATEGORIES = [
  { label: "Locker", prefix: "L", icon: "🔒", major: "Locker", minor: "Box" },
  { label: "Room", prefix: "R", icon: "🚪", major: "Room", minor: "Shelf" },
  { label: "Fridge", prefix: "F", icon: "❄️", major: "Fridge", minor: "Slot" },
  { label: "Shelf", prefix: "S", icon: "📚", major: "Shelf", minor: "Pos" },
  { label: "Custom", prefix: "X", icon: "➕", major: "ID", minor: "Sub" },
];

const VAT_RATE = 0.12;

// ── Small helper: formats a number as currency ──────────────────────────────
function formatCurrency(value: number): string {
  return value.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ── VAT Breakdown Card ───────────────────────────────────────────────────────
function VatBreakdownCard({
  basePrice,
  theme,
  isFastMoving,
}: {
  basePrice: string;
  theme: any;
  isFastMoving: boolean;
}) {
  const numericBase = parseFloat(basePrice) || 0;
  const vatAmount = numericBase * VAT_RATE;
  const total = numericBase + vatAmount;
  const hasValue = numericBase > 0;

  return (
    <View
      style={[
        vatStyles.card,
        {
          backgroundColor: theme.card,
          borderColor: hasValue ? theme.primary + "40" : theme.border,
        },
      ]}
    >
      {/* Header */}
      <View style={vatStyles.cardHeader}>
        <Receipt size={14} color={theme.primary} />
        <Text style={[vatStyles.cardTitle, { color: theme.primary }]}>
          VAT BREAKDOWN
        </Text>
        {isFastMoving && (
          <View
            style={[
              vatStyles.fastMovingBadge,
              { backgroundColor: "#f59e0b18", borderColor: "#f59e0b40" },
            ]}
          >
            <Zap size={10} color="#f59e0b" />
            <Text style={vatStyles.fastMovingText}>FAST MOVING</Text>
          </View>
        )}
      </View>

      {/* Rows */}
      <View style={vatStyles.row}>
        <Text style={[vatStyles.rowLabel, { color: theme.textSecondary }]}>
          Base Price
        </Text>
        <Text style={[vatStyles.rowValue, { color: theme.text }]}>
          {hasValue ? formatCurrency(numericBase) : "—"}
        </Text>
      </View>

      <View style={[vatStyles.divider, { backgroundColor: theme.border }]} />

      <View style={vatStyles.row}>
        <View style={vatStyles.rowLabelGroup}>
          <Text style={[vatStyles.rowLabel, { color: theme.textSecondary }]}>
            VAT
          </Text>
          <View
            style={[
              vatStyles.rateBadge,
              { backgroundColor: theme.primary + "18" },
            ]}
          >
            <Text style={[vatStyles.rateText, { color: theme.primary }]}>
              12%
            </Text>
          </View>
        </View>
        <Text style={[vatStyles.rowValue, { color: theme.textSecondary }]}>
          {hasValue ? formatCurrency(vatAmount) : "—"}
        </Text>
      </View>

      <View style={[vatStyles.divider, { backgroundColor: theme.border }]} />

      {/* Total */}
      <View
        style={[vatStyles.totalRow, { backgroundColor: theme.primary + "0C" }]}
      >
        <Text style={[vatStyles.totalLabel, { color: theme.text }]}>
          TOTAL (VAT-IN)
        </Text>
        <Text
          style={[
            vatStyles.totalValue,
            { color: hasValue ? theme.primary : theme.textSecondary },
          ]}
        >
          {hasValue ? formatCurrency(total) : "—"}
        </Text>
      </View>
    </View>
  );
}

const vatStyles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 24,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
    flex: 1,
  },
  fastMovingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  fastMovingText: {
    color: "#f59e0b",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  rowLabelGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  rowValue: {
    fontSize: 14,
    fontWeight: "700",
  },
  rateBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  rateText: {
    fontSize: 10,
    fontWeight: "800",
  },
  divider: {
    height: 1,
    marginHorizontal: 18,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
  },
  totalValue: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
});

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function TaggingScreen() {
  const { profile } = useAuth();
  const theme = profile?.role === "store" ? Colors.store : Colors.warehouse;
  const isStore = profile?.role === "store";

  const {
    bottleId: initialBottleId,
    mode,
    source,
    fromRequestId,
    fromOnboardingId,
  } = useLocalSearchParams<{
    bottleId?: string;
    mode?: "sell";
    source?: string;
    fromRequestId?: string;
    fromOnboardingId?: string;
  }>();

  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<TaggingState>(
    initialBottleId ? "displaying" : "scanning",
  );
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
  const [isFastMoving, setIsFastMoving] = useState(false);

  // Add Location Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newCat, setNewCat] = useState(STORAGE_CATEGORIES[0]);
  const [newMajor, setNewMajor] = useState("");
  const [newMinor, setNewMinor] = useState("");
  const [newCapacity, setNewCapacity] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);

  // Sell Bottle state
  const [salePrice, setSalePrice] = useState("");
  const [buyerName, setBuyerName] = useState("");

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
    fetchLocations();
    if (initialBottleId && mode !== "sell") {
      loadBottleData(initialBottleId as string);
    }
  }, [initialBottleId, profile?.locationId]);

  // ── Fetch store_wine_settings when wine is loaded in sell mode ─────────────
  // Only pre-populate price if the wine is marked as fast-moving.
  useEffect(() => {
    if (mode !== "sell" || !wine || !profile?.locationId) return;

    const checkFastMoving = async () => {
      try {
        const settingsSnap = await getDocs(
          query(
            collection(db, "store_wine_settings"),
            where("storeId", "==", profile.locationId),
            where("masterWineId", "==", wine.id),
          ),
        );

        if (!settingsSnap.empty) {
          const setting = settingsSnap.docs[0].data();
          const fastMoving = setting.isFastMoving === true;
          setIsFastMoving(fastMoving);
          // Only auto-fill price for fast-moving wines
          if (fastMoving && wine.price) {
            setSalePrice(String(wine.price));
          } else {
            setSalePrice(""); // Leave blank — let staff decide
          }
        } else {
          setIsFastMoving(false);
          setSalePrice("");
        }
      } catch (err) {
        console.error("Error checking fast-moving setting:", err);
        setIsFastMoving(false);
        setSalePrice("");
      }
    };

    checkFastMoving();
  }, [wine, mode, profile?.locationId]);

  const fetchLocations = async () => {
    if (!profile?.locationId) return;
    try {
      const q = query(
        collection(db, "locations"),
        where("storeId", "==", profile.locationId),
        orderBy("name", "asc"),
      );
      const locationsSnap = await getDocs(q);
      setLocations(
        locationsSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Location[],
      );
    } catch (error) {
      console.error("Error fetching locations:", error);
    }
  };

  const loadBottleData = async (bottleId: string) => {
    if (loading || isProcessing.current) return;
    isProcessing.current = true;
    setLoading(true);

    try {
      const bottleRef = doc(db, "inventory_bottles", bottleId);
      const bottleSnap = await getDoc(bottleRef);

      if (!bottleSnap.exists()) {
        Alert.alert(
          "Invalid QR",
          "This QR code does not belong to any bottle in the system.",
          [
            {
              text: "Try Again",
              onPress: () => {
                setLoading(false);
                isProcessing.current = false;
                setState("scanning");
              },
            },
          ],
        );
        return;
      }

      const bottleData = {
        id: bottleSnap.id,
        ...bottleSnap.data(),
      } as InventoryBottle;
      setBottle(bottleData);

      if (
        isStore &&
        profile?.locationId &&
        (bottleData as any).storeRef?.id !== profile.locationId
      ) {
        setIsIncoming(true);
      } else {
        setIsIncoming(false);
      }

      if (bottleData.masterWineRef) {
        const wineSnap = await getDoc(bottleData.masterWineRef);
        if (wineSnap.exists()) {
          setWine({ id: wineSnap.id, ...wineSnap.data() } as MasterWine);
        }
      }

      setSelectedLocationId(bottleData.locationRef?.id || null);
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
    const generatedCode = `${newCat.prefix}${newMajor.toUpperCase()}${newMinor}`;

    try {
      const docRef = await addDoc(collection(db, "locations"), {
        name: generatedCode,
        type: newCat.label,
        storeId: profile.locationId,
        majorId: newMajor.toUpperCase(),
        minorId: newMinor,
        prefix: newCat.prefix,
        capacity: newCapacity ? parseInt(newCapacity, 10) : null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      Alert.alert("Success", "New storage location created.");
      await fetchLocations();
      setSelectedLocationId(docRef.id);
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
    if (state !== "scanning") return;
    loadBottleData(data);
  };

  const handleConfirmTagging = async () => {
    if (!bottle || !selectedLocationId) return;
    setState("updating");
    try {
      await updateDoc(doc(db, "inventory_bottles", bottle.id), {
        locationRef: doc(db, "locations", selectedLocationId),
        status: "shelved",
        updatedAt: new Date(),
      });
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
      await updateDoc(doc(db, "inventory_bottles", bottle.id), {
        storeRef: doc(db, "stores", profile.locationId),
        locationRef: null,
        status: "shelved",
        updatedAt: new Date(),
      });
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
      Alert.alert("Missing Price", "Please provide a sale price to continue.");
      return;
    }

    if (bottle.status === "consumed") {
      Alert.alert(
        "Already Sold",
        "This bottle has already been marked as sold.",
      );
      return;
    }

    setState("updating");
    try {
      const numericPrice = parseFloat(salePrice);
      const vatAmount = numericPrice * VAT_RATE;
      const totalAmount = numericPrice + vatAmount;

      await addDoc(collection(db, "sales"), {
        bottleId: bottle.id,
        masterWineId: bottle.masterWineRef?.id || null,
        wineName: wine?.name,
        vintage: wine?.vintage,
        producer: wine?.producer,
        format: wine?.format,
        storeId: profile?.locationId,
        soldById: profile?.id,
        soldByEmail: profile?.email,
        soldAt: serverTimestamp(),
        price: numericPrice,
        vatAmount,
        totalAmount,
        buyerName: buyerName || null,
        isFastMoving,
      });

      await updateDoc(doc(db, "inventory_bottles", bottle.id), {
        status: "consumed",
        soldAt: serverTimestamp(),
        locationRef: null,
        updatedAt: serverTimestamp(),
      });

      // Auto-request restock if PAR level reached
      if (isStore && profile?.locationId && bottle.masterWineRef && wine) {
        const storeId = profile.locationId;
        const wineRef = bottle.masterWineRef;

        const settingsSnap = await getDocs(
          query(
            collection(db, "store_wine_settings"),
            where("storeId", "==", storeId),
            where("masterWineId", "==", wineRef.id),
          ),
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
                where("masterWineRef", "==", wineRef),
                where("status", "in", ["received", "shelved"]),
              ),
            );
            const stockCount = countSnap.data().count;

            if (stockCount <= setting.parLevel) {
              const pendingRequestsSnap = await getDocs(
                query(
                  collection(db, "wine_requests"),
                  where("storeId", "==", storeId),
                  where("status", "==", "pending"),
                ),
              );

              let hasPending = false;
              pendingRequestsSnap.docs.forEach((reqDoc) => {
                reqDoc.data().items?.forEach((item: any) => {
                  if (item.masterWineId === wineRef.id) hasPending = true;
                });
              });

              if (!hasPending) {
                const requestedQty = Math.max(
                  0,
                  setting.safetyStock - stockCount,
                );
                if (requestedQty > 0) {
                  await addDoc(collection(db, "wine_requests"), {
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
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                  });
                  showSnackbar(
                    `Par level reached! Automatically requested ${requestedQty} bottle${requestedQty > 1 ? "s" : ""} for restock.`,
                  );
                }
              }
            }
          }
        }
      }

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
    setState("scanning");
    setBottle(null);
    setWine(null);
    setSelectedLocationId(null);
    setIsIncoming(false);
    setSuccessAction(null);
    setSalePrice("");
    setBuyerName("");
    setIsFastMoving(false);
  };

  // ── Derived VAT values ─────────────────────────────────────────────────────
  const numericBase = parseFloat(salePrice) || 0;
  const vatAmount = numericBase * VAT_RATE;
  const totalWithVat = numericBase + vatAmount;

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
                : "Location Tagged!"}
          </Text>
          <Text style={styles.successDesc}>
            {successAction === "sold"
              ? "The bottle has been marked as sold and removed from active inventory."
              : successAction === "received"
                ? "The bottle has been successfully added to your store's inventory."
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
              {wine?.name}
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
              {wine?.vintage} • {wine?.producer} • {wine?.format}
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
            onPress={() => router.back()}
          >
            <Text style={styles.secondaryButtonText}>Finish & Return</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Scanner ── */}
      {state === "scanning" && (
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
                onPress={() => router.back()}
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
                setState("scanning");
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
                BOTTLE ID: {bottle?.id.toUpperCase()}
              </Text>
              {isFastMoving && mode === "sell" && (
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
            <Text style={[styles.wineName, { color: theme.text }]}>
              {wine?.name || "Processing..."}
            </Text>
            <View style={styles.wineMetaRow}>
              <Text
                style={[styles.wineVintage, { color: theme.textSecondary }]}
              >
                {wine?.vintage}
              </Text>
              <View
                style={[styles.metaDot, { backgroundColor: theme.border }]}
              />
              <Text
                style={[styles.wineProducer, { color: theme.textSecondary }]}
              >
                {wine?.producer || "Independent Producer"}
              </Text>
              {wine?.format && (
                <>
                  <View
                    style={[styles.metaDot, { backgroundColor: theme.border }]}
                  />
                  <Text
                    style={[styles.wineFormat, { color: theme.textSecondary }]}
                  >
                    {wine.format}
                  </Text>
                </>
              )}
            </View>
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
                      setState("scanning"),
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
                  setState("scanning");
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
                    {isFastMoving && (
                      <Text
                        style={[styles.autoFilledHint, { color: "#f59e0b" }]}
                      >
                        ✦ Auto-filled
                      </Text>
                    )}
                  </View>
                  <View
                    style={[
                      styles.priceInputWrapper,
                      {
                        backgroundColor: theme.card,
                        borderColor: salePrice
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
                      onChangeText={setSalePrice}
                    />
                  </View>
                  {!isFastMoving && (
                    <Text
                      style={[styles.priceHint, { color: theme.textSecondary }]}
                    >
                      Enter the agreed sale price for this bottle.
                    </Text>
                  )}
                </View>

                {/* VAT Breakdown Card */}
                <VatBreakdownCard
                  basePrice={salePrice}
                  theme={theme}
                  isFastMoving={isFastMoving}
                />

                {/* Buyer name */}
                <View style={styles.sellSection}>
                  <View style={styles.sellSectionHeader}>
                    <User size={15} color={theme.textSecondary} />
                    <Text
                      style={[styles.sellSectionTitle, { color: theme.text }]}
                    >
                      Buyer Name
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
                  <TextInput
                    style={[
                      styles.buyerInput,
                      {
                        color: theme.text,
                        backgroundColor: theme.card,
                        borderColor: theme.border,
                      },
                    ]}
                    placeholder="e.g. Juan dela Cruz"
                    placeholderTextColor={theme.textSecondary}
                    value={buyerName}
                    onChangeText={setBuyerName}
                    autoCapitalize="words"
                  />
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
                  <Text style={styles.sectionTitle}>
                    Select Storage Location
                  </Text>
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

              <FlatList
                data={locations}
                keyExtractor={(item) => item.id}
                numColumns={2}
                columnWrapperStyle={styles.locationRow}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.locationItem,
                      {
                        backgroundColor: theme.card,
                        borderColor: theme.border,
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
                          (item.type === "Locker" ? "L" : item.type.charAt(0))}
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
                    <Text
                      style={[
                        styles.locationType,
                        {
                          color:
                            selectedLocationId === item.id
                              ? "rgba(255,255,255,0.7)"
                              : theme.textSecondary,
                        },
                      ]}
                    >
                      {item.type.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <AlertTriangle size={48} color="#334155" />
                    <Text style={styles.emptyText}>
                      No storage locations configured.
                    </Text>
                  </View>
                }
                contentContainerStyle={styles.locationList}
              />
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
                                CONFIRM SALE
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
});
