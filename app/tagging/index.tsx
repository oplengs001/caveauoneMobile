import { 
  Camera, 
  ChevronLeft, 
  MapPin, 
  CheckCircle2, 
  RefreshCw, 
  X, 
  ScanQrCode,
  Check,
  AlertTriangle,
  Loader2,
  Box,
  Map
} from 'lucide-react-native';
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
      const bottleRef = doc(db, "inventory_bottles", data);
      const bottleSnap = await getDoc(bottleRef);

      if (!bottleSnap.exists()) {
        Alert.alert("Invalid QR", "This QR code does not belong to any bottle in the system.", [
          { text: "Try Again", onPress: () => {
            setScannedSku(null);
            setLoading(false);
            isProcessing.current = false;
          }}
        ]);
        return;
      }

      const bottleData = { id: bottleSnap.id, ...bottleSnap.data() } as InventoryBottle;
      setBottle(bottleData);

      if (bottleData.masterWineRef) {
        const wineSnap = await getDoc(bottleData.masterWineRef);
        if (wineSnap.exists()) {
          setWine({ id: wineSnap.id, ...wineSnap.data() } as MasterWine);
        }
      }

      setState("displaying");
    } catch (error) {
      console.error("Error fetching bottle details:", error);
      Alert.alert("Error", "Failed to retrieve bottle data.");
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

      Alert.alert("Success", "Bottle has been assigned to location.", [
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
      Alert.alert("Error", "Failed to finalize shelving.");
      setState("displaying");
    }
  };

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Camera size={80} color="#334155" strokeWidth={1} />
        <Text style={styles.permissionText}>Camera access is required to scan bottle QR codes.</Text>
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
              <View style={styles.scanTargetContainer}>
                <View style={styles.scanTarget} />
                <View style={[styles.corner, styles.topLeft]} />
                <View style={[styles.corner, styles.topRight]} />
                <View style={[styles.corner, styles.bottomLeft]} />
                <View style={[styles.corner, styles.bottomRight]} />
                <ScanQrCode size={40} color="rgba(16, 185, 129, 0.5)" style={styles.centerIcon} />
              </View>
              <Text style={styles.instructionText}>CENTER QR CODE IN FRAME</Text>
              <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
                <X size={28} color="#fff" />
              </TouchableOpacity>
            </View>
          </CameraView>
        </View>
      ) : (
        <View style={styles.detailsContainer}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => { isProcessing.current = false; setState("scanning"); }} style={styles.backButton}>
              <RefreshCw size={20} color="#fff" strokeWidth={2.5} />
              <Text style={styles.backText}>RESCAN</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Tag Location</Text>
          </View>

          <View style={styles.card}>
            <View className="flex-row items-center gap-2 mb-2">
              <Box size={14} color="#10b981" />
              <Text style={styles.skuLabel}>BOTTLE ID: {bottle?.id.slice(0, 12).toUpperCase()}</Text>
            </View>
            <Text style={styles.wineName}>{wine?.name || "Processing..."}</Text>
            <View style={styles.wineMetaRow}>
              <Text style={styles.wineVintage}>{wine?.vintage}</Text>
              <View style={styles.metaDot} />
              <Text style={styles.wineProducer}>{wine?.producer || "Independent Producer"}</Text>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Map size={18} color="#64748b" />
            <Text style={styles.sectionTitle}>Select Storage Location</Text>
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
                  selectedLocationId === item.id && styles.locationItemSelected,
                ]}
                onPress={() => setSelectedLocationId(item.id)}
              >
                <MapPin
                  size={28}
                  color={selectedLocationId === item.id ? "#fff" : "#475569"}
                  strokeWidth={selectedLocationId === item.id ? 2.5 : 2}
                />
                <Text
                  style={[
                    styles.locationName,
                    selectedLocationId === item.id && styles.locationNameSelected,
                  ]}
                >
                  {item.name}
                </Text>
                <Text style={styles.locationType}>{item.type.toUpperCase()}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <AlertTriangle size={48} color="#334155" />
                <Text style={styles.emptyText}>No storage locations configured.</Text>
              </View>
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
                <Loader2 size={24} color="#fff" style={{ animate: 'spin' }} />
              ) : (
                <>
                  <CheckCircle2 size={24} color="#fff" strokeWidth={2.5} />
                  <Text style={styles.confirmButtonText}>FINALIZE SHELVING</Text>
                </>
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
    backgroundColor: "#0f172a" 
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    backgroundColor: '#0f172a',
  },
  permissionText: {
    color: "#94a3b8",
    fontSize: 16,
    fontWeight: '600',
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
    textTransform: 'uppercase',
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
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanTarget: {
    width: 260,
    height: 260,
    backgroundColor: "rgba(16, 185, 129, 0.05)",
    borderRadius: 32,
  },
  centerIcon: {
    position: 'absolute',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#10b981',
    borderWidth: 4,
  },
  topLeft: { top: -2, left: -2, borderBottomWidth: 0, borderRightWidth: 0, borderTopLeftRadius: 32 },
  topRight: { top: -2, right: -2, borderBottomWidth: 0, borderLeftWidth: 0, borderTopRightRadius: 32 },
  bottomLeft: { bottom: -2, left: -2, borderTopWidth: 0, borderRightWidth: 0, borderBottomLeftRadius: 32 },
  bottomRight: { bottom: -2, right: -2, borderTopWidth: 0, borderLeftWidth: 0, borderBottomRightRadius: 32 },
  instructionText: {
    color: "#fff",
    marginTop: 40,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
    textTransform: 'uppercase',
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
    borderColor: '#334155',
  },
  detailsContainer: { flex: 1, padding: 24 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 32,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e293b",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginRight: 16,
    borderWidth: 1,
    borderColor: '#334155',
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
    textTransform: 'uppercase',
    letterSpacing: -0.5,
  },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 24,
    padding: 24,
    marginBottom: 32,
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
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  wineMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  wineVintage: { color: "#6366f1", fontSize: 16, fontWeight: "800" },
  metaDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#334155' },
  wineProducer: { color: "#64748b", fontSize: 14, fontWeight: "600" },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  sectionTitle: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "900",
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  locationList: { paddingBottom: 120 },
  locationRow: { justifyContent: "space-between", gap: 12 },
  locationItem: {
    backgroundColor: "#1e293b",
    borderRadius: 24,
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
    backgroundColor: "#1e293b",
    shadowColor: "#4f46e5",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  locationName: {
    color: "#94a3b8",
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  locationNameSelected: { color: "#fff" },
  locationType: {
    color: "#475569",
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  emptyContainer: { alignItems: 'center', paddingVertical: 60, gap: 16 },
  emptyText: { color: "#475569", fontSize: 14, fontWeight: '700', textAlign: "center" },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    backgroundColor: "transparent",
  },
  confirmButton: {
    backgroundColor: "#10b981",
    height: 72,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: 'row',
    gap: 12,
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  confirmButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  buttonDisabled: { opacity: 0.3 },
});

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
