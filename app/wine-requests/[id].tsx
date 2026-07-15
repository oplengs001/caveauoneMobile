import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { logActivity } from "@/lib/utils/activityLogger";
import { InventoryBottle, PulloutRequest, WineRequest } from "@/types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { collection, doc, documentId, getDoc, getDocs, limit, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Clock,
  MapPin,
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
  const { profile } = useAuth();

  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const isProcessing = useRef(false);
  const [request, setRequest] = useState<WineRequest | null>(null);
  const [loading, setLoading] = useState(true);

  // Batch Mode States
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [pulloutRequest, setPulloutRequest] = useState<PulloutRequest | null>(null);
  const [batchBottles, setBatchBottles] = useState<{
    bottleId: string;
    masterWineId: string;
    wineName: string;
    vintage?: string;
    format?: string;
    producer?: string;
  }[]>([]);
  const [verifiedBottleIds, setVerifiedBottleIds] = useState<Set<string>>(new Set());
  const [skippedBottleIds, setSkippedBottleIds] = useState<Set<string>>(new Set());
  const lastBatchScanTime = useRef<number>(0);

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
        const reqData = {
          id: snap.id,
          ...snap.data(),
          createdAt: snap.data().createdAt?.toDate() || new Date(),
        } as WineRequest;
        setRequest(reqData);

        // Fetch associated pullout request to populate batch bottles
        const pulloutsRef = collection(db, "pullout_requests");
        const q = query(pulloutsRef, where("wineRequestId", "==", id), limit(1));
        const pulloutSnap = await getDocs(q);

        if (!pulloutSnap.empty) {
          const poData = { id: pulloutSnap.docs[0].id, ...pulloutSnap.docs[0].data() } as PulloutRequest;
          setPulloutRequest(poData);

          const bottles: any[] = [];
          poData.items.forEach(item => {
            if (item.pulledBottleIds) {
              item.pulledBottleIds.forEach(bid => {
                bottles.push({
                  bottleId: bid,
                  masterWineId: item.masterWineId,
                  wineName: item.wineName,
                  vintage: item.vintage,
                  format: item.format,
                  producer: item.producer
                });
              });
            }
          });
          setBatchBottles(bottles);

          // Verify which bottles are already received
          const bIds = bottles.map(b => b.bottleId);
          const verified = new Set<string>();
          if (bIds.length > 0) {
            const chunks = [];
            for (let i = 0; i < bIds.length; i += 10) chunks.push(bIds.slice(i, i + 10));

            for (const chunk of chunks) {
              const bq = query(collection(db, "inventory_bottles"), where(documentId(), "in", chunk));
              const bSnap = await getDocs(bq);
              bSnap.docs.forEach(d => {
                if (d.data().status === "received" || d.data().status === "shelved") {
                  verified.add(d.id);
                }
              });
            }
          }
          setVerifiedBottleIds(verified);
        }
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
      const skippedQty = item.skippedQty || 0;
      const targetQty = item.qty;

      if (ingressedQty + skippedQty >= targetQty) {
        Alert.alert(
          "Fully Handled",
          "All expected available units of this wine have been received.",
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

      // Request is complete if every item's received + skipped quantity equals or exceeds what was asked
      const allReceived = newItems.every(
        (i) => (i.ingressedQty || 0) + (i.skippedQty || 0) >= i.qty,
      );
      const newStatus = allReceived ? "ingress_complete" : "receiving";

      await updateDoc(doc(db, "wine_requests", request.id), {
        items: newItems,
        status: newStatus,
        updatedAt: serverTimestamp(),
      });

      // Invalidate dashboard metrics cache for this store
      await AsyncStorage.removeItem(`dashboard_metrics_${request.storeId}`);

      // Log the receive operation
      logActivity({
        action: newStatus === "ingress_complete" ? "WINE_REQUEST_INGRESS_COMPLETE" : "BOTTLE_RECEIVED",
        entity: "wine_requests",
        entityId: request.id,
        summary: `Received bottle ${data} (${item.wineName}) for wine request ${request.id}${newStatus === "ingress_complete" ? " — all items received" : ""
          }`,
        details: {
          bottleId: data,
          wineName: item.wineName,
          ingressedQty: (item.ingressedQty || 0) + 1,
          targetQty: item.qty,
          requestStatus: newStatus,
        },
        performedBy: profile?.email || "unknown",
        performedByRole: profile?.role || "store",
        source: (profile?.role as any) || "store",
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

  const handleBatchQRScan = async ({ data }: { data: string }) => {
    if (!isBatchMode || !request || isProcessing.current) return;

    const now = Date.now();
    if (now - lastBatchScanTime.current < 2000) return;

    if (verifiedBottleIds.has(data) || skippedBottleIds.has(data)) return;

    const expectedBottle = batchBottles.find(b => b.bottleId === data);
    if (!expectedBottle) {
      lastBatchScanTime.current = now;
      Alert.alert("Invalid QR", "This bottle is not part of this request.", [{ text: "OK" }]);
      return;
    }

    lastBatchScanTime.current = now;
    isProcessing.current = true;

    try {
      const bottleRef = doc(db, "inventory_bottles", data);
      await updateDoc(bottleRef, {
        status: "received",
        storeRef: doc(db, "stores", request.storeId),
        locationRef: null,
        outboundLocationRef: null,
        updatedAt: serverTimestamp(),
      });

      const itemIndex = request.items.findIndex((i) => i.masterWineId === expectedBottle.masterWineId);
      if (itemIndex !== -1) {
        const item = request.items[itemIndex];
        const newItems = [...request.items];
        newItems[itemIndex] = {
          ...item,
          ingressedQty: (item.ingressedQty || 0) + 1,
        };

        const allReceived = newItems.every(
          (i) => (i.ingressedQty || 0) + (i.skippedQty || 0) >= i.qty,
        );
        const newStatus = allReceived ? "ingress_complete" : "receiving";

        await updateDoc(doc(db, "wine_requests", request.id), {
          items: newItems,
          status: newStatus,
          updatedAt: serverTimestamp(),
        });

        setRequest(prev => prev ? { ...prev, items: newItems, status: newStatus as any } : prev);
      }

      setVerifiedBottleIds(prev => new Set(prev).add(data));
      await AsyncStorage.removeItem(`dashboard_metrics_${request.storeId}`);

    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to receive bottle.");
    } finally {
      isProcessing.current = false;
    }
  };

  const handleBatchSkip = async (bottleId: string, masterWineId: string) => {
    if (!request || isProcessing.current) return;

    Alert.alert("Report Missing", "Mark this bottle as not arrived?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Confirm", style: "destructive", onPress: async () => {
          isProcessing.current = true;
          try {
            const itemIndex = request.items.findIndex((i) => i.masterWineId === masterWineId);
            if (itemIndex !== -1) {
              const item = request.items[itemIndex];
              const newItems = [...request.items];
              newItems[itemIndex] = {
                ...item,
                skippedQty: (item.skippedQty || 0) + 1,
              };

              const allReceived = newItems.every(
                (i) => (i.ingressedQty || 0) + (i.skippedQty || 0) >= i.qty,
              );
              const newStatus = allReceived ? "ingress_complete" : "receiving";

              await updateDoc(doc(db, "wine_requests", request.id), {
                items: newItems,
                status: newStatus,
                updatedAt: serverTimestamp(),
              });

              setRequest(prev => prev ? { ...prev, items: newItems, status: newStatus as any } : prev);
            }

            setSkippedBottleIds(prev => new Set(prev).add(bottleId));
          } catch (err) {
            console.error(err);
            Alert.alert("Error", "Failed to skip bottle.");
          } finally {
            isProcessing.current = false;
          }
        }
      }
    ]);
  };

  const handleBatchNoQR = async (bottleId: string) => {
    if (!request || isProcessing.current) return;
    
    if (verifiedBottleIds.has(bottleId) || skippedBottleIds.has(bottleId)) return;

    const expectedBottle = batchBottles.find(b => b.bottleId === bottleId);
    if (!expectedBottle) return;

    Alert.alert(
      "No QR Code?",
      "Mark this bottle as received even though there is no QR label?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Receive", 
          onPress: async () => {
            isProcessing.current = true;
            try {
              const bottleRef = doc(db, "inventory_bottles", bottleId);
              await updateDoc(bottleRef, {
                status: "received",
                isTagged: false,
                storeRef: doc(db, "stores", request.storeId),
                outboundLocationRef: null,
                updatedAt: serverTimestamp(),
              });

              logActivity({
                action: "WINE_REQUEST_INGRESS_MANUAL",
                entity: "wine_requests",
                entityId: request.id,
                summary: `Manually received bottle ${bottleId} (${expectedBottle.wineName}) at store`,
                details: {
                  bottleId,
                  storeId: request.storeId,
                  wineName: expectedBottle.wineName,
                  manual_ingress: true
                },
                performedBy: profile?.email || "unknown",
                performedByRole: profile?.role || "store",
                source: (profile?.role as any) || "store"
              });

              const itemIndex = request.items.findIndex(i => i.masterWineId === expectedBottle.masterWineId);
              if (itemIndex > -1) {
                const newItems = [...request.items];
                const currentIngressed = newItems[itemIndex].ingressedQty || 0;
                newItems[itemIndex].ingressedQty = currentIngressed + 1;
                
                const isAllReceived = newItems.every(i => (i.ingressedQty || 0) + (i.skippedQty || 0) >= i.qty);
                const newStatus = isAllReceived ? "ingress_complete" : request.status;

                await updateDoc(doc(db, "wine_requests", request.id), {
                  items: newItems,
                  status: newStatus,
                  updatedAt: serverTimestamp(),
                });
                
                setRequest(prev => prev ? { ...prev, items: newItems, status: newStatus as any } : prev);
              }
              
              setVerifiedBottleIds(prev => new Set(prev).add(bottleId));
              await AsyncStorage.removeItem(`dashboard_metrics_${request.storeId}`);
              
            } catch (err) {
              console.error(err);
              Alert.alert("Error", "Failed to receive bottle manually.");
            } finally {
              isProcessing.current = false;
            }
          }
        }
      ]
    );
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

  if (isBatchMode) {
    const isAllBatchHandled = batchBottles.length > 0 &&
      (verifiedBottleIds.size + skippedBottleIds.size) === batchBottles.length;

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setIsBatchMode(false)} style={styles.backButton}>
            <ArrowLeft size={24} color={theme.primary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.primary }]}>Batch Receive</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              REQ: {request?.id.slice(0, 8).toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={{ flex: 1 }}>
          {!isAllBatchHandled ? (
            <View
              style={{
                height: 320,
                margin: 16,
                borderRadius: 24,
                overflow: "hidden",
                backgroundColor: "#000",
              }}
            >
              <CameraView
                style={{ flex: 1 }}
                onBarcodeScanned={handleBatchQRScan}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              />
              <View
                style={{
                  ...StyleSheet.absoluteFillObject,
                  justifyContent: "center",
                  alignItems: "center",
                  backgroundColor: "rgba(0,0,0,0.35)",
                }}
              >
                <View
                  style={{
                    width: 140,
                    height: 140,
                    borderWidth: 2,
                    borderColor: theme.primary,
                    borderRadius: 12,
                    backgroundColor: "transparent",
                  }}
                />
                <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700", marginTop: 12 }}>
                  Scan expected QR label
                </Text>
              </View>
            </View>
          ) : (
            <View style={{ margin: 16, padding: 24, backgroundColor: "#d1fae5", borderRadius: 24, alignItems: "center", justifyContent: "center", gap: 12 }}>
              <CheckCircle2 size={48} color="#059669" />
              <Text style={{ color: "#065f46", fontSize: 18, fontWeight: "900", textTransform: "uppercase" }}>All Wines Processed</Text>
              <Text style={{ color: "#065f46", fontSize: 13, fontWeight: "600", textAlign: "center" }}>
                You have successfully scanned or skipped all expected bottles.
              </Text>
            </View>
          )}

          <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
            {batchBottles.map((bottle, index) => {
              const isVerified = verifiedBottleIds.has(bottle.bottleId);
              const isSkipped = skippedBottleIds.has(bottle.bottleId);
              const isPending = !isVerified && !isSkipped;

              return (
                <View key={bottle.bottleId} style={{ flexDirection: "row", alignItems: "center", backgroundColor: theme.card, padding: 16, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: isVerified ? "#10b981" : isSkipped ? "#ef4444" : theme.border, gap: 14 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: isVerified ? "rgba(16,185,129,0.15)" : isSkipped ? "rgba(239,68,68,0.15)" : theme.background, alignItems: "center", justifyContent: "center" }}>
                    {isVerified ? <CheckCircle2 size={18} color="#10b981" /> : isSkipped ? <Ban size={18} color="#ef4444" /> : <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: "900" }}>{index + 1}</Text>}
                  </View>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>
                      {bottle.wineName}
                    </Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: "500", marginTop: 2 }}>
                      {[bottle.producer, bottle.vintage, bottle.format].filter(Boolean).join(" · ")}
                    </Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: "700", fontFamily: "monospace", marginTop: 4 }}>
                      {bottle.bottleId.slice(-12)}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    {(isVerified || isSkipped) && (
                      <Text style={{ color: isVerified ? "#10b981" : "#ef4444", fontSize: 11, fontWeight: "800", textTransform: "uppercase" }}>
                        {isVerified ? "✓ Received" : "Not Arrived"}
                      </Text>
                    )}
                    {isPending && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <TouchableOpacity onPress={() => handleBatchNoQR(bottle.bottleId)} style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: "rgba(245,158,11,0.1)" }}>
                          <Text style={{ color: "#f59e0b", fontSize: 11, fontWeight: "700" }}>No QR</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleBatchSkip(bottle.bottleId, bottle.masterWineId)} style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: "rgba(239,68,68,0.1)" }}>
                          <Text style={{ color: "#ef4444", fontSize: 11, fontWeight: "700" }}>Skip</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              )
            })}
            <View style={{ height: 40 }} />
          </ScrollView>

          <View style={{ padding: 24, backgroundColor: theme.background }}>
            {verifiedBottleIds.size > 0 && (
              <TouchableOpacity
                style={[styles.scanButton, { marginBottom: 12, backgroundColor: "#10b981", shadowColor: "#10b981" }]}
                onPress={() => {
                  const firstBottleId = Array.from(verifiedBottleIds)[0];
                  const firstBottle = batchBottles.find(b => b.bottleId === firstBottleId);
                  const isMultipleWines = Array.from(verifiedBottleIds).some(id => {
                    const b = batchBottles.find(x => x.bottleId === id);
                    return b?.masterWineId !== firstBottle?.masterWineId;
                  });

                  router.replace({
                    pathname: "/tagging",
                    params: {
                      bottleIds: Array.from(verifiedBottleIds).join(","),
                      mode: "tagging",
                      source: "wine-request",
                      fromRequestId: id,
                      wineName: isMultipleWines ? "Multiple Wines" : firstBottle?.wineName,
                      wineVintage: isMultipleWines ? "" : firstBottle?.vintage,
                      wineProducer: isMultipleWines ? "" : firstBottle?.producer,
                      wineFormat: isMultipleWines ? "" : firstBottle?.format,
                    },
                  });
                }}
              >
                <MapPin size={24} color="#fff" strokeWidth={2.5} />
                <Text style={styles.scanButtonText}>Tag {verifiedBottleIds.size} Locations</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.scanButton, { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, shadowOpacity: 0 }]} onPress={() => setIsBatchMode(false)}>
              <Text style={[styles.scanButtonText, { color: theme.text }]}>Cancel Batch</Text>
            </TouchableOpacity>
          </View>
        </View>
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

  // Check if all requested items have been fully received (or skipped)
  const isAllReceived =
    request.items.length > 0 &&
    request.items.every(
      (i) => (i.ingressedQty || 0) + (i.skippedQty || 0) >= i.qty,
    );

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

          {request.items.map((wine, idx) => {
            const skippedQty = wine.skippedQty || 0;
            // Calculate actual expected amount instead of full amount
            const expectedQty = Math.max(0, wine.qty - skippedQty);
            const isFullySkipped = expectedQty === 0;
            const isItemFulfilled = (wine.ingressedQty || 0) >= expectedQty;

            return (
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
                    {
                      backgroundColor: isFullySkipped
                        ? "#fee2e2"
                        : theme.primary + "18",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.qtyText,
                      { color: isFullySkipped ? "#ef4444" : theme.primary },
                    ]}
                  >
                    {wine.qty}x
                  </Text>
                </View>

                {/* Wine info */}
                <View style={{ flex: 1, paddingRight: 4 }}>
                  <Text
                    style={[
                      styles.wineName,
                      { color: theme.text },
                      isFullySkipped && styles.textMuted,
                    ]}
                  >
                    {wine.wineName}
                  </Text>
                  <Text
                    style={[
                      styles.wineMeta,
                      { color: theme.textSecondary },
                      isFullySkipped && styles.textMuted,
                    ]}
                  >
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

                {/* Status indicators for converted requests */}
                {(request.status === "converted" ||
                  request.status === "receiving" ||
                  request.status === "ingress_complete") && (
                    <View style={{ alignItems: "flex-end", gap: 6 }}>
                      <View
                        style={[
                          styles.progressContainer,
                          isItemFulfilled && { backgroundColor: "#d1fae5" }, // Turn purely green when fulfilled
                        ]}
                      >
                        <Text style={styles.progressText}>
                          {wine.ingressedQty || 0} / {expectedQty}
                        </Text>
                        <Text style={styles.progressLabel}>RCVD</Text>
                      </View>
                    </View>
                  )}
              </View>
            );
          })}
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
                {request.items.reduce(
                  (sum, i) => sum + Math.max(0, i.qty - (i.skippedQty || 0)),
                  0,
                )}{" "}
                btls
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Footer / Call to Actions */}
      {isAllReceived ? (
        <View style={styles.footer}>
          <View style={styles.successIndicator}>
            <CheckCircle2 size={20} color="#059669" />
            <Text style={styles.successIndicatorText}>
              All items successfully received
            </Text>
          </View>
          <TouchableOpacity
            style={styles.scanButton}
            onPress={() => router.dismissTo("/wine-requests")}
          >
            <ArrowLeft size={24} color="#fff" strokeWidth={2.5} />
            <Text style={styles.scanButtonText}>Return to Requests</Text>
          </TouchableOpacity>
        </View>
      ) : (
        (request.status === "receiving" ||
          (request.status === "ingress_complete" && !isAllReceived)) && (
          <View style={styles.footer}>
            {batchBottles.length > 0 && (
              <TouchableOpacity
                style={[styles.scanButton, { marginBottom: 12, backgroundColor: "#4f46e5", shadowColor: "#4f46e5" }]}
                onPress={() => setIsBatchMode(true)}
              >
                <ScanQrCode size={24} color="#fff" strokeWidth={2.5} />
                <Text style={styles.scanButtonText}>Batch Receive</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.scanButton, { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, shadowOpacity: 0 }]}
              onPress={() => setScanning(true)}
            >
              <ScanQrCode size={24} color={theme.text} strokeWidth={2.5} />
              <Text style={[styles.scanButtonText, { color: theme.text }]}>Scan One</Text>
            </TouchableOpacity>
          </View>
        )
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
  textMuted: {
    opacity: 0.4,
    textDecorationLine: "line-through",
  },
  progressContainer: {
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    minWidth: 64,
  },
  progressText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#065f46",
  },
  progressLabel: {
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#065f46",
    marginTop: 1,
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
  successIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 16,
    backgroundColor: "#d1fae5",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  successIndicatorText: {
    color: "#065f46",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
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
