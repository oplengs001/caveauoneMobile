import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { db } from "@/lib/firebase";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc
} from "firebase/firestore";
import {
  AlertTriangle,
  Box,
  Camera,
  CheckCircle2,
  Map,
  MapPin,
  RefreshCw,
  ScanQrCode,
  Wine,
  X
} from 'lucide-react-native';
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
  const { profile } = useAuth();
  const theme = profile?.role === 'store' ? Colors.store : Colors.warehouse;
  const isStore = profile?.role === 'store';

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
  const { bottleId: initialBottleId } = useLocalSearchParams();

  useEffect(() => {
    fetchLocations();
    
    if (initialBottleId) {
      loadBottleData(initialBottleId as string);
    }
  }, [initialBottleId]);

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

  const loadBottleData = async (bottleId: string) => {
    if (loading || isProcessing.current) return;

    isProcessing.current = true;
    setLoading(true);
    setScannedSku(bottleId);

    try {
      const bottleRef = doc(db, "inventory_bottles", bottleId);
      const bottleSnap = await getDoc(bottleRef);

      if (!bottleSnap.exists()) {
        Alert.alert("Invalid QR", "This QR code does not belong to any bottle in the system.", [
          {
            text: "Try Again", onPress: () => {
              setScannedSku(null);
              setLoading(false);
              isProcessing.current = false;
              setState("scanning");
            }
          }
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

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (state !== "scanning") return;
    loadBottleData(data);
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

  const handleMarkAsSold = async () => {
    if (!bottle) return;

    setState("updating");
    try {
      const bottleRef = doc(db, "inventory_bottles", bottle.id);

      await updateDoc(bottleRef, {
        status: "consumed",
        updatedAt: new Date(),
      });

      Alert.alert("Sold!", "The bottle has been marked as sold and removed from active inventory.", [
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
      console.error("Error marking as sold:", error);
      Alert.alert("Error", "Failed to update status.");
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
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
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
        <View style={[styles.detailsContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.header, { borderBottomColor: theme.border, borderBottomWidth: isStore ? 1 : 0 }]}>
            <TouchableOpacity onPress={() => { isProcessing.current = false; setState("scanning"); }} style={[styles.backButton, { backgroundColor: isStore ? theme.card : 'transparent', padding: isStore ? 10 : 0, borderRadius: 12, borderWidth: isStore ? 1 : 0, borderColor: theme.border }]}>
              <RefreshCw size={20} color={isStore ? theme.primary : "#fff"} strokeWidth={2.5} />
              <Text style={[styles.backText, { color: isStore ? theme.primary : "#fff" }]}>RESCAN</Text>
            </TouchableOpacity>
            <Text style={[styles.title, { color: theme.text }]}>Tag Location</Text>
          </View>

          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Box size={14} color={theme.secondary} />
              <Text style={[styles.skuLabel, { color: theme.textSecondary }]}>BOTTLE ID: {bottle?.id.slice(0, 12).toUpperCase()}</Text>
            </View>
            <Text style={[styles.wineName, { color: theme.text }]}>{wine?.name || "Processing..."}</Text>
            <View style={styles.wineMetaRow}>
              <Text style={[styles.wineVintage, { color: theme.textSecondary }]}>{wine?.vintage}</Text>
              <View style={[styles.metaDot, { backgroundColor: theme.border }]} />
              <Text style={[styles.wineProducer, { color: theme.textSecondary }]}>{wine?.producer || "Independent Producer"}</Text>
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
                  { backgroundColor: theme.card, borderColor: theme.border },
                  selectedLocationId === item.id && [styles.locationItemSelected, { backgroundColor: theme.accent, borderColor: theme.accent }],
                ]}
                onPress={() => setSelectedLocationId(item.id)}
              >
                <MapPin
                  size={28}
                  color={selectedLocationId === item.id ? "#fff" : theme.textSecondary}
                  strokeWidth={selectedLocationId === item.id ? 2.5 : 2}
                />
                <Text
                  style={[
                    styles.locationName,
                    { color: theme.text },
                    selectedLocationId === item.id && styles.locationNameSelected,
                  ]}
                >
                  {item.name}
                </Text>
                <Text style={[styles.locationType, { color: selectedLocationId === item.id ? "rgba(255,255,255,0.7)" : theme.textSecondary }]}>
                  {item.type.toUpperCase()}
                </Text>
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
            {isStore && (
              <TouchableOpacity
                style={[
                  styles.soldButton,
                  { backgroundColor: theme.primary, marginBottom: 12 },
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
                    <Text style={styles.confirmButtonText}>MARK AS SOLD</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.confirmButton,
                { backgroundColor: isStore ? theme.secondary : '#10b981' },
                (!selectedLocationId || state === "updating") && styles.buttonDisabled,
              ]}
              onPress={handleConfirmTagging}
              disabled={!selectedLocationId || state === "updating"}
            >
              {state === "updating" ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <CheckCircle2 size={24} color="#fff" strokeWidth={2.5} />
                  <Text style={styles.confirmButtonText}>
                    {isStore ? "UPDATE LOCATION" : "FINALIZE SHELVING"}
                  </Text>
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
  soldButton: {
    height: 72,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: 'row',
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  buttonDisabled: { opacity: 0.3 },
});


