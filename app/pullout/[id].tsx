import { Collapsible } from "@/components/ui/collapsible";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { logActivity } from "@/lib/utils/activityLogger";
import { useResponsivePadding } from "@/hooks/useResponsivePadding";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";

import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ChevronLeft,
  MapPin,
  PackageSearch,
  QrCode,
  Search
} from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
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
  PulloutRequestItem,
} from "../../types";

const SEARCH_PAGE_SIZE = 20;

export default function PulloutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const { horizontalPadding, isLandscape, width } = useResponsivePadding(24);
  const isStore = profile?.role === "store" || profile?.role === "store_manager" || profile?.role === "store_staff";
  const theme = isStore ? Colors.store : Colors.warehouse;
  const [request, setRequest] = useState<PulloutRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [landscapeLeftTab, setLandscapeLeftTab] = useState<"scanner" | "location">("scanner");
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
  const [showResults, setShowResults] = useState(true);
  const [scanFeedback, setScanFeedback] = useState<{ message: string; success: boolean } | null>(null);
  const scanFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isProcessing = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const router = useRouter();

  const fetchRequest = async () => {
    if (!id) return;
    try {
      const data = await apiFetch(`/pullout-requests/${id}`);
      setRequest(data as PulloutRequest);
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
    if (!request || isProcessing.current) return;
    isProcessing.current = true;
    setLoading(true);

    const resumeScan = (success: boolean, message: string) => {
      if (scanFeedbackTimer.current) clearTimeout(scanFeedbackTimer.current);
      setScanFeedback({ message, success });
      scanFeedbackTimer.current = setTimeout(() => {
        setScanFeedback(null);
        isProcessing.current = false;
      }, 1500);
    };

    try {
      // Fetch bottle details
      let bottleData: InventoryBottle;
      try {
        bottleData = await apiFetch(`/bottles/${data}`);
      } catch {
        setLoading(false);
        resumeScan(false, `No bottle found with ID: ${data}`);
        return;
      }

      if (bottleData.status !== "received" && bottleData.status !== "shelved") {
        setLoading(false);
        resumeScan(false, `Bottle is already ${bottleData.status}.`);
        return;
      }

      // 2. Check if this wine is in the request
      const masterWineId = bottleData.masterWineId;
      const itemIndex = request.items.findIndex(
        (i) =>
          i.masterWineId === masterWineId &&
          i.pulledQty + (i.skippedQty || 0) < i.requestedQty,
      );

      if (itemIndex === -1) {
        setLoading(false);
        resumeScan(false, "This wine is not needed for this request or already fulfilled.");
        return;
      }

      if (!request.outBoundStoreId) {
        setLoading(false);
        resumeScan(false, "Pullout request is missing a target store.");
        return;
      }

      // 3. Update Bottle
      await apiFetch(`/bottles/${bottleData.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "outbound",
          storeId: null,
          outboundStoreId: request.outBoundStoreId,
        }),
      });

      // 4. Update Request items
      const updatedItems = [...request.items];
      updatedItems[itemIndex].pulledQty += 1;
      const displayBottleId = bottleData.bottleId || bottleData.readableId || bottleData.id;
      updatedItems[itemIndex].pulledBottleIds = [
        ...(updatedItems[itemIndex].pulledBottleIds || []),
        displayBottleId,
      ];

      const allFulfilled = updatedItems.every(
        (i) => i.pulledQty + (i.skippedQty || 0) >= i.requestedQty,
      );

      await apiFetch(`/pullout-requests/${request.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          items: updatedItems,
          status: allFulfilled ? "completed" : "in_progress",
        }),
      });

      if (allFulfilled && request.wineRequestId) {
        await apiFetch(`/wine-requests/${request.wineRequestId}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "receiving" }),
        });
      }

      // Log the bottle scan at operation level
      logActivity({
        action: "PULLOUT_BOTTLE_SCANNED",
        entity: "pullout_requests",
        entityId: request.id,
        summary: `Pulled bottle ${bottleData.id} (${updatedItems[itemIndex].wineName}) for pullout ${request.id}${allFulfilled ? " — request now complete" : ""
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

      await fetchRequest();

      if (allFulfilled) {
        if (scanFeedbackTimer.current) clearTimeout(scanFeedbackTimer.current);
        setScanFeedback(null);
        Alert.alert("All Done!", `Pulled ${updatedItems[itemIndex].wineName}. Request fully fulfilled.`, [
          { text: "Finish", onPress: () => { isProcessing.current = false; fetchRequest(); } },
        ]);
      } else {
        resumeScan(true, `✓ Pulled: ${updatedItems[itemIndex].wineName}`);
      }
    } catch (error) {
      console.error("Error processing pullout:", error);
      resumeScan(false, "Failed to process pullout.");
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
        skipped:
          currentSkipped + skipCount + item.pulledQty >= item.requestedQty,
      };

      await apiFetch(`/pullout-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ items: newItems }),
      });

      setRequest((prev) => (prev ? { ...prev, items: newItems } : null));
    } catch (error) {
      console.error("Error skipping item:", error);
      Alert.alert("Error", "Failed to skip item.");
    }
  };

  const processManualPull = async (index: number, count: number) => {
    if (!request) return;
    const item = request.items[index];
    const outBoundStoreId = request.outBoundStoreId;
    if (!outBoundStoreId) return;

    isProcessing.current = true;
    setLoading(true);
    try {
      // 1. Find available bottles for this masterWineId via REST API
      const params = new URLSearchParams({
        masterWineId: item.masterWineId,
        status: "received,shelved",
        limit: String(count),
      });
      if (profile?.locationId) params.set("storeId", profile.locationId);
      const bottlesData = await apiFetch(`/bottles?${params}`);
      const availableBottles: InventoryBottle[] = bottlesData.bottles || bottlesData;

      if (availableBottles.length < count) {
        Alert.alert("Insufficient Stock", `Found only ${availableBottles.length} available bottle(s). Please pull fewer or skip the rest.`);
        setLoading(false);
        isProcessing.current = false;
        return;
      }

      const pulledBottleIds = availableBottles.map((b: any) => b.bottleId || b.readableId || b.id);

      // 2. Update Bottles in parallel
      await Promise.all(availableBottles.map((b: any) =>
        apiFetch(`/bottles/${b.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "outbound",
            storeId: null,
            outboundStoreId: outBoundStoreId,
          }),
        })
      ));

      // 3. Update Request
      const updatedItems = [...request.items];
      updatedItems[index].pulledQty += count;
      updatedItems[index].pulledBottleIds = [
        ...(updatedItems[index].pulledBottleIds || []),
        ...pulledBottleIds,
      ];

      const allFulfilled = updatedItems.every(
        (i) => i.pulledQty + (i.skippedQty || 0) >= i.requestedQty,
      );

      await apiFetch(`/pullout-requests/${request.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          items: updatedItems,
          status: allFulfilled ? "completed" : "in_progress",
        }),
      });

      if (request.wineRequestId && allFulfilled) {
        await apiFetch(`/wine-requests/${request.wineRequestId}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "receiving" }),
        });
      }

      await fetchRequest();

      if (allFulfilled) {
        Alert.alert("All Done!", `Pulled ${count} bottle(s) of ${item.wineName} manually. Request fully fulfilled.`, [
          { text: "Finish", onPress: () => { isProcessing.current = false; fetchRequest(); } },
        ]);
      } else {
        if (count > 1) {
          Alert.alert("Success", `Pulled ${count} bottles manually.`);
        }
      }
    } catch (error) {
      console.error("Error processing manual pullout:", error);
      Alert.alert("Error", "Failed to process pullout manually.");
    } finally {
      setLoading(false);
      isProcessing.current = false;
    }
  };

  const handlePullAllRemainingWithoutQR = async () => {
    if (!request || isProcessing.current) return;
    const outBoundStoreId = request.outBoundStoreId;
    if (!outBoundStoreId) {
      Alert.alert("Error", "Request is missing outbound store ID.");
      return;
    }

    const unfulfilledItems = request.items.map((item, index) => ({ item, index })).filter(({ item }) => {
      const remaining = Math.max(0, item.requestedQty - item.pulledQty - (item.skippedQty || 0));
      return remaining > 0;
    });

    if (unfulfilledItems.length === 0) return;

    const totalRemaining = unfulfilledItems.reduce((sum, { item }) => sum + Math.max(0, item.requestedQty - item.pulledQty - (item.skippedQty || 0)), 0);

    Alert.alert(
      "Pull All Without QR",
      `Are you sure you want to pull the remaining ${totalRemaining} bottle(s) across ${unfulfilledItems.length} item(s) manually?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Pull All",
          onPress: async () => {
            isProcessing.current = true;
            setLoading(true);
            try {
              const updatedItems = [...request.items];
              const pulledBottleIdsTotal: string[] = [];
              let hasInsufficientStock = false;
              let missingItemName = "";

              for (const { item, index } of unfulfilledItems) {
                const remaining = Math.max(0, item.requestedQty - item.pulledQty - (item.skippedQty || 0));

                const params = new URLSearchParams({
                  masterWineId: item.masterWineId,
                  status: "received,shelved",
                  limit: String(remaining),
                });
                if (profile?.locationId) params.set("storeId", profile.locationId);
                const bottlesData = await apiFetch(`/bottles?${params}`);
                const availableBottles: any[] = bottlesData.bottles || bottlesData;

                if (availableBottles.length < remaining) {
                  hasInsufficientStock = true;
                  missingItemName = item.wineName;
                  break;
                }

                const pulledIds = availableBottles.map((b: any) => b.bottleId || b.readableId || b.id);
                pulledBottleIdsTotal.push(...pulledIds);

                // Update bottles in parallel
                await Promise.all(availableBottles.map((b: any) =>
                  apiFetch(`/bottles/${b.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                      status: "outbound",
                      storeId: null,
                      outboundStoreId: outBoundStoreId,
                    }),
                  })
                ));

                updatedItems[index].pulledQty += remaining;
                updatedItems[index].pulledBottleIds = [
                  ...(updatedItems[index].pulledBottleIds || []),
                  ...pulledIds,
                ];
              }

              if (hasInsufficientStock) {
                Alert.alert("Insufficient Stock", `Could not find enough available bottles for ${missingItemName}.`);
                setLoading(false);
                isProcessing.current = false;
                return;
              }

              const allFulfilled = updatedItems.every(
                (i) => i.pulledQty + (i.skippedQty || 0) >= i.requestedQty,
              );

              await apiFetch(`/pullout-requests/${request.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                  items: updatedItems,
                  status: allFulfilled ? "completed" : "in_progress",
                }),
              });

              if (request.wineRequestId && allFulfilled) {
                await apiFetch(`/wine-requests/${request.wineRequestId}`, {
                  method: "PATCH",
                  body: JSON.stringify({ status: "receiving" }),
                });
              }

              await fetchRequest();

              Alert.alert("Success!", `Pulled ${totalRemaining} bottle(s) manually. Request fully fulfilled.`, [
                { text: "Finish", onPress: () => { isProcessing.current = false; fetchRequest(); } },
              ]);
            } catch (error) {
              console.error("Error processing global manual pullout:", error);
              Alert.alert("Error", "Failed to process pullout manually.");
              setLoading(false);
              isProcessing.current = false;
            }
          }
        }
      ]
    );
  };

  const handlePullWithoutQR = async (index: number) => {
    if (!request || isProcessing.current) return;
    const item = request.items[index];
    const remaining = Math.max(0, item.requestedQty - item.pulledQty - (item.skippedQty || 0));
    if (remaining <= 0) return;

    if (!request.outBoundStoreId) {
      Alert.alert("Error", "Request is missing outbound store ID.");
      return;
    }

    Alert.alert(
      "Pull Without QR",
      `How many bottles of ${item.wineName} do you want to pull manually (bypass QR scan)?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Pull 1 Bottle",
          onPress: () => processManualPull(index, 1),
        },
        remaining > 1
          ? {
            text: `Pull All Remaining (${remaining})`,
            onPress: () => processManualPull(index, remaining),
          }
          : null,
      ].filter(Boolean) as any,
    );
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
              await apiFetch(`/pullout-requests/${id}`, {
                method: "PATCH",
                body: JSON.stringify({
                  status: "completed",
                }),
              });

              // 2. Update original Wine Request with pulled quantities
              if (request.wineRequestId) {
                try {
                  const wineRequestData = await apiFetch(`/wine-requests/${request.wineRequestId}`);
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

                  await apiFetch(`/wine-requests/${request.wineRequestId}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                      items: updatedWineRequestItems,
                      status: "receiving",
                    }),
                  });
                } catch (e) {
                  console.error("Error updating wine request:", e);
                }
              }

              // Log the completion
              logActivity({
                action: "PULLOUT_COMPLETED",
                entity: "pullout_requests",
                entityId: id as string,
                summary: `Pullout request ${id} completed by ${profile?.email} — ${request.items.reduce((s, i) => s + i.pulledQty, 0)
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
    // Search is handled as a single API fetch in REST v2
  };

  const handleSearch = async (specificSku?: string) => {
    const term = specificSku || searchQuery.trim();
    if (!term) {
      setSearchResults([]);
      return;
    }

    if (specificSku) {
      setSearchQuery(specificSku);
      if (isLandscape) setLandscapeLeftTab("location");
    }

    setSearchLoading(true);
    setSearchResults([]);
    setLastVisible(null);

    try {
      const params = new URLSearchParams({
        sku: term,
        status: "received,shelved",
      });
      if (profile?.locationId) params.set("storeId", profile.locationId);

      const [bottlesData, winesData, locationsData] = await Promise.all([
        apiFetch(`/bottles?${params}`),
        apiFetch("/wines"),
        apiFetch("/locations"),
      ]);

      const bottlesList: InventoryBottle[] = bottlesData.bottles || bottlesData;
      const winesList: MasterWine[] = winesData.wines || winesData;
      const locationsList: Location[] = locationsData.locations || locationsData;

      const wineMap = new Map<string, MasterWine>();
      winesList.forEach((w) => wineMap.set(w.id, w));

      const locationMap = new Map<string, Location>();
      locationsList.forEach((l) => locationMap.set(l.id, l));

      const termLower = term.toLowerCase();

      const results = bottlesList
        .map((b: any) => {
          const mwId = b.masterWineId || b.masterWineRef?.id;
          const locId = b.locationId || b.locationRef?.id;
          const mw = mwId ? wineMap.get(mwId) : undefined;
          const loc = locId ? locationMap.get(locId) : undefined;

          const bottleSku = b.sku || mw?.sku || "";

          return {
            id: b.id,
            ...b,
            sku: bottleSku,
            wineName: mw?.name || b.wineName || "Unknown Wine",
            vintage: mw?.vintage || b.vintage || "NV",
            producer: mw?.producer || b.producer || "",
            format: mw?.format || b.format || "75cl",
            locationName: loc?.name || "No Location",
            readableId: b.readableId,
          };
        })
        .filter((b) => {
          const bottleSku = (b.sku || "").toLowerCase();
          return bottleSku === termLower || bottleSku.includes(termLower);
        });

      setSearchResults(results);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setSearchLoading(false);
    }
  };

  const leftColumnWidth = useMemo(() => {
    if (width >= 1024) return Math.min(480, Math.round(width * 0.40));
    if (width >= 768) return Math.min(420, Math.round(width * 0.44));
    return Math.round(width * 0.46);
  }, [width]);

  const totalRequested = useMemo(
    () => request?.items.reduce((sum, i) => sum + i.requestedQty, 0) || 0,
    [request?.items]
  );
  const totalPulled = useMemo(
    () => request?.items.reduce((sum, i) => sum + i.pulledQty, 0) || 0,
    [request?.items]
  );
  const totalSkipped = useMemo(
    () => request?.items.reduce((sum, i) => sum + (i.skippedQty || 0), 0) || 0,
    [request?.items]
  );
  const allFulfilled = useMemo(
    () =>
      request?.items.every(
        (i) => i.pulledQty + (i.skippedQty || 0) >= i.requestedQty
      ) || false,
    [request?.items]
  );

  const renderLocationResults = (isLandscapeMode: boolean = false) => {
    const totalResults = Object.values(groupedResults).flat().length;

    if (totalResults === 0) {
      if (isLandscapeMode) {
        return (
          <View style={styles.emptyLocationSearch}>
            <MapPin size={28} color={theme.textSecondary} style={{ opacity: 0.5, marginBottom: 8 }} />
            <Text style={[styles.emptyLocationText, { color: theme.textSecondary }]}>
              {searchQuery
                ? `No bottles found for "${searchQuery}".`
                : "Enter an SKU above or tap 🔍 on any wine card to check where bottles are shelved."}
            </Text>
            {request?.status !== "completed" && (
              <TouchableOpacity
                style={[styles.backToScannerButton, { borderColor: theme.border, backgroundColor: theme.background }]}
                onPress={() => setLandscapeLeftTab("scanner")}
              >
                <Camera size={14} color={theme.primary} />
                <Text style={[styles.backToScannerText, { color: theme.primary }]}>
                  Return to Scanner
                </Text>
              </TouchableOpacity>
            )}
          </View>
        );
      }
      return null;
    }

    return (
      <View style={styles.searchResults}>
        <View style={styles.searchResultHeader}>
          <Text style={[styles.searchResultCountText, { color: theme.textSecondary }]}>
            {totalResults} RESULT{totalResults !== 1 ? "S" : ""}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              onPress={() => setShowResults((v) => !v)}
              style={[
                styles.searchResultAction,
                { borderColor: theme.border, backgroundColor: theme.background },
              ]}
            >
              <Text style={{ fontSize: 11, fontWeight: "700", color: theme.textSecondary }}>
                {showResults ? "Hide" : "Show"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setGroupedResults({});
                setSearchQuery("");
                setLastVisible(null);
                setShowResults(true);
              }}
              style={[
                styles.searchResultAction,
                { borderColor: theme.danger + "40", backgroundColor: theme.danger + "10" },
              ]}
            >
              <Text style={{ fontSize: 11, fontWeight: "700", color: theme.danger }}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>

        {showResults && (
          <>
            {Object.entries(groupedResults).map(([locationName, bottles]) => (
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
                      <Text style={[styles.resultWineName, { color: theme.text }]}>
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
                      <Text style={[styles.resultId, { color: theme.textSecondary }]}>
                        Bottle ID: {res.bottleId || res.id}
                      </Text>
                    </View>
                    <View style={[styles.resultBadge, { backgroundColor: theme.card }]}>
                      <Text style={[styles.resultStatus, { color: theme.textSecondary }]}>
                        {res.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                ))}
              </Collapsible>
            ))}
            {lastVisible && (
              <TouchableOpacity
                style={[styles.loadMoreButton, { backgroundColor: theme.primary }]}
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
          </>
        )}
      </View>
    );
  };

  const renderItemCard = (item: PulloutRequestItem, index: number, isLandscapeMode: boolean = false) => {
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
          isLandscapeMode && styles.itemCardLandscape,
        ]}
      >
        <View style={[styles.itemMain, isLandscapeMode && styles.itemMainLandscape]}>
          <TouchableOpacity
            style={styles.itemInfo}
            activeOpacity={0.7}
            onPress={() => {
              if (!isFullyAddressed) {
                if (isLandscape) setLandscapeLeftTab("location");
                handleSearch(item.sku);
              }
            }}
          >
            <View style={styles.itemHeaderRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text
                  style={[
                    styles.itemName,
                    { color: theme.text },
                    isLandscapeMode && styles.itemNameLandscape,
                    isFullySkipped && styles.textMuted,
                  ]}
                  numberOfLines={isLandscapeMode ? 2 : undefined}
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
                  numberOfLines={1}
                >
                  {item.vintage} • {item.producer || "Independent Producer"} • {item.format}
                </Text>
              </View>

              <View style={styles.itemActions}>
                {isFullyAddressed ? (
                  isFullyPulled ? (
                    <CheckCircle2 size={20} color="#10b981" strokeWidth={2.5} />
                  ) : isFullySkipped ? (
                    <AlertCircle size={20} color="#ef4444" strokeWidth={2.5} />
                  ) : (
                    <CheckCircle2 size={20} color="#eab308" strokeWidth={2.5} />
                  )
                ) : (
                  <View style={styles.actionButtons}>
                    <TouchableOpacity
                      onPress={() => {
                        if (isLandscape) setLandscapeLeftTab("location");
                        handleSearch(item.sku);
                      }}
                      style={[
                        styles.actionIcon,
                        {
                          backgroundColor: theme.background,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <Search size={16} color={theme.primary} strokeWidth={2} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handlePullWithoutQR(index)}
                      style={[
                        styles.actionIcon,
                        {
                          backgroundColor: "#f59e0b1A",
                          borderColor: "#f59e0b33",
                        },
                      ]}
                    >
                      <QrCode size={16} color="#f59e0b" strokeWidth={2} />
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
                      <Text style={[styles.skipButtonText, { color: theme.danger }]}>
                        Skip
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.itemMetaRow}>
              <Text style={[styles.itemSku, { color: theme.primary }]}>
                SKU: {item.sku}
              </Text>
              <Text style={[styles.itemProgress, { color: theme.textSecondary }]}>
                {item.pulledQty} PULLED • {skippedCount} SKIPPED • {item.requestedQty} REQ
              </Text>
            </View>

            <View style={styles.progressContainer}>
              <View style={[styles.progressBarBg, { backgroundColor: theme.background }]}>
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
                {remaining > 0 && <View style={{ flex: remaining }} />}
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (!permission) return <View />;
  if (!permission.granted) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: "center", alignItems: "center", padding: 20 }]}>
        <Text style={[styles.permissionText, { color: theme.textSecondary }]}>
          Camera permission required
        </Text>
        <TouchableOpacity
          style={[styles.permissionButton, { backgroundColor: theme.primary }]}
          onPress={requestPermission}
        >
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ marginTop: 16, paddingVertical: 10, paddingHorizontal: 20 }}
          onPress={() => router.back()}
        >
          <Text style={{ color: theme.primary, fontWeight: "700", fontSize: 15 }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }



  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header Bar */}
      {isLandscape ? (
        <View style={[styles.landscapeHeader, { backgroundColor: theme.background }]}>
          <View style={styles.landscapeHeaderLeft}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <ChevronLeft size={24} color={theme.primary} strokeWidth={2.5} />
            </TouchableOpacity>
            <View>
              <Text style={[styles.landscapeTitle, { color: theme.text }]}>
                Pullout Details
              </Text>
              <Text style={[styles.landscapeSubtitle, { color: theme.textSecondary }]}>
                ID: {request?.id ? `...${request.id.slice(-8).toUpperCase()}` : id}
              </Text>
            </View>
          </View>

          {request && (
            <View style={styles.landscapeHeaderRight}>
              <View
                style={[
                  styles.landscapeStatusBadge,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
              >
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor:
                        request.status === "completed"
                          ? "#10b981"
                          : request.status === "in_progress"
                          ? "#3b82f6"
                          : "#f59e0b",
                    },
                  ]}
                />
                <Text style={[styles.landscapeStatusBadgeText, { color: theme.text }]}>
                  {request.status.replace("_", " ").toUpperCase()}
                </Text>
              </View>

              <View
                style={[
                  styles.landscapeProgressBadge,
                  {
                    backgroundColor: allFulfilled ? "#10b98115" : theme.primary + "15",
                    borderColor: allFulfilled ? "#10b98140" : theme.primary + "30",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.landscapeProgressBadgeText,
                    { color: allFulfilled ? "#10b981" : theme.primary },
                  ]}
                >
                  {totalPulled} / {totalRequested} PULLED
                  {totalSkipped > 0 ? ` • ${totalSkipped} SKIPPED` : ""}
                </Text>
              </View>
            </View>
          )}
        </View>
      ) : (
        <View style={[styles.header, { paddingHorizontal: horizontalPadding }]}>
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
      )}

      {loading && !request ? (
        <ActivityIndicator
          size="large"
          color={theme.primary}
          style={{ flex: 1 }}
        />
      ) : request ? (
        isLandscape ? (
          /* Landscape Split Layout */
          <View style={styles.landscapeMainWrapper}>
            {/* Left Console: Scanner / Location Finder */}
            <View style={[styles.landscapeLeftColumn, { width: leftColumnWidth }]}>
              {request.status !== "completed" ? (
                <View
                  style={[
                    styles.landscapeTabSwitcher,
                    { backgroundColor: theme.card, borderColor: theme.border },
                  ]}
                >
                  <TouchableOpacity
                    style={[
                      styles.landscapeTabItem,
                      landscapeLeftTab === "scanner" && [
                        styles.landscapeTabItemActive,
                        { backgroundColor: theme.primary },
                      ],
                    ]}
                    onPress={() => setLandscapeLeftTab("scanner")}
                  >
                    <Camera
                      size={14}
                      color={landscapeLeftTab === "scanner" ? "#fff" : theme.textSecondary}
                    />
                    <Text
                      style={[
                        styles.landscapeTabText,
                        { color: landscapeLeftTab === "scanner" ? "#fff" : theme.textSecondary },
                      ]}
                    >
                      SCANNER
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.landscapeTabItem,
                      landscapeLeftTab === "location" && [
                        styles.landscapeTabItemActive,
                        { backgroundColor: theme.primary },
                      ],
                    ]}
                    onPress={() => setLandscapeLeftTab("location")}
                  >
                    <MapPin
                      size={14}
                      color={landscapeLeftTab === "location" ? "#fff" : theme.textSecondary}
                    />
                    <Text
                      style={[
                        styles.landscapeTabText,
                        { color: landscapeLeftTab === "location" ? "#fff" : theme.textSecondary },
                      ]}
                    >
                      LOCATIONS{Object.keys(groupedResults).length > 0 ? ` (${Object.values(groupedResults).flat().length})` : ""}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {request.status !== "completed" && landscapeLeftTab === "scanner" ? (
                <View style={styles.landscapeScannerCard}>
                  <CameraView
                    style={StyleSheet.absoluteFill}
                    onBarcodeScanned={handleBarcodeScanned}
                    barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  >
                    <View style={styles.scannerOverlay}>
                      <View
                        style={[
                          styles.scanTargetLandscape,
                          {
                            borderColor: scanFeedback
                              ? scanFeedback.success ? "#10b981" : "#ef4444"
                              : theme.primary,
                            backgroundColor: scanFeedback
                              ? scanFeedback.success ? "#10b98120" : "#ef444420"
                              : theme.primary + "0D",
                          },
                        ]}
                      />

                      {scanFeedback ? (
                        <View
                          style={[
                            styles.scanToast,
                            { backgroundColor: scanFeedback.success ? "#10b981" : "#ef4444" },
                          ]}
                        >
                          <Text style={styles.scanToastText}>{scanFeedback.message}</Text>
                        </View>
                      ) : (
                        <Text style={styles.scanTextSmall}>
                          Scan bottle QR to pull
                        </Text>
                      )}
                    </View>
                  </CameraView>
                </View>
              ) : request.status === "completed" && Object.keys(groupedResults).length === 0 ? (
                <View
                  style={[
                    styles.landscapeCompletedCard,
                    { backgroundColor: theme.card, borderColor: theme.border },
                  ]}
                >
                  <View style={styles.completedIconWrapper}>
                    <CheckCircle2 size={44} color="#10b981" strokeWidth={2.5} />
                  </View>
                  <Text style={[styles.completedTitle, { color: theme.text }]}>TASK COMPLETED</Text>
                  <Text style={[styles.completedSubtitle, { color: theme.textSecondary }]}>
                    All items have been fulfilled and staged for outbound delivery.
                  </Text>
                  <View style={[styles.completedStatsRow, { backgroundColor: theme.background }]}>
                    <View style={styles.completedStatItem}>
                      <Text style={[styles.completedStatNumber, { color: "#10b981" }]}>{totalPulled}</Text>
                      <Text style={[styles.completedStatLabel, { color: theme.textSecondary }]}>PULLED</Text>
                    </View>
                    <View style={styles.completedStatItem}>
                      <Text style={[styles.completedStatNumber, { color: totalSkipped > 0 ? "#ef4444" : theme.textSecondary }]}>
                        {totalSkipped}
                      </Text>
                      <Text style={[styles.completedStatLabel, { color: theme.textSecondary }]}>SKIPPED</Text>
                    </View>
                    <View style={styles.completedStatItem}>
                      <Text style={[styles.completedStatNumber, { color: theme.primary }]}>{totalRequested}</Text>
                      <Text style={[styles.completedStatLabel, { color: theme.textSecondary }]}>TOTAL REQ</Text>
                    </View>
                  </View>
                </View>
              ) : (
                <ScrollView
                  style={[
                    styles.landscapeLocationCard,
                    { backgroundColor: theme.card, borderColor: theme.border },
                  ]}
                  contentContainerStyle={{ padding: 14 }}
                  showsVerticalScrollIndicator={true}
                >
                  <View style={[styles.sectionHeader, { marginBottom: 10 }]}>
                    <MapPin size={15} color={theme.primary} />
                    <Text style={[styles.sectionTitle, { color: theme.text, fontSize: 12 }]}>Check Location</Text>
                  </View>
                  <View style={styles.searchBar}>
                    <TextInput
                      style={[
                        styles.searchInput,
                        {
                          backgroundColor: theme.background,
                          borderColor: theme.border,
                          color: theme.text,
                          height: 44,
                          fontSize: 13,
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
                        { backgroundColor: theme.primary, width: 44, height: 44 },
                      ]}
                      onPress={() => handleSearch()}
                      disabled={searchLoading}
                    >
                      {searchLoading ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Search size={18} color="#fff" strokeWidth={2.5} />
                      )}
                    </TouchableOpacity>
                  </View>
                  {renderLocationResults(true)}
                </ScrollView>
              )}
            </View>

            {/* Right Pane: Items to Pull & Actions */}
            <View style={styles.landscapeRightColumn}>
              <View style={styles.landscapeRightHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <PackageSearch size={15} color={theme.primary} />
                  <Text style={[styles.sectionTitle, { color: theme.text, fontSize: 13 }]}>
                    Items to Pull ({request.items.length})
                  </Text>
                </View>
                <Text style={{ fontSize: 11, fontWeight: "800", color: theme.textSecondary }}>
                  {totalPulled}/{totalRequested} PULLED
                </Text>
              </View>

              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 12, gap: 10 }}
                showsVerticalScrollIndicator={true}
              >
                {request.items.map((item, index) => renderItemCard(item, index, true))}
              </ScrollView>

              {request.status !== "completed" && (
                <View style={styles.landscapeFooter}>
                  {allFulfilled ? (
                    <TouchableOpacity
                      style={[styles.completeButtonLandscape, { backgroundColor: "#10b981" }]}
                      onPress={handleCompleteRequest}
                    >
                      <CheckCircle2 size={20} color="#fff" strokeWidth={2.5} />
                      <Text style={styles.completeButtonTextLandscape}>Finalize Task</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.completeButtonLandscape, { backgroundColor: "#f59e0b" }]}
                      onPress={handlePullAllRemainingWithoutQR}
                    >
                      <QrCode size={20} color="#fff" strokeWidth={2.5} />
                      <Text style={styles.completeButtonTextLandscape}>Pull All Manually</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          </View>
        ) : (
          /* Portrait Layout */
          <>
            <ScrollView contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPadding }]}>
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

                {renderLocationResults(false)}
              </View>

              {request.status !== "completed" && (
                <View style={styles.inlineScannerContainer}>
                  <CameraView
                    style={StyleSheet.absoluteFill}
                    onBarcodeScanned={handleBarcodeScanned}
                    barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  >
                    <View style={styles.scannerOverlay}>
                      {/* Scan target box */}
                      <View
                        style={[
                          styles.scanTarget,
                          {
                            borderColor: scanFeedback
                              ? scanFeedback.success ? "#10b981" : "#ef4444"
                              : theme.primary,
                            backgroundColor: scanFeedback
                              ? scanFeedback.success ? "#10b98120" : "#ef444420"
                              : theme.primary + "0D",
                          },
                        ]}
                      />

                      {/* Toast feedback for continuous mode */}
                      {scanFeedback && (
                        <View
                          style={[
                            styles.scanToast,
                            { backgroundColor: scanFeedback.success ? "#10b981" : "#ef4444" },
                          ]}
                        >
                          <Text style={styles.scanToastText}>{scanFeedback.message}</Text>
                        </View>
                      )}

                      {!scanFeedback && (
                        <Text style={styles.scanText}>
                          Scan bottle QR to pull
                        </Text>
                      )}
                    </View>
                  </CameraView>
                </View>
              )}

              <View style={styles.sectionHeader}>
                <PackageSearch size={16} color={theme.primary} />
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Items to Pull
                </Text>
              </View>
              <View style={styles.itemsList}>
                {request.items.map((item, index) => renderItemCard(item, index, false))}
              </View>
            </ScrollView>

            {request.status !== "completed" && (
              <View style={styles.footer}>
                {allFulfilled ? (
                  <TouchableOpacity
                    style={[styles.completeButton, { backgroundColor: "#10b981" }]}
                    onPress={handleCompleteRequest}
                  >
                    <CheckCircle2 size={24} color="#fff" strokeWidth={2.5} />
                    <Text style={styles.completeButtonText}>Finalize Task</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.completeButton, { backgroundColor: "#f59e0b" }]}
                    onPress={handlePullAllRemainingWithoutQR}
                  >
                    <QrCode size={24} color="#fff" strokeWidth={2.5} />
                    <Text style={styles.completeButtonText}>Pull All Manually</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        )
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
  inlineScannerContainer: {
    height: 380,
    borderRadius: 24,
    overflow: "hidden",
    marginVertical: 16,
    borderWidth: 1,
    borderColor: "#334155",
  },
  scannerOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  scanTarget: {
    width: 220,
    height: 220,
    borderWidth: 2,
    borderRadius: 32,
    marginBottom: 16,
  },
  scanText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: 16,
  },
  scannerControls: {
    flexDirection: "row",
    gap: 12,
  },
  cancelScanButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  cancelScanText: {
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  scanToast: {
    position: "absolute",
    top: "40%",
    left: 20,
    right: 20,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 16,
    alignItems: "center",
  },
  scanToastText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
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
  searchResultAction: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
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
  // Landscape Styles
  landscapeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(150, 150, 150, 0.15)",
  },
  landscapeHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  landscapeTitle: {
    fontSize: 18,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: -0.3,
  },
  landscapeSubtitle: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  landscapeHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  landscapeStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  landscapeStatusBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  landscapeProgressBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  landscapeProgressBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  landscapeMainWrapper: {
    flex: 1,
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 14,
  },
  landscapeLeftColumn: {
    height: "100%",
    flexDirection: "column",
    gap: 8,
  },
  landscapeTabSwitcher: {
    flexDirection: "row",
    borderRadius: 14,
    borderWidth: 1,
    padding: 3,
    gap: 4,
  },
  landscapeTabItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
    borderRadius: 10,
    gap: 6,
  },
  landscapeTabItemActive: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  landscapeTabText: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  landscapeScannerCard: {
    flex: 1,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0f172a",
  },
  scanTargetLandscape: {
    width: 170,
    height: 170,
    borderWidth: 2,
    borderRadius: 24,
    marginBottom: 10,
  },
  scanTextSmall: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  landscapeLocationCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
  },
  emptyLocationSearch: {
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  emptyLocationText: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 18,
  },
  backToScannerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 14,
  },
  backToScannerText: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  landscapeCompletedCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  completedIconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  completedTitle: {
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 6,
  },
  completedSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 18,
    paddingHorizontal: 12,
  },
  completedStatsRow: {
    flexDirection: "row",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 16,
  },
  completedStatItem: {
    alignItems: "center",
  },
  completedStatNumber: {
    fontSize: 17,
    fontWeight: "900",
  },
  completedStatLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  landscapeRightColumn: {
    flex: 1,
    height: "100%",
    flexDirection: "column",
  },
  landscapeRightHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  landscapeFooter: {
    paddingTop: 8,
    paddingBottom: 2,
  },
  completeButtonLandscape: {
    height: 48,
    borderRadius: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  completeButtonTextLandscape: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  itemCardLandscape: {
    borderRadius: 18,
  },
  itemMainLandscape: {
    padding: 14,
  },
  itemNameLandscape: {
    fontSize: 14,
    lineHeight: 18,
  },
  searchResultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  searchResultCountText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});
