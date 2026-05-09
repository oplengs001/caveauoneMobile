import { IconSymbol } from "@/components/ui/icon-symbol";
import { db } from "@/lib/firebase";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter, Stack } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { InventoryBottle, Location, MasterWine } from "../../types";

type TaggingState = "scanning" | "displaying" | "updating";

export default function TaggingScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<TaggingState>("scanning");
  const [scannedSku, setScannedSku] = useState<string | null>(null);
  const [bottle, setBottle] = useState<InventoryBottle | null>(null);
  const [wine, setWine] = useState<MasterWine | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isProcessing = useRef(false);
  const router = useRouter();

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    try {
      const locationsSnap = await getDocs(collection(db, "locations"));
      const locData = locationsSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Location[];
      setLocations(locData);
    } catch (error) {
      console.error("Error fetching locations:", error);
    }
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (state !== "scanning" || loading || isProcessing.current) return;
    
    isProcessing.current = true;
    setLoading(true);
    setScannedSku(data);
    
    try {
      // Find the bottle by ID (the scanned data is now the bottle ID)
      const bottleRef = doc(db, "inventory_bottles", data);
      const bottleSnap = await getDoc(bottleRef);

      if (!bottleSnap.exists()) {
        Alert.alert("Not Found", `No bottle found with ID: ${data}`, [
          { text: "Try Again", onPress: () => {
            setScannedSku(null);
            setLoading(false);
          }}
        ]);
        return;
      }

      const bottleData = { id: bottleSnap.id, ...bottleSnap.data() } as InventoryBottle;
      setBottle(bottleData);

      // Fetch master wine details
      if (bottleData.masterWineRef) {
        const wineSnap = await getDoc(bottleData.masterWineRef);
        if (wineSnap.exists()) {
          setWine({ id: wineSnap.id, ...wineSnap.data() } as MasterWine);
        }
      }

      setState("displaying");
    } catch (error) {
      console.error("Error fetching bottle details:", error);
      Alert.alert("Error", "Failed to fetch bottle details.");
      isProcessing.current = false;
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmTagging = async () => {
    if (!bottle || !selectedLocationId) return;

    setState("updating");
    try {
      const bottleRef = doc(db, "inventory_bottles", bottle.id);
      const locationRef = doc(db, "locations", selectedLocationId);

      await updateDoc(bottleRef, {
        locationRef: locationRef,
        status: "shelved",
        updatedAt: new Date(),
      });

      Alert.alert("Success", "Bottle has been shelved successfully.", [
        {
          text: "Scan Next",
          onPress: () => {
            isProcessing.current = false;
            setState("scanning");
            setBottle(null);
            setWine(null);
            setScannedSku(null);
            setSelectedLocationId(null);
          },
        },
        {
          text: "Finish",
          onPress: () => router.back(),
        },
      ]);
    } catch (error) {
      console.error("Error updating bottle:", error);
      Alert.alert("Error", "Failed to update bottle location.");
      setState("displaying");
    }
  };

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <IconSymbol name="camera.fill" size={64} color="#9ca3af" />
        <Text style={styles.permissionText}>We need your permission to show the camera</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      {state === "scanning" ? (
        <View style={styles.scannerContainer}>
          <CameraView
            style={styles.camera}
            facing="back"
            onBarcodeScanned={handleBarcodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: ["qr"],
            }}
          >
            <View style={styles.overlay}>
              <View style={styles.scanTarget} />
              <Text style={styles.instructionText}>Align QR code within the frame</Text>
              <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
                <IconSymbol name="chevron.left" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </CameraView>
        </View>
      ) : (
        <View style={styles.detailsContainer}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setState("scanning")} style={styles.backButton}>
              <IconSymbol name="chevron.left" size={24} color="#fff" />
              <Text style={styles.backText}>Rescan</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Tag Location</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.skuLabel}>SKU: {bottle?.sku}</Text>
            <Text style={styles.wineName}>{wine?.name || "Loading..."}</Text>
            <Text style={styles.wineDetails}>
              {wine?.vintage} • {wine?.producer || "No Producer"}
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Select Storage Location</Text>
          <FlatList
            data={locations}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={styles.locationRow}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.locationItem,
                  selectedLocationId === item.id && styles.locationItemSelected,
                ]}
                onPress={() => setSelectedLocationId(item.id)}
              >
                <IconSymbol
                  name="location.fill"
                  size={24}
                  color={selectedLocationId === item.id ? "#fff" : "#9ca3af"}
                />
                <Text
                  style={[
                    styles.locationName,
                    selectedLocationId === item.id && styles.locationNameSelected,
                  ]}
                >
                  {item.name}
                </Text>
                <Text style={styles.locationType}>{item.type}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No locations found.</Text>
            }
            contentContainerStyle={styles.locationList}
          />

          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.confirmButton,
                (!selectedLocationId || state === "updating") && styles.buttonDisabled,
              ]}
              onPress={handleConfirmTagging}
              disabled={!selectedLocationId || state === "updating"}
            >
              {state === "updating" ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmButtonText}>Confirm Tagging</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111827",
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  permissionText: {
    color: "#fff",
    fontSize: 18,
    textAlign: "center",
    marginTop: 20,
    marginBottom: 40,
  },
  permissionButton: {
    backgroundColor: "#3b82f6",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  scannerContainer: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  overlay: {
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
    borderRadius: 20,
  },
  instructionText: {
    color: "#fff",
    marginTop: 24,
    fontSize: 16,
    fontWeight: "600",
  },
  closeButton: {
    position: "absolute",
    top: 60,
    left: 24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  detailsContainer: {
    flex: 1,
    padding: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#374151",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 16,
  },
  backText: {
    color: "#fff",
    marginLeft: 4,
    fontWeight: "600",
  },
  title: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "900",
  },
  card: {
    backgroundColor: "#1f2937",
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#374151",
  },
  skuLabel: {
    color: "#10b981",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 8,
  },
  wineName: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 4,
  },
  wineDetails: {
    color: "#9ca3af",
    fontSize: 16,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
  },
  locationList: {
    paddingBottom: 100,
  },
  locationRow: {
    justifyContent: "space-between",
    gap: 12,
  },
  locationItem: {
    backgroundColor: "#1f2937",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flex: 1,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  locationItemSelected: {
    borderColor: "#10b981",
    backgroundColor: "#064e3b",
  },
  locationName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 8,
    textAlign: "center",
  },
  locationNameSelected: {
    color: "#fff",
  },
  locationType: {
    color: "#9ca3af",
    fontSize: 12,
    marginTop: 2,
  },
  emptyText: {
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 40,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    backgroundColor: "#111827",
  },
  confirmButton: {
    backgroundColor: "#10b981",
    height: 64,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  confirmButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
