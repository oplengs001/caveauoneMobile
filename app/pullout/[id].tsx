import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
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
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  MapPin,
  PackageSearch,
  ScanQrCode,
  Search,
} from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  InventoryBottle,
  Location,
  MasterWine,
  PulloutRequest,
} from "../../types";

export default function PulloutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const [request, setRequest] = useState<PulloutRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    (InventoryBottle & {
      wineName: string;
      locationName: string;
      vintage: string;
      producer: string;
      format: string;
    })[]
  >([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const isProcessing = useRef(false);
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
    if (!scanning || !request || isProcessing.current) return;
    isProcessing.current = true;
    setScanning(false);
    setLoading(true);

    try {
      // 1. Find bottle by ID
      const bottleSnap = await getDoc(doc(db, "inventory_bottles", data));

      if (!bottleSnap.exists()) {
        Alert.alert("Not Found", `No bottle found with ID: ${data}`, [
          {
            text: "OK",
            onPress: () => {
              isProcessing.current = false;
              setScanning(true);
            },
          },
        ]);
        setLoading(false);
        return;
      }

      const bottleData = {
        id: bottleSnap.id,
        ...bottleSnap.data(),
      } as InventoryBottle;

      if (bottleData.status !== "received" && bottleData.status !== "shelved") {
        Alert.alert(
          "Invalid Status",
          `Bottle is already ${bottleData.status}.`,
          [
            {
              text: "OK",
              onPress: () => {
                isProcessing.current = false;
                setScanning(true);
              },
            },
          ],
        );
        setLoading(false);
        return;
      }

      // 2. Check if this wine is in the request
      const masterWineId = bottleData.masterWineRef.id;
      const itemIndex = request.items.findIndex(
        (i) => i.masterWineId === masterWineId && i.pulledQty < i.requestedQty,
      );

      if (itemIndex === -1) {
        Alert.alert(
          "Not Requested",
          "This wine is not needed for this request or already fulfilled.",
          [
            {
              text: "OK",
              onPress: () => {
                isProcessing.current = false;
                setScanning(true);
              },
            },
          ],
        );
        setLoading(false);
        return;
      }

      if (!request.outBoundStoreId) {
        Alert.alert("Error", "Pullout request is missing a target store.", [
          {
            text: "OK",
            onPress: () => {
              isProcessing.current = false;
              setScanning(true);
            },
          },
        ]);
        setLoading(false);
        return;
      }

      // 3. Update Bottle
      await updateDoc(doc(db, "inventory_bottles", bottleData.id), {
        status: "outbound",
        outboundLocationRef: doc(db, "stores", request.outBoundStoreId),
        updatedAt: Timestamp.now(),
      });

      // 4. Update Request
      const updatedItems = [...request.items];
      updatedItems[itemIndex].pulledQty += 1;
      updatedItems[itemIndex].pulledBottleIds = [
        ...(updatedItems[itemIndex].pulledBottleIds || []),
        bottleData.id,
      ];

      const allFulfilled = updatedItems.every(
        (i) => i.pulledQty >= i.requestedQty || i.skipped,
      );

      await updateDoc(doc(db, "pullout_requests", request.id), {
        items: updatedItems,
        status: allFulfilled ? "completed" : "in_progress",
        updatedAt: Timestamp.now(),
      });

      Alert.alert("Success", `Pulled ${updatedItems[itemIndex].wineName}`, [
        {
          text: allFulfilled ? "Finish" : "Scan Next",
          onPress: () => {
            isProcessing.current = false;
            if (allFulfilled) {
              fetchRequest();
            } else {
              setScanning(true);
            }
          },
        },
      ]);

      await fetchRequest();
    } catch (error) {
      console.error("Error processing pullout:", error);
      Alert.alert("Error", "Failed to process pullout.");
      isProcessing.current = false;
    } finally {
      setLoading(false);
    }
  };

  const handleSkipItem = (index: number) => {
    if (!request) return;

    Alert.alert(
      "Skip Item?",
      "Mark this bottle as unavailable? You can still complete the request after skipping.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Skip Item",
          style: "destructive",
          onPress: async () => {
            try {
              const newItems = [...request.items];
              newItems[index] = {
                ...newItems[index],
                skipped: true,
                skippedAt: new Date(),
              };

              await updateDoc(doc(db, "pullout_requests", id as string), {
                items: newItems,
                updatedAt: new Date(),
              });

              setRequest((prev) =>
                prev ? { ...prev, items: newItems } : null,
              );
            } catch (error) {
              console.error("Error skipping item:", error);
              Alert.alert("Error", "Failed to skip item.");
            }
          },
        },
      ],
    );
  };

  const handleCompleteRequest = async () => {
    if (!request) return;

    const hasSkipped = request.items.some((i) => i.skipped);

    Alert.alert(
      "Complete Request?",
      hasSkipped
        ? "Warning: Some items were skipped. Are you sure you want to finalize this request?"
        : "All items have been pulled. Ready to complete?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Complete",
          onPress: async () => {
            try {
              await updateDoc(doc(db, "pullout_requests", id as string), {
                status: "completed",
                completedAt: new Date(),
                updatedAt: new Date(),
              });
              router.back();
            } catch (error) {
              console.error("Error completing request:", error);
              Alert.alert("Error", "Failed to complete request.");
            }
          },
        },
      ],
    );
  };

  const handleSearch = async (specificSku?: string) => {
    const term = specificSku || searchQuery.trim();
    if (!term) {
      setSearchResults([]);
      return;
    }

    if (specificSku) setSearchQuery(specificSku);

    setSearchLoading(true);
    try {
      const bottlesRef = collection(db, "inventory_bottles");
      const constraints: any[] = [
        where("sku", "==", term),
        where("status", "in", ["received", "shelved"]),
      ];

      if (profile?.locationId) {
        constraints.push(
          where("storeRef", "==", doc(db, "stores", profile.locationId)),
        );
      }

      const q = query(bottlesRef, ...constraints);
      const snap = await getDocs(q);

      const results = await Promise.all(
        snap.docs.map(async (doc) => {
          const data = doc.data();
          let wineName = "Unknown Wine";
          let locationName = "No Location";
          let vintage = "NV";
          let producer = "";
          let format = "75cl";

          if (data.masterWineRef) {
            const wineSnap = await getDoc(data.masterWineRef);
            if (wineSnap.exists()) {
              const mw = wineSnap.data() as MasterWine;
              wineName = mw.name;
              vintage = mw.vintage || "NV";
              producer = mw.producer || "";
              format = mw.format || "75cl";
            }
          }

          if (data.locationRef) {
            const locSnap = await getDoc(data.locationRef);
            if (locSnap.exists())
              locationName = (locSnap.data() as Location).name;
          }

          return {
            id: doc.id,
            ...data,
            wineName,
            vintage,
            producer,
            format,
            locationName,
          } as any;
        }),
      );

      setSearchResults(results);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setSearchLoading(false);
    }
  };

  if (!permission) return <View />;
  if (!permission.granted && scanning) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>Camera permission required</Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={requestPermission}
        >
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

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <ChevronLeft size={28} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.title}>Pullout Details</Text>
      </View>

      {loading && !request ? (
        <ActivityIndicator size="large" color="#4f46e5" style={{ flex: 1 }} />
      ) : request ? (
        <>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.statusCard}>
              <Text style={styles.statusLabel}>TASK STATUS</Text>
              <Text style={styles.statusValue}>
                {request.status.replace("_", " ").toUpperCase()}
              </Text>
            </View>

            <View style={styles.searchSection}>
              <View style={styles.sectionHeader}>
                <MapPin size={16} color="#6366f1" />
                <Text style={styles.sectionTitle}>Check Location</Text>
              </View>
              <View style={styles.searchBar}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Enter SKU..."
                  placeholderTextColor="#475569"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={styles.searchButton}
                  onPress={() => handleSearch()}
                  disabled={searchLoading}
                >
                  {searchLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Search size={20} color="#fff" strokeWidth={2.5} />
                  )}
                </TouchableOpacity>
              </View>

              {searchResults.length > 0 && (
                <View style={styles.searchResults}>
                  {searchResults.map((res) => (
                    <View key={res.id} style={styles.searchResultItem}>
                      <View style={styles.resultInfo}>
                        <Text style={styles.resultWineName}>
                          {res.wineName}
                        </Text>
                        <Text
                          style={{
                            fontSize: 12,
                            color: "#64748b",
                            fontWeight: "500",
                            marginBottom: 4,
                          }}
                        >
                          {res.vintage} • {res.producer} • {res.format}
                        </Text>
                        <Text style={styles.resultLocation}>
                          Located at: {res.locationName}
                        </Text>
                      </View>
                      <View style={styles.resultBadge}>
                        <Text style={styles.resultStatus}>
                          {res.status.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.sectionHeader}>
              <PackageSearch size={16} color="#6366f1" />
              <Text style={styles.sectionTitle}>Items to Pull</Text>
            </View>
            <View style={styles.itemsList}>
              {request.items.map((item, index) => {
                const isFulfilled = item.pulledQty >= item.requestedQty;
                const isSkipped = item.skipped;
                const progress = Math.min(
                  1,
                  item.pulledQty / item.requestedQty,
                );

                return (
                  <View
                    key={index}
                    style={[
                      styles.itemCard,
                      isFulfilled && styles.itemCardFulfilled,
                      isSkipped && styles.itemCardSkipped,
                    ]}
                  >
                    <View style={styles.itemMain}>
                      <TouchableOpacity
                        style={styles.itemInfo}
                        onPress={() =>
                          !isFulfilled && !isSkipped && handleSearch(item.sku)
                        }
                      >
                        <View style={styles.itemHeaderRow}>
                          <View style={{ flex: 1, paddingRight: 10 }}>
                            <Text
                              style={[
                                styles.itemName,
                                isSkipped && styles.textMuted,
                              ]}
                            >
                              {item.wineName}
                            </Text>
                            <Text
                              style={[
                                {
                                  fontSize: 12,
                                  color: "#64748b",
                                  fontWeight: "600",
                                  marginTop: 2,
                                },
                                isSkipped && styles.textMuted,
                              ]}
                            >
                              {item.vintage} •{" "}
                              {item.producer || "Independent Producer"} •{" "}
                              {item.format}
                            </Text>
                          </View>
                          <View style={styles.itemActions}>
                            {isFulfilled ? (
                              <CheckCircle2
                                size={20}
                                color="#10b981"
                                strokeWidth={2.5}
                              />
                            ) : isSkipped ? (
                              <AlertCircle
                                size={20}
                                color="#ef4444"
                                strokeWidth={2.5}
                              />
                            ) : (
                              <View style={styles.actionButtons}>
                                <TouchableOpacity
                                  onPress={() => handleSearch(item.sku)}
                                  style={styles.actionIcon}
                                >
                                  <Search
                                    size={18}
                                    color="#6366f1"
                                    strokeWidth={2}
                                  />
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={() => handleSkipItem(index)}
                                  style={styles.skipButton}
                                >
                                  <Text style={styles.skipButtonText}>
                                    Skip
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        </View>

                        <View style={styles.itemMetaRow}>
                          <Text style={styles.itemSku}>SKU: {item.sku}</Text>
                          <Text
                            style={[
                              styles.itemProgress,
                              isSkipped && { color: "#ef4444" },
                              isFulfilled && { color: "#10b981" },
                            ]}
                          >
                            {isSkipped
                              ? "SKIPPED"
                              : `${item.pulledQty} OF ${item.requestedQty} PULLED`}
                          </Text>
                        </View>

                        {!isSkipped && (
                          <View style={styles.progressContainer}>
                            <View style={styles.progressBarBg}>
                              <View
                                style={[
                                  styles.progressBarFill,
                                  { width: `${progress * 100}%` },
                                  isFulfilled && { backgroundColor: "#10b981" },
                                ]}
                              />
                            </View>
                          </View>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>

          {request.status !== "completed" && (
            <View style={styles.footer}>
              {request.items.every(
                (i) => i.pulledQty >= i.requestedQty || i.skipped,
              ) ? (
                <TouchableOpacity
                  style={[styles.completeButton]}
                  onPress={handleCompleteRequest}
                >
                  <CheckCircle2 size={24} color="#fff" strokeWidth={2.5} />
                  <Text style={styles.completeButtonText}>Finalize Task</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.scanButton}
                  onPress={() => {
                    isProcessing.current = false;
                    setScanning(true);
                  }}
                >
                  <ScanQrCode size={24} color="#fff" strokeWidth={2.5} />
                  <Text style={styles.scanButtonText}>Scan to Pull</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </>
      ) : (
        <Text style={styles.errorText}>Task not found.</Text>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 24,
    paddingBottom: 20,
  },
  backButton: {
    marginRight: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: -0.5,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 8,
  },
  statusCard: {
    backgroundColor: "#1e293b",
    padding: 24,
    borderRadius: 24,
    marginBottom: 32,
    borderLeftWidth: 6,
    borderLeftColor: "#4f46e5",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 4,
  },
  statusLabel: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 8,
  },
  statusValue: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  itemsList: {
    gap: 12,
    paddingBottom: 40,
  },
  itemCard: {
    backgroundColor: "#1e293b",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#334155",
    overflow: "hidden",
  },
  itemCardFulfilled: {
    borderColor: "rgba(16, 185, 129, 0.3)",
    backgroundColor: "rgba(16, 185, 129, 0.05)",
  },
  itemCardSkipped: {
    borderColor: "rgba(239, 68, 68, 0.3)",
    backgroundColor: "rgba(239, 68, 68, 0.05)",
  },
  itemMain: {
    padding: 20,
  },
  itemHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
  },
  itemName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    flex: 1,
    lineHeight: 22,
  },
  textMuted: {
    textDecorationLine: "line-through",
    opacity: 0.3,
  },
  itemMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  itemSku: {
    color: "#6366f1",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  itemProgress: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  progressContainer: {
    width: "100%",
  },
  progressBarBg: {
    height: 6,
    backgroundColor: "#0f172a",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#6366f1",
    borderRadius: 3,
  },
  itemActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#0f172a",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  skipButton: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
  },
  skipButtonText: {
    color: "#ef4444",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  itemInfo: {
    width: "100%",
  },
  footer: {
    padding: 24,
    backgroundColor: "transparent",
  },
  scanButton: {
    backgroundColor: "#4f46e5",
    height: 72,
    borderRadius: 24,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    shadowColor: "#4f46e5",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  scanButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  completeButton: {
    backgroundColor: "#10b981",
    height: 72,
    borderRadius: 24,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  completeButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  scannerOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  scanTarget: {
    width: 260,
    height: 260,
    borderWidth: 2,
    borderColor: "#4f46e5",
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
    backgroundColor: "#1e293b",
    paddingHorizontal: 40,
    paddingVertical: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#334155",
  },
  cancelScanText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  permissionText: {
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 100,
    fontSize: 16,
    fontWeight: "600",
  },
  permissionButton: {
    backgroundColor: "#4f46e5",
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
  errorText: {
    color: "#ef4444",
    textAlign: "center",
    marginTop: 40,
    fontWeight: "700",
  },
  searchSection: {
    marginBottom: 32,
    backgroundColor: "#1e293b",
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#334155",
  },
  searchBar: {
    flexDirection: "row",
    gap: 12,
  },
  searchInput: {
    flex: 1,
    backgroundColor: "#0f172a",
    borderRadius: 16,
    paddingHorizontal: 20,
    height: 56,
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    borderWidth: 1,
    borderColor: "#334155",
  },
  searchButton: {
    backgroundColor: "#4f46e5",
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  searchResults: {
    marginTop: 20,
    gap: 10,
  },
  searchResultItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#0f172a",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334155",
  },
  resultInfo: {
    flex: 1,
  },
  resultWineName: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  resultLocation: {
    color: "#10b981",
    fontSize: 12,
    fontWeight: "900",
    marginTop: 4,
    textTransform: "uppercase",
  },
  resultBadge: {
    backgroundColor: "#1e293b",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  resultStatus: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
});
