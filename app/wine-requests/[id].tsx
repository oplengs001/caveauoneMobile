import { Colors } from "@/constants/theme";
import { db } from "@/lib/firebase";
import { InventoryBottle, WineRequest } from "@/types";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Clock,
  Package,
  ScanQrCode,
  Truck,
  Wine,
} from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
const theme = Colors.store;
export default function WineRequestDetail() {
  const { id, openScanner } = useLocalSearchParams<{
    id: string;
    openScanner?: string;
  }>();
  const router = useRouter();

  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const isProcessing = useRef(false);
  const [request, setRequest] = useState<WineRequest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) fetchRequest();
  }, [id]);

  useEffect(() => {
    if (openScanner === "true") {
      setScanning(true);
    }
  }, [openScanner]);

  const fetchRequest = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, "wine_requests", id as string));
      if (snap.exists()) {
        setRequest({
          id: snap.id,
          ...snap.data(),
          createdAt: snap.data().createdAt?.toDate() || new Date(),
        } as WineRequest);
      }
    } catch (err) {
      console.error("Failed to fetch request:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (!scanning || !request || isProcessing.current) return;
    isProcessing.current = true;
    setScanning(false);

    try {
      const bottleRef = doc(db, "inventory_bottles", data);
      const bottleSnap = await getDoc(bottleRef);

      if (!bottleSnap.exists()) {
        Alert.alert("Not Found", `No bottle found with ID: ${data}`, [
          { text: "OK", onPress: () => setScanning(true) },
        ]);
        return;
      }

      const bottleData = bottleSnap.data() as InventoryBottle;
      if (bottleData.storeRef?.id === request.storeId) {
        Alert.alert(
          "Already Received",
          "This bottle has already been received for this request.",
          [{ text: "OK", onPress: () => setScanning(true) }],
        );
        return;
      }
      if (bottleData.outboundLocationRef?.id !== request.storeId) {
        Alert.alert(
          "Wrong Store",
          "This bottle is not designated for your location.",
          [{ text: "OK", onPress: () => setScanning(true) }],
        );
        return;
      }

      if (bottleData.status !== "outbound") {
        Alert.alert(
          "Invalid Status",
          `Bottle status is '${bottleData.status}', not 'outbound'.`,
          [{ text: "OK", onPress: () => setScanning(true) }],
        );
        return;
      }

      const masterWineId = bottleData.masterWineRef.id;
      const itemIndex = request.items.findIndex(
        (i) => i.masterWineId === masterWineId,
      );

      if (itemIndex === -1) {
        Alert.alert("Not in Request", "This wine is not part of the request.", [
          { text: "OK", onPress: () => setScanning(true) },
        ]);
        return;
      }

      const item = request.items[itemIndex];
      const ingressedQty = item.ingressedQty || 0;
      const targetQty = item.qty;

      if (ingressedQty >= targetQty) {
        Alert.alert(
          "Fully Received",
          "All units of this wine have been received for this request.",
          [{ text: "OK", onPress: () => setScanning(true) }],
        );
        return;
      }

      await updateDoc(bottleRef, {
        status: "received",
        storeRef: doc(db, "stores", request.storeId),
        locationRef: null,
        outboundLocationRef: null,
        updatedAt: serverTimestamp(),
      });

      const newItems = [...request.items];
      newItems[itemIndex] = {
        ...item,
        ingressedQty: (item.ingressedQty || 0) + 1,
      };
      const allReceived = newItems.every((i) => (i.ingressedQty || 0) >= i.qty);
      const newStatus = allReceived ? "ingress_complete" : "receiving";

      await updateDoc(doc(db, "wine_requests", request.id), {
        items: newItems,
        status: newStatus,
        updatedAt: serverTimestamp(),
      });

      const scannedBottleId = data;

      Alert.alert(
        "✓ Received",
        `${item.wineName} has been received.\n\nWould you like to tag a storage location for this bottle?`,
        [
          {
            text: "Tag Location",
            onPress: () => {
              router.replace({
                pathname: "/tagging",
                params: {
                  bottleId: scannedBottleId,
                  mode: "tagging",
                  source: "wine-request",
                  fromRequestId: id,
                },
              });
            },
          },
          {
            text: "Scan Next",
            onPress: () => {
              setScanning(true);
            },
          },
          {
            text: "Done",
            style: "cancel",
          },
        ],
      );

      fetchRequest();
    } catch (error) {
      console.error("Error receiving bottle:", error);
      Alert.alert("Error", "An error occurred while receiving the bottle.", [
        { text: "OK", onPress: () => setScanning(true) },
      ]);
    } finally {
      isProcessing.current = false;
    }
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "pending":
        return {
          color: "#f59e0b",
          bg: "#fef3c7",
          icon: Clock,
          label: "Pending Review",
        };
      case "converted":
        return {
          color: "#eab308",
          bg: "#fef08a",
          icon: Truck,
          label: "Pulling Out",
        };
      case "outbound":
        return {
          color: "#3b82f6",
          bg: "#bfdbfe",
          icon: Truck,
          label: "Outbound",
        };
      case "receiving":
        return {
          color: "#10b981",
          bg: "#d1fae5",
          icon: CheckCircle2,
          label: "Receiving",
        };
      case "ingress_complete":
        return {
          color: "#059669",
          bg: "#a7f3d0",
          icon: CheckCircle2,
          label: "Received",
        };
      case "rejected":
        return {
          color: "#ef4444",
          bg: "#fee2e2",
          icon: Ban,
          label: "Rejected",
        };
      default:
        return { color: "#64748b", bg: "#f1f5f9", icon: Clock, label: status };
    }
  };

  if (!permission && scanning) {
    return <View />;
  }

  if (!permission?.granted && scanning) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: "#000" }]}>
        <Text style={styles.permissionText}>Camera permission required</Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={requestPermission}
        >
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (scanning) {
    return (
      <View style={styles.container}>
        <CameraView
          style={StyleSheet.absoluteFill}
          onBarcodeScanned={handleBarcodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        >
          <View style={styles.scannerOverlay}>
            <View style={styles.scanTarget} />
            <Text style={styles.scanText}>Scan bottle QR to receive</Text>
            <TouchableOpacity
              onPress={() => setScanning(false)}
              style={styles.cancelScanButton}
            >
              <Text style={styles.cancelScanText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </CameraView>
      </View>
    );
  }

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!request) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.center}>
          <Package size={48} color={theme.border} strokeWidth={1} />
          <Text style={[styles.notFoundText, { color: theme.textSecondary }]}>
            Request not found.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusConfig = getStatusConfig(request.status);
  const StatusIcon = statusConfig.icon;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color={theme.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.primary }]}>
            Request Details
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            REQ: {request.id.slice(0, 8).toUpperCase()}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Banner */}
        <View
          style={[styles.statusBanner, { backgroundColor: statusConfig.bg }]}
        >
          <StatusIcon size={20} color={statusConfig.color} strokeWidth={2.5} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusLabel, { color: statusConfig.color }]}>
              {statusConfig.label}
            </Text>
            {request.status === "rejected" && request.rejectionReason && (
              <Text
                style={[
                  styles.statusDate,
                  { color: statusConfig.color + "AA", marginTop: 6 },
                ]}
              >
                Reason: {request.rejectionReason}
              </Text>
            )}
            <Text
              style={[styles.statusDate, { color: statusConfig.color + "AA" }]}
            >
              {request.createdAt.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </Text>
          </View>
        </View>

        {/* Items */}
        <View
          style={[
            styles.section,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <View style={styles.sectionHeader}>
            <Wine size={16} color={theme.primary} />
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Requested Items ({request.items.length})
            </Text>
          </View>

          {request.items.map((wine, idx) => (
            <View
              key={idx}
              style={[
                styles.itemRow,
                idx < request.items.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: theme.border,
                },
              ]}
            >
              {/* Qty pill */}
              <View
                style={[
                  styles.qtyPill,
                  { backgroundColor: theme.primary + "18" },
                ]}
              >
                <Text style={[styles.qtyText, { color: theme.primary }]}>
                  {wine.qty}x
                </Text>
              </View>

              {/* Wine info */}
              <View style={{ flex: 1 }}>
                <Text style={[styles.wineName, { color: theme.text }]}>
                  {wine.wineName}
                </Text>
                <Text style={[styles.wineMeta, { color: theme.textSecondary }]}>
                  {[wine.vintage, wine.format].filter(Boolean).join(" · ")}
                </Text>
                {wine.sku && wine.sku !== "N/A" && (
                  <Text
                    style={[
                      styles.wineSku,
                      { color: theme.textSecondary + "88" },
                    ]}
                  >
                    SKU: {wine.sku}
                  </Text>
                )}
              </View>

              {/* Pulled qty indicator for converted requests */}
              {(request.status === "converted" ||
                request.status === "receiving" ||
                request.status === "ingress_complete") && (
                <View style={styles.progressContainer}>
                  <Text style={styles.progressText}>
                    {wine.ingressedQty || 0} / {wine.qty}
                  </Text>
                  <Text style={styles.progressLabel}>RECEIVED</Text>
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Summary */}
        {request.totalAmount > 0 && (
          <View
            style={[
              styles.section,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryKey, { color: theme.textSecondary }]}>
                Total Value
              </Text>
              <Text style={[styles.summaryValue, { color: theme.primary }]}>
                ₱{request.totalAmount.toLocaleString()}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryKey, { color: theme.textSecondary }]}>
                Total Bottles
              </Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>
                {request.items.reduce((sum, i) => sum + i.qty, 0)} btls
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
      {(request.status === "converted" ||
        request.status === "receiving" ||
        (request.status === "ingress_complete" &&
          !request.items.every((i) => (i.ingressedQty || 0) >= i.qty))) && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.scanButton}
            onPress={() => setScanning(true)}
          >
            <ScanQrCode size={24} color="#fff" strokeWidth={2.5} />
            <Text style={styles.scanButtonText}>Receive Items</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16 },
  notFoundText: { fontSize: 15, fontWeight: "600" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 2,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 48,
    gap: 16,
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 20,
    padding: 20,
  },
  statusLabel: {
    fontSize: 15,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statusDate: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 3,
  },
  section: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  qtyPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  qtyText: {
    fontSize: 13,
    fontWeight: "900",
  },
  wineName: {
    fontSize: 14,
    fontWeight: "800",
  },
  wineMeta: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
  wineSku: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
  progressContainer: {
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
  },
  progressText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#065f46",
  },
  progressLabel: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#065f46",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  summaryKey: {
    fontSize: 13,
    fontWeight: "600",
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: "900",
  },
  footer: {
    padding: 24,
    paddingTop: 12,
    backgroundColor: "transparent",
  },
  scanButton: {
    backgroundColor: theme.primary,
    height: 64,
    borderRadius: 20,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  scanButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  scannerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  scanTarget: {
    width: 260,
    height: 260,
    borderWidth: 2,
    borderColor: theme.primary,
    borderRadius: 32,
    marginBottom: 40,
    backgroundColor: "rgba(79, 70, 229, 0.05)",
  },
  scanText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  cancelScanButton: {
    position: "absolute",
    bottom: 60,
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 40,
    paddingVertical: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  cancelScanText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  permissionText: {
    color: "#fff",
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
  },
  permissionButton: {
    backgroundColor: theme.primary,
    margin: 32,
    padding: 18,
    borderRadius: 20,
    alignItems: "center",
  },
  permissionButtonText: {
    color: "#fff",
    fontWeight: "900",
    textTransform: "uppercase",
  },
});
