import { Colors } from "@/constants/theme";
import { db } from "@/lib/firebase";
import { InventoryBottle, Delivery } from "@/types";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Package,
  ScanQrCode,
  Wine,
  PackageCheck,
  XCircle,
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

export default function DeliveryDetail() {
  const { id, openScanner } = useLocalSearchParams<{
    id: string;
    openScanner?: string;
  }>();
  const router = useRouter();

  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const isProcessing = useRef(false);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [loading, setLoading] = useState(true);

  // Hardcode theme based on typical usage (store personnel)
  const theme = Colors.store;

  useEffect(() => {
    if (id) fetchDelivery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (openScanner === "true") {
      setScanning(true);
    }
  }, [openScanner]);

  const fetchDelivery = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, "deliveries", id as string));
      if (snap.exists()) {
        setDelivery({
          id: snap.id,
          ...snap.data(),
          createdAt: snap.data().createdAt?.toDate() || new Date(),
        } as Delivery);
      }
    } catch (err) {
      console.error("Failed to fetch delivery:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (!scanning || !delivery || isProcessing.current) return;
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
      if (bottleData.storeRef?.id === delivery.storeId) {
        Alert.alert(
          "Already Received",
          "This bottle has already been received at this store.",
          [{ text: "OK", onPress: () => setScanning(true) }],
        );
        return;
      }
      if (bottleData.outboundLocationRef?.id !== delivery.storeId) {
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
      const itemIndex = delivery.items.findIndex(
        (i) => i.masterWineId === masterWineId,
      );

      if (itemIndex === -1) {
        Alert.alert("Not in Delivery", "This wine is not part of this delivery.", [
          { text: "OK", onPress: () => setScanning(true) },
        ]);
        return;
      }

      const item = delivery.items[itemIndex];
      const ingressedQty = item.ingressedQty || 0;
      const targetQty = item.qty;

      if (ingressedQty >= targetQty) {
        Alert.alert(
          "Fully Received",
          "All units of this wine have been received for this delivery.",
          [{ text: "OK", onPress: () => setScanning(true) }],
        );
        return;
      }

      await updateDoc(bottleRef, {
        status: "received",
        storeRef: doc(db, "stores", delivery.storeId),
        locationRef: null,
        outboundLocationRef: null,
        updatedAt: serverTimestamp(),
      });

      const newItems = [...delivery.items];
      newItems[itemIndex] = {
        ...item,
        ingressedQty: (item.ingressedQty || 0) + 1,
      };
      const allReceived = newItems.every((i) => (i.ingressedQty || 0) >= i.qty);
      const newStatus = allReceived ? "ingress_complete" : "receiving";

      await updateDoc(doc(db, "deliveries", delivery.id), {
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
                  source: "delivery",
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

      fetchDelivery();
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
      case "dispatched":
        return {
          color: "#3b82f6",
          bg: "#bfdbfe",
          icon: Clock,
          label: "Dispatched",
        };
      case "receiving":
        return {
          color: "#10b981",
          bg: "#d1fae5",
          icon: PackageCheck,
          label: "Receiving",
        };
      case "ingress_complete":
        return {
          color: "#059669",
          bg: "#a7f3d0",
          icon: CheckCircle2,
          label: "Complete",
        };
      case "cancelled":
        return {
          color: "#ef4444",
          bg: "#fee2e2",
          icon: XCircle,
          label: "Cancelled",
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

  if (!delivery) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.center}>
          <Package size={48} color={theme.border} strokeWidth={1} />
          <Text style={[styles.notFoundText, { color: theme.textSecondary }]}>
            Delivery not found.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusConfig = getStatusConfig(delivery.status);
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
            Delivery Details
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            DEL: {delivery.id.slice(0, 8).toUpperCase()}
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
            <Text
              style={[styles.statusDate, { color: statusConfig.color + "AA" }]}
            >
              {delivery.createdAt.toLocaleDateString("en-US", {
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
              Delivery Items ({delivery.items.length})
            </Text>
          </View>

          {delivery.items.map((wine, idx) => (
            <View
              key={idx}
              style={[
                styles.itemRow,
                idx < delivery.items.length - 1 && {
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

              {/* Pulled qty indicator */}
              {(delivery.status === "dispatched" ||
                delivery.status === "receiving" ||
                delivery.status === "ingress_complete") && (
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
      </ScrollView>

      {(delivery.status === "dispatched" ||
        delivery.status === "receiving" ||
        (delivery.status === "ingress_complete" &&
          !delivery.items.every((i) => (i.ingressedQty || 0) >= i.qty))) && (
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
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 24, fontWeight: "800", marginBottom: 2 },
  subtitle: { fontSize: 13, fontWeight: "600", letterSpacing: 1 },
  scrollContent: { padding: 20, paddingBottom: 100 },
  statusBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
    gap: 12,
  },
  statusLabel: { fontSize: 15, fontWeight: "800", textTransform: "uppercase" },
  statusDate: { fontSize: 13, fontWeight: "600", marginTop: 2 },
  section: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "rgba(0,0,0,0.02)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
    gap: 8,
  },
  sectionTitle: { fontSize: 14, fontWeight: "800", textTransform: "uppercase" },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 16,
  },
  qtyPill: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: { fontSize: 18, fontWeight: "900" },
  wineName: { fontSize: 15, fontWeight: "700", marginBottom: 4 },
  wineMeta: { fontSize: 13, fontWeight: "500", marginBottom: 2 },
  wineSku: { fontSize: 11, fontWeight: "600", letterSpacing: 0.5 },
  progressContainer: { alignItems: "center" },
  progressText: { fontSize: 18, fontWeight: "900", marginBottom: 2 },
  progressLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: 40,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },
  scanButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#10b981",
    padding: 18,
    borderRadius: 20,
    gap: 12,
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  scanButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  notFoundText: { fontSize: 16, fontWeight: "600", marginTop: 16 },
  permissionText: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
  },
  permissionButton: {
    backgroundColor: "#10b981",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  permissionButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  scannerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  scanTarget: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: "#10b981",
    backgroundColor: "transparent",
    borderRadius: 24,
    marginBottom: 24,
  },
  scanText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  cancelScanButton: {
    marginTop: 40,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 20,
  },
  cancelScanText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
