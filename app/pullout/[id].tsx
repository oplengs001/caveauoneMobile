import { IconSymbol } from "@/components/ui/icon-symbol";
import { db } from "@/lib/firebase";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { InventoryBottle, PulloutRequest } from "../../types";

export default function PulloutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [request, setRequest] = useState<PulloutRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const router = useRouter();

  const fetchRequest = async () => {
    if (!id) return;
    try {
      const docSnap = await getDoc(doc(db, "pullout_requests", id));
      if (docSnap.exists()) {
        setRequest({ id: docSnap.id, ...docSnap.data() } as PulloutRequest);
      }
    } catch (error) {
      console.error("Error fetching request:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequest();
  }, [id]);

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (!scanning || !request) return;
    setScanning(false);
    setLoading(true);

    try {
      // 1. Find bottle by ID
      const bottleSnap = await getDoc(doc(db, "inventory_bottles", data));

      if (!bottleSnap.exists()) {
        Alert.alert("Not Found", `No bottle found with ID: ${data}`, [{ text: "OK", onPress: () => setScanning(true) }]);
        setLoading(false);
        return;
      }

      const bottleData = { id: bottleSnap.id, ...bottleSnap.data() } as InventoryBottle;

      if (bottleData.status !== "received" && bottleData.status !== "shelved") {
        Alert.alert("Invalid Status", `Bottle is already ${bottleData.status}.`, [{ text: "OK", onPress: () => setScanning(true) }]);
        setLoading(false);
        return;
      }

      // 2. Check if this wine is in the request
      const masterWineId = bottleData.masterWineRef.id;
      const itemIndex = request.items.findIndex(
        (i) => i.masterWineId === masterWineId && i.pulledQty < i.requestedQty
      );

      if (itemIndex === -1) {
        Alert.alert("Not Requested", "This wine is not needed for this request or already fulfilled.", [{ text: "OK", onPress: () => setScanning(true) }]);
        setLoading(false);
        return;
      }

      // 3. Update Bottle
      await updateDoc(doc(db, "inventory_bottles", bottleData.id), {
        status: "outbound",
        updatedAt: Timestamp.now(),
      });

      // 4. Update Request
      const updatedItems = [...request.items];
      updatedItems[itemIndex].pulledQty += 1;
      updatedItems[itemIndex].pulledBottleIds = [
        ...(updatedItems[itemIndex].pulledBottleIds || []),
        bottleData.id,
      ];

      const allFulfilled = updatedItems.every(i => i.pulledQty >= i.requestedQty);

      await updateDoc(doc(db, "pullout_requests", request.id), {
        items: updatedItems,
        status: allFulfilled ? "completed" : "in_progress",
        updatedAt: Timestamp.now(),
      });

      Alert.alert("Success", `Pulled ${updatedItems[itemIndex].wineName}`, [
        { text: allFulfilled ? "Finish" : "Scan Next", onPress: () => allFulfilled ? fetchRequest() : setScanning(true) }
      ]);

      await fetchRequest();
    } catch (error) {
      console.error("Error processing pullout:", error);
      Alert.alert("Error", "Failed to process pullout.");
    } finally {
      setLoading(false);
    }
  };

  if (!permission) return <View />;
  if (!permission.granted && scanning) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>Camera permission required</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
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
            <Text style={styles.scanText}>Scan bottle QR to pull</Text>
            <TouchableOpacity onPress={() => setScanning(false)} style={styles.cancelScanButton}>
              <Text style={styles.cancelScanText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </CameraView>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Pullout Details</Text>
      </View>

      {loading && !request ? (
        <ActivityIndicator size="large" color="#f59e0b" style={{ flex: 1 }} />
      ) : request ? (
        <>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.statusCard}>
              <Text style={styles.statusLabel}>STATUS</Text>
              <Text style={styles.statusValue}>{request.status.replace('_', ' ').toUpperCase()}</Text>
            </View>

            <Text style={styles.sectionTitle}>Items to Pull</Text>
            <View style={styles.itemsList}>
              {request.items.map((item, index) => {
                const isFulfilled = item.pulledQty >= item.requestedQty;
                return (
                  <View key={index} style={[styles.itemCard, isFulfilled && styles.itemCardFulfilled]}>
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName}>{item.wineName}</Text>
                      <Text style={styles.itemProgress}>
                        {item.pulledQty} of {item.requestedQty} pulled
                      </Text>
                    </View>
                    {isFulfilled ? (
                      <IconSymbol name="checkmark.circle.fill" size={24} color="#10b981" />
                    ) : (
                      <View style={styles.pendingBadge} />
                    )}
                  </View>
                );
              })}
            </View>
          </ScrollView>

          {request.status !== 'completed' && (
            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.scanButton}
                onPress={() => setScanning(true)}
              >
                <IconSymbol name="qrcode.viewfinder" size={24} color="#fff" />
                <Text style={styles.scanButtonText}>Scan to Pull Bottle</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      ) : (
        <Text style={styles.errorText}>Request not found.</Text>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111827",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 24,
  },
  backButton: {
    marginRight: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#fff",
  },
  scrollContent: {
    padding: 24,
  },
  statusCard: {
    backgroundColor: "#1f2937",
    padding: 20,
    borderRadius: 16,
    marginBottom: 32,
    borderLeftWidth: 4,
    borderLeftColor: "#f59e0b",
  },
  statusLabel: {
    color: "#9ca3af",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 4,
  },
  statusValue: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 16,
  },
  itemsList: {
    gap: 12,
  },
  itemCard: {
    backgroundColor: "#1f2937",
    padding: 16,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#374151",
  },
  itemCardFulfilled: {
    borderColor: "#064e3b",
    backgroundColor: "#064e3b33",
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  itemProgress: {
    color: "#9ca3af",
    fontSize: 14,
  },
  pendingBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#374151",
  },
  footer: {
    padding: 24,
    backgroundColor: "#111827",
    borderTopWidth: 1,
    borderTopColor: "#374151",
  },
  scanButton: {
    backgroundColor: "#f59e0b",
    height: 64,
    borderRadius: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  scanButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
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
    borderColor: "#f59e0b",
    borderRadius: 20,
    marginBottom: 32,
  },
  scanText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  cancelScanButton: {
    position: "absolute",
    bottom: 60,
    padding: 16,
  },
  cancelScanText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  permissionText: {
    color: "#fff",
    textAlign: "center",
    marginTop: 100,
    fontSize: 16,
  },
  permissionButton: {
    backgroundColor: "#3b82f6",
    margin: 24,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  permissionButtonText: {
    color: "#fff",
    fontWeight: "800",
  },
  errorText: {
    color: "#ef4444",
    textAlign: "center",
    marginTop: 40,
  },
});
