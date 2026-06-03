import { Collapsible } from "@/components/ui/collapsible";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  startAfter,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { logActivity } from "@/lib/utils/activityLogger";

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

const SEARCH_PAGE_SIZE = 20;

export default function PulloutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const theme = profile?.role === "store" ? Colors.store : Colors.warehouse;
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
      readableId?: string;
    })[]
  >([]);
  const [groupedResults, setGroupedResults] = useState<Record<string, any[]>>(
    {},
  );
  const [searchLoading, setSearchLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<any>(null);

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

  useEffect(() => {
    const groups: Record<string, any[]> = {};
    searchResults.forEach((bottle) => {
      const location = bottle.locationName || "Unshelved";
      if (!groups[location]) {
        groups[location] = [];
      }
      groups[location].push(bottle);
    });
    setGroupedResults(groups);
  }, [searchResults]);

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
        (i) =>
          i.masterWineId === masterWineId &&
          i.pulledQty + (i.skippedQty || 0) < i.requestedQty,
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
        storeRef: null,
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
        (i) => i.pulledQty + (i.skippedQty || 0) >= i.requestedQty,
      );

      await updateDoc(doc(db, "pullout_requests", request.id), {
        items: updatedItems,
        status: allFulfilled ? "completed" : "in_progress",
        updatedAt: Timestamp.now(),
      });
      const wineRequestRef = doc(db, "wine_requests", request.wineRequestId);
      if (allFulfilled) {
        await updateDoc(wineRequestRef, {
          updatedAt: new Date(),
          status: "receiving",
        });
      }

      // Log the bottle scan at operation level
      logActivity({
        action: "PULLOUT_BOTTLE_SCANNED",
        entity: "pullout_requests",
        entityId: request.id,
        summary: `Pulled bottle ${bottleData.id} (${updatedItems[itemIndex].wineName}) for pullout ${request.id}${
          allFulfilled ? " — request now complete" : ""
        }`,
        details: {
          bottleId: bottleData.id,
          wineName: updatedItems[itemIndex].wineName,
          pulledQty: updatedItems[itemIndex].pulledQty,
          requestedQty: updatedItems[itemIndex].requestedQty,
          allFulfilled,
          wineRequestId: request.wineRequestId,
        },
        performedBy: profile?.email || "unknown",
        performedByRole: profile?.role || "warehouse",
        source: (profile?.role as any) || "warehouse",
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

  const processSkip = async (index: number, skipCount: number) => {
    if (!request) return;
    try {
      const newItems = [...request.items];
      const item = newItems[index];
      const currentSkipped = item.skippedQty || 0;

      newItems[index] = {
        ...item,
        skippedQty: currentSkipped + skipCount,
        skippedAt: new Date(),
        // Keep skipped true if fully addressing remaining for backward compat
        skipped:
          currentSkipped + skipCount + item.pulledQty >= item.requestedQty,
      };

      await updateDoc(doc(db, "pullout_requests", id as string), {
        items: newItems,
        updatedAt: new Date(),
      });

      setRequest((prev) => (prev ? { ...prev, items: newItems } : null));
    } catch (error) {
      console.error("Error skipping item:", error);
      Alert.alert("Error", "Failed to skip item.");
    }
  };

  const handleSkipItem = (index: number) => {
    if (!request) return;
    const item = request.items[index];
    const currentSkipped = item.skippedQty || 0;
    const remaining = item.requestedQty - item.pulledQty - currentSkipped;

    if (remaining <= 0) return;

    Alert.alert(
      "Skip Bottles",
      `How many bottles of ${item.wineName} do you want to mark as unavailable?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Skip 1 Bottle",
          onPress: () => processSkip(index, 1),
        },
        remaining > 1
          ? {
              text: `Skip All Remaining (${remaining})`,
              style: "destructive",
              onPress: () => processSkip(index, remaining),
            }
          : null,
      ].filter(Boolean) as any,
    );
  };

  const handleCompleteRequest = async () => {
    if (!request) return;

    const hasSkipped = request.items.some(
      (i) => (i.skippedQty || 0) > 0 || i.skipped,
    );

    Alert.alert(
      "Complete Request?",
      hasSkipped
        ? "Warning: Some bottles were skipped. Are you sure you want to finalize this request?"
        : "All items have been pulled. Ready to complete?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Complete",
          onPress: async () => {
            try {
              // 1. Update Pullout Request
              await updateDoc(doc(db, "pullout_requests", id as string), {
                status: "completed",
                completedAt: new Date(),
                updatedAt: new Date(),
              });

              // 2. Update original Wine Request with pulled quantities
              if (request.wineRequestId) {
                const wineRequestRef = doc(
                  db,
                  "wine_requests",
                  request.wineRequestId,
                );
                const wineRequestSnap = await getDoc(wineRequestRef);
                if (wineRequestSnap.exists()) {
                  const wineRequestData = wineRequestSnap.data();
                  const updatedWineRequestItems = wineRequestData.items.map(
                    (wineReqItem: any) => {
                      const correspondingPulloutItem = request.items.find(
                        (pulloutItem) =>
                          pulloutItem.masterWineId === wineReqItem.masterWineId,
                      );
                      if (correspondingPulloutItem) {
                        return {
                          ...wineReqItem,
                          pulledQty: correspondingPulloutItem.pulledQty,
                          skippedQty: correspondingPulloutItem.skippedQty || 0,
                        };
                      }
                      return wineReqItem;
                    },
                  );

                  await updateDoc(wineRequestRef, {
                    items: updatedWineRequestItems,
                    updatedAt: new Date(),
                    status: "receiving",
                  });
                }
              }

              // Log the completion
              logActivity({
                action: "PULLOUT_COMPLETED",
                entity: "pullout_requests",
                entityId: id as string,
                summary: `Pullout request ${id} completed by ${profile?.email} — ${
                  request.items.reduce((s, i) => s + i.pulledQty, 0)
                } bottle(s) pulled`,
                details: {
                  totalPulled: request.items.reduce((s, i) => s + i.pulledQty, 0),
                  totalSkipped: request.items.reduce((s, i) => s + (i.skippedQty || 0), 0),
                  wineRequestId: request.wineRequestId,
                  hasSkipped,
                },
                performedBy: profile?.email || "unknown",
                performedByRole: profile?.role || "warehouse",
                source: (profile?.role as any) || "warehouse",
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

  const handleLoadMore = async () => {
    if (!lastVisible || loadingMore) return;

    setLoadingMore(true);
    try {
      const bottlesRef = collection(db, "inventory_bottles");
      const constraints: any[] = [
        where("sku", "==", searchQuery.trim()),
        where("status", "in", ["received", "shelved"]),
        startAfter(lastVisible),
        limit(SEARCH_PAGE_SIZE),
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
            readableId: data.readableId,
          } as any;
        }),
      );

      setSearchResults((prev) => [...prev, ...results]);
      if (snap.docs.length > 0) {
        setLastVisible(snap.docs[snap.docs.length - 1]);
      } else {
        setLastVisible(null);
      }
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSearch = async (specificSku?: string) => {
    const term = specificSku || searchQuery.trim();
    if (!term) {
      setSearchResults([]);
      return;
    }

    if (specificSku) setSearchQuery(specificSku);

    setSearchLoading(true);
    setSearchResults([]);
    setLastVisible(null);

    try {
      const bottlesRef = collection(db, "inventory_bottles");
      const constraints: any[] = [
        where("sku", "==", term),
        where("status", "in", ["received", "shelved"]),
        limit(SEARCH_PAGE_SIZE),
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
            readableId: data.readableId,
          } as any;
        }),
      );

      setSearchResults(results);
      if (snap.docs.length > 0) {
        setLastVisible(snap.docs[snap.docs.length - 1]);
      } else {
        setLastVisible(null);
      }
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setSearchLoading(false);
    }
  };

  if (!permission) return <View />;
  if (!permission.granted && scanning) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={[styles.permissionText, { color: theme.textSecondary }]}>
          Camera permission required
        </Text>
        <TouchableOpacity
          style={[styles.permissionButton, { backgroundColor: theme.primary }]}
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
            <View
              style={[
                styles.scanTarget,
                {
                  borderColor: theme.primary,
                  backgroundColor: theme.primary + "0D",
                },
              ]}
            />
            <Text style={styles.scanText}>Scan bottle QR to pull</Text>
            <TouchableOpacity
              onPress={() => setScanning(false)}
              style={[
                styles.cancelScanButton,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              <Text style={[styles.cancelScanText, { color: theme.text }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </CameraView>
      </View>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <ChevronLeft size={28} color={theme.primary} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>
          Pullout Details
        </Text>
      </View>

      {loading && !request ? (
        <ActivityIndicator
          size="large"
          color={theme.primary}
          style={{ flex: 1 }}
        />
      ) : request ? (
        <>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View
              style={[
                styles.statusCard,
                { backgroundColor: theme.card, borderLeftColor: theme.primary },
              ]}
            >
              <Text
                style={[styles.statusLabel, { color: theme.textSecondary }]}
              >
                TASK STATUS
              </Text>
              <Text style={[styles.statusValue, { color: theme.text }]}>
                {request.status.replace("_", " ").toUpperCase()}
              </Text>
            </View>
            <View
              style={[
                styles.searchSection,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              <View style={styles.sectionHeader}>
                <MapPin size={16} color={theme.primary} />
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Check Location
                </Text>
              </View>
              <View style={styles.searchBar}>
                <TextInput
                  style={[
                    styles.searchInput,
                    {
                      backgroundColor: theme.background,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                  ]}
                  placeholder="Enter SKU..."
                  placeholderTextColor={theme.textSecondary}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={[
                    styles.searchButton,
                    { backgroundColor: theme.primary },
                  ]}
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

              {Object.keys(groupedResults).length > 0 && (
                <View style={styles.searchResults}>
                  {Object.entries(groupedResults).map(
                    ([locationName, bottles]) => (
                      <Collapsible
                        key={locationName}
                        title={`${locationName} (${bottles.length} bottles)`}
                      >
                        {bottles.map((res) => (
                          <View
                            key={res.id}
                            style={[
                              styles.searchResultItem,
                              {
                                backgroundColor: theme.background,
                                borderColor: theme.border,
                              },
                            ]}
                          >
                            <View style={styles.resultInfo}>
                              <Text
                                style={[
                                  styles.resultWineName,
                                  { color: theme.text },
                                ]}
                              >
                                {res.wineName}
                              </Text>
                              <Text
                                style={{
                                  fontSize: 12,
                                  color: theme.textSecondary,
                                  fontWeight: "500",
                                  marginBottom: 4,
                                }}
                              >
                                {res.vintage} • {res.producer} • {res.format}
                              </Text>
                              <Text
                                style={[
                                  styles.resultId,
                                  { color: theme.textSecondary },
                                ]}
                              >
                                Bottle ID: {res.readableId || res.id}
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.resultBadge,
                                { backgroundColor: theme.card },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.resultStatus,
                                  { color: theme.textSecondary },
                                ]}
                              >
                                {res.status.toUpperCase()}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </Collapsible>
                    ),
                  )}
                  {lastVisible && (
                    <TouchableOpacity
                      style={[
                        styles.loadMoreButton,
                        { backgroundColor: theme.primary },
                      ]}
                      onPress={handleLoadMore}
                      disabled={loadingMore}
                    >
                      {loadingMore ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.loadMoreButtonText}>Load More</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>

            <View style={styles.sectionHeader}>
              <PackageSearch size={16} color={theme.primary} />
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Items to Pull
              </Text>
            </View>
            <View style={styles.itemsList}>
              {request.items.map((item, index) => {
                const skippedCount =
                  item.skippedQty ||
                  (item.skipped ? item.requestedQty - item.pulledQty : 0);
                const isFullyAddressed =
                  item.pulledQty + skippedCount >= item.requestedQty;
                const isFullySkipped = skippedCount === item.requestedQty;
                const isFullyPulled = item.pulledQty === item.requestedQty;
                const isPartiallySkipped = skippedCount > 0 && !isFullySkipped;
                const remaining = Math.max(
                  0,
                  item.requestedQty - item.pulledQty - skippedCount,
                );

                return (
                  <View
                    key={index}
                    style={[
                      styles.itemCard,
                      {
                        backgroundColor: theme.card,
                        borderColor: theme.border,
                      },
                      isFullyPulled && styles.itemCardFulfilled,
                      isFullySkipped && styles.itemCardSkipped,
                      isPartiallySkipped &&
                        isFullyAddressed &&
                        !isFullyPulled &&
                        !isFullySkipped &&
                        styles.itemCardWarning,
                    ]}
                  >
                    <View style={styles.itemMain}>
                      <TouchableOpacity
                        style={styles.itemInfo}
                        onPress={() =>
                          !isFullyAddressed && handleSearch(item.sku)
                        }
                      >
                        <View style={styles.itemHeaderRow}>
                          <View style={{ flex: 1, paddingRight: 10 }}>
                            <Text
                              style={[
                                [styles.itemName, { color: theme.text }],
                                isFullySkipped && styles.textMuted,
                              ]}
                            >
                              {item.wineName}
                            </Text>
                            <Text
                              style={[
                                {
                                  fontSize: 12,
                                  color: theme.textSecondary,
                                  fontWeight: "600",
                                  marginTop: 2,
                                },
                                isFullySkipped && styles.textMuted,
                              ]}
                            >
                              {item.vintage} •{" "}
                              {item.producer || "Independent Producer"} •{" "}
                              {item.format}
                            </Text>
                          </View>
                          <View style={styles.itemActions}>
                            {isFullyAddressed ? (
                              isFullyPulled ? (
                                <CheckCircle2
                                  size={20}
                                  color="#10b981"
                                  strokeWidth={2.5}
                                />
                              ) : isFullySkipped ? (
                                <AlertCircle
                                  size={20}
                                  color="#ef4444"
                                  strokeWidth={2.5}
                                />
                              ) : (
                                <CheckCircle2
                                  size={20}
                                  color="#eab308"
                                  strokeWidth={2.5}
                                />
                              )
                            ) : (
                              <View style={styles.actionButtons}>
                                <TouchableOpacity
                                  onPress={() => handleSearch(item.sku)}
                                  style={[
                                    styles.actionIcon,
                                    {
                                      backgroundColor: theme.background,
                                      borderColor: theme.border,
                                    },
                                  ]}
                                >
                                  <Search
                                    size={18}
                                    color={theme.primary}
                                    strokeWidth={2}
                                  />
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={() => handleSkipItem(index)}
                                  style={[
                                    styles.skipButton,
                                    {
                                      backgroundColor: theme.danger + "1A",
                                      borderColor: theme.danger + "33",
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.skipButtonText,
                                      { color: theme.danger },
                                    ]}
                                  >
                                    Skip
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        </View>

                        <View style={styles.itemMetaRow}>
                          <Text
                            style={[styles.itemSku, { color: theme.primary }]}
                          >
                            SKU: {item.sku}
                          </Text>
                          <Text
                            style={[
                              styles.itemProgress,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {item.pulledQty} PULLED • {skippedCount} SKIPPED •{" "}
                            {item.requestedQty} REQ
                          </Text>
                        </View>

                        <View style={styles.progressContainer}>
                          <View
                            style={[
                              styles.progressBarBg,
                              { backgroundColor: theme.background },
                            ]}
                          >
                            {item.pulledQty > 0 && (
                              <View
                                style={[
                                  styles.progressBarFill,
                                  {
                                    flex: item.pulledQty,
                                    backgroundColor: theme.primary,
                                  },
                                ]}
                              />
                            )}
                            {skippedCount > 0 && (
                              <View
                                style={[
                                  styles.progressBarSkipped,
                                  {
                                    flex: skippedCount,
                                    backgroundColor: theme.danger,
                                  },
                                ]}
                              />
                            )}
                            {remaining > 0 && (
                              <View style={{ flex: remaining }} />
                            )}
                          </View>
                        </View>
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
                (i) => i.pulledQty + (i.skippedQty || 0) >= i.requestedQty,
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
                  style={[
                    styles.scanButton,
                    {
                      backgroundColor: theme.primary,
                      shadowColor: theme.primary,
                    },
                  ]}
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
        <Text style={[styles.errorText, { color: theme.danger }]}>
          Task not found.
        </Text>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    textTransform: "uppercase",
    letterSpacing: -0.5,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 8,
  },
  statusCard: {
    padding: 24,
    borderRadius: 24,
    marginBottom: 32,
    borderLeftWidth: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 4,
  },
  statusLabel: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 8,
  },
  statusValue: {
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
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
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
    fontSize: 16,
    fontWeight: "800",
    flex: 1,
    lineHeight: 22,
  },
  textMuted: {
    opacity: 0.4,
  },
  itemMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  itemCardFulfilled: {
    borderColor: "rgba(16, 185, 129, 0.3)",
    backgroundColor: "rgba(16, 185, 129, 0.05)",
  },
  itemCardSkipped: {
    borderColor: "rgba(239, 68, 68, 0.3)",
    backgroundColor: "rgba(239, 68, 68, 0.05)",
  },
  itemCardWarning: {
    borderColor: "rgba(234, 179, 8, 0.3)",
    backgroundColor: "rgba(234, 179, 8, 0.05)",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#6366f1",
  },
  progressBarSkipped: {
    height: "100%",
    backgroundColor: "#ef4444",
  },
  itemSku: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  itemProgress: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  progressContainer: {
    width: "100%",
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    flexDirection: "row",
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
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  skipButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  skipButtonText: {
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
    height: 72,
    borderRadius: 24,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
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
    height: 72,
    borderRadius: 24,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
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
    borderRadius: 32,
    marginBottom: 40,
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
    paddingHorizontal: 40,
    paddingVertical: 18,
    borderRadius: 20,
    borderWidth: 1,
  },
  cancelScanText: {
    fontSize: 14,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  permissionText: {
    textAlign: "center",
    marginTop: 100,
    fontSize: 16,
    fontWeight: "600",
  },
  permissionButton: {
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
    textAlign: "center",
    marginTop: 40,
    fontWeight: "700",
  },
  searchSection: {
    marginBottom: 32,
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
  },
  searchBar: {
    flexDirection: "row",
    gap: 12,
  },
  searchInput: {
    flex: 1,
    borderRadius: 16,
    paddingHorizontal: 20,
    height: 56,
    fontSize: 15,
    fontWeight: "600",
    borderWidth: 1,
  },
  searchButton: {
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
    padding: 16,
    marginVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  resultInfo: {
    flex: 1,
  },
  resultWineName: {
    fontSize: 14,
    fontWeight: "800",
  },
  resultBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  resultStatus: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  resultId: {
    fontSize: 10,
    fontWeight: "700",
  },
  loadMoreButton: {
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    marginTop: 10,
  },
  loadMoreButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
});
